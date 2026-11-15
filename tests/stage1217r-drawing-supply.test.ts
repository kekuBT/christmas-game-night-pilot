/**
 * Stage 12.17-R (review 6898755998, R1; docs/stage12/stage1217r.md; D-S1217R-01): a drawing game never starts without a
 * playable prompt for every turn or round.
 *
 * The pools here come from a temporary copy of the shipped packs in which the review rejects every prompt but a few: the
 * same way a real editorial rejection shrinks the shared pool. Nothing is approved; the shipped files are never touched.
 */
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { drawPromptPool } from "../src/content/materialize.js";
import { ContentShortage, RoomEngine } from "../src/server/room.js";
import { drawModule, drawPromptSupply, type DrawState } from "../src/games/modules/draw.js";
import { teamDrawModule, teamDrawRoundCount, type TeamDrawState } from "../src/games/modules/teamDraw.js";
import { Harness } from "./helpers/harness.js";

type Json = Record<string, unknown>;
type Item = Json & { id: string; word: string; season?: string; review: { status: string } };
const SHIPPED = (JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", "draw-prompts.json"), "utf8")) as { items: Item[] }).items;
const YEAR_ROUND = SHIPPED.filter((i) => !i.season).map((i) => i.id);
const XMAS = SHIPPED.filter((i) => i.season === "christmas").map((i) => i.id);

const trees: string[] = [];
const cleanup = () => { for (const d of trees.splice(0)) rmSync(d, { recursive: true, force: true }); };
afterEach(cleanup);
afterAll(cleanup);

/** The shipped library with every drawing prompt rejected except `keep` (a review decision, not a deletion). */
function libraryKeeping(keep: readonly string[]): ContentLibrary {
  const dir = mkdtempSync(join(tmpdir(), "mz-s1217r-"));
  trees.push(dir);
  mkdirSync(join(dir, "packs"), { recursive: true });
  cpSync(join(DEFAULT_CONTENT_DIR, "reference"), join(dir, "reference"), { recursive: true });
  for (const file of readdirSync(join(DEFAULT_CONTENT_DIR, "packs")).filter((f) => f.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", file), "utf8")) as { gameId: string; items: Item[] };
    if (pack.gameId === "draw-prompts") for (const item of pack.items) if (!keep.includes(item.id)) item.review = { status: "rejected" };
    writeFileSync(join(dir, "packs", file), JSON.stringify(pack));
  }
  writeFileSync(join(dir, "approvals.json"), JSON.stringify({ schemaVersion: 1, approvals: [] }));
  return loadContent(dir);
}

const NAMES = ["Keku", "Amina", "Baraka", "Wanjiru", "Zawadi", "Juma"];
function room(kind: "cup" | "casual", lib: ContentLibrary, n: number) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine(kind === "cup" ? "Family Cup" : "Game night", { kind, timing: 2 });
  engine.clock = () => t;
  engine.content = lib;
  const ids = [engine.join(NAMES[0]!, { asHost: true }).player.id];
  for (const name of NAMES.slice(1, n)) ids.push(engine.join(name).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  return { engine, ids, host: ids[0]!, send, advance: (ms: number) => { t += ms; engine.tick(); } };
}
type Room = ReturnType<typeof room>;
const christmas = (r: Room) => r.engine.setContentSeason(r.host, "christmas", r.engine.session.revision);

/** Everything a refused start must leave as it was. */
const snapshot = (r: Room) => JSON.stringify({ games: [...r.engine.games.keys()], usage: r.engine.contentUsage, ledger: r.engine.ledger.length, session: r.engine.session.revision });
function expectRefused(r: Room, gameId: "draw-guess" | "team-draw", available: number, needed: number, message: RegExp) {
  const before = snapshot(r);
  let err: unknown;
  try { r.engine.startGame(r.host, gameId, { official: false, seed: 7 }); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(ContentShortage);
  const e = err as ContentShortage;
  expect([e.code, e.available, e.needed]).toEqual(["CONTENT_EXHAUSTED", available, needed]);
  expect(e.message).toMatch(message);
  expect(snapshot(r)).toBe(before); // no game, no usage history, no score, nothing in the session
}

describe("the reviewer's reproduction: a pool short after the content filter", () => {
  it("the module itself no longer starts three turns with one Everyday prompt (it used to, and turn 2's view threw)", () => {
    expect(() => drawModule.init({ players: ["a", "b", "c"], seed: 42, season: "everyday", drawPool: [{ id: "draw-one", word: "kite" }] } as never))
      .toThrowError(/needs 3 prompts for 3 turns; only 1 can be dealt/);
    // A non-empty Christmas-only pool used to pass the emptiness check and filter to zero in Everyday.
    expect(() => drawModule.init({ players: ["a", "b", "c"], seed: 42, season: "everyday", drawPool: [{ id: "x1", word: "tinsel", season: "christmas" }, { id: "x2", word: "sleigh", season: "christmas" }, { id: "x3", word: "elf", season: "christmas" }] } as never))
      .toThrowError(/only 0 can be dealt/);
  });

  it("Team Draw's module refuses fewer dealt prompts than rounds too (outside an Official selection)", () => {
    const teams = { list: [{ id: "t1", name: "Coral" }, { id: "t2", name: "Sun" }], members: { a: "t1", b: "t1", c: "t2", d: "t2" } };
    expect(() => teamDrawModule.init({ players: ["a", "b", "c", "d"], seed: 1, season: "everyday", teams, drawPool: [{ id: "p1", word: "kite" }, { id: "p2", word: "boat" }] } as never))
      .toThrowError(/Team Draw needs 3 prompts for 3 rounds; only 2 can be dealt/);
  });

  it("the supply counts what the content mode may deal: year-round in Everyday; everything at Christmas and in a Cup", () => {
    const lib = libraryKeeping([YEAR_ROUND[0]!, XMAS[0]!, XMAS[1]!]);
    const pool = drawPromptPool(lib);
    expect(pool).toHaveLength(3); // the rejected ones never reach the pool
    expect([drawPromptSupply(pool, "everyday"), drawPromptSupply(pool, "christmas"), drawPromptSupply(pool, undefined)]).toEqual([1, 3, 3]);
  });
});

describe("Draw & Guess through the room's start path", () => {
  it("one Everyday prompt for three players: refused with the reason; nothing created; another game still starts", () => {
    const r = room("casual", libraryKeeping([YEAR_ROUND[0]!]), 3);
    expectRefused(r, "draw-guess", 1, 3, /^Draw & Guess needs 3 drawing words \(one for each of the 3 turns\), and there is only 1 Everyday drawing word to deal, so nothing started\. Choose another game\.$/);
    // The lobby is still usable: the next start gets the same game number a refusal never spent.
    const other = r.engine.startGame(r.host, "math-mayhem", { official: false, seed: 1 });
    expect(other.id).toBe("game-1");
  });

  it("a non-empty Christmas-only pool under Everyday: refused (none to deal), with the way out; at Christmas it starts", () => {
    const r = room("casual", libraryKeeping(XMAS.slice(0, 3)), 3);
    expectRefused(r, "draw-guess", 0, 3, /there are no Everyday drawing words to deal, so nothing started\. Choose another game, or switch to Christmas content\.$/);
    christmas(r);
    const g = r.engine.startGame(r.host, "draw-guess", { official: false, seed: 7, season: "christmas" });
    expect((r.engine.games.get(g.id)!.extra as DrawState).prompts.map((p) => p.id).sort()).toEqual(XMAS.slice(0, 3).sort());
  });

  it("in a Cup game (no season) every non-rejected prompt counts; two for three players is still refused", () => {
    const r = room("cup", libraryKeeping([YEAR_ROUND[0]!, XMAS[0]!]), 3);
    expectRefused(r, "draw-guess", 2, 3, /^Draw & Guess needs 3 drawing words .* there are only 2 drawing words to deal/);
  });

  it("exactly enough and no swap reserve: no swap, every turn's view works for everyone, and the game ends with results", () => {
    const r = room("casual", libraryKeeping(YEAR_ROUND.slice(0, 3)), 3);
    const g = r.engine.startGame(r.host, "draw-guess", { official: false, seed: 11 });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    const ds = () => r.engine.games.get(g.id)!.extra as DrawState;
    expect([ds().prompts.length, ds().turns.length, ds().reserve]).toEqual([3, 3, 3]);
    for (let turn = 0; turn < 3; turn++) {
      for (let i = 0; i < 60 && ds().turn !== turn; i++) r.advance(5_000);
      expect([ds().turn, ds().phase]).toEqual([turn, "draw"]);
      const t = ds().turns[turn]!;
      // No spare word: a swap is refused, the drawer keeps the dealt one.
      expect(r.send(t.drawer, g.id, "draw-swap").accepted).toBe(false);
      expect(r.send(t.drawer, g.id, "draw-strokes", { pieces: [{ s: 1, c: 0, w: 1, p: [100, 100, 400, 400] }] }).accepted).toBe(true);
      for (const p of r.ids) expect(() => r.engine.project("player", p)).not.toThrow();
      expect(() => r.engine.project("tv")).not.toThrow();
      const word = ds().prompts[t.promptIdx]!.word;
      for (const p of r.ids.filter((x) => x !== t.drawer)) expect(r.send(p, g.id, "draw-guess", { text: word }).accepted).toBe(true);
      for (const p of r.ids) expect(() => r.engine.project("player", p)).not.toThrow(); // the reveal, with its word
    }
    for (let i = 0; i < 60 && r.engine.games.get(g.id)!.status !== "finished"; i++) r.advance(5_000);
    expect(r.engine.games.get(g.id)!.status).toBe("finished");
    for (const p of r.ids) expect(() => r.engine.project("player", p)).not.toThrow(); // the recap of all three words
    expect(Object.values(r.engine.games.get(g.id)!.rawScores ?? {}).some((v) => v > 0)).toBe(true);
  });
});

describe("Team Draw (Practice and casual) through the room's start path", () => {
  it("two prompts for three rounds: refused; three: it starts, one prompt per round", () => {
    const r = room("casual", libraryKeeping(YEAR_ROUND.slice(0, 2)), 4);
    const rounds = teamDrawRoundCount((r.engine as unknown as { teamsForTeamGame(g: string, p: string[], s: number): never }).teamsForTeamGame("team-draw", r.ids, 0), r.ids);
    expect(rounds).toBe(3);
    expectRefused(r, "team-draw", 2, 3, /^Team Draw needs 3 drawing words \(one for each of the 3 rounds\), and there are only 2 Everyday drawing words to deal/);
    r.engine.content = libraryKeeping(YEAR_ROUND.slice(0, 3));
    const g = r.engine.startGame(r.host, "team-draw", { official: false, seed: 7 });
    expect((r.engine.games.get(g.id)!.extra as TeamDrawState).prompts).toHaveLength(3);
  });

  it("a Christmas-only pool under Everyday: refused, with the way out", () => {
    const r = room("casual", libraryKeeping(XMAS.slice(0, 4)), 4);
    expectRefused(r, "team-draw", 0, 3, /no Everyday drawing words .* switch to Christmas content\.$/);
  });

  it("a Practice Team Draw in a Cup is refused the same way; an Official one keeps its own exact-record check (unchanged)", () => {
    const r = room("cup", libraryKeeping(YEAR_ROUND.slice(0, 2)), 4);
    expectRefused(r, "team-draw", 2, 3, /^Team Draw needs 3 drawing words/);
    let err: unknown;
    try { r.engine.startGame(r.host, "team-draw", { official: true, seed: 7 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ContentShortage);
    expect((err as ContentShortage).message).toMatch(/^Team Draw counts only with drawing words a person has approved/);
  });
});

describe("over HTTP: the lobby gets a plain refusal and can try again", () => {
  it("409 CONTENT_EXHAUSTED with the reason; then, with enough words, the same start succeeds", async () => {
    const h = await new Harness(undefined, { content: libraryKeeping([YEAR_ROUND[0]!]) }).start();
    try {
      await h.createRoom("Shortage");
      const host = await h.join("Keku", { host: true });
      await h.join("Amina"); await h.join("Baraka");
      const res = await h.startGame(host, "draw-guess", { official: false, seed: 3 });
      expect([res.status, res.body["code"], res.body["available"], res.body["needed"]]).toEqual([409, "CONTENT_EXHAUSTED", 1, 3]);
      expect(String(res.body["error"])).toMatch(/^Draw & Guess needs 3 drawing words/);
      const lobby = await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": host.token });
      expect((lobby.body["games"] as unknown[]).length).toBe(0);
      (h.server as unknown as { content: ContentLibrary }).content = libraryKeeping(YEAR_ROUND.slice(0, 3));
      for (const r of (h.server as unknown as { rooms: Map<string, RoomEngine> }).rooms.values()) r.content = libraryKeeping(YEAR_ROUND.slice(0, 3));
      const again = await h.startGame(host, "draw-guess", { official: false, seed: 3 });
      expect(again.status).toBe(201);
    } finally { await h.dispose(); }
  });
});
