// Pure standings rules (Phase 2.1 §4): shared ranks, middle ties, all tied,
// and rank movement — the same functions the phone results and the TV
// leaderboard render. Server totals stay authoritative; these tests pin the
// display math only.
import { describe, expect, it } from "vitest";
import { rankMovement, rankStandings } from "../apps/web/src/ui/mchezo/lib/standings.js";

const players = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bea" },
  { id: "c", name: "Cal" },
  { id: "d", name: "Dee" },
];

describe("standings", () => {
  it("middle ties share a rank and the next rank skips (1,2,2,4)", () => {
    const ranked = rankStandings(
      [
        { playerId: "a", score: 100 },
        { playerId: "b", score: 80 },
        { playerId: "c", score: 80 },
        { playerId: "d", score: 50 },
      ],
      players,
    );
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
  });

  it("all tied players share rank 1, ordered by name", () => {
    const ranked = rankStandings(
      [
        { playerId: "d", score: 60 },
        { playerId: "b", score: 60 },
        { playerId: "a", score: 60 },
      ],
      players,
    );
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([["a", 1], ["b", 1], ["d", 1]]);
  });

  it("two tied for first share rank 1 and third place is rank 3", () => {
    const ranked = rankStandings(
      [
        { playerId: "a", score: 90 },
        { playerId: "b", score: 90 },
        { playerId: "c", score: 40 },
      ],
      players,
    );
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
  });

  it("rank movement is positive for climbs, negative for drops, zero for holds", () => {
    const before = rankStandings(
      [
        { playerId: "a", score: 100 },
        { playerId: "b", score: 80 },
        { playerId: "c", score: 60 },
      ],
      players,
    );
    const after = rankStandings(
      [
        { playerId: "a", score: 80 },
        { playerId: "b", score: 100 },
        { playerId: "c", score: 60 },
      ],
      players,
    );
    const move = rankMovement(before, after);
    expect(move.get("a")).toBe(-1);
    expect(move.get("b")).toBe(1);
    expect(move.get("c")).toBe(0);
  });
});
