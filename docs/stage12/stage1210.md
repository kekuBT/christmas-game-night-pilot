# Stage 12.10: the team kit, and Split Clues

**Authorization:** the owner, directly in chat on 2026-11-14 at about 1:20 p.m. ET. I had suggested five games built for teams (Split Clues, Team Draw, Territory, Tug of War, Know Your Rivals) and four rules for all of them. The owner:
> "I like all of them add all of them. Your item for the entire thing so build it properly and perfectly. Do all of it in one go don't wait for me unless it's genuine blocker"

The five games come as five stages, one stacked draft PR each, so each stays reviewable:
- **12.10:** the shared team kit, and Split Clues;
- **12.11:** Team Draw;
- **12.12:** Territory;
- **12.13:** Tug of War;
- **12.14:** Know Your Rivals.

**Branch:** `claude/stage12-10-split-clues`, stacked on Stage 12.9. Unmerged.
**Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

## 1. The team kit (D-S1210-01), shared by the five new games

1. **Every team plays at once.** No team waits for another team's turn; a round is the same length with 2 teams or 4.
2. **At least 2 players per team.**
   - A new team game uses the night's teams, as Stage 12.8 does.
   - **A team with only 1 player in this game** joins the game's other teams: that player plays this game with the smallest of the other teams.
   - The briefing says so, e.g. "Wanjiru plays with Team Sun this game (a team needs at least 2)".
   - If fewer than two teams of 2 would remain, the game deals two balanced teams for itself.
   - The games of Stages 12.8–12.9 (Team Huddle, Charades, Relay) keep their rule: a team of 1 works there.
3. **Fair scoring for uneven teams.**
   - A bigger team must never win just by being bigger. Each game says how, e.g. one answer per team per round (Split Clues), or pull per player rather than in total (Tug of War).
   - Everyone on a team scores the team's points.
4. **Catch-up.**
   - A team that is in last place on its own, and at least 100 points behind the leader, gets a small bonus on its next success.
   - In Split Clues the bonus is +25.
   - Never enough to jump past a team that keeps scoring.
5. **A scoreboard for 2–4 teams.**
   - Every phone shows each team's total during play.
   - The TV shows them as a row (2–3 teams) or a 2 × 2 grid (4 teams), each team with its mark, name and total. Colour is never the only cue.
6. **No repeats in a night.**
   - A new team game deals content this room hasn't played yet first, then the content it played longest ago.
   - This applies to Split Clues' puzzles here, and to later games' words and questions.

## 2. Split Clues (D-S1210-02)

- **The idea:** each round is one puzzle with one answer and six clues. Each teammate's phone shows *different* clues; nobody holds them all. The team talks, puts its clues together and types the answer.
- **The rounds:** 6 puzzles, each up to 75 s, then a 7 s reveal. All teams play the same puzzle at once.
- **On every phone:**
  - the puzzle's kind, e.g. "A place" or "An animal";
  - your clue or clues;
  - a box to type the team's answer;
  - the scoreboard.
- **Who holds which clue:**
  - the six clues are dealt round the team, so a team of 2 holds three each and a team of 3 two each;
  - in a team of more than 6, some clues are held twice;
  - who holds what rotates every round.
- **Help as the round goes on** (the same for every team):
  - **at 30 s:** the answer's shape, e.g. "2 words: 5, 7 letters";
  - **at 45 s:** the clues are pooled, so every phone on the team now shows all six. This also covers a teammate whose phone dropped;
  - **at 60 s:** the first letter.
- **Answering:**
  - **who:** anyone on the team can type the team's answer; the first right answer solves it for the whole team;
  - **matching:** case, accents, punctuation and a leading "the/a/an" don't matter, nor does one typo in a long answer (7+ letters); listed alternatives are accepted;
  - **a wrong answer:** shows to the teammates ("Amina tried: zebra") and locks the team's answer box for 4 s, so a bigger team can't spam guesses;
  - **limit:** at most 15 tries per team per round.
- **Points per round, by the order teams solve:**
  - 100, 75, 55, 40;
  - the catch-up bonus (+25) for a team alone in last place and 100+ behind;
  - nothing for a team that doesn't solve.
- **The round ends** when every team has solved it, or at 75 s.
- **The reveal:** the answer, all six clues and each team's result.
- **No sitting out:** your clues are part of your team's puzzle. If you step away, the 45 s pooling keeps your team going.
- **Secrecy:**
  - **Your phone:** only your own clues until the pooling at 45 s; then your team's six, never another team's.
  - **Your team's wrong tries:** seen by your teammates only.
  - **Before the reveal:** the TV and other teams see only each team's status (solving, solved and in which place), never a clue or the answer.
- **Content:**
  - 38 Everyday puzzles and 13 Christmas puzzles, original;
  - no clue gives the answer away on its own, and together they point to one answer;
  - Christmas puzzles are dealt only in Christmas sessions, as in Stage 8.2.
- **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's "featured today".

## 3. Acceptance

1. **The kit:**
   - every team plays at once;
   - teams of 1 join others, and the briefing says so;
   - one answer per team;
   - the catch-up bonus;
   - the 2–4-team scoreboard on phones and the TV;
   - no repeats in a night until the pool runs out.
2. **Split Clues:**
   - a phone sees only its own clues until 45 s;
   - the help arrives at 30, 45 and 60 s from the server's clock;
   - matching, the lockout and the try limit;
   - points by solve order;
   - the round ends early when all teams have solved;
   - the reveal;
   - nothing secret reaches the TV or another team.
3. **Screens:**
   - phones and the TV at 320–390 px and 1920 px;
   - nothing else moves, and the full gate passes.

## 4. Validation

- **Unit tests:**
  - **the module (pure):** clue dealing for team sizes 2–7, matching, the lockout, the try limit, points, catch-up, the help steps through `dueAt`/`advance`, the early end, and privacy with canaries in every view;
  - **the room:** a team of 1 joining another team; two dealt teams when needed; no repeats across games; a whole game.
- **Content checks:** sizes, unique ids, six clues each, and no clue containing its answer.
- **Browser:** `scripts/check-split-clues.mjs` with five phones in three teams and a TV:
  - each phone's own clues;
  - the TV sees none;
  - a wrong try and the lock;
  - the help steps;
  - solve order and points;
  - the reveal and results;
  - 320 px.
- **Gates:** targeted, fast, then one full checkpoint.

## 5. Estimate

About 5 hours.
