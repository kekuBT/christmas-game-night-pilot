/**
 * Majority Rules (Stage 5, Practice-only): predict how the group will vote.
 *
 * Each round (5 per game) is one either/or question with two steps, both
 * private: first you PREDICT which option will get the most votes, then you
 * cast your own VOTE. When everyone has done both (or skipped), or time runs
 * out, the round is revealed: how many voted for each option, the majority,
 * and who predicted it. Votes stay anonymous for good: only the totals are
 * ever shown, never who voted for what.
 *
 * Practice scoring (server-side, from recorded predictions and votes only):
 *  - Clear majority: 100 points for each prediction that named it.
 *  - Tie (both options got the same number of votes, at least one each):
 *    nobody was wrong. Every prediction scores 50 ("split room").
 *  - No votes at all: no majority, nobody scores.
 * Your own vote counts toward the majority like everyone else's. A round you
 * skipped scores 0. A missing prediction scores 0. Nothing public counts
 * anyone's votes, and a split room names nobody (who skipped stays private).
 */
import { MAJORITY_PROMPTS, type MajorityPrompt } from "./packs/majority-prompts.js";
import { moduleRng, seededShuffle, type GameModule, type ModuleContext } from "./types.js";

export const MAJORITY_ROUNDS = 5;
export const MAJORITY_POINTS = { majority: 100, tie: 50 } as const;
type Choice = "a" | "b";

export interface MajorityState {
  /** The roster at the start (for "N of M locked in"). */
  players: string[];
  prompts: MajorityPrompt[];
  round: number;
  phase: "predict" | "reveal" | "finished";
  predictions: Record<number, Record<string, Choice>>;
  votes: Record<number, Record<string, Choice>>;
  skipped: Record<number, string[]>;
}

export interface MajorityRoundResult {
  a: number;
  b: number;
  /** "a"/"b": a clear majority; "tie": equal (and >0); "none": nobody voted. */
  majority: Choice | "tie" | "none";
  points: Record<string, number>;
}

export function majorityRoundResult(s: MajorityState, r: number): MajorityRoundResult {
  const votes = Object.values(s.votes[r] ?? {});
  const a = votes.filter((v) => v === "a").length;
  const b = votes.filter((v) => v === "b").length;
  const majority: MajorityRoundResult["majority"] = a + b === 0 ? "none" : a > b ? "a" : b > a ? "b" : "tie";
  const points: Record<string, number> = {};
  for (const [pid, pred] of Object.entries(s.predictions[r] ?? {})) {
    points[pid] = majority === "tie" ? MAJORITY_POINTS.tie : majority === pred ? MAJORITY_POINTS.majority : 0;
  }
  return { a, b, majority, points };
}

/** Rounds whose result is known (revealed or past). */
function closedRounds(s: MajorityState): number[] {
  const upto = s.phase === "predict" ? s.round : s.round + 1;
  return Array.from({ length: Math.min(upto, s.prompts.length) }, (_, i) => i);
}

function doneThisRound(s: MajorityState, pid: string): boolean {
  const r = s.round;
  return (s.skipped[r] ?? []).includes(pid) || (s.predictions[r]?.[pid] !== undefined && s.votes[r]?.[pid] !== undefined);
}

function settle(s: MajorityState, ctx: ModuleContext): void {
  if (s.phase === "predict" && ctx.active.every((p) => doneThisRound(s, p))) s.phase = "reveal";
}

const choiceOf = (v: unknown): Choice | null => (v === "a" || v === "b" ? v : null);

export const majorityModule: GameModule<MajorityState> = {
  id: "majority-rules",
  actions: ["majority-predict", "majority-vote"],
  init({ players, seed }) {
    const prompts = seededShuffle(MAJORITY_PROMPTS, moduleRng(seed)).slice(0, MAJORITY_ROUNDS);
    return { players: [...players], prompts, round: 0, phase: "predict", predictions: {}, votes: {}, skipped: {} };
  },
  intent(s, actorId, action, payload, ctx) {
    if (s.phase !== "predict") return { ok: false, reason: "PHASE_CLOSED" };
    const choice = choiceOf(payload["choice"]);
    if (!choice) return { ok: false, reason: "INVALID_PAYLOAD" };
    const r = s.round;
    if ((s.skipped[r] ?? []).includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
    if (action === "majority-predict") {
      if (s.predictions[r]?.[actorId] !== undefined) return { ok: false, reason: "ALREADY_ANSWERED" };
      (s.predictions[r] ??= {})[actorId] = choice;
    } else if (action === "majority-vote") {
      // Two steps, in order: the prediction is locked before you vote.
      if (s.predictions[r]?.[actorId] === undefined) return { ok: false, reason: "PREDICT_FIRST" };
      if (s.votes[r]?.[actorId] !== undefined) return { ok: false, reason: "ALREADY_ANSWERED" };
      (s.votes[r] ??= {})[actorId] = choice;
    } else return { ok: false, reason: "UNKNOWN_ACTION" };
    settle(s, ctx);
    return { ok: true };
  },
  abstain(s, actorId, ctx) {
    if (s.phase !== "predict") return { ok: false, reason: "PHASE_CLOSED" };
    const r = s.round;
    if ((s.skipped[r] ?? []).includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
    if (s.predictions[r]?.[actorId] !== undefined && s.votes[r]?.[actorId] !== undefined) return { ok: false, reason: "ALREADY_ANSWERED" };
    // Skipping the round: anything given so far this round doesn't count.
    delete s.predictions[r]?.[actorId];
    delete s.votes[r]?.[actorId];
    (s.skipped[r] ??= []).push(actorId);
    settle(s, ctx);
    return { ok: true };
  },
  phase(s) {
    if (s.phase === "finished") return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase };
  },
  expirePhase(s) {
    if (s.phase === "predict") s.phase = "reveal";
    else if (s.phase === "reveal") {
      if (s.round + 1 >= s.prompts.length) s.phase = "finished";
      else { s.round += 1; s.phase = "predict"; }
    }
  },
  finished: (s) => s.phase === "finished",
  scores(s, players) {
    const out: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const r of closedRounds(s)) for (const [pid, pts] of Object.entries(majorityRoundResult(s, r).points)) out[pid] = (out[pid] ?? 0) + pts;
    return out;
  },
  participation(s, players) {
    const closed = closedRounds(s);
    const participation = Object.fromEntries(players.map((p) => {
      // Predictions are the scoring actions. Votes are never counted here:
      // a per-player vote count would let others work out who voted what.
      const done = closed.filter((r) => s.predictions[r]?.[p] !== undefined).length;
      return [p, { done, of: s.prompts.length, actions: done }];
    }));
    return { participation, completedUnits: closed.length, totalUnits: s.prompts.length };
  },
  anyAction: (s) => Object.values(s.predictions).some((r) => Object.keys(r).length > 0),
  publicView(s) {
    const r = Math.min(s.round, s.prompts.length - 1);
    const p = s.prompts[r]!;
    // While a round is open: the question and how many are done. Never a vote or prediction.
    // "N of M locked in": a count only, never who.
    const done = (s.players ?? []).filter((pid) => doneThisRound(s, pid)).length;
    const base: Record<string, unknown> = { round: r, roundCount: s.prompts.length, phase: s.phase, prompt: p.prompt, a: p.a, b: p.b, done, total: (s.players ?? []).length };
    if (s.phase === "predict") return base;
    const reveal = (i: number) => {
      const res = majorityRoundResult(s, i);
      const q = s.prompts[i]!;
      // Who called a clear majority is named. A split room names nobody: listing
      // every prediction would show who skipped or stayed silent (L33).
      const spotOn = res.majority === "a" || res.majority === "b" ? Object.entries(res.points).filter(([, v]) => v > 0).map(([pid, v]) => ({ playerId: pid, points: v })) : [];
      return { prompt: q.prompt, a: q.a, b: q.b, votesA: res.a, votesB: res.b, majority: res.majority, spotOn };
    };
    return { ...base, result: reveal(r), ...(s.phase === "finished" ? { rounds: s.prompts.map((_, i) => reveal(i)) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const r = Math.min(s.round, s.prompts.length - 1);
    return {
      ...this.publicView(s, ctx),
      myPrediction: s.predictions[r]?.[actorId],
      myVote: s.votes[r]?.[actorId],
      mySkipped: (s.skipped[r] ?? []).includes(actorId),
      myTotal: this.scores(s, [actorId])[actorId] ?? 0,
    };
  },
};
