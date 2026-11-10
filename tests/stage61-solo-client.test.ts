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
import { SOLO_LOST, SOLO_SEAT_KEY, SOLO_UNREACHABLE, SoloSession, forgetPageSeat, readSeat, type SoloState } from "../apps/web/src/solo/soloSession.js";
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

  it("a record in this game's slot under other rules neither blocks nor compares with a new score (review of PR #6)", () => {
    const s = new MemoryStore();
    s.data.set(PB_STORAGE_KEY, JSON.stringify({ "math-mayhem@1": { score: 900, at: 1, rulesVersion: 2 } }));
    expect(readBest(s, "math-mayhem", 1)).toBeUndefined();
    expect(recordScore(s, "math-mayhem", 1, 500, 2)).toEqual({ isNewBest: true, saved: true });
    expect(readBest(s, "math-mayhem", 1)).toEqual({ score: 500, at: 2, rulesVersion: 1 });
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

/**
 * Review of PR #6 (P2 ×2): every request is bounded and belongs to its run,
 * and a lost seat is told apart from a passing failure. A small in-memory
 * solo server stands behind an injected fetch, so faults can be placed on
 * exactly one request: no reply, headers then a stalled body, 500s, a
 * dropped connection, a reply that arrives after Leave, a token the server
 * no longer accepts, a room it no longer has.
 */
describe("the solo session under faults (review of PR #6)", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** A request that never answers, but ends when aborted (as fetch does). */
  const noReply = (init: RequestInit) => new Promise<Response>((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  interface Room { token: string; claim: string; joined: boolean; games: { id: string; gameId: string; status: string }[] }
  type Handler = (url: string, init: RequestInit) => Promise<Response>;

  function soloServer() {
    const rooms = new Map<string, Room>();
    const counts = { rooms: 0, join: 0, games: 0, projection: 0 };
    let seq = 0;
    const handle: Handler = async (url, init) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      const token = (init.headers as Record<string, string> | undefined)?.["x-session-token"];
      if (method === "POST" && url === "/rooms") {
        counts.rooms++;
        const id = `r${counts.rooms}`;
        rooms.set(id, { token: `t-${id}`, claim: `c-${id}`, joined: false, games: [] });
        return json(201, { roomId: id, hostClaimToken: `c-${id}` });
      }
      const m = /^\/rooms\/([^/]+)\/([a-z]+)(?:\/([^/]+)\/cancel)?/.exec(url);
      const room = m ? rooms.get(m[1]!) : undefined;
      if (!m || !room) return json(404, { error: "Room not found" });
      if (m[2] === "join") {
        counts.join++;
        if (room.joined) return json(400, { error: "This is a private solo room" });
        if (body["hostClaimToken"] !== room.claim) return json(400, { error: "Host claim requires the room creation token" });
        room.joined = true;
        return json(201, { playerId: "p1", recoveryToken: room.token });
      }
      if (token !== room.token) return json(401, { error: "Session token required" });
      if (m[2] === "projection") {
        counts.projection++;
        return json(200, { roomKind: "solo", players: [{ id: "p1" }], games: room.games, myGames: room.games.map((g) => ({ id: g.id })) });
      }
      if (m[2] === "games" && m[3]) { room.games = room.games.filter((g) => g.id !== m[3] || g.status === "finished"); return json(200, {}); }
      if (m[2] === "games") {
        counts.games++;
        room.games = room.games.filter((g) => g.status === "finished");
        const g = { id: `g${++seq}`, gameId: String(body["gameId"]), status: "playing" };
        room.games.push(g);
        return json(201, { gameId: g.id, status: "playing" });
      }
      if (m[2] === "intents") return json(200, { accepted: true });
      return json(404, { error: "?" });
    };
    return { rooms, counts, handle };
  }

  /** A fetch that sends each request to `route`, recording it. */
  function harness(route: Handler) {
    const calls: { url: string; method: string; signal?: AbortSignal }[] = [];
    const f = ((url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", ...(init.signal ? { signal: init.signal } : {}) });
      return route(url, init);
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  const sessions: SoloSession[] = [];
  beforeEach(() => { forgetPageSeat(); });
  afterEach(() => { for (const s of sessions.splice(0)) s.dispose(); });
  function session(f: typeof fetch, store: KeyValueStore | null = null, opts: { pollMs?: number; staleAfterMs?: number } = {}) {
    const seen: SoloState[] = [];
    const s = new SoloSession({ store, onChange: (st) => seen.push(st), fetch: f, pollMs: opts.pollMs ?? 60_000, requestTimeoutMs: 150, startBudgetMs: 2_000, ...(opts.staleAfterMs ? { staleAfterMs: opts.staleAfterMs } : {}) });
    sessions.push(s);
    return { s, seen };
  }

  it("a create that never answers ends Start at its timeout with the request aborted; Try again works", async () => {
    const srv = soloServer();
    let stall = true;
    const h = harness((url, init) => (stall && url === "/rooms" ? noReply(init) : srv.handle(url, init)));
    const { s } = session(h.f);
    const t0 = Date.now();
    await s.start("math-mayhem");
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(s.current).toMatchObject({ phase: "error", failure: "transient", error: SOLO_UNREACHABLE });
    expect(h.calls[0]!.signal?.aborted).toBe(true);
    stall = false;
    await s.start("math-mayhem"); // Try again
    expect(s.current.phase).toBe("playing");
    expect(srv.counts.rooms).toBe(1);
  });

  it("headers, then a body that stalls: Start still ends at its timeout and the body read is aborted", async () => {
    const srv = soloServer();
    let bodyAborted = false;
    const h = harness((url, init) => {
      if (url !== "/rooms") return srv.handle(url, init);
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode("{"));
          init.signal?.addEventListener("abort", () => { bodyAborted = true; c.error(new DOMException("aborted", "AbortError")); }, { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 201, headers: { "content-type": "application/json" } }));
    });
    const { s } = session(h.f);
    await s.start("math-mayhem");
    expect(s.current).toMatchObject({ phase: "error", failure: "transient" });
    expect(bodyAborted).toBe(true);
  });

  it("dispose while a request is pending: it is aborted, Start returns at once, and nothing reaches the screen after", async () => {
    const h = harness(() => new Promise<Response>(() => {})); // ignores the abort too
    const { s, seen } = session(h.f);
    const started = s.start("math-mayhem");
    await sleep(10);
    const before = seen.length;
    const t0 = Date.now();
    s.dispose();
    await started;
    expect(Date.now() - t0).toBeLessThan(100);
    expect(h.calls[0]!.signal?.aborted).toBe(true);
    expect(seen.length).toBe(before);
  });

  it("Leave while Start waits: a reply that still arrives afterwards cannot revive the run", async () => {
    const srv = soloServer();
    let release!: () => void;
    const late = new Promise<void>((r) => { release = r; });
    const h = harness(async (url, init) => {
      if (url.endsWith("/games")) { const reply = await srv.handle(url, init); await late; return reply; } // ignores the abort
      return srv.handle(url, init);
    });
    const { s } = session(h.f, null, { pollMs: 10 });
    const started = s.start("math-mayhem");
    while (srv.counts.games === 0) await sleep(5);
    await s.leave();
    release();
    await started;
    const polls = srv.counts.projection;
    await sleep(80);
    expect(s.current.phase).toBe("idle");
    expect(srv.counts.projection).toBe(polls); // no polling started for the left run
  });

  it("Start gets no answer but the server did start the round: it is adopted, not started twice", async () => {
    const srv = soloServer();
    const h = harness(async (url, init) => {
      if (url.endsWith("/games") && (init.method ?? "GET") === "POST") { await srv.handle(url, init); return noReply(init); }
      return srv.handle(url, init);
    });
    const { s } = session(h.f);
    await s.start("math-mayhem");
    expect(s.current).toMatchObject({ phase: "playing", gameInstanceId: "g1" });
    expect(s.current.replacedOpenRound).toBeUndefined();
    expect(srv.counts.games).toBe(1);
    expect([...srv.rooms.values()][0]!.games.filter((g) => g.status === "playing")).toHaveLength(1);
  });

  it("Start gets no answer and the round never reached the server: an error, and Try again starts one", async () => {
    const srv = soloServer();
    let drop = true;
    const h = harness((url, init) => (drop && url.endsWith("/games") ? noReply(init) : srv.handle(url, init)));
    const { s } = session(h.f);
    await s.start("math-mayhem");
    expect(s.current).toMatchObject({ phase: "error", failure: "transient" });
    expect(srv.counts.games).toBe(0);
    drop = false;
    await s.start("math-mayhem");
    expect(s.current.phase).toBe("playing");
    expect(srv.counts.games).toBe(1);
  });

  it("a room made but whose join got no answer is joined on Try again, not replaced", async () => {
    const srv = soloServer();
    let drop = true;
    const h = harness((url, init) => (drop && url.endsWith("/join") ? noReply(init) : srv.handle(url, init)));
    const { s } = session(h.f);
    await s.start("math-mayhem");
    expect(s.current.phase).toBe("error");
    drop = false;
    await s.start("math-mayhem");
    expect(s.current.phase).toBe("playing");
    expect(srv.counts.rooms).toBe(1);
    expect(s.roomId).toBe("r1");
  });

  for (const how of ["401: the server no longer accepts the seat", "404: the server no longer has the room"]) {
    it(`a lost seat (${how}): the round says so, polling stops, and a new round starts in a new room`, async () => {
      const srv = soloServer();
      const h = harness(srv.handle);
      const { s } = session(h.f, null, { pollMs: 10 });
      await s.start("math-mayhem");
      expect(s.current.phase).toBe("playing");
      if (how.startsWith("401")) srv.rooms.get("r1")!.token = "rotated"; else srv.rooms.delete("r1");
      await s.refresh();
      expect(s.current).toMatchObject({ phase: "lost", error: SOLO_LOST });
      const projections = h.calls.filter((c) => c.url.includes("/projection")).length;
      await sleep(60);
      expect(h.calls.filter((c) => c.url.includes("/projection")).length).toBe(projections); // stopped
      await s.start("math-mayhem"); // Start a new round
      expect(s.current.phase).toBe("playing");
      expect(srv.counts.rooms).toBe(2);
      expect(s.roomId).toBe("r2");
    });
  }

  it("a passing outage (500s, then no network) keeps the round and the seat, says so after the allowance, and recovers", async () => {
    const srv = soloServer();
    let fault: "none" | "500" | "network" = "none";
    const h = harness((url, init) => {
      if (url.includes("/projection") && fault === "500") return Promise.resolve(json(500, { error: "busy" }));
      if (url.includes("/projection") && fault === "network") return Promise.reject(new TypeError("Failed to fetch"));
      return srv.handle(url, init);
    });
    const { s } = session(h.f, null, { pollMs: 15, staleAfterMs: 120 });
    await s.start("math-mayhem");
    fault = "500";
    await sleep(60);
    expect(s.current).toMatchObject({ phase: "playing", gameInstanceId: "g1" });
    expect(s.current.stale).toBeFalsy(); // a blip is not announced
    fault = "network";
    await sleep(150);
    expect(s.current).toMatchObject({ phase: "playing", gameInstanceId: "g1", stale: true });
    fault = "none";
    await sleep(60);
    expect(s.current).toMatchObject({ phase: "playing", gameInstanceId: "g1", stale: false });
    expect(srv.counts.rooms).toBe(1);
  });

  for (const fault of ["500", "network", "no reply"] as const) {
    it(`checking a good seat fails (${fault}): Start fails, no new room is made, and Try again reuses the room`, async () => {
      const srv = soloServer();
      const store = new MemoryStore();
      const first = session(harness(srv.handle).f, store);
      await first.s.start("math-mayhem");
      await first.s.leave();
      forgetPageSeat();
      let on = true;
      const h = harness((url, init) => {
        if (on && url.includes("/projection")) {
          if (fault === "500") return Promise.resolve(json(500, { error: "busy" }));
          if (fault === "network") return Promise.reject(new TypeError("Failed to fetch"));
          return noReply(init);
        }
        return srv.handle(url, init);
      });
      const { s } = session(h.f, store);
      await s.start("math-mayhem");
      expect(s.current).toMatchObject({ phase: "error", failure: "transient" });
      expect(srv.counts.rooms).toBe(1);
      on = false;
      await s.start("math-mayhem");
      expect(s.current.phase).toBe("playing");
      expect(srv.counts.rooms).toBe(1);
      expect(s.roomId).toBe("r1");
    });
  }

  it("an answer whose request gets no reply is bounded too, and the round carries on", async () => {
    const srv = soloServer();
    const h = harness((url, init) => (url.endsWith("/intents") ? noReply(init) : srv.handle(url, init)));
    const { s } = session(h.f);
    await s.start("math-mayhem");
    const t0 = Date.now();
    await s.intent("g1", "submit-math-answer", { questionId: "math-1", chosenIndex: 0 });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(h.calls.find((c) => c.url.endsWith("/intents"))!.signal?.aborted).toBe(true);
    expect(s.current.phase).toBe("playing");
  });
});

