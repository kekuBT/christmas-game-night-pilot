import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";

// Completion-sprint P2 engine tests: championship days, overrides, achievements,
// disconnected-player finishing, deadlines.
function roomWithPlayers(n: number) {
  const engine = new RoomEngine("Sprint P2");
  const host = engine.join("Host", { asHost: true }).player.id;
  const ids = [host];
  for (let i = 0; i < n - 1; i++) ids.push(engine.join(`G${i}`).player.id);
  return { engine, host, ids };
}
function finishMath(engine: RoomEngine, host: string, ids: string[], correct: boolean) {
  const game = engine.startGame(host, "math-mayhem", { official: true });
  for (const pid of ids) {
    for (const q of game.questions!) {
      const idx = correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length;
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: game.id, action: "submit-math-answer", payload: { questionId: q.id, chosenIndex: idx } }, pid);
    }
  }
  return game;
}

describe("Sprint P2 — championship, overrides, achievements, disconnections", () => {
  it("championship counts official games by day and ignores practice games", () => {
    const { engine, host, ids } = roomWithPlayers(4);
    finishMath(engine, host, ids, true);
    expect(engine.championshipResults().length).toBe(4);
    // 3 official games on day 1 would still be one PlayerDay per player, but
    // eligibility needs 3 valid days, so players are ineligible after day 1.
    expect(engine.championshipResults().every((r) => r.eligible === false)).toBe(true);
    engine.advanceDay(host);
    expect(engine.championshipDay).toBe(2);
    finishMath(engine, host, ids, true);
    engine.advanceDay(host);
    finishMath(engine, host, ids, true);
    const results = engine.championshipResults();
    expect(results.every((r) => r.eligible === true)).toBe(true);
    // A practice game on day 3 must not change the championship base.
    const before = results.map((r) => r.base);
    const practice = engine.startGame(host, "math-mayhem", { official: false });
    for (const pid of ids) for (const q of practice.questions!) {
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: practice.id, action: "submit-math-answer", payload: { questionId: q.id, chosenIndex: q.correctIndex } }, pid);
    }
    expect(engine.championshipResults().map((r) => r.base)).toEqual(before);
  });

  it("a host override is audited and flows into standings; a player override is rejected", () => {
    const { engine, host, ids } = roomWithPlayers(2);
    const game = finishMath(engine, host, ids, true);
    const before = engine.officialStandings();
    expect(() => engine.overrideScore(ids[1]!, game.id, ids[0]!, 0, "cheating")).toThrow();
    expect(() => engine.overrideScore(host, game.id, ids[0]!, 0, "")).toThrow("reason");
    engine.overrideScore(host, game.id, ids[0]!, 0, "corrected by host after review");
    const audit = engine.ledger.find((e) => e.type === "score-override");
    expect(audit?.actor).toBe(host);
    expect(audit?.reason).toBe("corrected by host after review");
    expect(audit?.previousPoints).toBeGreaterThan(0);
    expect(engine.officialStandings()).not.toEqual(before);
  });

  // Sprint 3 (P6): the disconnected player can come back until the deadline; then the game ends.
  it("a disconnected player cannot stall a quiz game: the deadline finishes it with their unanswered questions at 0", () => {
    const { engine, host, ids } = roomWithPlayers(3);
    const game = engine.startGame(host, "trivia", { official: true, seed: 1 });
    engine.disconnect(ids[2]!);
    for (const pid of [ids[0]!, ids[1]!]) {
      const state = game.extra as { questions: { id: string }[] };
      for (const q of state.questions) {
        engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: game.id, action: "trivia-answer", payload: { questionId: q.id, chosenIndex: 0 } }, pid);
      }
    }
    expect(game.status).toBe("playing");
    game.deadlineAt = Date.now() - 1;
    engine.tick();
    expect(game.status).toBe("finished");
    expect(game.outcome?.countsOfficially).toBe(true);
    expect(game.rawScores[ids[2]!]).toBe(0);
  });

  it("achievements and ceremony are derived from the ledger, never invented", () => {
    const { engine, host, ids } = roomWithPlayers(2);
    expect(engine.achievements().length).toBe(0);
    finishMath(engine, host, ids, true);
    const achievements = engine.achievements();
    expect(achievements.some((a) => a.ruleId === "first-game")).toBe(true);
    const ceremony = engine.ceremony();
    expect(ceremony.day).toBe(1);
    expect(typeof ceremony.winner).toBe("string");
  });

  it("only host/cohost can advance the day", () => {
    const { engine, host, ids } = roomWithPlayers(3);
    expect(() => engine.advanceDay(ids[1]!)).toThrow();
    expect(engine.advanceDay(host)).toBe(2);
  });
});
