/**
 * E2 v3 closed-set integrity and the provisional size policy (owner-approved
 * in principle 2026-11-07, with corrections).
 *
 * Membership: a closed-set category's accepted answers must be EXACTLY the
 * canonical forms of the members its reference list publishes: nothing
 * missing, nothing extra, and the reference itself must hold the count its
 * authority publishes. Counting alone (answers.length === setSize) is not
 * enough: a list with one state misspelled and one invented would pass a
 * count but not this check.
 *
 * Size policy (provisional until real-player calibration, E7): official only
 * if setSize >= max(15, 4 x players), plus the obscure-tail and dominant
 * rules. Derived from scripts/content-quality/sprint-sim.ts; see
 * docs/content-quality-2/E2_SET_SIZE_SIMULATION.md.
 */
import { normalizeSprintAnswerV2 } from "../games/sprint.js";
import type { ItemOf, RecallProfile, SprintReference } from "./schema.js";

type SprintItem = ItemOf<"category-sprint">;

/** Everything wrong with a Category Sprint item's matching data. Empty = fine. */
export function sprintItemProblems(item: SprintItem, ref: SprintReference | undefined): string[] {
  const out: string[] = [];
  const answers = new Set(item.answers);
  if (answers.size !== item.answers.length) out.push("accepted answers repeat");
  for (const a of item.answers) if (normalizeSprintAnswerV2(a) !== a) out.push(`answer "${a}" is not in canonical (normalised) form`);
  const near = item.knownNotAccepted ?? {};
  for (const [k, v] of Object.entries(item.aliases ?? {})) {
    if (normalizeSprintAnswerV2(k) !== k) out.push(`alias "${k}" is not in normalised form`);
    if (answers.has(k)) out.push(`alias "${k}" is itself an accepted answer`);
    if (!answers.has(v.to)) out.push(`alias "${k}" points to "${v.to}", which is not an accepted answer`);
    if (Object.hasOwn(near, k)) out.push(`"${k}" is both an alias and a known non-answer`);
  }
  for (const k of Object.keys(near)) {
    if (normalizeSprintAnswerV2(k) !== k) out.push(`known non-answer "${k}" is not in normalised form`);
    if (answers.has(k)) out.push(`known non-answer "${k}" is an accepted answer`);
  }
  const r1 = item.answerRules1;
  if (r1) {
    const a1 = new Set(r1.answers);
    for (const a of r1.answers) if (normalizeSprintAnswerV2(a) !== a) out.push(`answer-rules-1 answer "${a}" is not in canonical (normalised) form`);
    for (const [k, v] of Object.entries(r1.aliases ?? {})) if (!a1.has(v.to) || a1.has(k)) out.push(`answer-rules-1 alias "${k}" is invalid`);
    for (const k of Object.keys(r1.knownNotAccepted ?? {})) if (a1.has(k) || Object.hasOwn(r1.aliases ?? {}, k)) out.push(`answer-rules-1 known non-answer "${k}" is also accepted`);
  }
  if (!item.closedSet) {
    if (item.membership) out.push("membership reference on an open category: set closedSet");
    return out;
  }
  if (!item.definition) out.push("closed set needs a definition shown to players");
  if (!item.recallProfile) out.push("closed set needs a recallProfile");
  if (!item.membership) { out.push("closed set needs a membership reference"); return out; }
  if (!ref) { out.push(`membership reference "${item.membership.reference}" not found`); return out; }
  if (ref.timeSensitive && !item.timeSensitive) out.push(`reference "${ref.id}" can change (review by ${ref.timeSensitive.reviewBy}): the item needs timeSensitive too`);
  if (ref.timeSensitive && item.timeSensitive && item.timeSensitive.reviewBy > ref.timeSensitive.reviewBy) out.push(`item review date is later than its reference's (${ref.timeSensitive.reviewBy})`);
  if (ref.members.length !== ref.source.publishedCount) out.push(`reference "${ref.id}" lists ${ref.members.length} members but its source publishes ${ref.source.publishedCount}`);
  const canon = ref.members.map(normalizeSprintAnswerV2);
  if (new Set(canon).size !== canon.length) out.push(`reference "${ref.id}" has members that normalise to the same answer`);
  const canonSet = new Set(canon);
  const missing = canon.filter((c) => !answers.has(c));
  const extra = item.answers.filter((a) => !canonSet.has(a));
  if (missing.length) out.push(`missing members of "${ref.id}": ${missing.join(", ")}`);
  if (extra.length) out.push(`answers not in "${ref.id}": ${extra.join(", ")}`);
  return out;
}

/** Version of the size policy below. Recorded in each game it selects for. */
export const SPRINT_SIZE_POLICY_VERSION = 1;

/** Simulated minimum set size for "dominant" (recited-in-order) sets, by players 4..10. */
const DOMINANT_MIN: Record<number, number> = { 4: 18, 5: 18, 6: 24, 7: 35, 8: 50, 9: 70, 10: 118 };

/** Smallest closed set that is suitable for official play with this many players. */
export function sprintMinimumSize(players: number, profile: RecallProfile): number {
  const p = Math.max(1, Math.round(players));
  let min = Math.max(15, 4 * p);
  if (profile === "obscure-tail") min = Math.max(min, 35);
  if (profile === "dominant") min = Math.max(min, DOMINANT_MIN[Math.min(10, Math.max(4, p))]!);
  return min;
}

export type SprintSuitability = { ok: true } | { ok: false; why: string };

/**
 * May this item be one of an official Category Sprint game's categories for
 * a room of `players`? Assumes the item already passed sprintItemProblems
 * (items that fail it never load).
 */
export function officialSprintSuitable(item: SprintItem, players: number): SprintSuitability {
  if (!item.closedSet || !item.recallProfile) return { ok: false, why: "open category (practice only)" };
  const min = sprintMinimumSize(players, item.recallProfile);
  if (item.answers.length < min) return { ok: false, why: `${item.answers.length} members; ${players} players need at least ${min} (${item.recallProfile})` };
  if (item.recallProfile === "obscure-tail" && (item.typicalRecall ?? 0) < 10) return { ok: false, why: "obscure-tail set: a typical player must be able to name at least 10" };
  return { ok: true };
}
