/**
 * Spectrum (Stage 9.3) display helpers. Pure: no React, no fetch.
 *
 * The server owns everything: the pairs, the targets, who gives the clue,
 * the guesses, the phase clock and the one team result (outcome.team). The
 * phone and the TV read their own projection only; these helpers turn it
 * into words. Spec: docs/stage9/stage93.md §5–§7.
 *
 * Cooperative: every line here speaks of the TEAM. Nothing names a winner,
 * a place, a personal best or anyone's individual guess (other than "your
 * guess" on your own phone).
 */
import type { TeamResult, TeamRound, TeamRoundReason } from "../../../../../../src/shared/teamResult.js";

export type { TeamResult, TeamRound, TeamRoundReason };

export const SCALE_MIN = 0;
export const SCALE_MAX = 100;
/** The clue limit, in Unicode code points (the server checks the same). */
export const CLUE_MAX = 80;

export interface SpectrumPairView { id?: string; left: string; right: string; meaning: string }
export interface SpectrumRevealed extends Omit<TeamRound, "pair"> { pair: SpectrumPairView; giver?: string | null }
export type SpectrumRole = "giver" | "guesser" | "watching";
export interface SpectrumView {
  rulesVersion?: number;
  rounds?: number;
  roundNo?: number;
  phase?: "clue" | "guess" | "reveal" | "finished";
  total?: number;
  maxPoints?: number;
  order?: { id: string; satOut: boolean }[];
  /** The current round before its reveal (null during a reveal and at the end). */
  current?: null | { roundNo: number; pair: SpectrumPairView; giver: string | null; clue: string | null; guessesIn: number; guessesNeeded: number };
  revealed?: SpectrumRevealed[];
  end?: null | "completed" | "too-few-players";
  /** Your own phone only. */
  me?: { role: SpectrumRole; satOut: boolean; target?: number; myGuess?: number };
}

export function clampGuess(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(n)));
}

/**
 * The scale's keyboard (9.2 §10): arrows ±1, Page Up/Down ±10, Home/End the
 * ends. Returns the new value, or null for a key the scale doesn't handle.
 * Moving only changes the draft; nothing is ever sent by a key but Enter.
 */
export function stepGuess(value: number, key: string): number | null {
  switch (key) {
    case "ArrowRight": case "ArrowUp": return clampGuess(value + 1);
    case "ArrowLeft": case "ArrowDown": return clampGuess(value - 1);
    case "PageUp": return clampGuess(value + 10);
    case "PageDown": return clampGuess(value - 10);
    case "Home": return SCALE_MIN;
    case "End": return SCALE_MAX;
    default: return null;
  }
}

/** The scale's accessible name: both ends, in words. */
export function scaleName(pair: Pick<SpectrumPairView, "left" | "right">): string {
  return `From ${pair.left} (0) to ${pair.right} (100)`;
}

/** Where a value sits, in words: "62, toward Hot". */
export function valueText(value: number, pair: Pick<SpectrumPairView, "left" | "right">): string {
  const v = clampGuess(value);
  if (v === 50) return "50, the middle";
  return `${v}, toward ${v < 50 ? pair.left : pair.right}`;
}

/** A clue as the server will keep it (spaces collapsed, trimmed), and whether it may be sent. */
export function clueDraft(text: string): { cleaned: string; length: number; ok: boolean } {
  const cleaned = text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  const length = [...cleaned].length;
  return { cleaned, length, ok: length >= 1 && length <= CLUE_MAX };
}

const pts = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;

/** A revealed round, in words (9.3 §5): the target, the team's guess, the distance and the points; why it scored 0. */
export function revealLine(r: Pick<TeamRound, "reason" | "target" | "aggregate" | "distance" | "points">): string {
  switch (r.reason) {
    case "no-clue": return `No clue in time · target ${r.target} · 0 points`;
    case "giver-left": return `The clue-giver left before the clue · target ${r.target} · 0 points`;
    case "no-guesses": return `No guesses in time · target ${r.target} · 0 points`;
    default: return `Target ${r.target} · team guess ${r.aggregate} · ${r.distance} away · +${pts(r.points)} for the team`;
  }
}

/** How close the team was, in one word for the reveal's heading (never about a person). */
export function closenessWord(r: Pick<TeamRound, "reason" | "points">): string {
  if (r.reason !== "scored") return "Round skipped";
  if (r.points >= 10) return "Bullseye!";
  if (r.points >= 7) return "Close!";
  if (r.points >= 4) return "Not bad";
  return "Missed it";
}

/** The one shared result, in words. */
export function teamTotalLine(t: Pick<TeamResult, "total" | "max">): string {
  return `Team result: ${t.total} out of ${t.max}`;
}

/**
 * Why a match ended early, when it did (9.3 §8): the points earned stand.
 * Null for a match that played all its rounds.
 */
export function teamEndLine(t: Pick<TeamResult, "end" | "rounds" | "roundsPlanned">, roomReason?: string): string | null {
  const played = t.rounds.length;
  const of = t.roundsPlanned;
  if (roomReason === "backstop-partial") return `The match hit its time limit after ${played} of ${of} rounds. The points the team earned stand.`;
  if (t.end === "too-few-players") return `Fewer than two players were left, so the match ended after ${played} of ${of} rounds. The points the team earned stand.`;
  return null;
}

/** "3 of 5 guesses in". */
export function guessesLine(c: { guessesIn: number; guessesNeeded: number }): string {
  return `${c.guessesIn} of ${c.guessesNeeded} ${c.guessesNeeded === 1 ? "guess" : "guesses"} in`;
}

/** Whole seconds left before a server deadline (shown as text, never more than the phase's length). */
export function secondsLeft(deadline: number | undefined, now: number, phaseMs?: number): number | null {
  if (deadline === undefined) return null;
  const left = Math.max(0, deadline - now);
  const s = Math.ceil(left / 1000);
  return phaseMs ? Math.min(s, Math.ceil(phaseMs / 1000)) : s;
}

/** The lobby card's and the TV's one-line summary of a finished cooperative game. */
export function teamSummaryLine(team: Pick<TeamResult, "total" | "max">): string {
  return `${teamTotalLine(team)} · one shared team score`;
}
