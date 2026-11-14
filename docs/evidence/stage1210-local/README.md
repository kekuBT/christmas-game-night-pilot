# Stage 12.10: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) both typechecks | the team kit and Split Clues, uncommitted, on `548c763` (Stage 12.9's head) | clean | |
| (no log) `tests/stage1210-split-clues.test.ts`, first run | same | **15 pass, 1 FAIL** | **My test's mistake:** it treated a clue text on a Sun phone as a leak because Coral's Keku holds the same clue. Every team plays the same puzzle, so two teams hold the same clues by design. The test now checks that each phone shows exactly the clues its own player holds, and nothing else of the puzzle. |
| (no log) same, seeds 1–8 | + that fix, and a future-puzzle check that skips clue texts the current puzzle shares ("It can't fly." is in two puzzles) | **seed 6: 1 FAIL**, others 16/16 | **My test's mistake again:** it claimed a player's clue numbers always change between rounds. Each round is a new puzzle with a freshly shuffled clue order, so the numbers can coincide. The real rule (each player's seat in the deal moves on by one every round) is now exposed as `dealSeat` and tested directly. |
| (no log) same, seeds 1–12 | + that | 16/16 for every seed | |
| (no log) lint | same | **1 error** | An unused assignment in my catch-up test. Fixed. |
| `check-split-clues-s1.log` | + built | 26/0 | **The screenshots showed two faults the checks didn't catch:** on the TV's reveal, the clue list's numbers were cut off at the left, and the scoreboard at the bottom ran under the footer. **Fixed:** the list has room for its numbers, and the TV's reveal shows each team's running total in its result line instead of a second scoreboard. |
| `check-split-clues-s2.log` | + that | 26/0 | |
| `unit-suite-1.log` | same | **11 FAIL** of 1863 | **All expected**, from a 20th game: the catalogue lists and counts. Split Clues is a word game (category), 8 minutes, team play; then the registry, `/games`, the practice-only list and the abstention map (no sitting out). Updated. |
| `unit-suite-2.log` | + those | 1863/1863 | |
| `check-warm-ivory-n1210w1.log` | + W8 allows Split Clues' cards (added before running, following the pattern of 12.8 and 12.9; each element must still reuse a base style) | 199/0 | Home's featured game did not change: Split Clues is kept out of the featured rotation. |
| `check-team-huddle-n1210h1.log` | same | 28/0 | The briefing's teams section changed (the "plays with" line), so the 12.8 driver was run again. |
| `check-split-clues-s3.log` | same | 26/0 | **The committed screenshots come from this run alone.** The local screenshot folder is flat, so the other runs overwrite each other's files. |
