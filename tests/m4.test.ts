import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dayCeremony, evaluateAchievements } from "../src/server/achievements.js";
import { buildHub } from "../src/server/hub.js";
import { MemoryBook } from "../src/server/memorybook.js";
import { RoomEngine } from "../src/server/room.js";
import { computeChampionship } from "../src/scoring/ledger.js";

describe("M4 Hub / Memory Book / Achievements", () => {
  it("hub is public only and shows standings", () => {
    const engine = new RoomEngine("Hub Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.join("Guest");
    const standings = computeChampionship([
      { playerId: host, day: 1, soloScores: [80], teamScores: [] },
      { playerId: host, day: 2, soloScores: [90], teamScores: [] },
      { playerId: host, day: 3, soloScores: [70], teamScores: [] },
    ]);
    const hub = buildHub(engine, standings, ["A great game!"]);
    expect(hub.roomName).toBe("Hub Room");
    expect(hub.joinCode).toBe(engine.joinCode);
    expect(JSON.stringify(hub)).not.toContain("correctIndex");
    expect(hub.standings[0]?.playerId).toBe(host);
  });

  it("memory book requires real ledger events, approve/revoke controls export", () => {
    const engine = new RoomEngine("Book Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    const guest = engine.join("Guest").player.id;
    const game = engine.startGame(host, "math-mayhem", { seed: 1 });
    const book = new MemoryBook();
    expect(() => book.addFromLedger(1, "Fake result", ["evt-nonexistent"], engine.ledger)).toThrow();
    expect(() => book.addFromLedger(1, "No source", [], engine.ledger)).toThrow();
    expect(() => book.addFromLedger(1, "Joined, not finished", [engine.ledger[0]!.eventId], engine.ledger)).toThrow();
    for (const pid of [host, guest]) {
      for (const q of game.questions!) {
        engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: game.id, action: "submit-math-answer", payload: { questionId: q.id, chosenIndex: q.correctIndex } }, pid);
      }
    }
    expect(game.status).toBe("finished");
    const finishedEvt = engine.ledger.find((e) => e.type === "game-finished")!;
    const entry = book.addFromLedger(1, "Math Mayhem was played.", [finishedEvt.eventId], engine.ledger);
    expect(entry.derivedFacts.length).toBeGreaterThan(0);
    expect(book.exportMarkdown("Book Room")).not.toContain("Math Mayhem was played.");
    book.approve(entry.id, host);
    expect(book.exportMarkdown("Book Room")).toContain("Math Mayhem was played.");
    expect(book.exportMarkdown("Book Room")).toContain("From the ledger");
    book.revoke(entry.id);
    expect(book.exportMarkdown("Book Room")).not.toContain("Math Mayhem was played.");
  });

  it("achievements are ledger-grounded and ceremony picks the leader", () => {
    const engine = new RoomEngine("Ceremony Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.join("Guest");
    engine.startGame(host, "math-mayhem", { seed: 1 });
    const achievements = evaluateAchievements(engine.ledger, { "game-1": { [host]: 1200 } });
    expect(achievements.some((a) => a.ruleId === "perfect-math")).toBe(true);
    const ceremony = dayCeremony(1, [{ playerId: host, displayName: "Host", base: 400 }]);
    expect(ceremony.winner).toBe("Host");
  });
});
