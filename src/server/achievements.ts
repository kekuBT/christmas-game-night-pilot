import type { LedgerEvent } from "./room.js";

export interface Achievement {
  ruleId: string;
  title: string;
  playerId: string;
  sourceEventIds: string[];
}

/** Simple, auditable achievements from ledger events only. No invented milestones. */
export function evaluateAchievements(ledger: LedgerEvent[], rawScoresByGame: Record<string, Record<string, number>>): Achievement[] {
  const achievements: Achievement[] = [];
  // Perfect score: any player with 1200 in a Math game (10 × 120)
  for (const [gameId, scores] of Object.entries(rawScoresByGame)) {
    for (const [pid, score] of Object.entries(scores)) {
      if (score >= 1200) {
        const events = ledger.filter((e) => e.gameInstanceId === gameId && e.playerId === pid && e.type === "score-awarded");
        achievements.push({ ruleId: "perfect-math", title: "Perfect Math Mayhem", playerId: pid, sourceEventIds: events.map((e) => e.eventId) });
      }
    }
  }
  // First game finished
  const firstFinished = ledger.find((e) => e.type === "game-finished");
  if (firstFinished) {
    achievements.push({ ruleId: "first-game", title: "First Game Finished", playerId: firstFinished.actor ?? "room", sourceEventIds: [firstFinished.eventId] });
  }
  return achievements;
}

// `base` in ceremony standings is the score for THAT day (see
// RoomEngine.ceremony), not the multi-day championship total: the
// end-of-day ceremony crowns the day's winner, not the overall leader
// (review 5769441799). `winners` lists every player tied at the top;
// `winner` is kept for compatibility and is the first of them.
export function dayCeremony(
  day: number,
  standings: { playerId: string; displayName: string; base: number }[],
): { day: number; winner: string | null; winners: string[]; standings: typeof standings } {
  const sorted = [...standings].sort((a, b) => b.base - a.base);
  const top = sorted.length > 0 ? sorted[0]!.base : null;
  const winners = top === null ? [] : sorted.filter((s) => s.base === top).map((s) => s.displayName ?? s.playerId);
  return { day, winner: winners[0] ?? null, winners, standings: sorted };
}
