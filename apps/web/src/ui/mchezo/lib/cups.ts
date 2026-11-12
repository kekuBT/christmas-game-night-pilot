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
 *
 * Stage 10.1 repair (review 6822605156, S101-R2; D-S101-09): a count only
 * counts while this page has watched continuously.
 * - The memory belongs to one scope: a room and seat, or a watched room.
 *   Another scope clears it, so ids that repeat in another room (game-1,
 *   player-2) never compare.
 * - Every loss of continuity (a socket closing, staleness, going offline,
 *   coming back from the background) starts a new epoch. A count recorded in
 *   an earlier epoch never breaks a cup: the next view is a first view.
 */
export class CupMemory {
  private readonly seen = new Map<string, { n: number; epoch: number }>();
  private scope: string | null = null;
  private epoch = 0;
  /** Use the memory for this room and seat (or watched room); anything else is forgotten. */
  setScope(scope: string | null): void {
    if (scope === this.scope) return;
    this.scope = scope;
    this.seen.clear();
    this.epoch += 1;
  }
  /** Continuity was lost: what this page saw before can no longer break a cup. */
  rebaseline(): void {
    this.epoch += 1;
  }
  /** What a view of `n` cups breaks, against the last count recorded for `key` in this epoch; nothing on a first view or when nothing was lost. */
  breaks(key: string, n: number): CupBreak | null {
    const before = this.seen.get(key);
    if (!before || before.epoch !== this.epoch) return null;
    return n < before.n ? { from: Math.max(0, n), to: before.n } : null;
  }
  record(key: string, n: number): void {
    this.seen.set(key, { n, epoch: this.epoch });
  }
  /** How many places are remembered (for tests: a new scope starts empty). */
  get size(): number {
    return this.seen.size;
  }
}

/** Animate this break? Only a live one: the server recorded the loss within LIVE_BREAK_MS of now (a second guard; continuity is the first). */
export function isLiveBreak(brk: CupBreak | null, lostAt: number | undefined, serverNow: number): boolean {
  if (!brk || lostAt === undefined) return false;
  const age = serverNow - lostAt;
  return age <= LIVE_BREAK_MS && age >= -LIVE_BREAK_MS;
}
