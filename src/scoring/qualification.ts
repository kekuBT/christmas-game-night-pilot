/**
 * What makes a championship day "qualifying" for a player.
 *
 * The rule belongs to the Cup, not to the application: every Cup stores its
 * own validated policy (src/server/cup.ts) when it is created, and keeps it
 * for life. Changing the default here changes only Cups created afterwards.
 *
 * Policies:
 * - "any-official-game" (legacy): on the roster of at least one Cup game
 *   that day. Every Cup created before Sprint 4 used this rule and keeps it.
 * - "meaningful-participation" v1 (owner-approved 2026-11-06, Sprint 4):
 *   the player meaningfully took part in at least `minGames` completed,
 *   officially counted games that day. Meaningful means BOTH:
 *     - at least `minActions` genuine scoring actions (answers and guesses,
 *       wrong ones included; captions; non-empty Sprint submissions;
 *       Connections group guesses). Opening a question, being on the
 *       roster, staying connected and choosing to sit out are not actions;
 *     - at least `minShare` of the game's scoring opportunities completed,
 *       except Word Connections, where the opportunity is the puzzle: it
 *       counts when the PLAYER ended it (all four groups solved, or the
 *       allowed mistakes used up) or solved at least `minShare` of the
 *       groups. Reaching the game's deadline is not the player finishing.
 *   Void, practice and otherwise excluded games never reach this check
 *   (only games that count officially are considered).
 */
import { z } from "zod";

export const LegacyQualificationPolicySchema = z.object({ kind: z.literal("any-official-game") }).strict();
export const MeaningfulQualificationPolicySchema = z.object({
  kind: z.literal("meaningful-participation"),
  version: z.literal(1),
  /** Share of a game's scoring opportunities that must be completed (0-1]. */
  minShare: z.number().gt(0).lte(1),
  /** Genuine scoring actions required in that game. */
  minActions: z.number().int().min(1).max(100),
  /** Meaningfully played, officially counted games needed that day. */
  minGames: z.number().int().min(1).max(20),
}).strict();
export const QualificationPolicySchema = z.discriminatedUnion("kind", [LegacyQualificationPolicySchema, MeaningfulQualificationPolicySchema]);
export type QualificationPolicy = z.infer<typeof QualificationPolicySchema>;

/** The rule of every Cup created before Sprint 4 (and of snapshots without a Cup record). */
export const LEGACY_QUALIFICATION_POLICY: QualificationPolicy = Object.freeze({ kind: "any-official-game" });

/** The owner-approved rule for Cups created from Sprint 4 on. */
export const NEW_CUP_QUALIFICATION_POLICY: QualificationPolicy = Object.freeze({
  kind: "meaningful-participation",
  version: 1,
  minShare: 0.5,
  minActions: 2,
  minGames: 1,
});

/** One player's record in one officially counted game (from the game's outcome). */
export interface GameParticipationRecord {
  done: number;
  of: number;
  /** Word Connections: the player ended the puzzle themselves. */
  finished?: boolean;
  /** Genuine scoring actions (absent on records written before Sprint 4). */
  actions?: number;
}

export interface DayAttendance {
  /** Officially counted Cup games that day with this player on the roster. */
  gamesOnRoster: number;
  /**
   * Per such game: the participation record, or null for a game recorded
   * before Sprint 3 (no record at all).
   */
  participations: (GameParticipationRecord | null)[];
}

/** Was this game meaningful participation under the policy? */
export function meaningful(p: GameParticipationRecord | null, policy: Extract<QualificationPolicy, { kind: "meaningful-participation" }>): boolean {
  // A game with no participation record predates outcomes; it can only exist
  // in an old Cup, which never uses this policy. Fail closed if it ever does.
  if (p === null) return false;
  const actions = p.actions ?? p.done;
  if (actions < policy.minActions) return false;
  if (p.finished) return true;
  return p.of > 0 && p.done / p.of >= policy.minShare;
}

export function qualifies(policy: QualificationPolicy, a: DayAttendance): boolean {
  switch (policy.kind) {
    case "any-official-game":
      return a.gamesOnRoster >= 1;
    case "meaningful-participation":
      return a.participations.filter((p) => meaningful(p, policy)).length >= policy.minGames;
  }
}
