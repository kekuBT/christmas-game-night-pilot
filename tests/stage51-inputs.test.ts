/**
 * Stage 5.1 (O-02): drafts belong to one game, round and phase. The older
 * panel is mounted per draftKey; Category Sprint tells a player their own
 * answers are in from the server's state, and never shows anyone else's.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { draftKey } from "../apps/web/src/ui/mchezo/lib/draftKey.js";
import { RoomEngine } from "../src/server/room.js";

describe("draft scope", () => {
  it("a new game, round or phase gets a new key; the same one keeps it", () => {
    const a = draftKey({ id: "game-1", lifecycle: { phaseKey: "r:0" } });
    expect(draftKey({ id: "game-1", lifecycle: { phaseKey: "r:0" } })).toBe(a);
    expect(draftKey({ id: "game-1", lifecycle: { phaseKey: "r:1" } })).not.toBe(a); // next Sprint round
    expect(draftKey({ id: "game-2", lifecycle: { phaseKey: "r:0" } })).not.toBe(a); // next game
    expect(draftKey({ id: "game-3", lifecycle: { phaseKey: "clue" } })).not.toBe(draftKey({ id: "game-3", lifecycle: { phaseKey: "guess" } })); // Impostor clue vs final guess
  });
});

describe("Category Sprint: your own answers, from the server", () => {
  it("shows your round's answers once they're in, never another player's, and refuses a second send", () => {
    const engine = new RoomEngine("Sprint", { timing: 2 });
    let t = 1_800_000_000_000;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const g = engine.startGame(ids[0]!, "category-sprint", { official: false });
    const send = (pid: string, action: string, payload: Record<string, unknown>) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action, payload }, pid);
    for (const p of ids) send(p, "briefing-ready", { ready: true });
    t += 10;
    const mineOf = (pid: string) => ((engine.project("player", pid).myGames as { id: string; state: Record<string, unknown> }[]).find((x) => x.id === g.id)!.state);
    // Marker answers that no category or projection text can contain: the
    // round's category is dealt at random, and with real words ("school")
    // the privacy checks below failed whenever "Things in a school" came up.
    const answers = ["zqmarkerone", "zqmarkertwo"];
    expect(mineOf(ids[1]!)["mySubmission"]).toBeUndefined();
    expect(send(ids[1]!, "sprint-answers", { answers }).accepted).toBe(true);
    expect(mineOf(ids[1]!)["mySubmission"]).toEqual(answers);
    expect(mineOf(ids[2]!)["mySubmission"]).toBeUndefined(); // Baraka sees nothing of Amina's
    expect(JSON.stringify(engine.project("player", ids[2]!))).not.toContain("zqmarker"); // nowhere in Baraka's projection
    expect(JSON.stringify(engine.project("tv"))).not.toContain("zqmarker");
    expect(send(ids[1]!, "sprint-answers", { answers }).accepted).toBe(false); // counted once
  });
});
