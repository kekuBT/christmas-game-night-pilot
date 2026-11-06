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
 */
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
