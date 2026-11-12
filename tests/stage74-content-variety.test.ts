// Stage 7.4 (docs/stage7/stage74.md): content variety in solo and casual rooms.
// A casual or solo room deals every practice-usable item it hasn't used, then
// the least recently used; a Family Cup's selection is exactly as before.
// Most tests use a small controlled pool (scripts/lib/small-pool.mjs): one
// practice-only Connections board, two approved official boards, one rejected.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { recordUsage, selectContent, type SelectionRequest, type UsageHistory } from "../src/content/select.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, SESSION_OPS_LIMIT, type SessionAttempt } from "../src/server/room.js";
import { SoloSession, forgetPageSeat } from "../apps/web/src/solo/soloSession.js";
import type { SessionSeason } from "../src/shared/season.js";
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
function deal(lib: ContentLibrary, roomKind: SelectionRequest["roomKind"], gameId: "word-connections" | "trivia", n: number, opts: { count?: number; usage?: UsageHistory; seq?: number; season?: SessionSeason } = {}) {
  const usage = opts.usage ?? {};
  let seq = opts.seq ?? 0;
  const games: string[][] = [];
  // Stage 8.2: a solo or casual room's selection names its content (Everyday unless a test says otherwise); a Cup's never does.
  const season = roomKind === "cup" ? {} : { season: opts.season ?? "everyday" };
  for (let i = 0; i < n; i++) {
    const r = selectContent({ lib, gameId, count: opts.count ?? (gameId === "trivia" ? 10 : 1), mode: "practice", roomKind, cupId: "cup-s74-test", usage, seq, today: TODAY, ...season });
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
    const req: SelectionRequest = { lib: small, gameId: "trivia", count: 10, mode: "practice", roomKind: "solo", cupId: "cup-det", usage: {}, seq: 5, today: TODAY, season: "everyday" };
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
    const none = selectContent({ lib: lib1, gameId: "word-connections", count: 1, mode: "practice", roomKind: "casual", cupId: "c", usage: {}, seq: 0, today: TODAY, season: "everyday" });
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

  // Solo presses (spec §4.4, clarification 6783492788): bound to the whole
  // command, replayed only while still the latest, and fresh-checked against
  // a persisted, monotonic revision (every new solo round moves it on).
  const codeOf = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as { code?: string; message?: string }).code ?? (e as Error).message; } return undefined; };
  let n = 0;
  const pressOn = (engine: RoomEngine): SessionAttempt => ({ id: `solo-press-${String(++n).padStart(4, "0")}`, sessionRevision: engine.session.revision });
  const snapshot = (engine: RoomEngine) => JSON.stringify({ usage: engine.contentUsage, seq: engine.contentSeq, games: [...engine.games.values()].map((g) => [g.id, g.gameId, g.status]), revision: engine.session.revision });

  it("solo, an identical duplicate: the same round, nothing more used; also after a restart", () => {
    const { engine, me } = soloRoom();
    const a = pressOn(engine);
    const first = engine.startChosen(me, "word-connections", { official: false, attempt: a });
    expect([first.replay, engine.session.revision]).toEqual([false, 1]);
    const before = snapshot(engine);
    const again = engine.startChosen(me, "word-connections", { official: false, attempt: a });
    expect([again.replay, again.game.id, again.game.status]).toEqual([true, first.game.id, "playing"]);
    expect(snapshot(engine)).toBe(before);
    const back = restart(engine);
    back.content = small;
    expect([back.session.revision, back.startChosen(me, "word-connections", { official: false, attempt: a }).game.id]).toEqual([1, first.game.id]);
    expect(snapshot(back)).toBe(before);
  });

  it("solo, a mismatched command with a known id (another game, another revision): refused, nothing changes", () => {
    const { engine, me } = soloRoom();
    const a = pressOn(engine);
    engine.startChosen(me, "word-connections", { official: false, attempt: a });
    const before = snapshot(engine);
    expect(codeOf(() => engine.startChosen(me, "pattern-pulse", { official: false, attempt: a }))).toMatch(/already used for something else/);
    expect(codeOf(() => engine.startChosen(me, "word-connections", { official: false, attempt: { ...a, sessionRevision: 1 } }))).toMatch(/already used for something else/);
    expect(snapshot(engine)).toBe(before);
  });

  it("solo, start A then B, then A replayed (late): SESSION_CONFLICT; B keeps playing, nothing abandoned or used, A never handed back", () => {
    const { engine, me } = soloRoom();
    const a = pressOn(engine);
    const ga = engine.startChosen(me, "word-connections", { official: false, attempt: a }).game;
    const b = pressOn(engine);
    const gb = engine.startChosen(me, "word-connections", { official: false, attempt: b }).game; // B replaces A
    const before = snapshot(engine);
    expect(codeOf(() => engine.startChosen(me, "word-connections", { official: false, attempt: a }))).toBe("SESSION_CONFLICT");
    expect(snapshot(engine)).toBe(before);
    expect([engine.games.get(gb.id)?.status, engine.games.has(ga.id)]).toEqual(["playing", false]);
    // A finished round is no different: once a newer round started, its press is stale.
    engine.games.get(gb.id)!.status = "finished";
    const gc = engine.startChosen(me, "word-connections", { official: false, attempt: pressOn(engine) }).game;
    expect(codeOf(() => engine.startChosen(me, "word-connections", { official: false, attempt: b }))).toBe("SESSION_CONFLICT");
    expect(engine.games.get(gc.id)?.status).toBe("playing");
  });

  it("solo, a press made before a newer round but never seen (a delayed request, another tab): stale, nothing abandoned or used", () => {
    const { engine, me } = soloRoom();
    const stale = pressOn(engine); // made against revision 0 …
    const gb = engine.startChosen(me, "word-connections", { official: false, attempt: pressOn(engine) }).game; // … another press wins first
    const before = snapshot(engine);
    const err = (() => { try { engine.startChosen(me, "pattern-pulse", { official: false, attempt: stale }); } catch (e) { return e as { code: string; detail?: { session?: { revision: number } } }; } return null; })();
    expect([err?.code, err?.detail?.session?.revision]).toEqual(["SESSION_CONFLICT", 1]); // the reply carries the current state
    expect(snapshot(engine)).toBe(before);
    expect(engine.games.get(gb.id)?.status).toBe("playing");
    // A fresh press (made against the current revision) starts, as Try again does.
    expect(engine.startChosen(me, "pattern-pulse", { official: false, attempt: pressOn(engine) }).replay).toBe(false);
  });

  it("solo, a press forgotten after 64 newer ones and replayed: stale by its revision, never a new start", () => {
    const { engine, me } = soloRoom();
    const old = pressOn(engine);
    engine.startChosen(me, "word-connections", { official: false, attempt: old });
    for (let i = 0; i < SESSION_OPS_LIMIT; i++) engine.startChosen(me, "pattern-pulse", { official: false, attempt: pressOn(engine) });
    expect(engine.session.ops.some((o) => o.id === old.id)).toBe(false);
    const before = snapshot(engine);
    expect(codeOf(() => engine.startChosen(me, "word-connections", { official: false, attempt: old }))).toBe("SESSION_CONFLICT");
    expect(snapshot(engine)).toBe(before);
    const back = restart(engine);
    back.content = small;
    expect(codeOf(() => back.startChosen(me, "word-connections", { official: false, attempt: old }))).toBe("SESSION_CONFLICT");
    expect(back.session.ops).toHaveLength(SESSION_OPS_LIMIT);
  });

  it("solo, without a press id (API compatibility, kept explicit): a plain new round, as before; the app always sends one", () => {
    const { engine, me } = soloRoom();
    const a = engine.startChosen(me, "word-connections", { official: false });
    const b = engine.startChosen(me, "word-connections", { official: false });
    expect([a.replay, b.replay, engine.games.has(a.game.id), engine.session.revision, engine.contentSeq]).toEqual([false, false, false, 2, 2]);
    expect(boardId(engine, b.game.id)).not.toBe(undefined);
  });

  it("solo: the projection carries the room revision (for the app's next press), never the remembered presses", () => {
    const { engine, me } = soloRoom();
    engine.startChosen(me, "word-connections", { official: false, attempt: pressOn(engine) });
    const proj = engine.project("player", me) as { session?: { revision: number; ops?: unknown } };
    expect(proj.session).toEqual({ onBreak: false, revision: 1 });
    expect(JSON.stringify(proj)).not.toContain("solo-press-");
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
      // A new press made against an old revision is stale (409), with the current state; nothing changes.
      const stale = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt: { id: "http-solo-2", sessionRevision: 0 } }, token, at);
      expect([stale.status, stale.body["code"], (stale.body["session"] as { revision: number }).revision]).toEqual([409, "SESSION_CONFLICT", 1]);
      // The app reads the room (its revision) and presses again.
      const rev = ((await call("GET", `/rooms/${id}/projection?audience=player`, undefined, token, at)).body["session"] as { revision: number }).revision;
      const d = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt: { id: "http-solo-3", sessionRevision: rev } }, token, at);
      expect([d.status, d.body["error"]]).toEqual([201, undefined]);
      const again = later.rooms.get(id)!;
      expect(boardId(again, String(d.body["gameId"]))).not.toBe(firstBoard);
      expect([again.contentSeq, again.session.revision]).toEqual([2, 2]);
      // The first press, replayed now that a newer round exists: stale, and the new round keeps playing.
      const late = await call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, attempt }, token, at);
      expect([late.status, late.body["code"]]).toEqual([409, "SESSION_CONFLICT"]);
      expect([again.games.get(String(d.body["gameId"]))?.status, again.contentSeq]).toEqual(["playing", 2]);
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
  // Stage 8.2 (docs/stage8/stage82.md §3.3) changed these on purpose: before
  // it, a casual room played all 13 boards, the two Christmas ones included.
  const CHRISTMAS_BOARDS = ["con-legacy-1", "con-s4-03"];
  for (const testApproveProvisional of [false, true]) {
    it(`${testApproveProvisional ? "test mode (all approved)" : "normal mode"}: an Everyday casual room plays all 11 year-round Connections boards before repeating, never a Christmas one`, () => {
      const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional });
      const seq = deal(lib, "casual", "word-connections", 23).games.map((g) => g[0]!);
      expect(new Set(seq.slice(0, 11)).size).toBe(11);
      expect(seq[11]).toBe(seq[0]);
      expect(seq.filter((id) => CHRISTMAS_BOARDS.includes(id))).toEqual([]);
    });
    it(`${testApproveProvisional ? "test mode (all approved)" : "normal mode"}: a Christmas casual room plays all 13, its two Christmas boards first`, () => {
      const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional });
      const seq = deal(lib, "casual", "word-connections", 14, { season: "christmas" }).games.map((g) => g[0]!);
      expect(new Set(seq.slice(0, 2))).toEqual(new Set(CHRISTMAS_BOARDS));
      expect(new Set(seq.slice(0, 13)).size).toBe(13);
      expect(seq[13]).toBe(seq[0]);
    });
  }
});

// Review 6786060026 (P2, V3): a solo Start that gets no answer is recovered
// only by the server's answer to that same press (sent again unchanged), never
// by adopting a round that merely appeared in the room. Real server, the real
// SoloSession client, two "tabs" sharing one solo seat (the page seat), and
// injected network faults on tab A's Start requests.
describe("solo Start recovery is tied to its own press (review 6786060026)", () => {
  type Fault = "pass" | "drop" | "hang" | "reset" | "refused";
  let server: LocalServer; let base = "";
  const realFetch = globalThis.fetch;
  const sessions: SoloSession[] = [];
  beforeAll(async () => { server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s74-recover-")), content: small }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  beforeEach(() => { forgetPageSeat(); });
  afterEach(() => { for (const s of sessions.splice(0)) s.dispose(); });
  /**
   * Each request's allowance (D-S101-10). A "drop" or "hang" uses all of it, so
   * a tab with faults keeps it short; its other requests, and every request of
   * a tab without faults, go to the real server in this same thread, where a
   * loaded gate can stall the event loop past a short allowance (the session's
   * timer then fires before the reply is read). 250 ms failed gates; a tab with
   * faults gets 2 s, a tab without them 5 s.
   */
  const WITH_FAULTS_MS = 2_000;
  const NO_FAULTS_MS = 5_000;
  /**
   * A tab. `faults` decides each of its Start requests in turn: "pass";
   * "drop" (it reaches the server and acts, but the reply never arrives: the
   * request uses its whole allowance); "hang" (it never reaches the server and
   * never answers); "reset" (it reaches the server and acts, then the
   * connection drops: the fetch fails at once); "refused" (it never reaches the
   * server: the fetch fails at once). `around` runs another tab's action at
   * that moment: before the request ("before") or after the server acted ("after").
   */
  function tab(opts: { faults?: Fault[]; around?: { at: number; when: "before" | "after"; run: () => Promise<void> }; requestTimeoutMs?: number } = {}) {
    const sent: { id: string; sessionRevision: number }[] = [];
    let n = 0;
    const f = (async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      const never = () => new Promise<Response>((_, reject) => rest.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      if (!(/\/games$/.test(input) && rest.method === "POST")) return realFetch(`${base}${input}`, rest);
      const i = n++;
      sent.push((JSON.parse(String(rest.body)) as { attempt: { id: string; sessionRevision: number } }).attempt);
      const fault = opts.faults?.[i] ?? "pass";
      if (opts.around?.at === i && opts.around.when === "before") await opts.around.run();
      if (fault === "hang") return never();
      if (fault === "refused") throw new TypeError("fetch failed");
      const reply = await realFetch(`${base}${input}`, rest);
      if (opts.around?.at === i && opts.around.when === "after") await opts.around.run();
      if (fault === "reset") throw new TypeError("fetch failed");
      return fault === "drop" ? never() : reply;
    }) as unknown as typeof fetch;
    const s = new SoloSession({ store: null, onChange: () => {}, fetch: f, pollMs: 60_000, requestTimeoutMs: opts.requestTimeoutMs ?? (opts.faults?.length ? WITH_FAULTS_MS : NO_FAULTS_MS), startBudgetMs: 4_000 });
    sessions.push(s);
    return { s, sent };
  }
  const roomOf = (s: SoloSession) => (server as unknown as { rooms: Map<string, RoomEngine> }).rooms.get(s.roomId!)!;
  const open = (r: RoomEngine) => [...r.games.values()].filter((g) => g.status === "playing").map((g) => g.id);
  /** A solo room already made and joined (so both tabs share its seat), at revision 1 with nothing open. */
  async function seatedRoom() {
    // Setup, not the behaviour under test: a real, unfaulted Start, with the no-faults allowance
    // (it failed twice under a loaded gate with 250 ms: D-S101-07, D-S101-10).
    const first = tab();
    await first.s.start("pattern-pulse");
    expect(first.s.current.phase).toBe("playing");
    await first.s.leave();
    return roomOf(first.s);
  }

  it("A's reply is lost (the connection drops) after the server started its round: the same press, sent again at once, is answered as a replay; one round, one use", async () => {
    const room = await seatedRoom();
    const a = tab({ faults: ["reset", "pass"] });
    await a.s.start("word-connections");
    expect(a.s.current.phase).toBe("playing");
    expect(open(room)).toEqual([a.s.current.gameInstanceId]);
    expect(a.sent).toHaveLength(2);
    expect(a.sent[1]).toEqual(a.sent[0]); // the same press: id, revision and game
    expect([room.contentSeq, room.session.revision]).toEqual([1, 2]); // Pulse uses no content; one Connections use
  });

  it("A never reaches the server while B starts the same game: A is refused as stale and never adopts B's round; B is undisturbed; no extra use", async () => {
    const room = await seatedRoom();
    const b = tab();
    const a = tab({ faults: ["refused", "pass"], around: { at: 0, when: "before", run: async () => { await b.s.start("word-connections"); } } });
    await a.s.start("word-connections");
    const bRound = b.s.current.gameInstanceId!;
    expect(b.s.current.phase).toBe("playing");
    expect([a.s.current.phase, a.s.current.failure, a.s.current.gameInstanceId]).toEqual(["error", "refused", undefined]);
    expect(a.s.current.error).toMatch(/another tab or window/);
    expect(open(room)).toEqual([bRound]);
    expect(a.sent.every((x) => x.id === a.sent[0]!.id && x.sessionRevision === 1)).toBe(true);
    expect([room.contentSeq, room.session.revision]).toEqual([1, 2]); // B's round only
    // Try again: a new press against the room as it is now (it replaces B's round, as a Start does).
    await a.s.start("word-connections");
    expect(a.s.current.phase).toBe("playing");
    expect(a.sent.at(-1)!.id).not.toBe(a.sent[0]!.id);
    expect(a.sent.at(-1)!.sessionRevision).toBe(2);
  });

  it("A started, but B replaced it before A's press was sent again: A is refused, never adopts B's round; B is undisturbed; no extra use", async () => {
    const room = await seatedRoom();
    const b = tab();
    const a = tab({ faults: ["reset", "pass"], around: { at: 0, when: "after", run: async () => { await b.s.start("word-connections"); } } });
    await a.s.start("word-connections");
    const bRound = b.s.current.gameInstanceId!;
    expect(b.s.current.phase).toBe("playing");
    expect([a.s.current.phase, a.s.current.failure, a.s.current.gameInstanceId]).toEqual(["error", "refused", undefined]);
    expect(a.s.current.error).toMatch(/isn.t the latest/);
    expect(open(room)).toEqual([bRound]);
    expect([room.contentSeq, room.session.revision]).toEqual([2, 3]); // A's real start and B's; the resend used nothing
  });

  it("A's request hangs (never arrives) while B starts the same game: A ends within one request allowance without adopting B's round; Try again sends the same press and is refused as stale; B is undisturbed", async () => {
    const room = await seatedRoom();
    const b = tab();
    const a = tab({ faults: ["hang", "pass"], around: { at: 0, when: "before", run: async () => { await b.s.start("word-connections"); } } });
    await a.s.start("word-connections");
    const bRound = b.s.current.gameInstanceId!;
    expect([a.s.current.phase, a.s.current.failure, a.s.current.gameInstanceId]).toEqual(["error", "transient", undefined]);
    expect(a.sent).toHaveLength(1); // the hang used the whole allowance: no resend in this Start
    await a.s.start("word-connections"); // Try again: the same press, now answered
    expect([a.s.current.phase, a.s.current.failure, a.s.current.gameInstanceId]).toEqual(["error", "refused", undefined]);
    expect([a.sent.length, a.sent[1]]).toEqual([2, a.sent[0]]);
    expect(open(room)).toEqual([bRound]);
    expect(b.s.current.phase).toBe("playing");
    expect([room.contentSeq, room.session.revision]).toEqual([1, 2]);
  }, 30_000); // each no-answer fault waits its whole allowance

  it("no network at all: the Start ends within its budget; Try again sends the same press (a replay if it had arrived), so nothing starts twice", async () => {
    // The press never arrives: Try again starts it once.
    let room = await seatedRoom();
    let faults: Fault[] = ["hang", "hang", "hang"];
    const a = tab({ faults });
    const t0 = Date.now();
    await a.s.start("word-connections");
    expect(Date.now() - t0).toBeLessThan(4_000);
    expect([a.s.current.phase, a.s.current.failure]).toEqual(["error", "transient"]);
    expect([open(room), room.contentSeq]).toEqual([[], 0]);
    faults.length = 0; // the network is back
    await a.s.start("word-connections");
    expect(a.s.current.phase).toBe("playing");
    expect(new Set(a.sent.map((x) => x.id)).size).toBe(1);
    expect([open(room), room.contentSeq]).toEqual([[a.s.current.gameInstanceId], 1]);

    // The press arrived but no reply ever came back: Try again is answered as a replay of that same round.
    forgetPageSeat();
    room = await seatedRoom();
    faults = ["drop", "drop", "drop"];
    const c = tab({ faults });
    await c.s.start("word-connections");
    expect([c.s.current.phase, c.s.current.failure]).toEqual(["error", "transient"]);
    const started = open(room);
    expect([started.length, room.contentSeq]).toEqual([1, 1]);
    faults.length = 0;
    await c.s.start("word-connections");
    expect([c.s.current.phase, c.s.current.gameInstanceId]).toEqual(["playing", started[0]]);
    expect(c.s.current.replacedOpenRound).toBeUndefined();
    expect(new Set(c.sent.map((x) => x.id)).size).toBe(1);
    expect(room.contentSeq).toBe(1);

    // After Leave, a Start is a new press (not the old one).
    await c.s.leave();
    await c.s.start("word-connections");
    expect(c.s.current.phase).toBe("playing");
    expect(new Set(c.sent.map((x) => x.id)).size).toBe(2);

    // Leave while a press is still unanswered ends that press: the next Start is a new one, made against the room as it is then.
    forgetPageSeat();
    room = await seatedRoom();
    faults = ["hang"];
    const d = tab({ faults });
    await d.s.start("word-connections");
    expect([d.s.current.phase, d.s.current.failure]).toEqual(["error", "transient"]);
    await d.s.leave();
    faults.length = 0;
    await d.s.start("word-connections");
    expect(d.s.current.phase).toBe("playing");
    expect([d.sent.length, d.sent[1]!.id === d.sent[0]!.id]).toEqual([2, false]);
    expect(room.contentSeq).toBe(1);
  }, 30_000); // each no-answer fault waits its whole allowance
});
