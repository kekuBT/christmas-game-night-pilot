# Stage 12.12: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks | the board, the module and its wiring, uncommitted, on `9806d1d` (Stage 12.11's tested commit) | **1 error** | I gave the manifest an input type that doesn't exist (`"tap"`); Territory's input is `"choice"`. Fixed. I also used a new category, "strategy", then switched to existing ones (knowledge, quiz, team) so the library's category list doesn't change. |
| (no log) `tests/stage1212-territory.test.ts` | + the screens | 10/10 | Before the first run I removed one line of my own that expected the wrong reason: an out-of-range choice is refused as `INVALID_PAYLOAD` before the "already answered" check. Another line tests "already answered". |
| `unit-suite-1.log` | same | **11 FAIL** of 1889 | **All expected**, from a 22nd game: the catalogue counts and lists (Territory is a knowledge/quiz team game of 6 minutes), the registry, `/games`, the practice-only list and the abstention map. Updated. |
| `unit-suite-2.log` | + those | 1889/1889 | Lint and both typechecks clean. |
| `check-territory-t1.log` | + built | 30 pass, **1 FAIL** | **My driver's mistake:** it checked that Sun's phone showed no pick *after* Sun had picked A2 itself, so Sun's phone rightly marked its own pick. The driver now checks Sun's and Mint's phones and the TV before Sun picks, then that Sun sees its own pick. |
| `check-territory-t2.log` | + that | 32/0 | **From the screenshots:** the TV scoreboard's "biggest land 3" wrapped badly, so it's now "3 cells · 3 joined". A claimable cell under the previous click showed its hover outline, so the driver now moves the mouse away before each screenshot. |
| `check-territory-n1212.log` | + those | 32/0 | |
| `check-warm-ivory-n1212.log` | same (W8 allows Territory's library cards, added before running, as in 12.8–12.11) | 199/0 | |
| `check-team-huddle-n1212.log` | same | 28/0 | Team Huddle's questions now come through the shared Trivia-pool path (`triviaQuiz`). |
| `check-library-n1212.log` | same | 22/0 | |
| `check-territory-t3.log` | same | 32/0 | **From the screenshot:** the team's chosen answer was dimmed with the other disabled options. Now it stays at full strength and the others fade (Territory's CSS only). |
| `check-territory-t4.log` | + that | 32/0 | **The committed screenshots come from this run alone.** The drivers above ran before this CSS-only change to Territory's answer buttons, which no other screen uses. |

## Gates (after the local runs; one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261114-202618-e92dae9c-23806` | `e92dae9` | targeted (territory, team-huddle, answer-reveal, content-variety, content-look, team-draw, split-clues, relay, teams, warm-ivory, briefing, official-practice, library, library-nav, tv-show, results, quick-party, one-path, session-flow, a11y-surfaces) | **PASSED** (exit 0) | 22/22 | 5 min 49 s |
| `20261114-203212-e92dae9c-27750` | `e92dae9` | fast | **PASSED** (exit 0) | 5/5 (unit 1889/1889) | 1 min 06 s |
| `20261114-203324-e92dae9c-31480` | `e92dae9` | full | **FAILED** (exit 1): infrastructure, disk full | 2 passed, `build-web` failed with `ENOSPC`; the gate then crashed writing its own log, so no summary | under 1 min |
| `20261114-204033-e92dae9c-638` | `e92dae9` | full (checkpoint) | **PASSED** (exit 0) | 103/103 | 38 min 31 s |

**The failed full gate:** each gate clones the revision and builds into the clone, and I had kept the earlier clones (100–400 MB each), so the disk filled. Every step log the run wrote is in its folder. Since then each clone is deleted once its evidence is copied. A gate that crashes on a full disk still exits non-zero, but it leaves no `summary.txt`; that is a gap in the gate's reporting, not fixed here.

No other gate ran on this stage. The re-run ran while I built Tug of War and Know Your Rivals in other worktrees (local drivers on their own servers and ports), so its wall time includes that load.
