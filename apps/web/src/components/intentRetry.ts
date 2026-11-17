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
 * Beta R4 (reviews 6935165862 and 6936791624): when the retries end on a
 * 502, 503 or 504 that carries no error of the app's own, the answer came
 * from something between the phone and the game (a proxy, or the host's
 * edge while the server restarts), not from the game. The action may or may
 * not have reached the server: a restart can lose the reply to an action the
 * server already recorded. describeIntentFailure turns that case into the
 * same "couldn't confirm" wording as a dropped connection, which never
 * claims either way; the screen then shows the server's own state.
 *
 * The boundary. Mchezo's intents endpoint (src/server/http.ts) answers 200
 * (accepted, or {accepted:false, reason:<code>}), 4xx {error} or 500 {error};
 * it never answers 502, 503 or 504, and its replies carry no header that
 * would prove they came from the game. So for those three statuses a body
 * counts as the app's only when one of its error, reason or code strings is
 * one of Mchezo's EXISTING app errors (isKnownAppError: an error with an
 * established message in errors.ts). Generic JSON from a gateway, such as
 * {"error":"Bad Gateway"}, {"code":"SERVICE_UNAVAILABLE"} or
 * {"reason":"upstream timeout"}, is not, and is unconfirmed like HTML or an
 * empty body. Other statuses (4xx, 500) are unchanged.
 */
import { NOT_DELIVERED, isKnownAppError } from "../ui/mchezo/lib/errors.js";
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

/**
 * The body's app error, if it carries one of Mchezo's existing app errors in
 * its error, reason or code field (in that order); otherwise undefined.
 * A non-empty string the app never produces does not count.
 */
function knownAppError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  for (const k of ["error", "reason", "code"]) {
    const v = b[k];
    if (typeof v === "string" && isKnownAppError(v)) return v.trim();
  }
  return undefined;
}

/**
 * True when a final 502, 503 or 504 came from an intermediary, not the game:
 * the body carries none of Mchezo's existing app errors (HTML, empty, or a
 * gateway's generic JSON). Such a send is UNCONFIRMED: it may or may not
 * have been recorded.
 */
export function isUnconfirmedIntermediaryFailure(res: IntentResponse): boolean {
  return INTERMEDIARY_STATUSES.has(res.status) && knownAppError(res.body) === undefined;
}

/**
 * The message for a send that ended with an HTTP error (status >= 400):
 * - a 502, 503 or 504: the "couldn't confirm" wording, unless the body
 *   carries one of Mchezo's existing app errors, which is shown as itself
 *   (humanError translates it);
 * - any other status (4xx, 500): unchanged, the body's error, else the bare
 *   status.
 */
export function describeIntentFailure(res: IntentResponse): string {
  if (INTERMEDIARY_STATUSES.has(res.status)) return knownAppError(res.body) ?? NOT_DELIVERED;
  const b = (typeof res.body === "object" && res.body !== null ? res.body : {}) as { error?: unknown };
  return typeof b.error === "string" && b.error !== "" ? b.error : `Request failed (${res.status})`;
}
