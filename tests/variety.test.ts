/**
 * E10 round variety (owner: approve the principle; never fail a valid round,
 * repeat a question, break eligibility, or exhaust the pool unnecessarily).
 * Tests the bounded variety step in scripts/content-quality/variety.ts on
 * realistic Cup-sized libraries and low-content scenarios.
 */
import { describe, expect, it } from "vitest";
import { allocate, makeLibrary, orderForVariety, prng, PROFILES, roundProblems, selectVaried, simulateCup, type VItem } from "../scripts/content-quality/variety.js";

const typical = PROFILES[0]!;
const item = (id: string, mechanic?: string, extra: Partial<VItem> = {}): VItem => ({ id, difficulty: 2, category: "c", tags: mechanic ? { mechanic } : {}, ...extra });

describe("the E10 v2 rule", () => {
  it("never limits plain formats; limits twist formats, quote twists and negative stems", () => {
    expect(roundProblems(Array.from({ length: 10 }, (_, i) => item(`r${i}`, "recall")))).toEqual([]);
    expect(roundProblems([item("a", "origin-story"), item("b", "recall"), item("c", "origin-story"), item("d", "recall"), item("e", "origin-story")])).toEqual(["'origin-story' appears 3 times (max 2)"]);
    expect(roundProblems([item("a", "myth-buster"), item("b", "myth-buster")])).toEqual(["'myth-buster' twice in a row"]);
    expect(roundProblems([item("a", "never-said"), item("b", "recall"), item("c", "misquote")])).toEqual(["2 quote-twist questions (max 1)"]);
    expect(roundProblems([item("a", "recall", { tags: { mechanic: "recall", negative: true } }), item("b", "recall", { tags: { mechanic: "recall", negative: true } })])).toEqual(["2 negative stems (max 1)"]);
    expect(roundProblems([item("a"), item("b"), item("c")])).toEqual([]); // untagged: unknown, never a problem
  });
});

describe("bounded variety step: invariants", () => {
  it("chooses exactly `count` distinct items, all from the pool, with today's difficulty allocation", () => {
    for (let s = 1; s <= 30; s++) {
      const lib = makeLibrary(typical, 40, s);
      for (const w of [0, 3, 8]) {
        const pick = selectVaried(lib, 10, prng(s), w);
        expect(pick.items).toHaveLength(10);
        expect(new Set(pick.items.map((x) => x.id)).size).toBe(10);
        for (const it of pick.items) expect(lib).toContain(it);
        const want = allocate(lib, 10);
        for (const [d, n] of want) expect(pick.items.filter((x) => x.difficulty === d).length).toBe(n);
      }
    }
  });

  it("is deterministic for a seed, and never looks further than its window", () => {
    const lib = makeLibrary(typical, 80, 7);
    expect(selectVaried(lib, 10, prng(9), 3).items.map((x) => x.id)).toEqual(selectVaried(lib, 10, prng(9), 3).items.map((x) => x.id));
    for (let s = 1; s <= 30; s++) expect(selectVaried(makeLibrary(typical, 80, s), 10, prng(s), 3).maxLookahead).toBeLessThanOrEqual(3);
  });

  it("never fails a round: a pool of exactly ten items that all share one twist format still gives a round (problems reported, not refused)", () => {
    const lib = Array.from({ length: 10 }, (_, i) => item(`o${i}`, "origin-story"));
    const pick = selectVaried(lib, 10, prng(1), 8);
    expect(pick.items).toHaveLength(10);
    expect(pick.problems.length).toBeGreaterThan(0);
  });

  it("refusing a game for lack of content stays the caller's job: variety never runs on a short pool", () => {
    expect(() => selectVaried(makeLibrary(typical, 9, 1), 10, prng(1), 3)).toThrow(/pool smaller than count/);
  });

  it("a whole Cup plays the same number of games, uses the same number of items, and repeats nothing", () => {
    for (const size of [10, 12, 20, 40, 80, 140]) for (let s = 1; s <= 10; s++) {
      const lib = makeLibrary(typical, size, s);
      const base = simulateCup(lib, 10, 0, s);
      const varied = simulateCup(lib, 10, 3, s);
      expect(varied.games).toBe(base.games);
      expect(varied.itemsUsed).toBe(base.itemsUsed);
      expect(varied.repeats).toBe(0);
      expect(base.repeats).toBe(0);
    }
  });
});

describe("bounded variety step: effect", () => {
  const rate = (size: number, w: number, profile = typical) => {
    let bad = 0;
    for (let s = 1; s <= 30; s++) bad += simulateCup(makeLibrary(profile, size, s), 10, w, s).gamesWithProblems;
    return bad / 30;
  };
  it("on Cup-sized libraries it removes most rule breaches (typical mix, 80-140 items)", () => {
    for (const size of [80, 140]) {
      expect(rate(size, 3)).toBeLessThan(rate(size, 0) / 2.5);
    }
  });
  it("on low-content libraries it still helps or does no harm, and never changes what can be played", () => {
    for (const size of [10, 12, 20]) expect(rate(size, 3)).toBeLessThanOrEqual(rate(size, 0) + 1e-9);
  });
  it("a larger window adds little over 3 (so the bound costs almost nothing)", () => {
    expect(rate(140, 3) - rate(140, 8)).toBeLessThan(0.05);
  });
  it("ordering separates repeated twist formats when possible", () => {
    const round = orderForVariety([item("a", "origin-story"), item("b", "origin-story"), item("c", "recall"), item("d", "recall")]);
    expect(roundProblems(round)).toEqual([]);
  });
});
