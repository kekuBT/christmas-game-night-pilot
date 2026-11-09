/**
 * Stage 5.1 (S5-AUD-04, S5-AUD-07): is what this screen shows still live?
 *
 * The app hears about the room two ways: WebSocket pushes and HTTP polls
 * every 2 s. Two gaps let a screen go stale with no warning:
 *  - a poll could hang forever (no timeout), so it never counted as a
 *    failure and further polls piled up behind it;
 *  - a socket can stay "open" but deliver nothing (a stalled tunnel or a
 *    half-open mobile connection), and the browser never says so.
 * Reproduced by `check-draw-sync`: a guesser whose socket and polls both
 * stalled sat on an empty canvas for the whole turn with no message.
 *
 * Now every poll has a timeout, and any projection (pushed or polled)
 * proves the screen is live. When none has arrived for STALE_AFTER_MS the
 * screen says so (phones: the connection banner; TV: a stale-display note)
 * and a silent socket is recycled. The last known screen stays on show.
 * Pure helpers, so unit tests can load them.
 */
export const POLL_TIMEOUT_MS = 6000;
/** Polls run every 2 s; three missed in a row is not a blip. */
export const STALE_AFTER_MS = 8000;

/** fetch with a timeout and no HTTP caching: a stalled request fails instead of hanging. */
export function fetchFresh(input: string, init: RequestInit = {}, timeoutMs = POLL_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(input, { ...init, cache: "no-store", signal: ac.signal }).finally(() => clearTimeout(t));
}

/** Has nothing proved the screen live for longer than the allowance? */
export function isStale(lastFreshAt: number, now: number, staleAfterMs = STALE_AFTER_MS): boolean {
  return now - lastFreshAt > staleAfterMs;
}

/**
 * The watchdog's decision for one tick: tell the screen it went stale (once
 * per episode), tell it it's live again, or nothing.
 */
export function livenessStep(state: { staleMarked: boolean }, lastFreshAt: number, now: number, staleAfterMs = STALE_AFTER_MS): "went-stale" | "back" | null {
  const stale = isStale(lastFreshAt, now, staleAfterMs);
  if (stale && !state.staleMarked) { state.staleMarked = true; return "went-stale"; }
  if (!stale && state.staleMarked) { state.staleMarked = false; return "back"; }
  return null;
}
