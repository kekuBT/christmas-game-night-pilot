// True spectator mode (Milestone B): server-recognized viewers that are
// NOT players. A spectator must never occupy a seat, count toward the
// 10-player cap, join a game's player list, block completion, earn scores,
// appear in standings, or gain host/player powers. The spectator token is
// disjoint from player session tokens in both directions.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";

function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown>) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}

describe("spectator mode (engine)", () => {
  it("a spectator is not a player: no seat, no cap consumption, no game membership", () => {
    const engine = new RoomEngine("Spec Room");
    const host = engine.join("Host", { asHost: true }).player;
    const { spectator, token } = engine.addSpectator();
    expect(engine.players.size).toBe(1);
    expect(engine.players.has(spectator.id)).toBe(false);
    expect(engine.spectatorByToken(token)?.id).toBe(spectator.id);
    expect(engine.spectatorByToken("nope")).toBeNull();
    // The stored value is a hash, never the raw token.
    expect(spectator.tokenHash).not.toBe(token);
    expect(engine.spectatorCount()).toBe(1);
    engine.setSpectatorConnected(spectator.id, false);
    expect(engine.spectatorCount()).toBe(0);
    // A spectator cannot start a game or be granted cohost.
    expect(() => engine.startGame(spectator.id, "trivia")).toThrow("Only host/cohost");
    expect(() => engine.grantCohost(spectator.id, host.id)).toThrow("Only host/cohost");
    // Starting a game with a spectator present still lists only players.
    engine.join("Guest");
    const game = engine.startGame(host.id, "trivia", { seed: 7 });
    expect(game.players).not.toContain(spectator.id);
    expect(game.players).toHaveLength(2);
  });

  it("a spectator never blocks completion: all players answering finishes the game", () => {
    const engine = new RoomEngine("Spec Room");
    const host = engine.join("Host", { asHost: true }).player;
    const guest = engine.join("Guest").player;
    engine.addSpectator();
    const game = engine.startGame(host.id, "trivia", { seed: 11 });
    const questions = (game.extra as { questions: { id: string }[] }).questions;
    expect(questions).toHaveLength(10);
    for (const pid of [host.id, guest.id]) {
      for (const q of questions) {
        expect(engine.submitIntent(intent(engine.id, game.id, "trivia-answer", { questionId: q.id, chosenIndex: 0 }), pid).accepted).toBe(true);
      }
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[spectatorId(engine)]).toBeUndefined();
    function spectatorId(e: RoomEngine): string {
      return [...e.spectators.keys()][0]!;
    }
  });

  it("spectators survive a snapshot round-trip; old snapshots migrate to none", () => {
    const engine = new RoomEngine("Spec Room");
    engine.join("Host", { asHost: true });
    const { spectator } = engine.addSpectator();
    engine.setSpectatorConnected(spectator.id, false);
    const restored = RoomEngine.fromJSON(engine.toJSON());
    expect(restored.spectators.size).toBe(1);
    expect(restored.spectators.get(spectator.id)?.connected).toBe(false);
    expect(restored.spectatorCount()).toBe(0);
    const legacy = engine.toJSON();
    delete (legacy as Record<string, unknown>)["spectators"];
    delete (legacy as Record<string, unknown>)["nextSpectator"];
    const migrated = RoomEngine.fromJSON(legacy);
    expect(migrated.spectators.size).toBe(0);
    expect(migrated.spectatorCount()).toBe(0);
  });

  it("the TV projection carries a spectator count but no spectator identities", () => {
    const engine = new RoomEngine("Spec Room");
    engine.join("Host", { asHost: true });
    engine.addSpectator();
    engine.addSpectator();
    const proj = engine.project("tv");
    expect(proj["spectatorCount"]).toBe(2);
    expect(JSON.stringify(proj)).not.toContain("spectator-");
    expect((proj["players"] as unknown[])).toHaveLength(1);
  });
});

describe("spectator mode (HTTP)", () => {
  let server: LocalServer;
  let port: number;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cgn-spectator-"));
    server = new LocalServer({ dataDir, newCupTiming: 1 }); // timing v1, as every Cup before D3 (D-UX-09)
    port = await server.listen(0);
  });
  afterAll(async () => {
    await server.close();
  });

  async function post(path: string, body: Record<string, unknown>, token?: string, specToken?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["x-session-token"] = token;
    if (specToken) headers["x-spectator-token"] = specToken;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  async function get(path: string, token?: string, specToken?: string) {
    const headers: Record<string, string> = {};
    if (token) headers["x-session-token"] = token;
    if (specToken) headers["x-spectator-token"] = specToken;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it("spectate-by-code is code-gated, seat-free, and token-disjoint", async () => {
    const created = await post("/rooms", { name: "Spec HTTP" });
    const roomId = created.json["roomId"] as string;
    const claim = created.json["hostClaimToken"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true, hostClaimToken: claim });
    const guestJoin = await post(`/rooms/${roomId}/join`, { displayName: "Guest" });
    const code = (await get(`/rooms/${roomId}/projection?audience=tv`)).json["joinCode"] as string;

    const wrong = await post("/rooms/spectate-by-code", { joinCode: "ZZZZZZ" });
    expect(wrong.status).toBe(404);

    const spec = await post("/rooms/spectate-by-code", { joinCode: code });
    expect(spec.status).toBe(201);
    const specToken = spec.json["spectatorToken"] as string;
    expect(spec.json["spectatorId"]).toMatch(/^spectator-/);
    expect(spec.json["playerId"]).toBeUndefined();

    // Still exactly 2 players after spectating.
    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    expect((tv.json["players"] as unknown[])).toHaveLength(2);

    // Spectator projection requires the spectator token — and only it.
    expect((await get(`/rooms/${roomId}/projection?audience=spectator`)).status).toBe(401);
    expect((await get(`/rooms/${roomId}/projection?audience=spectator`, hostJoin.json["recoveryToken"] as string)).status).toBe(401);
    const specProj = await get(`/rooms/${roomId}/projection?audience=spectator`, undefined, specToken);
    expect(specProj.status).toBe(200);
    expect(specProj.json["spectatorCount"]).toBe(1);
    expect((specProj.json["players"] as unknown[])).toHaveLength(2);
    expect(specProj.json["me"]).toBeUndefined();

    // A spectator token grants no player/host powers, in either header.
    expect((await post(`/rooms/${roomId}/games`, { gameId: "trivia" }, undefined, specToken)).status).toBe(401);
    expect((await post(`/rooms/${roomId}/reactions`, { emoji: "🎄" }, undefined, specToken)).status).toBe(401);
    expect((await post(`/rooms/${roomId}/intents`, { intent: {} }, undefined, specToken)).status).toBe(401);
    expect((await post(`/rooms/${roomId}/games`, { gameId: "trivia" }, specToken)).status).toBe(401);
    // And a player token is not a spectator token.
    expect((await get(`/rooms/${roomId}/projection?audience=spectator`, undefined, hostJoin.json["recoveryToken"] as string)).status).toBe(401);
    expect(guestJoin.status).toBe(201);
  });

  it("a full room still admits spectators, and playing Trivia leaks no key to them", async () => {
    const created = await post("/rooms", { name: "Spec Full" });
    const roomId = created.json["roomId"] as string;
    const claim = created.json["hostClaimToken"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true, hostClaimToken: claim });
    for (let i = 2; i <= 10; i++) {
      const r = await post(`/rooms/${roomId}/join`, { displayName: `P${i}` });
      expect(r.status).toBe(201);
    }
    const code = (await get(`/rooms/${roomId}/projection?audience=tv`)).json["joinCode"] as string;
    // 11th player would be refused, but a spectator is not a player.
    const eleventh = await post(`/rooms/${roomId}/join`, { displayName: "P11" });
    expect(eleventh.status).toBe(400);
    const spec = await post("/rooms/spectate-by-code", { joinCode: code });
    expect(spec.status).toBe(201);
    const specToken = spec.json["spectatorToken"] as string;

    const started = await post(`/rooms/${roomId}/games`, { gameId: "trivia", seed: 3 }, hostJoin.json["recoveryToken"] as string);
    expect(started.status).toBe(201);
    const specProj = await get(`/rooms/${roomId}/projection?audience=spectator`, undefined, specToken);
    const games = specProj.json["games"] as { gameId: string; status: string; state: { questions: { correctIndex?: number }[] } }[];
    const trivia = games.find((g) => g.gameId === "trivia")!;
    expect(trivia.status).toBe("playing");
    expect(trivia.state.questions.every((q) => q.correctIndex === undefined)).toBe(true);
    expect(specProj.json["spectatorCount"]).toBe(1);
  });

  it("spectator WebSocket receives live TV data but cannot submit intents", async () => {
    const created = await post("/rooms", { name: "Spec WS" });
    const roomId = created.json["roomId"] as string;
    const code = (await get(`/rooms/${roomId}/projection?audience=tv`)).json["joinCode"] as string;
    const spec = await post("/rooms/spectate-by-code", { joinCode: code });
    const specToken = spec.json["spectatorToken"] as string;

    // Bad token → 1008 close.
    await new Promise<void>((resolve) => {
      const bad = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=spectator`, ["cgn-spectator-nope"]);
      bad.on("close", (c) => {
        expect(c).toBe(1008);
        resolve();
      });
    });

    // Good token → projection, then SESSION_REQUIRED on an intent frame.
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=spectator`, [`cgn-spectator-${specToken}`]);
      let sawProjection = false;
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as { kind: string; state?: Record<string, unknown>; code?: string };
        if (msg.kind === "projection") {
          sawProjection = true;
          expect(msg.state?.["spectatorCount"]).toBe(1);
          ws.send(JSON.stringify({ intent: { kind: "intent" } }));
        } else if (msg.kind === "error") {
          expect(sawProjection).toBe(true);
          expect(msg.code).toBe("SESSION_REQUIRED");
          ws.close();
          resolve();
        }
      });
      ws.on("error", reject);
    });
  });
});
