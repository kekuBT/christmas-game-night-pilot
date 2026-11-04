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

// `base` in ceremony standings is the championship TOTAL (best-three sum +
// participation + finale), because the ceremony winner is ranked by total.
export function dayCeremony(
  day: number,
  standings: { playerId: string; displayName: string; base: number }[],
): { day: number; winner: string | null; standings: typeof standings } {
  const winner = standings.length > 0 ? (standings[0]!.displayName ?? standings[0]!.playerId) : null;
  return { day, winner, standings };
}
