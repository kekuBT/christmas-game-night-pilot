import { describe, expect, it } from "vitest";
import { championshipTotal, dayScore, finalePoints, median, midrankScore, rankStandings } from "../src/scoring/championship.js";
import { generateMathQuestions, mathSpeedBonus, scoreMathAnswer } from "../src/games/math.js";
import { scoreTrivia, triviaSpeedBonus } from "../src/games/trivia.js";
import { scoreYear, YEAR_EVENTS } from "../src/games/year.js";
import { scoreGeography, GEOGRAPHY_PACK } from "../src/games/geography.js";
import { scoreWhoSaid, WHO_SAID_PACK } from "../src/games/whosaid.js";
import { connectionsScore, CONNECTIONS_BOARD, guessConnections } from "../src/games/connections.js";
import { normalizeSprintAnswer, scoreSprintRound, SPRINT_CATEGORIES } from "../src/games/sprint.js";

// Completion-sprint P4: scoring correctness, ties, and championship maths.
// Cases are data-driven but each asserts a distinct rule, not a repeated count.

describe("midrankScore", () => {
  it.each([
    [100, [100, 50], 100],
    [50, [100, 50], 0],
    [100, [100, 100], 50],
    [75, [100, 75, 50], 50],
    [100, [100], 0],
    [0, [0, 0, 0], 50],
    [200, [100, 200, 300], 50],
    [300, [100, 200, 300], 100],
    [100, [100, 200, 300], 0],
    [90, [90, 90, 80, 80], 83.33333333333333],
    [80, [90, 90, 80, 80], 16.666666666666668],
  ])("raw %d in %j gives %d", (raw, all, expected) => {
    expect(midrankScore(raw, all as number[])).toBe(expected);
  });
});

describe("dayScore and championshipTotal", () => {
  it.each([
    [{ soloScores: [100], teamScores: [] }, 100],
    [{ soloScores: [], teamScores: [100] }, 100],
    [{ soloScores: [100, 50], teamScores: [80] }, 75 * 0.75 + 80 * 0.25],
    [{ soloScores: [], teamScores: [] }, 0],
  ])("dayScore %j gives %d", (components, expected) => {
    expect(dayScore(components).score).toBeCloseTo(expected);
  });
  it("flags off-balance days", () => {
    expect(dayScore({ soloScores: [100], teamScores: [] }).offBalance).toBe(true);
    expect(dayScore({ soloScores: [100], teamScores: [100] }).offBalance).toBe(false);
  });
  it.each([
    [[90, 85, 80, 75, 70], true, 255, 10],
    [[93, 89, 88], true, 270, 0],
    [[100, 100], false, 200, 0],
    [[100], false, 100, 0],
    [[], false, 0, 0],
    [[10, 20, 30, 40, 50, 60, 70], true, 180, 20],
  ])("total %j eligible=%s base=%d participation=%d", (days, eligible, base, participation) => {
    const r = championshipTotal(days as number[]);
    expect(r.eligible).toBe(eligible);
    expect(r.base).toBe(base);
    expect(r.participationBonus).toBe(participation);
    expect(r.counted.length).toBeLessThanOrEqual(3);
  });
  it("best three drops the lower days, without penalising missing days", () => {
    const r = championshipTotal([10, 20, 30, 40, 50, 60, 70]);
    expect(r.counted).toEqual([70, 60, 50]);
    expect(r.base).toBe(180);
    expect(r.total).toBe(200); // 180 + 20 participation (7 days)
  });
  it("finale is disabled by default and laddered when enabled", () => {
    expect(finalePoints(1)).toBe(0);
    expect(finalePoints(1, true)).toBe(50);
    expect(finalePoints(2, true)).toBe(35);
    expect(finalePoints(5, true)).toBe(5);
    expect(finalePoints(9, true)).toBe(5);
  });
  it("median and rank tie-breaks", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const ranked = rankStandings([
      { playerId: "a", total: 100, countedDailyWins: 1, countedMedian: 50 },
      { playerId: "b", total: 100, countedDailyWins: 2, countedMedian: 40 },
      { playerId: "c", total: 90, countedDailyWins: 9, countedMedian: 90 },
    ]);
    expect(ranked.map((r) => r.playerId)).toEqual(["b", "a", "c"]);
  });
});

describe("per-game scoring rules", () => {
  it("math: correct answer plus capped speed bonus, wrong is zero", () => {
    const qs = generateMathQuestions(7);
    expect(qs.length).toBe(10);
    const q = qs[0]!;
    expect(scoreMathAnswer(q, q.correctIndex, 0)).toBe(120);
    expect(scoreMathAnswer(q, q.correctIndex, 60000)).toBe(100);
    expect(scoreMathAnswer(q, (q.correctIndex + 1) % q.options.length, 0)).toBe(0);
    expect(mathSpeedBonus(0)).toBe(20);
    expect(mathSpeedBonus(60000)).toBe(0);
  });
  it("math questions are deterministic per seed and varied across seeds", () => {
    const a = generateMathQuestions(42).map((q) => q.prompt);
    const b = generateMathQuestions(42).map((q) => q.prompt);
    const c = generateMathQuestions(43).map((q) => q.prompt);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("trivia: correct with speed bonus, wrong and null are zero", () => {
    const q = { id: "t1", prompt: "P", options: ["a", "b"], correctIndex: 1 } as Parameters<typeof scoreTrivia>[0];
    expect(scoreTrivia(q, 1, 0)).toBeGreaterThan(100);
    expect(scoreTrivia(q, 0, 0)).toBe(0);
    expect(scoreTrivia(q, null, 0)).toBe(0);
    expect(triviaSpeedBonus(0)).toBeGreaterThanOrEqual(0);
  });
  it.each([
    [0, 100],
    [1, 90],
    [5, 50],
    [10, 0],
    [11, 0],
    [100, 0],
  ])("year: |guess-year| %d gives %d", (diff, expected) => {
    const ev = YEAR_EVENTS[0]!;
    expect(scoreYear(ev, ev.year + diff)).toBe(expected);
    expect(scoreYear(ev, null)).toBe(0);
  });
  it("geography and who-said: correct 100, wrong/null 0", () => {
    const g = GEOGRAPHY_PACK[0]!;
    expect(scoreGeography(g, g.correctIndex)).toBe(100);
    expect(scoreGeography(g, (g.correctIndex + 1) % g.options.length)).toBe(0);
    expect(scoreGeography(g, null)).toBe(0);
    const w = WHO_SAID_PACK[0]!;
    expect(scoreWhoSaid(w, w.correctIndex)).toBe(100);
    expect(scoreWhoSaid(w, null)).toBe(0);
  });
  it("connections: solved groups, mistake cap, and guessing", () => {
    const ps = { solved: [] as string[], mistakes: 0, guessed: [] as string[][] };
    expect(connectionsScore(ps)).toBe(0);
    const board = CONNECTIONS_BOARD;
    const firstCategory = board.tiles.filter((t) => t.category === board.tiles[0]!.category).map((t) => t.id);
    expect(firstCategory.length).toBe(4);
    const res = guessConnections(board, ps, firstCategory);
    expect(res.correct).toBe(true);
    expect(connectionsScore(ps)).toBe(100);
    // Sprint 4: tiles from a group already solved can't be guessed again (no free "attempts").
    expect(() => guessConnections(board, ps, [board.tiles[0]!.id, board.tiles[1]!.id, board.tiles[4]!.id, board.tiles[5]!.id])).toThrow("TILE_ALREADY_SOLVED");
    const mixed = [board.tiles[4]!.id, board.tiles[5]!.id, board.tiles[8]!.id, board.tiles[9]!.id];
    const wrong = guessConnections(board, ps, mixed);
    expect(wrong.correct).toBe(false);
    expect(ps.mistakes).toBe(1);
    // A rejected guess (unknown tile) is not recorded as an attempt.
    const before = ps.guessed.length;
    expect(() => guessConnections(board, ps, [board.tiles[4]!.id, board.tiles[5]!.id, board.tiles[8]!.id, "tile-nope"])).toThrow("UNKNOWN_TILE");
    expect(ps.guessed.length).toBe(before);
  });
  it("sprint: normalisation and uniqueness", () => {
    expect(normalizeSprintAnswer("  New York ")).toBe("new york");
    expect(normalizeSprintAnswer("PARIS")).toBe("paris");
    const category = SPRINT_CATEGORIES[0]!;
    const a1 = category.answers[0]!;
    const a2 = category.answers[1]!;
    const round = scoreSprintRound(category, { p1: [a1, "not-a-real-answer"], p2: [a1, a2] });
    // p1: one valid (shared) answer; p2: one shared + one unique answer, so p2 outscores p1.
    expect(round["p2"]).toBeGreaterThan(round["p1"]!);
    expect(round["p1"]).toBeGreaterThan(0);
  });
});
