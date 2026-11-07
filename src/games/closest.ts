export interface ClosestQuestion {
  id: string;
  prompt: string;
  unit: string;
  answer: number; // Server-side only pre-reveal
  source: string;
}

export interface ClosestState {
  questions: ClosestQuestion[];
  questionIndex: number;
  guesses: Record<string, Record<string, number>>; // questionId -> playerId -> guess
  /** questionId -> players who explicitly abstained on that question (score 0 for it). */
  abstained: Record<string, string[]>;
  phase: "playing" | "finished";
}

export const CLOSEST_QUESTIONS: ClosestQuestion[] = [
  { id: "closest-1", prompt: "How tall is the Eiffel Tower, in metres?", unit: "m", answer: 330, source: "Eiffel Tower official height, 330 m with antenna" },
  { id: "closest-2", prompt: "How many minutes are in one day?", unit: "minutes", answer: 1440, source: "24 × 60" },
  { id: "closest-3", prompt: "How many days are in a leap year?", unit: "days", answer: 366, source: "Leap year calendar" },
  { id: "closest-4", prompt: "How many seconds are in one hour?", unit: "seconds", answer: 3600, source: "60 × 60" },
  { id: "closest-5", prompt: "How many weeks are in a year (rounded to the nearest whole week)?", unit: "weeks", answer: 52, source: "365 / 7 ≈ 52" },
  { id: "closest-6", prompt: "How many letters are in the English alphabet?", unit: "letters", answer: 26, source: "English alphabet" },
  { id: "closest-7", prompt: "How many hours are in one week?", unit: "hours", answer: 168, source: "7 × 24" },
  { id: "closest-8", prompt: "How many days are in December?", unit: "days", answer: 31, source: "December calendar" },
];

export function initClosest(): ClosestState {
  return { questions: CLOSEST_QUESTIONS, questionIndex: 0, guesses: {}, abstained: {}, phase: "playing" };
}

export function submitClosestGuess(state: ClosestState, playerId: string, value: number): void {
  if (state.phase !== "playing") throw new Error("PHASE_CLOSED");
  if (!Number.isFinite(value)) throw new Error("INVALID_GUESS");
  const q = state.questions[state.questionIndex]!;
  if ((state.abstained[q.id] ?? []).includes(playerId)) throw new Error("ALREADY_ABSTAINED");
  const perQ = (state.guesses[q.id] ??= {});
  if (perQ[playerId] !== undefined) throw new Error("ALREADY_GUESSED");
  perQ[playerId] = value;
}

/** Abstaining on a question counts toward advancement but scores 0 for it. */
export function abstainClosest(state: ClosestState, playerId: string): void {
  if (state.phase !== "playing") throw new Error("PHASE_CLOSED");
  const q = state.questions[state.questionIndex]!;
  if ((state.guesses[q.id] ?? {})[playerId] !== undefined) throw new Error("ALREADY_GUESSED");
  state.abstained ??= {};
  const perQ = (state.abstained[q.id] ??= []);
  if (perQ.includes(playerId)) throw new Error("ALREADY_ABSTAINED");
  perQ.push(playerId);
}

export function allGuessed(state: ClosestState, playerIds: string[]): boolean {
  const q = state.questions[state.questionIndex]!;
  const perQ = state.guesses[q.id] ?? {};
  const abs = state.abstained?.[q.id] ?? [];
  return playerIds.every((p) => perQ[p] !== undefined || abs.includes(p));
}

export function advanceClosest(state: ClosestState): void {
  if (state.questionIndex + 1 >= state.questions.length) {
    state.phase = "finished";
  } else {
    state.questionIndex += 1;
  }
}

/** Per-question scores: closest 100, 2nd 70, 3rd 50, others 25. Ties share the highest rank award. */
export function closestQuestionScores(question: ClosestQuestion, guesses: Record<string, number>): Record<string, number> {
  const entries = Object.entries(guesses).map(([pid, guess]) => ({ pid, err: Math.abs(guess - question.answer) }));
  entries.sort((a, b) => a.err - b.err);
  const awards = [100, 70, 50];
  const scores: Record<string, number> = {};
  let rank = 0;
  let prevErr: number | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (prevErr === null || e.err !== prevErr) rank = i;
    scores[e.pid] = rank < 3 ? (awards[rank] as number) : 25;
    prevErr = e.err;
  }
  return scores;
}

export function closestTotalScores(state: ClosestState): Record<string, number> {
  const total: Record<string, number> = {};
  for (const q of state.questions) {
    const guesses = state.guesses[q.id] ?? {};
    for (const [pid, pts] of Object.entries(closestQuestionScores(q, guesses))) {
      total[pid] = (total[pid] ?? 0) + pts;
    }
  }
  return total;
}

/**
 * E3: a question's answer is revealed once it has CLOSED (everyone guessed,
 * or its time ran out). Guesses can't change after that (closed phases
 * refuse actions), and the questions still to come are never included.
 * Per player: only their own guess, never anyone else's.
 */
export function closedQuestions(state: ClosestState, actorId: string): Record<string, unknown>[] {
  const closed = state.phase === "finished" ? state.questions.length : state.questionIndex;
  return state.questions.slice(0, closed).map((q) => ({
    id: q.id, prompt: q.prompt, unit: q.unit, answer: q.answer, explanation: q.source,
    ...(actorId ? { myGuess: state.guesses[q.id]?.[actorId], myAbstained: (state.abstained?.[q.id] ?? []).includes(actorId) } : {}),
  }));
}

export function projectClosest(state: ClosestState, actorId: string, _isTv: boolean): Record<string, unknown> {
  const q = state.questions[state.questionIndex]!;
  const revealed = state.phase === "finished";
  return {
    revealed: closedQuestions(state, actorId),
    phase: state.phase,
    questionIndex: state.questionIndex,
    prompt: q.prompt,
    unit: q.unit,
    myGuess: state.guesses[q.id]?.[actorId],
    myAbstained: (state.abstained?.[q.id] ?? []).includes(actorId),
    answer: revealed ? q.answer : undefined,
    source: revealed ? q.source : undefined,
    guesses: revealed ? state.guesses[q.id] : undefined,
  };
}
