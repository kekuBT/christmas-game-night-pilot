/**
 * Pattern Pulse (Stage 5, Practice-only): watch a short sequence of symbols,
 * then tap it back in order. Six rounds, three symbols up to eight.
 *
 * Each player moves at their own pace (the "game-deadline" model): you open
 * a round when you're ready, so a faster player can never cost a slower one
 * a round. The whole game still ends at its deadline.
 *
 * Fairness and privacy:
 *  - The server generates and checks every pattern. A round's pattern is
 *    made when that player opens it (from the server's secret seed, the
 *    player and the round) and is in that player's projection ONLY during
 *    their memorise window. It is never in the public projection, and a
 *    future round's pattern is never sent anywhere.
 *  - Everyone gets the same difficulty (same length, same six symbols, same
 *    windows) but their own sequence, so nobody can call out the answer.
 *  - Timing is server time: memorise for showMs, then answer within
 *    inputMs (+ a small network grace). A late answer scores 0.
 *
 * Practice scoring: 20 points for each symbol right from the start of the
 * sequence (the "correct run"), plus 50 for the whole sequence.
 */
import { moduleRng, type GameModule, type ModuleContext } from "./types.js";

/**
 * Stage 6.2: Pattern Pulse's rules version. A solo personal best compares
 * only with rounds under the same version, so bump it whenever the lengths,
 * the symbols, the windows or the scoring below change
 * (tests/stage62-solo-shelf.test.ts fingerprints them).
 */
export const PULSE_RULES_VERSION = 1;
export const PULSE_LENGTHS = [3, 4, 5, 6, 7, 8] as const;
export const PULSE_SYMBOLS = 6;
export const PULSE_POINTS = { perSymbol: 20, perfect: 50 } as const;
/** Memorise window (ms, before the test time scale). */
export const pulseShowMs = (len: number) => 1200 + 700 * len;
/** Answer window after the pattern hides (ms, before the scale). */
export const pulseInputMs = (len: number) => 12_000 + 1_500 * len;
/** Network grace on the answer deadline (real ms, never scaled). */
export const PULSE_GRACE_MS = 1_500;

export interface PulseResult { round: number; length: number; answer: number[] | null; correctRun: number; perfect: boolean; points: number; pattern: number[] }
export interface PulsePlayer {
  next: number;
  open?: { round: number; openedAt: number; showUntil: number; inputUntil: number };
  results: PulseResult[];
  done: boolean;
  satOut?: boolean;
}
export interface PulseState { seed: number; players: string[]; per: Record<string, PulsePlayer> }

/** A player's pattern for a round: deterministic from the secret seed, the player and the round. */
export function pulsePattern(seed: number, playerId: string, round: number): number[] {
  let h = seed >>> 0;
  for (const ch of `${playerId}:${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x9e3779b1) >>> 0;
  const rng = moduleRng(h);
  const len = PULSE_LENGTHS[round]!;
  const out: number[] = [];
  while (out.length < len) {
    const s = Math.floor(rng() * PULSE_SYMBOLS);
    if (s !== out.at(-1)) out.push(s); // no symbol twice in a row: each step is visible
  }
  return out;
}

export function pulseScore(pattern: readonly number[], answer: readonly number[] | null): { correctRun: number; perfect: boolean; points: number } {
  if (!answer) return { correctRun: 0, perfect: false, points: 0 };
  let run = 0;
  while (run < pattern.length && answer[run] === pattern[run]) run++;
  const perfect = run === pattern.length && answer.length === pattern.length;
  return { correctRun: run, perfect, points: run * PULSE_POINTS.perSymbol + (perfect ? PULSE_POINTS.perfect : 0) };
}

function close(s: PulseState, pid: string, p: PulsePlayer, answer: number[] | null): PulseResult {
  const o = p.open!;
  const pattern = pulsePattern(s.seed, pid, o.round);
  const r = { round: o.round, length: pattern.length, answer, ...pulseScore(pattern, answer), pattern };
  p.results.push(r);
  p.open = undefined;
  p.next = o.round + 1;
  if (p.next >= PULSE_LENGTHS.length) p.done = true;
  return r;
}

/** The instant an open round stops taking answers (its window plus the network grace). */
const closesAt = (o: NonNullable<PulsePlayer["open"]>) => o.inputUntil + PULSE_GRACE_MS;

/** An open round whose answer window has passed is closed as missed (0 points). */
function expire(s: PulseState, pid: string, p: PulsePlayer, now: number): void {
  if (p.open && now > closesAt(p.open)) close(s, pid, p, null);
}

export const pulseModule: GameModule<PulseState> = {
  id: "pattern-pulse",
  actions: ["pulse-open", "pulse-answer"],
  nonPlayingActions: ["pulse-open"],
  init({ players, seed }) {
    return { seed, players: [...players], per: Object.fromEntries(players.map((p) => [p, { next: 0, results: [], done: false }])) };
  },
  intent(s, actorId, action, payload, ctx: ModuleContext) {
    const p = s.per[actorId];
    if (!p) return { ok: false, reason: "NOT_IN_GAME" };
    expire(s, actorId, p, ctx.now);
    if (p.done) return { ok: false, reason: "ALREADY_FINISHED" };
    const round = payload["round"];
    if (typeof round !== "number" || !Number.isInteger(round)) return { ok: false, reason: "INVALID_PAYLOAD" };
    if (action === "pulse-open") {
      if (p.open && p.open.round === round) return { ok: true }; // asking again never restarts the clock
      if (p.open || round !== p.next) return { ok: false, reason: "WRONG_ROUND" };
      const len = PULSE_LENGTHS[round]!;
      const showUntil = ctx.now + Math.round(pulseShowMs(len) * ctx.scale);
      p.open = { round, openedAt: ctx.now, showUntil, inputUntil: showUntil + Math.round(pulseInputMs(len) * ctx.scale) };
      return { ok: true };
    }
    if (action === "pulse-answer") {
      if (!p.open || p.open.round !== round) return { ok: false, reason: round < p.next ? "ALREADY_ANSWERED" : "WRONG_ROUND" };
      const seq = payload["sequence"];
      const len = PULSE_LENGTHS[round]!;
      if (!Array.isArray(seq) || seq.length !== len || !seq.every((x) => Number.isInteger(x) && x >= 0 && x < PULSE_SYMBOLS)) return { ok: false, reason: "INVALID_PAYLOAD" };
      const r = close(s, actorId, p, seq as number[]);
      return { ok: true, result: { round: r.round, correctRun: r.correctRun, perfect: r.perfect, points: r.points } };
    }
    return { ok: false, reason: "UNKNOWN_ACTION" };
  },
  abstain(s, actorId) {
    const p = s.per[actorId];
    if (!p || p.done) return { ok: false, reason: "ALREADY_FINISHED" };
    p.open = undefined;
    p.done = true;
    p.satOut = true;
    return { ok: true, wholeGameAbstain: true };
  },
  phase: () => null,
  expirePhase: () => {},
  dueAt(s) {
    const due = Object.values(s.per).flatMap((p) => (p.open ? [closesAt(p.open)] : []));
    return due.length ? Math.min(...due) : undefined;
  },
  advance(s, ctx) {
    // Called by the server clock at a window's closing instant: close it as missed.
    for (const pid of s.players) {
      const p = s.per[pid];
      if (p?.open && ctx.now >= closesAt(p.open)) close(s, pid, p, null);
    }
  },
  finished: (s) => s.players.every((pid) => s.per[pid]?.done),
  scores(s, players) {
    return Object.fromEntries(players.map((pid) => [pid, (s.per[pid]?.results ?? []).reduce((n, r) => n + r.points, 0)]));
  },
  participation(s, players) {
    const participation = Object.fromEntries(players.map((pid) => {
      const p = s.per[pid];
      const answered = (p?.results ?? []).filter((r) => r.answer !== null).length;
      // Finished means played to the end: a player whose every window ran out didn't finish it.
      return [pid, { done: answered, of: PULSE_LENGTHS.length, actions: answered, finished: !!p?.done && !p.satOut && answered > 0 }];
    }));
    return { participation };
  },
  anyAction: (s) => Object.values(s.per).some((p) => p.results.some((r) => r.answer !== null)),
  publicView(s) {
    // Counts only: how far the room has got. Never a pattern, never anyone's answer.
    const per = Object.values(s.per);
    return {
      roundCount: PULSE_LENGTHS.length,
      lengths: [...PULSE_LENGTHS],
      finished: per.filter((p) => p.done).length,
      total: s.players.length,
      roundsPlayed: per.reduce((n, p) => n + p.results.length, 0),
      perfectRounds: per.reduce((n, p) => n + p.results.filter((r) => r.perfect).length, 0),
    };
  },
  playerView(s, actorId, ctx) {
    const p = s.per[actorId];
    const base = this.publicView(s, ctx);
    if (!p) return base;
    // A round whose window passed (no answer) shows as missed here, without changing the state.
    const expired = !!p.open && ctx.now > closesAt(p.open);
    const open = p.open && !expired ? {
      round: p.open.round,
      length: PULSE_LENGTHS[p.open.round],
      showUntil: p.open.showUntil,
      inputUntil: p.open.inputUntil,
      // The pattern only while this player is memorising it.
      pattern: ctx.now < p.open.showUntil ? pulsePattern(s.seed, actorId, p.open.round) : undefined,
    } : undefined;
    return {
      ...base,
      next: expired ? p.open!.round + 1 : p.next,
      open,
      results: p.results,
      done: p.done || (expired && p.open!.round + 1 >= PULSE_LENGTHS.length),
      satOut: !!p.satOut,
      myTotal: p.results.reduce((n, r) => n + r.points, 0),
    };
  },
};
