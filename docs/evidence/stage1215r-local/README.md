# Stage 12.15-R: local runs (every run, failures included)

**What these are:** local runs during the repair, before the gates. They are not gate verdicts; the gates are in `docs/evidence/gate-runs/`.

## The new tests on #39's source: they reproduce the faults

The new test files were copied, unchanged, into a worktree at #39's head `1eafe41` (tested source `bcf1406`), run there, and removed again.

| Log | Result on `1eafe41` | What it shows |
|---|---|---|
| `relay-before-1eafe41.log` (`tests/stage1215r-relay.test.ts`) | **10 FAIL**, 2 pass of 12 | Every R1, R4 and R5 reproduction fails: a fully active team of 3, 4 or 5 doesn't qualify; wrong answers aren't actions; the TV's lane stays frozen; equal legs tie. The 2 that pass are compatibility guards (a race saved before the repair keeps its count; a game recorded without places is placed by score), which must hold on both. |
| `repairs-before-1eafe41.log` (`tests/stage1215r-repairs.test.ts`) | **6 FAIL**, 3 pass of 9 | R2: the review's case (Sun 30, Coral 0), three teams, several opting out, partial answers, the Official Cup game. R3: the skipped last question's prompt in the finished views. The 3 that pass are coverage the review asked for that the old code already met: equal accuracy when everyone answers, catch-up, and a skip in the middle of a game. |
| `recaps-before-1eafe41.log` (`tests/stage1215r-recaps.test.ts`, its first version, before the two screen lines were added) | **4 FAIL** of 4 | R6: `resultLine` and the night card name two teammates "tie for first"; the lobby summary didn't exist as a function (its import fails); a real Relay's recap lines. |

## Runs on the repaired source

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) typecheck | Relay, room, team results, medals changed | **1 error** | A possibly undefined turn record in Relay's participation; fixed. |
| (no log) `stage1215r-relay.test.ts`, first run | + the tests | **2 FAIL** of 12 | **My tests' mistake:** they jumped the clock straight to Relay's 4-minute limit. On the way, every turn ran out 20 s at a time, so the runners were rightly counted as idle (4 minutes without answering), not "cut off". The tests now bring the limit to 1 s after the last answer. |
| (no log) the same | + that | 12/12 | |
| (no log) `stage1214-know-your-rivals.test.ts` | + mutual guessing | **3 FAIL** of 10 | All three asserted the old rule, which the review found unfair: a team where nobody answered still guessing; `teamStatus` without `guessing`; a room test where only one team answered expecting a guess phase. Updated to the new rule (one player of each team answers in the room test). |
| `unit-suite-1.log` | + Know Your Rivals, Family, recaps, their tests | 1954/1954 | |
| `check-relay-r1.log` | + the drivers' new checks, built | 24/0 | The TV's lane says "(frozen)", then stops when the freeze ends, with no other answer. |
| `check-know-your-rivals-r1.log` | same | 44/0 | Round 4: Sun opts out: its phones' sit-out screen, its guess refused, "Sitting this one out" on the TV, Coral and Mint's locks close the phase, Sun 0, the reveal's line. |
| `check-family-questions-r1.log` | same | 103/0 | A second game whose last question the host skips: nothing of it in the TV's data, any phone's game data, other phones' data at all, or any screen. |
| `check-cup-team-games-r1.log` | same | 26/0 | The lobby's last game, the TV's lobby list and the night card name Team Sun. |
| (no log) the local screenshot run (`shot-relay-tiebreak.mjs.txt`, not a gate driver) | same, the server started with the testing-only `MCHEZO_LIFECYCLE_SCALE=0.1` (Relay's 4 minutes become 24 s) | ran | Two teams out with 5 legs each, Sun's last leg first. Casual: "Time ran out: 5 of 12 legs · 1st/2nd" and the line "Team Sun and Team Coral both ran 5 legs; Team Sun finished its last leg first." |
| (no log) the same, in a Family Cup, Official | + the comment fix (below) | ran | **From the first screenshot, a fault the checks didn't catch:** an Official game picks its one-line comment from the teams' points. Level on points but placed apart, it could read "tied" under "Team Sun wins". It now reads "Level on points; Team Sun got there first." Cup placement: Sun's players 100, Coral's 0. |
| `check-cup-team-games-r2.log` | + scroll the lobby's last-game card into view for its screenshot | 26/0 | The committed screenshot comes from this run. |
| (no log) typecheck and lint | + the two screen lines moved to `lib/teamLines.ts` | **2 errors**, then **1 lint error** | The root typecheck can't read the screens' `.tsx`, so the two pure lines moved to a `.ts` module. That move first dropped `CountBar` (my edit), restored. The driver's unused first assignment: fixed. |
| `unit-suite-2.log` | before that move | 1956/1956 | |
| `unit-suite-3.log` | the committed tree (`c27e242`) | 1956/1956 | Both typechecks and lint clean. |

The screenshots in `docs/stage12/stage1215r-screenshots/` come from `check-know-your-rivals-r1` (`kyr-*`), `check-cup-team-games-r2` (`lobby-last-game-320`) and the local screenshot runs (`relay-tiebreak-*`).

## Gates (one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-042304-c27e2420-14931` | `c27e242` | targeted (22 drivers) | **PASSED** (exit 0) | 24/24 | 9 min 18 s |
| `20261115-043238-c27e2420-18729` | `c27e242` | fast | **PASSED** (exit 0) | 5/5 (unit 1956/1956) | 1 min 09 s |
| `20261115-043355-c27e2420-22664` | `c27e242` | full (checkpoint) | **PASSED** (exit 0) | 106/106 (relay 24, know-your-rivals 44, family-questions 103, cup-team-games 26 checks) | 39 min 37 s |

No other gate ran on this stage. The tested SHA is `c27e242`; the green claim rests on its full run alone.

## Second round: review 6889824884

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `r5-before-c27e242.log` | the new tests, unchanged, on `c27e242` | **3 FAIL** of 17 | Two reproduce the idle team's "Rather not say" wording (the review's case: `{answered 0, passed 0}`). The third fails because `teamTiebreakQuip` doesn't exist there: the old comment logic was inline in `App.tsx`, and in the review's case it gave "Level on points; Team Coral got there first." |
| (no log) those tests | `c27e242` + the two repairs | 17/17 | Typecheck and lint clean. |
| `check-know-your-rivals-r5.log` | + the idle round in the driver, built | 48/0 | Round 5: Sun answers nothing, the answer clock runs out, and every line is neutral. |
| `check-cup-team-games-r5.log` | same | 26/0 | |
| (no log) the local screenshot runs (`shot-relay-tiebreak.mjs.txt`, testing-only time scale) | same | ran | **Two teams level on points:** "Level on points with Team Coral; Team Sun got there first."<br>**The review's three teams** (Coral home 150; Sun and Mint 50 each, Sun's last leg first): the usual comment for Coral's win; the lanes say "Team Sun and Team Mint both ran 5 legs; Team Sun finished its last leg first."; Cup placement 100/50/0. |

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-054306-cfaf4122-1429` | `cfaf412` | targeted (10 drivers) | **PASSED** (exit 0) | 12/12 (know-your-rivals 48 checks) | 4 min 19 s |
| `20261115-054732-cfaf4122-3438` | `cfaf412` | fast | **PASSED** (exit 0) | 5/5 (unit 1958/1958) | 1 min 06 s |

No full gate ran on `cfaf412`, as the review asked.
