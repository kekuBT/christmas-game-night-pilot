// Stage 12.4 (docs/stage12/stage124.md §1): how a Family Cup finishes. Pure, shared by the server (which decides) and
// the phones (which preview it on the Finish sheet).
/**
 * Stage 12.4 (docs/stage12/stage124.md §1; D-S124-01). PROVISIONAL: these are defaults for trying a finished Cup in
 * local play, not owner-approved Cup rules. The owner's sign-off is needed before an official championship uses them
 * (AGENTS.md: material product choices get provisional, configurable defaults).
 * - The host finishes the Cup on its final day (Day 7), between games.
 * - The champion is the eligible player (enough counted Cup days) with the highest Cup total, above zero. Equal top
 *   totals share the title. Nobody eligible means no champion, said plainly.
 * - Once finished, no new official game starts (its results stand); practice games still do.
 */
export const CUP_FINISH_RULES = { version: "provisional-1", finalDay: 7, ties: "shared" } as const;

/**
 * Stage 12.4: shared competition ranks over totals, best first (10, 10, 5 → 1, 1, 3). Pure.
 */
export function sharedRanks<T extends { total: number }>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  return sorted.map((r) => ({ ...r, rank: 1 + sorted.filter((x) => x.total > r.total).length }));
}

/** Stage 12.4 (D-S124-01, provisional): the champion(s) of finished Cup standings: top eligible total above zero; ties share. */
export function cupChampions(standings: readonly { playerId: string; total: number; eligible: boolean }[]): string[] {
  const eligible = standings.filter((r) => r.eligible && r.total > 0);
  if (eligible.length === 0) return [];
  const top = Math.max(...eligible.map((r) => r.total));
  return eligible.filter((r) => r.total === top).map((r) => r.playerId);
}

