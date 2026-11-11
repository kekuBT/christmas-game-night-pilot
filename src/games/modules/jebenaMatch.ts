/**
 * Jebena Rush answer matching (Stage 9.1, docs/stage9/stage91.md §7).
 *
 * Built on Category Sprint's matcher v2 normalisation (src/games/sprint.ts):
 * case, accents, punctuation, spacing and a leading article never change
 * meaning. Then, against ONE category:
 *   1. an exact answer or one of its aliases;
 *   2. a typed answer the bank deliberately doesn't accept (with its reason);
 *   3. a plural folded onto exactly one listed answer or alias;
 *   4. a one-edit typo, only at 6+ letters, and only when exactly one answer
 *      is within one edit and NO other answer (or not-accepted word) is
 *      within two;
 *   5. anything close to an answer but not certain (a short word one edit
 *      from an answer, a typo with a rival, or a longer word two edits from
 *      an answer) is AMBIGUOUS ("close: check the spelling"): never silently
 *      another answer, and the hidden answer is never named;
 *   6. anything else is "not in this bank" (never "wrong": the bank is finite).
 * Duplicates are decided on answer ids by the caller, so an alias or a typo
 * uses up the same answer.
 */
import { editDistance, normalizeSprintAnswerV2 } from "../sprint.js";
import type { JebenaCategory } from "./packs/jebena-banks.js";

export type JebenaMatch =
  | { kind: "accepted"; answerId: string; via: "exact" | "alias" | "plural" | "typo" }
  | { kind: "near-miss"; normalized: string; reason: string }
  | { kind: "ambiguous"; normalized: string }
  | { kind: "not-in-bank"; normalized: string }
  | { kind: "empty" };

/** Typo tolerance needs this many letters: shorter words are too close to each other to guess. */
export const JEBENA_TYPO_MIN_LENGTH = 6;
/** A short word this close to an answer is "ambiguous" rather than "not in this bank" (and never accepted). */
const SHORT_NEAR_MIN_LENGTH = 3;

export const normalizeJebena = normalizeSprintAnswerV2;

interface Index {
  /** normalised form (name or alias) -> answer id */
  forms: Map<string, string>;
  /** normalised form -> "name" | "alias" */
  formKind: Map<string, "name" | "alias">;
  notAccepted: Map<string, string>;
}
const indexes = new WeakMap<JebenaCategory, Index>();

function indexOf(cat: JebenaCategory): Index {
  const hit = indexes.get(cat);
  if (hit) return hit;
  const forms = new Map<string, string>();
  const formKind = new Map<string, "name" | "alias">();
  for (const ans of cat.answers) {
    const n = normalizeJebena(ans.name);
    if (n && !forms.has(n)) { forms.set(n, ans.id); formKind.set(n, "name"); }
    for (const al of ans.aliases ?? []) {
      const m = normalizeJebena(al);
      if (m && !forms.has(m)) { forms.set(m, ans.id); formKind.set(m, "alias"); }
    }
  }
  const notAccepted = new Map(Object.entries(cat.notAccepted ?? {}).map(([k, v]) => [normalizeJebena(k), v] as const));
  const idx = { forms, formKind, notAccepted };
  indexes.set(cat, idx);
  return idx;
}

/** Singular candidates for a plural form: used only when the result is a listed form. */
function singulars(n: string): string[] {
  const out: string[] = [];
  if (n.endsWith("ies") && n.length > 4) out.push(`${n.slice(0, -3)}y`);
  if (n.endsWith("es") && n.length > 3) out.push(n.slice(0, -2));
  if (n.endsWith("s") && n.length > 2) out.push(n.slice(0, -1));
  return out;
}

/** Match one typed answer against one category. Pure. */
export function matchJebena(cat: JebenaCategory, raw: string): JebenaMatch {
  const n = normalizeJebena(raw);
  if (!n) return { kind: "empty" };
  const { forms, formKind, notAccepted } = indexOf(cat);
  const exact = forms.get(n);
  if (exact) return { kind: "accepted", answerId: exact, via: formKind.get(n) === "name" ? "exact" : "alias" };
  const na = notAccepted.get(n);
  if (na) return { kind: "near-miss", normalized: n, reason: na };
  for (const s of singulars(n)) {
    const id = forms.get(s);
    if (id) return { kind: "accepted", answerId: id, via: "plural" };
    const nas = notAccepted.get(s);
    if (nas) return { kind: "near-miss", normalized: n, reason: nas };
  }
  // How close is it to each answer (any of its forms)?
  const closest = new Map<string, number>();
  for (const [form, id] of forms) {
    const d = editDistance(n, form, 2);
    if (d <= 2 && d < (closest.get(id) ?? 3)) closest.set(id, d);
  }
  const within1 = [...closest].filter(([, d]) => d <= 1).map(([id]) => id);
  if (n.length >= JEBENA_TYPO_MIN_LENGTH && within1.length === 1) {
    const only = within1[0]!;
    const rival = [...closest].some(([id, d]) => id !== only && d <= 2);
    const nearNotAccepted = [...notAccepted.keys()].some((k) => editDistance(n, k, 2) <= 1);
    if (!rival && !nearNotAccepted) return { kind: "accepted", answerId: only, via: "typo" };
    return { kind: "ambiguous", normalized: n };
  }
  if (within1.length > 0 && n.length >= SHORT_NEAR_MIN_LENGTH) return { kind: "ambiguous", normalized: n };
  // Two edits from an answer in a longer word ("elefant"): close enough to say "check the spelling", never accepted.
  if (n.length >= JEBENA_TYPO_MIN_LENGTH && closest.size > 0) return { kind: "ambiguous", normalized: n };
  return { kind: "not-in-bank", normalized: n };
}

/** The display name of an answer id in a category (undefined if unknown). */
export function answerName(cat: JebenaCategory, id: string): string | undefined {
  return cat.answers.find((x) => x.id === id)?.name;
}

export interface JebenaBankReport {
  category: string;
  answers: number;
  aliases: number;
  /** A form (name or alias) claimed by two answers. Must be empty. */
  formCollisions: { form: string; ids: string[] }[];
  /** A not-accepted word that is also an accepted form. Must be empty. */
  notAcceptedCollisions: string[];
  /** Duplicate answer ids. Must be empty. */
  duplicateIds: string[];
  /** Pairs of answers whose forms are within two edits: typos near them are "ambiguous", never guessed. */
  closePairs: { a: string; b: string; distance: number }[];
}

/** The bank report (§7): counts and collisions for one category. */
export function bankReport(cat: JebenaCategory): JebenaBankReport {
  const owner = new Map<string, Set<string>>();
  let aliases = 0;
  for (const ans of cat.answers) {
    for (const f of [ans.name, ...(ans.aliases ?? [])]) {
      const n = normalizeJebena(f);
      if (!n) continue;
      if (f !== ans.name) aliases++;
      const s = owner.get(n) ?? new Set<string>();
      s.add(ans.id);
      owner.set(n, s);
    }
  }
  const formCollisions = [...owner].filter(([, ids]) => ids.size > 1).map(([form, ids]) => ({ form, ids: [...ids] }));
  const notAcceptedCollisions = Object.keys(cat.notAccepted ?? {}).map(normalizeJebena).filter((k) => owner.has(k));
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  for (const ans of cat.answers) { if (seenIds.has(ans.id)) duplicateIds.push(ans.id); seenIds.add(ans.id); }
  const closePairs: { a: string; b: string; distance: number }[] = [];
  const names = cat.answers.map((x) => ({ id: x.id, forms: [x.name, ...(x.aliases ?? [])].map(normalizeJebena) }));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      let best = 3;
      for (const f of names[i]!.forms) for (const g of names[j]!.forms) best = Math.min(best, editDistance(f, g, 2));
      if (best <= 2) closePairs.push({ a: names[i]!.id, b: names[j]!.id, distance: best });
    }
  }
  return { category: cat.id, answers: cat.answers.length, aliases, formCollisions, notAcceptedCollisions, duplicateIds, closePairs };
}
