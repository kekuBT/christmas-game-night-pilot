/**
 * Stage 12.5 (docs/stage12/stage125.md): Family Questions. Questions the family wrote about itself ("Who was born in
 * Nairobi?"), played like Trivia. Casual rooms only, practice only.
 *
 * The questions come from the room's private pack (src/shared/familyPack.ts): everyone writes on their own phone and
 * nobody, not even the host, sees anyone else's questions before they're played. The room picks this game's
 * questions at its start and hands them to init(); nothing here reads the pack.
 *
 * Each question is one round with two phases: ANSWER (everyone except its author picks an option, privately) and
 * REVEAL (the right answer, who got it, and who asked). Scoring, from recorded answers only:
 *  - 100 for a right answer;
 *  - the author never answers their own question (they know it) and scores nothing for it, except:
 *  - a "great question" bonus of 50 to the author when some, but not all, of the players who could answer got it
 *    right (a question everyone or nobody gets right isn't rewarded);
 *  - a question the host skipped (an unkind or broken question) scores nothing for anyone and is never revealed.
 * Who in the family?: the options are the names of the players in this game, fixed at its start.
 */
import { moduleRng, seededShuffle, type GameModule, type ModuleContext } from "./types.js";

export const FAMILY_POINTS = { right: 100, greatQuestion: 50 } as const;
/** At most this many questions in one game (the rest wait for the next one). */
export const FAMILY_ROUNDS_MAX = 10;
/** A game needs at least this many questions. */
export const FAMILY_ROUNDS_MIN = 3;

/** One question as this game plays it (a snapshot: later edits to the pack never change a game). */
export interface FamilyGameQuestion {
  id: string;
  authorId: string;
  authorName: string;
  kind: "choice" | "who";
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface FamilyState {
  players: string[];
  questions: FamilyGameQuestion[];
  round: number;
  phase: "answer" | "reveal" | "finished";
  answers: Record<number, Record<string, number>>;
  skipped: Record<number, string[]>;
  /** Rounds the host skipped: no points, never revealed. */
  hostSkipped: number[];
}

export interface FamilyRoundResult {
  correctIndex: number;
  /** Players who answered right. */
  right: string[];
  /** How many chose each option. */
  counts: number[];
  /** Players who could answer (everyone in the game except the author). */
  eligible: number;
  greatQuestion: boolean;
  points: Record<string, number>;
}

export function familyRoundResult(s: FamilyState, r: number): FamilyRoundResult {
  const q = s.questions[r]!;
  const answers = s.answers[r] ?? {};
  const counts = q.options.map((_, i) => Object.values(answers).filter((a) => a === i).length);
  const right = Object.entries(answers).filter(([, a]) => a === q.correctIndex).map(([pid]) => pid);
  const eligible = s.players.filter((p) => p !== q.authorId).length;
  if (s.hostSkipped.includes(r)) return { correctIndex: q.correctIndex, right: [], counts, eligible, greatQuestion: false, points: {} };
  const points: Record<string, number> = {};
  for (const pid of right) points[pid] = FAMILY_POINTS.right;
  const greatQuestion = right.length > 0 && right.length < eligible && s.players.includes(q.authorId);
  if (greatQuestion) points[q.authorId] = (points[q.authorId] ?? 0) + FAMILY_POINTS.greatQuestion;
  return { correctIndex: q.correctIndex, right, counts, eligible, greatQuestion, points };
}

/** Rounds whose result is known. */
function closedRounds(s: FamilyState): number[] {
  const upto = s.phase === "answer" ? s.round : s.round + 1;
  return Array.from({ length: Math.min(upto, s.questions.length) }, (_, i) => i).filter((r) => !s.hostSkipped.includes(r));
}

function doneThisRound(s: FamilyState, pid: string): boolean {
  const r = s.round;
  const q = s.questions[r];
  return !q || q.authorId === pid || (s.skipped[r] ?? []).includes(pid) || s.answers[r]?.[pid] !== undefined;
}

function settle(s: FamilyState, ctx: ModuleContext): void {
  if (s.phase === "answer" && ctx.active.every((p) => doneThisRound(s, p))) s.phase = "reveal";
}

function nextRound(s: FamilyState): void {
  if (s.round + 1 >= s.questions.length) s.phase = "finished";
  else { s.round += 1; s.phase = "answer"; }
}

/**
 * The questions for one game, from the questions ready to play: up to FAMILY_ROUNDS_MAX, taking turns between authors
 * (so one keen writer doesn't fill the game), in a seeded order. Pure.
 */
export function pickFamilyQuestions<Q extends { id: string; authorId: string }>(ready: readonly Q[], seed: number, max = FAMILY_ROUNDS_MAX): Q[] {
  const rng = moduleRng(seed);
  const byAuthor = new Map<string, Q[]>();
  for (const q of seededShuffle(ready, rng)) byAuthor.set(q.authorId, [...(byAuthor.get(q.authorId) ?? []), q]);
  const authors = seededShuffle([...byAuthor.keys()], rng);
  const out: Q[] = [];
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const a of authors) {
      const q = byAuthor.get(a)![round];
      if (q && out.length < max) { out.push(q); added = true; }
    }
    if (!added) break;
  }
  return out;
}

export const familyModule: GameModule<FamilyState> & {
  /** The host or a cohost skips the current question (it is never revealed or scored). */
  skipCurrent(s: FamilyState): boolean;
} = {
  id: "family-questions",
  actions: ["family-answer", "family-skip"],
  nonPlayingActions: ["family-skip"],
  init({ players, family }) {
    return { players: [...players], questions: [...(family ?? [])], round: 0, phase: "answer", answers: {}, skipped: {}, hostSkipped: [] };
  },
  intent(s, actorId, action, payload, ctx) {
    if (action === "family-skip") {
      if (!ctx.canDirect) return { ok: false, reason: "NOT_HOST" };
      if (s.phase !== "answer") return { ok: false, reason: "PHASE_CLOSED" };
      if (s.questions[s.round] && Number(payload["round"]) !== s.round) return { ok: false, reason: "STALE_ROUND" };
      this.skipCurrent(s);
      return { ok: true };
    }
    if (action !== "family-answer") return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.phase !== "answer") return { ok: false, reason: "PHASE_CLOSED" };
    const r = s.round;
    const q = s.questions[r];
    if (!q) return { ok: false, reason: "PHASE_CLOSED" };
    if (Number(payload["round"]) !== r) return { ok: false, reason: "STALE_ROUND" };
    if (q.authorId === actorId) return { ok: false, reason: "YOUR_QUESTION" };
    const choice = payload["choice"];
    if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return { ok: false, reason: "INVALID_PAYLOAD" };
    if ((s.skipped[r] ?? []).includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
    if (s.answers[r]?.[actorId] !== undefined) return { ok: false, reason: "ALREADY_ANSWERED" };
    (s.answers[r] ??= {})[actorId] = choice;
    settle(s, ctx);
    return { ok: true };
  },
  skipCurrent(s) {
    if (s.phase !== "answer" || !s.questions[s.round]) return false;
    if (!s.hostSkipped.includes(s.round)) s.hostSkipped.push(s.round);
    delete s.answers[s.round];
    nextRound(s);
    return true;
  },
  abstain(s, actorId, ctx) {
    if (s.phase !== "answer") return { ok: false, reason: "PHASE_CLOSED" };
    const r = s.round;
    if (s.questions[r]?.authorId === actorId) return { ok: false, reason: "YOUR_QUESTION" };
    if ((s.skipped[r] ?? []).includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
    if (s.answers[r]?.[actorId] !== undefined) return { ok: false, reason: "ALREADY_ANSWERED" };
    (s.skipped[r] ??= []).push(actorId);
    settle(s, ctx);
    return { ok: true };
  },
  phase(s) {
    if (s.phase === "finished" || s.questions.length === 0) return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase === "answer" ? "question" : "reveal" };
  },
  expirePhase(s) {
    if (s.phase === "answer") s.phase = "reveal";
    else if (s.phase === "reveal") nextRound(s);
  },
  finished: (s) => s.phase === "finished" || s.questions.length === 0,
  scores(s, players) {
    const out: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const r of closedRounds(s)) for (const [pid, pts] of Object.entries(familyRoundResult(s, r).points)) if (pid in out) out[pid] = (out[pid] ?? 0) + pts;
    return out;
  },
  participation(s, players) {
    const closed = closedRounds(s);
    const participation = Object.fromEntries(players.map((p) => {
      const could = closed.filter((r) => s.questions[r]!.authorId !== p);
      const done = could.filter((r) => s.answers[r]?.[p] !== undefined).length;
      return [p, { done, of: could.length, actions: done }];
    }));
    return { participation, completedUnits: closed.length, totalUnits: s.questions.length };
  },
  anyAction: (s) => Object.values(s.answers).some((r) => Object.keys(r).length > 0),
  publicView(s) {
    const r = Math.min(s.round, Math.max(0, s.questions.length - 1));
    const q = s.questions[r];
    if (!q) return { round: 0, roundCount: 0, phase: s.phase };
    const eligible = s.players.filter((p) => p !== q.authorId);
    const done = eligible.filter((pid) => doneThisRound(s, pid)).length;
    // While a question is open: the question, its options and a count. Never an answer, and never who asked (the
    // asker is part of the reveal).
    const base: Record<string, unknown> = { round: r, roundCount: s.questions.length, phase: s.phase, kind: q.kind, prompt: q.prompt, options: q.options, done, total: eligible.length, skippedRounds: s.hostSkipped.length };
    if (s.phase === "answer") return base;
    const reveal = (i: number) => {
      const qi = s.questions[i]!;
      if (s.hostSkipped.includes(i)) return { skipped: true };
      const res = familyRoundResult(s, i);
      return { prompt: qi.prompt, kind: qi.kind, options: qi.options, correctIndex: res.correctIndex, counts: res.counts, right: res.right, askedBy: qi.authorId, askedByName: qi.authorName, greatQuestion: res.greatQuestion };
    };
    const played = Array.from({ length: Math.min(s.round + 1, s.questions.length) }, (_, i) => i);
    return { ...base, result: reveal(r), ...(s.phase === "finished" ? { rounds: played.map(reveal) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const r = Math.min(s.round, Math.max(0, s.questions.length - 1));
    return {
      ...this.publicView(s, ctx),
      myAnswer: s.answers[r]?.[actorId],
      mySkipped: (s.skipped[r] ?? []).includes(actorId),
      // Only the author is told it's their own question while it's open.
      myQuestion: s.phase === "answer" && s.questions[r]?.authorId === actorId,
      myTotal: this.scores(s, [actorId])[actorId] ?? 0,
    };
  },
};
