/**
 * Family Cup championship scoring — OWNER-APPROVED 2026-11-04.
 * This replaces the earlier provisional best-five / 5*mean formula.
 *
 * Approved structure (Keku, 2026-11-04):
 * - Seven scheduled championship days.
 * - Minimum three qualifying days to become championship-eligible.
 * - Main championship score = sum of the player's best three daily scores.
 * - Daily score = 75% individual (solo) + 25% team performance.
 * - Individual games use normalized placement scores 0–100, averaged ranks
 *   for ties (midrankScore).
 * - Participation bonus: +5 for each qualifying day beyond the first
 *   three, capped at +20 (so 3 days = 0, 4 = +5, 5 = +10, 6 = +15, 7 = +20).
 * - Grand Finale can award up to 50 additional points.
 * - Practice games never contribute to scores or attendance.
 * - Missing days get no negative points and do not reduce the best-three
 *   total: the best three are taken from the days actually attended.
 *
 * Formula: Championship Total = Sum(Best 3 Daily Scores)
 *          + Participation Bonus + Finale Bonus.
 *
 * Still configurable (not yet approved in detail, per Keku 2026-11-04):
 * the precise qualifying-day threshold, the handling of days without team
 * games, and the Grand Finale placement ladder. They live in
 * CHAMPIONSHIP_CONFIG below — change them there, not scattered through
 * callers. The finale is also disabled by default in the engine until a
 * finale is actually run; enabling it is an explicit option, not a default.
 */
export const CHAMPIONSHIP_CONFIG = {
  scheduledDays: 7,
  minQualifyingDays: 3,
  bestDays: 3,
  participationPerExtraDay: 5,
  participationCap: 20,
  soloWeight: 0.75,
  teamWeight: 0.25,
  /** "available-only": a day with only solo (or only team) games uses that
   *  category's mean at 100% and is flagged offBalance. "scaled": it uses
   *  only its category's weight (e.g. solo-only = 75% of the solo mean).
   *  The choice is configurable because it is not yet owner-approved. */
  singleCategoryMode: "available-only" as "available-only" | "scaled",
  finaleLadder: { 1: 50, 2: 35, 3: 25, 4: 15, other: 5 } as Record<number, number> & { other: number },
  finaleEnabled: false,
};

export type ChampionshipConfig = typeof CHAMPIONSHIP_CONFIG;

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
 * - Both categories present: soloWeight*soloAvg + teamWeight*teamAvg.
 * - Only one category scheduled: see singleCategoryMode in the config
 *   (default "available-only": that category's mean at 100%, offBalance=true).
 * - A scheduled category the player skipped entirely is passed as [0] by the
 *   caller only if the caller explicitly marks it skipped; otherwise omit
 *   it to mean "not scheduled".
 */
export function dayScore(
  components: DayComponents,
  config: ChampionshipConfig = CHAMPIONSHIP_CONFIG,
): { score: number; offBalance: boolean } {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const hasSolo = components.soloScores.length > 0;
  const hasTeam = components.teamScores.length > 0;
  if (!hasSolo && !hasTeam) return { score: 0, offBalance: true };
  if (hasSolo && hasTeam) {
    return { score: config.soloWeight * mean(components.soloScores) + config.teamWeight * mean(components.teamScores), offBalance: false };
  }
  if (config.singleCategoryMode === "scaled") {
    return { score: (hasSolo ? config.soloWeight : config.teamWeight) * mean(hasSolo ? components.soloScores : components.teamScores), offBalance: true };
  }
  return { score: hasSolo ? mean(components.soloScores) : mean(components.teamScores), offBalance: true };
}

export interface ChampionshipTotal {
  eligible: boolean;
  qualifyingDays: number;
  counted: number[]; // best daily scores, descending
  base: number; // sum of the best daily scores (the main championship score)
  participationBonus: number;
  finaleBonus: number;
  total: number; // base + participationBonus + finaleBonus
}

/** Participation bonus: +5 per qualifying day beyond the first three, capped at +20. */
export function participationBonus(
  qualifyingDays: number,
  config: ChampionshipConfig = CHAMPIONSHIP_CONFIG,
): number {
  if (qualifyingDays < config.minQualifyingDays) return 0;
  return Math.min(config.participationCap, config.participationPerExtraDay * Math.max(0, qualifyingDays - config.minQualifyingDays));
}

/**
 * Approved Family Cup total for one player.
 * Missing days contribute nothing and do not reduce the best-three sum:
 * `counted` is simply the best days actually attended (fewer than three if
 * the player attended fewer, in which case they are ineligible but still
 * get a provisional total from the days they did attend).
 */
export function championshipTotal(
  dayScores: number[],
  opts: { finalePlacement?: number; finaleEnabled?: boolean; config?: ChampionshipConfig } = {},
): ChampionshipTotal {
  const config = opts.config ?? CHAMPIONSHIP_CONFIG;
  const counted = [...dayScores].sort((a, b) => b - a).slice(0, config.bestDays);
  const base = counted.reduce((s, x) => s + x, 0);
  const qualifyingDays = dayScores.length;
  const eligible = qualifyingDays >= config.minQualifyingDays;
  const participation = participationBonus(qualifyingDays, config);
  const finaleEnabled = opts.finaleEnabled ?? config.finaleEnabled;
  const finale = finaleEnabled && eligible && opts.finalePlacement !== undefined
    ? finalePoints(opts.finalePlacement, true, config)
    : 0;
  return {
    eligible,
    qualifyingDays,
    counted,
    base,
    participationBonus: participation,
    finaleBonus: finale,
    total: base + participation + finale,
  };
}

/** Finale ladder, disabled by default. Placement is 1-based. */
export function finalePoints(
  placement: number,
  enabled = false,
  config: ChampionshipConfig = CHAMPIONSHIP_CONFIG,
): number {
  if (!enabled) return 0;
  const ladder = config.finaleLadder;
  return ladder[placement] ?? ladder.other;
}

export interface StandingInput {
  playerId: string;
  total: number;
  countedDailyWins: number; // Count of first-place daily finishes
  countedMedian: number;
  finalePlacement?: number;
}

/** Tie-break: total, then daily wins, then counted median, then finale placement, then joint. */
export function rankStandings(players: StandingInput[]): StandingInput[] {
  return [...players].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
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
