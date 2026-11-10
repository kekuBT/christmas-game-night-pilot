/**
 * Stage 6.1, client side: the personal best on this device, and the solo
 * session's seat, run against a real local server.
 *
 * The risks covered (not the code mirrored):
 *  - a best never compares across rules versions, never breaks on bad or
 *    blocked storage, and a tie or a lower score never replaces it;
 *  - blocked, cleared or read-only storage never makes a new room for every
 *    round (the seat is kept for the page), and a seat is reused only when the
 *    server accepts its token: a room id without the token gets nothing;
 *  - two tabs (or a reload) on one seat: the later Start replaces the earlier
 *    round, and the earlier tab's late answer or Leave can't score or cancel
 *    the replacement.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PB_STORAGE_KEY, readBest, recordScore, type KeyValueStore } from "../apps/web/src/solo/personalBest.js";
import { SOLO_SEAT_KEY, SoloSession, forgetPageSeat, readSeat, type SoloState } from "../apps/web/src/solo/soloSession.js";
import { LocalServer } from "../src/server/http.js";

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  writes = 0;
  constructor(private readonly failWrites = false) {}
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.failWrites) throw new DOMException("full", "QuotaExceededError"); this.writes++; this.data.set(k, v); }
}

describe("personal best on this device", () => {
  it("first score, higher, lower and a tie", () => {
    const s = new MemoryStore();
    expect(readBest(s, "math-mayhem", 1)).toBeUndefined();
    expect(recordScore(s, "math-mayhem", 1, 500, 1)).toEqual({ isNewBest: true, saved: true });
    const higher = recordScore(s, "math-mayhem", 1, 800, 2);
    expect(higher).toMatchObject({ isNewBest: true, saved: true, previous: { score: 500 } });
    const lower = recordScore(s, "math-mayhem", 1, 300, 3);
    expect(lower).toMatchObject({ isNewBest: false, previous: { score: 800 } });
    const tie = recordScore(s, "math-mayhem", 1, 800, 4);
    expect(tie.isNewBest).toBe(false);
    expect(readBest(s, "math-mayhem", 1)).toEqual({ score: 800, at: 2, rulesVersion: 1 }); // the earlier 800 stays
  });

  it("rounds under other rules never compare, and their entries are kept", () => {
    const s = new MemoryStore();
    recordScore(s, "math-mayhem", 1, 900, 1);
    expect(readBest(s, "math-mayhem", 2)).toBeUndefined();
    expect(recordScore(s, "math-mayhem", 2, 100, 2)).toEqual({ isNewBest: true, saved: true });
    expect(readBest(s, "math-mayhem", 1)?.score).toBe(900);
    expect(readBest(s, "math-mayhem", 2)?.score).toBe(100);
  });

  it("malformed or hostile stored data reads as no best and is replaced on the next save", () => {
    for (const raw of ["{not json", "[]", "null", "42", JSON.stringify({ "math-mayhem@1": { score: "lots", at: 1, rulesVersion: 1 } }), JSON.stringify({ "math-mayhem@1": { score: -5, at: 1, rulesVersion: 1 } }), JSON.stringify({ "math-mayhem@1": { score: 10, at: 1, rulesVersion: 2 } })]) {
      const s = new MemoryStore();
      s.data.set(PB_STORAGE_KEY, raw);
      expect(readBest(s, "math-mayhem", 1), raw).toBeUndefined();
      expect(recordScore(s, "math-mayhem", 1, 50, 1).isNewBest, raw).toBe(true);
      expect(readBest(s, "math-mayhem", 1)?.score, raw).toBe(50);
    }
  });

  it("no storage, or a write that throws, never breaks play: the caller is told it wasn't saved", () => {
    expect(readBest(null, "math-mayhem", 1)).toBeUndefined();
    expect(recordScore(null, "math-mayhem", 1, 500, 1)).toEqual({ isNewBest: true, saved: false });
    const full = new MemoryStore(true);
    expect(recordScore(full, "math-mayhem", 1, 500, 1)).toEqual({ isNewBest: true, saved: false });
    const broken: KeyValueStore = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
    expect(readBest(broken, "math-mayhem", 1)).toBeUndefined();
    expect(recordScore(broken, "math-mayhem", 1, 500, 1).saved).toBe(false);
  });

  it("a stored solo seat must be complete to be used", () => {
    const s = new MemoryStore();
    expect(readSeat(s)).toBeNull();
    for (const raw of ["x", "{}", JSON.stringify({ roomId: "r", playerId: "p" }), JSON.stringify({ roomId: 1, playerId: "p", token: "t" })]) {
      s.data.set(SOLO_SEAT_KEY, raw);
      expect(readSeat(s), raw).toBeNull();
    }
    s.data.set(SOLO_SEAT_KEY, JSON.stringify({ roomId: "r", playerId: "p", token: "t" }));
    expect(readSeat(s)).toEqual({ roomId: "r", playerId: "p", token: "t" });
  });
});

describe("the solo session against a real server", () => {
  let server: LocalServer;
  let base = "";
  const realFetch = globalThis.fetch;
  let roomsCreated = 0;
  const sessions: SoloSession[] = [];

  beforeAll(async () => {
    server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s61c-")) });
    base = `http://127.0.0.1:${await server.listen(0)}`;
  });
  afterAll(async () => { await server.close(); });
  beforeEach(() => {
    forgetPageSeat();
    roomsCreated = 0;
    // The app's relative URLs, sent to the test server (Node's fetch has no page origin).
    vi.stubGlobal("fetch", (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      if (input === "/rooms" && rest.method === "POST") roomsCreated++;
      return realFetch(`${base}${input}`, rest);
    });
  });
  afterEach(() => {
    for (const s of sessions.splice(0)) s.dispose();
    vi.unstubAllGlobals();
  });

  function session(store: KeyValueStore | null) {
    const seen: SoloState[] = [];
    const s = new SoloSession({ store, onChange: (st) => seen.push(st), pollMs: 60_000 });
    sessions.push(s);
    return { s, seen };
  }
  async function room(s: SoloSession) {
    const r = await realFetch(`${base}/rooms/${s.roomId}/projection?audience=player`, { headers: { "x-session-token": readSeatToken(s) } });
    return r.json() as Promise<{ roomKind: string; games: { id: string; status: string; rawScores?: Record<string, number> }[]; myGames?: { id: string; myAnswers?: Record<string, unknown>; questions?: { id: string }[] }[] }>;
  }
  // The session's own token (private field; read for the test's server checks only).
  const readSeatToken = (s: SoloSession) => (s as unknown as { seat: { token: string } }).seat.token;

  it("with storage working: one room for the device, reused round after round and by a new screen", async () => {
    const store = new MemoryStore();
    const a = session(store);
    await a.s.start("math-mayhem");
    expect(a.s.current.phase).toBe("playing");
    await a.s.start("math-mayhem"); // Play again
    const b = session(store); // Back to solo, Start again (a new screen)
    await b.s.start("math-mayhem");
    expect(roomsCreated).toBe(1);
    expect(b.s.roomId).toBe(a.s.roomId);
    expect(readSeat(store)?.roomId).toBe(a.s.roomId);
  });

  it("with storage blocked: the seat is kept for the page, so rounds don't each make a room", async () => {
    const a = session(null);
    await a.s.start("math-mayhem");
    await a.s.start("math-mayhem");
    const b = session(null);
    await b.s.start("math-mayhem");
    expect(a.s.current.phase).toBe("playing");
    expect(roomsCreated).toBe(1);
    expect(b.s.roomId).toBe(a.s.roomId);
  });

  it("storage that reads but can't be written (holding a dead seat): still one room for the page", async () => {
    const store = new MemoryStore(true);
    store.data.set(SOLO_SEAT_KEY, JSON.stringify({ roomId: "room-gone", playerId: "p", token: "dead" }));
    const a = session(store);
    await a.s.start("math-mayhem");
    const b = session(store);
    await b.s.start("math-mayhem");
    expect(roomsCreated).toBe(1);
    expect(b.s.roomId).toBe(a.s.roomId);
  });

  it("a seat is reused only with its token: a known room id with a wrong token gets a new room of its own", async () => {
    const owner = session(new MemoryStore());
    await owner.s.start("math-mayhem");
    const victim = owner.s.roomId!;
    forgetPageSeat();
    const forged = new MemoryStore();
    forged.data.set(SOLO_SEAT_KEY, JSON.stringify({ roomId: victim, playerId: owner.s.playerId, token: "guessed" }));
    const intruder = session(forged);
    await intruder.s.start("math-mayhem");
    expect(intruder.s.roomId).not.toBe(victim);
    const r = await room(owner.s);
    expect(r.games.filter((g) => g.status === "playing")).toHaveLength(1); // the owner's round untouched
    // And the room's public view is closed: no TV projection of a solo room.
    expect((await realFetch(`${base}/rooms/${victim}/projection?audience=tv`)).status).toBe(404);
    expect((await realFetch(`${base}/rooms/${victim}`)).status).toBe(404);
  });

  it("two tabs on one seat: the later Start replaces the round; the earlier tab's answer and Leave can't touch it", async () => {
    const store = new MemoryStore();
    const tabA = session(store);
    await tabA.s.start("math-mayhem");
    const gA = tabA.s.current.gameInstanceId!;
    const tabB = session(store);
    await tabB.s.start("math-mayhem");
    const gB = tabB.s.current.gameInstanceId!;
    expect(gB).not.toBe(gA);
    expect(tabB.s.current.replacedOpenRound).toBe(true);
    expect(tabB.s.roomId).toBe(tabA.s.roomId);

    // Tab A still shows its round: its answer goes to gA, which is gone.
    const q = (await room(tabB.s)).myGames!.find((g) => g.id === gB)!.questions![0]!;
    await tabA.s.intent(gA, "submit-math-answer", { questionId: q.id, chosenIndex: 0 });
    expect(tabA.s.current.phase).toBe("idle"); // its refresh found its round gone: back to Start, not stuck
    // Its Leave (a stale cancel of gA) changes nothing.
    await tabA.s.leave();
    let r = await room(tabB.s);
    expect(r.games.find((g) => g.id === gB)?.status).toBe("playing");
    expect(Object.keys(r.myGames!.find((g) => g.id === gB)?.myAnswers ?? {})).toHaveLength(0);
    // Even a cancel of gA sent straight to the server after the fact: still nothing.
    const stale = await realFetch(`${base}/rooms/${tabA.s.roomId}/games/${gA}/cancel`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": readSeatToken(tabB.s) }, body: "{}" });
    expect(stale.status).toBe(200);
    r = await room(tabB.s);
    expect(r.games.find((g) => g.id === gB)?.status).toBe("playing");

    // Tab B's own answer counts, in its own round only.
    await tabB.s.intent(gB, "submit-math-answer", { questionId: q.id, chosenIndex: 0 });
    r = await room(tabB.s);
    expect(Object.keys(r.myGames!.find((g) => g.id === gB)?.myAnswers ?? {})).toEqual([q.id]);
    expect(r.games.some((g) => g.id === gA)).toBe(false);
  });

  it("after dispose, nothing a request still in flight returns reaches the screen", async () => {
    const a = session(new MemoryStore());
    const started = a.s.start("math-mayhem");
    a.s.dispose();
    await started;
    expect(a.seen.map((s) => s.phase)).toEqual(["starting"]);
  });
});
