/**
 * Stage 5.1 (O-05): how the Family Cup screen shows numbers and places.
 * Display only: points, eligibility and order all come from the server
 * (src/scoring/ledger.ts, src/scoring/championship.ts) and are unchanged.
 *
 * - Points: a day score is an average of placements, so it can be a long
 *   decimal (66.66666666666667). Shown with at most one decimal (66.7);
 *   whole numbers stay whole.
 * - Places: the server orders by total, then counted day wins, then the
 *   median counted day score, then the finale placement. Players equal on
 *   every one of those are a joint placement (rankStandings returns 0), so
 *   they share a place here: 1, 1, 3.
 */
export function fmtPoints(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export interface RankKey { playerId: string; total: number; countedDailyWins: number; countedMedian?: number; finalePlacement?: number }

/** Competition places (1, 1, 3) for rows already in the server's order, sharing a place only on a full tie. */
export function sharedPlaces(rows: readonly RankKey[]): Record<string, number> {
  const out: Record<string, number> = {};
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied = prev !== undefined
      && prev.total === r.total
      && prev.countedDailyWins === r.countedDailyWins
      && (prev.countedMedian ?? 0) === (r.countedMedian ?? 0)
      && !(prev.finalePlacement !== undefined && r.finalePlacement !== undefined && prev.finalePlacement !== r.finalePlacement);
    out[r.playerId] = tied ? out[prev!.playerId]! : i + 1;
  });
  return out;
}
