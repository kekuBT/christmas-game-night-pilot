/**
 * Championship scoring — PROVISIONAL formula for local implementation only.
 * NOT owner-approved for a real family championship.
 * See docs/CHAMPIONSHIP_RULES.md and docs/DECISIONS.md L06.
 */

/** Midrank percentile for one game. Ties share the average occupied rank. */
export function midrankScore(rawPoints: number, allRawPoints: number[]): number {
  const n = allRawPoints.length;
  if (n < 2) return 0; // Invalid for championship; caller must exclude N=1 games.
  const sortedDesc = [...allRawPoints].sort((a, b) => b - a);
  // Average rank (1-based) of all competitors tied with this score.
  const ranks = sortedDesc
    .map((v, i) => ({ v, rank: i + 1 }))
    .filter((r) => r.v === rawPoints)
    .map((r) => r.rank);
  if (ranks.length === 0) throw new Error("rawPoints not in allRawPoints");
  const avgRank = ranks.reduce((s, r) => s + r, 0) / ranks.length;
  return (100 * (n - avgRank)) / (n - 1);
}

export interface DayComponents {
  soloScores: number[];
  teamScores: number[];
}

/**
 * Day score from normalised game scores.
 * - Both categories present: 0.75*soloAvg + 0.25*teamAvg
 * - Only one category scheduled: that category normalised to 100%, with offBalance=true
 * - A scheduled category the player skipped entirely is passed as [0] by the caller
 *   only if the caller explicitly marks it skipped; otherwise omit it to mean "not scheduled".
 */
export function dayScore(components: DayComponents): { score: number; offBalance: boolean } {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const hasSolo = components.soloScores.length > 0;
  const hasTeam = components.teamScores.length > 0;
  if (!hasSolo && !hasTeam) return { score: 0, offBalance: true };
  if (hasSolo && hasTeam) {
    return { score: 0.75 * mean(components.soloScores) + 0.25 * mean(components.teamScores), offBalance: false };
  }
  return { score: hasSolo ? mean(components.soloScores) : mean(components.teamScores), offBalance: true };
}

/** Best up to five valid day scores, minimum three to qualify. Base = 5 * mean(best). */
export function championshipBase(validDayScores: number[]): { eligible: boolean; base: number; counted: number[] } {
  const counted = [...validDayScores].sort((a, b) => b - a).slice(0, 5);
  const eligible = validDayScores.length >= 3;
  const base = counted.length === 0 ? 0 : 5 * (counted.reduce((s, x) => s + x, 0) / counted.length);
  return { eligible, base, counted };
}

/** Finale ladder, disabled by default. Placement is 1-based. */
export function finalePoints(placement: number, enabled = false): number {
  if (!enabled) return 0;
  const ladder: Record<number, number> = { 1: 50, 2: 35, 3: 25, 4: 15 };
  return ladder[placement] ?? 5; // Any other eligible finisher
}

export interface StandingInput {
  playerId: string;
  base: number;
  countedDailyWins: number; // Count of first-place daily finishes among counted days
  countedMedian: number;
  finalePlacement?: number;
}

/** Tie-break: base, then daily wins, then counted median, then finale placement, then joint. */
export function rankStandings(players: StandingInput[]): StandingInput[] {
  return [...players].sort((a, b) => {
    if (b.base !== a.base) return b.base - a.base;
    if (b.countedDailyWins !== a.countedDailyWins) return b.countedDailyWins - a.countedDailyWins;
    if (b.countedMedian !== a.countedMedian) return b.countedMedian - a.countedMedian;
    if (a.finalePlacement !== undefined && b.finalePlacement !== undefined) {
      return a.finalePlacement - b.finalePlacement;
    }
    return 0; // Joint placement
  });
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
