/**
 * Stage 6.1: room kinds (cup / casual / solo), the solo round's lifecycle and
 * the Cup's isolation from casual and solo play. Engine rules first, then the
 * same rules over HTTP, because the server (not the UI) must enforce them.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MATH_QUESTION_COUNT, MATH_RULES_VERSION } from "../src/games/math.js";
import { getGame } from "../src/games/registry.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, StartRefused, type RoomKind } from "../src/server/room.js";

function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown> = {}, clientEventId: string = randomUUID()) {
  return { kind: "intent", schemaVersion: 1, clientEventId, roomId, gameInstanceId: gameId, action, payload };
}

function room(kind: RoomKind, players: number, timing: 1 | 2 = 2) {
  const engine = new RoomEngine("Stage 6.1", { kind, timing });
  const ids: string[] = [];
  for (let i = 0; i < players; i++) ids.push(engine.join(`P${i + 1}`, { asHost: i === 0 }).player.id);
  return { engine, host: ids[0]!, ids };
}

const officialGames = (e: RoomEngine) => [...e.games.values()].filter((g) => g.official);

describe("room kinds: what each kind allows", () => {
  it("a room is a Family Cup unless created otherwise (as every room before Stage 6.1)", () => {
    expect(new RoomEngine("x").kind).toBe("cup");
  });

  it("casual and solo rooms refuse official games, with a reason; practice still starts", () => {
    for (const kind of ["casual", "solo"] as const) {
      const { engine, host } = room(kind, kind === "solo" ? 1 : 2);
      let refused: unknown;
      try { engine.startGame(host, "math-mayhem", { official: true }); } catch (e) { refused = e; }
      expect(refused).toBeInstanceOf(StartRefused);
      expect((refused as StartRefused).code).toBe("NOT_A_CUP_ROOM");
      expect(engine.games.size).toBe(0); // nothing created, nothing selected
      const g = engine.startGame(host, "math-mayhem", { official: false });
      expect(g.official).toBe(false);
    }
  });

  it("a Cup room still plays official games with 2 players, and practice", () => {
    const { engine, host } = room("cup", 2, 1);
    const g = engine.startGame(host, "math-mayhem", { official: true, seed: 3 });
    expect(g.official).toBe(true);
  });

  it("a casual room has no Cup days; a Cup room still advances", () => {
    expect(() => room("casual", 2).engine.advanceDay(room("casual", 2).host)).toThrow(/not a Family Cup/);
    const cup = room("cup", 2);
    expect(cup.engine.advanceDay(cup.host)).toBe(2);
  });

  it("a solo room has one private seat: no second player, no spectator", () => {
    const { engine } = room("solo", 1);
    expect(() => engine.join("Someone else")).toThrow(/private solo room/);
    expect(() => engine.addSpectator()).toThrow(/private solo room/);
  });

  it("a solo room never opens a briefing, even when created with timing v2", () => {
    const { engine, host } = room("solo", 1, 2);
    expect(engine.startGame(host, "math-mayhem").status).toBe("playing");
    const casual = room("casual", 2, 2);
    expect(casual.engine.startGame(casual.host, "math-mayhem").status).toBe("briefing"); // casual keeps the fair start
  });
});

describe("honest requirements: Math Mayhem's hard minimum is 1, best with 2+", () => {
  it("the registry separates the hard minimum from the recommendation", () => {
    const m = getGame("math-mayhem");
    expect(m.minPlayers).toBe(1);
    expect(m.recommendedPlayers).toBe(2);
  });

  it("one player can start Math as practice, but never as official (D1, unchanged)", () => {
    const { engine, host } = room("cup", 1, 1);
    expect(() => engine.startGame(host, "math-mayhem", { official: true })).toThrow(/at least 2 players/);
    expect(engine.startGame(host, "math-mayhem", { official: false }).status).toBe("playing");
  });

  it("social games still refuse to start alone", () => {
    const { engine, host } = room("solo", 1);
    expect(() => engine.startGame(host, "trivia")).toThrow(/at least 2/);
    expect(() => engine.startGame(host, "impostor")).toThrow(/at least 4/);
  });
});

describe("the solo Math round", () => {
  function solo() {
    const r = room("solo", 1);
    const game = r.engine.startGame(r.host, "math-mayhem", { seed: 11 });
    return { ...r, game };
  }
  const answer = (engine: RoomEngine, gameId: string, pid: string, q: { id: string; correctIndex: number }, now?: number, eventId?: string) =>
    engine.submitIntent(intent(engine.id, gameId, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, eventId), pid, now);

  // The speed bonus is timed from when a question is shown on the phone
  // (S3-MTH-01); these engine tests never show one, so a correct answer
  // scores its base 100 here.
  it("is the existing engine: 10 questions, four choices each, 100 per correct answer", () => {
    const { engine, host, game } = solo();
    expect(game.questions).toHaveLength(MATH_QUESTION_COUNT);
    for (const q of game.questions!) expect(q.options).toHaveLength(4);
    for (const q of game.questions!) expect(answer(engine, game.id, host, q).accepted).toBe(true);
    const done = engine.games.get(game.id)!;
    expect(done.status).toBe("finished");
    expect(done.rawScores[host]).toBe(MATH_QUESTION_COUNT * 100);
    expect(MATH_RULES_VERSION).toBe(1);
  });

  it("a rapid double tap is idempotent: the same intent twice, or a second answer to the same question, counts once", () => {
    const { engine, host, game } = solo();
    const q = game.questions![0]!;
    const id = randomUUID();
    expect(answer(engine, game.id, host, q, undefined, id).accepted).toBe(true);
    answer(engine, game.id, host, q, undefined, id); // the same intent again (a retry)
    const second = answer(engine, game.id, host, q); // a second tap: a new intent, same question
    expect(second.accepted).toBe(false);
    expect(Object.keys(engine.games.get(game.id)!.answers[host] ?? {})).toHaveLength(1);
    expect(engine.games.get(game.id)!.rawScores[host]).toBe(100);
  });

  it("a late answer follows the existing rules: refused after the deadline, nothing scored", () => {
    const { engine, host, game } = solo();
    const late = game.deadlineAt! + 1;
    const r = answer(engine, game.id, host, game.questions![0]!, late);
    expect(r.accepted).toBe(false);
    expect(engine.games.get(game.id)!.rawScores[host] ?? 0).toBe(0);
  });

  it("starting again mid-round is a safe restart: the open round is removed unscored, the new one starts clean", () => {
    const { engine, host, game } = solo();
    for (const q of game.questions!.slice(0, 3)) answer(engine, game.id, host, q);
    const next = engine.startGame(host, "math-mayhem", { seed: 12 });
    expect(engine.games.has(game.id)).toBe(false);
    expect(next.status).toBe("playing");
    expect(Object.keys(next.answers[host] ?? {})).toHaveLength(0);
    expect(next.rawScores[host]).toBe(0);
    const ev = engine.ledger.find((e) => e.type === "solo-round-abandoned");
    expect(ev?.detail).toMatchObject({ reason: "restarted", gameId: "math-mayhem", answered: 3 });
  });

  it("leaving mid-round removes the round; leaving twice, or a finished round, changes nothing", () => {
    const { engine, host, game } = solo();
    engine.abandonSoloRound(host, game.id);
    expect(engine.games.has(game.id)).toBe(false);
    expect(() => engine.abandonSoloRound(host, game.id)).not.toThrow();
    const again = engine.startGame(host, "math-mayhem", { seed: 13 });
    for (const q of again.questions!) answer(engine, again.id, host, q);
    engine.abandonSoloRound(host, again.id); // finished: kept
    expect(engine.games.get(again.id)!.status).toBe("finished");
  });

  it("only a solo room's own player can leave a round that way", () => {
    const casual = room("casual", 2, 1);
    const g = casual.engine.startGame(casual.host, "math-mayhem");
    expect(() => casual.engine.abandonSoloRound(casual.host, g.id)).toThrow(/solo round/);
  });

  it("three consecutive replays: each round starts clean and scores only itself", () => {
    const { engine, host } = room("solo", 1);
    const scores: number[] = [];
    for (let round = 0; round < 3; round++) {
      const g = engine.startGame(host, "math-mayhem", { seed: 20 + round });
      expect(g.rawScores[host]).toBe(0);
      // Round r answers r + 1 questions correctly, then the rest wrong.
      g.questions!.forEach((q, i) => engine.submitIntent(intent(engine.id, g.id, "submit-math-answer", { questionId: q.id, chosenIndex: i <= round ? q.correctIndex : (q.correctIndex + 1) % 4 }), host));
      const done = engine.games.get(g.id)!;
      expect(done.status).toBe("finished");
      scores.push(done.rawScores[host]!);
    }
    expect(scores).toEqual([100, 200, 300]);
    expect([...engine.games.values()].filter((g) => g.status === "finished")).toHaveLength(3);
  });
});

describe("Cup isolation: casual and solo results never reach a Cup", () => {
  it("finished casual and solo games are practice: no official games, empty official standings", () => {
    // Control: the same play in a Cup room, as official, does produce standings.
    const cup = room("cup", 2, 1);
    const cg = cup.engine.startGame(cup.host, "math-mayhem", { official: true, seed: 5 });
    for (const pid of cup.ids) for (const q of cg.questions!) cup.engine.submitIntent(intent(cup.engine.id, cg.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
    expect(Object.keys((cup.engine.project("tv") as { officialStandings: Record<string, unknown> }).officialStandings).length).toBeGreaterThan(0);
    for (const kind of ["casual", "solo"] as const) {
      const { engine, host, ids } = room(kind, kind === "solo" ? 1 : 2, 1);
      const g = engine.startGame(host, "math-mayhem", { seed: 5 });
      for (const pid of ids) for (const q of g.questions!) engine.submitIntent(intent(engine.id, g.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
      expect(engine.games.get(g.id)!.status).toBe("finished");
      expect(officialGames(engine)).toHaveLength(0);
      const proj = engine.project("tv") as { officialStandings: Record<string, unknown>; roomKind: string };
      expect(proj.officialStandings).toEqual({}); // no player has any official standing
      expect(proj.roomKind).toBe(kind);
    }
  });
});

describe("persistence: the kind survives a restart; older rooms stay Cups", () => {
  it("round-trips each kind, and a snapshot without one restores as a Cup", () => {
    for (const kind of ["cup", "casual", "solo"] as const) {
      const { engine } = room(kind, 1);
      const back = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
      expect(back.kind).toBe(kind);
    }
    const legacy = JSON.parse(JSON.stringify(room("cup", 2).engine.toJSON())) as Record<string, unknown>;
    delete legacy["kind"];
    expect(RoomEngine.fromJSON(legacy).kind).toBe("cup");
    legacy["kind"] = "nonsense";
    expect(RoomEngine.fromJSON(legacy).kind).toBe("cup");
  });
});

describe("over HTTP: the server enforces the same rules", () => {
  let server: LocalServer;
  let base = "";
  beforeAll(async () => {
    server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s61-")) });
    base = `http://127.0.0.1:${await server.listen(0)}`;
  });
  afterAll(async () => { await server.close(); });
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };
  async function create(kind?: RoomKind | string) {
    const r = await post("/rooms", kind === undefined ? { name: "Night" } : { name: "Night", kind });
    expect(r.status).toBe(201);
    const host = await post(`/rooms/${r.body["roomId"]}/join`, { displayName: "Keku", asHost: true, hostClaimToken: r.body["hostClaimToken"] });
    return { roomId: String(r.body["roomId"]), joinCode: String(r.body["joinCode"]), token: String(host.body["recoveryToken"]) };
  }

  it("creates each kind; a missing kind is a Cup; an unknown kind is refused", async () => {
    for (const kind of ["cup", "casual", "solo"]) {
      const r = await create(kind);
      const proj = await (await fetch(`${base}/rooms/${r.roomId}/projection?audience=player`, { headers: { "x-session-token": r.token } })).json() as { roomKind: string };
      expect(proj.roomKind).toBe(kind);
    }
    const legacy = await create();
    expect(((await (await fetch(`${base}/rooms/${legacy.roomId}/projection?audience=tv`)).json()) as { roomKind: string }).roomKind).toBe("cup");
    expect((await post("/rooms", { kind: "tournament" })).status).toBe(400);
    expect((await post("/rooms", { name: "x".repeat(81) })).status).toBe(400);
  });

  it("a solo room's code finds nothing: no joining, no watching", async () => {
    const s = await create("solo");
    expect((await post("/rooms/join-by-code", { joinCode: s.joinCode, displayName: "Intruder" })).status).toBe(404);
    expect((await post("/rooms/spectate-by-code", { joinCode: s.joinCode })).status).toBe(404);
  });

  it("a solo room's code finds nothing for seat recovery either: no seat list, no request, no recovery", async () => {
    const s = await create("solo");
    expect((await post("/rooms/recovery-requests/seats", { joinCode: s.joinCode })).status).toBe(404);
    const proj = await (await fetch(`${base}/rooms/${s.roomId}/projection?audience=player`, { headers: { "x-session-token": s.token } })).json() as { players: { id: string }[] };
    expect((await post("/rooms/recovery-requests", { joinCode: s.joinCode, playerId: proj.players[0]!.id })).status).toBe(404);
    const byCode = await post("/rooms/recover-by-code", { joinCode: s.joinCode, recoveryCode: "ABCD-EFGH" });
    expect(byCode.status).toBe(400); // the same answer as any wrong code
    // A Cup room's seat list by code is unchanged.
    const cup = await create("cup");
    expect((await post("/rooms/recovery-requests/seats", { joinCode: cup.joinCode })).status).toBe(200);
  });

  it("a solo room has no public view: its TV projection and TV socket answer as if it weren't there", async () => {
    const s = await create("solo");
    expect((await fetch(`${base}/rooms/${s.roomId}`)).status).toBe(404);
    expect((await fetch(`${base}/rooms/${s.roomId}/projection?audience=tv`)).status).toBe(404);
    expect((await fetch(`${base}/rooms/${s.roomId}/projection`)).status).toBe(404); // tv is the default audience
    expect((await fetch(`${base}/rooms/${s.roomId}/projection?audience=player`)).status).toBe(401); // the seat's token is required
    expect((await post(`/rooms/${s.roomId}/join`, { displayName: "Intruder" })).status).toBe(404); // no second seat, nor a hint one exists
    const closed = await new Promise<{ code: number; reason: string }>((resolve) => {
      const ws = new WebSocket(`${base.replace("http", "ws")}/ws?roomId=${s.roomId}&audience=tv`);
      ws.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason }));
    });
    expect(closed).toEqual({ code: 1008, reason: "Room not found" });
    // A Cup room's public TV view is unchanged.
    const cup = await create("cup");
    expect((await fetch(`${base}/rooms/${cup.roomId}/projection?audience=tv`)).status).toBe(200);
  });

  it("a casual room: someone joins by code; official starts and official plans are refused", async () => {
    const c = await create("casual");
    expect((await post("/rooms/join-by-code", { joinCode: c.joinCode, displayName: "Amina" })).status).toBe(201);
    const auth = { "x-session-token": c.token };
    const start = await post(`/rooms/${c.roomId}/games`, { gameId: "math-mayhem", official: true }, auth);
    expect(start.status).toBe(409);
    expect(start.body["code"]).toBe("NOT_A_CUP_ROOM");
    expect((await post(`/rooms/${c.roomId}/plan`, { gameId: "math-mayhem", official: true }, auth)).status).toBe(400);
    expect((await post(`/rooms/${c.roomId}/plan`, { gameId: "math-mayhem", official: false }, auth)).status).toBe(200);
  });

  it("a solo round starts at once and can be left over HTTP (cancel)", async () => {
    const s = await create("solo");
    const auth = { "x-session-token": s.token };
    const start = await post(`/rooms/${s.roomId}/games`, { gameId: "math-mayhem", official: false }, auth);
    expect(start.status).toBe(201);
    const gid = String(start.body["gameId"]);
    expect(start.body["status"]).toBe("playing");
    const proj = await (await fetch(`${base}/rooms/${s.roomId}/projection?audience=player`, { headers: auth })).json() as { games: { id: string; status: string }[] };
    expect(proj.games.find((g) => g.id === gid)?.status).toBe("playing");
    expect((await post(`/rooms/${s.roomId}/games/${gid}/cancel`, {}, auth)).status).toBe(200);
    const after = await (await fetch(`${base}/rooms/${s.roomId}/projection?audience=player`, { headers: auth })).json() as { games: { id: string }[] };
    expect(after.games.some((g) => g.id === gid)).toBe(false);
  });
});
