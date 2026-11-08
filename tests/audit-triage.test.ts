/**
 * Live audit triage (2026-11-08), pure parts. The rendered behaviour of every
 * confirmed audit defect is covered by scripts/check-audit-fixes.mjs.
 *
 * A-03: phone standings showed "top N plus you" by row count, so a three-way
 * tie for first lost a tied-first player on the other players' phones. The
 * server's scores and shared ranks were always right; only the display cut.
 */
import { describe, expect, it } from "vitest";
import { rankStandings, standingsRows } from "../apps/web/src/ui/mchezo/lib/standings.js";

const players = [
  { id: "p1", name: "Player 1" },
  { id: "g", name: "Audit Guest" },
  { id: "t", name: "Audit Third" },
  { id: "d", name: "Dee" },
  { id: "e", name: "Eli" },
];
const ids = (rows: { playerId: string }[]) => rows.map((r) => r.playerId);

describe("A-03: phone standings never cut through a shared rank", () => {
  const tie3 = rankStandings([{ playerId: "p1", score: 1200 }, { playerId: "g", score: 1200 }, { playerId: "t", score: 1200 }], players);

  it("a three-way tie for first shows all three on EVERY phone (limit 2)", () => {
    for (const viewer of ["p1", "g", "t"]) {
      expect(ids(standingsRows(tie3, viewer, 2)).sort(), `viewer ${viewer}`).toEqual(["g", "p1", "t"]);
    }
  });

  it("ranks and scores are exactly the server's: nothing recomputed", () => {
    expect(standingsRows(tie3, "g", 2).map((r) => [r.playerId, r.rank, r.score])).toEqual([["g", 1, 1200], ["t", 1, 1200], ["p1", 1, 1200]]);
  });

  it("a tie at the cut-off rank keeps everyone on that rank, then adds you below if you're further down", () => {
    const r = rankStandings([{ playerId: "p1", score: 900 }, { playerId: "g", score: 500 }, { playerId: "t", score: 500 }, { playerId: "d", score: 100 }, { playerId: "e", score: 0 }], players);
    expect(ids(standingsRows(r, "e", 2))).toEqual(["p1", "g", "t", "e"]);
    expect(ids(standingsRows(r, "g", 2))).toEqual(["p1", "g", "t"]);
  });

  it("without ties it is still top N plus you, with no duplicates", () => {
    const r = rankStandings([{ playerId: "p1", score: 900 }, { playerId: "g", score: 700 }, { playerId: "t", score: 500 }, { playerId: "d", score: 100 }], players);
    expect(ids(standingsRows(r, "d", 2))).toEqual(["p1", "g", "d"]);
    expect(ids(standingsRows(r, "p1", 2))).toEqual(["p1", "g"]);
    expect(ids(standingsRows(r, "nobody", 2))).toEqual(["p1", "g"]);
  });

  it("fewer players than the limit: everyone, once", () => {
    const r = rankStandings([{ playerId: "p1", score: 10 }], players);
    expect(ids(standingsRows(r, "p1", 2))).toEqual(["p1"]);
  });
});
