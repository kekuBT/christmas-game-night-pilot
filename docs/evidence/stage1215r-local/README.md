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

## Third round: review 6890761957

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `r6-check-cup-team-games-before-cfaf412.log` | the updated driver on a build of `cfaf412` | 26 pass, **1 FAIL** | The TV's final standings didn't show team places 1, 1, 2, 2, 2 within 15 s. The log records only that timeout. The old list ranks by points with shared places, which for these teams gives Sun's two 1, 1 and Coral's three 3, 3, 3. That is the review's finding, and the unit tests show it in the 150/50/50 case. |
| `r6-check-one-path-before-cfaf412.log` | the updated driver on a build of `cfaf412` (the run that names the card's text) | 67 pass, **3 FAIL** | After "Make it a Family Cup", both phones' card read "LAST GAME · MATH MAYHEM · PRACTICE"; so did a reload. (A first run on that build also failed these 3, but only because it looked for a test id this repair adds; the driver now reads the existing card.) |
| (no log) the new tests | + the repairs | 9/9 in `stage1215r-recaps.test.ts` | `teamRankedStandings`: 150/50/50 is 1, 1, 2, 3; a true tie; an unscored team; the individual fallback. The history label through the change and a restored room. (The label's helper was already right; the fault was the lobby not using it, which the drivers show.) |
| `unit-suite-r6.log` | same | 1960/1960 | Both typechecks and lint clean. |
| `check-cup-team-games-r6.log` | + built | 27/0 | The TV's standings: 1, 1 (Team Sun), 2, 2, 2 (Team Coral). |
| `check-one-path-r6.log` | same | 70/0 | "LAST GAME · MATH MAYHEM · CASUAL" on the host and a guest after the change, and after a reload. |

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-071221-de265098-5268` | `de26509` | targeted (13 drivers) | **PASSED** (exit 0) | 15/15 (cup-team-games 27, one-path 70 checks) | 4 min 29 s |
| `20261115-071657-de265098-7750` | `de26509` | fast | **PASSED** (exit 0) | 5/5 (unit 1960/1960) | 1 min 15 s |

No full gate ran on `de26509`, as the review asked. The screenshots `tv-final-standings-by-team-1920` and `lobby-last-game-casual-after-cup-390` come from `check-cup-team-games-r6` and `check-one-path-r6`.

### Rendered coverage for the review's cases (`a82ea44`)

The review asked for rendered coverage of the TV's final standings (150/50/50 at places 1, 2, 3; a true tie; the individual-game fallback) and of Casual, Practice and Official through the change and a reload. The runs above rendered one team case and Casual only, so this commit adds the rest. No behaviour changed: `TvFinal` is only exported for the test.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `r6-tvfinal-render-before-cfaf412.log` | the new `TvFinal.test.tsx`, unchanged, on `cfaf412` with only `export` added to `TvFinal` | **3 FAIL** of 6 | The rendered list on the old code. Relay 150/50/50 at places 1, 2, 3 reads **1, 1, 3, 3**, the reviewer's screen. A true tie reads 1, 1, 3, 3. A team game placed by score names no team and ranks the last player 4th, not their team's 3rd. The 3 that pass are unchanged behaviour: an individual game, a game played as teams, and the TV's mode label, which was already right. |
| (no log) the same test | `a82ea44` | 6/6 | 1, 1, 2, 3 with Team Coral, Team Coral, Team Sun, Team Mint; 1, 1, 2, 2 for the tie; points ranking for the two per-player cases; the TV label Casual, Practice and Official as played. |
| `unit-suite-r6b.log` | same | 1966/1966 | Both typechecks and the whole repo's lint clean. |
| `check-one-path-r6b.log` | + built | 74/0 | After the change: "LAST GAME · MATH MAYHEM · CASUAL" (host and guest, and after a reload), "· OFFICIAL" after an official game, "· PRACTICE" after a practice game, still Practice after a reload. The server has it as practice, not one of the casual games. |
| `shot-relay-3teams-r6-run1.log` (local screenshot run, `shot-relay-tiebreak.mjs.txt`, testing-only `MCHEZO_LIFECYCLE_SCALE=0.1`; not a gate driver) | `a82ea44`, built | ran; **my new check FAILED** | The review's three-team Official Relay: Coral home 150; Sun and Mint 50 each, Sun's last leg first. The TV listed 1, 1 (Team Coral), 2, 2 (Team Sun), 3, 3 (Team Mint), which is right. My check expected the review's four players (1, 1, 2, 3), but this run seats two runners on each team. The fault was in the check's expectation, not the screen. |
| `shot-relay-3teams-r6-run2.log` | same, the check corrected | ran; check passed | The same list, now checked: 1, 1, 2, 2, 3, 3, each with its team. Cup placement 100, 100, 50, 50, 0, 0. The screenshot `relay-tiebreak-3teams-cup-tv-final-1920` is from this run. |

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-072853-a82ea449-16515` | `a82ea44` | targeted (13 drivers) | **PASSED** (exit 0) | 15/15 (one-path 74, cup-team-games 27 checks) | 4 min 22 s |
| `20261115-073324-a82ea449-18915` | `a82ea44` | fast | **PASSED** (exit 0) | 5/5 (unit 1966/1966) | 1 min 08 s |

No full gate ran on `a82ea44` or `de26509`, as the review asked. The tested SHA for this round is `a82ea44`; the `de26509` runs above are that revision's own, not combined with these.

### One more consumer of the label (`57f698f`)

The review asked me to check the label's other consumers. One remained: the casual results screen for games without a results screen of their own (Math Mayhem) was chosen by the room's current kind.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `r6c-repro-results-after-cup-a82ea44.log` (scratch script `repro-results-after-cup.mjs.txt`, not a gate driver) | a build of `a82ea44` | **2 FAIL** of 3 | Amina stays on a casual Math Mayhem game's results while the host makes the room a Cup. Her screen turns into the old one: "MATH MAYHEM · CASUAL" above "Practice game — does not count toward the Family Cup.", and still does after a reload. (An earlier run of the script made a Cup room by mistake: `POST /rooms` without `kind: "casual"`. That run tested nothing and isn't kept.) |
| `r6c-check-one-path-before-a82ea44.log` | the updated driver (new D2 steps) on a build of `a82ea44` | 76 pass, **2 FAIL** | The guest's casual results disappear after the change, and after a reload. |
| `r6c-repro-results-after-cup-fixed.log` | `57f698f`, built | 3/3 | Casual results before, after and after a reload; no old screen. |
| `check-one-path-r6c.log` | same | 78/0 | "MATH MAYHEM · CASUAL … Just for fun." after the change and after a reload; the server has it among the casual games. |
| `unit-suite-r6c.log` | same | 1966/1966 | Both typechecks and the whole repo's lint clean. |

Screenshots: `results-after-cup-before-a82ea44-390` (the old screen, cropped) and `results-after-cup-casual-390` (repaired).

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-074546-57f698fe-27948` | `57f698f` | targeted (14 drivers: the 13 above + session-flow) | **PASSED** (exit 0) | 16/16 (one-path 78, cup-team-games 27, session-flow 72 checks) | 5 min 22 s |
| `20261115-075116-57f698fe-30431` | `57f698f` | fast | **PASSED** (exit 0) | 5/5 (unit 1966/1966) | 1 min 11 s |

**The tested SHA for the third round is `57f698f`.** The `de26509` and `a82ea44` runs belong to those revisions alone and aren't combined with these. No full gate ran on any of the three, as the review asked.
