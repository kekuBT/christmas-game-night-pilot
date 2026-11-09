/**
 * Stage 5.1 (2C): when a phone's reply is lost, the server tells that player
 * (and only that player) which of their actions it accepted, so the phone can
 * stop saying "couldn't confirm" from the server's record, not a guess.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";

type Me = { acceptedEventIds?: string[] };

describe("accepted event ids", () => {
  it("lists a player's own accepted actions only, bounded, and survives a restart", () => {
    const engine = new RoomEngine("Ack", { timing: 2 });
    let t = 1_800_000_000_000;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id, engine.join("Amina").player.id, engine.join("Baraka").player.id];
    const g = engine.startGame(ids[0]!, "majority-rules", { official: false });
    const send = (pid: string, action: string, payload: Record<string, unknown>, clientEventId = randomUUID()) =>
      ({ id: clientEventId, r: engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId, roomId: engine.id, gameInstanceId: g.id, action, payload }, pid) });
    const me = (e: RoomEngine, pid: string) => (e.project("player", pid)["me"] as Me).acceptedEventIds ?? [];
    for (const p of ids) send(p, "briefing-ready", { ready: true });
    t += 10;

    const ok = send(ids[1]!, "majority-predict", { choice: "a" });
    expect(ok.r.accepted).toBe(true);
    expect(me(engine, ids[1]!)).toContain(ok.id);
    expect(me(engine, ids[2]!)).not.toContain(ok.id); // Baraka never sees Amina's
    expect(JSON.stringify(engine.project("tv"))).not.toContain(ok.id);

    const refused = send(ids[1]!, "majority-predict", { choice: "b" }); // already predicted
    expect(refused.r.accepted).toBe(false);
    expect(me(engine, ids[1]!)).not.toContain(refused.id);

    // A replay of the same event (a retry) is not listed twice.
    send(ids[1]!, "majority-predict", { choice: "a" }, ok.id);
    expect(me(engine, ids[1]!).filter((x) => x === ok.id)).toHaveLength(1);

    // Restored from the saved room: rebuilt from the saved replay store.
    const back = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>);
    expect(me(back, ids[1]!)).toContain(ok.id);
    expect(me(back, ids[2]!)).not.toContain(ok.id);
    expect(Object.keys(engine.toJSON())).not.toContain("recentAccepted"); // nothing new is saved

    // Bounded: only the newest RECENT_ACCEPTED_MAX are kept (fed through the
    // same internal step submitIntent uses for an accepted action).
    const note = (engine as unknown as { noteAccepted(a: string, e: string): void }).noteAccepted.bind(engine);
    const fed = Array.from({ length: RoomEngine.RECENT_ACCEPTED_MAX + 5 }, (_, i) => `ev-${i}`);
    for (const e of fed) note(ids[0]!, e);
    expect(me(engine, ids[0]!)).toEqual(fed.slice(-RoomEngine.RECENT_ACCEPTED_MAX));
  });
});
