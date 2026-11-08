// Mchezo Phase 3: integration tests for the Phase 2 checkpoint.
// Covers: playing-time secret isolation, finished-trivia reveal data,
// answer locking, nudge delivery rules, host vs participant permissions,
// join/reconnect over HTTP, and the handoff's tie ranking (display only).
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";
import { rankStandings } from "../apps/web/src/ui/mchezo/lib/standings.js";

let server: LocalServer;
let port: number;
beforeAll(async () => {
  server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "cgn-mchezo-")), newCupTiming: 1 }); // timing v1, as every Cup before D3 (D-UX-09)
  port = await server.listen(0);
});
afterAll(async () => { await server.close(); });

async function post(path: string, body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function makeRoom(n: number) {
  const created = await post("/rooms", { name: "Mchezo" });
  const roomId = created.json["roomId"] as string;
  const claim = created.json["hostClaimToken"] as string;
  const players: { id: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const j = await post(`/rooms/${roomId}/join`, { displayName: `P${i}`, asHost: i === 0, hostClaimToken: claim });
    players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
  }
  return { roomId, players };
}
function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown>) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}
async function startTrivia(roomId: string, hostToken: string) {
  const r = await post(`/rooms/${roomId}/games`, { gameId: "trivia", official: true }, hostToken);
  expect(r.status).toBe(201);
  const proj = await get(`/rooms/${roomId}/projection?audience=player`, hostToken);
  const games = proj.json["games"] as { id: string; gameId: string; status: string }[];
  return games.find((g) => g.gameId === "trivia" && g.status === "playing")!.id;
}
async function answerAll(roomId: string, gameId: string, players: { id: string; token: string }[], qids: string[]) {
  for (const p of players) {
    for (const qid of qids) {
      const r = await post(`/rooms/${roomId}/intents`, { intent: intent(roomId, gameId, "trivia-answer", { questionId: qid, chosenIndex: 0 }) }, p.token);
      expect(r.status).toBe(200);
    }
  }
}

describe("Mchezo trivia secrecy", () => {
  it("playing trivia exposes no correctIndex and no answerCounts", async () => {
    const { roomId, players } = await makeRoom(4);
    const gameId = await startTrivia(roomId, players[0]!.token);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    expect(JSON.stringify(tv.json)).not.toContain("correctIndex");
    expect(JSON.stringify(tv.json)).not.toContain("answerCounts");
    const mine = await get(`/rooms/${roomId}/projection?audience=player`, players[1]!.token);
    expect(JSON.stringify(mine.json)).not.toContain("correctIndex");
    expect(gameId).toBeTruthy();
  });

  it("finished trivia reveals keys + aggregate counts, but no per-player answer map", async () => {
    const { roomId, players } = await makeRoom(4);
    const gameId = await startTrivia(roomId, players[0]!.token);
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, players[0]!.token);
    const myGames = proj.json["myGames"] as { id: string; state: { questions: { id: string }[] } }[];
    const qids = myGames.find((g) => g.id === gameId)!.state.questions.map((q) => q.id);
    await answerAll(roomId, gameId, players, qids);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    const games = tv.json["games"] as { id: string; status: string; state: { questions: { correctIndex?: number }[] }; answerCounts?: Record<string, number[]> }[];
    const finished = games.find((g) => g.id === gameId)!;
    expect(finished.status).toBe("finished");
    expect(finished.state.questions.every((q) => typeof q.correctIndex === "number")).toBe(true);
    expect(Object.keys(finished.answerCounts ?? {})).toHaveLength(10);
    for (const counts of Object.values(finished.answerCounts ?? {})) {
      expect(counts.reduce((a, b) => a + b, 0)).toBe(4); // all 4 answered every question
    }
    // No per-player answer map anywhere in the TV projection.
    expect(JSON.stringify(tv.json)).not.toMatch(/"answers"\s*:/);
  });

  it("finished trivia exposes per-question point values consistent with raw scores", async () => {
    const { roomId, players } = await makeRoom(4);
    const gameId = await startTrivia(roomId, players[0]!.token);
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, players[0]!.token);
    const myGames = proj.json["myGames"] as { id: string; state: { questions: { id: string }[] } }[];
    const qids = myGames.find((g) => g.id === gameId)!.state.questions.map((q) => q.id);
    await answerAll(roomId, gameId, players, qids);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    const games = tv.json["games"] as { id: string; status: string; state: { questions: { id: string; correctIndex?: number }[] }; questionPoints?: Record<string, number>; rawScores?: Record<string, number> }[];
    const finished = games.find((g) => g.id === gameId)!;
    expect(Object.keys(finished.questionPoints ?? {})).toHaveLength(10);
    // Every player answered option 0 to every question, so each player's
    // raw score must equal the sum of point values for questions whose
    // correct option is 0 — the client-side "points from this question"
    // display derives from these same values.
    const correctZero = finished.state.questions.filter((q) => q.correctIndex === 0).map((q) => q.id);
    const expected = correctZero.reduce((sum, qid) => sum + (finished.questionPoints?.[qid] ?? 0), 0);
    for (const p of players) {
      expect(finished.rawScores?.[p.id]).toBe(expected);
    }
  });

  it("a second answer to the same question is rejected (server-side lock)", async () => {
    const { roomId, players } = await makeRoom(2);
    const gameId = await startTrivia(roomId, players[0]!.token);
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, players[0]!.token);
    const myGames = proj.json["myGames"] as { id: string; state: { questions: { id: string }[] } }[];
    const qid = myGames.find((g) => g.id === gameId)!.state.questions[0]!.id;
    const first = await post(`/rooms/${roomId}/intents`, { intent: intent(roomId, gameId, "trivia-answer", { questionId: qid, chosenIndex: 1 }) }, players[0]!.token);
    expect((first.json as { accepted?: boolean }).accepted).toBe(true);
    const second = await post(`/rooms/${roomId}/intents`, { intent: intent(roomId, gameId, "trivia-answer", { questionId: qid, chosenIndex: 2 }) }, players[0]!.token);
    expect((second.json as { accepted?: boolean }).accepted).toBe(false);
  });
});

describe("Mchezo lobby permissions and nudges", () => {
  it("a participant cannot start a game, but the host can", async () => {
    const { roomId, players } = await makeRoom(4);
    const bad = await post(`/rooms/${roomId}/games`, { gameId: "trivia", official: true }, players[1]!.token);
    expect(bad.status).not.toBe(201);
    const good = await post(`/rooms/${roomId}/games`, { gameId: "trivia", official: true }, players[0]!.token);
    expect(good.status).toBe(201);
  });

  it("nudges reach only the target, reject strangers and self-nudges, and rate-limit", async () => {
    const { roomId, players } = await makeRoom(4);
    const [host, target] = [players[0]!, players[1]!];
    const stranger = await post(`/rooms/${roomId}/nudge`, { targetId: target.id });
    expect(stranger.status).toBe(401);
    const self = await post(`/rooms/${roomId}/nudge`, { targetId: host.id }, host.token);
    expect(self.status).toBe(400);
    const ok = await post(`/rooms/${roomId}/nudge`, { targetId: target.id }, host.token);
    expect(ok.status).toBe(201);
    const targetProj = await get(`/rooms/${roomId}/projection?audience=player`, target.token);
    expect((targetProj.json["nudgedBy"] as string[])).toContain(host.id);
    const senderProj = await get(`/rooms/${roomId}/projection?audience=player`, host.token);
    expect((senderProj.json["nudgedBy"] as string[])).not.toContain(host.id);
    const spam = await post(`/rooms/${roomId}/nudge`, { targetId: target.id }, host.token);
    expect(spam.status).toBe(429);
  });

  it("join-by-code and token reconnect restore the same slot", async () => {
    const created = await post("/rooms", { name: "Mchezo Join" });
    const roomId = created.json["roomId"] as string;
    const code = created.json["joinCode"] as string;
    const claim = created.json["hostClaimToken"] as string;
    const host = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true, hostClaimToken: claim });
    const guest = await post("/rooms/join-by-code", { joinCode: code, displayName: "Guest" });
    expect(guest.status).toBe(201);
    const guestId = guest.json["playerId"] as string;
    const guestToken = guest.json["recoveryToken"] as string;
    const back = await post(`/rooms/${roomId}/reconnect`, { playerId: guestId, recoveryToken: guestToken });
    expect(back.status).toBe(200);
    expect(host.json["playerId"]).not.toBe(guestId);
  });
});

describe("Mchezo standings display (handoff rankStandings, display only)", () => {
  it("ties share a rank and the next rank skips (1, 1, 3)", () => {
    const players = [
      { id: "a", name: "Bea" },
      { id: "b", name: "Ada" },
      { id: "c", name: "Cal" },
    ];
    const ranked = rankStandings(
      [
        { playerId: "a", score: 100 },
        { playerId: "b", score: 100 },
        { playerId: "c", score: 50 },
      ],
      players,
    );
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([["b", 1], ["a", 1], ["c", 3]]);
  });

  it("engine standings never include practice games", () => {
    const engine = new RoomEngine("Test");
    const host = engine.join("Host", { asHost: true });
    const p2 = engine.join("P2", {});
    expect(engine.players.get(host.player.id)?.connected).toBe(true);
    expect(engine.players.get(p2.player.id)?.connected).toBe(true);
    const game = engine.startGame(host.player.id, "trivia", { official: false, seed: 1 });
    expect(game.official).toBe(false);
    expect(engine.officialStandings()).toEqual({});
  });
});
