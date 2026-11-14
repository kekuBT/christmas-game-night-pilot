# Stage 12.11: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks, lint | `DrawPad` pulled out of Draw & Guess, uncommitted, on `675a41d` (Stage 12.10's head) | clean | |
| (no log) `tests/stage1211-team-draw.test.ts`, first run | + the shared word history, Team Draw, its wiring and screens | **13 pass, 1 FAIL** | **My test's mistake:** it expected an oversized drawing piece to be refused as `INVALID_PAYLOAD`. The piece is well-formed, just too big, so the module answers `PAYLOAD_TOO_LARGE`, the right reason (as Draw & Guess does). The test now expects that. |
| (no log) same, seeds 1–12 | + that | 14/14 for every seed | |
| `unit-suite-1.log` | same | **11 FAIL** of 1878 | **All expected**, from a 21st game: the catalogue lists and counts (Team Draw is a team game of 7 minutes whose description says "word"), the registry, `/games`, the practice-only list and the abstention map (no sitting out). Updated. |
| (no log) lint | + those | **3 errors** | All in my new test: an unused variable, an unused assignment, a `let` that should be `const`. Fixed. |
| `unit-suite-2.log` | + those | 1878/1878 | |
| `check-team-draw-t1.log` | + built | 42/0 | **The screenshots showed a fault the checks didn't catch:** on the TV's reveal, each team's name and result sat under the footer. **I added a check** that measures every team's line against the footer, then fixed the size. |
| `check-team-draw-t2-oldcss.log` | + the check, with the CSS deliberately put back to the size of t1 (`52vh`) | 42 pass, **1 FAIL** | The new check catches the fault: `[false,false,false]`. |
| `check-team-draw-t3.log` | + the first fix (`38vh`) | 42 pass, **1 FAIL** | The fault was still there: the size wasn't the whole cause. |
| `check-team-draw-t4-debug.log` | + a temporary `DEBUG` line printing the sizes (removed after) | 41 pass, **2 FAIL** | **Root cause:** every game's TV panel sits in `.mz-tvshow-game`, which is zoomed 1.6× (`stage5.css`), so the board measured 516 px on screen while its CSS width was 322 px. `vh` and pixel sizes there are multiplied. **Second failure, my driver's mistake:** it took Coral's drawing while the second stroke was still arriving in batches, then compared the reveal against that partial copy. It now compares against the finished drawing. |
| `check-team-draw-t5.log` | + boards capped at 400 px (in the zoomed layout: 640 on screen) | 43 pass, **1 FAIL** | Still too tall, as expected at 1.6×. |
| `check-team-draw-t6.log` | + boards capped at 240 px (196 px with 4 teams), smaller TV text, and the driver extended to nine phones in **four** teams (the tightest layout: 4 in a row, and the 2 × 2 scoreboard) | 44/0 | Every team's line is above the footer with 4 teams. |
| `check-draw-guess-n1211.log` | same | 61/0 | Draw & Guess on the shared pad: unchanged behaviour and test ids. |
| `check-draw-sync-n1211.log` | same | 62/0 | The shared pad's batching and resend. |
| `check-warm-ivory-n1211.log` | + W8 allows Team Draw's library cards (added before running, following 12.8–12.10; each must still reuse a base style) | 199/0 | |
| `check-team-huddle-n1211.log` | same | 28/0 | |
| `check-library-n1211.log` | same | 22/0 | |
| `check-team-draw-t7.log` | same | 44/0 | **The committed screenshots come from this run alone.** The local screenshot folder is flat, so other runs overwrite each other's files. |

## Gates (after the local runs; one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261114-193826-9806d1dd-16124` | `9806d1d` | targeted (team-draw, draw-guess, draw-sync, split-clues, team-huddle, relay, teams, warm-ivory, briefing, official-practice, library, library-nav, tv-show, results, quick-party, one-path, session-flow, a11y-surfaces) | **PASSED** (exit 0) | 20/20 | 5 min 29 s |
| `20261114-194400-9806d1dd-19710` | `9806d1d` | fast | **PASSED** (exit 0) | 5/5 (unit 1878/1878) | 1 min 16 s |
| `20261114-194522-9806d1dd-23467` | `9806d1d` | full (checkpoint) | **PASSED** (exit 0) | 102/102 | 39 min 25 s |

No other gate ran on this stage. Every step log is in `docs/evidence/gate-runs/<run>/logs/`. The full gate ran while I worked on Stage 12.12 in another worktree (local drivers on their own servers and ports), so its wall time includes that load.
