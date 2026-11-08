/**
 * D3 over HTTP and WebSocket: the product path. POST /rooms creates timing
 * version 2; the briefing routes, refusals, pushes, spectator projection and
 * a real server restart. Contract: docs/ux-redesign/D3_TIMING_CONTRACT.md.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent } from "../src/content/registry.js";
import { LocalServer } from "../src/server/http.js";
import { policyFor } from "../src/server/lifecycle.js";
import { CLIENT_PROTOCOL, MIN_CLIENT_PROTOCOL } from "../src/shared/clientProtocol.js";
import { FakeClock, Harness, myGame, waitFor, type Json, type Player } from "./helpers/harness.js";

const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
let h: Harness | null = null;
afterEach(async () => { await h?.dispose(); h = null; });

async function room(n: number) {
  const clock = new FakeClock();
  h = new Harness(undefined, { clock, content: lib, timing: 2 });
  await h.start();
  await h.createRoom();
  const ps: Player[] = [await h.join("Keku", { host: true })];
  for (let i = 1; i < n; i++) ps.push(await h.join(["", "Amina", "Baraka", "Chausiku"][i]!));
  return { h, clock, ps };
}
const gameOf = (h: Harness, gid: string) => h.engine().games.get(gid);

describe("D3 HTTP: the product creates timing version 2", () => {
  it("POST /rooms creates a Cup with the frozen version 2 timing record", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mz-d3-"));
    const server = new LocalServer({ dataDir: dir, heartbeatMs: null, lifecycleSweepMs: null, content: lib });
    try {
      const port = await server.listen(0);
      const r = await fetch(`http://localhost:${port}/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const { roomId } = (await r.json()) as { roomId: string };
      expect(server.rooms.get(roomId)!.cup.timing).toEqual({ version: 2, readMinMs: 20_000, stallMs: 300_000, warnMs: 60_000 });
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("clients older than the briefing are told to refresh (protocol 5)", async () => {
    const { h } = await room(1);
    expect(CLIENT_PROTOCOL).toBe(5);
    expect(MIN_CLIENT_PROTOCOL).toBe(5);
    expect((await h.tv())["protocol"]).toEqual({ current: 5, min: 5 });
  });
});

describe("D3 HTTP: briefing routes", () => {
  it("Start returns a briefing; every audience sees rules-only state and the same ready list", async () => {
    const { h, ps } = await room(3);
    const r = await h.startGame(ps[0]!, "trivia", { official: true });
    expect(r.status).toBe(201);
    expect(r.body["status"]).toBe("briefing");
    const gid = r.body["gameId"] as string;
    expect((await h.intent(ps[1]!, gid, "briefing-ready", { ready: true }))).toMatchObject({ accepted: true, result: { ready: true, started: false } });
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const specProj = (await h.get(`/rooms/${h.roomId}/projection?audience=spectator`, { "x-spectator-token": spec.body["spectatorToken"] as string })).body;
    for (const proj of [await h.projection(ps[0]!), await h.projection(ps[2]!), await h.tv(), specProj]) {
      const pub = (proj["games"] as Json[]).find((g) => g["id"] === gid)!;
      expect(pub["status"]).toBe("briefing");
      expect(pub["timingVersion"]).toBe(2);
      expect(pub["state"]).toBeUndefined();
      expect(pub["briefing"]).toMatchObject({ ready: [ps[1]!.playerId], warned: false });
    }
    const mine = myGame(await h.projection(ps[1]!), gid);
    expect(mine["status"]).toBe("briefing");
    expect(mine["state"]).toBeUndefined();
    expect(mine["participant"]).toBe(true);
  });

  it("Start now: 409 READ_WINDOW, then 409 READINESS_CHANGED naming who isn't ready, then 200 with consent", async () => {
    const { h, clock, ps } = await room(3);
    const gid = (await h.startGame(ps[0]!, "closest-wins", { official: true })).body["gameId"] as string;
    let r = await h.post(`/rooms/${h.roomId}/games/${gid}/start-now`, { confirmed: [] }, ps[0]!.token);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "READ_WINDOW", startNowAt: clock.t + 20_000 });
    clock.advance(20_000);
    r = await h.post(`/rooms/${h.roomId}/games/${gid}/start-now`, { confirmed: [] }, ps[0]!.token);
    expect(r.status).toBe(409);
    expect(r.body["code"]).toBe("READINESS_CHANGED");
    expect((r.body["needsConfirmation"] as string[]).sort()).toEqual([ps[1]!.playerId, ps[2]!.playerId].sort());
    r = await h.post(`/rooms/${h.roomId}/games/${gid}/start-now`, { confirmed: [ps[1]!.playerId, ps[2]!.playerId] }, ps[0]!.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, started: true });
    const g = gameOf(h, gid)!;
    expect(g.status).toBe("playing");
    expect(g.playStartedAt).toBe(clock.t);
    expect(g.phaseDeadlineAt).toBe(clock.t + policyFor("closest-wins").phaseMs!["question"]!);
    // Readiness is locked now.
    expect(await h.intent(ps[1]!, gid, "briefing-ready", { ready: true })).toMatchObject({ accepted: false, reason: "READY_LOCKED" });
  });

  it("a player can't Start now or Cancel; the host can Cancel, and the game is gone for everyone", async () => {
    const { h, ps } = await room(2);
    const gid = (await h.startGame(ps[0]!, "trivia", { official: true })).body["gameId"] as string;
    expect((await h.post(`/rooms/${h.roomId}/games/${gid}/start-now`, { confirmed: [] }, ps[1]!.token)).status).toBe(400);
    expect((await h.post(`/rooms/${h.roomId}/games/${gid}/cancel`, {}, ps[1]!.token)).status).toBe(400);
    const r = await h.post(`/rooms/${h.roomId}/games/${gid}/cancel`, {}, ps[0]!.token);
    expect(r.status).toBe(200);
    expect(gameOf(h, gid)).toBeUndefined();
    expect(((await h.projection(ps[1]!))["games"] as Json[]).some((g) => g["id"] === gid)).toBe(false);
    // Nothing is left active: a new Start works.
    expect((await h.startGame(ps[0]!, "trivia", { official: true })).status).toBe(201);
  });

  it("a second Start while a briefing is open is refused; so is advancing the day", async () => {
    const { h, ps } = await room(2);
    expect((await h.startGame(ps[0]!, "trivia", { official: true })).status).toBe(201);
    expect((await h.startGame(ps[0]!, "trivia", { official: true })).status).toBe(400);
    expect((await h.post(`/rooms/${h.roomId}/day`, {}, ps[0]!.token)).status).toBe(400);
  });

  it("the sweep starts play once a ready player's reconnect grace ends, and pushes it to every socket", async () => {
    const { h, clock, ps } = await room(3);
    const gid = (await h.startGame(ps[0]!, "trivia", { official: true })).body["gameId"] as string;
    await h.intent(ps[2]!, gid, "briefing-ready", { ready: true });
    await h.disconnect(ps[2]!);
    await h.intent(ps[0]!, gid, "briefing-ready", { ready: true });
    await h.intent(ps[1]!, gid, "briefing-ready", { ready: true });
    expect(gameOf(h, gid)!.status).toBe("briefing"); // Baraka is reconnecting
    clock.advance(45_001);
    expect(h.lifecycleTick()).toBe(1);
    expect(gameOf(h, gid)!.status).toBe("playing");
    await waitFor(() => (myGame(ps[1]!.lastPush ?? {}, gid) ?? {})["status"] === "playing");
  });
});

describe("D3 HTTP: a server restart keeps the briefing and its timing", () => {
  it("restart late in the briefing: same ready map, everyone reconnecting, expiry moved to 60 s of visible warning", async () => {
    const { h, clock, ps } = await room(2);
    const gid = (await h.startGame(ps[0]!, "trivia", { official: true })).body["gameId"] as string;
    await h.intent(ps[1]!, gid, "briefing-ready", { ready: true });
    const frozen = JSON.stringify(gameOf(h, gid)!.pendingContent);
    clock.advance(270_000);
    await h.restart();
    const g = gameOf(h, gid)!;
    expect(g.status).toBe("briefing");
    expect(Object.keys(g.briefing!.ready)).toEqual([ps[1]!.playerId]);
    expect(JSON.stringify(g.pendingContent)).toBe(frozen);
    expect(h.presence(ps[0]!)).toBe("reconnecting");
    expect(g.briefing!.expiresAt).toBe(clock.t + 60_000);
    expect(g.briefing!.warned).toBe(true); // the boot sweep pushed the warning
    expect(h.engine().ledger.filter((e) => e.type === "briefing-extended")).toHaveLength(1);
    clock.advance(60_000);
    h.lifecycleTick();
    expect(gameOf(h, gid)).toBeUndefined();
    expect(h.engine().ledger.filter((e) => e.type === "briefing-cancelled")[0]!.detail).toMatchObject({ reason: "expired" });
  });
});
