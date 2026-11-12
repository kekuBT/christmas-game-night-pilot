/**
 * Stage 9.2: the Spectrum foundation (docs/stage9/stage92.md), as a pure
 * module: rules, timing, exactly-once handling, partial endings, privacy by
 * role and phase, content, and that nothing in the product offers it yet.
 */
import { describe, expect, it } from "vitest";
import {
  cleanClue, spectrumAggregate, spectrumModule, spectrumPoints, spectrumTeamResult,
  SPECTRUM_CLUE_MAX, SPECTRUM_MAX_POINTS, SPECTRUM_PHASE_MS, SPECTRUM_ROUNDS, type SpectrumState,
} from "../src/games/modules/spectrum.js";
import { SPECTRUM_PACK_VERSION, SPECTRUM_PAIRS } from "../src/games/modules/packs/spectrum-pairs.js";
import { moduleFor, moduleForAction } from "../src/games/modules/index.js";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { policyFor } from "../src/server/lifecycle.js";

type Json = Record<string, unknown>;
const T0 = 1_800_000_000_000;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const ctx = (s: SpectrumState, now: number, scale = 1) => ({ now, players: s.order, active: s.order.filter((p) => s.satOut[p] === undefined), scale });
const start = (n: number, seed = 7) => spectrumModule.init({ players: ids(n), seed });
const cur = (s: SpectrumState) => s.rounds[s.round]!;
const giver = (s: SpectrumState) => cur(s).giver!;
const guessers = (s: SpectrumState) => cur(s).required;
const clue = (s: SpectrumState, now: number, text = "a warm bath") => spectrumModule.intent(s, giver(s), "spectrum-clue", { round: s.round + 1, text }, ctx(s, now));
const guess = (s: SpectrumState, id: string, value: number, now: number) => spectrumModule.intent(s, id, "spectrum-guess", { round: s.round + 1, value }, ctx(s, now));
const expire = (s: SpectrumState, now: number, scale = 1) => spectrumModule.expirePhase(s, ctx(s, now, scale));
const dueAt = (s: SpectrumState, playStart = T0) => (s.phaseStartedAt ?? playStart) + SPECTRUM_PHASE_MS[s.phase as "clue" | "guess" | "reveal"];
const snapshot = (s: SpectrumState) => JSON.parse(JSON.stringify(s)) as SpectrumState;

/** Play one round: a clue at `t`, then these guesses (by required-guesser index), and let the reveal run out. */
function playRound(s: SpectrumState, t: number, values: (number | undefined)[]): number {
  expect(clue(s, t)).toMatchObject({ ok: true, result: { phase: "guess" } });
  const gs = [...guessers(s)];
  gs.forEach((g, i) => { if (values[i] !== undefined) expect(guess(s, g, values[i]!, t + 1 + i)).toMatchObject({ ok: true }); });
  if (s.phase === "guess") expire(s, dueAt(s)); // someone didn't guess: the phase runs out
  expect(s.phase).toBe("reveal");
  const revealEnd = dueAt(s);
  expire(s, revealEnd);
  return revealEnd;
}

describe("Spectrum content (sp-pairs-1)", () => {
  it("at least 24 year-round opposing pairs with stable ids, two different ends and a one-line meaning; none repeat", () => {
    expect(SPECTRUM_PACK_VERSION).toBe("sp-pairs-1");
    expect(SPECTRUM_PAIRS.length).toBeGreaterThanOrEqual(24);
    const idSet = new Set(SPECTRUM_PAIRS.map((p) => p.id));
    expect(idSet.size).toBe(SPECTRUM_PAIRS.length);
    const ends = new Set(SPECTRUM_PAIRS.map((p) => `${p.left.toLowerCase()}|${p.right.toLowerCase()}`));
    expect(ends.size).toBe(SPECTRUM_PAIRS.length);
    for (const p of SPECTRUM_PAIRS) {
      expect(p.id).toMatch(/^sp-[a-z]+(-[a-z]+)+$/);
      expect(p.left.trim()).not.toBe("");
      expect(p.right.trim()).not.toBe("");
      expect(p.left.toLowerCase()).not.toBe(p.right.toLowerCase());
      expect(p.meaning.length).toBeGreaterThan(5);
      expect(p.meaning.length).toBeLessThanOrEqual(60);
      expect(p.meaning.endsWith(".")).toBe(true);
    }
  });

  it("nothing Christmas-specific and nothing that ranks people", () => {
    const text = JSON.stringify(SPECTRUM_PAIRS).toLowerCase();
    for (const w of ["christmas", "xmas", "santa", "reindeer", "elf", "advent", "nativity"]) expect(text).not.toContain(w);
    // Whole words ("thin" must not catch "things"), and word stems ("religio…", "nation…").
    for (const w of ["ugly", "pretty", "beautiful", "rich", "poor", "fat", "thin", "smart", "stupid", "clever", "dumb", "race", "gender", "old person", "young person"]) expect(text, w).not.toMatch(new RegExp(`\\b${w}\\b`));
    for (const stem of ["religio", "nationalit", "ethnic"]) expect(text, stem).not.toMatch(new RegExp(`\\b${stem}`));
  });

  it("a match draws four different pairs, for any seed; the same seed gives the same match", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = start(3, seed);
      expect(new Set(s.rounds.map((r) => r.pairId)).size).toBe(SPECTRUM_ROUNDS);
      for (const r of s.rounds) {
        expect(Number.isInteger(r.target)).toBe(true);
        expect(r.target).toBeGreaterThanOrEqual(10);
        expect(r.target).toBeLessThanOrEqual(90);
      }
    }
    expect(start(4, 99)).toEqual(start(4, 99));
    expect(start(4, 99).rounds.map((r) => r.pairId)).not.toEqual(start(4, 100).rounds.map((r) => r.pairId));
  });
});

describe("Spectrum rules: the team's guess and the points", () => {
  it("the median; an even count takes the mean of the middle two, rounded half up; no guesses is no team guess", () => {
    expect(spectrumAggregate([])).toBeNull();
    expect(spectrumAggregate([50])).toBe(50);
    expect(spectrumAggregate([90, 10])).toBe(50);
    expect(spectrumAggregate([40, 41])).toBe(41); // 40.5 → 41
    expect(spectrumAggregate([1, 2])).toBe(2); // 1.5 → 2
    expect(spectrumAggregate([0, 1])).toBe(1); // 0.5 → 1
    expect(spectrumAggregate([36, 33, 35, 34])).toBe(35); // 34.5 → 35, whatever the order
    expect(spectrumAggregate([0, 100, 100])).toBe(100);
    expect(spectrumAggregate([5, 5, 95, 95])).toBe(50);
  });

  it("every scoring boundary: ≤5 → 10, ≤10 → 7, ≤20 → 4, more → 0", () => {
    const table: [number, number][] = [[0, 10], [5, 10], [6, 7], [10, 7], [11, 4], [20, 4], [21, 0], [80, 0], [100, 0]];
    for (const [d, pts] of table) expect(spectrumPoints(d)).toBe(pts);
    expect(SPECTRUM_MAX_POINTS).toBe(40);
  });

  it("the same boundaries through real rounds, either side of the target", () => {
    for (const [offset, pts] of [[5, 10], [-5, 10], [6, 7], [-10, 7], [11, 4], [-20, 4], [21, 0], [-21, 0]] as const) {
      const s = start(2, 11);
      cur(s).target = 50;
      clue(s, T0 + 1);
      guess(s, guessers(s)[0]!, 50 + offset, T0 + 2);
      expect(s.phase).toBe("reveal");
      expect(cur(s).outcome).toMatchObject({ reason: "scored", aggregate: 50 + offset, distance: Math.abs(offset), points: pts });
      expect(s.total).toBe(pts);
    }
  });
});

describe.each([2, 4, 10])("Spectrum: a whole match with %i players", (n) => {
  it("four rounds, the clue-giver rotates through the seat order, the guess phase ends early when all are in, and the team total adds up", () => {
    const s = start(n, 20 + n);
    expect(s.phase).toBe("clue");
    expect(spectrumModule.phase(s)).toEqual({ key: "r1:clue", kind: "clue" });
    let t = T0;
    let expected = 0;
    const givers: string[] = [];
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) {
      expect(s.round).toBe(r);
      givers.push(giver(s));
      expect(guessers(s)).toEqual(s.order.filter((p) => p !== giver(s)));
      const target = cur(s).target;
      const values = guessers(s).map((_, i) => Math.max(0, Math.min(100, target - 3 + i * 2)));
      expected += spectrumPoints(Math.abs(spectrumAggregate(values)! - target));
      t = playRound(s, t + 1000, values);
    }
    expect(givers).toEqual(Array.from({ length: SPECTRUM_ROUNDS }, (_, i) => s.order[i % n]));
    expect(s.end).toBe("completed");
    expect(s.phase).toBe("finished");
    expect(spectrumModule.phase(s)).toBeNull();
    expect(spectrumModule.finished(s, ctx(s, t))).toBe(true);
    expect(s.total).toBe(expected);
    // One team score for everyone, never an individual winner.
    expect(new Set(Object.values(spectrumModule.scores(s, s.order)))).toEqual(new Set([expected]));
    expect(spectrumTeamResult(s)).toMatchObject({ total: expected, max: 40, end: "completed" });
    expect(spectrumTeamResult(s).rounds).toHaveLength(4);
    // Everyone did their part in every round.
    const part = spectrumModule.participation(s, s.order);
    for (const p of s.order) expect(part.participation[p]).toMatchObject({ done: 4, of: 4, finished: true });
    expect(part).toMatchObject({ completedUnits: 4, totalUnits: 4 });
    expect(spectrumModule.anyAction(s)).toBe(true);
  });

  it("nobody acts (everyone disconnected): every round skips on its own clock, roles never change, the match still ends", () => {
    const s = start(n, 40 + n);
    const givers: string[] = [];
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) {
      givers.push(giver(s));
      expire(s, dueAt(s)); // no clue in time
      expect(cur(s).outcome).toMatchObject({ reason: "no-clue", points: 0, aggregate: null });
      expire(s, dueAt(s)); // the reveal
    }
    expect(givers).toEqual(Array.from({ length: SPECTRUM_ROUNDS }, (_, i) => s.order[i % n]));
    expect(s).toMatchObject({ end: "completed", total: 0 });
    expect(Object.keys(s.satOut)).toEqual([]); // being away never made anyone sit out
    expect(spectrumModule.anyAction(s)).toBe(false);
  });
});

describe("Spectrum rules: missing clues, missing guesses, partial guesses", () => {
  it("a clue that never comes skips the round for 0 and goes to the reveal; nothing is invented", () => {
    const s = start(3, 5);
    const g = giver(s);
    expire(s, dueAt(s));
    expect(s.phase).toBe("reveal");
    expect(cur(s)).toMatchObject({ clue: null, outcome: { reason: "no-clue", points: 0, aggregate: null, distance: null, guesses: 0 } });
    expire(s, dueAt(s));
    expect(giver(s)).not.toBe(g); // the next round moves on
  });

  it("a clue but no guesses scores 0 with no team guess", () => {
    const s = start(4, 6);
    clue(s, T0 + 10);
    expire(s, dueAt(s));
    expect(cur(s).outcome).toMatchObject({ reason: "no-guesses", aggregate: null, points: 0, guesses: 0 });
  });

  it("only the guesses received count when time runs out (one player connected)", () => {
    const s = start(4, 8);
    cur(s).target = 30;
    clue(s, T0 + 10);
    guess(s, guessers(s)[0]!, 33, T0 + 11);
    expect(s.phase).toBe("guess");
    expire(s, dueAt(s));
    expect(cur(s).outcome).toMatchObject({ reason: "scored", aggregate: 33, distance: 3, points: 10, guesses: 1 });
  });
});

describe("Spectrum: sitting out", () => {
  it("the clue-giver sits out before the clue: the round is skipped for 0; they never give or guess again", () => {
    const s = start(4, 9);
    const g = giver(s);
    expect(spectrumModule.abstain(s, g, ctx(s, T0 + 5))).toEqual({ ok: true, wholeGameAbstain: true });
    expect(cur(s).outcome).toMatchObject({ reason: "giver-left", points: 0 });
    expect(s.phase).toBe("reveal");
    for (let r = 1; r < SPECTRUM_ROUNDS; r++) {
      expire(s, dueAt(s));
      expect(giver(s)).not.toBe(g);
      expect(guessers(s)).not.toContain(g);
    }
    expect(spectrumModule.intent(s, g, "spectrum-guess", { round: s.round + 1, value: 50 }, ctx(s, T0))).toEqual({ ok: false, reason: "SAT_OUT" });
  });

  it("the clue-giver sits out after the clue: the round carries on and still scores", () => {
    const s = start(4, 10);
    cur(s).target = 60;
    clue(s, T0 + 1);
    const g = giver(s);
    spectrumModule.abstain(s, g, ctx(s, T0 + 2));
    expect(s.phase).toBe("guess");
    for (const x of guessers(s)) guess(s, x, 60, T0 + 3);
    expect(cur(s).outcome).toMatchObject({ reason: "scored", points: 10 });
  });

  it("a guesser sits out: no longer required (the phase ends when the rest are in); a guess already sent stays and counts", () => {
    const s = start(4, 12);
    cur(s).target = 40;
    clue(s, T0 + 1);
    const [a, b, c] = guessers(s) as [string, string, string];
    guess(s, a, 40, T0 + 2);
    spectrumModule.abstain(s, a, ctx(s, T0 + 3)); // a's guess stays
    guess(s, b, 44, T0 + 4);
    expect(s.phase).toBe("guess");
    spectrumModule.abstain(s, c, ctx(s, T0 + 5)); // c was the last one missing
    expect(s.phase).toBe("reveal");
    expect(cur(s).outcome).toMatchObject({ aggregate: 42, guesses: 2, points: 10 });
  });

  it("fewer than two still taking part: the match finishes cleanly with what the team earned; the unrevealed round scores nothing", () => {
    const s = start(3, 13);
    cur(s).target = 50;
    clue(s, T0 + 1);
    for (const x of guessers(s)) guess(s, x, 50, T0 + 2);
    expect(s.total).toBe(10);
    expire(s, dueAt(s)); // round 2 starts
    clue(s, T0 + 30_000);
    const leaving = s.order.filter((p) => p !== giver(s));
    spectrumModule.abstain(s, leaving[0]!, ctx(s, T0 + 30_001));
    expect(s.end).toBeNull();
    spectrumModule.abstain(s, leaving[1]!, ctx(s, T0 + 30_002));
    expect(s).toMatchObject({ end: "too-few-players", phase: "finished", total: 10 });
    expect(s.rounds[1]!.outcome).toBeNull();
    expect(spectrumModule.phase(s)).toBeNull();
    expect(spectrumTeamResult(s)).toMatchObject({ total: 10, end: "too-few-players" });
    expect(spectrumTeamResult(s).rounds).toHaveLength(1);
  });

  it("two players: one sits out and the match ends at once", () => {
    const s = start(2, 14);
    spectrumModule.abstain(s, s.order[1]!, ctx(s, T0 + 1));
    expect(s).toMatchObject({ end: "too-few-players", total: 0 });
  });

  it("sitting out during a reveal changes nothing about that round; the next round leaves them out", () => {
    const s = start(3, 15);
    playRoundStartOnly(s);
    const before = JSON.stringify(cur(s).outcome);
    const leaver = s.order.find((p) => p !== giver(s))!;
    spectrumModule.abstain(s, leaver, ctx(s, T0 + 100));
    expect(JSON.stringify(cur(s).outcome)).toBe(before);
    expect(spectrumModule.abstain(s, leaver, ctx(s, T0 + 101))).toEqual({ ok: false, reason: "ALREADY_ABSTAINED" });
    expire(s, dueAt(s));
    expect([giver(s), ...guessers(s)]).not.toContain(leaver);
  });
});

/**
 * The team result (6811445149 §1): spectrumTeamResult is the authoritative
 * cooperative result. scores() is only a compatibility representation: the
 * same earned total copied to every ORIGINAL roster player, those who sat
 * out included. The copies must never be summed or read as individual
 * achievement, so the team result names nobody.
 */
function expectTeamResult(s: SpectrumState, total: number, end: string, revealed: number): void {
  const result = spectrumTeamResult(s);
  expect(result).toMatchObject({ total, max: SPECTRUM_MAX_POINTS, end });
  expect(result.total).toBe(s.total);
  expect(result.rounds).toHaveLength(revealed);
  expect(result.rounds.reduce((a, r) => a + r.points, 0)).toBe(total); // the rounds add up to the one total
  expect(Object.keys(result).sort()).toEqual(["end", "max", "rounds", "total"]);
  for (const r of result.rounds) expect(Object.keys(r).sort()).toEqual(["aggregate", "distance", "guesses", "pairId", "points", "reason", "roundNo", "target"]);
  const json = JSON.stringify(result);
  for (const p of s.order) expect(json).not.toContain(`"${p}"`); // no player is credited with anything
  const copies = spectrumModule.scores(s, s.order);
  expect(Object.keys(copies)).toEqual(s.order); // every original roster player
  for (const p of s.order) expect(copies[p]).toBe(total); // sat-out players too: the same copy
  const summed = Object.values(copies).reduce((a, b) => a + b, 0);
  expect(summed).toBe(s.order.length * total); // summing the copies would overcount n-fold: never the team's result
  if (total > 0 && s.order.length > 1) expect(summed).not.toBe(result.total);
}

/** A round where every guess lands on the target: 10 points. */
function playPerfectRound(s: SpectrumState, t: number): number {
  const target = cur(s).target;
  return playRound(s, t, guessers(s).map(() => target));
}

describe.each([2, 4, 10])("Spectrum team result with %i players (6811445149)", (n) => {
  it("a completed match: one total, the same copy for everyone (a sat-out player too), no individual credit", () => {
    const s = start(n, 60 + n);
    let t = playPerfectRound(s, T0 + 1000);
    const leaver = n > 2 ? s.order[n - 1]! : null; // with 2 players, sitting out ends the match (the next test)
    if (leaver) expect(spectrumModule.abstain(s, leaver, ctx(s, t + 1))).toEqual({ ok: true, wholeGameAbstain: true });
    for (let r = 1; r < SPECTRUM_ROUNDS; r++) t = playPerfectRound(s, t + 1000);
    expect(s).toMatchObject({ end: "completed", phase: "finished", total: 40 });
    if (leaver) expect(s.satOut[leaver]).toBe(1);
    expectTeamResult(s, 40, "completed", 4);
  });

  it("a partial ending (fewer than two left): what was earned, copied to everyone who started; the unrevealed round counts for nothing", () => {
    const s = start(n, 70 + n);
    const t = playPerfectRound(s, T0 + 1000);
    expect(clue(s, t + 1000)).toMatchObject({ ok: true }); // round 2 is under way
    const keeper = giver(s);
    const leaving = s.order.filter((p) => p !== keeper);
    leaving.forEach((p, i) => {
      expect(s.end).toBeNull();
      expect(spectrumModule.abstain(s, p, ctx(s, t + 1001 + i))).toEqual({ ok: true, wholeGameAbstain: true });
    });
    expect(s).toMatchObject({ end: "too-few-players", phase: "finished", total: 10 });
    expect(Object.keys(s.satOut)).toHaveLength(n - 1);
    expectTeamResult(s, 10, "too-few-players", 1);
  });

  it("a match that ends before anything is earned: zero for the team, zero copies, nothing revealed", () => {
    const s = start(n, 80 + n);
    for (const p of s.order.slice(1)) spectrumModule.abstain(s, p, ctx(s, T0 + 1));
    expect(s).toMatchObject({ end: "too-few-players", total: 0 });
    expectTeamResult(s, 0, "too-few-players", 0);
  });
});

/** Drive round 1 to its reveal (a clue and one guess each). */
function playRoundStartOnly(s: SpectrumState): void {
  clue(s, T0 + 1);
  for (const x of guessers(s)) guess(s, x, 50, T0 + 2);
  expect(s.phase).toBe("reveal");
}

describe("Spectrum: every refusal changes nothing", () => {
  function refused(s: SpectrumState, who: string, action: string, payload: Json, reason: string): void {
    const before = snapshot(s);
    expect(spectrumModule.intent(s, who, action, payload, ctx(s, T0 + 1))).toEqual({ ok: false, reason });
    expect(s).toEqual(before);
  }

  it("injected targets, points or scores are refused outright", () => {
    const s = start(3, 21);
    refused(s, giver(s), "spectrum-clue", { round: 1, text: "steam", target: 50 }, "INVALID_PAYLOAD");
    refused(s, giver(s), "spectrum-clue", { round: 1, text: "steam", points: 10 }, "INVALID_PAYLOAD");
    clue(s, T0 + 1);
    const g = guessers(s)[0]!;
    refused(s, g, "spectrum-guess", { round: 1, value: 50, score: 40 }, "INVALID_PAYLOAD");
    refused(s, g, "spectrum-guess", { round: 1, value: 50, target: 50 }, "INVALID_PAYLOAD");
    refused(s, g, "spectrum-guess", { round: 1, value: 50, aggregate: 50 }, "INVALID_PAYLOAD");
    refused(s, g, "spectrum-guess", { round: "1", value: 50 }, "INVALID_PAYLOAD");
    refused(s, g, "spectrum-guess", { value: 50 }, "INVALID_PAYLOAD");
    // The client's own phase key is allowed (the room checks it).
    expect(spectrumModule.intent(s, g, "spectrum-guess", { round: 1, value: 50, phaseKey: "r1:guess" }, ctx(s, T0 + 2))).toMatchObject({ ok: true });
  });

  it("the wrong actor: a guesser can't give the clue, the clue-giver can't guess, an outsider can't do either", () => {
    const s = start(3, 22);
    refused(s, guessers(s)[0]!, "spectrum-clue", { round: 1, text: "steam" }, "NOT_CLUE_GIVER");
    refused(s, "late-joiner", "spectrum-clue", { round: 1, text: "steam" }, "NOT_IN_GAME");
    clue(s, T0 + 1);
    refused(s, giver(s), "spectrum-guess", { round: 1, value: 50 }, "GIVER_CANNOT_GUESS");
    refused(s, "late-joiner", "spectrum-guess", { round: 1, value: 50 }, "NOT_IN_GAME");
    refused(s, giver(s), "spectrum-hack", { round: 1 }, "UNKNOWN_ACTION");
  });

  it("a stale round or the wrong phase: refused, whatever the content", () => {
    const s = start(3, 23);
    refused(s, giver(s), "spectrum-clue", { round: 2, text: "steam" }, "STALE_ROUND");
    refused(s, guessers(s)[0]!, "spectrum-guess", { round: 1, value: 50 }, "WRONG_PHASE"); // guessing before the clue
    clue(s, T0 + 1);
    refused(s, giver(s), "spectrum-clue", { round: 1, text: "a second clue" }, "WRONG_PHASE"); // a duplicate clue
    for (const x of guessers(s)) guess(s, x, 50, T0 + 2);
    refused(s, guessers(s)[0]!, "spectrum-guess", { round: 1, value: 60 }, "WRONG_PHASE"); // during the reveal
    expire(s, dueAt(s));
    refused(s, s.rounds[1]!.required[0]!, "spectrum-guess", { round: 1, value: 60 }, "STALE_ROUND"); // last round's send
  });

  it("a duplicate guess: refused, the first one stands", () => {
    const s = start(4, 24);
    clue(s, T0 + 1);
    const g = guessers(s)[0]!;
    guess(s, g, 30, T0 + 2);
    refused(s, g, "spectrum-guess", { round: 1, value: 80 }, "ALREADY_GUESSED");
    expect(cur(s).guesses[g]).toBe(30);
  });

  it("invalid guesses: not a whole number from 0 to 100", () => {
    const s = start(3, 25);
    clue(s, T0 + 1);
    const g = guessers(s)[0]!;
    for (const v of [101, -1, 50.5, "50", Number.NaN, Number.POSITIVE_INFINITY, null, true]) refused(s, g, "spectrum-guess", { round: 1, value: v as unknown }, "INVALID_GUESS");
    for (const v of [0, 100]) {
      const t = start(3, 25);
      clue(t, T0 + 1);
      expect(spectrumModule.intent(t, guessers(t)[0]!, "spectrum-guess", { round: 1, value: v }, ctx(t, T0 + 2))).toMatchObject({ ok: true });
    }
  });

  it("invalid clues: empty or blank, too long, not text; a clue is trimmed and its spaces collapsed", () => {
    const s = start(3, 26);
    for (const t of ["", "   ", "\t\n ", "\u0000\u0007", "x".repeat(SPECTRUM_CLUE_MAX + 1), "ቡ".repeat(SPECTRUM_CLUE_MAX + 1), 42, null, ["tea"]]) refused(s, giver(s), "spectrum-clue", { round: 1, text: t as unknown }, "INVALID_CLUE");
    expect(cleanClue("  a   cup\tof\n tea  ")).toBe("a cup of tea");
    expect(cleanClue("x".repeat(SPECTRUM_CLUE_MAX))).toBe("x".repeat(SPECTRUM_CLUE_MAX));
    expect(cleanClue("tea\u0000time")).toBe("tea time");
    expect(clue(s, T0 + 1, "  a   cup of tea ")).toMatchObject({ ok: true });
    expect(cur(s).clue).toBe("a cup of tea");
  });

  it("clues may contain digits and any language: the limit is 80 code points, not bytes (6811445149)", () => {
    for (const ok of ["a 10-minute walk", "about 70", "7 up", "١٢ minutes", "café au lait", "ቡና በጣም ሞቃት", "🌶️ chilli", "ቡ".repeat(SPECTRUM_CLUE_MAX), "é".repeat(SPECTRUM_CLUE_MAX)]) {
      const s = start(3, 28);
      expect(spectrumModule.intent(s, giver(s), "spectrum-clue", { round: 1, text: ok }, ctx(s, T0 + 1)), ok).toMatchObject({ ok: true, result: { phase: "guess" } });
      expect(cur(s).clue).toBe(ok);
    }
    expect(new TextEncoder().encode("ቡ".repeat(SPECTRUM_CLUE_MAX)).length).toBeGreaterThan(SPECTRUM_CLUE_MAX); // more bytes than the limit, still allowed
  });

  it("after the end, nothing is accepted", () => {
    const s = start(2, 27);
    spectrumModule.abstain(s, s.order[0]!, ctx(s, T0 + 1));
    refused(s, s.order[1]!, "spectrum-clue", { round: s.round + 1, text: "steam" }, "ALREADY_FINISHED");
    expect(spectrumModule.abstain(s, s.order[1]!, ctx(s, T0 + 2))).toEqual({ ok: false, reason: "ALREADY_FINISHED" });
  });
});

describe("Spectrum: deadlines are processed exactly once, from the original instants", () => {
  it("a repeated expiry at the same instant, or an early one, changes nothing; the exact deadline closes the phase", () => {
    const s = start(3, 30);
    clue(s, T0 + 1000);
    const due = dueAt(s); // the guess phase started at the clue's instant
    expect(due).toBe(T0 + 1000 + SPECTRUM_PHASE_MS.guess);
    const before = snapshot(s);
    expire(s, due - 1);
    expect(s).toEqual(before);
    expire(s, due);
    expect(s.phase).toBe("reveal");
    expect(s.phaseStartedAt).toBe(due); // the reveal starts at the deadline instant, not later
    const after = snapshot(s);
    expire(s, due); // processed again at the same instant
    expect(s).toEqual(after);
  });

  it("the time scale (tests' fast clocks) applies the same way", () => {
    const s = start(3, 31);
    clue(s, T0);
    expire(s, T0 + Math.round(SPECTRUM_PHASE_MS.guess * 0.5) - 1, 0.5);
    expect(s.phase).toBe("guess");
    expire(s, T0 + Math.round(SPECTRUM_PHASE_MS.guess * 0.5), 0.5);
    expect(s.phase).toBe("reveal");
  });

  it("catch-up after a restart walks the original deadlines: the same state as a clock that never stopped; bounded; idempotent", () => {
    // The room's tick: every deadline passed by `now` is processed at its own instant (strictly after it).
    const catchUp = (s: SpectrumState, now: number): number => {
      let steps = 0;
      while (!s.end && dueAt(s) < now && steps < 100) { expire(s, dueAt(s)); steps++; }
      return steps;
    };
    const s = start(4, 32);
    clue(s, T0 + 2000);
    guess(s, guessers(s)[0]!, 55, T0 + 3000);
    const saved = JSON.stringify(s);
    // A: a server that ticked every second for 10 minutes.
    for (let t = T0 + 4000; t <= T0 + 600_000; t += 1000) catchUp(s, t);
    // B: down the whole time, restored from the save, one catch-up.
    const b = JSON.parse(saved) as SpectrumState;
    const steps = catchUp(b, T0 + 600_000);
    expect(b).toEqual(s);
    expect(b.end).toBe("completed");
    expect(steps).toBeLessThanOrEqual(SPECTRUM_ROUNDS * 3);
    expect(catchUp(b, T0 + 600_000)).toBe(0);
    // Every phase started exactly at the previous deadline: round 2's clue at round 1's reveal deadline, and so on.
    const r1Guess = T0 + 2000;
    const r1Reveal = r1Guess + SPECTRUM_PHASE_MS.guess;
    const r2Clue = r1Reveal + SPECTRUM_PHASE_MS.reveal;
    expect(b.rounds[0]!.outcome).toMatchObject({ reason: "scored", guesses: 1 });
    expect(b.rounds[1]!.outcome).toMatchObject({ reason: "no-clue" });
    // The end came at the last reveal's deadline: four rounds of (clue/guess/reveal) from those instants.
    const r2Reveal = r2Clue + SPECTRUM_PHASE_MS.clue;
    const r3Clue = r2Reveal + SPECTRUM_PHASE_MS.reveal;
    const r4Clue = r3Clue + SPECTRUM_PHASE_MS.clue + SPECTRUM_PHASE_MS.reveal;
    expect(b.phaseStartedAt).toBe(r4Clue + SPECTRUM_PHASE_MS.clue + SPECTRUM_PHASE_MS.reveal);
  });
});

describe("Spectrum privacy: every role, every phase, with canaries", () => {
  // Unmistakable values: none of them can appear by accident in these views.
  const SEED = 987_654_321;
  const TARGETS = [73, 61, 37, 29];
  const GUESS_A = 44, GUESS_B = 58; // round 1's team guess: 51
  const num = (n: number) => new RegExp(`[:\\[,]${n}[,\\]}]`);

  function setup() {
    const s = spectrumModule.init({ players: ["host", "amina", "baraka", "chausiku"], seed: SEED });
    s.rounds.forEach((r, i) => { r.target = TARGETS[i]!; });
    // Make the host a guesser in round 1 (the host has no special view).
    if (s.rounds[0]!.giver === "host") { s.order = [...s.order.filter((p) => p !== "host"), "host"]; s.rounds[0]!.giver = s.order[0]!; s.rounds[0]!.required = s.order.slice(1); }
    return s;
  }
  const views = (s: SpectrumState) => ({
    public: spectrumModule.publicView(s, { now: 1, scale: 1 }),
    lateJoiner: spectrumModule.playerView(s, "late-joiner", { now: 1, scale: 1 }),
    ...Object.fromEntries(s.order.map((p) => [p, spectrumModule.playerView(s, p, { now: 1, scale: 1 })])),
  }) as Record<string, Json>;
  const futurePairs = (s: SpectrumState) => s.rounds.slice(s.round + 1).map((r) => SPECTRUM_PAIRS.find((p) => p.id === r.pairId)!);

  function noFutureSecrets(s: SpectrumState, all: Record<string, Json>): void {
    for (const [who, v] of Object.entries(all)) {
      const text = JSON.stringify(v);
      expect(text, who).not.toContain(String(SEED));
      for (const t of TARGETS.slice(s.phase === "finished" ? 4 : s.round + 1)) expect(text, `${who} future target ${t}`).not.toMatch(num(t));
      for (const p of futurePairs(s)) {
        expect(text, `${who} future pair`).not.toContain(p.id);
        expect(text, `${who} future pair`).not.toContain(p.meaning);
      }
      expect(text, who).not.toContain("required");
      expect(text, who).not.toContain("guesses\":{");
    }
  }

  it("the canaries are really in the server's state (so their absence from views means something)", () => {
    const s = setup();
    const text = JSON.stringify(s);
    expect(text).toContain(String(SEED));
    for (const t of TARGETS) expect(text).toMatch(num(t));
    expect(futurePairs(s).length).toBe(3);
  });

  it("clue phase: only the clue-giver sees the target; the host as a guesser, spectators and late joiners don't", () => {
    const s = setup();
    const g = giver(s);
    const all = views(s);
    expect((all[g]!["me"] as Json)["target"]).toBe(73); // the positive path
    expect((all[g]!["me"] as Json)["role"]).toBe("giver");
    expect((all["host"]!["me"] as Json)["role"]).toBe("guesser");
    for (const [who, v] of Object.entries(all)) if (who !== g) expect(JSON.stringify(v), who).not.toMatch(num(73));
    expect(all.public).toEqual(all.lateJoiner);
    noFutureSecrets(s, all);
  });

  it("guess phase: each guesser sees only their own guess; others see counts; nobody sees the target but the clue-giver", () => {
    const s = setup();
    clue(s, T0 + 1);
    const [a, b] = guessers(s) as [string, string];
    guess(s, a, GUESS_A, T0 + 2);
    guess(s, b, GUESS_B, T0 + 3);
    const all = views(s);
    expect((all[a]!["me"] as Json)["myGuess"]).toBe(GUESS_A);
    expect(JSON.stringify(all[a])).not.toMatch(num(GUESS_B));
    expect((all[b]!["me"] as Json)["myGuess"]).toBe(GUESS_B);
    expect(JSON.stringify(all[b])).not.toMatch(num(GUESS_A));
    for (const who of ["public", "lateJoiner", giver(s), s.order.find((p) => p !== giver(s) && p !== a && p !== b)!]) {
      expect(JSON.stringify(all[who]), who).not.toMatch(num(GUESS_A));
      expect(JSON.stringify(all[who]), who).not.toMatch(num(GUESS_B));
    }
    expect((all.public!["current"] as Json)).toMatchObject({ guessesIn: 2, guessesNeeded: 3, clue: "a warm bath" });
    expect((all[giver(s)]!["me"] as Json)["target"]).toBe(73);
    for (const [who, v] of Object.entries(all)) if (who !== giver(s)) expect(JSON.stringify(v), who).not.toMatch(num(73));
    noFutureSecrets(s, all);
  });

  it("the reveal: the target and the team's guess are public; individual guesses never are; future rounds stay hidden", () => {
    const s = setup();
    clue(s, T0 + 1);
    const gs = [...guessers(s)];
    guess(s, gs[0]!, GUESS_A, T0 + 2);
    guess(s, gs[1]!, GUESS_B, T0 + 3);
    spectrumModule.abstain(s, gs[2]!, ctx(s, T0 + 4)); // the last required one leaves: the reveal starts
    expect(s.phase).toBe("reveal");
    const all = views(s);
    const revealed = (all.public!["revealed"] as Json[])[0]!;
    expect(revealed).toMatchObject({ roundNo: 1, target: 73, aggregate: 51, distance: 22, points: 0, guesses: 2, clue: "a warm bath" });
    for (const [who, v] of Object.entries(all)) {
      const text = JSON.stringify(v);
      if (who !== gs[0]) expect(text, who).not.toMatch(num(GUESS_A));
      if (who !== gs[1]) expect(text, who).not.toMatch(num(GUESS_B));
    }
    noFutureSecrets(s, all);
  });

  it("the next round: the past target is in the revealed history for everyone; the new target is the new clue-giver's alone", () => {
    const s = setup();
    playRoundStartOnly(s);
    expire(s, dueAt(s));
    const all = views(s);
    const g2 = giver(s);
    for (const v of Object.values(all)) expect((v["revealed"] as Json[])[0]).toMatchObject({ target: 73 });
    expect((all[g2]!["me"] as Json)["target"]).toBe(61);
    for (const [who, v] of Object.entries(all)) if (who !== g2) expect(JSON.stringify(v), who).not.toMatch(num(61));
    noFutureSecrets(s, all);
  });

  it("finished: four revealed rounds, no individual guess anywhere; a sat-out player and the views after a reload agree", () => {
    const s = setup();
    for (let r = 0; r < 4; r++) {
      clue(s, T0 + r * 100_000);
      const gs = [...guessers(s)];
      gs.forEach((g, i) => guess(s, g, [GUESS_A, GUESS_B, 12][i]!, T0 + r * 100_000 + 1 + i));
      expire(s, dueAt(s));
    }
    expect(s.end).toBe("completed");
    const all = views(s);
    for (const v of Object.values(all)) {
      expect((v["revealed"] as Json[]).map((x) => x["target"])).toEqual(TARGETS);
      expect(JSON.stringify(v)).not.toContain("myGuess");
    }
    // A reconnect gets the same views from the saved state.
    const restored = JSON.parse(JSON.stringify(s)) as SpectrumState;
    expect(views(restored)).toEqual(all);
    expect(String(JSON.stringify(all))).not.toContain(String(SEED));
  });

  it("a player who sat out sees what spectators see (no target, even when they would have been the clue-giver)", () => {
    const s = setup();
    const g = giver(s);
    spectrumModule.abstain(s, g, ctx(s, T0 + 1)); // left before the clue: the round is skipped and revealed
    expire(s, dueAt(s));
    const v = spectrumModule.playerView(s, g, { now: 1, scale: 1 }) as Json;
    expect((v["me"] as Json)).toMatchObject({ role: "watching", satOut: true });
    expect((v["me"] as Json)["target"]).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(num(61));
  });
});

describe("Spectrum is not in the product yet (foundation only)", () => {
  it("not registered as a module, a game, a manifest or a lifecycle policy; its actions reach nothing", () => {
    expect(moduleFor("spectrum")).toBeUndefined();
    expect(moduleForAction("spectrum-clue")).toBeUndefined();
    expect(moduleForAction("spectrum-guess")).toBeUndefined();
    expect(GAME_REGISTRY.some((g) => g.id === "spectrum")).toBe(false);
    expect(GAME_MANIFESTS.some((m) => m.id === "spectrum")).toBe(false);
    expect(() => policyFor("spectrum")).toThrow();
  });
});
