# Stage 10.5: local runs (development)

These are **local runs from development, not gate verdicts**. Each was one run with its own server; the drivers used desktop Chromium (chrome-headless-shell). The gate verdicts are in `docs/evidence/gate-runs/`. Every local run of this slice is listed here, the failing ones included.

## Unit and HTTP tests, while writing them
Two runs failed because of mistakes in the new test file, not in the product code. Each was fixed in the test before the server commit was pushed. Their output wasn't saved to a file; the failing lines are quoted.

| Run | Verdict | Cause and fix |
|---|---|---|
| `tests/stage105-book-revision.test.ts`, first run | **7 failed**, 1 passed: `expected 409 to be 201` on each test's first save | The test started a match with a roster that left one member out, which the server refuses (`ROSTER_CHANGED`), so no match finished and nothing could be saved. Fix: the third member joins after the match. |
| The same file, run alongside the other Memory Book test files | **1 failed**, 71 passed: `waitFor timed out` at the TV/spectator/other-room sockets | The test attached its listener to those sockets only after three more requests, so a socket's first frame could arrive before anyone was listening, depending on load. Fix: each socket is listened to as soon as it's created. Then three runs of the seven files together: 72 passed each time. |

## Browser
| Log | Code | What ran | Verdict |
|---|---|---|---|
| `cup-memory-run1.log` | `a3c49e1` (server and web) | `check-cup-memory`, the existing Memory Book journey, on the new web code | exit 0, 36 PASS, 0 FAIL |
| `book-live-run1.log` | `a3c49e1` plus the new driver | `check-book-live` | exit 0, 39 PASS, 0 FAIL |
| `book-live-run2.log` | the driver and a wording fix, committed as `963df5d` | `check-book-live` again (screenshots scrolled to their subject; the failed-approve message no longer repeats "nothing changed") | exit 0, 39 PASS, 0 FAIL |
| `book-live-run3.log` | the driver with B8b (losing the host role) in a casual room, committed as `6edb588` | `check-book-live` | exit 0, 44 PASS, 0 FAIL |

**Measured in `book-live-run2.log`:**
- another member's add showed on the open books in 64 and 72 ms;
- an approval in 79 ms;
- the Markdown came down 12 ms after a revoke;
- back online, the page caught up in 51 ms;
- with no socket at all, the poll brought a change in 1,994 ms.
