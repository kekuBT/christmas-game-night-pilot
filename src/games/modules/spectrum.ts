/**
 * Spectrum (Stage 9.2 foundation): an original cooperative guessing game.
 * Spec: docs/stage9/stage92.md. NOT registered in GAME_MODULES, the
 * registry, the manifest or the lifecycle policy: the next slice wires it.
 *
 * Four rounds. Each round shows a two-ended scale (0–100) with a secret
 * target (10–90) that only the round's clue-giver sees. The clue-giver sends
 * a short clue; everyone else places a guess; the team's guess is the median
 * of the guesses received, and the closer it is, the more points the TEAM
 * earns (10/7/4/0, max 40). One shared result: no individual winner.
 *
 * Phases: clue (60 s) → guess (45 s) → reveal (8 s). An accepted clue starts
 * the guessing at once; the last required guess starts the reveal at once.
 * The module records when each phase started (the event's instant, never a
 * wall clock) and expires a phase only when its time is really up, so a
 * repeated or early expiry does nothing; catch-up after a restart walks the
 * original deadlines.
 *
 * Privacy: before a reveal, the target is the clue-giver's alone; nobody
 * ever sees anyone else's guess (only counts, and the team's guess at the
 * reveal); future rounds, the seed and the pack are server-only.
 */
import type { PhaseKind } from "../../server/lifecycle.js";
import { SPECTRUM_PACK_VERSION, SPECTRUM_PAIRS, type SpectrumPair } from "./packs/spectrum-pairs.js";
import { moduleRng, seededShuffle, type GameModule, type ModuleContext } from "./types.js";
import { SPECTRUM_PHASE_MS } from "./spectrum-timing.js";
import type { TeamResult } from "../../shared/teamResult.js";

export const SPECTRUM_RULES_VERSION = 1;
export const SPECTRUM_ROUNDS = 4;
/** One source for the phase durations, shared with the room's lifecycle policy (spectrum-timing.ts). */
export { SPECTRUM_PHASE_MS };
export const SPECTRUM_CLUE_MAX = 80;
export const SPECTRUM_TARGET = { min: 10, max: 90 } as const;
/** Points for the team, by distance from the target (first band that fits). */
export const SPECTRUM_BANDS: readonly { within: number; points: number }[] = [
  { within: 5, points: 10 },
  { within: 10, points: 7 },
  { within: 20, points: 4 },
];
export const SPECTRUM_MAX_POINTS = SPECTRUM_ROUNDS * SPECTRUM_BANDS[0]!.points;

export type SpectrumPhase = "clue" | "guess" | "reveal" | "finished";
/** Why a round scored what it did. */
export type SpectrumReason = "scored" | "no-clue" | "giver-left" | "no-guesses";

export interface SpectrumOutcome {
  reason: SpectrumReason;
  target: number;
  /** The team's guess (median); null when there were no guesses. */
  aggregate: number | null;
  distance: number | null;
  points: number;
  /** How many guesses were received (never who sent which). */
  guesses: number;
}

export interface SpectrumRound {
  pairId: string;
  target: number;
  /** Set when the round starts. */
  giver: string | null;
  clue: string | null;
  /** Private: each guesser's own guess. */
  guesses: Record<string, number>;
  /** Players who must still be able to guess this round (shrinks when someone sits out). */
  required: string[];
  outcome: SpectrumOutcome | null;
}

export interface SpectrumState {
  rulesVersion: number;
  packVersion: string;
  seed: number;
  /** Seeded seat order (the clue-giver rotates through it). */
  order: string[];
  /** Who sat out, and in which round (0-based). */
  satOut: Record<string, number>;
  rounds: SpectrumRound[];
  /** The current round (0-based). */
  round: number;
  phase: SpectrumPhase;
  /** When the current phase started (server ms); null until the first event (play start is the room's). */
  phaseStartedAt: number | null;
  total: number;
  end: null | "completed" | "too-few-players";
}

const pairById = (id: string): SpectrumPair => {
  const p = SPECTRUM_PAIRS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown Spectrum pair ${id}`);
  return p;
};
const active = (s: SpectrumState) => s.order.filter((p) => s.satOut[p] === undefined);
const current = (s: SpectrumState) => s.rounds[s.round]!;

/** The team's guess: the median; with an even count, the mean of the middle two, rounded half up. */
export function spectrumAggregate(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  if (v.length % 2 === 1) return v[mid]!;
  return Math.floor((v[mid - 1]! + v[mid]!) / 2 + 0.5);
}

/** The team's points for a distance from the target. */
export function spectrumPoints(distance: number): number {
  for (const b of SPECTRUM_BANDS) if (distance <= b.within) return b.points;
  return 0;
}

/**
 * A clue as kept: control characters removed, spaces collapsed, trimmed;
 * 1–80 Unicode code points. Null if not allowed. Digits are fine ("a
 * 10-minute walk"): "give a clue, not the target number" is a social rule
 * the briefing explains, not a filter (6811445149: a digit ban would also be
 * bypassed by spelling the number out).
 */
export function cleanClue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0 || [...cleaned].length > SPECTRUM_CLUE_MAX) return null;
  return cleaned;
}

/** The next player in seat order after `from` (or the first seat) who is still taking part. */
function nextGiver(s: SpectrumState, from: string | null): string | null {
  const live = active(s);
  if (live.length === 0) return null;
  if (from === null) return live[0]!;
  const i = s.order.indexOf(from);
  for (let k = 1; k <= s.order.length; k++) {
    const p = s.order[(i + k) % s.order.length]!;
    if (s.satOut[p] === undefined) return p;
  }
  return null;
}

function finish(s: SpectrumState, end: NonNullable<SpectrumState["end"]>, at: number | null): void {
  s.end = end;
  s.phase = "finished";
  s.phaseStartedAt = at;
}

/** Start round `i` (its pair and target were chosen at the start): a clue-giver and the guessers. */
function startRound(s: SpectrumState, i: number, at: number | null, previousGiver: string | null): void {
  if (active(s).length < 2) { finish(s, "too-few-players", at); return; }
  const r = s.rounds[i]!;
  const giver = nextGiver(s, previousGiver)!;
  r.giver = giver;
  r.required = active(s).filter((p) => p !== giver);
  s.round = i;
  s.phase = "clue";
  s.phaseStartedAt = at;
}

/** Close the round into its reveal: points from the guesses received (never invented). */
function toReveal(s: SpectrumState, at: number, skipped?: Exclude<SpectrumReason, "scored" | "no-guesses">): void {
  const r = current(s);
  const values = Object.values(r.guesses);
  if (skipped) {
    r.outcome = { reason: skipped, target: r.target, aggregate: null, distance: null, points: 0, guesses: values.length };
  } else {
    const aggregate = spectrumAggregate(values);
    if (aggregate === null) {
      r.outcome = { reason: "no-guesses", target: r.target, aggregate: null, distance: null, points: 0, guesses: 0 };
    } else {
      const distance = Math.abs(aggregate - r.target);
      r.outcome = { reason: "scored", target: r.target, aggregate, distance, points: spectrumPoints(distance), guesses: values.length };
    }
  }
  s.total += r.outcome.points;
  s.phase = "reveal";
  s.phaseStartedAt = at;
}

/** Guessing ends early once every player still required has guessed. */
function settleGuesses(s: SpectrumState, at: number): void {
  const r = current(s);
  if (s.phase === "guess" && r.required.every((p) => r.guesses[p] !== undefined)) toReveal(s, at);
}

/** Has the current phase's time really run out at `now`? (A repeated or early expiry is not.) */
function phaseIsDue(s: SpectrumState, ctx: ModuleContext): boolean {
  if (s.phase === "finished") return false;
  if (s.phaseStartedAt === null) return true; // the first phase: the room started its clock at play start
  return ctx.now >= s.phaseStartedAt + Math.round(SPECTRUM_PHASE_MS[s.phase] * ctx.scale);
}

const CLUE_KEYS = new Set(["round", "text", "phaseKey"]);
const GUESS_KEYS = new Set(["round", "value", "phaseKey"]);

/**
 * The single authoritative team result (9.2 spec §8; 9.3 §3): one total out
 * of 40, the revealed rounds (pair labels, clue, target, team guess, points,
 * a count of guesses) and the module's end reason. It names no player and
 * holds no individual guess. The room records it as `outcome.team`.
 */
export function spectrumTeamResult(s: SpectrumState): TeamResult {
  return {
    kind: "spectrum",
    total: s.total,
    max: SPECTRUM_MAX_POINTS,
    roundsPlanned: SPECTRUM_ROUNDS,
    end: s.end,
    rounds: s.rounds.filter((r) => r.outcome !== null).map((r, i) => {
      const p = pairById(r.pairId);
      const o = r.outcome!;
      return {
        roundNo: i + 1,
        pair: { left: p.left, right: p.right, meaning: p.meaning },
        clue: r.clue,
        reason: o.reason,
        target: o.target,
        aggregate: o.aggregate,
        distance: o.distance,
        points: o.points,
        guesses: o.guesses,
      };
    }),
  };
}

/** A round as anyone may see it once revealed (no individual guess, ever). */
function revealedRound(r: SpectrumRound, i: number) {
  const p = pairById(r.pairId);
  return {
    roundNo: i + 1,
    pair: { id: p.id, left: p.left, right: p.right, meaning: p.meaning },
    giver: r.giver,
    clue: r.clue,
    ...r.outcome!,
  };
}

function publicView(s: SpectrumState) {
  const r = s.phase === "finished" ? null : current(s);
  const p = r ? pairById(r.pairId) : null;
  return {
    rulesVersion: s.rulesVersion,
    rounds: SPECTRUM_ROUNDS,
    roundNo: s.round + 1,
    phase: s.phase,
    total: s.total,
    maxPoints: SPECTRUM_MAX_POINTS,
    order: s.order.map((id) => ({ id, satOut: s.satOut[id] !== undefined })),
    // The current round, before its reveal: the pair, the clue-giver and the clue; counts only.
    current: r && p && s.phase !== "reveal"
      ? { roundNo: s.round + 1, pair: { id: p.id, left: p.left, right: p.right, meaning: p.meaning }, giver: r.giver, clue: r.clue, guessesIn: Object.keys(r.guesses).length, guessesNeeded: r.required.length + Object.keys(r.guesses).filter((g) => !r.required.includes(g)).length }
      : null,
    // Every revealed round (the current one too, during its reveal).
    revealed: s.rounds.map((x, i) => (x.outcome ? revealedRound(x, i) : null)).filter((x) => x !== null),
    end: s.end,
  };
}

export const spectrumModule: GameModule<SpectrumState> = {
  id: "spectrum",
  actions: ["spectrum-clue", "spectrum-guess"],
  init({ players, seed }) {
    const rng = moduleRng(seed);
    const order = seededShuffle(players, rng);
    const pairs = seededShuffle(SPECTRUM_PAIRS, rng).slice(0, SPECTRUM_ROUNDS);
    const rounds: SpectrumRound[] = pairs.map((p) => ({
      pairId: p.id,
      target: SPECTRUM_TARGET.min + Math.floor(rng() * (SPECTRUM_TARGET.max - SPECTRUM_TARGET.min + 1)),
      giver: null,
      clue: null,
      guesses: {},
      required: [],
      outcome: null,
    }));
    const s: SpectrumState = {
      rulesVersion: SPECTRUM_RULES_VERSION,
      packVersion: SPECTRUM_PACK_VERSION,
      seed,
      order,
      satOut: {},
      rounds,
      round: 0,
      phase: "clue",
      phaseStartedAt: null,
      total: 0,
      end: null,
    };
    startRound(s, 0, null, null);
    return s;
  },
  intent(s, actorId, action, payload, ctx) {
    if (action !== "spectrum-clue" && action !== "spectrum-guess") return { ok: false, reason: "UNKNOWN_ACTION" };
    if (!s.order.includes(actorId)) return { ok: false, reason: "NOT_IN_GAME" };
    if (s.end) return { ok: false, reason: "ALREADY_FINISHED" };
    if (s.satOut[actorId] !== undefined) return { ok: false, reason: "SAT_OUT" };
    const allowed = action === "spectrum-clue" ? CLUE_KEYS : GUESS_KEYS;
    if (Object.keys(payload).some((k) => !allowed.has(k))) return { ok: false, reason: "INVALID_PAYLOAD" };
    const round = payload["round"];
    if (typeof round !== "number" || !Number.isInteger(round)) return { ok: false, reason: "INVALID_PAYLOAD" };
    if (round !== s.round + 1) return { ok: false, reason: "STALE_ROUND" };
    const r = current(s);
    if (action === "spectrum-clue") {
      if (s.phase !== "clue") return { ok: false, reason: "WRONG_PHASE" };
      if (r.giver !== actorId) return { ok: false, reason: "NOT_CLUE_GIVER" };
      const clue = cleanClue(payload["text"]);
      if (clue === null) return { ok: false, reason: "INVALID_CLUE" };
      r.clue = clue;
      s.phase = "guess";
      s.phaseStartedAt = ctx.now;
      settleGuesses(s, ctx.now);
      return { ok: true, result: { round, phase: s.phase } };
    }
    if (s.phase !== "guess") return { ok: false, reason: "WRONG_PHASE" };
    if (r.giver === actorId) return { ok: false, reason: "GIVER_CANNOT_GUESS" };
    if (r.guesses[actorId] !== undefined) return { ok: false, reason: "ALREADY_GUESSED" };
    if (!r.required.includes(actorId)) return { ok: false, reason: "NOT_A_GUESSER" };
    const value = payload["value"];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) return { ok: false, reason: "INVALID_GUESS" };
    r.guesses[actorId] = value;
    settleGuesses(s, ctx.now);
    return { ok: true, result: { round, phase: s.phase } };
  },
  abstain(s, actorId, ctx) {
    if (!s.order.includes(actorId)) return { ok: false, reason: "NOT_IN_GAME" };
    if (s.end) return { ok: false, reason: "ALREADY_FINISHED" };
    if (s.satOut[actorId] !== undefined) return { ok: false, reason: "ALREADY_ABSTAINED" };
    s.satOut[actorId] = s.round;
    // Fewer than two still taking part: finish with what the team earned (an unrevealed round scores nothing).
    if (active(s).length < 2) { finish(s, "too-few-players", ctx.now); return { ok: true, wholeGameAbstain: true }; }
    const r = current(s);
    if (s.phase === "clue" && r.giver === actorId) {
      toReveal(s, ctx.now, "giver-left");
    } else if (s.phase === "clue" || s.phase === "guess") {
      // No longer required to guess; a guess already sent stays (guesses can't be taken back).
      r.required = r.required.filter((p) => p !== actorId);
      settleGuesses(s, ctx.now);
    }
    return { ok: true, wholeGameAbstain: true };
  },
  phase: (s) => (s.end || s.phase === "finished" ? null : { key: `r${s.round + 1}:${s.phase}`, kind: s.phase as PhaseKind }),
  expirePhase(s, ctx) {
    if (s.end || !phaseIsDue(s, ctx)) return;
    if (s.phase === "clue") toReveal(s, ctx.now, "no-clue");
    else if (s.phase === "guess") toReveal(s, ctx.now);
    else if (s.phase === "reveal") {
      if (s.round + 1 >= SPECTRUM_ROUNDS) finish(s, "completed", ctx.now);
      else startRound(s, s.round + 1, ctx.now, current(s).giver);
    }
  },
  finished: (s) => s.end !== null,
  // A compatibility representation only (spec §8, 6811445149): the same team total copied to every original
  // roster player, sat-out players included. Never sum the copies or read them as individual achievement;
  // spectrumTeamResult is the result. A cooperative results branch is required before registration.
  scores: (s, players) => Object.fromEntries(players.map((p) => [p, s.total])),
  // Stage 9.3: the authoritative result the room records as outcome.team.
  teamResult: (s) => spectrumTeamResult(s),
  participation(s, players) {
    const started = s.rounds.slice(0, s.end ? s.rounds.filter((r) => r.giver !== null).length : s.round + 1);
    const participation = Object.fromEntries(players.map((p) => {
      let of = 0, done = 0, actions = 0;
      for (const r of started) {
        if (r.giver === p) { of++; if (r.clue !== null) { done++; actions++; } }
        else if (r.required.includes(p) || r.guesses[p] !== undefined) { of++; if (r.guesses[p] !== undefined) { done++; actions++; } }
      }
      return [p, { done, of, actions, finished: s.end !== null && s.satOut[p] === undefined }];
    }));
    return { participation, completedUnits: s.rounds.filter((r) => r.outcome !== null).length, totalUnits: SPECTRUM_ROUNDS };
  },
  anyAction: (s) => s.rounds.some((r) => r.clue !== null || Object.keys(r.guesses).length > 0),
  publicView: (s) => publicView(s),
  playerView(s, actorId) {
    const base = publicView(s);
    if (!s.order.includes(actorId)) return base;
    const r = s.phase === "finished" ? null : current(s);
    const role = !r || s.satOut[actorId] !== undefined ? "watching" : r.giver === actorId ? "giver" : r.required.includes(actorId) || r.guesses[actorId] !== undefined ? "guesser" : "watching";
    return {
      ...base,
      me: {
        role,
        satOut: s.satOut[actorId] !== undefined,
        // The clue-giver's own secret, for this round only, until its reveal shows it to everyone.
        ...(r && role === "giver" && (s.phase === "clue" || s.phase === "guess") ? { target: r.target } : {}),
        // A guesser's own guess, in this round only.
        ...(r && r.guesses[actorId] !== undefined ? { myGuess: r.guesses[actorId] } : {}),
      },
    };
  },
};
