import { describe, expect, it } from "vitest";
import { championshipTotal, dayScore, finalePoints, median, midrankScore, rankStandings } from "../src/scoring/championship.js";

describe("midrankScore", () => {
  it("distinct 4-player ranks give 100, 66.67, 33.33, 0", () => {
    const all = [400, 300, 200, 100];
    expect(midrankScore(400, all)).toBeCloseTo(100);
    expect(midrankScore(300, all)).toBeCloseTo(66.666, 2);
    expect(midrankScore(200, all)).toBeCloseTo(33.333, 2);
    expect(midrankScore(100, all)).toBeCloseTo(0);
  });
  it("tie for first shares average rank", () => {
    const all = [300, 300, 200, 100];
    expect(midrankScore(300, all)).toBeCloseTo(83.333, 2);
  });
  it("N=1 is invalid for championship", () => {
    expect(midrankScore(100, [100])).toBe(0);
  });
});

describe("dayScore", () => {
  it("75/25 when both categories exist", () => {
    const { score, offBalance } = dayScore({ soloScores: [80, 60], teamScores: [100] });
    expect(score).toBeCloseTo(0.75 * 70 + 0.25 * 100);
    expect(offBalance).toBe(false);
  });
  it("single category normalises to 100% with off-balance flag", () => {
    const { score, offBalance } = dayScore({ soloScores: [70], teamScores: [] });
    expect(score).toBe(70);
    expect(offBalance).toBe(true);
  });
});

describe("championshipTotal (Family Cup, approved 2026-11-04)", () => {
  it("best three sum, plus participation beyond three days", () => {
    const r = championshipTotal([75, 80, 90, 65, 70, 85]);
    expect(r.counted).toEqual([90, 85, 80]);
    expect(r.base).toBeCloseTo(255);
    expect(r.participationBonus).toBe(15); // 6 days: (6-3)*5
    expect(r.total).toBeCloseTo(270);
    expect(r.eligible).toBe(true);
  });
  it("3-day player is eligible; 2-day player is not", () => {
    expect(championshipTotal([93, 89, 88]).eligible).toBe(true);
    expect(championshipTotal([93, 89, 88]).total).toBe(270);
    expect(championshipTotal([100, 100]).eligible).toBe(false);
  });
});

describe("finale and ranking", () => {
  it("finale disabled by default", () => {
    expect(finalePoints(1)).toBe(0);
    expect(finalePoints(1, true)).toBe(50);
  });
  it("tie-break uses daily wins then median", () => {
    const ranked = rankStandings([
      { playerId: "a", total: 400, countedDailyWins: 1, countedMedian: 80 },
      { playerId: "b", total: 400, countedDailyWins: 2, countedMedian: 70 },
    ]);
    expect(ranked[0]?.playerId).toBe("b");
  });
  it("median works for odd and even", () => {
    expect(median([90, 80, 70])).toBe(80);
    expect(median([90, 80])).toBe(85);
  });
});
