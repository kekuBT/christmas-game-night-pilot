/**
 * Stage 12.17 (docs/stage12/stage1217.md; D-S1217-01..04): Team Draw content readiness.
 *
 * The drawing prompts live in the content library (one pool, `draw-prompts`, shared by Team Draw and Draw & Guess). An
 * Official Team Draw game in a Family Cup deals only prompts with an approval record at their exact content hash: one
 * unused prompt per round, 3 to 5 rounds from the final team roster.
 *
 * Every approval here is a TEST FIXTURE written into a temporary directory (never content/approvals.json): it stands in
 * for a human editor's sign-off so the machinery can be exercised; it approves nothing in the shipped library. These
 * tests load libraries without test mode (except the one test of the test mode's own label), so a provisional prompt is
 * never treated as approved.
 */
import { randomUUID, createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, itemHash, loadContent, officialEligible, practiceUsable, type ContentLibrary } from "../src/content/registry.js";
import { drawPromptPool } from "../src/content/materialize.js";
import { lintLibrary } from "../src/content/lint.js";
import { DrawPromptItem } from "../src/content/schema.js";
import { ContentShortage, RoomEngine } from "../src/server/room.js";
import { teamDrawModule, teamDrawRoundCount, type TeamDrawState } from "../src/games/modules/teamDraw.js";
import { drawModule, type DrawState } from "../src/games/modules/draw.js";

type Json = Record<string, unknown>;
type Item = Json & { id: string; word: string; alts?: string[]; season?: string; review: { status: string } };
const TODAY = "2026-11-15";
const PACK = "draw-prompts.json";
const SHIPPED = (JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", PACK), "utf8")) as { items: Item[] }).items;
const ALL_IDS = SHIPPED.map((i) => i.id);
const XMAS_IDS = SHIPPED.filter((i) => i.season === "christmas").map((i) => i.id);
const YEAR_ROUND_IDS = SHIPPED.filter((i) => !i.season).map((i) => i.id);
/** The hash the loader computes: of the item as parsed (the schema fills defaults such as `tags: []`), never the raw JSON. */
const hashOf = (item: Item) => itemHash("draw-prompts", DrawPromptItem.parse(structuredClone(item)) as never);

const tempTrees: string[] = [];
const removeTempTrees = () => { for (const d of tempTrees.splice(0)) rmSync(d, { recursive: true, force: true }); };
afterEach(removeTempTrees);
afterAll(removeTempTrees);

/**
 * A library from a temporary copy of the shipped packs, with a TEST FIXTURE approvals file. `approve` approves prompts
 * at their hash as shipped; `edit` then changes prompts (so an approval can be for an earlier version); `reject` marks
 * prompts rejected in the pack; `raw` sets a raw review label in the pack.
 */
function fixture(opts: { approve?: readonly string[]; edit?: (item: Item) => void; reject?: readonly string[]; raw?: Record<string, string>; noApprovalsFile?: boolean; testMode?: boolean } = {}): ContentLibrary {
  const dir = mkdtempSync(join(tmpdir(), "mz-s1217-"));
  tempTrees.push(dir);
  mkdirSync(join(dir, "packs"), { recursive: true });
  cpSync(join(DEFAULT_CONTENT_DIR, "reference"), join(dir, "reference"), { recursive: true });
  const approvals: Json[] = [];
  for (const file of readdirSync(join(DEFAULT_CONTENT_DIR, "packs")).filter((f) => f.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", file), "utf8")) as { gameId: string; items: Item[] };
    if (pack.gameId === "draw-prompts") {
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

const NAMES = ["Keku", "Amina", "Baraka", "Wanjiru", "Zawadi", "Juma", "Neema", "Otieno", "Achieng", "Kamau"];
/** A room of `n` players (the first hosts), its library injected; Cups use the briefing (timing 2). */
function room(kind: "cup" | "casual", lib: ContentLibrary, n = 4) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine(kind === "cup" ? "Family Cup" : "Game night", { kind, timing: 2 });
  engine.clock = () => t;
  engine.content = lib;
  const ids = [engine.join(NAMES[0]!, { asHost: true }).player.id];
  for (const name of NAMES.slice(1, n)) ids.push(engine.join(name).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  const readyAll = (gid: string) => { for (const p of ids) send(p, gid, "briefing-ready", { ready: true }); };
  return { engine, ids, host: ids[0]!, send, readyAll, advance: (ms: number) => { t += ms; engine.tick(); } };
}
type Room = ReturnType<typeof room>;
const drawView = (r: Room) => ((r.engine.project("player", r.host) as Json)["officialContent"] as Json | undefined)?.["team-draw"] as Json | undefined;
const tdState = (r: Room, gid: string) => r.engine.games.get(gid)!.extra as TeamDrawState;
function officialStart(r: Room, seed = 5): { game?: ReturnType<RoomEngine["startGame"]>; err?: unknown } {
  try { return { game: r.engine.startGame(r.host, "team-draw", { official: true, seed }) }; } catch (err) { return { err }; }
}
function expectRefused(r: Room, available: number, rounds: number) {
  const before = r.engine.games.size;
  const { err } = officialStart(r);
  expect(err).toBeInstanceOf(ContentShortage);
  const e = err as ContentShortage;
  expect([e.code, e.available, e.needed]).toEqual(["CONTENT_EXHAUSTED", available, rounds]);
  expect(e.message).toBe(`Team Draw counts only with drawing words a person has approved, and this Cup has ${available} unused approved word${available === 1 ? "" : "s"} (this game has ${rounds} rounds: one word each). Play it as Practice instead: Practice also uses words that are not approved yet.`);
  expect(r.engine.games.size).toBe(before); // nothing created
  expect(drawView(r)).toMatchObject({ available, needed: rounds, message: e.message });
}
const line = { pieces: [{ s: 1, c: 0, w: 1, p: [100, 100, 400, 400, 600, 300] }] };
/** Plays every round: each team's drawer draws, a teammate guesses the word; then the reveal runs out. */
function playThrough(r: Room, gid: string) {
  const st = tdState(r, gid);
  for (let round = 0; round < st.prompts.length; round++) {
    for (const [team, tr] of Object.entries(st.rounds[round]!)) {
      expect(r.send(tr.drawer, gid, "team-draw-strokes", { round, ...line }).accepted).toBe(true);
      const mate = r.ids.find((p) => st.teams.members[p] === team && p !== tr.drawer && !tr.sawWord.includes(p))!;
      expect(r.send(mate, gid, "team-draw-guess", { round, text: st.prompts[round]!.word }).accepted).toBe(true);
    }
    r.advance(10_000);
  }
  expect(r.engine.games.get(gid)!.status).toBe("finished");
}

describe("one canonical prompt pool in the content library (D-S1217-01)", () => {
  it("keeps all 70 prompts exactly: ids, order, words, alternatives and seasons (the TypeScript list's fingerprint)", () => {
    expect(ALL_IDS).toEqual(Array.from({ length: 70 }, (_, k) => `dg-${String(k + 1).padStart(3, "0")}`));
    expect(XMAS_IDS).toEqual(["dg-002", "dg-003", "dg-004"]);
    expect(SHIPPED.filter((i) => i.alts).length).toBe(15);
    // The fingerprint of src/games/modules/packs/draw-prompts.ts before it was removed, computed the same way by the
    // generator (docs/evidence/stage1217-local/gen-draw-pack.mts.txt).
    const canon = (p: Item) => JSON.stringify([p.id, p.word, p.alts ?? [], p.season ?? null]);
    expect(createHash("sha256").update(SHIPPED.map(canon).join("\n")).digest("hex")).toBe("165c7ad5d7273910a34a559395098f2096dba3a552479c345135d39443a0b0f0");
  });

  it("ships provisional: no prompt is approved or official; every prompt is usable in Practice; no loader or lint errors", () => {
    const lib = loadContent();
    const items = lib.byGame.get("draw-prompts")!;
    expect(items).toHaveLength(70);
    expect(items.every((x) => x.item.review.status === "provisional" && x.status === "provisional" && !x.approval)).toBe(true);
    expect(items.filter((x) => officialEligible(x, TODAY))).toHaveLength(0);
    expect(items.every((x) => practiceUsable(x))).toBe(true);
    expect(lib.problems).toEqual([]);
    expect(lintLibrary(lib, TODAY).filter((i) => i.gameId === "draw-prompts" && i.level === "error")).toEqual([]);
  });

  it("both drawing games deal from that one pool (same ids and words; one history), never a copy of their own", () => {
    expect([teamDrawModule.contentPool, drawModule.contentPool]).toEqual(["draw-prompts", "draw-prompts"]);
    const pool = drawPromptPool(loadContent());
    expect(pool.map((p) => p.id)).toEqual(ALL_IDS);
    expect(pool.map((p) => [p.word, p.alts ?? [], p.season ?? null])).toEqual(SHIPPED.map((i) => [i.word, i.alts ?? [], i.season ?? null]));
    // A rejected prompt leaves the pool for every game.
    expect(drawPromptPool(fixture({ reject: ["dg-010"] })).some((p) => p.id === "dg-010")).toBe(false);
    // In a room, both games deal ids from that pool.
    const r = room("casual", fixture());
    const td = r.engine.startGame(r.host, "team-draw", { official: false, seed: 2 });
    r.readyAll(td.id);
    expect(tdState(r, td.id).prompts.every((p) => ALL_IDS.includes(p.id))).toBe(true);
  });

  it("the lint flags an alternative that repeats the word (warning) and duplicated alternatives (error)", () => {
    const lib = fixture({ edit: (it) => { if (it.id === "dg-001") it.alts = [it.word]; if (it.id === "dg-005") it.alts = ["kitty", "Kitty"]; } });
    const issues = lintLibrary(lib, TODAY).filter((i) => i.gameId === "draw-prompts").map((i) => `${i.level} ${i.itemId} ${i.code}`);
    expect(issues).toEqual(expect.arrayContaining(["warn dg-001 alt-repeats-answer", "error dg-005 duplicate-alts"]));
  });
});

describe("only an exact-hash approval record approves a prompt (D-S1217-02, as D-S1216R-01)", () => {
  it("missing: provisional, Practice only", () => {
    const lib = fixture();
    expect([li(lib, "dg-001").status, officialEligible(li(lib, "dg-001"), TODAY), practiceUsable(li(lib, "dg-001"))]).toEqual(["provisional", false, true]);
  });

  it("exact: approved and official, with the record's reviewer", () => {
    const lib = fixture({ approve: ["dg-001"] });
    expect([li(lib, "dg-001").status, li(lib, "dg-001").approval?.reviewer, officialEligible(li(lib, "dg-001"), TODAY)]).toEqual(["approved", "TEST FIXTURE (not an editorial approval)", true]);
    expect(lib.problems).toEqual([]);
  });

  it("stale: an edit to the word or an alternative after approval voids it, and the loader says so", () => {
    for (const edit of [(it: Item) => { it.word = "cats"; }, (it: Item) => { it.alts = ["kitten"]; }]) {
      const lib = fixture({ approve: ["dg-005"], edit: (it) => { if (it.id === "dg-005") edit(it); } });
      expect([li(lib, "dg-005").status, officialEligible(li(lib, "dg-005"), TODAY)]).toEqual(["provisional", false]);
      expect(lib.problems.map((p) => `${p.itemId}: ${p.message}`)).toEqual(["dg-005: approval is for an earlier version of this item (edited since approval): re-review needed"]);
    }
  });

  it("the season tag and the review note stay outside the hash; the word and alternatives are in it", () => {
    const item = structuredClone(SHIPPED.find((i) => i.id === "dg-002")!);
    const h = hashOf(item);
    const { season: _s, ...untagged } = item; void _s;
    expect(hashOf(untagged as Item)).toBe(h);
    expect(hashOf({ ...item, review: { status: "provisional", notes: "an editor's note" } } as Item)).toBe(h);
    expect(hashOf({ ...item, word: "moose" } as Item)).not.toBe(h);
    expect(hashOf({ ...item, alts: ["caribou"] } as Item)).not.toBe(h);
  });

  for (const raw of ["approved", "legacy", "verified-computed"]) {
    it(`revoked or never recorded: a raw "${raw}" label approves nothing (no file, no record, or a stale record)`, () => {
      const three = YEAR_ROUND_IDS.slice(0, 3);
      const rawAll = Object.fromEntries(three.map((id) => [id, raw]));
      const cases: [string, ContentLibrary][] = [
        ["no approvals file", fixture({ raw: rawAll, noApprovalsFile: true })],
        ["no record", fixture({ raw: rawAll })],
        ["a stale record", fixture({ raw: rawAll, approve: three, edit: (it) => { if (three.includes(it.id)) it.word = `${it.word} edited`; } })],
      ];
      for (const [why, lib] of cases) {
        for (const id of three) expect([why, id, li(lib, id).status, !!li(lib, id).approval, officialEligible(li(lib, id), TODAY), practiceUsable(li(lib, id))]).toEqual([why, id, "provisional", false, false, true]);
        expect(lib.problems.filter((p) => /does not approve a draw-prompts item/.test(p.message)).map((p) => p.itemId).sort()).toEqual([...three].sort());
        expectRefused(room("cup", lib), 0, 3);
      }
    });
  }

  it("rejected stays rejected with a matching record: never official, never dealt, and it doesn't count", () => {
    const three = YEAR_ROUND_IDS.slice(0, 3);
    const lib = fixture({ approve: three, reject: [three[0]!] });
    expect([li(lib, three[0]!).status, officialEligible(li(lib, three[0]!), TODAY), practiceUsable(li(lib, three[0]!))]).toEqual(["rejected", false, false]);
    expectRefused(room("cup", lib), 2, 3);
  });

  it("the test mode labels its records truthfully, and a raw label still approves nothing by itself", () => {
    const lib = fixture({ testMode: true, raw: { "dg-001": "approved" } });
    expect([li(lib, "dg-005").status, li(lib, "dg-005").approval?.reviewer]).toEqual(["approved", "TEST MODE (not a human review)"]);
    expect([li(lib, "dg-001").status, li(lib, "dg-001").approval?.reviewer]).toEqual(["approved", "TEST MODE (not a human review)"]);
  });
});

describe("the round count: one approved unused prompt per round, 3 to 5 from the final roster (D-S1217-02)", () => {
  // Two teams dealt for the game (no night teams): their sizes don't depend on the seed.
  for (const [players, rounds] of [[4, 3], [8, 4], [9, 5], [10, 5]] as const) {
    it(`${players} players in two dealt teams: ${rounds} rounds; ${rounds - 1} approved is refused, ${rounds} deals exactly them`, () => {
      const approved = YEAR_ROUND_IDS.slice(0, rounds);
      const short = room("cup", fixture({ approve: approved.slice(0, rounds - 1) }), players);
      expectRefused(short, rounds - 1, rounds);
      const r = room("cup", fixture({ approve: approved }), players);
      expect(drawView(r)).toEqual({ available: rounds, needed: rounds });
      const { game, err } = officialStart(r);
      expect(err).toBeUndefined();
      expect([game!.official, game!.status]).toEqual([true, "briefing"]);
      const st = tdState(r, game!.id);
      expect(teamDrawRoundCount(st.teams, st.players)).toBe(rounds);
      expect(st.prompts.map((p) => p.id).sort()).toEqual([...approved].sort());
    });
  }

  it("the night's teams decide it: six players as 4 + 2 need four rounds (two dealt teams of three would need three)", () => {
    const r = room("cup", fixture({ approve: YEAR_ROUND_IDS.slice(0, 3) }), 6);
    expect(drawView(r)).toEqual({ available: 3, needed: 3 });
    const t = r.engine.makeTeams(r.host, 2, 5);
    const [a, b] = t.list.map((x) => x.id) as [string, string];
    r.ids.forEach((p, i) => r.engine.moveToTeam(r.host, p, i < 4 ? a : b));
    expectRefused(r, 3, 4);
    r.engine.content = fixture({ approve: YEAR_ROUND_IDS.slice(0, 4) });
    expect(drawView(r)).toEqual({ available: 4, needed: 4 });
    const { game } = officialStart(r);
    expect(tdState(r, game!.id).prompts).toHaveLength(4);
  });

  it("the lobby's count follows the roster: more players can need more rounds", () => {
    const r = room("cup", fixture({ approve: YEAR_ROUND_IDS.slice(0, 3) }), 4);
    expect(drawView(r)).toEqual({ available: 3, needed: 3 });
    for (const name of ["Zawadi", "Juma", "Neema", "Otieno"]) r.ids.push(r.engine.join(name).player.id);
    expect(drawView(r)).toMatchObject({ available: 3, needed: 4, message: expect.stringMatching(/this game has 4 rounds/) });
    // Not a Cup: no such view.
    expect((room("casual", fixture()).engine.project("tv") as Json)["officialContent"]).toBeUndefined();
    // The TV gets counts only, never a prompt.
    expect(JSON.stringify((r.engine.project("tv") as Json)["officialContent"])).not.toMatch(/dg-\d/);
  });
});

describe("one history across both drawing games, swaps included (D-S1217-04)", () => {
  it("a Draw & Guess swap counts: both the word swapped out and the one swapped in are used", () => {
    const r = room("cup", fixture());
    const dg = r.engine.startGame(r.host, "draw-guess", { official: false, seed: 3 });
    expect(dg.official).toBe(false);
    r.readyAll(dg.id);
    const ds = r.engine.games.get(dg.id)!.extra as DrawState;
    const out = ds.prompts[ds.turns[0]!.promptIdx]!.id;
    expect(r.send(ds.turns[0]!.drawer, dg.id, "draw-swap").accepted).toBe(true);
    const into = ds.prompts[ds.turns[0]!.promptIdx]!.id;
    expect(drawModule.contentIds(ds)).toEqual(expect.arrayContaining([out, into]));
    r.engine.games.get(dg.id)!.status = "finished";
    const fresh = ALL_IDS.filter((id) => !drawModule.contentIds(ds).includes(id)).slice(0, 2);
    // Four approved: the two swap words and two fresh. Only the fresh ones are unused.
    r.engine.content = fixture({ approve: [out, into, ...fresh] });
    expectRefused(r, 2, 3);
    r.engine.content = fixture({ approve: [out, into, ...ALL_IDS.filter((id) => !drawModule.contentIds(ds).includes(id)).slice(0, 3)] });
    const { game } = officialStart(r);
    expect(tdState(r, game!.id).prompts.some((p) => p.id === out || p.id === into)).toBe(false);
  });

  it("a Practice Team Draw's words count too (dealt, not selected); Official words then stay out of Draw & Guess", () => {
    const r = room("cup", fixture());
    const p = r.engine.startGame(r.host, "team-draw", { official: false, seed: 4 });
    r.readyAll(p.id);
    const practiced = tdState(r, p.id).prompts.map((x) => x.id);
    expect(Object.keys(r.engine.contentUsage)).toEqual([]); // dealt outside the selection: no usage record
    playThrough(r, p.id);
    const fresh = ALL_IDS.filter((id) => !practiced.includes(id));
    r.engine.content = fixture({ approve: [...practiced, ...fresh.slice(0, 2)] });
    expectRefused(r, 2, 3);
    r.engine.content = fixture({ approve: [...practiced, ...fresh.slice(0, 3)] });
    const { game } = officialStart(r);
    const official = tdState(r, game!.id).prompts.map((x) => x.id);
    expect(official.sort()).toEqual(fresh.slice(0, 3).sort());
    r.readyAll(game!.id);
    playThrough(r, game!.id);
    // A later Draw & Guess deals neither game's words first.
    const dg = r.engine.startGame(r.host, "draw-guess", { official: false, seed: 4 });
    r.readyAll(dg.id);
    const dealt = drawModule.contentIds(r.engine.games.get(dg.id)!.extra as DrawState);
    expect(dealt.some((id) => practiced.includes(id) || official.includes(id))).toBe(false);
  });

  it("two Official games never share a word: with five approved, the second needs three and finds two", () => {
    const r = room("cup", fixture({ approve: YEAR_ROUND_IDS.slice(0, 5) }));
    const { game } = officialStart(r);
    r.readyAll(game!.id);
    expect(tdState(r, game!.id).prompts.every((x) => (r.engine.contentUsage[x.id] ?? []).length === 1)).toBe(true);
    playThrough(r, game!.id);
    expectRefused(r, 2, 3);
  });
});

describe("seasons (D-S1217-03, provisional)", () => {
  it("a Cup deals every prompt, as it always has: approved Christmas prompts count toward Official", () => {
    const r = room("cup", fixture({ approve: XMAS_IDS }));
    const { game } = officialStart(r);
    expect(tdState(r, game!.id).prompts.map((p) => p.id).sort()).toEqual([...XMAS_IDS].sort());
  });

  it("casual rooms keep the session's rules: Everyday never deals Christmas; Christmas deals its three first", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = room("casual", fixture());
      const g = r.engine.startGame(r.host, "team-draw", { official: false, seed, season: "everyday" });
      expect(tdState(r, g.id).prompts.some((p) => XMAS_IDS.includes(p.id))).toBe(false);
      const x = room("casual", fixture());
      x.engine.setContentSeason(x.host, "christmas", x.engine.session.revision);
      const gx = x.engine.startGame(x.host, "team-draw", { official: false, seed, season: "christmas" });
      expect(tdState(x, gx.id).prompts.map((p) => p.id).sort()).toEqual([...XMAS_IDS].sort());
    }
  });

  it("Practice in a Cup keeps every non-rejected prompt, approved or not", () => {
    const r = room("cup", fixture({ reject: ALL_IDS.slice(3) })); // only dg-001..003 are left
    const g = r.engine.startGame(r.host, "team-draw", { official: false, seed: 1 });
    expect(tdState(r, g.id).prompts.map((p) => p.id).sort()).toEqual(["dg-001", "dg-002", "dg-003"]);
  });
});

describe("frozen at the briefing; re-checked at play; running games keep their copy", () => {
  const THREE = YEAR_ROUND_IDS.slice(0, 3);

  it("the chosen ids and hashes are frozen at the briefing; usage is recorded once, when play begins", () => {
    const lib = fixture({ approve: THREE });
    const r = room("cup", lib);
    const { game } = officialStart(r);
    const st = tdState(r, game!.id);
    expect(game!.pendingContent?.items.map((x) => [x.itemId, x.hash])).toEqual(st.prompts.map((p) => [p.id, li(lib, p.id).hash]));
    expect(game!.pendingContent?.mode).toBe("official");
    expect(Object.keys(r.engine.contentUsage)).toEqual([]);
    r.readyAll(game!.id);
    expect(r.engine.games.get(game!.id)!.status).toBe("playing");
    expect(THREE.map((id) => (r.engine.contentUsage[id] ?? []).map((u) => u.mode))).toEqual([["official"], ["official"], ["official"]]);
  });

  const changes: [string, () => ContentLibrary][] = [
    ["an approval revoked (the record withdrawn)", () => fixture({ approve: THREE.slice(1) })],
    ["the approvals file removed, with a raw approved label left", () => fixture({ noApprovalsFile: true, raw: Object.fromEntries(THREE.map((id) => [id, "approved"])) })],
    ["a word edited (its approval now stale)", () => fixture({ approve: THREE, edit: (it) => { if (it.id === THREE[1]) it.word = "teapot"; } })],
    ["a prompt rejected", () => fixture({ approve: THREE, reject: [THREE[2]!] })],
  ];
  for (const [why, next] of changes) {
    it(`${why} between the briefing and play: the briefing ends; no game, no usage, no score`, () => {
      const r = room("cup", fixture({ approve: THREE }));
      const { game } = officialStart(r);
      r.engine.content = next();
      r.readyAll(game!.id);
      expect(r.engine.games.get(game!.id)).toBeUndefined();
      expect(Object.keys(r.engine.contentUsage)).toEqual([]);
      expect(Object.values(((r.engine.project("tv") as Json)["officialStandings"] ?? {}) as Record<string, number>).every((v) => v === 0)).toBe(true);
      // The lobby says why now, and Practice still starts.
      expect((drawView(r)?.["available"] as number) < 3).toBe(true);
      const p = r.engine.startGame(r.host, "team-draw", { official: false, seed: 2 });
      expect([p.official, p.status]).toEqual([false, "briefing"]);
    });
  }

  it("a briefing saved and restored (a server restart) re-checks and plays exactly its frozen prompts", () => {
    const lib = fixture({ approve: THREE });
    const r = room("cup", lib);
    const { game } = officialStart(r);
    const frozen = tdState(r, game!.id).prompts;
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(r.engine.toJSON())));
    restored.clock = r.engine.clock;
    restored.content = lib;
    for (const p of r.ids) restored.markConnected(p);
    for (const p of r.ids) restored.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: restored.id, gameInstanceId: game!.id, action: "briefing-ready", payload: { ready: true } }, p);
    expect(restored.games.get(game!.id)!.status).toBe("playing");
    expect((restored.games.get(game!.id)!.extra as TeamDrawState).prompts).toEqual(frozen);
    expect(THREE.every((id) => (restored.contentUsage[id] ?? []).length === 1)).toBe(true);
  });

  it("a running Official game keeps its words when the library changes; it finishes, counts, and scores by them", () => {
    const r = room("cup", fixture({ approve: THREE }));
    const { game } = officialStart(r);
    r.readyAll(game!.id);
    const before = JSON.stringify(tdState(r, game!.id).prompts);
    r.engine.content = fixture({ reject: THREE, edit: (it) => { it.word = `${it.word} (edited)`; } });
    expect(JSON.stringify(tdState(r, game!.id).prompts)).toBe(before);
    playThrough(r, game!.id);
    const g = r.engine.games.get(game!.id)!;
    expect(g.outcome?.countsOfficially).toBe(true);
    const standings = ((r.engine.project("tv") as Json)["officialStandings"] ?? {}) as Record<string, number>;
    expect(Object.values(standings).some((v) => v > 0)).toBe(true);
  });
});

describe("secrecy in an Official game (unchanged)", () => {
  it("only each team's drawer gets the word; guessers get their own team's drawing; the TV gets neither until the reveal", () => {
    const r = room("cup", fixture({ approve: YEAR_ROUND_IDS.slice(0, 3) }), 6);
    const { game } = officialStart(r);
    r.readyAll(game!.id);
    const gid = game!.id;
    const st = tdState(r, gid);
    const word = st.prompts[0]!.word;
    const entries = Object.entries(st.rounds[0]!);
    entries.forEach(([, tr], i) => expect(r.send(tr.drawer, gid, "team-draw-strokes", { round: 0, pieces: [{ s: i + 1, c: 0, w: 1, p: [10, 10, 50, 50] }] }).accepted).toBe(true));
    const stateOf = (pid?: string) => pid
      ? (r.engine.project("player", pid) as { myGames: { id: string; state: Json }[] }).myGames.find((x) => x.id === gid)!.state
      : (r.engine.project("tv") as { games: { id: string; state: Json }[] }).games.find((x) => x.id === gid)!.state;
    for (const p of r.ids) {
      const team = st.teams.members[p]!;
      const isDrawer = st.rounds[0]![team]!.drawer === p;
      const v = stateOf(p);
      expect(JSON.stringify(v).includes(`"${word}"`), `${p} drawer=${isDrawer}`).toBe(isDrawer);
      const own = entries.findIndex(([t]) => t === team) + 1;
      expect((v["pieces"] as { s: number }[]).map((x) => x.s)).toEqual([own]);
    }
    const tv = JSON.stringify(stateOf());
    expect(tv).not.toContain(`"${word}"`);
    expect(tv).not.toMatch(/"pieces"/);
    // The same holds for a phone that reloads (a fresh projection) mid-round.
    const guesserId = r.ids.find((p) => st.rounds[0]![st.teams.members[p]!]!.drawer !== p)!;
    expect(JSON.stringify(stateOf(guesserId))).not.toContain(`"${word}"`);
  });
});

describe("over HTTP: the refusal and the shared plan (D-S1216-04 applied to Team Draw)", () => {
  it("shipped content refuses an Official start with 409 and the reason; the plan shows Practice; test mode allows both", async () => {
    const { Harness } = await import("./helpers/harness.js");
    for (const [lib, official] of [[loadContent(), false], [loadContent(undefined, { testApproveProvisional: true }), true]] as const) {
      const h = new Harness(undefined, { content: lib });
      try {
        await h.start();
        await h.createRoom("Draw Cup");
        const host = await h.join("Host", { host: true });
        const guests = [await h.join("Amina"), await h.join("Baraka"), await h.join("Wanjiru")];
        expect((await h.post(`/rooms/${h.roomId}/plan`, { gameId: "team-draw", official: true }, host.token)).status).toBe(200);
        for (const p of [await h.projection(host), await h.projection(guests[0]!), await h.tv()]) {
          expect(p["upNext"]).toEqual({ gameId: "team-draw", official });
          expect((p["officialContent"] as Json)["team-draw"]).toMatchObject(official ? { available: 3, needed: 3 } : { available: 0, needed: 3 });
        }
        const start = await h.post(`/rooms/${h.roomId}/games`, { gameId: "team-draw", official: true }, host.token);
        if (official) expect(start.status).toBe(201);
        else {
          expect([start.status, start.body["code"], start.body["available"], start.body["needed"]]).toEqual([409, "CONTENT_EXHAUSTED", 0, 3]);
          expect(start.body["error"]).toMatch(/^Team Draw counts only with drawing words a person has approved, and this Cup has 0 unused approved words \(this game has 3 rounds: one word each\)\. Play it as Practice instead/);
          expect((await h.post(`/rooms/${h.roomId}/games`, { gameId: "team-draw", official: false }, host.token)).status).toBe(201);
        }
      } finally { await h.dispose(); }
    }
  });
});

describe("the review inventory (docs/stage12/stage1217-draw-prompts-inventory.md)", () => {
  it("lists every prompt with its current approval hash and accepted words, so an edit without a regenerated inventory is caught", () => {
    const doc = readFileSync(new URL("../docs/stage12/stage1217-draw-prompts-inventory.md", import.meta.url), "utf8");
    const lib = loadContent();
    const listed = [...doc.matchAll(/^### (dg-\d{3}) · /gm)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...ALL_IDS].sort());
    for (const x of lib.byGame.get("draw-prompts") ?? []) {
      const block = doc.slice(doc.indexOf(`### ${x.item.id} · `)).split("\n### ")[0]!;
      const it = x.item as unknown as Item;
      expect(block, it.id).toContain(`**Approval hash** \`${x.hash}\``);
      expect(block, it.id).toContain(`**Accepted** ${[it.word, ...(it.alts ?? [])].map((a) => `"${a}"`).join(", ")}`);
      expect(block, it.id).toContain(`**Season** ${it.season ?? "year-round"}`);
    }
    const approved = (lib.byGame.get("draw-prompts") ?? []).filter((x) => x.status === "approved").length;
    expect(doc).toContain(approved === 0 ? "**No prompt is approved**" : `**${approved} of `);
  });
});
