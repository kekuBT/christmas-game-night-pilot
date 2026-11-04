import { championshipBase, dayScore, median, midrankScore, rankStandings } from "./championship.js";

/**
 * Championship ledger integration (PROVISIONAL, not owner-approved).
 * Input: per-player per-day normalised game scores, split solo/team.
 * Output: day scores, championship base, eligibility, and ranked standings.
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
  counted: number[];
  base: number;
  eligible: boolean;
  countedDailyWins: number;
  countedMedian: number;
}

export function computeChampionship(days: PlayerDay[]): ChampionshipResult[] {
  const byPlayer = new Map<string, PlayerDay[]>();
  for (const d of days) {
    const arr = byPlayer.get(d.playerId) ?? [];
    arr.push(d);
    byPlayer.set(d.playerId, arr);
  }
  const results: ChampionshipResult[] = [];
  // First compute day scores per player, then daily wins (first place per day among counted? simplified: per day, highest day score wins that day)
  const dayScoresByPlayer = new Map<string, { day: number; score: number }[]>();
  for (const [pid, ds] of byPlayer) {
    const list = ds.map((d) => ({ day: d.day, score: dayScore({ soloScores: d.soloScores, teamScores: d.teamScores }).score }));
    dayScoresByPlayer.set(pid, list);
  }
  // Daily wins: for each day slot, find max day score
  const wins = new Map<string, number>();
  const daysSet = new Set(days.map((d) => d.day));
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
    const { eligible, base, counted } = championshipBase(dayScores);
    results.push({
      playerId: pid,
      dayScores,
      counted,
      base,
      eligible,
      countedDailyWins: wins.get(pid) ?? 0,
      countedMedian: median(counted),
    });
  }
  const ranked = rankStandings(results.map((r) => ({ playerId: r.playerId, base: r.base, countedDailyWins: r.countedDailyWins, countedMedian: r.countedMedian })));
  const order = new Map(ranked.map((r, i) => [r.playerId, i]));
  // Eligible players rank first; ineligible players are provisional/unranked at the end, regardless of base.
  return results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0);
  });
}

export { midrankScore };
