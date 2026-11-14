/**
 * Game lifecycle policies (Sprint 3, decisions P1-P9).
 *
 * One table says how every game is timed, how it ends, and whether it may
 * count toward an official Family Cup. Durations are PROVISIONAL starting
 * values from docs/GAME_LIFECYCLE_POLICY_PROPOSAL.md (P2): design guesses
 * to be replaced by measured playtest timings, never claims of measured
 * duration. Change them here, nowhere else.
 *
 * Timing models (P1):
 * - "game-deadline": independent-answer games. Players progress on their
 *   own; the game ends when every roster player has finished (or chose to
 *   sit out), or at the game deadline, whichever comes first.
 * - "phased": lock-step games. Each question/round/phase has its own
 *   deadline; a phase ends early when every roster player has acted.
 *   `backstopMs` bounds the whole game in case phases misbehave.
 * - "turns": sequential games (Charades): each turn has a time limit.
 *
 * Completion never depends on whether a socket is connected (P6): a
 * disconnected player can come back and keep playing until the deadline.
 */

import { SPECTRUM_PHASE_MS } from "../games/modules/spectrum-timing.js";
import type { TeamResult } from "../shared/teamResult.js";

export type TimingModel = "game-deadline" | "phased" | "turns";

/** Phase kinds a phased game's clock can be keyed by (Stage 5 adds predict, reveal and draw). */
export type PhaseKind = "question" | "write" | "vote" | "round" | "clue" | "guess" | "turn" | "predict" | "reveal" | "draw";

export interface GamePolicy {
  model: TimingModel;
  /** Overall deadline (game-deadline) or backstop (phased/turns), from the game start. */
  gameWindowMs: number;
  /** Per-phase durations for phased games, keyed by phase kind. */
  phaseMs?: Partial<Record<PhaseKind, number>>;
  /** May a game of this kind count toward an official Family Cup? (P8, P9) */
  officialEligible: boolean;
  /** Plain reason shown when a game is practice-only. */
  practiceOnlyReason?: string;
  /** What one unit of participation is called ("questions", "rounds"...). */
  unit: "questions" | "events" | "groups" | "rounds" | "phases" | "turns";
}

const MIN = 60_000;
const SEC = 1_000;

export const GAME_POLICIES: Readonly<Record<string, GamePolicy>> = Object.freeze({
  // Independent-answer games (P1: game deadline).
  "trivia": { model: "game-deadline", gameWindowMs: 6 * MIN, officialEligible: true, unit: "questions" },
  "who-said-that": { model: "game-deadline", gameWindowMs: 6 * MIN, officialEligible: true, unit: "questions" },
  "geography": { model: "game-deadline", gameWindowMs: 6 * MIN, officialEligible: true, unit: "questions" },
  "guess-the-year": { model: "game-deadline", gameWindowMs: 6 * MIN, officialEligible: true, unit: "events" },
  "math-mayhem": { model: "game-deadline", gameWindowMs: 4 * MIN, officialEligible: true, unit: "questions" },
  "word-connections": { model: "game-deadline", gameWindowMs: 8 * MIN, officialEligible: true, unit: "groups" },
  // Lock-step games (P1: per-phase deadlines + backstop).
  "closest-wins": { model: "phased", gameWindowMs: 8 * MIN, phaseMs: { question: 40 * SEC }, officialEligible: true, unit: "questions" },
  "caption-clash": { model: "phased", gameWindowMs: 10 * MIN, phaseMs: { write: 90 * SEC, vote: 45 * SEC }, officialEligible: true, unit: "rounds" },
  "category-sprint": { model: "phased", gameWindowMs: 4 * MIN, phaseMs: { round: 60 * SEC }, officialEligible: true, unit: "rounds" },
  // Practice-only for now (P8, P9).
  "impostor": {
    model: "phased", gameWindowMs: 5 * MIN, phaseMs: { clue: 90 * SEC, vote: 60 * SEC, guess: 45 * SEC },
    officialEligible: false, practiceOnlyReason: "Impostor is practice-only for now: social deduction doesn't count toward the Family Cup.", unit: "phases",
  },
  "charades": {
    model: "turns", gameWindowMs: 20 * MIN, phaseMs: { turn: 90 * SEC },
    officialEligible: false, practiceOnlyReason: "Charades is practice-only until its team scoring is redesigned.", unit: "turns",
  },
  // Stage 5 new games: Practice-only until the owner approves their Cup scoring (D-S5).
  "majority-rules": {
    model: "phased", gameWindowMs: 8 * MIN, phaseMs: { predict: 45 * SEC, reveal: 10 * SEC },
    officialEligible: false, practiceOnlyReason: "Majority Rules is new: practice-only until its Cup scoring is approved.", unit: "rounds",
  },
  // Self-paced: each player opens a round when ready; the module closes a
  // missed answer window on the server clock (GameModule.dueAt/advance).
  "pattern-pulse": {
    model: "game-deadline", gameWindowMs: 5 * MIN,
    officialEligible: false, practiceOnlyReason: "Pattern Pulse is new: practice-only until its Cup scoring is approved.", unit: "rounds",
  },
  "draw-guess": {
    model: "phased", gameWindowMs: 12 * MIN, phaseMs: { draw: 75 * SEC, reveal: 8 * SEC },
    officialEligible: false, practiceOnlyReason: "Draw & Guess is new: practice-only until its Cup scoring is approved.", unit: "turns",
  },
  // Stage 9.1 (docs/stage9/stage91.md §3–§4): one turn at a time, each its own
  // phase ("turn:<n>"): 10 s shown + 500 ms network grace (src/games/modules/jebena.ts).
  // The game deadline is the match limit (12 min): it ends the match with places.
  "jebena-rush": {
    model: "game-deadline", gameWindowMs: 12 * MIN, phaseMs: { turn: 10 * SEC + 500 },
    officialEligible: false, practiceOnlyReason: "Jebena Rush is new: practice-only, in casual rooms.", unit: "turns",
  },
  // Stage 9.3 (docs/stage9/stage93.md §2): clue → guess → reveal, four rounds, the
  // durations from the module's own constant; 10 minutes is a backstop (4 rounds ≤ 452 s).
  "spectrum": {
    model: "phased", gameWindowMs: 10 * MIN, phaseMs: { ...SPECTRUM_PHASE_MS },
    officialEligible: false, practiceOnlyReason: "Spectrum is cooperative and practice-only: one team score, in casual rooms.", unit: "rounds",
  },
  // Stage 12.5: the family's own questions, written by the players: casual rooms only, practice-only. Up to 10
  // questions of 30 s + 8 s; 10 minutes is a backstop.
  "family-questions": {
    model: "phased", gameWindowMs: 10 * MIN, phaseMs: { question: 30 * SEC, reveal: 8 * SEC },
    officialEligible: false, practiceOnlyReason: "Family Questions is practice-only: the family writes its own questions, so it is just for fun in casual rooms.", unit: "questions",
  },
});

export function policyFor(gameId: string): GamePolicy {
  const p = GAME_POLICIES[gameId];
  if (!p) throw new Error(`No lifecycle policy for ${gameId}`);
  return p;
}

/**
 * A deadline game in which nobody on the roster answered anything has no
 * result to rank: counting it would give every player the same tie score
 * and could displace a real game from a day's best three. PROVISIONAL
 * default (docs/DECISIONS.md D-S3-02), owner sign-off pending: such a game
 * is recorded with its outcome but does not count. Set true to count it.
 */
export const COUNT_GAMES_WITH_NO_PARTICIPATION = false;

/** How a game ended. Persisted on the game; never recomputed. */
export type EndReason =
  | "completed" // everyone on the roster finished (or sat out)
  | "deadline" // the game deadline arrived; unanswered items score 0
  | "backstop-partial" // a phased game hit its backstop mid-phase: completed rounds only, counts as practice
  | "void"; // a technical integrity failure: no result, audited

export interface Participation {
  /** Items this player completed (answers, guesses, groups solved, rounds submitted). */
  done: number;
  /** Items available to them. */
  of: number;
  /** For Word Connections: the puzzle ended for them (4 groups or 4 mistakes). */
  finished?: boolean;
  /** Genuine scoring actions: answers/guesses (wrong ones too), captions, non-empty submissions. Never opens or abstentions. */
  actions?: number;
}

export interface GameOutcome {
  reason: EndReason;
  /** Server time the game ended (the deadline instant for deadline endings). */
  endedAt: number;
  /** Does this game feed official standings and the Family Cup? */
  countsOfficially: boolean;
  /** Plain explanation when it does not, or why it ended unusually. */
  note?: string;
  /** Per roster player. Public counts only: who chose to abstain is never shown to others. */
  participation: Record<string, Participation>;
  /** Phased games: how many questions/rounds were fully completed. */
  completedUnits?: number;
  totalUnits?: number;
  /**
   * Stage 9.3: a cooperative game's one shared result (src/shared/teamResult.ts).
   * Present exactly when the game is cooperative; then no per-player score is projected.
   */
  team?: TeamResult;
}
