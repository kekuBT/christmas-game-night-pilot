/**
 * A Family Cup's identity (Sprint 4): the rules it was created with, saved
 * with its room and never changed afterwards.
 *
 * Until Sprint 3 a room WAS its Cup and only the format was saved; the
 * qualifying rule lived in code and was never written to disk. A Cup record
 * now holds everything that decides who wins:
 *   - cupId: stable identity (content usage history is scoped to it)
 *   - format: individual-only | combined-75-25
 *   - qualificationPolicy: validated (src/scoring/qualification.ts)
 *
 * Restoring:
 *   - a snapshot without a Cup record is a Cup from before Sprint 4: it keeps
 *     the rules it was played under (its saved format, or combined 75/25 if
 *     it predates formats; the "any official game" qualifying rule);
 *   - a Cup record that fails validation is NOT replaced by a guess: the room
 *     still loads, and standings are paused with a plain message until the
 *     record is repaired (fail safe, never silently re-ruled).
 */
import { z } from "zod";
import { LEGACY_QUALIFICATION_POLICY, NEW_CUP_QUALIFICATION_POLICY, QualificationPolicySchema, type QualificationPolicy } from "../scoring/qualification.js";
import { LEGACY_ROOM_FORMAT, NEW_ROOM_FORMAT, type CompetitionFormat } from "../scoring/format.js";

export const CupRecordSchema = z.object({
  schemaVersion: z.literal(1),
  cupId: z.string().regex(/^cup-[A-Za-z0-9-]{4,64}$/),
  createdAt: z.number().int().nonnegative(),
  format: z.enum(["individual-only", "combined-75-25"]),
  qualificationPolicy: QualificationPolicySchema,
  /** How the Cup came to exist: created in Sprint 4+, or reconstructed from an older snapshot. */
  origin: z.enum(["created", "legacy-restored"]),
  /**
   * Category Sprint rules (E2 v3, owner-approved 2026-11-07). Fixed when the
   * Cup is created. Absent = a Cup created before E2 v3: it keeps the
   * Sprint 4 behaviour (matcher v1, no closed-set or size filter), so a Cup
   * already under way is never re-ruled.
   */
  categorySprint: z.object({
    matcher: z.literal(2),
    /** Official categories must be closed sets that pass this size policy for the room. */
    sizePolicy: z.literal(1),
    /**
     * Answer rules for closed categories. 2 (owner ruling 2026-11-07): a bare
     * "Congo" is ambiguous and scores nothing. Absent = 1, every Cup created
     * before that ruling: those Cups keep scoring a bare "Congo" as the
     * Republic of the Congo (items carry an `answerRules1` copy).
     */
    answerRules: z.literal(2).optional(),
  }).strict().optional(),
}).strict();
export type CupRecord = z.infer<typeof CupRecordSchema>;

export function newCupRecord(cupId: string, createdAt: number): CupRecord {
  return Object.freeze({
    schemaVersion: 1,
    cupId,
    createdAt,
    format: NEW_ROOM_FORMAT,
    qualificationPolicy: NEW_CUP_QUALIFICATION_POLICY,
    origin: "created",
    categorySprint: Object.freeze({ matcher: 2, sizePolicy: 1, answerRules: 2 }),
  }) as CupRecord;
}

export type CupRestore = { ok: true; cup: CupRecord } | { ok: false; error: string; raw: unknown };

/**
 * Rebuild a room's Cup from a snapshot.
 * `legacyFormat` is the snapshot's old `competitionFormat` field, if any.
 */
export function restoreCupRecord(raw: unknown, ctx: { roomId: string; legacyFormat: unknown; createdAt: number }): CupRestore {
  if (raw === undefined || raw === null) {
    const f = ctx.legacyFormat;
    const format: CompetitionFormat = f === "individual-only" || f === "combined-75-25" ? f : LEGACY_ROOM_FORMAT;
    return {
      ok: true,
      cup: Object.freeze({
        schemaVersion: 1,
        cupId: `cup-legacy-${ctx.roomId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 48) || "room"}`,
        createdAt: ctx.createdAt,
        format,
        qualificationPolicy: LEGACY_QUALIFICATION_POLICY,
        origin: "legacy-restored",
      }) as CupRecord,
    };
  }
  const parsed = CupRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `Cup record invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ").slice(0, 300)}`, raw };
  }
  return { ok: true, cup: Object.freeze({ ...parsed.data, qualificationPolicy: Object.freeze({ ...parsed.data.qualificationPolicy }), ...(parsed.data.categorySprint ? { categorySprint: Object.freeze({ ...parsed.data.categorySprint }) } : {}) }) as CupRecord };
}

export function describePolicy(p: QualificationPolicy): string {
  return p.kind === "any-official-game"
    ? "A day counts if you were in at least one official game that day."
    : `A day counts if you really played at least ${p.minGames === 1 ? "one" : p.minGames} official game${p.minGames === 1 ? "" : "s"} that day: at least ${Math.round(p.minShare * 100)}% of it and at least ${p.minActions} answers or moves (wrong answers count; sitting out doesn't).`;
}

export { NEW_ROOM_FORMAT, NEW_CUP_QUALIFICATION_POLICY };
