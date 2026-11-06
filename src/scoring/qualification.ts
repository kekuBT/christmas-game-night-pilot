/**
 * What makes a championship day "qualifying" for a player (Sprint 3, P7).
 *
 * P7: the threshold is NOT approved. This module is the mechanism only.
 * The ACTIVE policy is the existing rule, unchanged: a player qualifies for
 * a day if they were on the roster of at least one of that day's Cup games
 * (the pre-Sprint 3 calculation, proven identical by
 * tests/cup-integrity.test.ts). The alternatives below are implemented and
 * tested but NOT active; switching needs the owner's decision, and must
 * happen before a Cup starts, never during one.
 *
 * Why it matters now: since Sprint 3 a player who starts a game and then
 * does nothing still ends up on its roster with 0 points (P6, P3). Under
 * the active rule that day still counts toward their attendance bonus.
 * See docs/SPRINT_3_QUALIFICATION_OPTIONS.md for the recommendation.
 */

export type QualificationPolicy =
  /** Active (existing) rule: on the roster of at least one Cup game that day. */
  | { kind: "any-official-game" }
  /** Took part (answered/guessed/submitted at least once) in at least `min` Cup games that day. */
  | { kind: "played-games"; min: number }
  /** Took part in at least `share` (0-1) of that day's Cup games, and in at least one. */
  | { kind: "share-of-day"; share: number }
  /**
   * Meaningful scoring participation: in at least `minGames` Cup games that
   * day, the player completed at least `share` of the game's scoring items
   * (answers, guesses, rounds, groups) or played it to its end.
   */
  | { kind: "meaningful-games"; minGames: number; share: number };

export interface DayAttendance {
  /** Cup games that day with this player on the roster. */
  gamesOnRoster: number;
  /** Of those, games in which the player did at least one thing. */
  gamesPlayed: number;
  /**
   * Per Cup game that day: the player's participation record, or null for a
   * game from before Sprint 3 (no record; treated as meaningful, as before).
   */
  participations?: ({ done: number; of: number; finished?: boolean } | null)[];
  /** Cup games played in the room that day. */
  gamesThatDay: number;
}

export const ACTIVE_QUALIFICATION_POLICY: QualificationPolicy = Object.freeze({ kind: "any-official-game" });

/** The options proposed to the owner (not active). */
export const PROPOSED_QUALIFICATION_POLICIES: readonly { id: string; policy: QualificationPolicy; summary: string }[] = Object.freeze([
  { id: "A", policy: { kind: "any-official-game" }, summary: "Current rule: in at least one Cup game that day (even with no answers)." },
  { id: "B", policy: { kind: "played-games", min: 1 }, summary: "Took part in at least one Cup game that day (at least one answer, guess or submission)." },
  { id: "C", policy: { kind: "played-games", min: 2 }, summary: "Took part in at least two Cup games that day." },
  { id: "D", policy: { kind: "share-of-day", share: 0.5 }, summary: "Took part in at least half of that day's Cup games." },
  { id: "E", policy: { kind: "meaningful-games", minGames: 1, share: 0.5 }, summary: "Played at least half of one Cup game that day (e.g. 5 of 10 answers, 2 of 3 rounds, a Connections puzzle to its end)." },
]);

/** The share of a game a player must complete for it to count as meaningful participation (option E). */
export const MEANINGFUL_SHARE = 0.5;

/** Did this participation record show meaningful scoring participation? */
export function meaningful(p: { done: number; of: number; finished?: boolean } | undefined, share = MEANINGFUL_SHARE): boolean {
  if (!p) return false;
  if (p.finished) return true;
  return p.of > 0 && p.done / p.of >= share;
}

export function qualifies(policy: QualificationPolicy, a: DayAttendance): boolean {
  switch (policy.kind) {
    case "any-official-game":
      return a.gamesOnRoster >= 1;
    case "played-games":
      return a.gamesPlayed >= Math.max(1, policy.min);
    case "share-of-day":
      return a.gamesPlayed >= 1 && a.gamesThatDay > 0 && a.gamesPlayed / a.gamesThatDay >= policy.share;
    case "meaningful-games":
      return (a.participations ?? []).filter((p) => p === null || meaningful(p, policy.share)).length >= Math.max(1, policy.minGames);
  }
}
