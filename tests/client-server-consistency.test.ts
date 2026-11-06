/**
 * The client's display-only midrank (Family Cup breakdown) must agree with
 * the server's scoring rule for every game, including ties and the
 * fewer-than-two-players exclusion. Standings themselves are server-only.
 */
import { describe, expect, it } from "vitest";
import { midrank } from "../apps/web/src/components/midrank.js";
import { midrankScore } from "../src/scoring/championship.js";
import { seededRng } from "../src/shared/rng.js";

describe("client midrank display matches server midrankScore", () => {
  it("agrees on 500 random games (2-10 players, many ties)", () => {
    const rng = seededRng(2026);
    for (let t = 0; t < 500; t++) {
      const n = 2 + Math.floor(rng() * 9);
      const scores: Record<string, number> = {};
      for (let i = 0; i < n; i++) scores[`p${i}`] = Math.floor(rng() * 4) * 100; // coarse values force ties
      const all = Object.values(scores);
      const client = midrank(scores);
      for (const [pid, pts] of Object.entries(scores)) {
        expect(client[pid]).toBeCloseTo(Math.round(midrankScore(pts, all) * 100) / 100, 2);
      }
    }
  });

  it("a single-player game is not counted on either side", () => {
    expect(midrank({ solo: 500 })).toEqual({});
    expect(midrankScore(500, [500])).toBe(0); // and officialStandings skips N<2 games
  });
});
