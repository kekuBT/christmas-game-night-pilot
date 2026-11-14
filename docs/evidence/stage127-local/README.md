# Stage 12.7: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks, first run | Teams, uncommitted, rebased on cd621f2 | clean | |
| (no log) `tests/stage127-teams.test.ts`, first run | same | **9 pass, 1 FAIL** | **Real bug:** after a restart the teams came back with nobody on them. `fromJSON` read the teams before the players, so every member looked unknown and was dropped. **Fixed:** the members are checked against the saved room's player ids. |
| (no log) same, second run | + that fix | 10/10 | |
| (no log) lint, and the whole unit suite | same | clean; 1825/1825 | |
| `check-teams-t1.log` | + built | **23 pass, 1 FAIL** | **Driver mistake:** "the TV counts tonight's team wins". The TV keeps the last game's final until the next game, so the teams card wasn't on screen. The driver now presses the TV's "Lobby view", as a host would. |
| `check-teams-t2.log` | + that driver fix | 25/0 | The screenshots showed two things to polish: the TV final said the winning team twice (headline and card), and a move button in the teams sheet was only a shape. |
| `check-teams-t3.log` | + the TV card leaves the winner to the headline; "Move to" next to the buttons | 25/0 | The committed screenshots come from this run. |
| `check-warm-ivory-n127w1.log` | same | **195 pass, 4 FAIL** | W8 flagged the host's new Teams card in the lobby (lobby and menu, 390 and 320), as expected. |
| `check-warm-ivory-n127w2.log` | + W8 allows `teams-card>` and `teams-make>` (each element must still reuse a base style) | 199/0 | |
