/**
 * Stage 10.1 (docs/stage10/stage101.md §3–§5, D-S101-03): Jebena Rush's lives
 * as cini, small handleless coffee cups. Pure: which slots are whole or
 * broken, the words, and when a cup breaks on this page.
 *
 * The server owns the count (its `hearts` fields, D-S101-02). These only show
 * it. A cup "breaks" (animates) only when this page saw a larger count for the
 * same game and seat before, and the server recorded the loss moments ago: a
 * first view, a reload or a resync after a gap shows broken cups without
 * breaking them again.
 */

/** How long a cup takes to break (the CSS animation is a little shorter). */
export const CUP_BREAK_MS = 650;
/** A loss the page first sees more than this long after the server recorded it is a resync, not a live break. */
export const LIVE_BREAK_MS = 3000;

export type CupState = "whole" | "broken";

const clampCups = (n: number, of: number) => Math.max(0, Math.min(Math.floor(n), of));

/** Slots left to right: whole cups first, broken ones after, each staying in its slot. */
export function cupSlots(n: number, of: number): CupState[] {
  const whole = clampCups(n, of);
  return Array.from({ length: Math.max(0, of) }, (_, i) => (i < whole ? "whole" : "broken"));
}

/** The accessible words: "3 of 5 cups remaining"; at zero, "0 of 5 cups: out". */
export function cupsLabel(n: number, of: number): string {
  const whole = clampCups(n, of);
  return whole === 0 ? `0 of ${of} cups: out` : `${whole} of ${of} cups remaining`;
}

/** "a cup" / "3 cups". */
export function cupsCount(n: number): string {
  return n === 1 ? "1 cup" : `${n} cups`;
}

/** When this seat last lost a cup, by the server's clock: its latest timeout in the public log. */
export function lastLossAt(log: readonly { kind: string; player?: string; at?: number }[] | undefined, id: string | undefined): number | undefined {
  if (!id) return undefined;
  for (let i = (log?.length ?? 0) - 1; i >= 0; i--) {
    const e = log![i]!;
    if (e.kind === "timeout" && e.player === id) return e.at;
  }
  return undefined;
}

/** The slots a new count breaks: [from, to). */
export interface CupBreak { from: number; to: number }

/**
 * The last count this page showed for each place cups are drawn (a game, a
 * seat and a surface). Nothing is stored anywhere else, so a reload starts
 * empty and never replays a break.
 */
export class CupMemory {
  private readonly seen = new Map<string, number>();
  /** What a view of `n` cups breaks, against the last count recorded for `key`; nothing on a first view or when nothing was lost. */
  breaks(key: string, n: number): CupBreak | null {
    const before = this.seen.get(key);
    return before !== undefined && n < before ? { from: Math.max(0, n), to: before } : null;
  }
  record(key: string, n: number): void {
    this.seen.set(key, n);
  }
}

/** Animate this break? Only a live one: the server recorded the loss within LIVE_BREAK_MS of now. */
export function isLiveBreak(brk: CupBreak | null, lostAt: number | undefined, serverNow: number): boolean {
  if (!brk || lostAt === undefined) return false;
  const age = serverNow - lostAt;
  return age <= LIVE_BREAK_MS && age >= -LIVE_BREAK_MS;
}
