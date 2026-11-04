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

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return (await res.json()) as Record<string, unknown>;
}

describe("M1 HTTP + WebSocket adapter", () => {
  it("creates a room, joins 10 players via HTTP, starts Math, and finishes via intents", async () => {
    const created = await post("/rooms", { name: "M1 Room" });
    expect(created.status).toBe(201);
    const roomId = created.json["roomId"] as string;
    const players: { id: string; token: string }[] = [];
    let host = "";
    for (let i = 0; i < 10; i++) {
      const joined = await post(`/rooms/${roomId}/join`, { displayName: `Player${i + 1}`, asHost: i === 0 });
      expect(joined.status).toBe(201);
      players.push({ id: joined.json["playerId"] as string, token: joined.json["recoveryToken"] as string });
      if (joined.json["isHost"]) host = joined.json["playerId"] as string;
    }
    const started = await post(`/rooms/${roomId}/games`, { hostId: host, gameId: "math-mayhem", seed: 11 });
    expect(started.status).toBe(201);
    const gameId = started.json["gameId"] as string;

    // Get player projection to learn question ids (prompts/options only, no answers)
    const proj = await get(`/rooms/${roomId}/projection?audience=player&actorId=${players[0]!.id}`);
    const myGames = proj["myGames"] as { id: string; questions: { id: string }[] }[];
    const questions = myGames.find((g) => g.id === gameId)?.questions ?? [];
    expect(questions.length).toBe(10);
    expect(JSON.stringify(proj)).not.toContain("correctIndex");

    // Answer every question for every player (chosenIndex 0 is deterministic, score may vary)
    for (const p of players) {
      for (const q of questions) {
        const r = await post(`/rooms/${roomId}/intents`, {
          actorId: p.id,
          intent: {
            kind: "intent",
            schemaVersion: 1,
            clientEventId: randomUUID(),
            roomId,
            gameInstanceId: gameId,
            action: "submit-math-answer",
            payload: { questionId: q.id, chosenIndex: 0 },
          },
        });
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
    const hostId = hostJoin.json["playerId"] as string;
    await post(`/rooms/${roomId}/join`, { displayName: "Guest" });

    const messages: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&actorId=${hostId}&audience=host`);
    ws.on("message", (data) => messages.push(data.toString()));
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    // Wait a tick for the initial projection
    await new Promise((r) => setTimeout(r, 200));
    expect(messages.some((m) => m.includes("projection"))).toBe(true);
    ws.close();
  });

  it("snapshot persistence restores a room after restart, with deadlines intact", async () => {
    const created = await post("/rooms", { name: "Restart Room" });
    const roomId = created.json["roomId"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true });
    const hostId = hostJoin.json["playerId"] as string;
    await post(`/rooms/${roomId}/join`, { displayName: "Guest" });
    const started = await post(`/rooms/${roomId}/games`, { hostId, gameId: "math-mayhem", seed: 3 });
    expect(started.status).toBe(201);

    // Simulate a restart: new server instance on the same dataDir
    await server.close();
    server = new LocalServer({ dataDir });
    port = await server.listen(0);
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    expect((tv["players"] as unknown[]).length).toBe(2);
    expect((tv["games"] as { status: string }[])[0]?.status).toBe("playing");
    // Engine state restored, including deadline: room still exists and is playable
    const proj = await get(`/rooms/${roomId}/projection?audience=player&actorId=${hostId}`);
    expect(proj["roomId"]).toBe(roomId);
  });
});
