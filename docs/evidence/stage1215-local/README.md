# Stage 12.15: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) server typecheck | the server changes, uncommitted, on `d1c7217` (Stage 12.14's tested commit) | **1 error** | A new refusal code (`TEAM_GAMES_DONT_COUNT`) wasn't in the start-refusal union yet. Added. |
| (no log) the whole unit suite, first run | same | **20 FAIL** of 1916 | Three causes:<br>• **My mistake (8 failures):** I excluded every game built for teams from Shuffle, Charades included, but Shuffle always could pick Charades. Shuffle now leaves out the seven games only.<br>• **The D3 test, which now covers the seven games (6 failures):** it compares a game's state with and without a 5 s briefing as JSON. These games record their own start times, so the times differ by exactly the 5 s, which is the intended "deadlines shifted to T_play". The test now shifts clock times back by the briefing before comparing.<br>• **Expected (6 failures):** tests that asserted the old rules: new Cups individual-only, no teams in a Cup, the practice-only list. Updated to the owner's answer; the Individual Family Cup tests now build such a Cup the way it is saved. |
| (no log) the whole unit suite, second run | + the Shuffle and D3 fixes | **6 FAIL** of 1916 | Exactly the six expected ones. |
| (no log) those four test files | + the six updated | 72/72 | |
| (no log) `tests/stage1215-cup-team-games.test.ts`, first run | + the new tests (10) | 10/10 | Including a whole Official Tug of War in a Cup feeding the 75/25 day. |
| (no log) the same file | + the TV medal tests (2) | 12/12 | With `stage121-tv-medals.test.ts`: 29/29. |
| `unit-suite-1.log` | + the web changes (Teams card, lobby, results wording, Cup screen, medals) | 1928/1928 | Both typechecks and lint clean. |
| `check-cup-team-games-t1.log` | + built | 20 pass, **1 FAIL** | **My driver's mistake:** the TV's "Family Cup · after this game" is upper-cased by CSS, and `innerText` follows it, so a case-sensitive match failed. The screenshot showed the TV right (Sun's players 100, Coral's 0). |
| `check-cup-team-games-t2.log` | + that | 21/0 | **From the screenshot, a fault the checks didn't catch:** an Official team game's results line read "Tied for first. Diplomacy wins.", picked from the players' scores (teammates share one). It is now picked from the teams' scores ("Head to head, and Team Sun edged it."), and the driver checks for it. |
| `check-cup-team-games-t3.log` | + that, rebuilt | 22/0 | **The committed screenshots come from this run alone** (copied before any other driver ran). |
| `check-lifecycle-n1215.log` | + those | 37/0 | Its Cup-name check now expects the Family Cup (it expected "Individual Family Cup", changed before running). |
| `check-teams-n1215.log` | same | 24/0 | Casual teams, unchanged. |
| `check-official-practice-n1215.log` | same | 29/0 | |
| `check-one-path-n1215.log` | same | 67/0 | Casual room into a Cup. |
| `check-cup-party-n1215.log` | same | 28/0 | Quick Party inside a Cup. |
| `check-tv-show-n1215.log` | same | 29/0 | |
| `check-tug-of-war-n1215.log` | same | 24/0 | Casual Tug of War. |
| `check-team-huddle-n1215.log` | same | 28/0 | |
| `check-results-n1215.log` | same | 32/0 | |
| `check-warm-ivory-n1215.log` | same | 199/0 | |
| `check-library-n1215.log` | same | 22/0 | |
| `unit-suite-2.log` | same, the tree committed | 1928/1928 | Both typechecks and lint clean. |

## The first full gate on `f52309c` failed, and what changed

The targeted (26/26) and fast gates passed on `f52309c`; the full gate `20261115-001634-f52309c4-21676` **FAILED** (exit 1, 103 passed, 3 failed). Two causes:

- **`check-f5` and `e2e-chromium` (this stage's change):** both play "every game a Cup can start" with a generic UI player. The seven games built for teams are in that set now, and the generic player doesn't know how to play them, so the first one (Team Huddle) waited out its time and the rest of the playlist stalled behind it.
  - **The fix:** both drivers now name the seven as played by their own drivers, and log that list every run. Nothing they covered before is dropped: Charades, the one team game they already played, stays.
  - **Cup coverage for all seven:** a unit test now starts each of them as Official in a Family Cup (briefing, content and teams on the room's real start path). `check-cup-team-games` plays Tug of War through, and each game's own driver plays it end to end.
- **`check-team-draw` (a false positive in my Stage 12.11 driver):** that run dealt the word "sun". Every phone and the TV show the team name "Team Sun", and the TV's data has the colour `"sun"`, so "only the drawers see the word" failed on every phone and the TV. The targeted run had dealt another word.
  - **The fix:** team names and colours are scrubbed before looking for the word.
  - **Self-check:** a check reproduces this run's case. The old match finds "sun" in "Team Sun", and the scrubbed one doesn't.
  - **Not a leak:** the failing lines show the guessers' screens matched only because of the team name.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) `tests/stage1215-cup-team-games.test.ts` | + the Cup-start test for all seven | 13/13 | |
| `unit-suite-3.log` | + the driver fixes | 1929/1929 | Lint and both typechecks clean. |
| `check-team-draw-r1.log` | same | 45/0 | With the self-check. |
| `check-f5-r1.log` | same | 36/0 | The day playlist without the seven, which it logs. |
| `e2e-chromium-r1.log` | same | 15/15 ("E2E ALL PASSED") | The e2e player prints `OK`, not `PASS`, lines. It logs the seven as played by their own drivers. |

## The full gate on `fda15ec` failed too, and what changed

Targeted (21/21) and fast (5/5, unit 1929/1929) passed on `fda15ec`. The full gate `20261115-012817-fda15ec8-20702` **FAILED**: 105 passed, 1 failed.
- **The failure:** `check-split-clues`, "the TV shows the puzzle's kind but no clue and not the answer".
- **The cause, a second false positive of the same kind, in my Stage 12.10 driver:** the puzzle dealt was `sc-023`, answer "Tea", and the driver checked that the TV's text doesn't *contain* "Tea". "Team Coral" does.
- **Not a leak:** the same run's check of the TV's data (no clue, not the answer) passed.
- **The fix:** the answer is looked for as a whole word, with the teams' names taken out first, plus a self-check for this run's case.
- **Audit:** I looked through every team-game driver for the same pattern (a negative "contains" check that a team's name or colour could satisfy). Only Split Clues and Team Draw had it, and both are fixed.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `check-split-clues-r1.log` | `fda15ec` + the Split Clues fix | 27/0 | With the self-check. Lint clean. |
