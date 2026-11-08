import type { Player, RankedEntry, ScoreEntry } from '../types.js';

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
    const prev = rows[i - 1];
    r.rank = i > 0 && prev && prev.score === r.score ? prev.rank : i + 1;
  });
  return rows;
}

/**
 * The rows a phone shows: the top `limit` places plus your own row if you
 * are further down. Display only: ranks and scores are the server's.
 *
 * A-03 (live audit): the cut never splits a shared rank. Cutting by row
 * count dropped a tied-first player from the other players' phones in a
 * three-way tie; every player on the cut-off rank is now shown.
 */
export function standingsRows(ranked: readonly RankedEntry[], youId: string, limit: number): RankedEntry[] {
  const cutoff = ranked[limit - 1]?.rank;
  const top = cutoff === undefined ? [...ranked] : ranked.filter((r) => r.rank <= cutoff);
  const me = ranked.find((r) => r.playerId === youId);
  return me && !top.includes(me) ? [...top, me] : top;
}

/** Up to this many players, the results standings always list everyone. */
export const FULL_STANDINGS_MAX = 4;

/**
 * S3-RES-01: the standings a results screen shows. A small field is always
 * listed in full. A larger one starts as a preview (the top `limit` places,
 * never splitting a shared rank, plus your own row) that expands to every
 * player, so nobody, including a player who sat out or scored 0, is only
 * visible on their own phone. Display only: ranks and scores are the server's.
 */
export function standingsView(ranked: readonly RankedEntry[], youId: string, limit: number, expanded: boolean): { rows: RankedEntry[]; hidden: number; collapsible: boolean } {
  const preview = standingsRows(ranked, youId, limit);
  const collapsible = ranked.length > FULL_STANDINGS_MAX && preview.length < ranked.length;
  const rows = collapsible && !expanded ? preview : [...ranked];
  return { rows, hidden: ranked.length - rows.length, collapsible };
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

/**
 * Scores of the most recent finished game of the same type played BEFORE
 * the given game, for honest rank/score movement ("vs the previous Trivia
 * game"). Returns undefined when there is no such game — callers must
 * then show no movement at all, never an invented baseline.
 * Same-type only: a Trivia score and a Math score are not comparable, so
 * a cross-type "gain" would be meaningless even though ranks are ordinal.
 */
export function previousGameScores(
  games: readonly { id: string; gameId: string; status: string; rawScores?: Record<string, number> }[],
  currentId: string,
): Record<string, number> | undefined {
  const idx = games.findIndex((g) => g.id === currentId);
  if (idx < 0) return undefined;
  const current = games[idx]!;
  for (let i = idx - 1; i >= 0; i--) {
    const g = games[i]!;
    if (g.gameId === current.gameId && g.status === "finished" && g.rawScores) return g.rawScores;
  }
  return undefined;
}
