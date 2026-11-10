/**
 * Stage 6.2: the solo shelf. The server's solo allowlist, privacy of the two
 * new games inside a solo room, their scores through the solo room, the rules
 * versions tied to the rules, the client adapters read against real
 * projections, a join whose reply was lost, and switching games on one seat.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_REGISTRY, SOLO_GAME_IDS } from "../src/games/registry.js";
import { GAME_MANIFESTS, validateManifest } from "../src/games/manifest.js";
import { MATH_QUESTION_COUNT, MATH_RULES_VERSION } from "../src/games/mathRules.js";
import { PULSE_GRACE_MS, PULSE_LENGTHS, PULSE_POINTS, PULSE_RULES_VERSION, PULSE_SYMBOLS, pulseInputMs, pulsePattern, pulseShowMs } from "../src/games/modules/pulse.js";
import { CONNECTIONS_RULES_VERSION, connectionsScore, guessConnections, type ConnectionsBoard } from "../src/games/connections.js";
import { DEFAULT_CONTENT_DIR, loadContent } from "../src/content/registry.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, StartRefused } from "../src/server/room.js";
import { CONNECTIONS_SOLO, PULSE_SOLO, SOLO_GAME_RULES } from "../apps/web/src/solo/soloRules.js";
import { SoloSession, forgetPageSeat } from "../apps/web/src/solo/soloSession.js";
import type { PlayerGame, PublicGame } from "../apps/web/src/types.js";

const intent = (roomId: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });

function soloRoom() {
  const engine = new RoomEngine("solo", { kind: "solo" });
  const me = engine.join("You", { asHost: true }).player.id;
  return { engine, me };
}
/** The room as this player's phone sees it (the projection the solo screens read). */
function views(engine: RoomEngine, me: string, gid: string) {
  const p = engine.project("player", me) as { games: PublicGame[]; myGames: PlayerGame[] };
  return { pub: p.games.find((g) => g.id === gid), mine: p.myGames.find((g) => g.id === gid), json: JSON.stringify(p) };
}

describe("the server's solo allowlist", () => {
  it("is exactly Math Mayhem, Pattern Pulse and Word Connections, and the manifest agrees", () => {
    expect([...SOLO_GAME_IDS].sort()).toEqual(["math-mayhem", "pattern-pulse", "word-connections"]);
    for (const m of GAME_MANIFESTS) expect(validateManifest(m), m.id).toEqual([]);
    expect(GAME_MANIFESTS.filter((m) => m.soloPlay).map((m) => m.id).sort()).toEqual([...SOLO_GAME_IDS].sort());
    expect(SOLO_GAME_RULES.map((a) => a.gameId).sort()).toEqual([...SOLO_GAME_IDS].sort());
  });

  it("refuses every other game in a solo room, by name, whatever its player minimum", () => {
    for (const g of GAME_REGISTRY.filter((x) => !x.soloPlay)) {
      const { engine, me } = soloRoom();
      let refused: unknown;
      try { engine.startGame(me, g.id, { official: false }); } catch (e) { refused = e; }
      expect(refused, g.id).toBeInstanceOf(StartRefused);
      expect((refused as StartRefused).code, g.id).toBe("NOT_A_SOLO_GAME");
      expect(engine.games.size, g.id).toBe(0);
    }
  });

  it("starts each solo game in a solo room; official play is still refused there", () => {
    for (const id of SOLO_GAME_IDS) {
      const { engine, me } = soloRoom();
      expect(engine.startGame(me, id, { official: false }).status, id).toBe("playing");
      // Refused either as a solo room (NOT_A_CUP_ROOM) or, for Pulse, first as practice-only.
      expect(() => engine.startGame(me, id, { official: true }), id).toThrow();
    }
  });

  it("changes nothing elsewhere: a casual or Cup room still plays any game its players allow", () => {
    const casual = new RoomEngine("c", { kind: "casual" });
    const ids = ["A", "B", "C", "D"].map((n, i) => casual.join(n, { asHost: i === 0 }).player.id);
    expect(casual.startGame(ids[0]!, "impostor", { official: false }).status).not.toBe("finished");
    const lone = new RoomEngine("c1", { kind: "casual" });
    const h = lone.join("A", { asHost: true }).player.id;
    expect(() => lone.startGame(h, "trivia")).toThrow(/at least 2/); // the minimum, not the allowlist
  });

  describe("over HTTP", () => {
    let server: LocalServer; let base = "";
    beforeAll(async () => { server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s62-")) }); base = `http://127.0.0.1:${await server.listen(0)}`; });
    afterAll(async () => { await server.close(); });
    it("a forged start of a social game in a solo room is refused (409 NOT_A_SOLO_GAME)", async () => {
      const post = async (path: string, body: unknown, token?: string) => {
        const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json() as Record<string, unknown> };
      };
      const room = (await post("/rooms", { kind: "solo" })).body;
      const me = (await post(`/rooms/${room["roomId"]}/join`, { displayName: "You", asHost: true, hostClaimToken: room["hostClaimToken"] })).body;
      for (const gameId of ["trivia", "draw-guess", "impostor", "majority-rules"]) {
        const r = await post(`/rooms/${room["roomId"]}/games`, { gameId, official: false }, String(me["recoveryToken"]));
        expect(r.status, gameId).toBe(409);
        expect(r.body["code"], gameId).toBe("NOT_A_SOLO_GAME");
      }
      expect((await post(`/rooms/${room["roomId"]}/games`, { gameId: "pattern-pulse", official: false }, String(me["recoveryToken"]))).status).toBe(201);
    });
  });
});

describe("Pattern Pulse in a solo room", () => {
  it("shows a pattern only while it is memorised; never a future round's, never the seed", () => {
    const { engine, me } = soloRoom();
    let t = 1_000_000;
    engine.clock = () => t;
    const g = engine.startGame(me, "pattern-pulse", { official: false, seed: 77 });
    const seed = (g.extra as { seed: number }).seed;
    const future = pulsePattern(seed, me, 1).join(",");
    let v = views(engine, me, g.id);
    expect((v.mine?.state as { open?: unknown }).open).toBeUndefined();
    expect(v.json).not.toContain(`"seed"`);
    engine.submitIntent(intent(engine.id, g.id, "pulse-open", { round: 0 }), me, t);
    v = views(engine, me, g.id);
    const open = (v.mine?.state as { open?: { pattern?: number[] } }).open;
    expect(open?.pattern).toEqual(pulsePattern(seed, me, 0));
    expect(JSON.stringify(v.pub)).not.toContain("pattern\":["); // the public view never has one
    expect(v.json).not.toContain(future);
    t += pulseShowMs(3) + 1; // memorising is over
    v = views(engine, me, g.id);
    expect((v.mine?.state as { open?: { pattern?: number[] } }).open?.pattern).toBeUndefined();
  });

  it("scores through the solo room as in multiplayer: six perfect rounds are 960", () => {
    const { engine, me } = soloRoom();
    const g = engine.startGame(me, "pattern-pulse", { official: false, seed: 5 });
    const seed = (g.extra as { seed: number }).seed;
    for (let r = 0; r < PULSE_LENGTHS.length; r++) {
      expect(engine.submitIntent(intent(engine.id, g.id, "pulse-open", { round: r }), me).accepted).toBe(true);
      expect(engine.submitIntent(intent(engine.id, g.id, "pulse-answer", { round: r, sequence: pulsePattern(seed, me, r) }), me).accepted).toBe(true);
    }
    const done = engine.games.get(g.id)!;
    expect(done.status).toBe("finished");
    expect(done.rawScores[me]).toBe(960);
  });
});

describe("Word Connections in a solo room", () => {
  const boardOf = (engine: RoomEngine, gid: string) => (engine.games.get(gid)!.extra as { board: ConnectionsBoard }).board;
  const groupIds = (b: ConnectionsBoard, name: string) => b.tiles.filter((t) => t.category === name).map((t) => t.id);

  it("never shows a group's name or membership before the end", () => {
    const { engine, me } = soloRoom();
    const g = engine.startGame(me, "word-connections", { official: false, seed: 3 });
    const b = boardOf(engine, g.id);
    const v = views(engine, me, g.id);
    for (const c of b.categories) expect(v.json, c.name).not.toContain(c.name);
    expect((v.pub?.state as { groups?: unknown }).groups).toBeUndefined();
  });

  it("scores through the solo room: solved with no mistakes is 450; four mistakes end it at 0", () => {
    const a = soloRoom();
    const g = a.engine.startGame(a.me, "word-connections", { official: false, seed: 3 });
    const b = boardOf(a.engine, g.id);
    for (const c of b.categories) expect(a.engine.submitIntent(intent(a.engine.id, g.id, "connections-guess", { tileIds: groupIds(b, c.name) }), a.me).accepted).toBe(true);
    expect(a.engine.games.get(g.id)!.rawScores[a.me]).toBe(450);
    const z = soloRoom();
    const g2 = z.engine.startGame(z.me, "word-connections", { official: false, seed: 3 });
    const b2 = boardOf(z.engine, g2.id);
    const [c0, c1] = b2.categories;
    for (let i = 0; i < 4; i++) {
      const mixed = [...groupIds(b2, c0!.name).slice(0, 2), ...groupIds(b2, c1!.name).slice(i % 2, (i % 2) + 2)];
      const mixed2 = i < 2 ? mixed : [...groupIds(b2, c0!.name).slice(2, 4), ...groupIds(b2, c1!.name).slice((i % 2), (i % 2) + 2)];
      z.engine.submitIntent(intent(z.engine.id, g2.id, "connections-guess", { tileIds: mixed2 }), z.me);
    }
    const done = z.engine.games.get(g2.id)!;
    expect(done.status).toBe("finished");
    expect(done.rawScores[z.me]).toBe(0);
  });

  /** The boards a solo room deals in 14 starts (each left at once: a left round still counts as used). */
  function dealt(lib: ReturnType<typeof loadContent>): string[] {
    const { engine, me } = soloRoom();
    engine.content = lib;
    const out: string[] = [];
    for (let i = 0; i < 14; i++) {
      const g = engine.startGame(me, "word-connections", { official: false });
      out.push(boardOf(engine, g.id).categories.map((c) => c.name).sort().join("|"));
      engine.abandonSoloRound(me, g.id);
    }
    return out;
  }

  it("with the shipped library: 12 different boards, then repeats, least recently used first", () => {
    const shipped = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: false });
    const boards = dealt(shipped);
    expect(new Set(boards.slice(0, 12)).size).toBe(12);
    expect(boards[12]).toBe(boards[0]);
    expect(boards[13]).toBe(boards[1]);
  });

  it("CURRENT BEHAVIOUR (spec §5, concern 1): if every board were approved for official play, a solo room would deal the same board every time", () => {
    // The Cup rule (practice reuses used items before retiring a fresh
    // official one) protects official content, which a solo room never
    // plays. Pinned here so a decision to change it is deliberate.
    const allApproved = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
    const boards = dealt(allApproved);
    expect(new Set(boards).size).toBe(1);
  });
});

describe("rules versions are tied to the rules", () => {
  // If one of these fails, a rule changed: bump that game's *_RULES_VERSION
  // (so old personal bests stop comparing with new rounds) and update here.
  it("Pattern Pulse v1", () => {
    expect(PULSE_RULES_VERSION).toBe(1);
    expect({ lengths: [...PULSE_LENGTHS], symbols: PULSE_SYMBOLS, points: PULSE_POINTS, grace: PULSE_GRACE_MS, show: PULSE_LENGTHS.map(pulseShowMs), input: PULSE_LENGTHS.map(pulseInputMs) })
      .toEqual({ lengths: [3, 4, 5, 6, 7, 8], symbols: 6, points: { perSymbol: 20, perfect: 50 }, grace: 1500, show: [3300, 4000, 4700, 5400, 6100, 6800], input: [16500, 18000, 19500, 21000, 22500, 24000] });
  });
  it("Word Connections v1", () => {
    expect(CONNECTIONS_RULES_VERSION).toBe(1);
    const grid = [0, 1, 2, 3, 4].map((solved) => [0, 1, 2, 3].map((mistakes) => connectionsScore({ solved: Array(solved).fill("x"), mistakes, guessed: [] })));
    expect(grid).toEqual([[0, 0, 0, 0], [100, 100, 100, 100], [200, 200, 200, 200], [300, 300, 300, 300], [450, 420, 400, 400]]);
    // The mistake limit: the fourth wrong guess ends the puzzle.
    const board: ConnectionsBoard = { categories: ["A", "B", "C", "D"].map((n) => ({ name: n, tiles: [1, 2, 3, 4].map((i) => `${n}${i}`) })), tiles: [] };
    board.tiles = board.categories.flatMap((c) => c.tiles.map((t) => ({ id: t, text: t, category: c.name })));
    const ps = { solved: [], mistakes: 0, guessed: [] as string[][] };
    const wrongs = [["A1", "A2", "B1", "B2"], ["A1", "A3", "B1", "B2"], ["A1", "A4", "B1", "B2"], ["A2", "A3", "B1", "B2"]];
    expect(wrongs.map((w) => guessConnections(board, ps, w).finished)).toEqual([false, false, false, true]);
  });
  it("Math Mayhem v1", () => {
    expect(MATH_RULES_VERSION).toBe(1);
    expect(MATH_QUESTION_COUNT).toBe(10);
  });
});

describe("the solo adapters, read against real projections", () => {
  // The review screens (Pulse recap, Connections solution) are checked in the browser (check-solo-shelf).
  it("Pattern Pulse: score from the server and its own headline", () => {
    const { engine, me } = soloRoom();
    const g = engine.startGame(me, "pattern-pulse", { official: false, seed: 9 });
    const seed = (g.extra as { seed: number }).seed;
    for (let r = 0; r < 6; r++) {
      engine.submitIntent(intent(engine.id, g.id, "pulse-open", { round: r }), me);
      const p = pulsePattern(seed, me, r);
      const answer = r % 2 === 0 ? p : [(p[0]! + 1) % 6, ...p.slice(1)];
      engine.submitIntent(intent(engine.id, g.id, "pulse-answer", { round: r, sequence: answer }), me);
    }
    const { mine, pub } = views(engine, me, g.id);
    expect(PULSE_SOLO.summarize(mine, pub, me)).toEqual({ score: engine.games.get(g.id)!.rawScores[me], headline: "3 of 6 rounds perfect" });
    expect(PULSE_SOLO.howToPlay + PULSE_SOLO.scoring).not.toMatch(/sums|correct answer/);
  });

  it("Word Connections: score from the server and its headline", () => {
    const { engine, me } = soloRoom();
    const g = engine.startGame(me, "word-connections", { official: false, seed: 4 });
    const b = (engine.games.get(g.id)!.extra as { board: ConnectionsBoard }).board;
    const ids = (n: string) => b.tiles.filter((t) => t.category === n).map((t) => t.id);
    engine.submitIntent(intent(engine.id, g.id, "connections-guess", { tileIds: ids(b.categories[0]!.name) }), me);
    const [x, y] = [b.categories[1]!.name, b.categories[2]!.name];
    // Four different wrong guesses: a different pair of x each time, with two of y.
    for (const k of [0, 1, 2, 3]) engine.submitIntent(intent(engine.id, g.id, "connections-guess", { tileIds: [ids(x)[k]!, ids(x)[(k + 1) % 4]!, ...ids(y).slice(0, 2)] }), me);
    const { mine, pub } = views(engine, me, g.id);
    expect(pub?.status).toBe("finished");
    expect(CONNECTIONS_SOLO.summarize(mine, pub, me)).toEqual({ score: 100, headline: "Found 1 of 4 groups · out of guesses" });
    expect(((mine?.state ?? {}) as { mySolved?: unknown[] }).mySolved).toHaveLength(1);
    expect(((pub?.state ?? {}) as { groups?: unknown[] }).groups).toHaveLength(4); // the solution, only now the round is over
  });

  it("no summary (so no personal best) before the server has finished the round", () => {
    const { engine, me } = soloRoom();
    const g = engine.startGame(me, "word-connections", { official: false, seed: 4 });
    const { mine, pub } = views(engine, me, g.id);
    expect(pub?.status).toBe("playing");
    // The summary reads the server's record; the shell files a best only when status is finished.
    expect(CONNECTIONS_SOLO.summarize(mine, pub, me)?.score ?? 0).toBe(0);
  });
});

describe("the solo session across games, and a join whose reply was lost", () => {
  let server: LocalServer; let base = "";
  const realFetch = globalThis.fetch;
  let roomsCreated = 0;
  let dropJoinReply = 0;
  const sessions: SoloSession[] = [];
  beforeAll(async () => { server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s62s-")) }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  beforeEach(() => {
    forgetPageSeat(); roomsCreated = 0; dropJoinReply = 0;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      if (input === "/rooms" && rest.method === "POST") roomsCreated++;
      const reply = await realFetch(`${base}${input}`, rest);
      if (dropJoinReply > 0 && /\/join$/.test(input)) {
        dropJoinReply--;
        // The join reached the server and worked; its reply never arrives.
        return new Promise<Response>((_, reject) => rest.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      }
      return reply;
    });
  });
  afterEach(() => { for (const s of sessions.splice(0)) s.dispose(); vi.unstubAllGlobals(); });
  const session = () => { const s = new SoloSession({ store: null, onChange: () => {}, pollMs: 60_000, requestTimeoutMs: 300 }); sessions.push(s); return s; };

  it("Math → Pulse → Connections → Math: one room, each round fresh, nothing carried over", async () => {
    const order = ["math-mayhem", "pattern-pulse", "word-connections", "math-mayhem"];
    const gids: string[] = [];
    let roomId: string | undefined;
    for (const id of order) {
      const s = session(); // a new screen per game, as the app mounts one
      await s.start(id);
      expect(s.current.phase, id).toBe("playing");
      const gid = s.current.gameInstanceId!;
      gids.push(gid);
      roomId ??= s.roomId;
      expect(s.roomId, id).toBe(roomId);
      const mine = (s.current.proj?.myGames ?? []).find((g) => g.id === gid);
      expect(mine?.gameId, id).toBe(id);
      expect(Object.keys(mine?.myAnswers ?? {}), id).toHaveLength(0);
      await s.leave();
    }
    expect(new Set(gids).size).toBe(4);
    expect(roomsCreated).toBe(1);
  });

  it("a join that worked but whose reply was lost: Try again gives that room up and makes a new one, never using the old id without a token", async () => {
    dropJoinReply = 1;
    const s = session();
    await s.start("word-connections");
    expect(s.current.phase).toBe("error");
    expect(roomsCreated).toBe(1);
    const lostRoom = [...(server as unknown as { rooms: Map<string, RoomEngine> }).rooms.values()].find((r) => r.kind === "solo")!.id;
    await s.start("word-connections"); // Try again
    expect(s.current.phase).toBe("playing");
    expect(roomsCreated).toBe(2);
    expect(s.roomId).not.toBe(lostRoom);
  });
});
