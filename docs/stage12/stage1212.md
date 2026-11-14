# Stage 12.12: Territory

**Authorization:** the owner's direction of 2026-11-14 (about 1:20 p.m. ET), recorded in `docs/stage12/stage1210.md`: five games built for teams, one stage and one stacked draft PR each. This is the third.
**Branch:** `claude/stage12-12-territory`, stacked on Stage 12.11. Unmerged.
**Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates. The team kit of 12.10 (D-S1210-01) applies.

## 1. The board (D-S1212-01)

- **Shape:** a hexagon of 19 hex cells, named for people by row (A–E, top to bottom) and place in the row: A1–A3, B1–B4, C1–C5, D1–D4, E1–E3. C3 is the centre.
- **Homes:** each team starts on a corner, spread evenly:
  - 2 teams: C1 and C5 (opposite);
  - 3 teams: A1, C5, E1 (alternate corners);
  - 4 teams: A1, A3, E3, E1.
  - A home is never taken.
- **Shared code:** the geometry (cells, neighbours, homes, joined regions, names) is in `src/shared/territoryBoard.ts`, so the server and the screens use the same board. The web never imports server modules.
- **Colour is never the only cue:** each team's cells show its shape (▲ ● ■ ◆) as well as its colour, a home has a ring, and every cell has its name.

## 2. Territory (D-S1212-02)

- **The idea:** a team quiz on a board. Get the answer right and claim a cell next to your land; the biggest joined land scores most.
- **Questions:** 8, from the Trivia pool (dealt like Team Huddle's, so a night doesn't repeat them until the pool runs low).
- **Each round:**
  - **Question (up to 20 s):** one tap answers for the whole team, so the team should agree first. The question closes early once every team has answered. Other teams and the TV see only *that* a team has answered, never what.
  - **Claim (10 s):** the answer is shown. Each team that got it right picks one cell next to its land: an empty one, or another team's (a steal). Teams that got it wrong claim nothing.
- **Picks stay hidden** until the round ends. Then they resolve in the order the teams answered:
  - a faster team gets a contested cell;
  - a slower team's claim moves to the best free cell next to its land (empty first, then the nearest the centre);
  - a right team that didn't pick gets that cell too.
- **Catch-up (the team kit):** a team alone in last place and at least 30 points behind the leader gets one extra cell when it's right (this game's scores are small, so 30 is about two cells).
- **Score, live and final:** 10 per cell, plus 5 per cell in the team's biggest joined land. Everyone scores their team's points.
- **Fair for uneven teams:** one answer and one claim per team, whatever its size.
- **No sitting out:** a team that doesn't answer simply claims nothing.
- **Secrecy:**
  - before a question closes, a team's answer is on its own phones only, and the right answer is on no screen and in no data;
  - a team's pick stays on its own phones until the round ends;
  - the question itself is public (everyone answers it).
- **The TV** (not zoomed, like Draw & Guess; sized in the 1920 × 1080 canvas's pixels):
  - the board, big;
  - the question and its options, then the right answer;
  - each team's status (answered / right and its place / picked) and land;
  - "Last round: Team Coral took B3 from Team Sun".
- **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's "featured today". Uses the night's teams (a team needs at least 2), or deals two.

## 3. Acceptance

1. **The board:** 19 cells; homes spread evenly for 2, 3 and 4 teams; homes never taken; names and shapes on every cell.
2. **Territory:**
   - one tap per team;
   - answers hidden until the question closes, which happens early once every team has answered;
   - claims next to your land only, and steals;
   - picks hidden until the round ends;
   - contested cells go to the faster team, and the slower team gets the nearest free cell;
   - catch-up;
   - the score and team results.
3. **Screens:** phones at 320–390 px; the TV at 1920 px fits above its footer; nothing else moves; the full gate passes.

## 4. Validation

- **Unit tests:** `tests/stage1212-territory.test.ts` (10).
  - **The board:** sizes, neighbours, home spacing, joined regions.
  - **The module:**
    - homes and equal start;
    - one tap and secrecy;
    - claims, homes and hidden picks;
    - contest resolution and the game's pick;
    - steals and scores;
    - catch-up;
    - a whole game.
  - **The room:** a whole game with the night's teams, questions from the Trivia pool and answers hidden per team.
- **Browser:** `scripts/check-territory.mjs`, with eight phones in four teams and a TV. It covers:
  - the briefing;
  - four homes;
  - one tap on a phone;
  - hidden answers and picks;
  - a contested A2;
  - a steal on a phone;
  - catch-up;
  - results;
  - 320 px;
  - the TV's fit.
  - Right answers come from the content packs on disk (the existing test oracle).
- **Re-run:** `check-team-huddle` (its question path is now shared), `check-warm-ivory` (W8 lists Territory's library cards) and `check-library`.
- **Gates:** targeted, fast, then one full checkpoint.

## 5. Estimate

About 4 hours (the team kit, the scoreboard and the Trivia-pool path already exist; the board and its screens are new).

**Actual:** about 1 h 40 min of wall-clock time, from the first board code (about 2:38 p.m. ET) to the full gate's verdict (4:19 p.m. ET). The tested commit `e92dae9` was made at 3:06 p.m. About 7 minutes of that went on a full gate that failed for lack of disk space (below), and its re-run.

## 6. Gates (one run on one revision each)

All on `e92dae9`; evidence in `docs/evidence/gate-runs/`:
- **targeted** (territory, team-huddle, answer-reveal, content-variety, content-look and 15 drivers) `20261114-202618-e92dae9c-23806`: PASSED, 22/22, 5 min 49 s;
- **fast** `20261114-203212-e92dae9c-27750`: PASSED, 5/5 (unit tests 1889/1889), 1 min 06 s;
- **full** `20261114-203324-e92dae9c-31480`: **FAILED** (exit 1, an infrastructure failure, not a test). The machine's disk was full: step 3 (`build-web`) failed with `ENOSPC`, and the gate itself then crashed writing its log, so it wrote no summary. Steps 1–2 passed and the unit tests were still running. I cleared earlier gate clones, which now go after each run's evidence is copied, and ran the full gate again;
- **full (checkpoint)** `20261114-204033-e92dae9c-638`: **PASSED** (exit 0, 103/103, 38 min 31 s, no retries).
