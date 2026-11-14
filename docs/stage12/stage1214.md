# Stage 12.14: Know Your Rivals

**Authorization:** the owner's direction of 2026-11-14 (about 1:20 p.m. ET), recorded in `docs/stage12/stage1210.md`: five games built for teams, one stage and one stacked draft PR each. This is the fifth and last.
**Branch:** `claude/stage12-14-know-your-rivals`, stacked on Stage 12.13. Unmerged.
**Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates. The team kit of 12.10 (D-S1210-01) applies, with this game's own catch-up gap (below).

## 1. The game (D-S1214-01)

- **The idea:** how well does your team know the others? Everyone answers a light "this or that" question about themselves in private. Then each team guesses how the other teams answered.
- **The questions:**
  - 54 original ones: 42 everyday ("Tea or coffee?", "Early bird or night owl?") and 12 for Christmas ("A real tree or an artificial tree?").
  - Everyday preferences only: nothing personal or sensitive, and every answer is fine.
  - Christmas questions come first in a Christmas session; questions a room hasn't played come first (Stage 7.4).
  - Provisional content, like every pack, and the game is practice-only.
- **Rounds:** six, each in three phases.
  - **Answer (20 s):** pick one of the two on your own phone, or "Rather not say". You can change it until everyone has answered; the phase closes early then.
  - **Guess (25 s):** for every other team, your team guesses how many of its players picked the first option, out of those who answered (number buttons 0 to that number).
    - Any teammate can set a guess; every teammate's phone shows it and who set it.
    - Any teammate can lock the team's guesses. The phase closes early once every team has locked.
    - A line under the buttons says which teams are still to guess.
  - **Reveal (8 s):** each team's totals in words and as a bar ("2 Tea · 1 Coffee · 1 rather not say"), never who picked what; each team's guesses and points.
  - If nobody in any team answered, there is nothing to guess, so the round goes straight to the reveal.
- **Points, per rival guessed:**
  - 30 for the exact number, less the further off: 30 × (1 − miss ÷ that team's answers), rounded, never below 0.
  - A rival you didn't guess scores 0; a rival where nobody answered isn't guessed.
  - Every team guesses every other team, so all teams have the same number of guesses whatever their size.
  - Everyone scores their team's points.
- **Catch-up:** a team alone in last place and at least **60** behind gets +15 in a round where it scores. A round is worth at most 30 per rival, so 60 is about two rounds of one rival.
- **No sitting out:** "Rather not say" is an answer of its own, and the guessing is the team's.
- **Privacy:**
  - A phone only ever gets its own answer. Not even a teammate sees it.
  - While answering, the TV and the phones show only how many have answered.
  - A team's guesses, and who set them, stay on its own phones until the reveal. At the reveal everyone sees each team's guesses, never who set them.
  - **A limit of totals:** in a team of two, your teammate can work out your answer from the team's total (they know their own). The same is true for anyone when a team's answers are all the same. That's why the questions are light, "Rather not say" is always there, and the briefing says "only each team's totals are ever shown" rather than promising more.
- **The TV** (not zoomed, sized in the 1920 × 1080 canvas's pixels): the question, how many have answered, which teams have locked, then the totals and the scoreboard. Never an answer or a guess before the reveal.
- **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's "featured today". Uses the night's teams (a team needs at least 2), or deals two.

## 2. Acceptance

- A player's own answer is never in anyone else's view, the TV's included, at any point.
- Answers can change until everyone has answered; then the guesses start early.
- A team's guesses stay with the team until the reveal; any teammate sets them and any teammate locks them.
- The reveal shows totals per team and every team's points, never who picked what.
- Points: 30 for exact, less the further off; an unguessed rival scores 0.
- "Rather not say" isn't counted; if nobody answers, there's no guessing.
- Catch-up +15, only in a round where the team scores.
- Phones at 320–390 px; the TV at 1920 px fits above its footer; the full gate passes.

## 3. Validation

- **Unit tests:** `tests/stage1214-know-your-rivals.test.ts` (10).
  - **The module:**
    - the questions (everyday and Christmas, unplayed first);
    - answering, changing, checks, closing early;
    - privacy, checked as text in every view through a whole round and after the game;
    - team-private guesses, locking, checks, closing early;
    - points, with three teams and a guess phase that runs out;
    - "Rather not say" and nobody answering;
    - catch-up;
    - a whole game.
  - **The room:** a whole game with the night's teams, phases closing early and on the room's clock, what each audience sees; and an answer phase that closes on the clock.
- **Browser:** `scripts/check-know-your-rivals.mjs` (37 checks), with seven phones in three uneven teams and a TV. It covers:
  - the briefing;
  - the same question everywhere;
  - answering, changing and "Rather not say" on the phones;
  - privacy in every phone's and the TV's data;
  - guessing together, "Set by", "Still to guess", locking;
  - the reveal's totals and points on the TV and the phones;
  - catch-up in round 3;
  - results;
  - 320 px;
  - the TV's fit.
- **Re-run:** `check-warm-ivory` (W8 lists Know Your Rivals' library cards), `check-library` and `check-teams`.
- **Gates:** targeted, fast, then one full checkpoint.

## 4. Estimate and actual

- **Estimate:** none was written down before work began. That was an omission: 12.10–12.13 each had one.
- **Actual:** started about 3:30 p.m. ET, after 12.13's commit (3:28 p.m. ET). The code was committed about an hour later; the gates came after that.
