/**
 * Sprint 2 Workstream B: host readiness and fair game starts.
 *
 * Requirement: nobody is left out of an official game without the host
 * knowing and choosing it; the game's final roster is exactly the roster
 * the host was shown; nobody is added after the start. Enforced by the
 * server, not by disabled buttons.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECONNECT_GRACE_MS } from "../src/server/room.js";
import { FakeClock, Harness, myGame, type Json } from "./helpers/harness.js";

let h: Harness;
beforeEach(async () => { h = await new Harness(undefined, { clock: new FakeClock() }).start(); await h.createRoom(); });
afterEach(async () => { await h.dispose(); });

const readinessOf = async (p: Parameters<Harness["projection"]>[0]) => (await h.projection(p))["readiness"] as {
  registered: number; connected: number; reconnecting: number; away: number; wouldPlay: string[]; wouldMiss: { id: string; presence: string }[];
};

describe("readiness view", () => {
  it("reports who is here, reconnecting and away, and exactly who a start would include or leave out", async () => {
    const [ada, bea, cal, dee] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    await h.disconnect(cal);
    await h.disconnect(dee);
    h.clock.advance(RECONNECT_GRACE_MS); // Dee has been gone longer
    await h.connect(cal);
    await h.disconnect(cal); // Cal just dropped
    const r = await readinessOf(ada);
    expect(r).toMatchObject({ registered: 4, connected: 2, reconnecting: 1, away: 1, wouldPlay: [ada.playerId, bea.playerId] });
    expect(r.wouldMiss.map((m) => [m.id, m.presence])).toEqual([[cal.playerId, "reconnecting"], [dee.playerId, "away"]]);
    // Non-hosts see the same honest counts (presence is public in the room).
    expect((await readinessOf(bea)).reconnecting).toBe(1);
  });
});

describe("starting official games", () => {
  it("10. everyone connected: Start just works, no extra step", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const r = await readinessOf(ada);
    expect(r.wouldMiss).toEqual([]);
    const started = await h.startGame(ada, "trivia", { roster: r.wouldPlay });
    expect(started.status).toBe(201);
    expect(h.game(started.body["gameId"] as string).players).toEqual([ada.playerId, bea.playerId]);
  });

  it("11. a player who drops just before Start is not silently excluded: the server asks (409)", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    const res = await h.startGame(ada, "trivia");
    expect(res.status).toBe(409);
    expect(res.body["code"]).toBe("PLAYERS_RECONNECTING");
    expect(String(res.body["error"])).toContain("Cal");
    expect((res.body["readiness"] as Json)["reconnecting"]).toBe(1);
    expect([...h.engine().games.values()]).toHaveLength(0); // nothing started
    expect(bea.playerId).toBeTruthy();
  });

  it("practice games do not ask, but still never include someone without a live connection", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    const res = await h.startGame(ada, "trivia", { official: false });
    expect(res.status).toBe(201);
    expect(h.game(res.body["gameId"] as string).players).toEqual([ada.playerId, bea.playerId]);
  });

  it("12. the absent player comes back inside the grace period: the start includes them", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    expect((await h.startGame(ada, "trivia")).status).toBe(409);
    h.clock.advance(15_000);
    await h.connect(cal);
    const res = await h.startGame(ada, "trivia");
    expect(res.status).toBe(201);
    expect(h.game(res.body["gameId"] as string).players).toEqual([ada.playerId, bea.playerId, cal.playerId]);
  });

  it("13. the host explicitly proceeds without them: the roster is exactly the one shown, and the choice is audited", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    const shown = (await readinessOf(ada)).wouldPlay;
    const res = await h.startGame(ada, "trivia", { roster: shown, proceedWithout: [cal.playerId] });
    expect(res.status).toBe(201);
    const gid = res.body["gameId"] as string;
    expect(h.game(gid).players).toEqual(shown);
    const ev = h.engine().ledger.find((e) => e.type === "game-started" && e.gameInstanceId === gid)!;
    expect(ev.detail).toEqual({ leftOut: [{ id: cal.playerId, presence: "reconnecting" }], startedWithoutOnPurpose: [cal.playerId] });
    // Cal coming back afterwards is NOT added to the running game.
    await h.connect(cal);
    expect(h.game(gid).players).toEqual(shown);
    expect(myGame(await h.projection(cal), gid)["participant"]).toBe(false);
    expect(bea.playerId).toBeTruthy();
  });

  it("someone gone longer than the grace period does not block a start (no nagging about people who left)", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    h.clock.advance(RECONNECT_GRACE_MS);
    const res = await h.startGame(ada, "trivia");
    expect(res.status).toBe(201);
    expect(h.game(res.body["gameId"] as string).players).toEqual([ada.playerId, bea.playerId]);
  });

  it("14. a participant who reconnects after the start keeps their place in that game", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada, "trivia")).body["gameId"] as string;
    await h.disconnect(bea);
    h.clock.advance(RECONNECT_GRACE_MS * 3);
    await h.connect(bea);
    expect(h.game(gid).players).toContain(bea.playerId);
    expect(myGame(await h.projection(bea), gid)["participant"]).toBe(true);
  });
});

describe("15. the server, not the UI, enforces start rules", () => {
  it("a roster that no longer matches (someone dropped after the host looked) is refused", async () => {
    const [ada, , cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    const shown = (await readinessOf(ada)).wouldPlay;
    await h.disconnect(cal);
    const res = await h.startGame(ada, "trivia", { roster: shown, proceedWithout: [cal.playerId] });
    expect(res.status).toBe(409);
    expect(res.body["code"]).toBe("ROSTER_CHANGED");
  });

  it("a roster that names someone without a live connection cannot smuggle them in", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    h.clock.advance(RECONNECT_GRACE_MS);
    const res = await h.startGame(ada, "trivia", { roster: [ada.playerId, bea.playerId, cal.playerId] });
    expect(res.status).toBe(409);
    expect(res.body["code"]).toBe("ROSTER_CHANGED");
    expect(h.engine().games.size).toBe(0);
  });

  it("a regular player cannot start, even with a valid roster", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const res = await h.startGame(bea, "trivia", { roster: (await readinessOf(ada)).wouldPlay });
    expect(res.status).toBe(400);
    expect(h.engine().games.size).toBe(0);
  });

  it("proceeding without people still respects the game's minimum players", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    await h.disconnect(bea);
    const res = await h.startGame(ada, "trivia", { proceedWithout: [bea.playerId] });
    expect(res.status).toBe(400);
    expect(String(res.body["error"])).toContain("Need at least 2");
  });

  it("an invalid session cannot start a game", async () => {
    await h.join("Ada", { host: true });
    const res = await h.post(`/rooms/${h.roomId}/games`, { gameId: "trivia", official: true }, "f".repeat(64));
    expect(res.status).toBe(401);
  });
});
