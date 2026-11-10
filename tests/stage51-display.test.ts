/**
 * Stage 5.1 (O-05): the Family Cup screen rounds for display only and shares
 * a place exactly when the server's ranking calls it a joint placement.
 */
import { describe, expect, it } from "vitest";
import { fmtPoints, sharedPlaces } from "../apps/web/src/ui/mchezo/lib/cupDisplay.js";
import { rankStandings } from "../src/scoring/championship.js";

describe("Cup display", () => {
  it("points: whole numbers stay whole; averages show one decimal; nothing else changes", () => {
    expect(fmtPoints(100)).toBe("100");
    expect(fmtPoints(66.66666666666667)).toBe("66.7");
    expect(fmtPoints(33.333333333333336)).toBe("33.3");
    expect(fmtPoints(49.95)).toBe("50");
    expect(fmtPoints(0)).toBe("0");
    expect(fmtPoints(Number.NaN)).toBe("0");
  });

  it("places follow the server's order and tie-breaks: total, day wins, median; a full tie is shared", () => {
    const rows = [
      { playerId: "a", total: 250, countedDailyWins: 2, countedMedian: 80 },
      { playerId: "b", total: 250, countedDailyWins: 2, countedMedian: 80 }, // full tie with a
      { playerId: "c", total: 250, countedDailyWins: 1, countedMedian: 90 }, // fewer day wins: below, not shared
      { playerId: "d", total: 200, countedDailyWins: 3, countedMedian: 70 },
      { playerId: "e", total: 200, countedDailyWins: 3, countedMedian: 60 }, // lower median: below
    ];
    // The rows are in the server's order (rankStandings is the server's sort).
    expect(rankStandings(rows).map((r) => r.playerId)).toEqual(["a", "b", "c", "d", "e"]);
    expect(sharedPlaces(rows)).toEqual({ a: 1, b: 1, c: 3, d: 4, e: 5 });
    expect(sharedPlaces([])).toEqual({});
  });
});
