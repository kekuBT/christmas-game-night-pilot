/**
 * S3-LOB-02 (Stage 3 live QA): guests couldn't tell from the lobby whether
 * the next game was Official or Practice; worse, their "Up next" card showed
 * their own tab's default game, not the host's pick. The host's plan (game
 * + mode) is now shared through the server so every screen shows the same.
 * It is only a plan: it starts nothing, and every start rule still applies.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Harness, type Json } from "./helpers/harness.js";

let h: Harness | undefined;
afterEach(async () => { await h?.dispose(); h = undefined; });

async function room() {
  h = new Harness();
  await h.start();
  await h.createRoom("Plan");
  const host = await h.join("Host", { host: true });
  const guest = await h.join("Guest");
  return { host, guest };
}
const plan = (body: Json, token?: string) => h!.post(`/rooms/${h!.roomId}/plan`, body, token);

describe("S3-LOB-02: the host's plan for the next game", () => {
  it("the host's plan reaches every screen: players, TV and spectators", async () => {
    const { host, guest } = await room();
    expect((await h!.projection(guest))["upNext"]).toBeUndefined();
    const r = await plan({ gameId: "math-mayhem", official: false }, host.token);
    expect(r.status).toBe(200);
    expect((await h!.projection(guest))["upNext"]).toEqual({ gameId: "math-mayhem", official: false });
    expect((await h!.projection(host))["upNext"]).toEqual({ gameId: "math-mayhem", official: false });
    expect((await h!.tv())["upNext"]).toEqual({ gameId: "math-mayhem", official: false });
    await plan({ gameId: "trivia", official: true }, host.token);
    expect((await h!.projection(guest))["upNext"]).toEqual({ gameId: "trivia", official: true });
  });
  it("only the host or a cohost can set it", async () => {
    const { host, guest } = await room();
    expect((await plan({ gameId: "trivia", official: false }, guest.token)).status).toBe(403);
    expect((await plan({ gameId: "trivia", official: false })).status).toBe(401);
    const co = await h!.post(`/rooms/${h!.roomId}/cohost`, { targetId: guest.playerId }, host.token);
    expect(co.status).toBeLessThan(300);
    expect((await plan({ gameId: "geography", official: false }, guest.token)).status).toBe(200);
    expect((await h!.projection(host))["upNext"]).toEqual({ gameId: "geography", official: false });
  });
  it("bad plans are refused: unknown game, missing mode, extra fields, official practice-only games", async () => {
    const { host } = await room();
    expect((await plan({ gameId: "no-such-game", official: false }, host.token)).status).toBe(400);
    expect((await plan({ gameId: "trivia" }, host.token)).status).toBe(400);
    expect((await plan({ gameId: "trivia", official: "yes" }, host.token)).status).toBe(400);
    expect((await plan({ gameId: "trivia", official: false, start: true }, host.token)).status).toBe(400);
    expect((await plan({ gameId: "impostor", official: true }, host.token)).status).toBe(400);
    expect((await plan({ gameId: "impostor", official: false }, host.token)).status).toBe(200);
  });
  it("a plan starts nothing and changes no start rule", async () => {
    const { host, guest } = await room();
    await plan({ gameId: "trivia", official: true }, host.token);
    const p = await h!.projection(guest);
    expect((p["games"] as Json[]).length).toBe(0);
    // The guest still can't start, whatever the plan says.
    const start = await h!.post(`/rooms/${h!.roomId}/games`, { gameId: "trivia", official: true }, guest.token);
    expect(start.status).toBeGreaterThanOrEqual(400);
    expect(((await h!.projection(guest))["games"] as Json[]).length).toBe(0);
    // The host's Start decides the mode, as before.
    const ok = await h!.startGame(host, "trivia", { official: false });
    expect(ok.status).toBe(201);
  });
});
