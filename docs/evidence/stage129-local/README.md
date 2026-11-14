# Stage 12.9: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks, lint | Relay, uncommitted, on `4d2dfb3` (Stage 12.8's head) | clean | |
| (no log) `tests/stage129-relay.test.ts`, first run | same, plus a room test I added for time running out mid-race | 8/8 | **The new test:** the 4-minute limit ends a race with one team home and one five legs in. The team home is 1st with 150 points (12 legs + 30), the other 2nd with 50. Its lane shows 5 legs, not finished. |
| `unit-suite-1.log` | same | **11 FAIL** of 1846 | **All expected,** from adding a 19th game: the catalogue lists and counts. Relay correctly appears among numbers games, 5-minute-or-shorter games and team games, and it is the shortest game (4 min). Also the registry order, `/games`, the practice-only list, and the abstention map (Relay has none). Updated. Home's featured-rotation test still passes: Relay is never featured. |
| `unit-suite-2.log` | + those updates | 1846/1846 | |
| `check-relay-r1.log` | + built | 19/0 | **The screenshots showed three faults the checks didn't catch:** (1) "Frozen: 4" for a 3 s freeze: the countdown rounds up, and the phone's clock estimate trailed the server's by a few milliseconds; (2) the runner's leg line wrapped a lone "ON" onto a second line; (3) the team results card said "average" and "a team's score is the average of its players", although in a game built for teams every player scores the team's points (Team Huddle and Charades too). **Fixed:** (1) the server sends the whole freeze and turn, and the countdowns never show more than them; (2) "Leg 2 of 12 · baton passes in 20 s"; (3) for games built for teams the card says "A team game", shows "pts" and "Everyone on a team scores the team's points", and the TV kicker says "each team's points". 12.7's played-as-teams games keep "average". |
| `check-relay-r2.log` | + those fixes, and driver checks for each: the freeze counts down from at most 3, the turn from at most 20, and the results show points, not an average, on the phone and the TV | 21/0 | |
| `check-relay-r3.log` | + a driver check that the game's 4-minute clock counts down (every screenshot was taken in its first seconds, so all showed 4:00) | 22/0 | "under 3:45 left after the pass" passed. |
| `check-warm-ivory-n129w1.log` | same | **195 pass, 4 FAIL** | **Expected:** W8 flagged Relay's new cards on Home's shelf and in the library. Home's featured game did not change, because Relay is kept out of the featured rotation like Family Questions and Team Huddle. **Fixed:** W8 allows Relay's cards by their test ids, and each element must still reuse a base style. |
| `check-warm-ivory-n129w2.log` | + that | 199/0 | |
| `check-team-huddle-n129h1.log` | same | 28/0 | Team Huddle with the new team results wording. |
| `check-teams-n129t1.log` | same | 24/0 | 12.7's played-as-teams results keep "average". One check ("the sheet shows Amina with a move button") runs only when the seeded shuffle didn't already put Amina on Coral, so 24 or 25 checks both mean every check passed. |
| `check-relay-r4.log` | + a briefing screenshot | 22/0 | **The committed screenshots come from this run alone.** The local screenshot folder is flat, so the Team Huddle run (`n129h1`) had overwritten Relay's `tv-final-1920`. |
| `unit-suite-3.log` with both typechecks and lint | the commit candidate | clean; 1846/1846 | |
