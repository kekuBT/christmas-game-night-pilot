# Stage 12.8: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks, first run | Team Huddle and Charades teams, uncommitted, on 8a0d8f1 | clean | |
| (no log) `tests/stage128-huddle.test.ts`, first run | same | **10 pass, 1 FAIL** | **My test's mistake:** it read the TV's Charades state while the game was still in its briefing (a briefing projects no game state). The test now marks everyone ready first. |
| (no log) same, second run | + that test fix | 11/11 | |
| (no log) lint | same | **1 error** | An unused `playerId` in the Team Huddle phone screen. Removed. |
| (no log) the whole unit suite, first run | same | **14 FAIL** of 1837 | **12 expected:** tests that list or count the catalogue, now 18 games (library filters and sorting, registry, manifests, `/games`, Home's featured rotation). **2 from the intended turn change (D-S128-03):** two Charades tests named the acting player with the old order (team A, then team B). They now ask the game for its own actor (`currentActor`), and each still checks what it was written for: an absent actor can't stall the game, and practice Charades never enters the Cup. |
| (no log) both typechecks, lint, the whole unit suite | + those updates | clean; 1837/1837 | |
| `check-team-huddle-h1.log` | + built | **23 pass, 3 FAIL** | (1) **Real gap:** the briefing showed no teams, because the briefing projection (which sends no game state) left the teams out too. The teams are public, so it now carries them. (2) **Driver mistake:** a teammate's pick tag is set in capitals by CSS ("KEKU"); the driver matched "Keku" case-sensitively. (3) The screenshot showed "Your team agrees" on Amina's phone when only Keku had picked. **Fixed:** a team agrees only when everyone on it has picked (or sat out) the same option; the phone says "Waiting for the rest of your team" in between. |
| (no log) `tests/d3-briefing.test.ts` | + those fixes | **2 FAIL** (charades, team-huddle) | The briefing secrecy test flagged the team names ("Team Coral"): they sit in the game's state and weren't public before the start. They're announced on purpose (D-S128-01). The test now counts the game's teams (names and members only) as public from its start; every other string in the state is still checked. |
| `check-team-huddle-h2.log` | + those fixes | 27/0 | |
| `check-team-huddle-h3.log` | + the TV's team column has its own width; a team game's phone heading names the team ("Team Sun wins Team Huddle", "Your team came 2nd of 2") | 28/0 | The screenshots showed the TV's team list clipped at the right ("Team Cora…") before this, and then the right answer's tag squeezing "Jupiter" onto three lines. |
| `check-team-huddle-h4.log` | + on the TV an option's tag goes under its text | 28/0 | The committed screenshots come from this run. |
| `check-warm-ivory-n128w1.log` | same | **195 pass, 4 FAIL** | W8 flagged Team Huddle's new cards in the home shelf and the library (expected), and Home's featured game had changed: the daily rotation is keyed to how many games are in it, so an 18th game reshuffles every day's pick. **Fixed:** Team Huddle stays out of Home's featured rotation (as Family Questions did in 12.5); W8 allows its shelf and library cards (each element must still reuse a base style). |
| `check-warm-ivory-n128w2.log` | + those | 199/0 | |
| (no log) both typechecks, lint, the whole unit suite | the commit candidate | clean; 1837/1837 | |
| (gate) targeted on `717b16f`, run `20261114-110233-717b16f7-30296` | the first commit | **PASSED** (exit 0), 17/17 | team-huddle, teams, warm-ivory, family-questions, briefing, official-practice, library, library-nav, tv-show, results, quick-party, cup-party, one-path, session-flow, a11y-surfaces. |
| (gate) fast on `717b16f`, run `20261114-110648-717b16f7-527` | same | **PASSED** (exit 0), 5/5 | |
| (gate) **full** on `717b16f`, run `20261114-110804-717b16f7-4230` | same | **FAILED** (exit 1), 96/98 | **check-f5** and **e2e-chromium**: "charades: did not reach Status: finished in 180s". **Root cause: two drivers, not the game.** Both waited for a Correct button named "Team A" or "Team B" (`/^Correct \(\+100 to Team [AB]\)$/`); Charades now names its teams ("Correct (+100 to Team Coral)"), so they never pressed it and the turns only ran out on the clock. e2e's later geography, math-mayhem and majority-rules "locator.click" failures followed from that: the unplayed Charades game was still running, so the next games couldn't start. **Fixed:** both drivers accept any team's name. |
| `check-f5-f5a.log` | + the driver fix | 36/0 | |
| `e2e-chromium-a.log` | same | ALL PASSED | Every game, Charades, geography and math-mayhem included. |
