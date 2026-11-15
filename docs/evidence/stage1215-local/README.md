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
| `check-tug-of-war-n1215.log` | same | 24/0 | Casual Tug of War: its results still say "Casual game". |
| `check-team-huddle-n1215.log` | same | 28/0 | |
| `check-results-n1215.log` | same | 32/0 | |
| `check-warm-ivory-n1215.log` | same | 199/0 | |
| `check-library-n1215.log` | same | 22/0 | |
| `unit-suite-2.log` | same, the tree committed | 1928/1928 | Both typechecks and lint clean. |
