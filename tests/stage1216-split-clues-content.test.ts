/**
 * Stage 12.16 (docs/stage12/stage1216.md; D-S1216-01..04): Split Clues in the content library.
 *
 * Every approval here is a TEST FIXTURE written into a temporary directory (never content/approvals.json): it stands
 * in for a human editor's sign-off so the machinery can be exercised; it approves nothing in the shipped library.
 * These tests load libraries without test mode, so a provisional puzzle is never treated as approved.
 */
import { randomUUID, createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, itemHash, loadContent, officialEligible, practiceUsable, type ContentLibrary } from "../src/content/registry.js";
import { selectContent, type UsageHistory } from "../src/content/select.js";
import { splitPuzzleOf } from "../src/content/materialize.js";
import { lintLibrary } from "../src/content/lint.js";
import { SplitCluesItem } from "../src/content/schema.js";
import { ContentShortage, RoomEngine } from "../src/server/room.js";
import { SPLIT_ROUNDS, type SplitState } from "../src/games/modules/splitClues.js";

type Json = Record<string, unknown>;
type Item = Json & { id: string; clues: string[]; answer: string; alts?: string[]; season?: string; review: { status: string } };
const TODAY = "2026-11-15";
const PACKS = ["split-clues-everyday.json", "split-clues-christmas.json"];
const shippedPack = (f: string) => JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", f), "utf8")) as { items: Item[] };
const SHIPPED = PACKS.flatMap((f) => shippedPack(f).items);
const EVERYDAY_IDS = SHIPPED.filter((i) => !i.season).map((i) => i.id);
const XMAS_IDS = SHIPPED.filter((i) => i.season === "christmas").map((i) => i.id);
/** The hash the loader computes: of the item as parsed (the schema fills defaults such as `tags: []`), never the raw JSON. */
const hashOf = (item: Item) => itemHash("split-clues", SplitCluesItem.parse(structuredClone(item)) as never);

/**
 * A library from a temporary copy of the shipped packs, with a TEST FIXTURE approvals file. `approve` approves items
 * at their hash as shipped; `edit` then changes items (so an approval can be for an earlier version); `reject` marks
 * items rejected in the pack.
 */
/**
 * Stage 12.16-R (review 6895557386, R2): every temporary content tree this file makes is removed after each test (and
 * once more after the file, in case a test threw before its afterEach). A fixture's library is loaded into memory before
 * the test uses it, so removing the tree never changes a test's outcome.
 */
const tempTrees: string[] = [];
const removeTempTrees = () => { for (const d of tempTrees.splice(0)) rmSync(d, { recursive: true, force: true }); };
afterEach(removeTempTrees);
afterAll(removeTempTrees);

function fixture(opts: { approve?: string[]; edit?: (item: Item) => void; reject?: string[]; raw?: Record<string, string>; noApprovalsFile?: boolean; testMode?: boolean } = {}): ContentLibrary {
  const dir = mkdtempSync(join(tmpdir(), "mz-s1216-"));
  tempTrees.push(dir);
  mkdirSync(join(dir, "packs"), { recursive: true });
  cpSync(join(DEFAULT_CONTENT_DIR, "reference"), join(dir, "reference"), { recursive: true });
  const approvals: Json[] = [];
  for (const file of readdirSync(join(DEFAULT_CONTENT_DIR, "packs")).filter((f) => f.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", file), "utf8")) as { gameId: string; items: Item[] };
    if (pack.gameId === "split-clues") {
      for (const item of pack.items) {
        if (opts.approve?.includes(item.id)) approvals.push({ itemId: item.id, hash: hashOf(item), reviewer: "TEST FIXTURE (not an editorial approval)", date: TODAY });
        opts.edit?.(item);
        if (opts.reject?.includes(item.id)) item.review = { status: "rejected" };
        if (opts.raw?.[item.id]) item.review = { status: opts.raw[item.id]! };
      }
    }
    writeFileSync(join(dir, "packs", file), JSON.stringify(pack));
  }
  if (!opts.noApprovalsFile) writeFileSync(join(dir, "approvals.json"), JSON.stringify({ schemaVersion: 1, approvals }));
  return loadContent(dir, opts.testMode ? { testApproveProvisional: true } : {});
}
const li = (lib: ContentLibrary, id: string) => lib.items.get(id)!;
const pick = (lib: ContentLibrary, req: { mode: "official" | "practice"; roomKind: "cup" | "casual"; season?: "everyday" | "christmas"; usage?: UsageHistory; seq?: number; yearRoundOnly?: boolean }) =>
  selectContent({ lib, gameId: "split-clues", count: SPLIT_ROUNDS, mode: req.mode, roomKind: req.roomKind, cupId: "cup-x", usage: req.usage ?? {}, seq: req.seq ?? 0, today: TODAY, ...(req.season ? { season: req.season } : {}), ...(req.yearRoundOnly ? { yearRoundOnly: true } : {}) });

describe("the move into the content library (D-S1216-01)", () => {
  it("keeps all 51 puzzles exactly: ids, kinds, answers, alternatives, clues and seasons (the bank's own fingerprint)", () => {
    expect(SHIPPED.map((i) => i.id)).toEqual([...Array.from({ length: 38 }, (_, k) => `sc-${String(k + 1).padStart(3, "0")}`), ...Array.from({ length: 13 }, (_, k) => `sc-${101 + k}`)]);
    expect([EVERYDAY_IDS.length, XMAS_IDS.length]).toEqual([38, 13]);
    // The fingerprint of the TypeScript bank (src/games/modules/packs/split-clues.ts) before it was removed, computed
    // the same way by the generator (docs/evidence/stage1216-local/gen-split-packs.mts.txt).
    const canon = (p: Item) => JSON.stringify([p.id, p["kind"], p.answer, p.alts ?? [], [...p.clues], p.season ?? null]);
    expect(createHash("sha256").update(SHIPPED.map(canon).join("\n")).digest("hex")).toBe("2d56e726033f48da1f99280b1374bf10c9c54f219086ca01be1534aadf2e11f8");
  });

  it("ships provisional: nothing is approved, so no puzzle is official; every puzzle is usable in practice", () => {
    const lib = loadContent();
    const items = lib.byGame.get("split-clues")!;
    expect(items).toHaveLength(51);
    expect(items.every((x) => x.item.review.status === "provisional" && x.status === "provisional" && !x.approval)).toBe(true);
    expect(items.filter((x) => officialEligible(x, TODAY))).toHaveLength(0);
    expect(items.every((x) => practiceUsable(x))).toBe(true);
    expect(lib.problems).toEqual([]);
    expect(lintLibrary(lib, TODAY).filter((i) => i.gameId === "split-clues" && i.level === "error")).toEqual([]);
  });

  it("the lint refuses a clue that names its answer, and two clues alike", () => {
    const lib = fixture({ edit: (it) => { if (it.id === "sc-002") it.clues[0] = "A giraffe eats leaves from thorny trees."; if (it.id === "sc-003") it.clues[1] = it.clues[0]!; } });
    const errs = lintLibrary(lib, TODAY).filter((i) => i.level === "error").map((i) => `${i.itemId} ${i.code}`);
    expect(errs).toEqual(expect.arrayContaining(["sc-002 clue-gives-answer", "sc-003 duplicate-clues"]));
  });
});

describe("approval is bound to the exact puzzle (D-S1216-01)", () => {
  it("missing approval: provisional, practice only", () => {
    const lib = fixture();
    expect([li(lib, "sc-001").status, officialEligible(li(lib, "sc-001"), TODAY)]).toEqual(["provisional", false]);
  });

  it("an approval at the exact hash makes it approved and official", () => {
    const lib = fixture({ approve: ["sc-001"] });
    expect([li(lib, "sc-001").status, li(lib, "sc-001").approval?.reviewer, officialEligible(li(lib, "sc-001"), TODAY)]).toEqual(["approved", "TEST FIXTURE (not an editorial approval)", true]);
    expect(lib.problems).toEqual([]);
  });

  it("an edit after approval (a clue, the answer or an alternative) voids it, and the loader says so", () => {
    for (const edit of [(it: Item) => { it.clues[2] = "Changed after the approval."; }, (it: Item) => { it.answer = "Mount Kili"; }, (it: Item) => { it.alts = ["Kili"]; }]) {
      const lib = fixture({ approve: ["sc-001"], edit: (it) => { if (it.id === "sc-001") edit(it); } });
      expect([li(lib, "sc-001").status, officialEligible(li(lib, "sc-001"), TODAY)]).toEqual(["provisional", false]);
      expect(lib.problems.map((p) => `${p.itemId}: ${p.message}`)).toEqual(["sc-001: approval is for an earlier version of this item (edited since approval): re-review needed"]);
    }
  });

  it("what isn't shown to players stays outside the hash: the season tag and the review note", () => {
    const item = structuredClone(SHIPPED.find((i) => i.id === "sc-101")!);
    const h = hashOf(item);
    const { season: _s, ...untagged } = item; void _s;
    expect(hashOf(untagged as Item)).toBe(h);
    expect(hashOf({ ...item, review: { status: "provisional", notes: "an editor's note" } } as Item)).toBe(h);
    expect(hashOf({ ...item, clues: [...item.clues.slice(0, 5), "Something else."] } as Item)).not.toBe(h);
  });

  it("a rejected puzzle is never approved, never official and never dealt, even with an approval on file", () => {
    const lib = fixture({ approve: ["sc-001"], reject: ["sc-001"] });
    expect([li(lib, "sc-001").status, officialEligible(li(lib, "sc-001"), TODAY), practiceUsable(li(lib, "sc-001"))]).toEqual(["rejected", false, false]);
    for (let seq = 0; seq < 30; seq++) {
      const r = pick(lib, { mode: "practice", roomKind: "casual", season: "everyday", seq });
      expect(r.ok && r.items.some((x) => x.item.id === "sc-001")).toBe(false);
    }
  });
});

describe("selection: the Official gate and the pools (D-S1216-02, D-S1216-04)", () => {
  it("no approvals: an Official game is refused in plain words, never filled with provisional puzzles", () => {
    const r = pick(fixture(), { mode: "official", roomKind: "cup", yearRoundOnly: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect([r.reason, r.available, r.needed]).toEqual(["insufficient-content", 0, 6]);
      expect(r.message).toMatch(/Split Clues counts only with puzzles a person has approved.*0 unused approved puzzles.*needs 6.*Play it as Practice/);
      // A Cup's Practice deals year-round puzzles only (D-S1216-02), so the reason never promises "every puzzle".
      expect(r.message).toMatch(/Practice also uses puzzles that are not approved yet\.$/);
    }
  });

  it("an insufficient pool (5 approved) is refused too: a game is never shortened", () => {
    const r = pick(fixture({ approve: EVERYDAY_IDS.slice(0, 5) }), { mode: "official", roomKind: "cup", yearRoundOnly: true });
    expect(r.ok ? 6 : r.available).toBe(5);
  });

  it("six approved: an Official game deals exactly the approved puzzles", () => {
    const approved = EVERYDAY_IDS.slice(0, 6);
    const r = pick(fixture({ approve: approved }), { mode: "official", roomKind: "cup", yearRoundOnly: true });
    expect(r.ok && r.items.map((x) => x.item.id).sort()).toEqual([...approved].sort());
  });

  it("season pools: a Cup deals only year-round puzzles, even approved Christmas ones never count there", () => {
    const lib = fixture({ approve: XMAS_IDS.slice(0, 8) });
    const r = pick(lib, { mode: "official", roomKind: "cup", yearRoundOnly: true });
    expect(r.ok ? -1 : r.available).toBe(0);
    for (let seq = 0; seq < 20; seq++) {
      const p = pick(lib, { mode: "practice", roomKind: "cup", seq, yearRoundOnly: true });
      expect(p.ok && p.items.some((x) => x.item.season)).toBe(false);
    }
  });

  it("an Everyday session never gets a Christmas puzzle; a Christmas session deals its unused Christmas ones first", () => {
    const lib = fixture();
    for (let seq = 0; seq < 30; seq++) {
      const r = pick(lib, { mode: "practice", roomKind: "casual", season: "everyday", seq });
      expect(r.ok && r.items.every((x) => !x.item.season)).toBe(true);
    }
    const x = pick(lib, { mode: "practice", roomKind: "casual", season: "christmas" });
    expect(x.ok && x.items.every((i) => i.item.season === "christmas")).toBe(true);
  });

  it("no repeats in a Cup: a puzzle used in any earlier game (practice included) never comes back as Official", () => {
    const approved = EVERYDAY_IDS.slice(0, 7);
    const lib = fixture({ approve: approved });
    const usage: UsageHistory = { [approved[0]!]: [{ gameInstanceId: "g-practice", day: 1, mode: "practice", seq: 0 }], [approved[1]!]: [{ gameInstanceId: "g-practice", day: 1, mode: "practice", seq: 0 }] };
    const r = pick(lib, { mode: "official", roomKind: "cup", usage, yearRoundOnly: true, seq: 1 });
    expect(r.ok ? 6 : r.available).toBe(5);
  });
});

/** A room with four players (two teams of two), its library injected. */
function room(kind: "cup" | "casual", lib: ContentLibrary, timing: 1 | 2 = 2) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine(kind === "cup" ? "Family Cup" : "Game night", { kind, ...(kind === "cup" ? { timing } : {}) });
  engine.clock = () => t;
  engine.content = lib;
  const ids = [engine.join("Keku", { asHost: true }).player.id];
  for (const n of ["Amina", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  return { engine, ids, host: ids[0]!, send, advance: (ms: number) => { t += ms; engine.tick(); } };
}
const puzzleIds = (r: ReturnType<typeof room>, gid: string) => (r.engine.games.get(gid)!.extra as SplitState).puzzles.map((p) => p.id);

describe("the room (D-S1216-02..04)", () => {
  it("an Official start without approved puzzles is refused on the server, plainly; nothing is created; Practice works", () => {
    const r = room("cup", fixture());
    let err: unknown;
    try { r.engine.startGame(r.host, "split-clues", { official: true, seed: 3 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ContentShortage);
    expect((err as ContentShortage).message).toMatch(/Split Clues counts only with puzzles a person has approved/);
    expect(r.engine.games.size).toBe(0);
    const g = r.engine.startGame(r.host, "split-clues", { official: false, seed: 3 });
    expect([g.official, g.status]).toEqual([false, "briefing"]);
    expect(puzzleIds(r, g.id).every((id) => EVERYDAY_IDS.includes(id))).toBe(true); // a Cup: year-round only
  });

  it("the lobby's view says the same: Official unavailable in a Cup without approved puzzles, available with six", () => {
    const none = room("cup", fixture()).engine.project("player", undefined) as Json;
    expect((none["officialContent"] as Json)["split-clues"]).toMatchObject({ available: 0, needed: 6, message: expect.stringMatching(/Play it as Practice/) });
    const six = room("cup", fixture({ approve: EVERYDAY_IDS.slice(0, 6) }));
    expect(((six.engine.project("player", six.host) as Json)["officialContent"] as Json)["split-clues"]).toEqual({ available: 6, needed: 6 });
    expect((six.engine.project("tv") as Json)["officialContent"]).toBeTruthy(); // counts only: no item ever
    expect(JSON.stringify((six.engine.project("tv") as Json)["officialContent"])).not.toMatch(/sc-0/);
    // Not a Cup: no such view (casual games are just for fun).
    expect((room("casual", fixture()).engine.project("tv") as Json)["officialContent"]).toBeUndefined();
  });

  it("with six approved: Official deals exactly them; frozen at the briefing; play re-checks; usage recorded at play", () => {
    const approved = EVERYDAY_IDS.slice(0, 6);
    const r = room("cup", fixture({ approve: approved }));
    const g = r.engine.startGame(r.host, "split-clues", { official: true, seed: 4 });
    expect(g.status).toBe("briefing");
    expect(puzzleIds(r, g.id).sort()).toEqual([...approved].sort());
    expect(g.pendingContent?.items.map((x) => x.itemId).sort()).toEqual([...approved].sort());
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    expect(r.engine.games.get(g.id)!.status).toBe("playing");
    expect(approved.every((id) => (r.engine.contentUsage[id] ?? []).length === 1)).toBe(true);
    // Later content changes never reach a game in progress: its state keeps its own copy.
    const before = JSON.stringify((r.engine.games.get(g.id)!.extra as SplitState).puzzles);
    r.engine.content = fixture({ edit: (it) => { it.clues[0] = "Edited while a game was being played."; } });
    expect(JSON.stringify((r.engine.games.get(g.id)!.extra as SplitState).puzzles)).toBe(before);
  });

  it("a puzzle edited between the briefing and play ends the briefing: the game never starts with changed content", () => {
    const approved = EVERYDAY_IDS.slice(0, 6);
    const r = room("cup", fixture({ approve: approved }));
    const g = r.engine.startGame(r.host, "split-clues", { official: true, seed: 4 });
    const first = g.pendingContent!.items[0]!.itemId;
    r.engine.content = fixture({ approve: approved, edit: (it) => { if (it.id === first) it.clues[3] = "Edited after the briefing began."; } });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    expect(r.engine.games.get(g.id)?.status ?? "gone").not.toBe("playing");
    expect(Object.keys(r.engine.contentUsage)).toEqual([]);
  });

  it("no repeats across games: a second Official game can't reuse the first game's puzzles", () => {
    const r = room("cup", fixture({ approve: EVERYDAY_IDS.slice(0, 8) }));
    const g = r.engine.startGame(r.host, "split-clues", { official: true, seed: 4 });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    r.engine.games.get(g.id)!.status = "finished";
    expect(() => r.engine.startGame(r.host, "split-clues", { official: true, seed: 5 })).toThrowError(/2 unused approved puzzles/);
  });

  it("games dealt before Stage 12.16 (no usage recorded) still count: their puzzles are treated as used", () => {
    const approved = EVERYDAY_IDS.slice(0, 7);
    const r = room("cup", fixture({ approve: approved }));
    // A finished practice game from the old bank: its puzzles in its state, nothing in the usage history.
    const old = r.engine.startGame(r.host, "split-clues", { official: false, seed: 9 });
    for (const p of r.ids) r.send(p, old.id, "briefing-ready", { ready: true });
    const st = r.engine.games.get(old.id)!.extra as SplitState;
    st.puzzles = [approved[0]!, approved[1]!, ...EVERYDAY_IDS.slice(20, 24)].map((id) => splitPuzzleOf(li(r.engine.content, id)));
    r.engine.games.get(old.id)!.status = "finished";
    for (const id of Object.keys(r.engine.contentUsage)) delete r.engine.contentUsage[id];
    expect(() => r.engine.startGame(r.host, "split-clues", { official: true, seed: 6 })).toThrowError(/5 unused approved puzzles/);
  });

  it("casual Everyday never deals Christmas; casual Christmas deals its Christmas puzzles first", () => {
    const r = room("casual", fixture());
    const g = r.engine.startGame(r.host, "split-clues", { official: false, seed: 2 });
    expect(puzzleIds(r, g.id).every((id) => EVERYDAY_IDS.includes(id))).toBe(true);
  });

  it("guests can't start it, and the TV and other teams never see a clue or an answer before the reveal", () => {
    const r = room("cup", fixture({ approve: EVERYDAY_IDS.slice(0, 6) }));
    expect(() => r.engine.startGame(r.ids[1]!, "split-clues", { official: true, seed: 4 })).toThrowError();
    const g = r.engine.startGame(r.host, "split-clues", { official: true, seed: 4 });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    const st = r.engine.games.get(g.id)!.extra as SplitState;
    const tv = JSON.stringify(r.engine.project("tv"));
    for (const p of st.puzzles) {
      expect(tv.includes(p.answer)).toBe(false);
      for (const c of p.clues) expect(tv.includes(c)).toBe(false);
    }
  });
});

describe("the review inventory (docs/stage12/stage1216-split-clues-inventory.md)", () => {
  it("lists every puzzle with its current approval hash, so an edit without a regenerated inventory is caught", () => {
    const doc = readFileSync(new URL("../docs/stage12/stage1216-split-clues-inventory.md", import.meta.url), "utf8");
    const lib = loadContent();
    const listed = [...doc.matchAll(/^### (sc-\d{3}) · /gm)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...EVERYDAY_IDS, ...XMAS_IDS].sort());
    for (const li of lib.byGame.get("split-clues") ?? []) {
      const block = doc.slice(doc.indexOf(`### ${li.item.id} · `)).split("\n### ")[0]!;
      expect(block, li.item.id).toContain(`**Approval hash** \`${li.hash}\``);
      for (const c of (li.item as unknown as Item).clues) expect(block, li.item.id).toContain(c);
    }
    const approved = (lib.byGame.get("split-clues") ?? []).filter((li) => li.status === "approved").length;
    expect(doc).toContain(approved === 0 ? "**No puzzle is approved**" : `**${approved} of `);
  });
});

describe("the shared plan (Up next) follows the Official gate (D-S1216-04)", () => {
  it("a plan for Official Split Clues shows as Practice on every screen while the Cup has too few approved puzzles", async () => {
    const { Harness } = await import("./helpers/harness.js");
    for (const [lib, official] of [[loadContent(), false], [loadContent(undefined, { testApproveProvisional: true }), true]] as const) {
      const h = new Harness(undefined, { content: lib });
      try {
        await h.start();
        await h.createRoom("Plan");
        const host = await h.join("Host", { host: true });
        const guest = await h.join("Guest");
        expect((await h.post(`/rooms/${h.roomId}/plan`, { gameId: "split-clues", official: true }, host.token)).status).toBe(200);
        for (const p of [await h.projection(host), await h.projection(guest), await h.tv()]) expect(p["upNext"]).toEqual({ gameId: "split-clues", official });
        // Other games' plans are untouched.
        await h.post(`/rooms/${h.roomId}/plan`, { gameId: "trivia", official: true }, host.token);
        expect((await h.tv())["upNext"]).toEqual({ gameId: "trivia", official: true });
      } finally { await h.dispose(); }
    }
  });
});

describe("R1 (review 6895557386): only an exact-hash approval record approves a Split Clues puzzle", () => {
  const SIX = EVERYDAY_IDS.slice(0, 6);
  const rawAll = (status: string) => Object.fromEntries(SIX.map((id) => [id, status]));
  const officialStart = (lib: ContentLibrary) => {
    const r = room("cup", lib);
    let err: unknown;
    try { r.engine.startGame(r.host, "split-clues", { official: true, seed: 7 }); } catch (e) { err = e; }
    const view = ((r.engine.project("player", r.host) as Json)["officialContent"] as Json)["split-clues"] as Json;
    return { r, err, view };
  };
  const expectRefused = (lib: ContentLibrary, available: number) => {
    const { r, err, view } = officialStart(lib);
    expect(err).toBeInstanceOf(ContentShortage);
    expect((err as ContentShortage).message).toMatch(new RegExp(`this Cup has ${available} unused approved puzzle`));
    expect([r.engine.games.size, Object.keys(r.engine.contentUsage).length]).toEqual([0, 0]); // nothing created, no usage
    expect(view).toMatchObject({ available, needed: 6 });
  };

  for (const raw of ["approved", "legacy", "verified-computed"]) {
    it(`a raw "${raw}" label approves nothing: no approvals file, no record, or a stale record`, () => {
      const cases: [string, ContentLibrary][] = [
        ["no approvals file", fixture({ raw: rawAll(raw), noApprovalsFile: true })],
        ["no record (approvals file present)", fixture({ raw: rawAll(raw) })],
        ["a stale record for each", fixture({ raw: rawAll(raw), approve: SIX, edit: (it) => { if (SIX.includes(it.id)) it.clues[5] = "Edited after the approval."; } })],
      ];
      for (const [why, lib] of cases) {
        for (const id of SIX) {
          expect([why, id, li(lib, id).status, !!li(lib, id).approval, officialEligible(li(lib, id), TODAY)]).toEqual([why, id, "provisional", false, false]);
          expect(practiceUsable(li(lib, id))).toBe(true);
        }
        // The loader says why, for every such puzzle.
        expect(lib.problems.filter((p) => /does not approve a split-clues item/.test(p.message)).map((p) => p.itemId).sort()).toEqual([...SIX].sort());
        expectRefused(lib, 0);
      }
    });
  }

  it("six exact records enable Official; one invalidated leaves five and a truthful refusal (with a raw label too)", () => {
    const { r, err, view } = officialStart(fixture({ approve: SIX }));
    expect(err).toBeUndefined();
    expect(view).toEqual({ available: 6, needed: 6 });
    expect([...r.engine.games.values()].map((g) => [g.official, g.status])).toEqual([[true, "briefing"]]);
    const stale = (it: Item) => { if (it.id === SIX[0]) it.clues[5] = "Edited after the approval."; };
    expectRefused(fixture({ approve: SIX, edit: stale }), 5);
    // The review's case: raw "approved" on all six, records at the shipped hashes, then one edited.
    const lib = fixture({ approve: SIX, edit: stale, raw: rawAll("approved") });
    expect([li(lib, SIX[0]!).status, officialEligible(li(lib, SIX[0]!), TODAY)]).toEqual(["provisional", false]);
    expect(SIX.slice(1).every((id) => li(lib, id).status === "approved" && officialEligible(li(lib, id), TODAY))).toBe(true);
    expectRefused(lib, 5);
  });

  it("a revoked approval between the briefing and play stops play, even with a raw approved label left in the pack", () => {
    const r = room("cup", fixture({ approve: SIX }));
    const g = r.engine.startGame(r.host, "split-clues", { official: true, seed: 8 });
    expect(g.status).toBe("briefing");
    // The records are withdrawn (the file deleted) while the pack now claims "approved".
    r.engine.content = fixture({ raw: rawAll("approved"), noApprovalsFile: true });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    expect(r.engine.games.get(g.id)?.status ?? "gone").not.toBe("playing");
    expect(Object.keys(r.engine.contentUsage)).toEqual([]);
  });

  it("rejected stays rejected with a matching record, and leaves too few for Official", () => {
    const lib = fixture({ approve: SIX, reject: [SIX[1]!] });
    expect([li(lib, SIX[1]!).status, officialEligible(li(lib, SIX[1]!), TODAY), practiceUsable(li(lib, SIX[1]!))]).toEqual(["rejected", false, false]);
    expectRefused(lib, 5);
  });

  it("Practice still deals puzzles with a raw label; other games keep their legacy and computed rules", () => {
    const r = room("cup", fixture({ raw: rawAll("approved"), noApprovalsFile: true }));
    const g = r.engine.startGame(r.host, "split-clues", { official: false, seed: 9 });
    expect([g.official, g.status, puzzleIds(r, g.id).length]).toEqual([false, "briefing", 6]);
    const shipped = loadContent();
    const legacyTrivia = (shipped.byGame.get("trivia") ?? []).find((x) => x.status === "legacy");
    const computed = (shipped.byGame.get("closest-wins") ?? []).find((x) => x.status === "verified-computed");
    expect(legacyTrivia && officialEligible(legacyTrivia, TODAY)).toBe(true);
    expect(computed && officialEligible(computed, TODAY)).toBe(true);
  });

  it("the test mode keeps its truthful label for provisional puzzles, and a raw label still approves nothing by itself", () => {
    const lib = fixture({ testMode: true, raw: { [SIX[0]!]: "approved" } });
    expect([li(lib, SIX[1]!).status, li(lib, SIX[1]!).approval?.reviewer]).toEqual(["approved", "TEST MODE (not a human review)"]);
    // Demoted to provisional first, it is then treated like any provisional puzzle in test mode: the test record, never the label.
    expect([li(lib, SIX[0]!).status, li(lib, SIX[0]!).approval?.reviewer]).toEqual(["approved", "TEST MODE (not a human review)"]);
  });
});
