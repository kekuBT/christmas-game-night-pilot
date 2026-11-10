/**
 * Stage 6.2: the solo shelf's game rules, without any screen: per game, the
 * personal-best rules version, the copy before and after a round, and how to
 * read a finished round from the server's projection. Plain TypeScript (no
 * JSX), so the server-side tests can check it against real projections;
 * solo/soloGames.tsx adds the screens.
 */
import { MATH_RULES_VERSION } from "../../../../src/games/mathRules.js";
import { PULSE_LENGTHS, PULSE_RULES_VERSION } from "../../../../src/games/modules/pulse.js";
import { CONNECTIONS_RULES_VERSION } from "../../../../src/games/connections.js";
import { CONNECTIONS_RULE } from "../ui/mchezo/lib/connectionsScore.js";
import type { PlayerGame, PublicGame } from "../types.js";

/** A finished round, from the server's own records. */
export interface SoloSummary {
  /** The score the server recorded for this player. */
  score: number;
  /** One line about the round ("8 of 10 correct", "4 of 6 rounds perfect"…). */
  headline: string;
}

export interface SoloGameRules {
  gameId: string;
  /** The personal-best slot's rules version (bumped with the rules, next to the engine). */
  rulesVersion: number;
  /** Before a round: how it works, in one or two sentences. */
  howToPlay: string;
  /** Under the results: how the score is made. */
  scoring: string;
  /**
   * Next to the personal best, when one best compares rounds that differ in
   * a way the score doesn't show (Word Connections: one best across boards
   * of different difficulty).
   */
  bestNote?: string;
  /** The finished round's summary, or null if the projection doesn't hold it yet. */
  summarize: (game: PlayerGame | undefined, publicGame: PublicGame | undefined, me: string) => SoloSummary | null;
}

/** The score the server recorded for this player in this round. */
function recordedScore(game: PlayerGame | undefined, publicGame: PublicGame | undefined, me: string): number | undefined {
  const s = (game?.rawScores ?? publicGame?.rawScores ?? {})[me];
  return typeof s === "number" ? s : undefined;
}

/**
 * Whether a finished round may set a personal best: the server finished it
 * (played out, or ended by its time limit), and this player's own view of it
 * shows they did not sit it out. A sat-out round is never a best, whatever it
 * had scored before: the solo screens hide Sit out, but the server still
 * accepts an abstain sent with the seat's token. A round that was left or
 * replaced never finishes, so it never gets here.
 */
export function countsForBest(game: PlayerGame | undefined, publicGame: PublicGame | undefined): boolean {
  return publicGame?.status === "finished" && game !== undefined && game.abstained !== true;
}

export interface MathReviewRow { prompt: string; mine: string; answer: string; ok: boolean }
interface MathQ { id: string; prompt: string; options: (string | number)[]; correctAnswer?: number }
/** Math Mayhem: each question, what was picked and the answer (the answers are public once the round is over). */
export function mathReview(game: PlayerGame | undefined, publicGame: PublicGame | undefined): MathReviewRow[] {
  const qs = (publicGame?.questions ?? []) as MathQ[];
  const answers = (game?.myAnswers ?? {}) as Record<string, number | null>;
  return qs.map((q) => {
    const pick = answers[q.id];
    const chosen = pick === undefined || pick === null ? undefined : q.options[pick];
    return { prompt: q.prompt.replace(/\s*=\s*\?$/, ""), mine: chosen === undefined ? "no answer" : String(chosen), answer: String(q.correctAnswer), ok: chosen !== undefined && String(chosen) === String(q.correctAnswer) };
  });
}

export const MATH_SOLO: SoloGameRules = {
  gameId: "math-mayhem",
  rulesVersion: MATH_RULES_VERSION,
  howToPlay: "10 quick sums, four answers each. 100 points for each right answer, plus up to 20 if you’re fast.",
  scoring: "100 points per correct answer, plus up to 20 for speed.",
  summarize(game, publicGame, me) {
    const score = recordedScore(game, publicGame, me);
    if (score === undefined || !publicGame?.questions) return null;
    const review = mathReview(game, publicGame);
    return { score, headline: `${review.filter((r) => r.ok).length} of ${review.length} correct` };
  },
};

interface PulseRound { answer: unknown[] | null; perfect: boolean }
export const PULSE_SOLO: SoloGameRules = {
  gameId: "pattern-pulse",
  rulesVersion: PULSE_RULES_VERSION,
  howToPlay: `Watch a pattern of shapes, then tap it back in order. ${PULSE_LENGTHS.length} rounds, from ${PULSE_LENGTHS[0]} shapes up to ${PULSE_LENGTHS[PULSE_LENGTHS.length - 1]}; you open each round when you’re ready.`,
  scoring: "20 points for each shape right from the start of the sequence, plus 50 for the whole sequence.",
  summarize(game, publicGame, me) {
    const score = recordedScore(game, publicGame, me);
    const results = ((game?.state ?? {}) as { results?: PulseRound[] }).results;
    if (score === undefined || !results) return null;
    const perfect = results.filter((r) => r.perfect).length;
    const missed = results.filter((r) => r.answer === null).length;
    return { score, headline: `${perfect} of ${PULSE_LENGTHS.length} rounds perfect${missed ? ` · ${missed} ran out of time` : ""}` };
  },
};

export const CONNECTIONS_SOLO: SoloGameRules = {
  gameId: "word-connections",
  rulesVersion: CONNECTIONS_RULES_VERSION,
  howToPlay: "Sort 16 words into four groups of four. Four mistakes and the puzzle is over.",
  scoring: CONNECTIONS_RULE,
  bestNote: "Best score across boards. Some boards are harder than others.",
  summarize(game, publicGame, me) {
    const score = recordedScore(game, publicGame, me);
    const st = ((game?.state ?? {}) as { myState?: { solved: string[]; mistakes: number } }).myState;
    if (score === undefined || !st) return null;
    const found = st.solved.length;
    const m = st.mistakes;
    const headline = found >= 4
      ? (m === 0 ? "All four groups, no mistakes" : `All four groups, ${m} mistake${m === 1 ? "" : "s"}`)
      : `Found ${found} of 4 groups${m >= 4 ? " · out of guesses" : ""}`;
    return { score, headline };
  },
};

/** The solo shelf, in the order it is shown. */
export const SOLO_GAME_RULES: readonly SoloGameRules[] = [MATH_SOLO, PULSE_SOLO, CONNECTIONS_SOLO];
