/**
 * Sprint 2 Workstream A: connection presence, separate from room
 * membership and game participation. Real HTTP + WebSocket server with a
 * controlled server clock (no 45-second sleeps).
 *
 * Requirement: a phone that locks, reloads, or blips off Wi-Fi is shown
 * honestly as "reconnecting" and keeps its seat, its game, its answers and
 * its private view. Presence never changes a roster, an answer, a score or
 * whether a game finishes (those are competition rules, unchanged).
 */
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECONNECT_GRACE_MS } from "../src/server/room.js";
import { FakeClock, Harness, myGame, waitFor, type Json, type Player } from "./helpers/harness.js";

let h: Harness;
beforeEach(async () => { h = await new Harness(undefined, { clock: new FakeClock() }).start(); await h.createRoom(); });
afterEach(async () => { await h.dispose(); });

const presenceIn = (proj: Json | undefined, p: Player) => ((proj?.["players"] as Json[]) ?? []).find((x) => x["id"] === p.playerId)?.["presence"];

describe("grace period", () => {
  it("a dropped player is 'reconnecting' for 45s of SERVER time, then 'away'; others are told", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    await h.disconnect(bea);
    expect(h.presence(bea)).toBe("reconnecting");
    await waitFor(() => presenceIn(ada.lastPush, bea) === "reconnecting");
    h.clock.advance(RECONNECT_GRACE_MS - 1);
    expect(h.presence(bea)).toBe("reconnecting");
    h.clock.advance(1);
    expect(h.presence(bea)).toBe("away");
    // The next projection anyone fetches says so (computed on read: no timers).
    expect(presenceIn(await h.projection(ada), bea)).toBe("away");
    expect(((await h.projection(ada))["players"] as Json[]).find((p) => p["id"] === bea.playerId)?.["awayForMs"]).toBe(RECONNECT_GRACE_MS);
  });

  it("reconnecting within the grace period restores the same seat, game, answers and private view", async () => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const gid = (await h.startGame(players[0]!, "impostor", { seed: 3 })).body["gameId"] as string;
    const bea = players[1]!;
    await h.intent(bea, gid, "impostor-clue", { clue: "cold" });
    const before = myGame(await h.projection(bea), gid);
    await h.disconnect(bea);
    h.clock.advance(20_000);
    await h.connect(bea);
    expect(h.presence(bea)).toBe("connected");
    expect(h.engine().players.size).toBe(4); // no duplicate seat
    expect(h.game(gid).players).toContain(bea.playerId);
    const after = myGame(await h.projection(bea), gid);
    expect(after["participant"]).toBe(true);
    expect(after["state"]).toEqual(before["state"]); // same role/word, own clue intact
  });

  it("reconnecting after the grace period still restores the seat and game participation (presence is not membership)", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 1 })).body["gameId"] as string;
    const q = h.game(gid).questions![0]!;
    await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    await h.disconnect(bea);
    h.clock.advance(10 * 60_000);
    expect(h.presence(bea)).toBe("away");
    expect(h.game(gid).players).toContain(bea.playerId);
    expect(h.game(gid).abstained ?? []).not.toContain(bea.playerId); // going away is not abstaining
    await h.connect(bea);
    expect(h.presence(bea)).toBe("connected");
    expect(myGame(await h.projection(bea), gid)["myAnswers"]).toEqual({ [q.id]: q.correctIndex });
  });

  it("a server restart gives every player a fresh grace window instead of showing them as away", async () => {
    const ada = await h.join("Ada", { host: true });
    await h.join("Bea");
    await h.restart();
    for (const p of h.engine().players.values()) expect(h.engine().presenceOf(p.id)).toBe("reconnecting");
    h.clock.advance(RECONNECT_GRACE_MS);
    expect(h.engine().presenceOf(ada.playerId)).toBe("away");
  });
});

describe("several sockets for one session", () => {
  it("two tabs on one session: closing one keeps the player connected; closing both starts the grace period", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const second = await h.openSocket(bea);
    await h.closeSocket(second);
    expect(h.presence(bea)).toBe("connected");
    await h.disconnect(bea);
    expect(h.presence(bea)).toBe("reconnecting");
  });

  it("a reload race: the OLD socket closing after the NEW one opened does not mark the player offline", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const oldWs = bea.ws!;
    const newWs = await h.openSocket(bea); // the reloaded page connects first...
    await h.closeSocket(oldWs); // ...then the old page's socket finally closes
    expect(h.presence(bea)).toBe("connected");
    expect(h.engine().players.get(bea.playerId)!.disconnectedAt).toBeNull();
    await h.closeSocket(newWs);
  });

  it("rapid disconnect/reconnect cycles end in a consistent state", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    for (let i = 0; i < 15; i++) {
      await h.disconnect(bea);
      h.clock.advance(1000);
      await h.connect(bea);
    }
    expect(h.presence(bea)).toBe("connected");
    expect(h.engine().players.size).toBe(2);
    await h.disconnect(bea);
    // The grace window starts at the LAST drop, not the first.
    h.clock.advance(RECONNECT_GRACE_MS - 1);
    expect(h.presence(bea)).toBe("reconnecting");
  });

  it("duplicate reconnect attempts (Reconnect button + automatic socket) neither duplicate the seat nor fake presence", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    await h.disconnect(bea);
    for (let i = 0; i < 3; i++) {
      const r = await h.post(`/rooms/${h.roomId}/reconnect`, { playerId: bea.playerId, recoveryToken: bea.token });
      expect(r.status).toBe(200);
    }
    expect(h.presence(bea)).toBe("reconnecting"); // no device yet: not "connected"
    await Promise.all([h.connect(bea), h.openSocket(bea)]);
    expect(h.presence(bea)).toBe("connected");
    expect(h.engine().players.size).toBe(2);
  });
});

describe("half-open connections (a locked iPhone)", () => {
  it("the heartbeat terminates a socket that stops answering pings, so the player shows as reconnecting", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea", { connect: false });
    const silent = await h.openSocket(bea, { autoPong: false }); // like a suspended page: no pongs
    expect(h.presence(bea)).toBe("connected");
    h.server.heartbeatTick(); // ping
    await new Promise((r) => setTimeout(r, 30));
    h.server.heartbeatTick(); // no pong came back: terminate
    await waitFor(() => silent.readyState === WebSocket.CLOSED);
    await waitFor(() => h.presence(bea) === "reconnecting");
  });

  it("a healthy socket survives heartbeats", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    for (let i = 0; i < 4; i++) {
      h.server.heartbeatTick();
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(bea.ws!.readyState).toBe(WebSocket.OPEN);
    expect(h.presence(bea)).toBe("connected");
  });
});

describe("presence never changes competition outcomes", () => {
  it("CURRENT RULE KEPT: the last unanswered player going away past the grace period does not finish, abstain or remove them", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada, "trivia", { seed: 2 })).body["gameId"] as string;
    const qs = (myGame(await h.projection(ada), gid)["state"] as { questions: Json[] }).questions;
    for (const q of qs) await h.intent(ada, gid, "trivia-answer", { questionId: q["id"], chosenIndex: 0 });
    await h.disconnect(bea);
    h.clock.advance(RECONNECT_GRACE_MS * 10);
    expect(h.game(gid).status).toBe("playing");
    expect(h.game(gid).players).toEqual([ada.playerId, bea.playerId]);
    expect(h.game(gid).abstained ?? []).toEqual([]);
  });

  it("several players dropping at once are each tracked, and a spectator leaving changes no player's presence", async () => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const sws = new WebSocket(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=spectator`, [`cgn-spectator-${spec.body["spectatorToken"]}`]);
    await new Promise((r) => sws.once("message", r));
    await Promise.all([h.disconnect(players[1]!), h.disconnect(players[2]!)]);
    expect(players.map((p) => h.presence(p))).toEqual(["connected", "reconnecting", "reconnecting", "connected"]);
    await new Promise<void>((r) => { sws.once("close", () => r()); sws.terminate(); });
    await waitFor(() => h.engine().spectatorCount() === 0);
    expect(players.map((p) => h.presence(p))).toEqual(["connected", "reconnecting", "reconnecting", "connected"]);
  });
});
