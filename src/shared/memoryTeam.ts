/**
 * Stage 10.3 (docs/stage10/stage103.md §2; D-S103-01, D-S103-05): a team
 * game's result as the Memory Book keeps it, and the one wording every
 * surface uses (the entry card, the Markdown export, the PDF, the share
 * image).
 *
 * The record is derived and frozen by the server from the cited game's
 * finalized `outcome.team` (src/server/memorybook.ts `teamFactsFor`); the
 * request never supplies it. It names no player and holds no winner, place,
 * per-player score or Cup point: a team game has one shared result.
 *
 * Types and pure functions only: the web imports this file.
 */

/** The endings a saved team result can have (D-S103-03): the module's own, never the room's time limit. */
export type MemoryTeamEnd = "completed" | "too-few-players";

export interface MemoryTeamFacts {
  /** Which team game (one today; D-S103-02). */
  kind: "spectrum";
  /** The cited game and its exact `game-finished` event. */
  gameInstanceId: string;
  finishedEventId: string;
  /** The team's total and the most it could have scored. */
  total: number;
  max: number;
  /** Rounds actually revealed, and rounds the match was set to play. */
  roundsRevealed: number;
  roundsPlanned: number;
  end: MemoryTeamEnd;
}

/** Why an early ending happened, in the same words as the results screen. */
const EARLY_WHY: Record<Exclude<MemoryTeamEnd, "completed">, string> = {
  "too-few-players": "fewer than two players were left",
};

const rounds = (n: number) => `${n} ${n === 1 ? "round" : "rounds"}`;

/**
 * The team result in one line: "Spectrum team result: 27 out of 40 · all 4
 * rounds played", or for an early ending "Spectrum team result: 9 out of 40 ·
 * ended early, 1 of 4 rounds played (fewer than two players were left)". An
 * early result always says it ended early and never claims completion.
 */
export function memoryTeamLine(t: MemoryTeamFacts, title = "Spectrum"): string {
  const head = `${title} team result: ${t.total} out of ${t.max}`;
  if (t.end === "completed") return `${head} · all ${rounds(t.roundsPlanned)} played`;
  return `${head} · ended early, ${t.roundsRevealed} of ${rounds(t.roundsPlanned)} played (${EARLY_WHY[t.end]})`;
}
