// Stage 7.4 (docs/stage7/stage74.md): content variety in solo and casual rooms.
// A casual or solo room deals every practice-usable item it hasn't used, then
// the least recently used; a Family Cup's selection is exactly as before.
// Most tests use a small controlled pool (scripts/lib/small-pool.mjs): one
// practice-only Connections board, two approved official boards, one rejected.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { recordUsage, selectContent, type SelectionRequest, type UsageHistory } from "../src/content/select.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, type SessionAttempt } from "../src/server/room.js";
// @ts-expect-error -- plain .mjs helper shared with the browser driver, no type declarations
import { SMALL_CONNECTIONS_USABLE as SMALL_USABLE, writeSmallPool as writePool } from "../scripts/lib/small-pool.mjs";
const SMALL_CONNECTIONS_USABLE = SMALL_USABLE as string[];
const writeSmallPool = writePool as (dir: string) => unknown;

const TODAY = "2026-11-11";
const POOL_DIR = mkdtempSync(join(tmpdir(), "mz-s74-pool-"));
const POOL = writeSmallPool(POOL_DIR) as { boards: { id: string; words: string[] }[]; questions: { id: string; status: string }[] };
const small = loadContent(POOL_DIR, { testApproveProvisional: false });
const PRACTICE_ONLY = "con-t-practice";
const OFFICIAL = ["con-t-official-a", "con-t-official-b"];
const REJECTED = "con-t-rejected";

/** Deal `n` games one after another as a room does: select, then record the use and move the sequence on. */
function deal(lib: ContentLibrary, roomKind: SelectionRequest["roomKind"], gameId: "word-connections" | "trivia", n: number, opts: { count?: number; usage?: UsageHistory; seq?: number } = {}) {
  const usage = opts.usage ?? {};
  let seq = opts.seq ?? 0;
  const games: string[][] = [];
  for (let i = 0; i < n; i++) {
    const r = selectContent({ lib, gameId, count: opts.count ?? (gameId === "trivia" ? 10 : 1), mode: "practice", roomKind, cupId: "cup-s74-test", usage, seq, today: TODAY });
    if (!r.ok) throw new Error(r.message);
    recordUsage(usage, r.items, { gameInstanceId: `game-${i}`, day: 1, mode: "practice", seq });
    seq += 1;
    games.push(r.items.map((li) => li.item.id));
  }
  return { games, usage, seq };
}
/** Recorded at af39c78 (before Stage 7.4) with the same plans, library and Cup id: a Cup must still give exactly these. */
const CUP_BEFORE_S74 = {
  smallMixed: [["con-t-practice"],["con-t-official-b"],["con-t-practice"],["con-t-official-a"],"REFUSED:insufficient-content",["con-t-official-b"],["trv-t-02","trv-t-06","trv-t-01","trv-t-10","trv-t-03","trv-t-07","trv-t-09","trv-t-05","trv-t-08","trv-t-04"],["trv-t-17","trv-t-22","trv-t-20","trv-t-16","trv-t-11","trv-t-13","trv-t-24","trv-t-23","trv-t-14","trv-t-19"],["trv-t-02","trv-t-10","trv-t-06","trv-t-01","trv-t-07","trv-t-05","trv-t-04","trv-t-08","trv-t-09","trv-t-03"]],
  shippedTestMode: [["con-s4-01"],["con-s4-01"],["trv-scie-015","trv-geog-032","trv-scie-007","trv-fest-106","trv-legacy-04","trv-scie-122","trv-legacy-08","trv-geog-118","trv-lite-051","trv-arts-059"],["trv-geog-121","trv-legacy-04","trv-scie-007","trv-lite-051","trv-arts-059","trv-scie-122","trv-fest-106","trv-scie-015","trv-geog-118","trv-geog-032"],["trv-legacy-08","trv-geog-032","trv-geog-121","trv-arts-059","trv-lite-051","trv-scie-122","trv-scie-007","trv-geog-118","trv-scie-015","trv-legacy-04"],["year-legacy-2","year-legacy-3","year-s4-013","year-s4-030","year-s4-032","year-s4-040","year-s4-008","year-s4-003"],["year-s4-030","year-legacy-2","year-s4-013","year-s4-040","year-s4-003","year-s4-032","year-legacy-3","year-s4-008"]],
  shippedNormal: [["con-s4-02"],["con-legacy-1"],["con-s4-04"],["trv-ever-096","trv-scie-016","trv-scie-127","trv-natu-067","trv-food-076","trv-hist-035","trv-scie-009","trv-natu-070","trv-natu-068","trv-fest-103"],["trv-legacy-03","trv-legacy-12","trv-legacy-09","trv-legacy-08","trv-legacy-07","trv-legacy-11","trv-legacy-05","trv-legacy-04","trv-legacy-10","trv-legacy-01"]],
} as const;
type ContentGameIdLike = "word-connections" | "trivia" | "guess-the-year";

const boardId = (engine: RoomEngine, gid: string) => (engine.games.get(gid)!.extra as { boardId: string }).boardId;
const restart = (engine: RoomEngine) => RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>);

describe("selection: casual and solo rooms deal unused content first, then the least recently used (V1)", () => {
  for (const kind of ["casual", "solo"] as const) {
    it(`${kind}: the practice-only board and both approved official boards come before any repeat; the rejected one never`, () => {
      const { games } = deal(small, kind, "word-connections", 3);
      const firstThree = games.map((g) => g[0]!);
      expect(new Set(firstThree)).toEqual(new Set([PRACTICE_ONLY, ...OFFICIAL]));
      expect(firstThree).not.toContain(REJECTED);
    });
    it(`${kind}: once all are used, the least recently used comes next, in the same order again`, () => {
      const seq = deal(small, kind, "word-connections", 9).games.map((g) => g[0]!);
      expect(seq.slice(3, 6)).toEqual(seq.slice(0, 3));
      expect(seq.slice(6, 9)).toEqual(seq.slice(0, 3));
      expect(seq).not.toContain(REJECTED);
    });
  }

  it("a game that needs several items: unused ones first across games, then the oldest", () => {
    // 24 usable questions (10 practice-only, 14 approved official), 10 per game.
    const { games } = deal(small, "casual", "trivia", 3);
    const [g1, g2, g3] = games as [string[], string[], string[]];
    expect(new Set(g1).size).toBe(10);
    expect(g2.filter((id) => g1.includes(id))).toEqual([]);
    const unusedBefore3 = POOL.questions.filter((q) => q.status !== "rejected" && !g1.includes(q.id) && !g2.includes(q.id)).map((q) => q.id);
    expect(unusedBefore3).toHaveLength(4);
    for (const id of unusedBefore3) expect(g3).toContain(id); // all 4 unused first …
    expect(g3.filter((id) => !unusedBefore3.includes(id)).every((id) => g1.includes(id))).toBe(true); // … then 6 from the oldest game
    expect([...g1, ...g2, ...g3]).not.toContain("trv-t-25"); // rejected
  });

  it("deterministic: the same library, history and sequence give the same items; tie-breaking follows the seed", () => {
    const req: SelectionRequest = { lib: small, gameId: "trivia", count: 10, mode: "practice", roomKind: "solo", cupId: "cup-det", usage: {}, seq: 5, today: TODAY };
    const a = selectContent(req), b = selectContent({ ...req, usage: {} });
    expect(a.ok && b.ok && a.items.map((i) => i.item.id)).toEqual(b.ok && b.items.map((i) => i.item.id));
  });

  it("one eligible item: dealt every time; none: refused with the same reason as before", () => {
    const one = mkdtempSync(join(tmpdir(), "mz-s74-one-"));
    writeSmallPool(one);
    const lib1 = loadContent(one);
    // Keep only the practice-only board (and the rejected one, which never counts).
    lib1.byGame.set("word-connections", lib1.byGame.get("word-connections")!.filter((li) => li.item.id === PRACTICE_ONLY || li.item.id === REJECTED));
    expect(deal(lib1, "solo", "word-connections", 4).games.map((g) => g[0])).toEqual([PRACTICE_ONLY, PRACTICE_ONLY, PRACTICE_ONLY, PRACTICE_ONLY]);
    lib1.byGame.set("word-connections", lib1.byGame.get("word-connections")!.filter((li) => li.item.id === REJECTED));
    const none = selectContent({ lib: lib1, gameId: "word-connections", count: 1, mode: "practice", roomKind: "casual", cupId: "c", usage: {}, seq: 0, today: TODAY });
    expect(none).toMatchObject({ ok: false, reason: "insufficient-content", message: "No practice content is available for this game yet." });
  });

  it("a casual or solo room never selects official content (the room refuses first; the selector too)", () => {
    for (const roomKind of ["casual", "solo"] as const) {
      const r = selectContent({ lib: small, gameId: "word-connections", count: 1, mode: "official", roomKind, cupId: "c", usage: {}, seq: 0, today: TODAY });
      expect(r.ok).toBe(false);
    }
  });
});

describe("a Family Cup's selection is unchanged (V2)", () => {
  it("Cup practice keeps its rule: practice-only and used items first, a fresh official item only after (so this pool repeats the practice board)", () => {
    expect(deal(small, "cup", "word-connections", 4).games.map((g) => g[0])).toEqual([PRACTICE_ONLY, PRACTICE_ONLY, PRACTICE_ONLY, PRACTICE_ONLY]);
  });
  it("Cup official play takes only fresh approved boards and is refused once they are used; practice that took one retired it", () => {
    const usage: UsageHistory = {};
    const req = (mode: "official" | "practice", seq: number): SelectionRequest => ({ lib: small, gameId: "word-connections", count: 1, mode, roomKind: "cup", cupId: "cup-s74", usage, seq, today: TODAY });
    const o1 = selectContent(req("official", 0));
    expect(o1.ok && OFFICIAL.includes(o1.items[0]!.item.id)).toBe(true);
    if (o1.ok) recordUsage(usage, o1.items, { gameInstanceId: "g0", day: 1, mode: "official", seq: 0 });
    const o2 = selectContent(req("official", 1));
    expect(o2.ok && OFFICIAL.includes(o2.items[0]!.item.id) && o2.items[0]!.item.id !== (o1.ok && o1.items[0]!.item.id)).toBe(true);
    if (o2.ok) recordUsage(usage, o2.items, { gameInstanceId: "g1", day: 1, mode: "official", seq: 1 });
    expect(selectContent(req("official", 2))).toMatchObject({ ok: false, reason: "insufficient-content" });
  });
  it("a Cup gives exactly what it gave before Stage 7.4: practice and official, small pool and shipped library (pinned at af39c78)", () => {
    type Plan = [ContentGameIdLike, "official" | "practice", number][];
    const run = (lib: ContentLibrary, plan: Plan) => {
      const usage: UsageHistory = {};
      let seq = 0;
      return plan.map(([gameId, mode, count]) => {
        const r = selectContent({ lib, gameId, count, mode, roomKind: "cup", cupId: "cup-pinned-s74", usage, seq, today: TODAY });
        if (!r.ok) return `REFUSED:${r.reason}`;
        recordUsage(usage, r.items, { gameInstanceId: `g${seq}`, day: 1, mode, seq });
        seq++;
        return r.items.map((li) => li.item.id);
      });
    };
    const plans: Record<keyof typeof CUP_BEFORE_S74, Plan> = {
      smallMixed: [["word-connections", "practice", 1], ["word-connections", "official", 1], ["word-connections", "practice", 1], ["word-connections", "official", 1], ["word-connections", "official", 1], ["word-connections", "practice", 1], ["trivia", "practice", 10], ["trivia", "official", 10], ["trivia", "practice", 10]],
      shippedTestMode: [["word-connections", "practice", 1], ["word-connections", "practice", 1], ["trivia", "official", 10], ["trivia", "practice", 10], ["trivia", "practice", 10], ["guess-the-year", "official", 8], ["guess-the-year", "practice", 8]],
      shippedNormal: [["word-connections", "practice", 1], ["word-connections", "official", 1], ["word-connections", "practice", 1], ["trivia", "practice", 10], ["trivia", "official", 10]],
    };
    expect(run(small, plans.smallMixed)).toEqual(CUP_BEFORE_S74.smallMixed);
    expect(run(loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true }), plans.shippedTestMode)).toEqual(CUP_BEFORE_S74.shippedTestMode);
    expect(run(loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: false }), plans.shippedNormal)).toEqual(CUP_BEFORE_S74.shippedNormal);
  });
  it("rooms never share history: a casual room's plays leave a Cup room's usage untouched", () => {
    const casual = new RoomEngine("Party", { kind: "casual" });
    casual.content = small;
    const host = casual.join("Ada", { asHost: true }).player.id;
    casual.join("Bea");
    const cup = new RoomEngine("Cup", { kind: "cup" });
    cup.content = small;
    for (let i = 0; i < 3; i++) {
      const g = casual.startGame(host, "word-connections", { official: false });
      casual.games.get(g.id)!.status = "finished";
    }
    expect(Object.keys(casual.contentUsage).sort()).toEqual([...SMALL_CONNECTIONS_USABLE].sort());
    expect(cup.contentUsage).toEqual({});
    expect(cup.contentSeq).toBe(0);
  });
});

describe("in a room: persistence, briefings and retries (V3)", () => {
  function soloRoom(lib = small) {
    const engine = new RoomEngine("solo", { kind: "solo" });
    engine.content = lib;
    const me = engine.join("You", { asHost: true }).player.id;
    return { engine, me };
  }

  it("solo: three different boards, then the least recently used; a restart in between continues the order", () => {
    const { engine, me } = soloRoom();
    const ids: string[] = [];
    // Each new Start replaces the open round (which stays used: it was shown).
    ids.push(boardId(engine, engine.startGame(me, "word-connections", { official: false }).id));
    ids.push(boardId(engine, engine.startGame(me, "word-connections", { official: false }).id));
    const back = restart(engine);
    back.content = small;
    ids.push(boardId(back, back.startGame(me, "word-connections", { official: false }).id));
    ids.push(boardId(back, back.startGame(me, "word-connections", { official: false }).id));
    expect(new Set(ids.slice(0, 3))).toEqual(new Set(SMALL_CONNECTIONS_USABLE));
    expect(ids[3]).toBe(ids[0]);
    expect(back.contentSeq).toBe(4);
  });

  it("solo: a repeated press (same id) returns its round and uses nothing more; a new press is a new round with an unused board", () => {
    const { engine, me } = soloRoom();
    const p: SessionAttempt = { id: "solo-press-1", sessionRevision: 0 };
    const first = engine.startChosen(me, "word-connections", { official: false, attempt: p });
    expect(first.replay).toBe(false);
    const firstBoard = boardId(engine, first.game.id);
    const usage = JSON.stringify(engine.contentUsage);
    const again = engine.startChosen(me, "word-connections", { official: false, attempt: p });
    expect([again.replay, again.game.id, again.game.status]).toEqual([true, first.game.id, "playing"]);
    expect([JSON.stringify(engine.contentUsage), engine.contentSeq, engine.games.size]).toEqual([usage, 1, 1]);
    // After a restart too.
    const back = restart(engine);
    back.content = small;
    expect(back.startChosen(me, "word-connections", { official: false, attempt: p }).game.id).toBe(first.game.id);
    // The same id for another game is refused.
    expect(() => back.startChosen(me, "pattern-pulse", { official: false, attempt: p })).toThrow(/already used for something else/);
    const next = back.startChosen(me, "word-connections", { official: false, attempt: { id: "solo-press-2", sessionRevision: 0 } });
    expect(next.replay).toBe(false);
    expect(boardId(back, next.game.id)).not.toBe(firstBoard);
    expect(back.contentSeq).toBe(2);
    // The first round was replaced by the new press: a late repeat of the first press starts nothing.
    expect(() => back.startChosen(me, "word-connections", { official: false, attempt: p })).toThrow(/left or replaced, so nothing new started/);
    expect([back.contentSeq, back.games.size]).toEqual([2, 1]);
  });

  it("casual with a briefing: the board is chosen at the start, used only when play begins; a cancel uses nothing and the next start deals the same board", () => {
    const engine = new RoomEngine("Party", { kind: "casual", timing: 2 });
    engine.content = small;
    const ada = engine.join("Ada", { asHost: true }).player.id;
    engine.join("Bea");
    const press = (id: string): SessionAttempt => ({ id, sessionRevision: engine.session.revision });
    const g1 = engine.startChosen(ada, "word-connections", { official: false, attempt: press("c-1") }).game;
    expect(g1.status).toBe("briefing");
    expect([engine.contentUsage, engine.contentSeq]).toEqual([{}, 0]);
    const frozen = (g1.pendingContent?.items ?? []).map((i) => i.itemId);
    engine.cancelBriefing(ada, g1.id);
    expect([engine.contentUsage, engine.contentSeq]).toEqual([{}, 0]);
    // A retry of the cancelled press starts nothing.
    expect(() => engine.startChosen(ada, "word-connections", { official: false, attempt: { id: "c-1", sessionRevision: 0 } })).toThrow(/cancelled/);
    const g2 = engine.startChosen(ada, "word-connections", { official: false, attempt: press("c-2") }).game;
    expect((g2.pendingContent?.items ?? []).map((i) => i.itemId)).toEqual(frozen);
    // A repeat of this press before play: the same game, nothing used.
    expect(engine.startChosen(ada, "word-connections", { official: false, attempt: { id: "c-2", sessionRevision: 0 } }).game.id).toBe(g2.id);
    expect(engine.contentSeq).toBe(0);
    // Play begins: now it is used, once.
    const r = engine.startNow(ada, g2.id, { confirmed: g2.players }, g2.briefing!.startNowAt + 1);
    expect(r.started).toBe(true);
    expect([Object.keys(engine.contentUsage), engine.contentSeq]).toEqual([frozen, 1]);
    expect(boardId(engine, g2.id)).toBe(frozen[0]);
    // A repeat of the press after play began: the same game, still used once.
    expect(engine.startChosen(ada, "word-connections", { official: false, attempt: { id: "c-2", sessionRevision: 0 } }).replay).toBe(true);
    expect(engine.contentSeq).toBe(1);
    // Play again (a rematch) deals an unused board.
    engine.games.get(g2.id)!.status = "finished";
    const g3 = engine.startRematch(ada, g2.id, { attempt: press("c-3") }).game;
    expect(g3.pendingContent!.items[0]!.itemId).not.toBe(frozen[0]);
  });
});

describe("over HTTP: a solo press id and a restart", () => {
  let dataDir = "";
  let server: LocalServer; let base = "";
  beforeAll(async () => { dataDir = mkdtempSync(join(tmpdir(), "mz-s74-http-")); server = new LocalServer({ dataDir, content: small }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  const call = async (method: string, path: string, body?: unknown, token?: string, at = base) => {
    const r = await fetch(`${at}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };

  it("the same press twice: 201 then 200 (replay), one round, one use; restored after a restart", async () => {
    const made = (await call("POST", "/rooms", { kind: "solo" })).body;
    const id = String(made["roomId"]);
    const me = (await call("POST", `/rooms/${id}/join`, { displayName: "You", asHost: true, hostClaimToken: made["hostClaimToken"] })).body;
    const token = String(me["recoveryToken"]);
    const attempt = { id: "http-solo-1", sessionRevision: 0 };
    const a = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt }, token);
    const b = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt }, token);
    expect([a.status, b.status, b.body["replay"], b.body["gameId"]]).toEqual([201, 200, true, a.body["gameId"]]);
    const room = server.rooms.get(id)!;
    expect([room.contentSeq, room.games.size]).toEqual([1, 1]);
    const firstBoard = boardId(room, String(a.body["gameId"]));
    // A restart (a new server on the same data): the press is still remembered; the next press deals an unused board.
    const later = new LocalServer({ dataDir, content: small });
    const at = `http://127.0.0.1:${await later.listen(0)}`;
    try {
      const c = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt }, token, at);
      expect([c.status, c.body["gameId"]]).toEqual([200, a.body["gameId"]]);
      // Pre-existing defect fixed here (§7): a restart marks every player not
      // connected and a solo room has no socket, so this Start was refused
      // ("Need at least 1 connected players") on af39c78, forever.
      const d = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt: { id: "http-solo-2", sessionRevision: 0 } }, token, at);
      expect([d.status, d.body["error"]]).toEqual([201, undefined]);
      const again = later.rooms.get(id)!;
      expect(boardId(again, String(d.body["gameId"]))).not.toBe(firstBoard);
      expect(again.contentSeq).toBe(2);
    } finally { await later.close(); }
  });
});

describe("pre-existing defect (found while testing V3): a solo Start after a server restart", () => {
  it("is no longer refused: the one pressing Start in a solo room is present (reproduced on af39c78: 400 'Need at least 1 connected players', every time)", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mz-s74-solo-restart-"));
    const first = new LocalServer({ dataDir });
    let base = `http://127.0.0.1:${await first.listen(0)}`;
    const call = async (method: string, path: string, body?: unknown, token?: string) => {
      const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
    };
    const made = (await call("POST", "/rooms", { kind: "solo" })).body;
    const id = String(made["roomId"]);
    const token = String((await call("POST", `/rooms/${id}/join`, { displayName: "You", asHost: true, hostClaimToken: made["hostClaimToken"] })).body["recoveryToken"]);
    expect((await call("POST", `/rooms/${id}/games`, { gameId: "math-mayhem", official: false }, token)).status).toBe(201);
    await first.close();
    const second = new LocalServer({ dataDir });
    base = `http://127.0.0.1:${await second.listen(0)}`;
    try {
      // The restart marked the player not connected; a solo room has no socket to change that.
      expect(second.rooms.get(id)!.players.values().next().value!.connected).toBe(false);
      const again = await call("POST", `/rooms/${id}/games`, { gameId: "math-mayhem", official: false }, token);
      expect([again.status, again.body["error"]]).toEqual([201, undefined]);
      // Only in a solo room: a casual room still counts who is actually connected.
      const casual = new RoomEngine("Party", { kind: "casual" });
      const host = casual.join("Ada", { asHost: true }).player.id;
      casual.disconnect(host);
      expect(() => casual.startGame(host, "math-mayhem", { official: false })).toThrow(/connected players/);
    } finally { await second.close(); }
  });
});

describe("MCHEZO_CONTENT_DIR is for tests only (§4.6)", () => {
  function runServe(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
    return new Promise((resolve) => {
      const clean = { ...process.env };
      delete clean["MCHEZO_CONTENT_TEST_MODE"];
      delete clean["MCHEZO_LIFECYCLE_SCALE"];
      const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], {
        env: { ...clean, PORT: "0", MCHEZO_DATA_DIR: mkdtempSync(join(tmpdir(), "mz-s74-serve-")), ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (d) => { out += d.toString(); if (/on http:\/\/localhost/.test(out)) child.kill("SIGTERM"); });
      child.stderr.on("data", (d) => { out += d.toString(); });
      child.on("exit", (code) => resolve({ code, out }));
    });
  }
  it("is refused when NODE_ENV=production (the server does not start)", async () => {
    const r = await runServe({ NODE_ENV: "production", MCHEZO_CONTENT_DIR: POOL_DIR });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/MCHEZO_CONTENT_DIR is for tests only and is not allowed in production/);
  }, 30_000);
  it("otherwise loads that directory instead of the shipped library, and says so", async () => {
    const r = await runServe({ MCHEZO_CONTENT_DIR: POOL_DIR });
    expect(r.out).toMatch(/TEST MODE: content loaded from .* \(29 items\), not the shipped library/);
    expect(r.out).not.toMatch(/\[content\]/); // no problems in the pool
  }, 30_000);
});

describe("the shipped library (normal and test mode)", () => {
  for (const testApproveProvisional of [false, true]) {
    it(`${testApproveProvisional ? "test mode (all approved)" : "normal mode"}: a casual room plays all 13 Connections boards before repeating`, () => {
      const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional });
      const seq = deal(lib, "casual", "word-connections", 14).games.map((g) => g[0]!);
      expect(new Set(seq.slice(0, 13)).size).toBe(13);
      expect(seq[13]).toBe(seq[0]);
    });
  }
});
