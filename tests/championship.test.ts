import { describe, expect, it } from "vitest";
import { computeChampionship } from "../src/scoring/ledger.js";

describe("7-day championship worked example", () => {
  it("Ada / Bea / Cal example from the brief", () => {
    const days = [
      ...[75, 80, 90, 65, 70, 85].map((s, i) => ({ playerId: "Ada", day: i + 1, soloScores: [s], teamScores: [] })),
      ...[93, 89, 88].map((s, i) => ({ playerId: "Bea", day: i + 1, soloScores: [s], teamScores: [] })),
      ...[100, 100].map((s, i) => ({ playerId: "Cal", day: i + 1, soloScores: [s], teamScores: [] })),
    ];
    const results = computeChampionship(days);
    const ada = results.find((r) => r.playerId === "Ada")!;
    const bea = results.find((r) => r.playerId === "Bea")!;
    const cal = results.find((r) => r.playerId === "Cal")!;
    expect(ada.counted).toEqual([90, 85, 80, 75, 70]);
    expect(ada.base).toBeCloseTo(400);
    expect(ada.eligible).toBe(true);
    expect(bea.base).toBeCloseTo(450);
    expect(bea.eligible).toBe(true);
    expect(cal.eligible).toBe(false);
    // Bea ranks first on base, despite fewer days
    expect(results[0]?.playerId).toBe("Bea");
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
    expect(ada.eligible).toBe(true);
  });
});
