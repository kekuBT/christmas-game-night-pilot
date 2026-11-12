/**
 * Stage 9.3: the cooperative result (docs/stage9/stage93.md §3).
 *
 * A cooperative game (registry `cooperative: true`) has ONE shared team
 * result, recorded by the room at `finalize` as `outcome.team`, persisted
 * with the room and projected to every audience. It is authoritative: the
 * per-player copies a cooperative module's `scores()` returns are a
 * compatibility representation that stays inside the server (never
 * projected, never summed, never logged per player).
 *
 * Only revealed, public facts: the pair's labels, the clue (free text, shown
 * as text), the target, the team's guess, the distance, the points and how
 * many guesses there were. It never names a player and never holds anyone's
 * individual guess. Types only: the web may import this file.
 */
export type TeamRoundReason = "scored" | "no-clue" | "giver-left" | "no-guesses";

export interface TeamRound {
  roundNo: number;
  pair: { left: string; right: string; meaning: string };
  clue: string | null;
  reason: TeamRoundReason;
  target: number;
  /** The team's guess (the median of the guesses received); null with no guesses or no clue. */
  aggregate: number | null;
  distance: number | null;
  points: number;
  /** How many guesses were received (a count, never who or what). */
  guesses: number;
}

export interface TeamResult {
  /** Which cooperative game's result this is (one today). */
  kind: "spectrum";
  total: number;
  max: number;
  /** Rounds the match was set to play (revealed rounds can be fewer after an early ending). */
  roundsPlanned: number;
  rounds: TeamRound[];
  /** The module's own ending; null when the room ended it (its backstop). The room's reason is outcome.reason. */
  end: "completed" | "too-few-players" | null;
}
