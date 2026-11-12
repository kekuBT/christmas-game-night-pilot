/**
 * Stage 10.1 repair (review 6828948844, S101-R3; D-S101-13): reading a page's cup-break log.
 *
 * check-jebena-rush logs every cup that breaks on every page: { n, surface, seat, slot, cups, anim, t }, where
 * `n` numbers the page's events in order. The log is never erased: the end-of-match checks (every break a real
 * lost life, once; one break per life on the TV) need the whole history. A check about a moment (a reconnect,
 * a room switch) takes a cursor just before that moment and looks only at events logged after it, so an
 * earlier, legitimate break can't fail it.
 */

/** Where the log stands now: the next event's number. A later check sees only what comes after it. */
export function cursorOf(log) {
  return log.reduce((next, e) => Math.max(next, (e.n ?? -1) + 1), 0);
}

/** The events logged at or after `cursor` (an event's number, not its position, so the log can only grow). */
export function since(log, cursor) {
  return log.filter((e) => (e.n ?? -1) >= cursor);
}

/**
 * Breaks of this seat logged after `cursor`, on any surface (your own row, the seat list, the results), and only
 * this slot when one is given. A resync must add none: the page didn't see that loss live.
 */
export function newSeatBreaks(log, cursor, seat, slot) {
  return since(log, cursor).filter((e) => e.seat === seat && (slot === undefined || e.slot === slot));
}
