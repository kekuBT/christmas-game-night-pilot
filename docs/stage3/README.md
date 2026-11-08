# Stage 3 (bonus): results and celebrations (branch `claude/stage3-results`, from the verified Stage 2 record `b08ac19`)

**What changed:** every results screen now opens with the same header. That covers Trivia, Word Connections, Caption Clash, and the shared results of the other eight games. Presentation only: no score, rule, Cup or content changes.

- **The headline:**
  - "Ada wins Trivia Showdown".
  - Ties: "Ada and Bea tie for first" or "3-way tie for first".
  - "Everyone tied" or "Nobody scored this time".
- **First place:** the tokens and names of everyone who shares it.
- **Your card:**
  - Your place: "You came 2nd of 3" or "You tied for 1st of 4".
  - Your points (the server's).
  - One personal line.
- **One Mild line about the whole game**, tied to something that really happened.
- **A short celebration** plays on a winner's phone only: 14 of the kit's shapes, at most 1.2 s, CSS only, never covering a button. It never plays under iOS Reduce Motion or the in-app Less/Off.

**Where the facts come from** (`apps/web/src/ui/mchezo/lib/celebrate.ts`, pure, unit-tested):
- Scores are the server's per-game scores (`rawScores`), never computed on the phone.
- Ranks are competition ranks over those scores: equal scores share a rank (1, 1, 3), and tied winners are named in name order. Every phone gets the same scores, so every phone shows the same winners, ties and places.
- A line is chosen by the game's id, so all phones and every refresh show the same words.
- No streaks, speeds, "best ever" or other statistics are computed or invented. The close-finish line shows the real points gap; the "dropped out" line uses your own recorded participation (0 of 10 answered).

Decisions: D-UX-21 and D-UX-22 in `docs/DECISIONS.md`.

## The 28 lines (all original, Mild)

| When it can appear | Line |
|---|---|
| One clear winner (no other rule applies) | {w} takes it. Applause is optional but encouraged. |
| One clear winner (no other rule applies) | {w} wins. Somebody fetch a paper crown. |
| One clear winner (no other rule applies) | Top of the table: {w}. Modesty optional. |
| Two players, one winner, not close, not a runaway | Head to head, and {w} edged it. |
| One winner, second place within 10% of the winner (the real gap is shown) | Photo finish: {gap} in it. |
| One winner, second place within 10% of the winner (the real gap is shown) | Close enough to argue about all week. |
| The winner scored at least twice second place | {w} won by a comfortable margin. Very comfortable. |
| The winner scored at least twice second place | A runaway win. Everyone else was admiring the view. |
| Only the winner scored | {w} was the only one on the scoreboard. |
| 8 or more players, one winner | {n} players, one winner. Tough crowd. |
| Two or more share first place | A shared win. Twice the bragging, same trophy. |
| Two or more share first place | Dead heat at the top. Nobody blinked. |
| Two or more share first place | Tied for first. Diplomacy wins again. |
| Everyone has the same score (above 0) | Everyone tied. A perfectly balanced family. |
| Nobody scored | Nobody scored. A truly level playing field. |
| Nobody scored | Zero all round. The questions won this one. |
| A practice game (always, whatever the result) | Practice round: all the fun, none of the paperwork. |
| A practice game (always, whatever the result) | Just practice. Nobody's keeping score. Well, the app is. |
| Your card: you won outright | That was you. Enjoy it quietly. Or loudly. |
| Your card: you won outright | You won. Try to look surprised. |
| Your card: you share first place | You share the top spot. Sharing is caring. |
| Your card: last of 3 or more (not an all-tie) | Someone has to make the podium look good. |
| Your card: last of 3 or more (not an all-tie) | Every champion starts somewhere. Possibly here. |
| Your card: anywhere else | Solid middle of the pack. Room to climb. |
| Your card: anywhere else | Not first, not last: perfectly balanced. |
| Your card: you scored 0 and someone else did not | No points this time. The next game is a fresh start. |
| Your card: you answered nothing (dropped out) | You missed this one. Your seat's still warm. |
| Your card: you chose to sit out (only your phone knows) | You sat this one out. Fair enough. |

## Screens (Chromium phone emulation, captured by `scripts/check-results.mjs`)

| | |
|---|---|
| [Two players: the winner](01-two-player-win-winner.png) | Headline, winner, "You came 1st of 2", the celebration starting |
| [Two players: second](02-two-player-win-second.png) | Same headline and line; "No points this time…" |
| [Three players: last](03-three-players-last.png) | "You came 3rd of 3", a kind line |
| [Three-way tie](04-three-way-tie.png) | "3-way tie for first", all three named; the same on all three phones |
| [Dropped out](05-dropped-out.png) | The game ended at its time limit; "You missed this one…" |
| [Practice](06-practice.png) | "Practice" in the kicker and the line |
| [10 players, long names: 375](07-ten-players-375.png) · [390](07-ten-players-390.png) · [430](07-ten-players-430.png) | A two-way tie at the top; no sideways scrolling |

## Test it on your iPhone

Use the same steps as Stage 2 (`docs/stage2/README.md`), but open **https://codespaces.new/kekuBT/christmas-game-night-pilot/tree/claude/stage3-results**. Stage 3 sits on top of Stage 2, so one codespace tests both. Then:

| # | Do this | You should see |
|---|---|---|
| 1 | Two tabs, official Trivia. Answer well on tab 1 and badly on tab 2 | Tab 1: "<you> wins Trivia Showdown", a short burst of shapes, "You came 1st of 2". Tab 2: the same headline and line, "You came 2nd of 2", no burst. |
| 2 | Pull to refresh on tab 2 | Exactly the same headline and line. |
| 3 | Play again and answer identically on both tabs | "<A> and <B> tie for first" on both, with the same line. |
| 4 | Turn on iOS Reduce Motion (or Room menu → Animations → Off), then win a game | No burst; everything else the same. |
| 5 | Play a Practice game | "Practice" in the header and a practice line. |

## Limitations

- **Breakdowns are as before.** The header shows only the server's total and your place. Per-question detail stays in each game's existing review (Trivia's reveal, Connections' bands, Caption's votes, the shared answer review). The proposal's per-item "what earned points" breakdown needs the server's scoring details per game, which is a later stage.
- **Not touched:** the TV, Championship and Memory Book.
- **Not verified on a real iPhone.**
