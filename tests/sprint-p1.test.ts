import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";

// Completion-sprint P1: verify the PR #3 fixes and close the remaining
// session-security gap (WebSocket credentials in URL parameters).
let server: LocalServer;
let port: number;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cgn-sprint-p1-"));
  server = new LocalServer({ dataDir });
  port = await server.listen(0);
});
afterAll(async () => {
  await server.close();
});

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
  const created = await post("/rooms", { name: "Sprint Room" });
  const roomId = created.json["roomId"] as string;
    const claim = created.json["hostClaimToken"] as string;
  const players: { id: string; token: string }[] = [];
  let host = "";
  for (let i = 0; i < n; i++) {
    const j = await post(`/rooms/${roomId}/join`, { displayName: `S${i}-${randomUUID().slice(0, 4)}`, asHost: i === 0, hostClaimToken: claim });
    players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
    if (j.json["isHost"]) host = j.json["playerId"] as string;
  }
  return { roomId, players, host };
}
function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown>) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}

describe("Sprint P1 — session security and standings verification", () => {
  it("a WebSocket token in the URL query alone is rejected; subprotocol token works", async () => {
    const { roomId, players } = await makeRoom(2);
    const guest = players[1]!;
    // URL-only: should close with 1008, never receive a projection.
    const bad = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=player&sessionToken=${encodeURIComponent(guest.token)}`);
    const badClosed = await new Promise<number>((resolve) => {
      bad.on("close", (code) => resolve(code));
      bad.on("message", () => { /* must not happen */ });
      setTimeout(() => resolve(-1), 2000);
    });
    expect(badClosed).toBe(1008);
    // Subprotocol: works and yields a projection.
    const good = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=player`, [`cgn-session-${guest.token}`]);
    const got = await new Promise<boolean>((resolve) => {
      good.on("message", (d) => { if (d.toString().includes("projection")) resolve(true); });
      setTimeout(() => resolve(false), 2000);
    });
    expect(got).toBe(true);
    good.close();
  });

  it("cohost cannot fetch a host projection, and a non-member cannot fetch the ledger", async () => {
    const { roomId, players, host } = await makeRoom(3);
    const cohost = players[1]!;
    await post(`/rooms/${roomId}/cohost`, { targetId: cohost.id }, players[0]!.token);
    const hostProj = await get(`/rooms/${roomId}/projection?audience=host`, cohost.token);
    expect(hostProj.status).toBe(403);
    const cohostProj = await get(`/rooms/${roomId}/projection?audience=cohost`, cohost.token);
    expect(cohostProj.status).toBe(200);
    const stranger = await get(`/rooms/${roomId}/ledger`, "0".repeat(64));
    expect(stranger.status).toBe(401);
    const hostLedger = await get(`/rooms/${roomId}/ledger`, players[0]!.token);
    expect(hostLedger.status).toBe(200);
    expect(host).toBe(players[0]!.id);
  });

  it("official standings never include practice games, even across many games", async () => {
    const engine = new RoomEngine("Standings Sprint");
    const host = engine.join("Host", { asHost: true }).player.id;
    const ids = [host];
    for (let i = 0; i < 3; i++) ids.push(engine.join(`G${i}`).player.id);
    const finish = (official: boolean, seed: number) => {
      const game = engine.startGame(host, "math-mayhem", { official, seed });
      for (const pid of ids) {
        for (const q of game.questions!) {
          engine.submitIntent(intent(engine.id, game.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
        }
      }
      expect(game.status).toBe("finished");
    };
    finish(true, 1);
    const s1 = engine.officialStandings();
    finish(false, 2);
    finish(false, 3);
    expect(engine.officialStandings()).toEqual(s1);
    finish(true, 4);
    const s2 = engine.officialStandings();
    // All players answered everything correctly, so every official game is a
    // 4-way tie: midrank gives 50 per tied game, hence 100 across 2 games.
    expect(Object.values(s2).every((v) => v === 100)).toBe(true);
  });

  it("an official game where nobody answered before the deadline has no result to count (D-S3-02)", async () => {
    const engine = new RoomEngine("Timeout Standings");
    const host = engine.join("Host", { asHost: true }).player.id;
    for (let i = 0; i < 3; i++) engine.join(`G${i}`);
    const game = engine.startGame(host, "trivia", { official: true, seed: 1 });
    game.deadlineAt = Date.now() - 1;
    engine.tick();
    expect(game.outcome).toMatchObject({ reason: "deadline", countsOfficially: false });
    expect(game.outcome?.note).toMatch(/Nobody answered/);
    expect(engine.officialStandings()).toEqual({});
  });
});
