/**
 * Category Sprint scoring and answer matching.
 *
 * Two matcher versions exist, and a game always uses the one recorded in its
 * own snapshot (`matcherVersion`, absent = 1), so a finished or in-progress
 * game can never be re-scored under different rules:
 *
 *   v1 (Sprint 4 and earlier): lowercase, strip everything but a-z and spaces,
 *      exact match against the category's answer list.
 *   v2 (E2 v3, owner-approved 2026-11-07): generic normalisation that never
 *      changes meaning, then the category's OWN aliases (each with a written
 *      reason; there is no global synonym table), a plural fold only onto a
 *      listed answer, and a guarded one-edit typo tolerance. Duplicates and
 *      uniqueness are decided on canonical answers, so "goat" + "sheep" in the
 *      zodiac count once, and "aubergine" is not unique next to "eggplant".
 *
 * Points are unchanged in both versions: 20 per valid distinct answer, +20 if
 * no other player gave the same canonical answer, at most 5 answers each.
 */

export interface SprintAlias { to: string; reason: string }

export interface SprintCategory {
  name: string;
  /** Canonical accepted answers (normalised). */
  answers: string[];
  /** Shown under the name before typing starts (closed sets). */
  definition?: string;
  /** v2 only: variant -> canonical answer, valid in THIS category only. */
  aliases?: Record<string, SprintAlias>;
  /** v2 only: answers players often give that are not accepted, with the reason shown in results. */
  knownNotAccepted?: Record<string, string>;
  /** v2 only: one-edit typo tolerance (default on). */
  typoTolerance?: boolean;
}

export type SprintMatcherVersion = 1 | 2;
/** The version new Cups use. Older Cups and games keep the version they recorded. */
export const CURRENT_SPRINT_MATCHER: SprintMatcherVersion = 2;
export const ANSWERS_PER_ROUND = 5;

export const SPRINT_CATEGORIES: SprintCategory[] = [
  { name: "Fruits", answers: ["apple", "banana", "orange", "grape", "mango", "pear", "peach", "lemon", "strawberry", "cherry"] },
  { name: "Animals", answers: ["dog", "cat", "horse", "elephant", "lion", "tiger", "bear", "rabbit", "mouse", "fox"] },
  { name: "Christmas things", answers: ["tree", "stocking", "wreath", "tinsel", "bauble", "snowman", "reindeer", "sleigh", "mistletoe", "gingerbread"] },
];

/** v1 normalisation (kept byte-for-byte for games that recorded v1). */
export function normalizeSprintAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
}

/**
 * v2 generic normalisation. Never changes meaning:
 * NFKD + drop diacritics, lowercase, "&" -> "and", hyphens/underscores/
 * slashes/apostrophes -> spaces, drop other non-letters, collapse spaces,
 * drop one leading article when something follows it.
 */
export function normalizeSprintAnswerV2(input: string): string {
  const s = input
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/'’`‘]/g, " ")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.replace(/^(the|a|an) (?=\S)/, "");
}

/** Optimal-string-alignment distance (a swap of two neighbours is one edit), capped. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return Math.min(d[a.length]![b.length]!, cap + 1);
}

export type SprintMatch =
  | { kind: "valid"; canonical: string; via: "exact" | "alias" | "plural" | "typo"; reason?: string }
  | { kind: "near-miss"; normalized: string; reason: string }
  | { kind: "not-on-list"; normalized: string }
  | { kind: "empty" };

const TYPO_MIN_LENGTH = 6;

/** Singular candidates for a plural form: only used when the result is a listed answer or alias. */
function singulars(n: string): string[] {
  const out: string[] = [];
  if (n.endsWith("ies") && n.length > 4) out.push(`${n.slice(0, -3)}y`);
  if (n.endsWith("es") && n.length > 3) out.push(n.slice(0, -2));
  if (n.endsWith("s") && n.length > 2) out.push(n.slice(0, -1));
  return out;
}

/** v2: match one typed answer against one category. Pure. */
export function matchSprintAnswer(cat: SprintCategory, raw: string): SprintMatch {
  const n = normalizeSprintAnswerV2(raw);
  if (!n) return { kind: "empty" };
  const listed = new Set(cat.answers);
  const aliases = cat.aliases ?? {};
  const hit = (x: string): string | undefined => (listed.has(x) ? x : Object.hasOwn(aliases, x) ? aliases[x]!.to : undefined);
  if (listed.has(n)) return { kind: "valid", canonical: n, via: "exact" };
  if (Object.hasOwn(aliases, n)) return { kind: "valid", canonical: aliases[n]!.to, via: "alias", reason: aliases[n]!.reason };
  const near = cat.knownNotAccepted ?? {};
  if (Object.hasOwn(near, n)) return { kind: "near-miss", normalized: n, reason: near[n]! };
  for (const s of singulars(n)) {
    const c = hit(s);
    if (c) return { kind: "valid", canonical: c, via: "plural" };
    if (Object.hasOwn(near, s)) return { kind: "near-miss", normalized: n, reason: near[s]! };
  }
  if ((cat.typoTolerance ?? true) && n.length >= TYPO_MIN_LENGTH) {
    // Exactly one canonical answer within one edit, and no OTHER canonical
    // answer within two: "Venezuala" matches; "Iran"/"Iraq" (too short, and
    // each other's neighbour) never merge.
    const within1 = cat.answers.filter((a) => editDistance(n, a, 2) <= 1);
    if (within1.length === 1) {
      const only = within1[0]!;
      const rival = cat.answers.some((a) => a !== only && editDistance(n, a, 2) <= 2);
      const nearRival = Object.keys(near).some((k) => editDistance(n, k, 2) <= 1);
      if (!rival && !nearRival) return { kind: "valid", canonical: only, via: "typo" };
    }
  }
  return { kind: "not-on-list", normalized: n };
}

export interface SprintAnswerReview {
  raw: string;
  verdict: "unique" | "shared" | "repeat" | "near-miss" | "not-on-list" | "empty" | "over-limit";
  canonical?: string;
  /** Why an alias was accepted, or why a near-miss was not. */
  reason?: string;
}

/**
 * Score one round and explain every typed answer. Version 1 reproduces the
 * Sprint 4 rule exactly; version 2 applies the E2 v3 matcher.
 */
export function reviewSprintRound(
  category: SprintCategory,
  submissions: Record<string, string[]>,
  version: SprintMatcherVersion = 1,
): { scores: Record<string, number>; reviews: Record<string, SprintAnswerReview[]> } {
  const validByPlayer: Record<string, string[]> = {};
  const reviews: Record<string, SprintAnswerReview[]> = {};
  for (const [pid, answers] of Object.entries(submissions)) {
    const seen = new Set<string>();
    const valid: string[] = [];
    const rev: SprintAnswerReview[] = [];
    answers.forEach((raw, i) => {
      if (i >= ANSWERS_PER_ROUND) { rev.push({ raw, verdict: "over-limit" }); return; }
      if (version === 1) {
        const norm = normalizeSprintAnswer(raw);
        if (!norm) rev.push({ raw, verdict: "empty" });
        else if (!category.answers.includes(norm)) rev.push({ raw, verdict: "not-on-list" });
        else if (seen.has(norm)) rev.push({ raw, verdict: "repeat", canonical: norm });
        else { seen.add(norm); valid.push(norm); rev.push({ raw, verdict: "shared", canonical: norm }); }
        return;
      }
      const m = matchSprintAnswer(category, raw);
      if (m.kind === "empty") rev.push({ raw, verdict: "empty" });
      else if (m.kind === "near-miss") rev.push({ raw, verdict: "near-miss", reason: m.reason });
      else if (m.kind === "not-on-list") rev.push({ raw, verdict: "not-on-list" });
      else if (seen.has(m.canonical)) rev.push({ raw, verdict: "repeat", canonical: m.canonical });
      else { seen.add(m.canonical); valid.push(m.canonical); rev.push({ raw, verdict: "shared", canonical: m.canonical, ...(m.reason ? { reason: m.reason } : {}) }); }
    });
    validByPlayer[pid] = valid;
    reviews[pid] = rev;
  }
  const counts = new Map<string, number>();
  for (const valid of Object.values(validByPlayer)) {
    for (const a of valid) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const scores: Record<string, number> = {};
  for (const [pid, valid] of Object.entries(validByPlayer)) {
    let score = valid.length * 20;
    for (const a of valid) if (counts.get(a) === 1) score += 20;
    scores[pid] = score;
  }
  for (const rev of Object.values(reviews)) for (const r of rev) if (r.verdict === "shared" && counts.get(r.canonical!) === 1) r.verdict = "unique";
  return { scores, reviews };
}

/** Score one round: 20 per valid distinct answer + 20 per answer no other player gave. Max 200 for 5 unique. */
export function scoreSprintRound(
  category: SprintCategory,
  submissions: Record<string, string[]>,
  version: SprintMatcherVersion = 1,
): Record<string, number> {
  return reviewSprintRound(category, submissions, version).scores;
}
