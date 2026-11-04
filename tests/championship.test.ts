import { describe, expect, it } from "vitest";
import { computeChampionship } from "../src/scoring/ledger.js";

describe("7-day championship worked example (Family Cup, approved 2026-11-04)", () => {
  it("Ada / Bea / Cal example, recomputed under best-three + participation", () => {
    const days = [
      ...[75, 80, 90, 65, 70, 85].map((s, i) => ({ playerId: "Ada", day: i + 1, soloScores: [s], teamScores: [] })),
      ...[93, 89, 88].map((s, i) => ({ playerId: "Bea", day: i + 1, soloScores: [s], teamScores: [] })),
      ...[100, 100].map((s, i) => ({ playerId: "Cal", day: i + 1, soloScores: [s], teamScores: [] })),
    ];
    const results = computeChampionship(days);
    const ada = results.find((r) => r.playerId === "Ada")!;
    const bea = results.find((r) => r.playerId === "Bea")!;
    const cal = results.find((r) => r.playerId === "Cal")!;
    // Ada: best three 90+85+80 = 255, participation (6-3)*5 = 15, total 270.
    expect(ada.counted).toEqual([90, 85, 80]);
    expect(ada.base).toBeCloseTo(255);
    expect(ada.participationBonus).toBe(15);
    expect(ada.total).toBeCloseTo(270);
    expect(ada.eligible).toBe(true);
    // Bea: best three 93+89+88 = 270, participation 0, total 270.
    expect(bea.base).toBeCloseTo(270);
    expect(bea.total).toBeCloseTo(270);
    expect(bea.eligible).toBe(true);
    // Cal: only 2 days, ineligible, provisional total 200, ranked last.
    expect(cal.eligible).toBe(false);
    expect(cal.total).toBeCloseTo(200);
    expect(results[results.length - 1]?.playerId).toBe("Cal");
    // Ada and Bea tie on total 270; Ada wins the tie-break on daily wins.
    expect(results[0]?.playerId).toBe("Ada");
  });

  it("75/25 day weighting and absent-category flag are preserved in day scores", () => {
    const days = [
      { playerId: "Ada", day: 1, soloScores: [80, 60], teamScores: [100] },
      { playerId: "Ada", day: 2, soloScores: [70], teamScores: [] },
      { playerId: "Ada", day: 3, soloScores: [90], teamScores: [80] },
    ];
    const results = computeChampionship(days);
    const ada = results[0]!;
    expect(ada.dayScores[0]).toBeCloseTo(0.75 * 70 + 0.25 * 100);
    expect(ada.dayScores[1]).toBe(70);
    expect(ada.dayScores[2]).toBeCloseTo(0.75 * 90 + 0.25 * 80);
    expect(ada.base).toBeCloseTo(77.5 + 70 + 87.5);
    expect(ada.eligible).toBe(true);
  });
});
