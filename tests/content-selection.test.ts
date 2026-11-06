/**
 * Sprint 4, CP3: server-authoritative content selection.
 * Fixture libraries make the exact counts controllable; the shipped
 * library's own approval state is covered by tests/content.test.ts.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { itemHash, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { selectContent, type UsageHistory } from "../src/content/select.js";
import { ContentShortage, RoomEngine } from "../src/server/room.js";
import { FakeClock, Harness, myGame, type Json } from "./helpers/harness.js";

/** A library of `n` approved official trivia items (difficulty spread 1/2/3) plus `practice` practice-only ones. */
function fixtureLib(n: number, practice = 0, opts: { connections?: number } = {}): ContentLibrary {
  const dir = mkdtempSync(join(tmpdir(), "mz-sel-"));
  mkdirSync(join(dir, "packs"));
  const base = (id: string, d: number, elig: string, status = "provisional") => ({ id, difficulty: d, category: `Cat${d}`, language: "en", eligibility: elig, review: { status }, source: { kind: "common-knowledge" }, tags: [] });
  const trivia = [
    ...Array.from({ length: n }, (_, i) => ({ ...base(`trv-off-${i + 1}`, (i % 3) + 1, "official"), prompt: `Official question number ${i + 1} about topic ${i * 7}?`, options: ["W", "X", "Y", "Z"], answer: "X", explanation: "x" })),
    ...Array.from({ length: practice }, (_, i) => ({ ...base(`trv-prc-${i + 1}`, 1, "practice"), prompt: `Practice question ${i + 1} on subject ${i * 11}?`, options: ["W", "X", "Y", "Z"], answer: "Y", explanation: "y" })),
  ];
  const boards = Array.from({ length: opts.connections ?? 0 }, (_, b) => ({
    ...base(`con-fx-${b + 1}`, 2, "official"),
    groups: [1, 2, 3, 4].map((g) => ({ name: `Group ${b}-${g}`, words: [1, 2, 3, 4].map((w) => `W${b}x${g}x${w}`), level: g })),
    redHerrings: "none",
  }));
  writeFileSync(join(dir, "packs", "trivia.json"), JSON.stringify({ schemaVersion: 1, packId: "fx-trivia", gameId: "trivia", version: "1.0.0", title: "fx", language: "en", items: trivia }));
  if (boards.length) writeFileSync(join(dir, "packs", "con.json"), JSON.stringify({ schemaVersion: 1, packId: "fx-con", gameId: "word-connections", version: "1.0.0", title: "fx", language: "en", items: boards }));
  const approvals = [...trivia, ...boards].filter((t) => t.eligibility === "official").map((t) => ({ itemId: t.id, hash: itemHash(t.id.startsWith("con") ? "word-connections" : "trivia", t as never), reviewer: "Fixture editor", date: "2026-11-06" }));
  writeFileSync(join(dir, "approvals.json"), JSON.stringify({ schemaVersion: 1, approvals }));
  const lib = loadContent(dir);
  expect(lib.problems).toEqual([]);
  return lib;
}
function room(lib: ContentLibrary) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine("Sel");
  engine.clock = () => t;
  engine.content = lib;
  const host = engine.join("Ada", { asHost: true }).player.id;
  const bea = engine.join("Bea").player.id;
  /** Play a trivia game to its end (deadline) and return its item ids. */
  const play = (official: boolean): string[] => {
    const g = engine.startGame(host, "trivia", { official, seed: 1 });
    const ids = (g.extra as { questions: { id: string }[] }).questions.map((q) => q.id);
    t = g.deadlineAt! + 1;
    engine.tick();
    return ids;
  };
  return { engine, host, bea, play, advance: () => engine.advanceDay(host) };
}

describe("no repeats within a Cup", () => {
  it("seven days of official Trivia never repeat an item", () => {
    const r = room(fixtureLib(70));
    const seen: string[] = [];
    for (let day = 1; day <= 7; day++) {
      seen.push(...r.play(true));
      if (day < 7) r.advance();
    }
    expect(seen).toHaveLength(70);
    expect(new Set(seen).size).toBe(70);
  });

  it("each official game's difficulty mix mirrors the remaining pool, so no day is easier", () => {
    const r = room(fixtureLib(60));
    const lib = r.engine.content;
    for (let day = 1; day <= 6; day++) {
      const ids = r.play(true);
      const diffs = ids.map((id) => lib.items.get(id)!.item.difficulty);
      for (const d of [1, 2, 3]) {
        const n = diffs.filter((x) => x === d).length;
        expect(n, `day ${day} difficulty ${d}`).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(4);
      }
      r.advance();
    }
  });

  it("when content runs out the game is refused with a plain reason; nothing is reserved", () => {
    const r = room(fixtureLib(15));
    r.play(true);
    const before = JSON.stringify(r.engine.contentUsage);
    let err: unknown;
    try { r.engine.startGame(r.host, "trivia", { official: true }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ContentShortage);
    expect((err as ContentShortage).message).toMatch(/Not enough unused approved content left in this Cup for an official game \(5 left, 10 needed\)/);
    expect(JSON.stringify(r.engine.contentUsage)).toBe(before);
    expect([...r.engine.games.values()].filter((g) => g.status === "playing")).toHaveLength(0);
  });

  it("separate Cups (rooms) keep independent histories", () => {
    const lib = fixtureLib(10);
    const a = room(lib);
    const b = room(lib);
    expect(new Set(a.play(true))).toEqual(new Set(b.play(true)));
  });
});

describe("practice can never preview official content", () => {
  it("practice uses practice-only content first; those items never appear officially", () => {
    const r = room(fixtureLib(30, 12));
    const practiceIds = r.play(false);
    expect(practiceIds.every((id) => id.startsWith("trv-prc-"))).toBe(true);
    const official = [...r.play(true), ...r.play(true), ...r.play(true)];
    expect(official.some((id) => practiceIds.includes(id))).toBe(false);
    expect(new Set(official).size).toBe(30);
  });

  it("with no practice-only content left, practice retires the official items it uses: they are never asked officially", () => {
    const r = room(fixtureLib(30, 0));
    const practiceIds = r.play(false);
    expect(practiceIds.every((id) => id.startsWith("trv-off-"))).toBe(true);
    const official = [...r.play(true), ...r.play(true)];
    expect(official.some((id) => practiceIds.includes(id))).toBe(false);
    expect(() => r.play(true)).toThrow(ContentShortage); // 30 - 10 retired - 20 used
  });

  it("practice repeats only when it must, least recently used first", () => {
    const r = room(fixtureLib(10, 4));
    r.play(true); // all 10 official used
    const p1 = r.play(false);
    expect(new Set(p1).size).toBe(10); // 4 practice + 6 already-used official, no repeats yet
  });
});

describe("determinism, atomicity and persistence", () => {
  it("the same saved state and seed select the same items", () => {
    const lib = fixtureLib(40);
    const req = { lib, gameId: "trivia" as const, count: 10, mode: "official" as const, cupId: "cup-fixed-1234", usage: {} as UsageHistory, seq: 3, today: "2026-11-06" };
    const a = selectContent(req);
    const b = selectContent({ ...req, usage: {} });
    expect(a.ok && b.ok && a.items.map((i) => i.item.id)).toEqual(b.ok && b.items.map((i) => i.item.id));
    const c = selectContent({ ...req, seq: 4 });
    expect(c.ok && c.items.map((i) => i.item.id)).not.toEqual(a.ok && a.items.map((i) => i.item.id));
  });

  let h: Harness | undefined;
  afterEach(async () => { await h?.dispose(); h = undefined; });

  it("usage history survives a restart: the next game after it does not repeat", async () => {
    const clock = new FakeClock();
    h = await new Harness(undefined, { clock, content: fixtureLib(20) }).start();
    await h.createRoom();
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const g1 = (await h.startGame(ada, "trivia", { seed: 1 })).body["gameId"] as string;
    const first = (h.game(g1).extra as { questions: { id: string }[] }).questions.map((q) => q.id);
    clock.advance(10 * 60_000);
    h.lifecycleTick();
    await h.restart();
    await h.connect(ada);
    await h.connect(bea);
    expect(Object.keys(h.engine().contentUsage).sort()).toEqual([...first].sort());
    const g2 = (await h.startGame(ada, "trivia", { seed: 2 })).body["gameId"] as string;
    const second = (h.game(g2).extra as { questions: { id: string }[] }).questions.map((q) => q.id);
    expect(second.some((id) => first.includes(id))).toBe(false);
    // And a third official game is refused over HTTP with a clear code.
    clock.advance(10 * 60_000);
    h.lifecycleTick();
    const third = await h.startGame(ada, "trivia", { seed: 3 });
    expect(third.status).toBe(409);
    expect(third.body).toMatchObject({ code: "CONTENT_EXHAUSTED", available: 0, needed: 10 });
  });

  it("two simultaneous start requests reserve content once", async () => {
    h = await new Harness(undefined, { clock: new FakeClock(), content: fixtureLib(30) }).start();
    await h.createRoom();
    const ada = await h.join("Ada", { host: true });
    await h.join("Bea");
    const [a, b] = await Promise.all([h.startGame(ada, "trivia", { seed: 1 }), h.startGame(ada, "trivia", { seed: 2 })]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    const used = Object.values(h.engine().contentUsage);
    expect(used).toHaveLength(10);
    expect(used.every((u) => u.length === 1)).toBe(true);
  });

  it("clients never receive answers, accepted lists or unused content", async () => {
    h = await new Harness(undefined, { clock: new FakeClock(), content: fixtureLib(20, 0, { connections: 2 }) }).start();
    await h.createRoom();
    const ada = await h.join("Ada", { host: true });
    await h.join("Bea");
    const gid = (await h.startGame(ada, "word-connections", { seed: 1 })).body["gameId"] as string;
    const views = JSON.stringify([await h.tv(), await h.projection(ada)]);
    const g = h.game(gid).extra as { board: { categories: { name: string }[] }; boardId: string };
    for (const c of g.board.categories) expect(views).not.toContain(c.name); // group names are answers
    expect(views).not.toContain("trv-off-"); // no unused content ids
    expect(views).not.toContain(g.boardId === "con-fx-1" ? "con-fx-2" : "con-fx-1");
  });
});

describe("Word Connections tiles are never sent in answer order", () => {
  it("a new game's tiles are shuffled; an older game's are too", () => {
    const r = room(fixtureLib(10, 0, { connections: 3 }));
    const g = r.engine.startGame(r.host, "word-connections", { official: true, seed: 5 });
    const view = (r.engine.project("player", r.bea) as { myGames: { state: { tiles: { id: string }[] } }[] }).myGames[0]!.state.tiles;
    const board = (g.extra as { board: { tiles: { id: string; category: string }[] } }).board;
    const groupOf = (id: string) => board.tiles.find((t) => t.id === id)!.category;
    const firstFourSameGroup = view.slice(0, 4).every((t) => groupOf(t.id) === groupOf(view[0]!.id));
    expect(view).toHaveLength(16);
    expect(firstFourSameGroup).toBe(false);
    // A pre-Sprint 4 game (no tileOrder) is still shown in a shuffled, stable order.
    delete (g.extra as { tileOrder?: unknown }).tileOrder;
    const v1 = (r.engine.project("tv") as { games: { state: { tiles: { id: string }[] } }[] }).games[0]!.state.tiles.map((t) => t.id);
    const v2 = (r.engine.project("tv") as { games: { state: { tiles: { id: string }[] } }[] }).games[0]!.state.tiles.map((t) => t.id);
    expect(v1).toEqual(v2);
    expect(v1).not.toEqual(board.tiles.map((t) => t.id));
  });
});

describe("Cups from before Sprint 4 keep their content semantics", () => {
  it("a restored older Cup still uses its built-in packs, not the selection service", () => {
    const lib = fixtureLib(30);
    const r = room(lib);
    const snap = JSON.parse(JSON.stringify(r.engine.toJSON())) as Json;
    delete snap["cup"]; // as written before Sprint 4
    const old = RoomEngine.fromJSON(snap);
    old.content = lib;
    expect(old.cup.origin).toBe("legacy-restored");
    const g = old.startGame(r.host, "trivia", { official: true, seed: 4 });
    const ids = (g.extra as { questions: { id: string }[] }).questions.map((q) => q.id);
    expect(ids.every((id) => /^trivia-\d+$/.test(id))).toBe(true); // the original generator's ids
    expect(old.contentUsage).toEqual({});
  });
});

void myGame;
