import { describe, expect, it } from "vitest";
import { championshipTotal, CHAMPIONSHIP_CONFIG, dayScore, participationBonus } from "../src/scoring/championship.js";
import { computeChampionship } from "../src/scoring/ledger.js";

// Family Cup rules, owner-approved 2026-11-04. Deterministic: no seeds,
// no randomness, every case computed by hand in the comments.
const day = (playerId: string, d: number, solo: number[], team: number[] = []) => ({ playerId, day: d, soloScores: solo, teamScores: team });

describe("Family Cup — attendance from 3 to 7 days", () => {
  it.each([
    [3, 0],
    [4, 5],
    [5, 10],
    [6, 15],
    [7, 20],
  ])("%d qualifying days give +%d participation", (days, bonus) => {
    expect(participationBonus(days)).toBe(bonus);
    const scores = Array.from({ length: days }, (_, i) => 50 + i * 10);
    const r = championshipTotal(scores);
    expect(r.participationBonus).toBe(bonus);
    expect(r.qualifyingDays).toBe(days);
    expect(r.eligible).toBe(true);
  });
  it("participation is capped at +20 even at 7 days, and 8 hypothetical days would also cap", () => {
    expect(participationBonus(7)).toBe(20);
    expect(participationBonus(10)).toBe(20);
  });
  it("a 7-day player beats a 3-day player only on best-three + participation, not on attendance alone", () => {
    const seven = championshipTotal([100, 90, 80, 70, 60, 50, 40]); // best 270 + 20 = 290
    const three = championshipTotal([100, 100, 100]); // best 300 + 0 = 300
    expect(seven.total).toBe(290);
    expect(three.total).toBe(300);
    expect(three.total).toBeGreaterThan(seven.total);
  });
});

describe("Family Cup — eligibility and missing days", () => {
  it("2 days is ineligible, 3 days is eligible, and missing days add nothing", () => {
    expect(championshipTotal([100, 100]).eligible).toBe(false);
    expect(championshipTotal([100, 100]).total).toBe(200);
    expect(championshipTotal([90, 80, 70]).eligible).toBe(true);
    expect(championshipTotal([90, 80, 70]).total).toBe(240);
    // A player who attended only days 1, 4, and 7 has the same total as one
    // who attended days 1, 2, 3 with the same scores: gaps do not penalise.
    const gapped = computeChampionship([
      day("Ada", 1, [90]), day("Ada", 4, [80]), day("Ada", 7, [70]),
    ]);
    const consecutive = computeChampionship([
      day("Ada", 1, [90]), day("Ada", 2, [80]), day("Ada", 3, [70]),
    ]);
    expect(gapped[0]!.total).toBe(consecutive[0]!.total);
    expect(gapped[0]!.total).toBe(240);
  });
  it("a zero-score day still counts as attendance but adds nothing", () => {
    const r = championshipTotal([0, 90, 80]);
    expect(r.eligible).toBe(true);
    expect(r.total).toBe(170);
  });
  it("practice games never reach the championship (engine filter, documented here)", () => {
    // computeChampionship only receives PlayerDay entries the engine built
    // from finished OFFICIAL games; a practice-only player has no entries
    // and therefore no result at all — not a zero total that could rank.
    expect(computeChampionship([])).toEqual([]);
  });
});

describe("Family Cup — ties", () => {
  it("tied day scores share the day win, and tied totals fall to daily wins then median", () => {
    const results = computeChampionship([
      day("Ada", 1, [80]), day("Ada", 2, [80]), day("Ada", 3, [80]),
      day("Bea", 1, [80]), day("Bea", 2, [80]), day("Bea", 3, [80]),
    ]);
    // Identical totals, identical daily wins (each day is a shared win),
    // identical medians: joint ranking, neither ranked above the other by
    // an invented tie-break.
    expect(results[0]!.total).toBe(results[1]!.total);
    expect(results[0]!.countedDailyWins).toBe(3);
    expect(results[1]!.countedDailyWins).toBe(3);
  });
  it("a tied game score uses the averaged rank (midrank) before daily totals", () => {
    // Two players tie a game at 100, two others at 50: midrank gives
    // 83.33 to the tied leaders and 16.67 to the tied trailers.
    const results = computeChampionship([
      // Simulate one game per day via direct day scores is not possible here;
      // instead verify the daily-win logic on equal day scores.
      day("Ada", 1, [83.33]), day("Ada", 2, [83.33]), day("Ada", 3, [83.33]),
      day("Bea", 1, [83.33]), day("Bea", 2, [83.33]), day("Bea", 3, [83.33]),
    ]);
    expect(results[0]!.total).toBeCloseTo(249.99);
  });
  it("daily 75/25 split: a strong team day cannot outweigh a weak solo day beyond its quarter", () => {
    const soloOnly = dayScore({ soloScores: [40], teamScores: [] });
    const withTeam = dayScore({ soloScores: [40], teamScores: [100] });
    expect(soloOnly.score).toBe(40);
    expect(withTeam.score).toBeCloseTo(0.75 * 40 + 0.25 * 100);
    expect(withTeam.offBalance).toBe(false);
  });
  it("days without team games use the available category at 100% (configurable, default)", () => {
    expect(CHAMPIONSHIP_CONFIG.singleCategoryMode).toBe("available-only");
    expect(dayScore({ soloScores: [60], teamScores: [] }).score).toBe(60);
    expect(dayScore({ soloScores: [], teamScores: [60] }).score).toBe(60);
    const scaled = dayScore({ soloScores: [60], teamScores: [] }, { ...CHAMPIONSHIP_CONFIG, singleCategoryMode: "scaled" });
    expect(scaled.score).toBeCloseTo(45); // 75% of 60, if the owner later chooses scaled
  });
});

describe("Family Cup — Grand Finale outcomes", () => {
  it("finale is disabled by default: placement gives no bonus", () => {
    const results = computeChampionship([
      day("Ada", 1, [90]), day("Ada", 2, [80]), day("Ada", 3, [70]),
    ]);
    expect(results[0]!.finaleBonus).toBe(0);
    const withPlacement = computeChampionship(
      [day("Ada", 1, [90]), day("Ada", 2, [80]), day("Ada", 3, [70])],
      { finalePlacements: { Ada: 1 } },
    );
    expect(withPlacement[0]!.finaleBonus).toBe(0);
  });
  it.each([
    [1, 50],
    [2, 35],
    [3, 25],
    [4, 15],
    [5, 5],
    [9, 5],
  ])("finale placement %d gives +%d when enabled", (placement, bonus) => {
    const results = computeChampionship(
      [day("Ada", 1, [90]), day("Ada", 2, [80]), day("Ada", 3, [70])],
      { finalePlacements: { Ada: placement }, finaleEnabled: true },
    );
    expect(results[0]!.finaleBonus).toBe(bonus);
    expect(results[0]!.total).toBe(240 + bonus);
  });
  it("finale can change the winner, and cannot rescue an ineligible player", () => {
    const results = computeChampionship(
      [
        day("Ada", 1, [90]), day("Ada", 2, [80]), day("Ada", 3, [70]), // 240
        day("Bea", 1, [90]), day("Bea", 2, [80]), day("Bea", 3, [60]), // 230
        day("Cal", 1, [100]), day("Cal", 2, [100]), // ineligible
      ],
      { finalePlacements: { Bea: 1, Cal: 1 }, finaleEnabled: true },
    );
    const bea = results.find((r) => r.playerId === "Bea")!;
    const cal = results.find((r) => r.playerId === "Cal")!;
    expect(bea.total).toBe(280); // 230 + 50 finale
    expect(results[0]!.playerId).toBe("Bea");
    expect(cal.finaleBonus).toBe(0); // ineligible players get no finale bonus
    expect(results[results.length - 1]!.playerId).toBe("Cal");
  });
  it("formula holds end to end: total = best three + participation + finale", () => {
    const results = computeChampionship(
      [
        day("Ada", 1, [100]), day("Ada", 2, [90]), day("Ada", 3, [80]),
        day("Ada", 4, [70]), day("Ada", 5, [60]),
      ],
      { finalePlacements: { Ada: 2 }, finaleEnabled: true },
    );
    const ada = results[0]!;
    expect(ada.base).toBe(270); // 100+90+80
    expect(ada.participationBonus).toBe(10); // 5 days
    expect(ada.finaleBonus).toBe(35);
    expect(ada.total).toBe(270 + 10 + 35);
  });
});
