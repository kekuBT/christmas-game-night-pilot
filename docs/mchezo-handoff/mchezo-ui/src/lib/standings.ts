import type { Player, RankedEntry, ScoreEntry } from '../types';

/**
 * Order scores for display. Pure and deterministic:
 *  - higher score first
 *  - ties share a rank (competition ranking: 1, 2, 2, 4)
 *  - tie order falls back to name, then id, so the list never flickers.
 * This does not compute points — scores come from the host app.
 */
export function rankStandings(scores: readonly ScoreEntry[], players: readonly Player[]): RankedEntry[] {
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const rows = scores
    .filter((s) => byId.has(s.playerId))
    .map((s) => ({ ...s, player: byId.get(s.playerId)!, rank: 0 }));
  rows.sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

/** Previous totals derived from current totals minus the round delta (display helper). */
export function previousScores(scores: readonly ScoreEntry[]): ScoreEntry[] {
  return scores.map((s) => ({ playerId: s.playerId, score: s.score - (s.delta ?? 0) }));
}

/** Rank movement per player between two rankings (positive = moved up). */
export function rankMovement(before: readonly RankedEntry[], after: readonly RankedEntry[]): Map<string, number> {
  const b = new Map(before.map((r) => [r.playerId, r.rank] as const));
  return new Map(after.map((r) => [r.playerId, (b.get(r.playerId) ?? r.rank) - r.rank] as const));
}

export function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return n + 'th';
  return n + (n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
}

export const formatScore = (n: number) => n.toLocaleString('en-US');
