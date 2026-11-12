/**
 * Stage 10.2 repair (review 6831760093, S102-R2; D-S102-07): waiting for an observation against an absolute deadline.
 *
 * A driver's usual `soon` retries a probe until a timeout, but a single probe (a Playwright locator waiting for a
 * missing element) can itself block for 30 s, so "within 3 s" could silently mean "within 33 s". `soonUntil` races
 * every probe against the time left: no probe may run past the deadline, and an observation that comes late, or
 * never, is reported as a FAIL through the driver's own `check`. It never retries after the deadline.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `check(label, ok, detail)` is the driver's reporter; resolves with the probe's first truthy value, or null. */
export async function soonUntil(check, label, fn, until) {
  let last = null;
  while (Date.now() < until) {
    const left = until - Date.now();
    let timer;
    try {
      const v = await Promise.race([fn(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("the probe was still running at the deadline")), left); })]);
      if (v) { check(label, true); return v; }
    } catch (e) { last = e; } finally { clearTimeout(timer); }
    await sleep(Math.min(100, Math.max(0, until - Date.now())));
  }
  check(label, false, `not by the deadline${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`);
  return null;
}
