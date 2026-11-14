# Stage 12.13: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks, lint | the module, its wiring and screens, uncommitted, on `e92dae9` (Stage 12.12's tested commit) | clean | |
| (no log) `tests/stage1213-tug-of-war.test.ts`, first run | + the tests | 8/8 | Before running I simplified two lines of my own test: one overwrote a result that the next step overwrote again, and one asserted a phase through a needlessly complex condition. |
| `unit-suite-1.log` | + the catalogue counts for a 23rd game, updated **before** running (12.12's pattern: Tug of War is a math/speed team game of 4 minutes) | 1898/1898 | |
| (no log) lint | same | **1 error** | An unused assignment in my test. Fixed. |
| (no log) the same test file | + **a design fix found while writing the driver:** the kit's catch-up gap (100) can't be reached here with 2 or 3 teams, because last place still scores 55 or 40 per bout. Tug of War now uses its own gap of 40, and its catch-up test was rewritten for it | 8/8 | |
| `check-tug-of-war-t1.log` | + built | 24/0 | **From the screenshots:** the star's drawing had an empty band below its arms, which pushed the sum down on phones and left the TV's caption stranded. The drawing now hugs the arms, and the phone rope is smaller. |
| `check-tug-of-war-n1213.log` | + that | 24/0 | |
| `check-warm-ivory-n1213.log` | same (W8 allows Tug of War's library cards, added before running, as in 12.8–12.12) | 199/0 | |
| `check-library-n1213.log` | same | 22/0 | |
| `check-relay-n1213.log` | same | 22/0 | Relay shares the sum generator. Its run overwrote `frozen-390.png` in the flat local screenshot folder, so Tug of War's driver was run again last. |
| `check-tug-of-war-t2.log` | same | 24/0 | **The committed screenshots come from this run alone.** |

## Gates (after the local runs; one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261114-211911-945cc01a-24896` | `945cc01` | targeted (tug-of-war, relay, math, math-timing, math-network, territory, team-draw, split-clues, team-huddle, teams, warm-ivory, briefing, official-practice, library, library-nav, tv-show, results, quick-party, one-path, session-flow, a11y-surfaces) | **PASSED** (exit 0) | 23/23 | 6 min 49 s |
| `20261114-212608-945cc01a-28684` | `945cc01` | fast | **PASSED** (exit 0) | 5/5 (unit 1898/1898) | 1 min 10 s |
| `20261114-212727-945cc01a-32475` | `945cc01` | full (checkpoint) | **PASSED** (exit 0) | 104/104 | 39 min 10 s |

No other gate ran on this stage. Every step log is in `docs/evidence/gate-runs/<run>/logs/`. These ran while I built Know Your Rivals in another worktree (local drivers on their own servers and ports), so the wall times include that load.
