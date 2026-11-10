import { seededRng } from "../shared/protocol.js";

/**
 * Stage 6.1: the version of Math Mayhem's rules, difficulty and scoring. A
 * personal best is compared only with rounds played under the same version,
 * so bump this whenever the questions (count, kinds, ranges), the time
 * window, or the scoring (100 per correct answer, speed bonus) change.
 */
export const MATH_RULES_VERSION = 1;
/** Questions per round under MATH_RULES_VERSION 1. */
export const MATH_QUESTION_COUNT = 10;

export interface MathQuestion {
  id: string;
  prompt: string;
  options: number[]; // Exactly 4, unique, shuffled
  correctIndex: number; // Server-side only. Never send to a player before reveal.
  correctAnswer: number; // Server-side only.
}

/** Deterministic, programmatically verified arithmetic. No trick math. */
export function generateMathQuestions(seed: number, count = MATH_QUESTION_COUNT): MathQuestion[] {
  const rng = seededRng(seed);
  const questions: MathQuestion[] = [];
  const used = new Set<string>();
  let i = 0;
  while (questions.length < count && i < 1000) {
    i++;
    const kind = Math.floor(rng() * 5);
    let prompt: string;
    let answer: number;
    if (kind === 0) {
      const a = 12 + Math.floor(rng() * 80);
      const b = 11 + Math.floor(rng() * 70);
      prompt = `${a} + ${b} = ?`;
      answer = a + b;
    } else if (kind === 1) {
      const a = 30 + Math.floor(rng() * 90);
      const b = 10 + Math.floor(rng() * (a - 9));
      prompt = `${a} − ${b} = ?`;
      answer = a - b;
    } else if (kind === 2) {
      const a = 3 + Math.floor(rng() * 10);
      const b = 3 + Math.floor(rng() * 10);
      prompt = `${a} × ${b} = ?`;
      answer = a * b;
    } else if (kind === 3) {
      const b = 2 + Math.floor(rng() * 11);
      const q = 2 + Math.floor(rng() * 12);
      prompt = `${b * q} ÷ ${b} = ?`;
      answer = q;
    } else {
      // Whole-outcome percentage, e.g. 20% of 50
      const pct = [10, 20, 25, 50][Math.floor(rng() * 4)] as number;
      const base = 20 * (1 + Math.floor(rng() * 9));
      prompt = `${pct}% of ${base} = ?`;
      answer = (pct * base) / 100;
    }
    const key = prompt;
    if (used.has(key)) continue;
    used.add(key);
    // Plausible unique distractors
    const distractors = new Set<number>();
    const deltas = [1, 2, 3, 5, 10, -1, -2, -5, 10, 20];
    let d = 0;
    while (distractors.size < 3 && d < 50) {
      const delta = deltas[Math.floor(rng() * deltas.length)] as number;
      const cand = answer + delta;
      if (cand >= 0 && cand !== answer) distractors.add(cand);
      d++;
    }
    const options = [answer, ...distractors].slice(0, 4);
    // Shuffle options with seeded RNG
    for (let j = options.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      const tmp = options[j] as number;
      options[j] = options[k] as number;
      options[k] = tmp;
    }
    questions.push({
      id: `math-${questions.length + 1}`,
      prompt,
      options,
      correctIndex: options.indexOf(answer),
      correctAnswer: answer,
    });
  }
  return questions;
}

/** Speed bonus brackets: 0–5s +20, 5–10s +10, otherwise +0. Cap 20. */
export function mathSpeedBonus(elapsedMs: number): number {
  if (elapsedMs <= 5000) return 20;
  if (elapsedMs <= 10000) return 10;
  return 0;
}

export function scoreMathAnswer(
  question: MathQuestion,
  chosenIndex: number | null,
  elapsedMs: number,
): number {
  if (chosenIndex === null) return 0;
  if (chosenIndex !== question.correctIndex) return 0;
  return 100 + mathSpeedBonus(elapsedMs);
}
