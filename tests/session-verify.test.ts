/**
 * Sprint 2 Workstream C: the server confirms a saved seat before the app
 * offers "Continue as Ada?". A stored display name proves nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Harness } from "./helpers/harness.js";

let h: Harness;
beforeEach(async () => { h = await new Harness().start(); await h.createRoom("Family Night"); });
afterEach(async () => { await h.dispose(); });

describe("GET /rooms/:id/session", () => {
  it("a valid credential returns who the seat is, and nothing secret", async () => {
    const ada = await h.join("Ada", { host: true });
    const r = await h.get(`/rooms/${h.roomId}/session`, { "x-session-token": ada.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ roomId: h.roomId, roomName: "Family Night", playerId: ada.playerId, displayName: "Ada", isHost: true });
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(ada.token);
    expect(text).not.toMatch(/Hash|token/i);
  });

  it("21. an invalid or forged credential is rejected (no pretend sign-in)", async () => {
    await h.join("Ada", { host: true });
    expect((await h.get(`/rooms/${h.roomId}/session`, { "x-session-token": "a".repeat(64) })).status).toBe(401);
    expect((await h.get(`/rooms/${h.roomId}/session`)).status).toBe(401);
  });

  it("a credential for a room this server does not have is a 404, not a sign-in", async () => {
    const ada = await h.join("Ada", { host: true });
    expect((await h.get(`/rooms/room-does-not-exist/session`, { "x-session-token": ada.token })).status).toBe(404);
  });

  it("checking a saved seat creates nothing: no new seat, no ledger noise", async () => {
    const ada = await h.join("Ada", { host: true });
    const before = { seats: h.engine().players.size, ledger: h.engine().ledger.length };
    for (let i = 0; i < 3; i++) await h.get(`/rooms/${h.roomId}/session`, { "x-session-token": ada.token });
    expect({ seats: h.engine().players.size, ledger: h.engine().ledger.length }).toEqual(before);
  });
});
