import { championshipTotal, dayScore, median, midrankScore, rankStandings, type ChampionshipConfig } from "./championship.js";

/**
 * Championship ledger integration — Family Cup rules, owner-approved 2026-11-04.
 * Input: per-player per-day normalised game scores, split solo/team.
 * Output: day scores, best-three sum, participation and finale bonuses,
 * championship total, eligibility, and ranked standings.
 * Practice games must never reach this module: the engine filters them
 * before building PlayerDay entries.
 */
export interface PlayerDay {
  playerId: string;
  day: number; // 1..7
  soloScores: number[];
  teamScores: number[];
}

export interface ChampionshipResult {
  playerId: string;
  dayScores: number[];
  counted: number[]; // best three daily scores, descending
  qualifyingDays: number;
  base: number; // sum of the best three daily scores
  participationBonus: number;
  finaleBonus: number;
  total: number; // base + participationBonus + finaleBonus
  eligible: boolean;
  countedDailyWins: number;
  countedMedian: number;
}

export function computeChampionship(
  days: PlayerDay[],
  opts: { finalePlacements?: Record<string, number>; finaleEnabled?: boolean; config?: ChampionshipConfig } = {},
): ChampionshipResult[] {
  // Aggregate by (player, day) first, so duplicate entries for one day merge
  // instead of counting as two qualifying days.
  const merged = new Map<string, PlayerDay>();
  for (const d of days) {
    const key = `${d.playerId}:${d.day}`;
    const existing = merged.get(key);
    if (existing) {
      existing.soloScores.push(...d.soloScores);
      existing.teamScores.push(...d.teamScores);
    } else {
      merged.set(key, { playerId: d.playerId, day: d.day, soloScores: [...d.soloScores], teamScores: [...d.teamScores] });
    }
  }
  const byPlayer = new Map<string, PlayerDay[]>();
  for (const d of merged.values()) {
    const arr = byPlayer.get(d.playerId) ?? [];
    arr.push(d);
    byPlayer.set(d.playerId, arr);
  }
  const results: ChampionshipResult[] = [];
  // First compute day scores per player, then daily wins (first place per day).
  const dayScoresByPlayer = new Map<string, { day: number; score: number }[]>();
  for (const [pid, ds] of byPlayer) {
    const list = ds.map((d) => ({ day: d.day, score: dayScore({ soloScores: d.soloScores, teamScores: d.teamScores }, opts.config).score }));
    dayScoresByPlayer.set(pid, list);
  }
  // Daily wins: for each day slot, find max day score.
  const wins = new Map<string, number>();
  const daysSet = new Set([...merged.values()].map((d) => d.day));
  for (const day of daysSet) {
    let best = -1;
    let winners: string[] = [];
    for (const [pid, list] of dayScoresByPlayer) {
      const entry = list.find((x) => x.day === day);
      if (!entry) continue;
      if (entry.score > best) {
        best = entry.score;
        winners = [pid];
      } else if (entry.score === best) {
        winners.push(pid);
      }
    }
    for (const w of winners) wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  for (const [pid, list] of dayScoresByPlayer) {
    const dayScores = list.map((x) => x.score);
    const t = championshipTotal(dayScores, {
      finalePlacement: opts.finalePlacements?.[pid],
      finaleEnabled: opts.finaleEnabled,
      config: opts.config,
    });
    results.push({
      playerId: pid,
      dayScores,
      counted: t.counted,
      qualifyingDays: t.qualifyingDays,
      base: t.base,
      participationBonus: t.participationBonus,
      finaleBonus: t.finaleBonus,
      total: t.total,
      eligible: t.eligible,
      countedDailyWins: wins.get(pid) ?? 0,
      countedMedian: median(t.counted),
    });
  }
  const ranked = rankStandings(results.map((r) => ({ playerId: r.playerId, total: r.total, countedDailyWins: r.countedDailyWins, countedMedian: r.countedMedian })));
  const order = new Map(ranked.map((r, i) => [r.playerId, i]));
  // Eligible players rank first; ineligible players are provisional/unranked at the end, regardless of total.
  return results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0);
  });
}

export { midrankScore };
