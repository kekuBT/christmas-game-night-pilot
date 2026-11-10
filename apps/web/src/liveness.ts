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
 * Now every poll has a timeout that covers the whole reply, and any projection (pushed or polled)
 * proves the screen is live. When none has arrived for STALE_AFTER_MS the
 * screen says so (phones: the connection banner; TV: a stale-display note)
 * and a silent socket is recycled. The last known screen stays on show.
 * Pure helpers, so unit tests can load them.
 */
export const POLL_TIMEOUT_MS = 6000;
/** Polls run every 2 s; three missed in a row is not a blip. */
export const STALE_AFTER_MS = 8000;

/**
 * A poll: fetch AND read the reply under one timeout, with no HTTP caching.
 *
 * fetch() resolves as soon as the headers arrive. The first version cleared
 * its timer there, so a reply that sent its headers and then stalled
 * part-way through the body (review of PR #4: headers, then "{", then
 * nothing) hung forever. The poll loops' one-at-a-time guard then held, and
 * no later poll ran, even after the network recovered. Now the timer runs
 * until `read` has finished with the body. On expiry it aborts the request,
 * which also cancels a body read in progress and closes the connection, and
 * the poll rejects even if `read` ignores the abort.
 */
export async function pollFresh<T>(input: string, init: RequestInit, read: (r: Response) => Promise<T>, timeoutMs = POLL_TIMEOUT_MS): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new DOMException(`The game server did not answer within ${timeoutMs} ms.`, "TimeoutError"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(input, { ...init, cache: "no-store", signal: ac.signal }).then(read), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One poll at a time: a call made while the previous one is still running is
 * skipped. The guard is released however the run ends (the phone and the TV
 * both poll through this), so a failed or timed-out poll never blocks the
 * next.
 */
export function oneAtATime(run: () => Promise<unknown>): () => Promise<void> {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try { await run(); } catch { /* the caller's run reports its own failures */ } finally { busy = false; }
  };
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
