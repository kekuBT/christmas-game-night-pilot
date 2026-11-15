# Stage 12.15-R: repairs from review 6888718011 (team games in a Family Cup)

**Authorization:** the owner's review and handoff on #39, comment 6888718011 (2026-11-14, about 10:43 p.m. ET), under D-WF-01. Verdict: changes required. It asks for:
- six repairs, in priority order;
- a bounded, stacked, unmerged repair PR based on #39, linking #39 and #5;
- an acknowledgement and an estimate before implementation.

**Branch:** `claude/stage12-15r-team-game-repairs`, on #39's head `1eafe41` (tested source `bcf1406`). Unmerged.
**Unchanged:** no merge or deployment, $0, private ports, AGENTS.md rules, the ledger and history behaviour, and the gates.

Every finding below was checked against the source at `1eafe41` before writing this; each gets a failing test first.

## R1 (P1): Relay participation for a fully active larger team

**The fault:** `relay.ts` reports each runner's successful legs against all 12 of the team's legs. The Cup's meaningful-participation rule (policy v1: at least 2 actions and at least half the opportunities) then fails every runner in a team of 3 or more who answered every turn (4/12). A team of 2 passes (6/12). Wrong answers aren't counted as actions at all.

**The rule (D-S1215R-01):** a runner's opportunities are their own turns.
- **A turn:** each time the baton reaches the runner (at the start, after a teammate's right answer, or after a teammate's 20 s ran out).
- **`of`:** the runner's turns that ended (a right answer, or their 20 s ran out).
  - A turn still open when the game ends counts only if the runner answered in it.
  - A turn cut off by the end isn't held against them.
- **`done`:** the turns in which the runner answered at least once, right or wrong.
- **`actions`:** every answer the runner gave, right or wrong. This matches the displayed qualification contract, where "answers and guesses, wrong ones included" are actions.
- **Idle or disconnected runners:** their turns run out and count as opportunities they didn't take. A teammate finishing never credits them.
- **Unchanged:** the Cup's policy itself (2 actions, half the opportunities, 1 game a day). Each Cup stores its policy.

**A limit, documented:** a race has 12 legs, so in a team of 7 or more some runners get a single turn when everyone answers right first time. One answer is below the policy's 2-action minimum. Teams of 2–6 can always reach it. The team kit allows teams that large only with the night's teams in a 10-player room. Changing the minimum is the Cup's policy, not this repair's.

**Saved games:** a Relay saved before this change has no turn record. Its participation is computed the old way, so no recorded result changes. (Relay was casual-only before Stage 12.15, which is unmerged, so no official Relay result exists anywhere.)

## R2 (P2): Know Your Rivals when a whole team opts out

**The fault:** a team whose players all chose "Rather not say" isn't guessed, but it still guesses the other teams and scores. The other team has nothing to guess back. With two teams, Sun opting out and guessing Coral's count right scores Sun 30 and Coral 0.

**The rule (D-S1215R-02):** guessing is mutual.
- **Who guesses:** in a round, a team takes part in the guessing when at least one of its players answered (picked one of the two). Teams that take part guess each other; a team that doesn't neither guesses nor is guessed.
- **Equal chances:** every team taking part has the same number of rivals to guess, so equal accuracy gives equal points.
- **The opt-out stays unconditional.** "Rather not say" is always offered, never pressed for and never penalised: a team that opts out only sits out that round's guessing, and nobody scores on it.
  - Choosing it still counts as an action for qualification, as before, so opting out never costs a player their Cup day.
  - No answer is ever made up.
- **Feedback:**
  - **Guess phase:** a team sitting out is told plainly that it sits out this round's guessing.
  - **Reveal:** it says no guesses were made about or by that team this round.
- **No guessing at all:** when fewer than two teams take part, there's nothing to guess, and the round goes straight to its reveal. This was already the case when nobody answered.
- **Locking:** the guess phase closes early once every team taking part has locked.
- **What follows:** a team that opts out of every round denies points to both sides. In a two-team game, that makes the game 0–0, a tie. A team can't gain from it, only stop points it would also not earn. This is stated in the briefing's privacy promise rather than prevented, because the opt-out must stay unconditional.

## R3 (P2): a skipped final Family Question in finished projections

**The fault:** when the host skips the last question, the game finishes on that round. The public and player views still carry its prompt, options and kind at the top level (only `result` and `rounds` say `{ skipped: true }`).

**The fix:** a round the host skipped is never described, in any view, after the skip.
- The top-level prompt, options and kind are left out whenever the current round is a skipped one.
- The skip marker and every valid earlier round stay.
- Skipped rounds' answers are already deleted at the skip.
- **Not covered:** this ends the exposure after the skip. It can't take back what phones were shown while the question was open.

## R4 (P2): Relay's TV freeze after it ends

**The fault:** the player view hides a freeze once the server clock passes its end, but the public view (TV and lanes) says "frozen" as long as the field exists. It stays until the next answer or turn change.

**The fix:**
- Both views use one predicate: frozen while `now < frozenUntil`.
- The freeze's end is a module due time, so the room ticks at that instant, clears the freeze and sends fresh views.

## R5 (P2): Relay's unfinished-race tiebreak

**The fault:** the Stage 12.9 spec ranks lanes by legs, then by who completed their last leg first. The code records that time only for the twelfth leg (`finishedAt`), so lanes still running at the game's end tie.

**The rule (D-S1215R-03):**
- **The time:** each lane records when it completed its last leg (`lastLegAt`). Lanes rank by legs, then by `lastLegAt`. Equal legs with the same instant, or no legs, share a place.
- **One ranking everywhere.** Relay's places are the game's result: the lanes, the results heading, the team results card, TV medals and the Cup's team placement all follow them.
  - The room records the places when the game finishes (`outcome.teamPlaces`), so a restored game keeps them.
  - The points don't change: 10 a leg, plus 30/20/10 for the first three teams home. Two unfinished teams with equal legs keep equal points, and the results say which got there first.
  - This adds no bonus; it applies the ranking Stage 12.9 already specified. Points and places can only differ in that one case, because a finished team always outscores an unfinished one, and finishing bonuses differ.
- **Other team games:** they have no tiebreak of their own, so their places still come from their scores.
- **Saved games:** a finished game without recorded places uses scores, as before.

## R6 (P2): team identity in the lobby, TV recaps and the night card

**The fault:** the results screen and the TV's final name the winning team. But three places still use the per-player winner line, so two winning teammates read as "tied for first":
- the lobby's "last game" summary (`winnerLine(rawScores)`);
- the TV's recent-games lists (`resultLine`);
- the night card (text and picture).

**The fix:**
- **One line everywhere:** `resultLine` uses the game's authoritative team results (`teamWinnerLine`, the wording the results screen and TV final already use) when the game has them. The lobby, the TV's lists and the night card all use it.
- **The lobby's own line:**
  - for a team game: "Your team, Team Sun, won", "came 2nd of 3" or "tied for first", with the team's points;
  - if the player wasn't in the game: "You weren't in this one".
- **Unchanged:** individual and cooperative games.
- **Player names:** a team line names the team, not its players.

## Acceptance

1. A fully active Relay team of 2, 3, 4 or 5 qualifies; an idle runner doesn't, whatever the team does. Wrong answers count as actions. This holds through a whole Cup game in the room, its day score and a restored snapshot.
2. In Know Your Rivals, equal accuracy with equal chances gives equal points when one, all or several teams opt out. A team that opts out never scores on others.
3. No skipped Family Question's prompt, options, answer or author appears in any finished, reconnected or restored view.
4. A Relay freeze ends on the TV and the phone at the same instant, without another answer.
5. Unfinished Relay lanes with equal legs rank by their last leg's time on every screen and in the Cup.
6. The lobby, the TV's recaps and the night card name the winning team for a team game, and say so for a team tie.
7. The full gate passes on the final source.

## Validation

- **Unit tests:** a failing test for each finding first.
  - **R1:** RoomEngine end to end: a finished Official Relay in a Cup with teams of 2, 3, 4 and 5; wrong attempts, an idle runner and a race cut off by the deadline; qualification, day scores and a restored snapshot.
  - **R2:** one, all and several teams opting out; partial answers; no answers; catch-up; a replay; the official Cup projection.
  - **R3:** final and intermediate skips through room projections, reconnect and a saved and restored room, with a sentinel prompt, options, answer and author.
  - **R4:** expiry before the 20 s turn ends, and a reconnect.
  - **R5:** equal legs at the deadline; truly equal times; finished races; a restored snapshot; the Cup placement and team results.
  - **R6:** `resultLine`, the lobby line and the night card's text, for a team win and a team tie.
- **Drivers:** `check-relay` gets checks for R4 and R5's screens, `check-know-your-rivals` for R2, `check-family-questions` for R3, and `check-cup-team-games` or `check-night-card` for R6.
- **Then:** targeted drivers and both typechecks, a fast gate, and one clean full gate on the final source SHA. CPU-heavy unit phases are never run at the same time.

## Estimate

About 5 hours of wall-clock time, written before implementation:
- R1 with its room tests, about 1 h;
- R2, server and phones, about 50 min;
- R3, about 25 min;
- R4, about 20 min;
- R5, including team results and the Cup placement, about 50 min;
- R6, about 40 min;
- drivers and screenshots, about 30 min;
- gates (targeted, fast, then one full of about 40 min) and the report, about 1 h 10 min.

A failed gate would add a round.
