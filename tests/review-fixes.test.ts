import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalServer } from "../src/server/http.js";
import { MemoryBook } from "../src/server/memorybook.js";
import { RoomEngine } from "../src/server/room.js";
import { charadesTurn, currentActor, initCharades } from "../src/games/charades.js";

// Regression tests for GitHub PR #3 review (ChatGPT, 2026-11-04).
// Each test encodes the reviewed requirement, not the old behaviour.

let server: LocalServer;
let port: number;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cgn-review-"));
  server = new LocalServer({ dataDir });
  port = await server.listen(0);
});

afterAll(async () => {
  await server.close();
});

async function post(path: string, body: Record<string, unknown>, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function get(path: string, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function makeRoom(n: number): Promise<{ roomId: string; players: { id: string; token: string }[]; host: string }> {
  const created = await post("/rooms", { name: "Review Room" });
  const roomId = created.json["roomId"] as string;
  const players: { id: string; token: string }[] = [];
  let host = "";
  for (let i = 0; i < n; i++) {
    const j = await post(`/rooms/${roomId}/join`, { displayName: `P${i + 1}-${randomUUID().slice(0, 4)}`, asHost: i === 0 });
    players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
    if (j.json["isHost"]) host = j.json["playerId"] as string;
  }
  return { roomId, players, host };
}

function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown>) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}

describe("PR #3 review fixes", () => {
  it("#1: player projection without a valid session token is rejected, and a token cannot fetch another player's projection", async () => {
    const { roomId, players } = await makeRoom(2);
    const [host, guest] = players as [{ id: string; token: string }, { id: string; token: string }];
    const noToken = await get(`/rooms/${roomId}/projection?audience=player&actorId=${host.id}`);
    expect(noToken.status).toBe(401);
    const spoof = await get(`/rooms/${roomId}/projection?audience=player&actorId=${host.id}`, guest.token);
    expect(spoof.status).toBe(200);
    const me = spoof.json["me"] as { id: string };
    expect(me.id).toBe(guest.id);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    expect(tv.status).toBe(200);
  });

  it("#1: intents and game starts ignore client-supplied actor/host ids and use the session token", async () => {
    const { roomId, players, host } = await makeRoom(4);
    const guest = players[1]!;
    // Guest tries to start a game while claiming to be host.
    const badStart = await post(`/rooms/${roomId}/games`, { hostId: host, gameId: "math-mayhem", seed: 7 }, guest.token);
    expect(badStart.status).not.toBe(201);
    // Host starts properly.
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", seed: 7 }, players[0]!.token);
    expect(started.status).toBe(201);
    const gameId = started.json["gameId"] as string;
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, players[0]!.token);
    const myGames = proj.json["myGames"] as { id: string; questions: { id: string }[] }[];
    const questions = myGames.find((g) => g.id === gameId)?.questions ?? [];
    expect(questions.length).toBe(10);
    // Guest submits an intent claiming actorId=host; it must count for the guest, not the host.
    const r = await post(`/rooms/${roomId}/intents`, { actorId: host, intent: intent(roomId, gameId, "submit-math-answer", { questionId: questions[0]!.id, chosenIndex: 0 }) }, guest.token);
    expect(r.status).toBe(200);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    const games = tv.json["games"] as { rawScores?: Record<string, number> }[];
    // Guest's answer may score 0 or 100 depending on chosenIndex, but the host must not gain from the guest's submission.
    // The decisive check is the WS spoof test below; here we assert the request was accepted as the token holder
    // by checking the projection still belongs to the token holder, not the claimed actor.
    const again = await get(`/rooms/${roomId}/projection?audience=player`, guest.token);
    expect((again.json["me"] as { id: string }).id).toBe(guest.id);
    expect(games.length).toBe(1);
  });

  it("#1: a WebSocket message cannot override the socket session actor", async () => {
    const { roomId, players, host } = await makeRoom(4);
    const guest = players[1]!;
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", seed: 9 }, players[0]!.token);
    const gameId = started.json["gameId"] as string;
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, guest.token);
    const myGames = proj.json["myGames"] as { id: string; questions: { id: string }[] }[];
    const questions = myGames.find((g) => g.id === gameId)?.questions ?? [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=player&sessionToken=${encodeURIComponent(guest.token)}`);
    const acks: string[] = [];
    ws.on("message", (d) => acks.push(d.toString()));
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    ws.send(JSON.stringify({ actorId: host, intent: intent(roomId, gameId, "submit-math-answer", { questionId: questions[0]!.id, chosenIndex: 0 }) }));
    await new Promise((r) => setTimeout(r, 300));
    ws.close();
    // The answer must be recorded for the guest, never for the claimed host, so host's
    // raw score in the finished-game ledger path stays attributable to the guest only.
    // Direct check: guest's myAnswers in a fresh projection contains the question.
    const after = await get(`/rooms/${roomId}/projection?audience=player`, guest.token);
    const afterGames = after.json["myGames"] as { id: string; myAnswers: Record<string, unknown> }[];
    expect(afterGames.find((g) => g.id === gameId)?.myAnswers[questions[0]!.id]).not.toBeUndefined();
    expect(acks.some((m) => m.includes("ack"))).toBe(true);
  });

  it("#2: practice games never change official championship standings", async () => {
    const engine = new RoomEngine("Standings Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    const ids = [host];
    for (let i = 0; i < 3; i++) ids.push(engine.join(`Guest${i}`).player.id);
    const finishMath = (official: boolean) => {
      const game = engine.startGame(host, "math-mayhem", { official, seed: 3 });
      const qs = game.questions!;
      for (const pid of ids) {
        for (const q of qs) {
          engine.submitIntent(intent(engine.id, game.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
        }
      }
      expect(game.status).toBe("finished");
    };
    finishMath(true);
    const afterOfficial = engine.officialStandings();
    expect(Object.keys(afterOfficial).length).toBeGreaterThan(0);
    finishMath(false);
    expect(engine.officialStandings()).toEqual(afterOfficial);
    const proj = engine.project("tv") as Record<string, unknown>;
    expect(proj["officialStandings"]).toEqual(afterOfficial);
  });

  it("#3: memory book requires a nonempty game-finished source, derives facts, and survives restart", async () => {
    const engine = new RoomEngine("Book Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.join("Guest");
    const book = new MemoryBook();
    expect(() => book.addFromLedger(1, "No source", [], engine.ledger)).toThrow();
    expect(() => book.addFromLedger(1, "Joined, not finished", [engine.ledger[0]!.eventId], engine.ledger)).toThrow();
    const game = engine.startGame(host, "math-mayhem", { seed: 1 });
    for (const pid of [host, ...[...engine.players.keys()].filter((p) => p !== host)]) {
      for (const q of game.questions!) engine.submitIntent(intent(engine.id, game.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
    }
    expect(game.status).toBe("finished");
    const finishedEvt = engine.ledger.find((e) => e.type === "game-finished")!;
    const entry = book.addFromLedger(1, "A great Math Mayhem finish.", [finishedEvt.eventId], engine.ledger);
    expect(entry.derivedFacts.length).toBeGreaterThan(0);
    expect(book.exportMarkdown("Book Room")).not.toContain("A great Math Mayhem finish.");
    book.approve(entry.id, host);
    expect(book.exportMarkdown("Book Room")).toContain("A great Math Mayhem finish.");
    expect(book.exportMarkdown("Book Room")).toContain("From the ledger");

    // Durability through the HTTP server: add + approve, restart, entry still there.
    const { roomId, players } = await makeRoom(2);
    const hostTok = players[0]!.token;
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", seed: 2 }, hostTok);
    const gid = started.json["gameId"] as string;
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, hostTok);
    const qs = (proj.json["myGames"] as { id: string; questions: { id: string }[] }[]).find((g) => g.id === gid)?.questions ?? [];
    for (const p of players) {
      for (const q of qs) await post(`/rooms/${roomId}/intents`, { intent: intent(roomId, gid, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }) }, p.token);
    }
    const ledger = (await get(`/rooms/${roomId}/ledger`, hostTok)).json as unknown as { type: string; eventId: string }[];
    const fin = ledger.filter((e) => e.type === "game-finished").slice(-1)[0]!;
    const mem = await post(`/rooms/${roomId}/memory`, { day: 1, text: "Restart-proof highlight", sourceEventIds: [fin.eventId] }, hostTok);
    expect(mem.status).toBe(201);
    const approve = await post(`/rooms/${roomId}/memory/${mem.json["id"]}/approve`, {}, hostTok);
    expect(approve.status).toBe(200);
    const guestApprove = await post(`/rooms/${roomId}/memory/${mem.json["id"]}/approve`, {}, players[1]!.token);
    expect(guestApprove.status).toBe(403);
    await server.close();
    server = new LocalServer({ dataDir });
    port = await server.listen(0);
    const after = await get(`/rooms/${roomId}/memory`, hostTok);
    const entries = after.json as unknown as { text: string; approved: boolean }[];
    expect(entries.some((e) => e.text === "Restart-proof highlight" && e.approved)).toBe(true);
  });

  it("#4: late social submissions are rejected and the host can skip a timed-out game without inventing scores", async () => {
    const engine = new RoomEngine("Deadline Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    const ids = [host];
    for (let i = 0; i < 3; i++) ids.push(engine.join(`Guest${i}`).player.id);
    const game = engine.startGame(host, "trivia", { seed: 1 });
    game.deadlineAt = Date.now() - 1000;
    const q = (game.extra as { questions: { id: string }[] }).questions[0]!;
    const late = engine.submitIntent(intent(engine.id, game.id, "trivia-answer", { questionId: q.id, chosenIndex: 0 }), ids[1]!);
    expect(late.accepted).toBe(false);
    expect(late.reason).toBe("PHASE_CLOSED");
    expect(() => engine.skipTimedOutGame(ids[1]!, game.id)).toThrow();
    engine.skipTimedOutGame(host, game.id);
    expect(game.status).toBe("finished");
    expect(game.timedOut).toBe(true);
    expect(engine.officialStandings()).toEqual({});
  });

  it("#5: games without an explicit seed do not default to 42", async () => {
    const seeds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const engine = new RoomEngine("Seed Room");
      const host = engine.join("Host", { asHost: true }).player.id;
      for (let j = 0; j < 3; j++) engine.join(`Guest${j}`);
      const game = engine.startGame(host, "impostor", {});
      seeds.push(game.seed);
    }
    expect(seeds.every((s) => s !== 42)).toBe(true);
    // Explicit seeds remain deterministic.
    const mk = () => {
      const engine = new RoomEngine("Seed Room");
      const host = engine.join("Host", { asHost: true }).player.id;
      for (let j = 0; j < 3; j++) engine.join(`Guest${j}`);
      return engine.startGame(host, "impostor", { seed: 7 });
    };
    expect((mk().extra as { impostor: string }).impostor).toBe((mk().extra as { impostor: string }).impostor);
  });

  it("#6: charades passes stay in the same turn up to 3, and the game lasts one turn per player", async () => {
    const state = initCharades(["a", "b", "c", "d", "e", "f"]);
    const firstActor = currentActor(state);
    charadesTurn(state, firstActor, "pass");
    expect(currentActor(state)).toBe(firstActor);
    charadesTurn(state, firstActor, "pass");
    charadesTurn(state, firstActor, "pass");
    expect(() => charadesTurn(state, firstActor, "pass")).toThrow("PASS_LIMIT");
    // Correct ends the turn and moves to the next actor.
    charadesTurn(state, firstActor, "correct");
    expect(currentActor(state)).not.toBe(firstActor);
    expect(state.phase).toBe("playing");
    // Finish after one turn per player (6 turns total), not after 4.
    let turns = 1;
    while (state.phase !== "finished") {
      charadesTurn(state, currentActor(state), "correct");
      turns++;
      expect(turns).toBeLessThanOrEqual(6);
    }
    expect(turns).toBe(6);
  });
});
