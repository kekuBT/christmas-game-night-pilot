import { describe, expect, it } from "vitest";
import { simulate, suitable } from "../scripts/content-quality/sprint-sim.js";

describe("Category Sprint set-size simulation (E2 v3)", () => {
  it("is deterministic for a fixed seed", () => {
    const a = simulate({ setSize: 20, players: 6, skew: 1, depth: 0.25, rounds: 300, seed: 7 });
    const b = simulate({ setSize: 20, players: 6, skew: 1, depth: 0.25, rounds: 300, seed: 7 });
    expect(a).toEqual(b);
  });

  it("matches the closed form for even recall: P(unique) = (1 - 5/N)^(P-1)", () => {
    for (const [n, p] of [[12, 4], [20, 6], [40, 10]] as const) {
      const r = simulate({ setSize: n, players: p, skew: 0, depth: 0, maxKnown: 1, rounds: 4000 });
      expect(r.shortRate).toBe(0);
      expect(r.uniqueRate).toBeCloseTo(Math.pow(1 - 5 / n, p - 1), 1);
    }
  });

  it("uniqueness falls as players rise and climbs as the set grows", () => {
    const u = (n: number, p: number) => simulate({ setSize: n, players: p, skew: 1, depth: 0.25, rounds: 1500 }).uniqueRate;
    expect(u(20, 4)).toBeGreaterThan(u(20, 8));
    expect(u(40, 8)).toBeGreaterThan(u(20, 8));
  });

  it("a 12-member set is not suitable for 4 players (owner's concern), even with even recall", () => {
    expect(suitable(simulate({ setSize: 12, players: 4, skew: 0, depth: 0, maxKnown: 1, rounds: 3000 }))).toBe(false);
    expect(suitable(simulate({ setSize: 12, players: 4, skew: 1.6, depth: 0.25, rounds: 3000 }))).toBe(false);
  });

  it("the proposed rule of thumb (N >= 4 x players, at least 15) is suitable for famous-first recall at 4-10 players", () => {
    for (let p = 4; p <= 10; p++) {
      const n = Math.max(15, 4 * p);
      expect(suitable(simulate({ setSize: n, players: p, skew: 1, depth: 0.25, rounds: 3000 })), `${n} members, ${p} players`).toBe(true);
    }
  });
});
