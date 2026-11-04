// Host recovery edge cases (local only, nonvisual):
// - A cohost can delegate to another cohost while the host is away, so the
//   room does not lose its only operator when the host disconnects.
// - A server restart must not resurrect players as "connected": no socket
//   exists after a restart, so restored players start disconnected and
//   recover explicitly (reconnect endpoint or a fresh WebSocket), instead
//   of phantom-connected players counting toward startGame or blocking
//   a game from advancing.
// - A disconnected host keeps hostId; nobody else can claim host by
//   joining with asHost while a host exists, and the original host
//   regains authority by reconnecting with their token.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";

function setup(n: number) {
  const engine = new RoomEngine("Recovery Room");
  const players: { id: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const { player, recoveryToken } = engine.join(`P${i + 1}`, { asHost: i === 0 });
    players.push({ id: player.id, token: recoveryToken });
  }
  return { engine, players, host: players[0]!.id };
}

describe("host recovery (engine)", () => {
  it("a cohost can grant another cohost; a regular player cannot", () => {
    const { engine, players, host } = setup(4);
    engine.grantCohost(host, players[1]!.id);
    expect(() => engine.grantCohost(players[1]!.id, players[2]!.id)).not.toThrow();
    expect(engine.cohosts.has(players[2]!.id)).toBe(true);
    expect(() => engine.grantCohost(players[3]!.id, players[2]!.id)).toThrow();
    const grant = engine.ledger.filter((e) => e.type === "cohost-granted").at(-1);
    expect(grant?.actor).toBe(players[1]!.id);
  });

  it("a disconnected host keeps hostId and regains authority on reconnect", () => {
    const { engine, players, host } = setup(3);
    engine.grantCohost(host, players[1]!.id);
    engine.disconnect(host);
    // While the host is away the cohost can still operate.
    expect(() => engine.startGame(players[1]!.id, "math-mayhem", { seed: 5 })).not.toThrow();
    // A new joiner cannot steal host while one exists.
    const late = engine.join("Late", { asHost: true });
    expect(late.player.isHost).toBe(false);
    expect(engine.hostId).toBe(host);
    // The original host reconnects with their token and is host again.
    expect(engine.reconnect(host, players[0]!.token).isHost).toBe(true);
    expect(engine.hostId).toBe(host);
  });

  it("a cohost granted while the host is away can start a game", () => {
    const { engine, players, host } = setup(4);
    engine.grantCohost(host, players[1]!.id);
    engine.disconnect(host);
    engine.grantCohost(players[1]!.id, players[2]!.id);
    // Host disconnected, cohosts + P4 connected = 3, math needs 2.
    expect(() => engine.startGame(players[2]!.id, "math-mayhem", { seed: 6 })).not.toThrow();
  });
});

describe("host recovery (HTTP restart)", () => {
  let server: LocalServer;
  let port: number;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cgn-host-recovery-"));
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
    return (await res.json()) as Record<string, unknown>;
  }

  it("restored players start disconnected and recover via reconnect, then the host can start", async () => {
    const created = await post("/rooms", { name: "Restart Recovery" });
    const roomId = created.json["roomId"] as string;
    const claim = created.json["hostClaimToken"] as string;
    const hostJoin = await post(`/rooms/${roomId}/join`, { displayName: "Host", asHost: true, hostClaimToken: claim });
    const guestJoin = await post(`/rooms/${roomId}/join`, { displayName: "Guest" });
    expect(hostJoin.status).toBe(201);
    expect(guestJoin.status).toBe(201);

    await server.close();
    server = new LocalServer({ dataDir });
    port = await server.listen(0);

    const tv = await get(`/rooms/${roomId}/projection?audience=tv`);
    const players = tv["players"] as { id: string; connected: boolean }[];
    expect(players).toHaveLength(2);
    // No socket exists after a restart, so nobody is phantom-connected.
    expect(players.every((p) => p.connected === false)).toBe(true);

    const hostBack = await post(`/rooms/${roomId}/reconnect`, {
      playerId: hostJoin.json["playerId"],
      recoveryToken: hostJoin.json["recoveryToken"],
    });
    expect(hostBack.status).toBe(200);
    const guestBack = await post(`/rooms/${roomId}/reconnect`, {
      playerId: guestJoin.json["playerId"],
      recoveryToken: guestJoin.json["recoveryToken"],
    });
    expect(guestBack.status).toBe(200);

    const started = await post(
      `/rooms/${roomId}/games`,
      { gameId: "math-mayhem", seed: 9 },
      hostJoin.json["recoveryToken"] as string,
    );
    expect(started.status).toBe(201);
  });
});
