/**
 * Sending a game action ("intent") reliably.
 *
 * The server deduplicates intents by clientEventId and answers a repeat
 * with the original result. That only helps if a retry reuses the same
 * id: the client used to mint a new id per attempt, so a lost response
 * followed by a second tap produced ALREADY_ANSWERED instead of the
 * original "accepted", and the dedupe never did anything.
 *
 * sendIntent retries the identical request (same body, same id) on a
 * network failure or a 5xx, with short backoff. It never retries a 4xx:
 * the server answered, and repeating cannot change the answer.
 *
 * Beta R4 (review 6935165862): when the retries end on a 502, 503 or 504
 * that carries no error of the app's own, the answer came from something
 * between the phone and the game (a proxy, or the host's edge while the
 * server restarts), not from the game. The action may or may not have
 * reached the server: a restart can lose the reply to an action the server
 * already recorded. describeIntentFailure turns that case into the same
 * "couldn't confirm" wording as a dropped connection, which never claims
 * either way; the screen then shows the server's own state.
 */
import { NOT_DELIVERED } from "../ui/mchezo/lib/errors.js";
export interface IntentResponse {
  status: number;
  body: unknown;
}

export interface RetryOptions {
  attempts?: number;
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export async function sendIntent(send: () => Promise<IntentResponse>, opts: RetryOptions = {}): Promise<IntentResponse> {
  const attempts = opts.attempts ?? 3;
  const delays = opts.delaysMs ?? [400, 1200];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delays[Math.min(attempt - 1, delays.length - 1)] ?? 1000);
    try {
      const res = await send();
      if (res.status < 500) return res;
      lastError = new Error(`Server error (${res.status})`);
      if (attempt === attempts - 1) return res;
    } catch (err) {
      lastError = err; // network failure: the request may or may not have arrived
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

/** The statuses a proxy or a host's edge answers when the game behind it is unreachable. */
const INTERMEDIARY_STATUSES = new Set([502, 503, 504]);

/** True when the body carries an error of the app's own: a non-empty `error`, `code` or `reason` string. */
function hasAppError(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return ["error", "code", "reason"].some((k) => typeof b[k] === "string" && (b[k] as string).trim() !== "");
}

/**
 * True when a final 502, 503 or 504 came from an intermediary, not the game:
 * no error of the app's own in the body. Such a send is UNCONFIRMED: it may
 * or may not have been recorded.
 */
export function isUnconfirmedIntermediaryFailure(res: IntentResponse): boolean {
  return INTERMEDIARY_STATUSES.has(res.status) && !hasAppError(res.body);
}

/**
 * The message for a send that ended with an HTTP error (status >= 400):
 * the "couldn't confirm" wording for an unconfirmed intermediary failure;
 * otherwise the app's own error, unchanged (humanError translates it), or
 * the bare status when the body says nothing.
 */
export function describeIntentFailure(res: IntentResponse): string {
  if (isUnconfirmedIntermediaryFailure(res)) return NOT_DELIVERED;
  const b = (typeof res.body === "object" && res.body !== null ? res.body : {}) as { error?: unknown };
  return typeof b.error === "string" && b.error !== "" ? b.error : `Request failed (${res.status})`;
}
