# Trivia and Math Mayhem move on after the answer locks: evidence

- **Handoff:** [7037561069](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7037561069) and D-AA-01 in `docs/DECISIONS.md`.
- **Draft PR:** #57, stacked on #56 at exact base `ce626a82ecebb0f725704f7c3cb6168e5df02215`.
- **Tested commit:** `9f7ed984f589576933bae788cf8b0699d7123af7`. This folder was added afterwards, in a docs-only commit.
  - The product change is `fd9ff39`.
  - `5fb2290` and `9f7ed98` change only drivers.
- **Synthetic local data only.** Chromium emulation, not real phones. This is not independent acceptance; it waits for ChatGPT's review.

## What the check covers: `scripts/check-quiz-advance.mjs`

It starts its own servers. Each screen change is timed in the page (a MutationObserver on the screen's accessible name). The server's projection is read for what it recorded (answers, Math's question opens, the game's status and outcome).

- **S, solo Math Mayhem on a 320×568 touch phone:**
  - **S1:** the countdown appears after the lock the server confirmed.
    - The status line says it once, in words; the ticking number is `aria-hidden`, in no live region and absent from the accessibility tree; Stay on this screen is a real button.
    - Mid-countdown, the number has ticked and the sentence has not changed.
    - With no tap, question 2 opens 3.5–6.5 s after the lock. The server did not open it (start its speed clock) during the countdown.
  - **S2:** a hidden page pauses the countdown, and nothing opens. Once the page is shown, the countdown carries on, neither from zero nor at once.
  - **S3:** Next is tapped twice just as the countdown runs out. There is one step only, and the extra tap does not answer question 4.
  - **S4:** Next question moves on at once.
  - **S5:** keyboard. Tab reaches Next question, then Stay on this screen. Enter on Stay keeps the screen, with a status line, well past the reading time. Tab and Enter on Next question move on.
  - **S6:** after Stay, a later answer in the same game shows no countdown.
  - **S7:** the last answer reaches the results with no countdown. All ten questions were shown in order, once each, and the server recorded ten answers.
  - **S8:** Play again counts down again.
- **R, room Trivia: host 390×844 and guest 320×568.** It runs on a second server with the test-only `MCHEZO_LIFECYCLE_SCALE=0.2`, so the 6-minute deadline becomes 72 s; it is still the server's own deadline.
  - **R1:** the host's answer counts down and moves the host on. The guest, who has not answered, keeps question 1 open. The locked view shows no correctness while the game plays.
  - **R2:** the host plays to the end, by countdown and by Next. The final answer has no countdown and no continuation. The host saw every question once, in order. The server keeps the game playing while the guest has questions, and nothing has been recorded for the guest.
  - **R3:** reconnect during feedback. The guest reloads while the countdown runs. They resume at the next unanswered question, with the seat and the answer kept, recorded once.
  - **R4:** the guest taps Next twice as the countdown runs out. There is one step, and question 3 stays unanswered.
  - **R5:** a missing answer. The guest stops; only the server's deadline ends the game; both phones reach the results.
- **M, room Math Mayhem: host and guest, unscaled server.**
  - **M1:** two seconds into the countdown, question 2 is not opened on the server. After the countdown it is opened and timed from that open, not from the lock.
  - **M2:** both players finish. The server ends the game because everyone answered, and both phones reach the results.

| Run | Revision | Result | Log |
|---|---|---|---|
| Before (negative control) | `ce626a8` (base worktree and its own web build) | **22 FAIL**, 27 PASS | `before-ce626a8.log` |
| After, development build | the product code that became `fd9ff39` | 61 PASS, 0 FAIL | `after-dev.log` |
| After, in the full gate | `9f7ed98`, built by the gate | 61 PASS, 0 FAIL (`PASS (exit 0)`) | `after-gate-9f7ed98-full-check-quiz-advance.log` |

**What the base run shows:**
- Every "moves on by itself" check fails: there is no countdown, and nothing moves on without Next question.
- Solo S3 also shows the old double-tap hazard: the second tap on Next answered question 4 (`the extra tap did not answer question 4 — 4`). The solo section then stops, because that answer had already been taken.

## The carry-over guard was found by this check

- **The failure:** a development run of section R, on the build before the guard, printed (quoted from the run's console; its log file was overwritten by the next run):
  ```
  FAIL R4 one step only: question 3 is on screen — [["Question 2 of 10",-421],["Answer locked in",0],["Question 3 of 10",3048],["Answer locked in",3146]]
  FAIL R4 the extra tap did not answer question 3 — 3
  ```
  - At 3048 ms the first tap moved on.
  - About 100 ms later the second tap landed on an answer of question 3 and locked it.
  - The server recorded three answers.
- **The same hazard on the base:** the before run reproduces it in the old manual flow, in solo Math S3.
- **The fix:** with the 450 ms carry-over guard (D-AA-01), R4 passes. Question 3 stays open, and two answers are recorded.

## The gates

Each verdict below belongs to its own run on its own revision. The code changed only in the drivers after `fd9ff39` (the product code is the same in `fd9ff39`, `5fb2290` and `9f7ed98`), but no result from one revision is counted for another.

| Run | Revision | Verdict | What happened | Summary |
|---|---|---|---|---|
| Targeted, 20 drivers that answer quiz questions | `fd9ff39` | **`FAILED (exit 1)`**, 20/22 | `check-mchezo` and `check-reveal`: each driver's fixed 12-pass answer loop checked for an enabled answer about 300 ms after Next question, inside the new 450 ms carry-over guard. A pass was wasted per question, so ten questions no longer fit. A driver defect, not a product defect; logs `gate-fd9ff39-targeted-check-*.log`. | `gate-fd9ff39-targeted.txt` (run `20261120-112523-fd9ff395-7559`) |
| Targeted, the two failed drivers, `check-quiz-advance` and every driver with the same loop | `5fb2290` (the loops wait up to 700 ms for an enabled answer) | **`PASSED (exit 0)`**, 16/16 | | `gate-5fb2290-targeted.txt` (run `20261120-113924-5fb22906-12746`) |
| Full | `5fb2290` | **`FAILED (exit 1)`**, 116/117 | `check-answer-race`: "math-mayhem: a double tap sends one answer — 2 answer requests" (log `gate-5fb2290-full-check-answer-race.log`). The driver counted every POST to `/intents` for 3.7 s after the tap. With auto-advance, Math moves on after about 4 s, and opening question 2 is its own intent (`math-open`), which fell inside the window on the loaded machine. A local probe with a 5.5 s window recorded `submit-math-answer, math-open`: one answer, then the open. The driver now counts answer intents by action and lists every intent. | `gate-5fb2290-full.txt` (run `20261120-114819-5fb22906-14972`) |
| Targeted: `check-answer-race`, `check-quiz-advance` and `check-math` | `9f7ed98` | **`PASSED (exit 0)`**, 5/5 | `check-answer-race` now prints the intents (`submit-math-answer` only, in this run's window); `check-quiz-advance` 61 checks pass | `gate-9f7ed98-targeted.txt` (run `20261120-123600-9f7ed984-5134`) |
| **Full**: typecheck, lint, unit tests, build and every driver | `9f7ed98` | **`PASSED (exit 0)`**, 117/117 | `check-answer-race` lists `submit-math-answer` only; `check-quiz-advance`, `check-locked-answer` (including L1s) and `check-warm-ivory` pass. Logs: `after-gate-9f7ed98-full-check-*.log`. | `gate-9f7ed98-full.txt` (run `20261120-123848-9f7ed984-5747`) |


## Screenshots

- **`before/`:** base `ce626a8`. The solo Math locked view and the room Trivia guest's locked view, with no countdown and no Stay.
- **`after/`:** from the full gate's run on `9f7ed98`:
  - the solo Math countdown and the stayed screen;
  - the room Trivia host and guest countdowns;
  - the host's final screen;
  - the guest's results, and the solo results.

## Limitations

- Chromium emulation with synthetic data; no native iPhone or Android, and no real screen reader. The accessibility checks read the DOM and Playwright's accessibility snapshot.
- The 4 s reading time and the 450 ms guard are provisional defaults.
- A reload during the countdown resumes at the next unanswered question, which skips the rest of that feedback by design.
- Geography still uses the manual Next question (backlog).
