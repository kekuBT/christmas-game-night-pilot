/**
 * Category Sprint set-size simulation (E2 v3, Content Quality 2.0).
 *
 * Question it answers: for a closed-set category of size N played by P
 * players who each submit up to 5 answers, how often does a player run out
 * of valid answers, and how often does a valid answer earn the "nobody else
 * gave it" uniqueness bonus?
 *
 * Model (deliberately simple; every assumption is a parameter):
 *  - Members have a salience order. Salience weight of rank i (1-based) is
 *    1 / i^skew. skew 0 = every member equally likely to come to mind;
 *    skew 1 = typical "famous ones first" lists; skew 1.5 = a few members
 *    dominate (e.g. the 4 Beatles' best-known songs).
 *  - A player knows member i with probability
 *      known(i) = maxKnown * (w_i / w_1)^depth
 *    (depth 0 = everyone knows everything; larger = obscure members are
 *    known by fewer players).
 *  - Each player writes answers by drawing from the members they know,
 *    without replacement, proportional to salience, up to 5.
 *  - Scoring is today's rule (unchanged): 20 per valid distinct answer,
 *    +20 if no other player gave the same canonical answer.
 *
 * This is a model, not data. It is used to rank set sizes, not to promise
 * outcomes; E7 (answer logs from real play) should recalibrate skew/depth.
 */

export interface SimParams {
  setSize: number;
  players: number;
  answersPerPlayer?: number; // default 5
  skew: number;
  depth: number;
  maxKnown?: number; // default 0.97
  rounds?: number; // default 4000
  seed?: number; // default 1
}

export interface SimResult {
  setSize: number;
  players: number;
  skew: number;
  depth: number;
  /** Share of players who could not reach the answer limit with valid answers. */
  shortRate: number;
  /** Mean valid answers per player. */
  meanValid: number;
  /** Share of valid answers that earned the uniqueness bonus. */
  uniqueRate: number;
  /** Share of rounds in which no player earned any uniqueness bonus. */
  noBonusRoundRate: number;
  /** Mean (over rounds) of the gap between the best and worst player score. */
  meanSpread: number;
}

/** Small deterministic PRNG (mulberry32) so results are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(p: SimParams): SimResult {
  const k = p.answersPerPlayer ?? 5;
  const maxKnown = p.maxKnown ?? 0.97;
  const rounds = p.rounds ?? 4000;
  const rand = rng(p.seed ?? 1);
  const w = Array.from({ length: p.setSize }, (_, i) => 1 / Math.pow(i + 1, p.skew));
  const known = w.map((x) => maxKnown * Math.pow(x / w[0]!, p.depth));

  let short = 0, valid = 0, unique = 0, noBonusRounds = 0, spread = 0;
  for (let r = 0; r < rounds; r++) {
    const picks: number[][] = [];
    for (let pl = 0; pl < p.players; pl++) {
      const pool: number[] = [];
      for (let i = 0; i < p.setSize; i++) if (rand() < known[i]!) pool.push(i);
      const mine: number[] = [];
      while (mine.length < k && pool.length > 0) {
        let total = 0;
        for (const i of pool) total += w[i]!;
        let x = rand() * total, j = 0;
        for (; j < pool.length - 1; j++) { x -= w[pool[j]!]!; if (x <= 0) break; }
        mine.push(pool[j]!);
        pool.splice(j, 1);
      }
      if (mine.length < k) short++;
      picks.push(mine);
    }
    const count = new Map<number, number>();
    for (const m of picks) for (const i of m) count.set(i, (count.get(i) ?? 0) + 1);
    let roundUnique = 0;
    const scores = picks.map((m) => {
      let s = 0;
      for (const i of m) { s += 20; if (count.get(i) === 1) { s += 20; roundUnique++; } }
      return s;
    });
    valid += picks.reduce((a, m) => a + m.length, 0);
    unique += roundUnique;
    if (roundUnique === 0) noBonusRounds++;
    spread += Math.max(...scores) - Math.min(...scores);
  }
  return {
    setSize: p.setSize, players: p.players, skew: p.skew, depth: p.depth,
    shortRate: short / (rounds * p.players),
    meanValid: valid / (rounds * p.players),
    uniqueRate: valid ? unique / valid : 0,
    noBonusRoundRate: noBonusRounds / rounds,
    meanSpread: spread / rounds,
  };
}

/**
 * Suitability policy (proposal). A (set size, players) pair is suitable for
 * official play when, under the stated model:
 *  - at most 5% of players run out of valid answers (shortRate <= 0.05);
 *  - the uniqueness bonus is neither nearly impossible nor nearly automatic:
 *    0.20 <= uniqueRate <= 0.70;
 *  - at most 10% of rounds award no uniqueness bonus to anyone.
 */
export const POLICY = { maxShort: 0.05, minUnique: 0.2, maxUnique: 0.7, maxNoBonusRounds: 0.1 } as const;

export function suitable(r: SimResult): boolean {
  return r.shortRate <= POLICY.maxShort && r.uniqueRate >= POLICY.minUnique && r.uniqueRate <= POLICY.maxUnique && r.noBonusRoundRate <= POLICY.maxNoBonusRounds;
}

/** Smallest set size in `sizes` that is suitable (and stays suitable for every larger size tried up to the first failure on the high side). */
export function minimumSuitableSize(players: number, skew: number, depth: number, sizes: number[], rounds = 2000): number | null {
  for (const n of sizes) if (suitable(simulate({ setSize: n, players, skew, depth, rounds }))) return n;
  return null;
}
