# Stage 10.4: local runs (development)

These are **local runs from development, not gate verdicts**. Each was one run with its own server, in desktop Chromium (chrome-headless-shell) for the drivers. The gate verdicts are in `docs/evidence/gate-runs/`. Every local run of this slice is here, including the failing ones.

## The Save a memory journeys
Both ran on the web and server code of `317d0dc` plus the driver journeys committed as `c634500`.

| Log | What ran | Verdict |
|---|---|---|
| `check-spectrum-run1.log` | `check-spectrum` with S1 (results save: keyboard, Escape, Cancel, lost reply and Try again, double tap, TV, approve and export) and S2 (the replay's results) | exit 0, 197 PASS, 0 FAIL |
| `check-jebena-rush-run1.log` | `check-jebena-rush` with S1 (results save: points preview, 320 px, Cancel, save, approve and export, scores unchanged) and S2 (the replay's results) | exit 0, 226 PASS, 0 FAIL |

## The shutdown fix (D-S104-05)
The full gate on `c634500` failed `check-tv-outage`: "the driver's server exits within 20 s of SIGTERM". These runs reproduce the cause and show the fix.

| Log | Code | What ran | Verdict |
|---|---|---|---|
| `shutdown-before-fix.log` | `c634500` plus the new test only | `tests/stage104-shutdown.test.ts` | **2 failed**, 1 passed: a deaf TV socket and a refused socket each kept `close()` waiting past 5 s ("expected 'still waiting' to be 'closed'") |
| `shutdown-after-fix.log` | the fix, committed as `3041791` | the same test | 3 passed (about 1.6 s each for the first two) |
| `tv-outage-run1.log`, `-run2.log`, `-run3.log` | `3041791` | `check-tv-outage`, three runs one after another | each exit 0, 14 PASS, 0 FAIL |

## The durability repair (D-S104-06, review 6842636842)
A failed Memory Book write could become a false "Saved" on a retry and lose the note on restart. These runs reproduce it and show the repair.

| Log | Code | What ran | Verdict |
|---|---|---|---|
| `durability-before-fix.log` | `843aae2` (the reviewed code) plus the new test only | `tests/stage104-book-durability.test.ts` | **4 failed**, 1 passed. A save's entry was still listed after a failed write (`expected [ { id: 'book-1', … } ] to deeply equal []`), after one failure and after repeated ones; a failed manual Add still added its entry; a failed approval still showed the entry approved. The passing case is the committed save with a lost reply, which never fails a write. |
| `durability-after-fix.log` | the fix, committed as `0b5a4a2` | the same test | 5 passed |
| `memory-regression-after-fix.log` | `0b5a4a2` | the Memory Book tests: Stage 10.4 durability, save and shutdown, 10.3 team results, 10.2 freshness, Stage 4 file names | 53 passed in 6 files |
| `check-spectrum-run2.log` | `0b5a4a2` plus the new driver step, committed as `3a5590a` | `check-spectrum`, with the composer after a 500 (the server's own reply for a failed write, stubbed in the browser) | exit 0, 199 PASS, 0 FAIL |
