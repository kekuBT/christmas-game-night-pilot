# Beta R4: uncertain delivery after an intermediary 502, 503 or 504 (review 6935165862, item 4)

**What changes.** When every retry of a player's tap ends on a 502, 503 or 504 that carries **no error of the app's own**, the answer came from something between the phone and the game, such as a proxy or the host's edge while the server restarts.
- **Before:** the phone showed the raw text `Request failed (502)`.
- **Now:** it shows the existing wording for an unconfirmed send. That wording never claims the server didn't receive the tap; the screen then shows the server's own state.

> We couldn’t confirm that — check your connection. If it doesn’t show as in, try again.

**A runtime change, on a separate stacked draft PR.** The **release pin `7097ac2` is unchanged** until an explicit candidate review. This doesn't authorize W5 or any deployment.

## The change
- **`apps/web/src/components/intentRetry.ts`** gains two functions:
  - `isUnconfirmedIntermediaryFailure(res)` is true only for a final 502, 503 or 504 whose body has no non-empty `error`, `code` or `reason` string. The server itself never answers 502, 503 or 504 (`src/server`).
  - `describeIntentFailure(res)` returns `NOT_DELIVERED` for that case. Otherwise it returns the app's own `error` unchanged (which `humanError` then translates), or `Request failed (<status>)` when the body says nothing.
- **`apps/web/src/App.tsx` `sendAction`:** `throw new Error(describeIntentFailure(res))` replaces `throw new Error(r.error || \`Request failed (${res.status})\`)`.
  - A misleading comment is corrected: a dropped connection "may or may not" have reached the server.
- **Unchanged:**
  - the retry (three tries, the identical request, one `clientEventId`);
  - the pending state;
  - the event id kept for reconciliation, which drives the "That went through after all" line;
  - the server, its dedupe and exactly-once scoring;
  - typed app errors.

## The checks
| Check | What it proves | Result |
|---|---|---|
| **Unit:** `tests/correctness.test.ts`, "an exhausted intermediary 502/503/504 is unconfirmed" | <ul><li>**Server down** (502, 503 and 504 each): three tries, one request and event id; unconfirmed; shown as `NOT_DELIVERED`, never a status code.</li><li>**Committed, reply lost:** a 502 then the server's deduped original is a plain success; with every reply lost, the wording is `NOT_DELIVERED`, which never says "not received".</li><li>**Typed app errors** on a 5xx stay themselves (`error`, `code`, `reason`).</li><li>**4xx errors** aren't retried or reworded.</li><li>**A bare 500 or 404** is unchanged.</li></ul> | See the final gate |
| **Browser:** `scripts/check-uncertain-delivery.mjs` (Chromium, a real server, Trivia; the intermediary simulated by routing `POST /rooms/:id/intents`) | <ul><li>**A, server down** (502, 503 and 504): three tries with one event id; "couldn't confirm"; no `Request failed`; not shown as in; nothing recorded; a re-tap locks in once and the line goes.</li><li>**B, committed and every reply lost:** recorded exactly once; LOCKED IN from the server's state; "That went through after all"; a replay returns the original; a fresh tap doesn't count twice.</li><li>**C:** a 503 with the app's typed error keeps its wording.</li><li>**D:** a real `UNKNOWN_QUESTION` rejection keeps its wording.</li></ul> | See the final gate |
| **The negative control:** the same driver on the **unrepaired** client (`8101c5c`, the pinned runtime's client) | It must fail on the wording | **FAILED (exit 1), 6 failures:** for each of 502, 503 and 504, "couldn't confirm" never appeared and `Request failed (5xx)` was shown. **B, C and D passed there too.** The existing reconciliation already replaces the line once the server's state arrives, so **case A is the one that discriminates.** ([gate log](dev/before-unrepaired-gate.log), [driver log](dev/before-unrepaired-driver.log), [screenshot](screens/before-a-502-unrepaired-390.png)) |

## Dev runs (before the tested commit)
| Run | Verdict | Notes | Evidence |
|---|---|---|---|
| Targeted 1: `uncertain-delivery`, `action-ack`, `errors` | PASSED (exit 0) | The new driver's checks all passed; `action-ack` (the reply-lost and never-arrived cases) and `errors` were unchanged | [gate](dev/targeted-dev1.log), [driver](dev/targeted-dev1-driver.log) |
| Its A-502 screenshot | A finding about the evidence, not the app | The tapped tile was **mid-animation** (it animates back after a failed send) and overlapped its neighbours. The driver's next checks found every tile tappable. The driver now waits until the tiles are back in place before the screenshot, and that is checked. | |
| Targeted 2: `uncertain-delivery` | PASSED (exit 0) | The tiles settled (no overlap) for 502, 503 and 504 | [gate](dev/targeted-dev2.log), [driver](dev/targeted-dev2-driver.log), [screenshot](screens/dev2-after-a-502-settled-390.png) |
| The negative control (unrepaired client) | **FAILED, as required** | See above | |

## The final (one run, on one revision)
**A full gate on a clean checkout of the tested commit `f4c558f7dc589ec704ce3c9a2fbd008e94d3dc14`** (status 0 lines): `MCHEZO_CHROMIUM_PATH=<chrome-headless-shell 1243> node scripts/gate.mjs full`.

**The verdict: PASSED (exit 0),** run `20261117-021501-f4c558f7-19428`.
- **112 passed, 0 failed,** 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled, 0 not run.
- **Wall time:** 41 min 20 s, on 3 workers.
- **The steps:**
  - typecheck (server and web), lint and build;
  - **unit tests: 163 files, 2,077 tests passed**, including the new intermediary cases in `tests/correctness.test.ts`;
  - E2E (Chromium);
  - every `scripts/check-*.mjs` driver, including **`check-uncertain-delivery`, all 47 checks passed** (A 502, 503, 504; B; C; D), and the unchanged `check-action-ack` and `check-errors`.

**Evidence:**
- [the gate log](final/gate-full-final.log) and [summary](final/summary.txt);
- the logs: [unit tests](final/04-unit-tests.log), [uncertain-delivery](final/56-check-uncertain-delivery.log), [action-ack](final/76-check-action-ack.log), [errors](final/107-check-errors.log);
- the screenshots: [A, 502, couldn't confirm](final/screens/a-502-couldnt-confirm-390.png) and [B, 502, committed, went through](final/screens/b-502-committed-went-through-390.png).

