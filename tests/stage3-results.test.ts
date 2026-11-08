/**
 * Stage 3 (bonus): results headlines, placements and Mild lines come only
 * from the server's recorded scores, and every phone tells the same story.
 */
import { describe, expect, it } from "vitest";
import { QUIPS, competitionRanks, resultsStory, stableIndex } from "../apps/web/src/ui/mchezo/lib/celebrate.js";

const NAMES: Record<string, string> = { a: "Ada", b: "Bea", c: "Cal", d: "Dee", e: "Eli" };
const nameOf = (id: string) => NAMES[id] ?? id;
const base = { gameInstanceId: "game-1", title: "Trivia Showdown", official: true, nameOf };
const ALL_QUIPS = Object.values(QUIPS).flat();

describe("ranks", () => {
  it("equal scores share a rank (1, 1, 3)", () => {
    const { ranks, order } = competitionRanks({ a: 300, b: 300, c: 100 }, nameOf);
    expect(ranks).toEqual({ a: 1, b: 1, c: 3 });
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("order does not depend on the order scores arrive in (same on every phone)", () => {
    const one = competitionRanks({ c: 100, b: 300, a: 300 }, nameOf);
    const two = competitionRanks({ a: 300, c: 100, b: 300 }, nameOf);
    expect(one).toEqual(two);
  });
});

describe("the story", () => {
  it("two players, one winner", () => {
    const s = resultsStory({ ...base, scores: { a: 480, b: 240 }, youId: "a" });
    expect(s.headline).toBe("Ada wins Trivia Showdown");
    expect(s.tone).toBe("win");
    expect(s.you?.label).toBe("You came 1st of 2");
    expect(s.celebrate).toBe(true);
  });
  it("three players: the loser is told kindly, the winner celebrates, nobody else does", () => {
    const facts = { ...base, scores: { a: 500, b: 300, c: 100 } };
    expect(resultsStory({ ...facts, youId: "c" }).you?.label).toBe("You came 3rd of 3");
    expect(QUIPS.youLast).toContain(resultsStory({ ...facts, youId: "c" }).you?.line);
    expect(resultsStory({ ...facts, youId: "b" }).celebrate).toBe(false);
    expect(resultsStory({ ...facts, youId: "b" }).you?.line).toMatch(/middle|first, not last/);
  });
  it("three-way tie for first: named, shared, everyone celebrates on their own phone", () => {
    const s = resultsStory({ ...base, scores: { a: 200, b: 200, c: 200, d: 100 }, youId: "b" });
    expect(s.headline).toBe("3-way tie for first");
    expect(s.winners).toEqual(["a", "b", "c"]);
    expect(s.you?.label).toBe("You tied for 1st of 4");
    expect(QUIPS.tie).toContain(s.quip);
    expect(s.celebrate).toBe(true);
  });
  it("a two-way tie names both", () => {
    expect(resultsStory({ ...base, scores: { a: 200, b: 200, c: 100 } }).headline).toBe("Ada and Bea tie for first");
  });
  it("everyone tied, and nobody scored, are said plainly", () => {
    expect(resultsStory({ ...base, scores: { a: 100, b: 100 } }).headline).toBe("Everyone tied");
    const z = resultsStory({ ...base, scores: { a: 0, b: 0, c: 0 }, youId: "a" });
    expect(z.headline).toBe("Nobody scored this time");
    expect(z.celebrate).toBe(false);
  });
  it("a close finish states the real gap", () => {
    const s = resultsStory({ ...base, gameInstanceId: "close", scores: { a: 1000, b: 960, c: 100 } });
    expect(QUIPS.close.map((q) => q.replace("{gap}", "40 points"))).toContain(s.quip);
  });
  it("practice games say so, official ones never get the practice line", () => {
    expect(QUIPS.practice).toContain(resultsStory({ ...base, official: false, scores: { a: 10, b: 5 } }).quip);
    expect(QUIPS.practice).not.toContain(resultsStory({ ...base, scores: { a: 10, b: 5 } }).quip);
  });
  it("a player who answered nothing (disconnected) is told without blame; one who sat out, as such", () => {
    const facts = { ...base, scores: { a: 300, b: 0, c: 100 } };
    expect(resultsStory({ ...facts, youId: "b", yourParticipation: { done: 0, of: 10 } }).you?.line).toBe(QUIPS.youMissed[0]);
    expect(resultsStory({ ...facts, youId: "b", youSatOut: true, yourParticipation: { done: 0, of: 10 } }).you?.line).toBe(QUIPS.youSatOut[0]);
  });
  it("ten players with long names", () => {
    const scores: Record<string, number> = {};
    for (let i = 0; i < 10; i++) scores[`p${i}`] = 1000 - i * 50;
    const s = resultsStory({ ...base, nameOf: (id) => `Maximilian Ochieng-${id}`, scores, youId: "p9" });
    expect(s.you?.label).toBe("You came 10th of 10");
    expect(s.headline).toBe("Maximilian Ochieng-p0 wins Trivia Showdown");
  });
  it("the same game tells the same story on every phone and after a refresh", () => {
    const facts = { ...base, gameInstanceId: "g-42", scores: { a: 300, b: 200, c: 100 } };
    expect(resultsStory(facts).quip).toBe(resultsStory({ ...facts }).quip);
    expect(stableIndex("g-42:all", 3)).toBe(stableIndex("g-42:all", 3));
  });
  it("every line is Mild: short, no names of real people, no numbers it didn't get", () => {
    expect(ALL_QUIPS.length).toBeGreaterThanOrEqual(20);
    expect(ALL_QUIPS.length).toBeLessThanOrEqual(30);
    for (const q of ALL_QUIPS) {
      expect(q.length).toBeLessThan(80);
      expect(q).not.toMatch(/\d/); // numbers only ever come from {gap} or {n}
      expect(q).not.toMatch(/stupid|loser|idiot|worst|pathetic|terrible/i);
    }
  });
});
