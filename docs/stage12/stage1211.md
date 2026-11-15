# Stage 12.11: Team Draw

**Authorization:** the owner's direction of 2026-11-14 (about 1:20 p.m. ET), recorded in `docs/stage12/stage1210.md`: five games built for teams, one stage and one stacked draft PR each. This is the second.
**Branch:** `claude/stage12-11-team-draw`, stacked on Stage 12.10. Unmerged.
**Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates. The team kit of 12.10 (D-S1210-01) applies as written.

## 1. The drawing games share one word history (D-S1211-01)

- **The pad is shared.** Draw & Guess's drawing pad (colours, line widths, Undo, Clear, and the stroke batching that sends drawing in small pieces and resends what didn't arrive) is now one component, `DrawPad`, used by both games.
  - Draw & Guess keeps its own actions and every test id, so its drivers (`check-draw-guess`, `check-draw-sync`) run unchanged.
  - Team Draw sends its round with every message, so a late message can't land on the next round.
- **No repeats across both drawing games.**
  - Draw & Guess and Team Draw deal from the same word pack, so a room's earlier games of *either* count as played.
  - A module names its pack with `contentPool`, and the room reads the history of every game with the same pool.
  - Draw & Guess now lists the words it dealt (any swapped-in word too), and deals unplayed words first.
  - **With nothing played, its deal is exactly as before**: the Stage 8.2 seasonal test still pins it.

## 2. Team Draw (D-S1211-02)

- **The idea:** every team draws the same word at once. One teammate draws on their phone; the rest of the team guesses from their own team's drawing. The first right guess solves it for the whole team.
- **The rounds:**
  - as many as the biggest team has players, from 3 to 5, so in most nights everyone draws once;
  - each team's drawing order is shuffled once and goes round the team;
  - each round lasts up to 75 s, then a 9 s reveal.
- **The drawer's phone:** the word, the pad, the team's wrong guesses so far, and "Pass the pen" when it's allowed.
- **A guesser's phone:**
  - their own team's drawing, live;
  - the word's shape (blanks only);
  - the guess box, the team's wrong guesses and the scoreboard.
- **Guessing:**
  - opens once the drawer has drawn something;
  - matching is the team kit's: case, accents, punctuation, an article, a plural and one typo in a long word don't matter;
  - a wrong guess shows to the team and pauses the team's guess box for 2 s;
  - at most 15 wrong guesses per team per round.
- **Fair for uneven teams:**
  - one solve per team;
  - the guess limit and the pause count per *team*, so a bigger team can't out-type a smaller one;
  - the drawer rotates, so a big team's players each draw less often, not more.
- **Nobody guesses a word they've seen.**
  - **Pass the pen:** a drawer may pass once a round, before drawing anything, to the next teammate who hasn't seen the word.
  - **Take the pen:** after 20 s with nothing drawn (since getting the pen, or since the last stroke), a teammate may take it and carry on the same drawing. This covers a drawer whose phone dropped.
  - Either way, the pen moves only if someone who hasn't seen the word is left to guess. So a team of 2 can neither pass nor take; it simply waits out the round if its drawer is gone.
  - Whoever has held the pen this round can't guess.
- **Points per round, by the order teams get it:**
  - 100, 75, 55, 40;
  - +25 catch-up for a team alone in last place and 100+ behind (from the rounds before);
  - nothing for a team that doesn't get it.
- **The round ends** when every team has got it, or at 75 s.
- **The reveal:** the word, and every team's drawing side by side (who drew, its place, points and total).
- **No sitting out:** Pass and Take cover a drawer who can't go on.
- **Secrecy:**
  - **The word:** on the current drawer's phone only, until the reveal. A passer or an earlier drawer no longer sees it.
  - **The drawing:** each phone gets its own team's only. The TV and other teams see each team's status: who draws, how many strokes, solved and in which place.
  - **Wrong guesses:** within the team only.
  - **Future words** never leave the server.
  - **What's kept:** drawings are dropped when their round's reveal ends; wrong guesses when the game ends.
- **The TV:**
  - while drawing: the word's shape and the 2–4-team scoreboard with each team's status;
  - at the reveal: the gallery. Like every game's TV panel it is drawn at 1.6× zoom, so the boards are capped so each team's line stays above the footer with 4 teams in a row. The driver measures it.
- **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's "featured today". Uses the night's teams (a team needs at least 2), or deals two.

## 3. Acceptance

1. **Shared pad and history:**
   - Draw & Guess works as before (its two drivers);
   - neither drawing game repeats a word the room has drawn in either, until the pack runs out.
2. **Team Draw:**
   - every team draws the same word at once;
   - the word is on the drawer's phone only;
   - each team sees only its own drawing and guesses, and the TV sees neither;
   - guessing opens after the first stroke, with the pause and the limit;
   - pass and take, and nobody guesses a word they've seen;
   - points by solve order, and the early end;
   - the reveal's gallery on phones and the TV (4 teams).
3. **Screens:** phones at 320–390 px and the TV at 1920 px; nothing else moves; the full gate passes.

## 4. Validation

- **Unit tests** (`tests/stage1211-team-draw.test.ts`, 14):
  - **the module (pure):**
    - rounds and rotation;
    - secrecy with every view checked (word, other teams' drawings and guesses, future words);
    - guessing rules, the pause and the team limit;
    - points and the early end;
    - catch-up;
    - pass and take, including teams of 2;
    - drawing limits and the per-team rate window;
    - what's dropped at the end;
    - 4 teams;
  - **the shared history:** the deal with and without `avoid`, and Draw & Guess's word list;
  - **the room:** a whole game projected per player, then a Draw & Guess game that avoids its words; and a take-over window that opens on the room's clock.
- **Browser:** `scripts/check-team-draw.mjs`, with nine phones in four teams and a TV, covers:
  - the briefing;
  - who sees the word;
  - pass the pen;
  - mouse drawing reaching only the team;
  - a wrong guess;
  - solve order 1–4;
  - the gallery on phones and the TV, including the fit check;
  - take the pen;
  - results;
  - 320 px.
- **Re-run:** `check-draw-guess`, `check-draw-sync`, `check-warm-ivory` (W8 lists Team Draw's library cards) and `check-team-huddle`.
- **Gates:** targeted, fast, then one full checkpoint.

## 5. Estimate

About 4 hours (Split Clues' kit is reused; the drawing pad already existed).

**Actual:** about 1 h 30 min of wall-clock time, from the start of the pad refactor (about 1:55 p.m. ET) to the full gate's verdict (3:25 p.m. ET). The tested commit `9806d1d` was made at 2:35 p.m.

## 6. Gates (one run on one revision each)

All three on `9806d1d`; evidence in `docs/evidence/gate-runs/`:
- **targeted** (team-draw, draw-guess, draw-sync and 15 drivers) `20261114-193826-9806d1dd-16124`: PASSED, 20/20, 5 min 29 s;
- **fast** `20261114-194400-9806d1dd-19710`: PASSED, 5/5 (unit tests 1878/1878), 1 min 16 s;
- **full (checkpoint)** `20261114-194522-9806d1dd-23467`: **PASSED** (exit 0, 102/102, 39 min 25 s, no retries).
