# Stage 12.14: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) server typecheck | the question pack, the module and its server wiring, uncommitted, on `945cc01` (Stage 12.13's tested commit) | clean | |
| (no log) a review of my own module before testing | same | **1 design fix** | If nobody in any team answered, the guess phase would still wait its 25 s with nothing to guess. It now goes straight to the reveal (and there is a test for it). |
| (no log) both typechecks | + the screens, the CSS and the web wiring | clean | |
| (no log) `tests/stage1214-know-your-rivals.test.ts`, first run | + the tests | 10/10 | Before running I corrected my own catch-up test: its expected totals were wrong (Mint is already the catch-up team after round 1, not round 2). |
| (no log) the catalogue tests | + the counts for a 24th game, updated **before** running (12.13's pattern: Know Your Rivals is a social/party team game of 6 minutes) | **1 failed** | I had missed the "8 minutes or less" list, which Know Your Rivals now joins. Fixed: 14/14, and the other four files 89/89. |
| (no log) lint | same | clean | |
| `check-know-your-rivals-t1.log` | + built | 37/0 | **The committed screenshots come from this run alone** (copied before any other driver ran). |
| `check-warm-ivory-n1214.log` | same (W8 allows Know Your Rivals' library cards, added before running, as in 12.8–12.13) | 199/0 | |
| `check-library-n1214.log` | same | 22/0 | |
| `check-teams-n1214.log` | same | 24/0 | |
| `unit-suite-1.log` | same | 1909/1909 | |
| (no log) both typechecks again | same | **1 error** | In my test: `m.finished(s)` without its context argument (Vitest doesn't typecheck). Fixed; the test file 10/10 again. |

## Gates (after the local runs; one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261114-231635-d1c72173-363` | `d1c7217` | targeted (know-your-rivals, territory, tug-of-war, team-draw, split-clues, team-huddle, relay, teams, warm-ivory, briefing, official-practice, library, library-nav, tv-show, results, quick-party, one-path, session-flow, a11y-surfaces, content-variety) | **PASSED** (exit 0) | 22/22 | 6 min 43 s |
| `20261114-232326-d1c72173-4680` | `d1c7217` | fast | **PASSED** (exit 0) | 5/5 (unit 1909/1909) | 1 min 08 s |
| `20261114-232442-d1c72173-8548` | `d1c7217` | full (checkpoint) | **PASSED** (exit 0) | 105/105 | 39 min 57 s |

No other gate ran on this stage. A queued chain for these gates was stopped by me before it started (it would have hit the 2-hour limit for a background job); it ran nothing. The full gate ran while I built Stage 12.15 in another worktree (local drivers on their own servers and ports), so its wall time includes that load.
