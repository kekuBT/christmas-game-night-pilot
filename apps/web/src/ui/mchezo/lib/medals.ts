/**
 * Stage 12.1 (docs/stage12/stage121.md §3; D-S121-05): the TV's "who's winning tonight" facts, as pure functions
 * over public game results only (the same `rawScores` every screen already shows after a game ends).
 *
 * Display only. Nothing here is a score, a Cup point or a standing: the server's results and championship stay
 * the only authority. A medal is a way of telling the night's story on the TV, nothing more.
 */

/** The public facts a finished game needs for medals. */
export interface MedalGame {
  id: string;
  gameId: string;
  status: string;
  rawScores?: Record<string, number>;
  /** A cooperative game has one team result and never a winner (Stage 9.3). */
  outcome?: { team?: unknown } | null;
}

export type Medal = "gold" | "silver" | "bronze";
export const MEDAL_ICON: Record<Medal, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
export const MEDAL_WORD: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };

export interface PlacedScore { playerId: string; score: number; rank: number; medal: Medal | null }

/**
 * One game's places, best first, with shared competition ranks (10, 10, 5 → 1, 1, 3) and the medal each place
 * earns:
 * - rank 1 is gold, rank 2 silver, rank 3 bronze; ties share the place and the medal, and the next place is
 *   skipped, as in any medal table (two golds, then a bronze);
 * - a medal needs a score above zero, so nobody wins one for not scoring;
 * - a game with fewer than two scored players, or where every player tied, awards none.
 * Order within a shared place is by player id (stable); the caller names players.
 */
export function placesOf(rawScores: Record<string, number> | undefined): PlacedScore[] {
  const rows = Object.entries(rawScores ?? {})
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([playerId, score]) => ({ playerId, score, rank: 0, medal: null as Medal | null }));
  rows.sort((a, b) => b.score - a.score || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1]!.score === r.score ? rows[i - 1]!.rank : i + 1; });
  const allTied = rows.length > 0 && rows.every((r) => r.score === rows[0]!.score);
  if (rows.length >= 2 && !allTied) {
    for (const r of rows) r.medal = r.score <= 0 ? null : r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : r.rank === 3 ? "bronze" : null;
  }
  return rows;
}

/** Whether a finished game awards medals at all (competitive, two or more scored players, not all tied). */
export function awardsMedals(g: MedalGame): boolean {
  if (g.status !== "finished" || g.outcome?.team) return false;
  return placesOf(g.rawScores).some((p) => p.medal !== null);
}

export interface MedalRow { playerId: string; gold: number; silver: number; bronze: number }
export interface MedalTable { rows: MedalRow[]; games: number }

/**
 * The night's medal table: every finished competitive game that awards medals (see `placesOf`), optionally only
 * those `include` accepts (a Cup room's casual games). Players with no medal are left out. Ordered by golds, then
 * silvers, then bronzes, then the given name order, then id, so the same results always give the same table.
 */
export function medalTable(games: readonly MedalGame[], nameOf: (playerId: string) => string, include: (g: MedalGame) => boolean = () => true): MedalTable {
  const byPlayer = new Map<string, MedalRow>();
  let counted = 0;
  for (const g of games) {
    if (!include(g) || !awardsMedals(g)) continue;
    counted += 1;
    for (const p of placesOf(g.rawScores)) {
      if (!p.medal) continue;
      const row = byPlayer.get(p.playerId) ?? { playerId: p.playerId, gold: 0, silver: 0, bronze: 0 };
      row[p.medal] += 1;
      byPlayer.set(p.playerId, row);
    }
  }
  const rows = [...byPlayer.values()].sort((a, b) =>
    b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
    || nameOf(a.playerId).localeCompare(nameOf(b.playerId)) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  return { rows, games: counted };
}

export interface PodiumStep { place: 1 | 2 | 3; medal: Medal; players: { playerId: string; score: number }[] }

/**
 * The podium for one game: the gold, silver and bronze steps in that order, each with everyone who shares it.
 * A step nobody earned (after a tie for first there's no silver) is empty, so the podium never invents a place.
 * Null when the game awards no medals (cooperative, too few players, all tied, nobody scored).
 */
export function podiumOf(g: MedalGame): PodiumStep[] | null {
  if (!awardsMedals(g)) return null;
  const places = placesOf(g.rawScores);
  const step = (place: 1 | 2 | 3, medal: Medal): PodiumStep => ({ place, medal, players: places.filter((p) => p.medal === medal).map(({ playerId, score }) => ({ playerId, score })) });
  return [step(1, "gold"), step(2, "silver"), step(3, "bronze")];
}

/**
 * The Cup's podium from its standings (the director's "Cup standings"): the same three steps, but here a shared
 * first place is a real result (everyone on the same total leads together), so ties are never dropped. Only
 * players with points stand on it; null when nobody has Cup points yet.
 */
export function cupPodium(rows: readonly CupRow[]): PodiumStep[] | null {
  const scored = rows.filter((r) => r.total > 0);
  if (scored.length === 0) return null;
  const step = (place: 1 | 2 | 3, medal: Medal): PodiumStep => ({ place, medal, players: scored.filter((r) => r.rank === place).map((r) => ({ playerId: r.playerId, score: r.total })) });
  return [step(1, "gold"), step(2, "silver"), step(3, "bronze")];
}

export interface CupRow { playerId: string; total: number; rank: number; eligible: boolean; move: number | null }

/**
 * The Cup standings as the TV shows them: the server's totals, best first, with shared ranks on equal totals, and
 * each player's movement against an earlier snapshot of the same Cup (positive = moved up). With no snapshot, or
 * for a player the snapshot didn't have, `move` is null: no arrow rather than a guessed one.
 */
export function cupRows(standings: readonly { playerId: string; total: number; eligible: boolean }[], before?: readonly { playerId: string; total: number; eligible: boolean }[]): CupRow[] {
  const rank = (list: readonly { playerId: string; total: number; eligible: boolean }[]) => {
    const rows = list.map((r, i) => ({ playerId: r.playerId, total: r.total, eligible: r.eligible, i, rank: 0 }));
    rows.sort((a, b) => b.total - a.total || a.i - b.i);
    rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1]!.total === r.total ? rows[i - 1]!.rank : i + 1; });
    return rows;
  };
  const prev = before ? new Map(rank(before).map((r) => [r.playerId, r.rank] as const)) : null;
  return rank(standings).map((r) => {
    const was = prev?.get(r.playerId);
    return { playerId: r.playerId, total: r.total, rank: r.rank, eligible: r.eligible, move: was === undefined ? null : was - r.rank };
  });
}

/**
 * The day's leader line from the server's own end-of-day ceremony (the current day only): never invented, and
 * never called a champion. The last day says "leading on the final day", because the server has no end-of-Cup
 * state to crown anyone.
 */
export function dayLeaderLine(ceremony: { day: number; winners?: string[]; winner: string | null } | undefined, finalDay = 7): string | null {
  if (!ceremony) return null;
  const names = ceremony.winners && ceremony.winners.length > 0 ? ceremony.winners : ceremony.winner ? [ceremony.winner] : [];
  if (names.length === 0) return null;
  const who = names.length === 1 ? names[0]! : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const verb = names.length === 1 ? "is" : "are";
  return ceremony.day >= finalDay ? `${who} ${verb} leading on the final day` : `${who} ${verb} leading Day ${ceremony.day}`;
}
