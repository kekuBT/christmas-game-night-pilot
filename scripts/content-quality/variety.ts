/**
 * E10 round variety: a BOUNDED, soft preference (proposal; not wired into
 * src/content/select.ts, which still decides every real game).
 *
 * Owner direction (2026-11-07): approve the principle, but never let a
 * variety rule make a valid round fail, repeat a question, break the approved
 * eligibility rules, or burn through the official pool faster.
 *
 * How it stays bounded:
 *  1. It runs AFTER eligibility and no-repeat filtering, on the same pool the
 *     current selector uses. It can only choose among items the current
 *     selector could have chosen.
 *  2. It keeps the current selector's difficulty allocation exactly (same
 *     largest-remainder split by difficulty) and its category cap. So the
 *     number of items used per game, and the difficulty mix, are unchanged.
 *  3. Within each difficulty, it looks at most `window` candidates ahead of
 *     the seeded order and takes the first one that adds no variety problem.
 *     If none of them is clean, it takes the least-bad one. It never refuses.
 *  4. It then orders the chosen items so the same mechanic is not back to back
 *     wherever that is possible.
 * With window 0 it reproduces the current selector's behaviour (the baseline).
 */

import { PLAIN_QUIZ_MECHANICS, QUOTE_TWIST_MECHANICS } from "../../src/content/schema.js";

export interface VarietyTags { mechanic?: string; negative?: boolean }
export interface VItem { id: string; difficulty: 1 | 2 | 3; category: string; tags: VarietyTags }

export const VARIETY_RULE = { maxPerTwist: 2, maxQuoteTwist: 1, maxNegative: 1 } as const;
/**
 * Plain formats are most of any real round: capping them made 93-100% of
 * simulated 10-question rounds "fail" (E10_ROUND_VARIETY.md), so they are
 * never capped. Only formats that feel samey when repeated are limited.
 */
export const PLAIN_MECHANICS = new Set<string>(PLAIN_QUIZ_MECHANICS);
export const QUOTE_TWIST = new Set<string>(QUOTE_TWIST_MECHANICS);
const isTwist = (m: string | undefined): m is string => !!m && !PLAIN_MECHANICS.has(m);

/**
 * The E10 rule (v2), on an ordered round. Within one quiz round:
 *  - a twist format (origin-story, myth-buster, weird-but-true, definition-twist,
 *    quote twists) at most twice, and never twice in a row;
 *  - at most one quote twist (never-said, misquote, misattribution) in total;
 *  - at most one question whose stem hinges on NOT/never.
 * Plain formats and untagged items are never a problem.
 */
export function roundProblems(round: VItem[]): string[] {
  const out: string[] = [];
  const count = new Map<string, number>();
  let quote = 0, neg = 0;
  round.forEach((it, i) => {
    const m = it.tags.mechanic;
    if (isTwist(m)) count.set(m, (count.get(m) ?? 0) + 1);
    if (m && QUOTE_TWIST.has(m)) quote++;
    if (it.tags.negative) neg++;
    if (isTwist(m) && i > 0 && round[i - 1]!.tags.mechanic === m) out.push(`'${m}' twice in a row`);
  });
  for (const [m, n] of count) if (n > VARIETY_RULE.maxPerTwist) out.push(`'${m}' appears ${n} times (max ${VARIETY_RULE.maxPerTwist})`);
  if (quote > VARIETY_RULE.maxQuoteTwist) out.push(`${quote} quote-twist questions (max ${VARIETY_RULE.maxQuoteTwist})`);
  if (neg > VARIETY_RULE.maxNegative) out.push(`${neg} negative stems (max ${VARIETY_RULE.maxNegative})`);
  return out;
}

/** Problems a candidate would ADD to an unordered selection (adjacency is fixed later by ordering). */
function addedCost(chosen: VItem[], c: VItem): number {
  let cost = 0;
  const m = c.tags.mechanic;
  if (isTwist(m) && chosen.filter((x) => x.tags.mechanic === m).length >= VARIETY_RULE.maxPerTwist) cost++;
  if (m && QUOTE_TWIST.has(m) && chosen.filter((x) => x.tags.mechanic && QUOTE_TWIST.has(x.tags.mechanic)).length >= VARIETY_RULE.maxQuoteTwist) cost++;
  if (c.tags.negative && chosen.filter((x) => x.tags.negative).length >= VARIETY_RULE.maxNegative) cost++;
  return cost;
}

function shuffled<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Same difficulty allocation as src/content/select.ts stratified(). */
export function allocate(pool: VItem[], count: number): Map<number, number> {
  const levels = [...new Set(pool.map((x) => x.difficulty))].sort();
  const size = (d: number) => pool.filter((x) => x.difficulty === d).length;
  const exact = levels.map((d) => (size(d) / pool.length) * count);
  const alloc = exact.map(Math.floor);
  let left = count - alloc.reduce((a, b) => a + b, 0);
  const order = levels.map((_, i) => i).sort((a, b) => (exact[b]! - alloc[b]!) - (exact[a]! - alloc[a]!) || a - b);
  for (const i of order) { if (left <= 0) break; if (alloc[i]! < size(levels[i]!)) { alloc[i]!++; left--; } }
  return new Map(levels.map((d, i) => [d, alloc[i]!]));
}

export interface VariedPick { items: VItem[]; problems: string[]; maxLookahead: number }

/**
 * Choose `count` items from `pool` (already eligible and unused). Deterministic
 * for a given rng. `window` = how many candidates past the seeded order it may
 * look; 0 = today's selector.
 */
export function selectVaried(pool: VItem[], count: number, rng: () => number, window: number): VariedPick {
  if (pool.length < count) throw new Error("pool smaller than count: the caller refuses the game before variety runs");
  const order = shuffled(pool, rng);
  const alloc = allocate(pool, count);
  const cap = Math.max(1, Math.ceil(count / 2));
  const perCategory = new Map<string, number>();
  const chosen: VItem[] = [];
  let maxLookahead = 0;
  for (const [d, want] of [...alloc.entries()].sort(([a], [b]) => a - b)) {
    let bucket = order.filter((x) => x.difficulty === d);
    for (let k = 0; k < want; k++) {
      // Category cap first (an existing rule), exactly as the current selector does.
      const capOk = bucket.filter((x) => (perCategory.get(x.category) ?? 0) < cap);
      const cands = capOk.length ? capOk : bucket;
      let pick = 0;
      if (window > 0) {
        let best = Infinity;
        for (let i = 0; i < Math.min(window + 1, cands.length); i++) {
          const c = addedCost(chosen, cands[i]!);
          if (c < best) { best = c; pick = i; }
          if (c === 0) break;
        }
      }
      maxLookahead = Math.max(maxLookahead, pick);
      const it = cands[pick]!;
      chosen.push(it);
      perCategory.set(it.category, (perCategory.get(it.category) ?? 0) + 1);
      bucket = bucket.filter((x) => x !== it);
    }
  }
  const items = window > 0 ? orderForVariety(shuffled(chosen, rng)) : shuffled(chosen, rng);
  return { items, problems: roundProblems(items), maxLookahead };
}

/** Reorder so the same mechanic is not back to back where possible (stable otherwise). */
export function orderForVariety(items: VItem[]): VItem[] {
  const left = [...items];
  const out: VItem[] = [];
  while (left.length) {
    const prev = out[out.length - 1]?.tags.mechanic;
    // Prefer the item whose mechanic is most frequent among those left (avoids painting into a corner).
    let idx = -1, bestLeft = -1;
    left.forEach((x, i) => {
      if (isTwist(prev) && x.tags.mechanic === prev) return;
      const n = isTwist(x.tags.mechanic) ? left.filter((y) => y.tags.mechanic === x.tags.mechanic).length : 0;
      if (n > bestLeft) { bestLeft = n; idx = i; }
    });
    if (idx < 0) idx = 0;
    out.push(left.splice(idx, 1)[0]!);
  }
  return out;
}

// ---------------------------------------------------------------- simulation

/** A deterministic PRNG (mulberry32), as in sprint-sim.ts. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LibraryProfile { name: string; mechanics: Record<string, number>; negativeRate: number; untaggedRate: number }

export const PROFILES: LibraryProfile[] = [
  {
    name: "typical (pilot-like mix)",
    mechanics: { "recall": 30, "recognition": 14, "deduction": 8, "comparison": 8, "myth-buster": 8, "definition-twist": 6, "origin-story": 10, "weird-but-true": 10, "never-said": 2, "misquote": 2, "misattribution": 2 },
    negativeRate: 0.08, untaggedRate: 0,
  },
  {
    name: "recall-heavy (today's library, if tagged)",
    mechanics: { "recall": 60, "recognition": 15, "deduction": 5, "comparison": 5, "myth-buster": 5, "origin-story": 5, "weird-but-true": 5 },
    negativeRate: 0.12, untaggedRate: 0,
  },
  {
    name: "half tagged",
    mechanics: { "recall": 30, "recognition": 14, "deduction": 8, "comparison": 8, "myth-buster": 8, "definition-twist": 6, "origin-story": 10, "weird-but-true": 10, "never-said": 2, "misquote": 2, "misattribution": 2 },
    negativeRate: 0.08, untaggedRate: 0.5,
  },
];

export function makeLibrary(p: LibraryProfile, size: number, seed: number): VItem[] {
  const r = prng(seed);
  const mech = Object.entries(p.mechanics);
  const total = mech.reduce((a, [, w]) => a + w, 0);
  const cats = ["Science", "History", "Geography", "Pop culture", "Gaming", "Music", "Food", "Language"];
  return Array.from({ length: size }, (_, i) => {
    let x = r() * total, m = mech[0]![0];
    for (const [k, w] of mech) { x -= w; if (x <= 0) { m = k; break; } }
    const dRoll = r();
    const tagged = r() >= p.untaggedRate;
    return {
      id: `sim-${i}`,
      difficulty: (dRoll < 0.3 ? 1 : dRoll < 0.75 ? 2 : 3) as 1 | 2 | 3,
      category: cats[Math.floor(r() * cats.length)]!,
      tags: tagged ? { mechanic: m, negative: r() < p.negativeRate } : {},
    };
  });
}

export interface CupSim { games: number; itemsUsed: number; meanProblems: number; gamesWithProblems: number; lateGamesWithProblems: number; maxLookahead: number; repeats: number }

/** Play official games of `count` items until the no-repeat pool runs out, as a Cup does. */
export function simulateCup(lib: VItem[], count: number, window: number, seed: number): CupSim {
  const used = new Set<string>();
  const perGame: number[] = [];
  let maxLookahead = 0, repeats = 0, itemsUsed = 0;
  for (let g = 0; ; g++) {
    const fresh = lib.filter((x) => !used.has(x.id));
    if (fresh.length < count) break; // the real selector refuses here; variety never changes when that happens
    const pick = selectVaried(fresh, count, prng(seed * 1000 + g), window);
    for (const it of pick.items) { if (used.has(it.id)) repeats++; used.add(it.id); }
    itemsUsed += pick.items.length;
    perGame.push(pick.problems.length);
    maxLookahead = Math.max(maxLookahead, pick.maxLookahead);
  }
  const games = perGame.length;
  const late = perGame.slice(Math.floor((games * 2) / 3));
  return {
    games, itemsUsed, repeats, maxLookahead,
    meanProblems: games ? perGame.reduce((a, b) => a + b, 0) / games : 0,
    gamesWithProblems: games ? perGame.filter((n) => n > 0).length / games : 0,
    lateGamesWithProblems: late.length ? late.filter((n) => n > 0).length / late.length : 0,
  };
}
