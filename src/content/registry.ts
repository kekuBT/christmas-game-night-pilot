/**
 * Loads and validates content packs (server-only). See schema.ts.
 *
 * Invalid items never reach a game: a pack that fails its header schema is
 * skipped whole; an item that fails its game schema is skipped. Every
 * problem is reported (loadContent().problems), and the shipped content is
 * required to load with none (tests/content.test.ts).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApprovalsSchema, ITEM_SCHEMAS, OFFICIAL_STATUSES, PackHeaderSchema, SprintReferenceSchema, type AnyItem, type ContentGameId, type ItemOf, type ReviewStatus, type SprintReference } from "./schema.js";
import { sprintItemProblems } from "./closedSet.js";

export const DEFAULT_CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");

export interface LoadedItem<G extends ContentGameId = ContentGameId> {
  gameId: G;
  packId: string;
  packVersion: string;
  item: ItemOf<G>;
  /** Hash of everything except the review block: approvals are bound to it. */
  hash: string;
  /** Status after applying approvals. */
  status: ReviewStatus;
  approval?: { reviewer: string; date: string };
}

export interface ContentProblem { file: string; itemId?: string; message: string }

export interface ContentLibrary {
  items: Map<string, LoadedItem>;
  byGame: Map<ContentGameId, LoadedItem[]>;
  packs: { packId: string; gameId: ContentGameId; version: string; title: string; file: string; count: number }[];
  problems: ContentProblem[];
  /** Category Sprint closed-set membership lists (content/reference/sprint). */
  sprintReferences: Map<string, SprintReference>;
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/**
 * The content hash an approval is bound to: what players see and answer.
 * Left out: `review` (the approval itself) and, since Stage 8.2, `season`
 * (where an item may be dealt, which Cups never read), so tagging an item
 * seasonal never voids its approval or a briefing frozen before the tag.
 */
export function itemHash(gameId: string, item: AnyItem | Record<string, unknown>): string {
  const { review: _review, season: _season, ...rest } = item as Record<string, unknown>;
  void _review; void _season;
  return createHash("sha256").update(`${gameId}\n${stable(rest)}`).digest("hex").slice(0, 16);
}

/** May this item be used in an official game on `today` (YYYY-MM-DD)? */
export function officialEligible(li: LoadedItem, today: string): boolean {
  if (li.item.eligibility !== "official") return false;
  if (!OFFICIAL_STATUSES.includes(li.status)) return false;
  const ts = li.item.timeSensitive;
  if (ts && ts.reviewBy < today) return false; // stale facts stop being official
  return true;
}

/** May this item appear in a practice game at all? */
export function practiceUsable(li: LoadedItem): boolean {
  return li.status !== "rejected";
}

/**
 * TESTING ONLY: MCHEZO_CONTENT_TEST_MODE=approve-provisional treats
 * provisional items as approved (reviewer "TEST MODE"), so test suites and
 * the regression gate can play many official games in one Cup. Refused in
 * production (serve.ts and here). Never set by any request.
 */
export function contentTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env["MCHEZO_CONTENT_TEST_MODE"] !== "approve-provisional") return false;
  if (env["NODE_ENV"] === "production") throw new Error("MCHEZO_CONTENT_TEST_MODE is for tests only and is not allowed in production.");
  return true;
}

export function loadContent(dir: string = DEFAULT_CONTENT_DIR, opts: { testApproveProvisional?: boolean } = {}): ContentLibrary {
  const lib: ContentLibrary = { items: new Map(), byGame: new Map(), packs: [], problems: [], sprintReferences: new Map() };
  const refDir = join(dir, "reference", "sprint");
  for (const f of existsSync(refDir) ? readdirSync(refDir).filter((x) => x.endsWith(".json")).sort() : []) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(refDir, f), "utf8")); } catch (e) { lib.problems.push({ file: `reference/sprint/${f}`, message: `not JSON: ${(e as Error).message}` }); continue; }
    const ref = SprintReferenceSchema.safeParse(raw);
    if (!ref.success) { lib.problems.push({ file: `reference/sprint/${f}`, message: ref.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }); continue; }
    if (`${ref.data.id}.json` !== f) { lib.problems.push({ file: `reference/sprint/${f}`, message: `id "${ref.data.id}" does not match the file name` }); continue; }
    lib.sprintReferences.set(ref.data.id, ref.data);
  }
  const packDir = join(dir, "packs");
  const approvals = new Map<string, { hash: string; reviewer: string; date: string }>();
  const approvalsFile = join(dir, "approvals.json");
  if (existsSync(approvalsFile)) {
    const parsed = ApprovalsSchema.safeParse(JSON.parse(readFileSync(approvalsFile, "utf8")));
    if (!parsed.success) lib.problems.push({ file: "approvals.json", message: `invalid approvals file: ${parsed.error.issues[0]?.message}` });
    else for (const a of parsed.data.approvals) approvals.set(a.itemId, a);
  }
  const files = existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith(".json")).sort() : [];
  for (const file of files) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(packDir, file), "utf8")); } catch (e) { lib.problems.push({ file, message: `not JSON: ${(e as Error).message}` }); continue; }
    const header = PackHeaderSchema.safeParse(raw);
    if (!header.success) { lib.problems.push({ file, message: `pack header: ${header.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }); continue; }
    const { packId, gameId, version, title } = header.data;
    const schema = ITEM_SCHEMAS[gameId];
    let count = 0;
    for (const [i, rawItem] of header.data.items.entries()) {
      const parsed = schema.safeParse(rawItem);
      const id = (rawItem as { id?: string })?.id ?? `#${i}`;
      if (!parsed.success) { lib.problems.push({ file, itemId: id, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") }); continue; }
      const item = parsed.data as AnyItem;
      if (gameId === "category-sprint") {
        // E2 v3: a closed set whose answers don't exactly match its published
        // membership (or whose aliases are malformed) never reaches a game.
        const sp = item as ItemOf<"category-sprint">;
        const bad = sprintItemProblems(sp, sp.membership ? lib.sprintReferences.get(sp.membership.reference) : undefined);
        if (bad.length) { lib.problems.push({ file, itemId: item.id, message: bad.join("; ") }); continue; }
      }
      if (lib.items.has(item.id)) { lib.problems.push({ file, itemId: item.id, message: `duplicate id (also in ${lib.items.get(item.id)!.packId})` }); continue; }
      const hash = itemHash(gameId, item);
      const appr = approvals.get(item.id) ?? (opts.testApproveProvisional && item.review.status === "provisional" ? { hash, reviewer: "TEST MODE (not a human review)", date: "1970-01-01" } : undefined);
      let status: ReviewStatus = item.review.status;
      let approval: LoadedItem["approval"];
      const realApproval = approvals.get(item.id);
      const sp = gameId === "category-sprint" ? (item as ItemOf<"category-sprint">) : undefined;
      if (realApproval && sp?.closedSet && !lib.sprintReferences.get(sp.membership!.reference)?.sourceCheck) {
        // A closed set can be approved only after a person compared its
        // membership list with the source page (owner correction, E2 v3).
        lib.problems.push({ file, itemId: item.id, message: `approval refused: membership list "${sp.membership!.reference}" has no recorded source check` });
      } else if (appr) {
        if (appr.hash !== hash) lib.problems.push({ file, itemId: item.id, message: "approval is for an earlier version of this item (edited since approval): re-review needed" });
        else if (status !== "rejected") { status = "approved"; approval = { reviewer: appr.reviewer, date: appr.date }; }
      }
      const li = { gameId, packId, packVersion: version, item, hash, status, ...(approval ? { approval } : {}) } as LoadedItem;
      lib.items.set(item.id, li);
      const list = lib.byGame.get(gameId) ?? [];
      list.push(li);
      lib.byGame.set(gameId, list);
      count++;
    }
    lib.packs.push({ packId, gameId, version, title, file, count });
  }
  for (const [id] of approvals) if (!lib.items.has(id)) lib.problems.push({ file: "approvals.json", itemId: id, message: "approval for an item that does not exist" });
  return lib;
}

let cached: ContentLibrary | null = null;
/** The shipped content, loaded once per process. */
export function contentLibrary(): ContentLibrary {
  if (!cached) {
    cached = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: contentTestMode() });
    for (const p of cached.problems) console.error(`[content] ${p.file}${p.itemId ? ` ${p.itemId}` : ""}: ${p.message}`);
  }
  return cached;
}
