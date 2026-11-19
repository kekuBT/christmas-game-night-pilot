/**
 * Pattern Pulse's transient cue (H1, handoff 7008903623). Pure: no React, no clock of its own.
 *
 * The pattern is shown one symbol at a time, never as a whole row: the server's memorise window
 * (showFrom → showUntil, server time) is split into one equal slot per symbol. Each symbol is on screen
 * (and in the screen's live region) for the first part of its slot, then the stage is empty for a short
 * gap, so a symbol shown twice in a row reads as a second appearance. At no moment does the screen, its
 * text or any accessible name hold more than the one current symbol, during the window or after it.
 */

/** The share of each slot the stage stays empty at its end. */
export const PULSE_CUE_GAP = 0.2;

export interface PulseCue {
  /** The symbol's position in the pattern (0-based) on screen now, or null (a gap, or the window is over). */
  index: number | null;
  /** When this changes next, in server time; null once the window is over. */
  nextChangeAt: number | null;
}

/**
 * The cue at `now` for a pattern of `length` symbols shown from `showFrom` until `showUntil`.
 * A phone whose clock estimate runs behind the server's (now before showFrom) shows the first symbol.
 */
export function pulseCueAt(length: number, showFrom: number, showUntil: number, now: number): PulseCue {
  if (length <= 0 || now >= showUntil) return { index: null, nextChangeAt: null };
  const span = Math.max(1, showUntil - showFrom);
  const slot = span / length;
  const t = Math.max(0, now - showFrom);
  const i = Math.min(length - 1, Math.floor(t / slot));
  const shownFor = slot * (1 - PULSE_CUE_GAP);
  const into = t - i * slot;
  if (into < shownFor) return { index: i, nextChangeAt: Math.min(showUntil, showFrom + i * slot + shownFor) };
  return { index: null, nextChangeAt: Math.min(showUntil, showFrom + (i + 1) * slot) };
}

/** What the stage says, and what its live region announces, for one symbol: "2 of 5: Yellow square". */
export function pulseCueText(index: number, length: number, name: string): string {
  return `${index + 1} of ${length}: ${name}`;
}
