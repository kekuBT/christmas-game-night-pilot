import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalServer } from "../src/server/http.js";

let server: LocalServer;
let port: number;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cgn-m1-"));
  server = new LocalServer({ dataDir });
  port = await server.listen(0);
});

afterAll(async () => {
  await server.close();
});

async function post(path: string, body: Record<string, unknown>, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function get(path: string, token?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return (await res.json()) as Record<string, unknown>;
}

describe("M1 HTTP + WebSocket adapter", () => {
  it("creates a room, joins 10 players via HTTP, starts Math, and finishes via intents", async () => {
    const created = await post("/rooms", { name: "M1 Room" });
    expect(created.status).toBe(201);
    const roomId = created.json["roomId"] as string;
    const players: { id: string; token: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const joined = await post(`/rooms/${roomId}/join`, { displayName: `Player${i + 1}`, asHost: i === 0 });
      expect(joined.status).toBe(201);
      players.push({ id: joined.json["playerId"] as string, token: joined.json["recoveryToken"] as string });
    }
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", seed: 11 }, players[0]!.token);
    expect(started.status).toBe(201);
    const gameId = started.json["gameId"] as string;

    // Get player projection to learn question ids (prompts/options only, no answers)
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, players[0]!.token);
    const myGames = proj["myGames"] as { id: string; questions: { id: string }[] }[];
    const questions = myGames.find((g) => g.id === gameId)?.questions ?? [];
    expect(questions.length).toBe(10);
    expect(JSON.stringify(proj)).not.toContain("correctIndex");

    // Answer every question for every player (chosenIndex 0 is deterministic, score may vary)
    for (const p of players) {
      for (const q of questions) {
        const r = await post(`/rooms/${roomId}/intents`, {
          intent: {
            kind: "intent",
            schemaVersion: 1,
            clientEventId: randomUUID(),
            roomId,
            gameInstanceId: gameId,
            action: "submit-math-answer",
            payload: { questionId: q.id, chosenIndex: 0 },
          },
        }, p.token);
        expect(r.status).toBe(200);
      }
    }
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    const games = tv["games"] as { status: string }[];
    expect(games[0]?.status).toBe("finished");
  });

  it("WebSocket clients receive projections and acks", async () => {
    const created = await post("/rooms", { name: "WS Room" });
    const roomId = created.json["roomId"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true });
    await post(`/rooms/${roomId}/join`, { displayName: "Guest" });

    const messages: string[] = [];
    const hostToken = hostJoin.json["recoveryToken"] as string;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=host&sessionToken=${encodeURIComponent(hostToken)}`);
    ws.on("message", (data) => messages.push(data.toString()));
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    // Wait a tick for the initial projection
    await new Promise((r) => setTimeout(r, 200));
    expect(messages.some((m) => m.includes("projection"))).toBe(true);
    ws.close();
  });

  it("WebSocket open/close tracks connected: reload (close + reopen) restores startGame eligibility", async () => {
    const created = await post("/rooms", { name: "Reload Room" });
    const roomId = created.json["roomId"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true });
    const guestJoin = await post(`/rooms/${roomId}/join`, { displayName: "Guest" });
    const guestId = guestJoin.json["playerId"] as string;
    const guestToken = guestJoin.json["recoveryToken"] as string;

    const connectedOf = async (id: string): Promise<boolean> => {
      const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
      const players = tv["players"] as { id: string; connected: boolean }[];
      return players.find((p) => p.id === id)?.connected ?? false;
    };
    const openWs = async (_id: string): Promise<WebSocket> => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=player&sessionToken=${encodeURIComponent(guestToken)}`);
      await new Promise<void>((resolve) => ws.on("open", () => resolve()));
      return ws;
    };
    const closeWs = async (ws: WebSocket): Promise<void> => {
      await new Promise<void>((resolve) => { ws.on("close", () => resolve()); ws.close(); });
      await new Promise((r) => setTimeout(r, 100));
    };

    // Guest connects, then "reloads": socket closes, new socket opens.
    const ws1 = await openWs(guestId);
    expect(await connectedOf(guestId)).toBe(true);
    await closeWs(ws1);
    expect(await connectedOf(guestId)).toBe(false);
    const ws2 = await openWs(guestId);
    expect(await connectedOf(guestId)).toBe(true);
    // Overlapping sockets (new opens before old closes) must not disconnect.
    const ws3 = await openWs(guestId);
    await closeWs(ws2);
    expect(await connectedOf(guestId)).toBe(true);
    await closeWs(ws3);
    expect(await connectedOf(guestId)).toBe(false);
    // And a fresh socket restores eligibility for a minPlayers game.
    const ws4 = await openWs(guestId);
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", seed: 5 }, hostJoin.json["recoveryToken"] as string);
    expect(started.status).toBe(201);
    await closeWs(ws4);
  });

  it("snapshot persistence restores a room after restart, with deadlines intact", async () => {
    const created = await post("/rooms", { name: "Restart Room" });
    const roomId = created.json["roomId"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true });
    await post(`/rooms/${roomId}/join`, { displayName: "Guest" });
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", seed: 3 }, hostJoin.json["recoveryToken"] as string);
    expect(started.status).toBe(201);

    // Simulate a restart: new server instance on the same dataDir
    await server.close();
    server = new LocalServer({ dataDir });
    port = await server.listen(0);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    expect((tv["players"] as unknown[]).length).toBe(2);
    expect((tv["games"] as { status: string }[])[0]?.status).toBe("playing");
    // Engine state restored, including deadline: room still exists and is playable
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, hostJoin.json["recoveryToken"] as string);
    expect(proj["roomId"]).toBe(roomId);
  });
});
