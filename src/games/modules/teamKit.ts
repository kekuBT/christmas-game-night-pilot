/**
 * Stage 12.10 (docs/stage12/stage1210.md §1; D-S1210-01): the team kit, shared by the games built for teams of Stages
 * 12.10–12.14 (Split Clues, Team Draw, Territory, Tug of War, Know Your Rivals). Pure helpers only.
 *
 *  - Teams in a game: who is on which, in the teams' own order.
 *  - Catch-up: a team alone in last place and far enough behind gets a small bonus on its next success.
 *  - Free-text answers: one forgiving matcher (case, accents, punctuation, a leading article, a plural, one typo in a
 *    long answer).
 *  - No repeats in a night: deal what this room hasn't played yet first, then what it played longest ago.
 */
import type { GameTeams } from "../../shared/teams.js";
import { normalizeGuess } from "./draw.js";
import { seededShuffle } from "./types.js";

/** Catch-up (D-S1210-01): how far behind the leader a team must be, alone in last place, to earn the bonus. */
export const TEAM_CATCH_UP_GAP = 100;

/** The game's teams that have players in it, in the teams' own order. */
export function teamIdsInGame(teams: GameTeams, players: readonly string[]): string[] {
  return teams.list.map((t) => t.id).filter((id) => players.some((p) => teams.members[p] === id));
}

/** A team's players in this game, in roster order. */
export function teamMembers(teams: GameTeams, players: readonly string[], teamId: string): string[] {
  return players.filter((p) => teams.members[p] === teamId);
}

/**
 * The team that earns the catch-up bonus now, if any: the one team alone in last place, at least `gap` behind the
 * leader. Ties for last, or a close game, earn nothing.
 */
export function catchUpTeam(totals: Readonly<Record<string, number>>, gap = TEAM_CATCH_UP_GAP): string | null {
  const entries = Object.entries(totals);
  if (entries.length < 2) return null;
  const low = Math.min(...entries.map(([, v]) => v));
  const high = Math.max(...entries.map(([, v]) => v));
  const last = entries.filter(([, v]) => v === low);
  return last.length === 1 && high - low >= gap ? last[0]![0] : null;
}

/** Edit distance between two short strings (insert, delete, substitute; a swap of neighbours counts as one). */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[m]![n]!;
}

/** A free-text answer's length from which one typo is forgiven. */
export const TYPO_FROM_LENGTH = 7;

/** Forms of a normalised answer: itself and its singular ("candles" -> candle; "boxes" -> box). */
function forms(t: string): string[] {
  const out = [t];
  if (t.length > 3 && t.endsWith("s")) out.push(t.slice(0, -1));
  if (t.length > 4 && t.endsWith("es")) out.push(t.slice(0, -2));
  return out;
}

/**
 * Does a typed answer match any accepted form? Case, accents, punctuation, spaces, a leading "a/an/the" and a plural
 * don't matter; one typo is forgiven when the accepted answer has at least TYPO_FROM_LENGTH letters.
 */
export function answerMatches(accepted: readonly string[], text: string): boolean {
  const g = normalizeGuess(text);
  if (!g) return false;
  const mine = forms(g);
  return accepted.some((a) => {
    const want = normalizeGuess(a);
    if (!want) return false;
    if (forms(want).some((f) => mine.includes(f))) return true;
    return want.length >= TYPO_FROM_LENGTH && mine.some((f) => editDistance(f, want) <= 1);
  });
}

/**
 * No repeats in a night (D-S1210-01): `avoid` lists the ids this room has played, oldest first. Items not in it come
 * first (shuffled), then the played ones in the order they were played, so the longest-ago come back first.
 */
export function dealAvoiding<T extends { id: string }>(items: readonly T[], rng: () => number, avoid: readonly string[] = []): T[] {
  const lastUse = new Map<string, number>();
  avoid.forEach((id, i) => lastUse.set(id, i));
  const fresh = seededShuffle(items.filter((x) => !lastUse.has(x.id)), rng);
  const played = items.filter((x) => lastUse.has(x.id)).sort((a, b) => lastUse.get(a.id)! - lastUse.get(b.id)!);
  return [...fresh, ...played];
}
