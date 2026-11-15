/**
 * Beta R1-R round 3 (review 6903002137): zod 3's GHSA-mrhx-c7xc-m3w5 where network input reaches it.
 * zod 3 parses every element of an array and records an issue for each bad one before it applies `.max()`; it has no
 * fix. Two schemas that any room member can reach have such an array: Family Questions' `options` and the Quick Party
 * lineup's `items`. They now check the length first (src/server/boundedArray.ts). These tests were written to fail
 * before that change: an over-long array was walked element by element.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Harness } from "./helpers/harness.js";
import { LocalServer, MAX_MESSAGE_BYTES } from "../src/server/http.js";
import { IntentSchema } from "../src/shared/protocol.js";
import { LENGTH_CHECKED_FIRST } from "../src/server/boundedArray.js";
import { FAMILY_LIMITS } from "../src/shared/familyPack.js";

/** Every schema network input is parsed with: LocalServer's (the HTTP routes) and IntentSchema (HTTP and WebSocket intents). */
const NETWORK_SCHEMAS: Record<string, z.ZodTypeAny> = {
  ...Object.fromEntries(Object.entries(LocalServer).filter(([, v]) => v instanceof z.ZodType)),
  IntentSchema,
};

/** Each collection in a schema: where it is, and whether zod would walk it in full before any limit applies. */
function collections(s: z.ZodTypeAny, path: string, out: { path: string; kind: string; walkedInFull: boolean }[] = [], seen = new Set<unknown>()) {
  if (seen.has(s)) return out;
  seen.add(s);
  const d = s._def as Record<string, unknown> & { typeName: string };
  const sub = (x: unknown, p: string) => collections(x as z.ZodTypeAny, p, out, seen);
  switch (d.typeName) {
    case "ZodObject": for (const [k, v] of Object.entries((s as z.AnyZodObject).shape)) sub(v, `${path}.${k}`); break;
    case "ZodUnion": case "ZodDiscriminatedUnion": [...(d["options"] as Iterable<unknown>)].forEach((o, i) => sub(o, `${path}|${i}`)); break;
    case "ZodOptional": case "ZodNullable": case "ZodDefault": case "ZodReadonly": case "ZodCatch": sub(d["innerType"], path); break;
    case "ZodBranded": sub(d["type"], path); break;
    case "ZodEffects": sub(d["schema"], path); break;
    case "ZodPipeline": {
      const first = d["in"] as z.ZodTypeAny, then = d["out"] as z.ZodTypeAny;
      if (first.description === LENGTH_CHECKED_FIRST && then._def.typeName === "ZodArray") {
        out.push({ path, kind: "array", walkedInFull: false });
        sub((then as z.ZodArray<z.ZodTypeAny>).element, `${path}[]`);
      } else { sub(first, path); sub(then, path); }
      break;
    }
    case "ZodArray": out.push({ path, kind: "array", walkedInFull: true }); sub(d["type"], `${path}[]`); break;
    case "ZodRecord": {
      // A record's entries are parsed one by one too; only one whose keys and values can't fail adds no issue per entry.
      const canFail = !["ZodString"].includes((d["keyType"] as z.ZodTypeAny)._def.typeName) || ((d["keyType"] as z.ZodString)._def.checks?.length ?? 0) > 0 || !["ZodUnknown", "ZodAny"].includes((d["valueType"] as z.ZodTypeAny)._def.typeName);
      out.push({ path, kind: "record", walkedInFull: canFail });
      break;
    }
    case "ZodSet": case "ZodMap": case "ZodTuple": case "ZodLazy": case "ZodIntersection": out.push({ path, kind: d.typeName, walkedInFull: true }); break;
    default: break;
  }
  return out;
}

describe("the zod collections network input reaches (GHSA-mrhx-c7xc-m3w5)", () => {
  it("no network-facing schema has a collection zod would walk in full, issue by issue, before a limit applies", () => {
    const found = Object.entries(NETWORK_SCHEMAS).flatMap(([name, s]) => collections(s, name));
    expect(found.filter((c) => c.walkedInFull).map((c) => `${c.path} (${c.kind})`)).toEqual([]);
    // The inventory itself (docs/beta/beta-r1-blockers.md D-2): a new collection here needs the same review.
    expect(found.map((c) => `${c.path} ${c.kind}`).sort()).toEqual([
      "FamilyQuestionSchema.options array",
      "GameSettingsSchema.settings record",
      "IntentSchema.payload record",
      "PartyBodySchema|0.plan.items array",
    ]);
  });
});

/** An array of n zeros that counts how many of its elements are read. */
function counted(n: number): { value: unknown[]; reads: () => number } {
  let reads = 0;
  const value = new Proxy(Array(n).fill(0), { get(t, k, r) { if (typeof k === "string" && /^\d+$/.test(k)) reads++; return Reflect.get(t, k, r); } });
  return { value, reads: () => reads };
}
const allIssues = (e: z.ZodError): z.ZodIssue[] => e.issues.flatMap((i) => (i.code === "invalid_union" ? [i, ...i.unionErrors.flatMap(allIssues)] : [i]));

describe("an over-long array is refused before any element is read", () => {
  it("Family Questions: 32,000 options of the wrong type → one too_big issue, no element read", () => {
    const a = counted(32_000);
    const r = LocalServer.FamilyQuestionSchema.safeParse({ kind: "choice", prompt: "q", options: a.value });
    expect(r.success).toBe(false);
    expect(a.reads()).toBe(0);
    expect(r.error!.issues).toMatchObject([{ code: "too_big", path: ["options"], maximum: 8 }]);
  });
  it("Quick Party: 32,000 lineup items of the wrong type → refused, no element read, a handful of issues", () => {
    const a = counted(32_000);
    const r = LocalServer.PartyBodySchema.safeParse({ baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 15, items: a.value } });
    expect(r.success).toBe(false);
    expect(a.reads()).toBe(0);
    const issues = allIssues(r.error!);
    expect(issues.length).toBeLessThanOrEqual(4);
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "too_big", path: ["plan", "items"], maximum: 8 })]));
  });
  it("the worst bodies that fit the 64 KiB cap now build one or a few issues, not 32,000", () => {
    const fill = (prefix: string, unit: string, suffix: string) => { const n = Math.floor((MAX_MESSAGE_BYTES - prefix.length - suffix.length + 1) / (unit.length + 1)); return prefix + Array(n).fill(unit).join(",") + suffix; };
    const cases: [z.ZodTypeAny, string][] = [
      [LocalServer.FamilyQuestionSchema, fill('{"kind":"choice","prompt":"q","options":[', "0", "]}")],
      [LocalServer.FamilyQuestionSchema, fill('{"kind":"choice","prompt":"q","options":[', "[]", "]}")],
      [LocalServer.PartyBodySchema, fill('{"baseRevision":0,"plan":{"expectedPlayers":2,"budgetMinutes":15,"items":[', "0", "]}}")],
      [LocalServer.PartyBodySchema, fill('{"baseRevision":0,"plan":{"expectedPlayers":2,"budgetMinutes":15,"items":[', "{}", "]}}")],
    ];
    for (const [schema, body] of cases) {
      expect(Buffer.byteLength(body)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
      const r = schema.safeParse(JSON.parse(body));
      expect(r.success).toBe(false);
      expect(allIssues(r.error!).length).toBeLessThanOrEqual(4);
    }
  });
});

// The two schemas exactly as they were before (33b673d), to check nothing that passed before is refused now, nothing
// refused before passes now, and what passes parses to the same value.
const BEFORE = {
  family: z.object({
    kind: z.enum(["choice", "who"]),
    prompt: z.string().max(1000),
    options: z.array(z.string().max(500)).max(8).optional(),
    correctIndex: z.number().int().min(0).max(7).optional(),
    answerPlayerId: z.string().min(1).max(128).optional(),
  }).strict(),
  party: z.union([
    z.object({
      baseRevision: z.number().int().min(0),
      plan: z.object({
        expectedPlayers: z.number().int().min(1).max(10),
        budgetMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        items: z.array(z.object({ gameId: z.string().min(1).max(64), official: z.boolean().optional() }).strict()).min(1).max(8),
      }).strict(),
    }).strict(),
    z.object({ baseRevision: z.number().int().min(0), clear: z.literal(true) }).strict(),
  ]),
};

/** A small seeded generator (mulberry32), so a failure names a case that can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const maybe = <T,>(x: T): T | undefined => (next() < 0.15 ? undefined : x);
  return { next, pick, maybe };
}
const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

describe("compatibility: the same answers as before on everything else", () => {
  it("Family Questions: 4,000 generated bodies around the limits get the same verdict and the same parsed value", () => {
    const g = rng(20261115);
    const element = ["a", "", "x".repeat(500), "x".repeat(501), 0, null, [], {}, true] as const;
    const valid = (good: readonly unknown[], all: readonly unknown[]): unknown => (g.next() < 0.8 ? g.pick(good) : g.pick(all)); // mostly valid, so plenty pass
    let overLimit = 0, passed = 0;
    for (let i = 0; i < 4000; i++) {
      const options = g.next() < 0.15 ? g.pick([undefined, null, "a", 5, {}, true] as const) : Array.from({ length: Math.floor(g.next() * 13) }, () => valid(element.slice(0, 3), element));
      if (Array.isArray(options) && options.length > 8) overLimit++;
      const body = strip({
        kind: g.next() < 0.05 ? undefined : valid(["choice", "who"] as const, ["choice", "who", "x", 1] as const),
        prompt: g.next() < 0.05 ? undefined : valid(["", "Where was Bibi born?", "x".repeat(1000)] as const, ["", "x".repeat(1001), 5] as const),
        options,
        correctIndex: valid([undefined, 0, 7] as const, [8, -1, 1.5, "0"] as const),
        answerPlayerId: valid([undefined, "player-1"] as const, ["", 3] as const),
        ...(g.next() < 0.05 ? { extra: 1 } : {}),
      });
      const before = BEFORE.family.safeParse(body), now = LocalServer.FamilyQuestionSchema.safeParse(body);
      expect({ i, success: now.success }).toEqual({ i, success: before.success });
      if (before.success && now.success) { passed++; expect(now.data).toEqual(before.data); }
    }
    expect(overLimit).toBeGreaterThan(500);
    expect(passed).toBeGreaterThan(50);
  });
  it("Quick Party: 4,000 generated bodies around the limits get the same verdict and the same parsed value", () => {
    const g = rng(43);
    const item = [{ gameId: "trivia" }, { gameId: "trivia", official: true }, { gameId: "math-mayhem", official: false }, { gameId: "" }, { gameId: "x".repeat(65) }, {}, 0, [], { gameId: "a", x: 1 }, { official: 0 }] as const;
    let overLimit = 0, passed = 0;
    for (let i = 0; i < 4000; i++) {
      const items = g.next() < 0.15 ? g.pick([undefined, null, "a", {}, 3] as const) : Array.from({ length: Math.floor(g.next() * 13) }, () => (g.next() < 0.8 ? g.pick(item.slice(0, 3)) : g.pick(item)));
      if (Array.isArray(items) && items.length > 8) overLimit++;
      const body = g.next() < 0.1
        ? strip({ baseRevision: g.pick([0, 2, -1] as const), clear: g.pick([true, false] as const), ...(g.next() < 0.3 ? { plan: {} } : {}) })
        : strip({
          baseRevision: g.maybe(g.pick([0, 3, -1, "0", 1.5] as const)),
          plan: strip({ expectedPlayers: g.maybe(g.pick([1, 2, 10, 0, 11] as const)), budgetMinutes: g.maybe(g.pick([15, 30, 60, 45] as const)), items, ...(g.next() < 0.05 ? { extra: 1 } : {}) }),
        });
      const before = BEFORE.party.safeParse(body), now = LocalServer.PartyBodySchema.safeParse(body);
      expect({ i, success: now.success }).toEqual({ i, success: before.success });
      if (before.success && now.success) { passed++; expect(now.data).toEqual(before.data); }
    }
    expect(overLimit).toBeGreaterThan(500);
    expect(passed).toBeGreaterThan(100);
  });
});

const harnesses: Harness[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.dispose(); });

describe("through the server: refusals and valid requests are as before", () => {
  it("the worst 64 KiB bodies get the same 400s, change nothing, and valid questions and lineups still save", async () => {
    const h = new Harness();
    harnesses.push(h);
    await h.start();
    const raw = async (path: string, body: string, token?: string) => {
      const r = await fetch(`http://localhost:${h.port}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body });
      return { status: r.status, body: (await r.json()) as Record<string, unknown> };
    };
    const room = (await raw("/rooms", JSON.stringify({ kind: "casual" }))).body;
    const seat = (await raw(`/rooms/${room["roomId"]}/join`, JSON.stringify({ displayName: "Ada", asHost: true, hostClaimToken: room["hostClaimToken"] }))).body;
    const id = room["roomId"] as string, token = seat["sessionToken"] as string;
    const state = async () => {
      const p = (await h.get(`/rooms/${id}/projection?audience=host`, { "x-session-token": token })).body as Record<string, { revision?: number; ready?: number }>;
      return { questions: p["family"]?.ready ?? 0, partyRevision: (p["party"] as { revision?: number } | undefined)?.revision ?? 0 };
    };
    const fill = (prefix: string, unit: string, suffix: string) => { const n = Math.floor((MAX_MESSAGE_BYTES - prefix.length - suffix.length + 1) / (unit.length + 1)); return prefix + Array(n).fill(unit).join(",") + suffix; };
    const QUESTION = { error: "That question couldn't be read. Try writing it again.", code: "INVALID_QUESTION" };
    const LINEUP = { error: "A lineup needs a group size of 1–10, 15, 30 or 60 minutes, and 1–8 games", code: "INVALID_PLAN" };

    expect(await raw(`/rooms/${id}/family`, JSON.stringify({ kind: "choice", prompt: "Where was Bibi born?", options: ["Nairobi", "Mombasa"], correctIndex: 0 }), token)).toMatchObject({ status: 200 });
    const before = await state();
    expect(before.questions).toBe(1);
    for (const body of [
      fill('{"kind":"choice","prompt":"q","options":[', "0", "]}"),
      fill('{"kind":"choice","prompt":"q","options":[', "[]", "]}"),
      JSON.stringify({ kind: "choice", prompt: "q", options: Array(9).fill("a"), correctIndex: 0 }), // nine valid options: refused as before
    ]) expect(await raw(`/rooms/${id}/family`, body, token)).toEqual({ status: 400, body: QUESTION });
    for (const body of [
      fill('{"baseRevision":0,"plan":{"expectedPlayers":2,"budgetMinutes":15,"items":[', "0", "]}}"),
      fill('{"baseRevision":0,"plan":{"expectedPlayers":2,"budgetMinutes":15,"items":[', "{}", "]}}"),
      JSON.stringify({ baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 30, items: Array(9).fill({ gameId: "trivia" }) } }), // nine valid games: refused as before
    ]) expect(await raw(`/rooms/${id}/party`, body, token)).toEqual({ status: 400, body: LINEUP });
    expect(await state()).toEqual(before);

    // The room allows FAMILY_LIMITS.maxOptions answers (zod's 8 is only the outer bound): the most it takes still saves.
    const most = FAMILY_LIMITS.maxOptions;
    expect(await raw(`/rooms/${id}/family`, JSON.stringify({ kind: "choice", prompt: "Who baked?", options: Array.from({ length: most }, (_, i) => `Option ${i}`), correctIndex: most - 1 }), token)).toMatchObject({ status: 200 });
    expect(await raw(`/rooms/${id}/party`, JSON.stringify({ baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 30, items: [{ gameId: "trivia" }] } }), token)).toMatchObject({ status: 200 });
    expect(await state()).toEqual({ questions: 2, partyRevision: before.partyRevision + 1 });
  });
});
