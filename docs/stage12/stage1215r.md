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
- **The opt-out stays unconditional.** "Rather not say" is always offered and never pressed for.
  - Its one consequence is the symmetric one the review proposed: that round, the team neither guesses nor is guessed, so it can't score in it, and nobody scores on it.
  - Choosing it still counts as an action for qualification, as before, so opting out never costs a player their Cup day.
  - No answer is ever made up.
- **Feedback:**
  - **Guess phase:** a team sitting out is told plainly that it sits out this round's guessing.
  - **Reveal:** it says no guesses were made about or by that team this round.
- **No guessing at all:** when fewer than two teams take part, there's nothing to guess, and the round goes straight to its reveal. This was already the case when nobody answered.
- **Locking:** the guess phase closes early once every team taking part has locked.
- **What follows:**
  - **Two teams:** a team that opts out denies points to both sides that round. If it opts out of every round, the game is 0–0, a tie. It can't gain from opting out, only stop points it would not earn either.
  - **Three or more teams:** the others still score on each other, so the team that opts out falls behind in that round. That follows from the symmetric rule, not from a penalty.
  - **The briefing:** it now says it in one neutral line ("If everyone on a team says "Rather not say", that team sits the round's guessing out: nobody guesses it, and it guesses nobody."). The answer screen adds nothing, so it never nudges anyone to disclose.

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
- **Found while doing it (in an Official game's one-line comment):** with equal points but different places, the comment was picked from the equal points and could read "tied" under "Team Sun wins". When teams are level on points but placed apart, an Official game's comment now says "Level on points; Team Sun got there first." (seen in the local screenshot run below).

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

**Actual:** about 1 h 30 min of wall-clock time, from the review's arrival (about 10:43 p.m. ET) to the full gate's verdict (12:13 a.m. ET). Every gate passed the first time. The estimate allowed for failed gate rounds and slower driver work, and neither happened.

## Gates (one run on one revision each)

Evidence for every run is in `docs/evidence/gate-runs/`; local runs, failures included, are in `docs/evidence/stage1215r-local/README.md`.

| Revision | Gate | Run | Verdict |
|---|---|---|---|
| `c27e242` | targeted (relay, know-your-rivals, family-questions, cup-team-games, night-card, teams, game-night-flow, game-night, tv-show, results, team-huddle, split-clues, team-draw, territory, tug-of-war, lifecycle, one-path, official-practice, cup-party, briefing, session-flow, library) | `20261115-042304-c27e2420-14931` | PASSED (exit 0), 24/24, 9 min 18 s |
| `c27e242` | fast | `20261115-043238-c27e2420-18729` | PASSED (exit 0), 5/5; unit 1956/1956 |
| **`c27e242`** | **full (checkpoint)** | `20261115-043355-c27e2420-22664` | **PASSED** (exit 0, 106/106, 39 min 37 s, no retries) |

**Tested SHA: `c27e242`.** No other gate ran on this stage.

## Second round: review 6889824884 (two presentation repairs)

**Authorization:** the owner's review and handoff on #40, comment 6889824884 (2026-11-15, 12:35 a.m. ET; D-WF-01).
- **Verdict:** changes required.
- **Asked for:** two bounded wording and selection repairs, with checks scaled to them, a new completed report, and the earlier full-gate evidence kept (no rerun of `c27e242`).

1. **Know Your Rivals called an idle team's silence a privacy choice.** A team where nobody answered at all (the clock ran out: `{answered 0, passed 0}`) was described as having said "Rather not say": on the reveal, the guess-phase phone note and the rivals' rows.
   - **Now:** every surface says "Nobody on Team Sun picked either answer this time…". That is true whether they all said "Rather not say", let the time run out, or a mix, and it is true for older records too. It never says why.
   - **The briefing:** "If nobody on a team picks either answer ("Rather not say", or the time runs out)…".
   - **Unchanged:** the scoring rule and the unconditional opt-out.
2. **An Official Relay's tiebreak comment named an unrelated winner.** The old check fired on any equal-points pair placed apart and then named the overall winner. Example: Coral home with 150, Sun and Mint level on 50 further down, and it read "Level on points; Team Coral got there first."
   - **Now:** `teamTiebreakQuip` (`lib/teamLines.ts`) gives the comment only when the winning team is level on points with a team placed below it, and names both: "Level on points with Team Coral; Team Sun got there first."
   - **Other cases:** a tie further down, a true shared first place and unequal points keep the usual comment, which describes only the winner's margin.
   - **Where the lower tie is explained:** the lanes' line ("Team Sun and Team Mint both ran 5 legs; Team Sun finished its last leg first.") already uses the tied lanes themselves.

**Estimate:** about 1 h (wording, a pure function, tests, a driver round, screenshots, a targeted and a fast gate).
**Actual:** about 15 minutes, from the review's arrival (12:35 a.m. ET) to the fast gate's verdict (12:48 a.m. ET).

**Gates for the second round (one run on one revision each):**

| Revision | Gate | Run | Verdict |
|---|---|---|---|
| `cfaf412` | targeted (know-your-rivals, relay, cup-team-games, results, team-huddle, tug-of-war, split-clues, briefing, night-card, game-night-flow) | `20261115-054306-cfaf4122-1429` | PASSED (exit 0), 12/12, 4 min 19 s |
| `cfaf412` | fast | `20261115-054732-cfaf4122-3438` | PASSED (exit 0), 5/5; unit 1958/1958 |

**Tested SHA for the second round: `cfaf412`.** As the review asked, no full gate ran on it. The full checkpoint pass (`20261115-043355-c27e2420-22664`) belongs to `c27e242` alone. `cfaf412` changes the copy in three web files, one pure helper (`lib/teamLines.ts`), the briefing line, tests and one driver; no scoring or lifecycle code changed.

## Third round: review 6890761957 (the reviewer's independent live audit)

**Authorization:** the owner's review and handoff on #40, comment 6890761957 (2026-11-15, 1:58 a.m. ET; D-WF-01).
- **The audit:** the reviewer's first live audit, on a private preview of `cfaf412` in desktop Chromium. It confirmed the earlier repairs, and found two presentation faults.
- **Also asked for:** the malformed evidence links in the earlier reports repaired.

1. **The TV's final standings lost Relay's tiebreak.**
   - **The fault:** the generic list ranked a team game's players by their points. Coral 150, Sun 50, Mint 50 with places 1, 2, 3 showed Coral's players 1, 1 and Sun's and Mint's 3, 3, while the team card beside it was right.
   - **Now:** for a game built for teams, the list gives every player their team's place from the server's team results (`teamRankedStandings`, `lib/teamLines.ts`) and names the team.
   - **Kept:** a true tie between teams still shares a place, and a team that didn't score comes last with a dash.
   - **Unchanged:** individual games and per-player games played "as teams" (whose players' own points are real) rank by points, as before.
2. **"Make it a Family Cup" relabelled the casual game before it as Practice.**
   - **The fault:** the lobby's "Last game" card chose its label from the room's current kind.
   - **Now:** the card, the results comment and the results screens' wording take a game's mode as it was played (`gameModeWord` with the server's `casualGameIds`, which the TV already used). A casual game stays Casual after the change and after a reload; a later Practice game is Practice and an Official one Official.
   - **Unchanged:** no game data is migrated and no scoring changes.
3. **The links:** links to repository files are stored with their targets wrapped in backticks (and image embeds lose their `!`). Only links to comments and pull requests come through intact.
   - **Repaired:** the three earlier reports (#39: 6888310568; #40: 6889631930, 6889961653) now give each file as its repository path at the commit, with a dated edit note.
   - **New reports:** they do the same.

**Estimate:** none was written before this round's work began, an omission. The earlier rounds each had one. The actual time is recorded with the gates below.

**Rendered coverage, added after the first gates (`a82ea44`):** the review asked for the TV's final standings rendered in three cases and the labels through the change and a reload. The drivers above rendered one team case (Tug of War) and Casual; the other cases were pure-helper tests. `apps/web/src/components/mchezo/TvFinal.test.tsx` now renders the real TV final screen with `react-dom/server` and reads its list back:
- the review's Relay (150/50/50 at places 1, 2, 3) reads 1, 1, 2, 3 by team;
- a true tie shares a place;
- a team game placed by score ranks by its team results;
- an individual game and a game played as teams rank by points;
- the label reads Casual, Practice or Official as the game was played.

On `cfaf412` the same test renders 1, 1, 3, 3 (the reviewer's screen) and fails its three team cases. `check-one-path` gains Official after an official game, and Practice after a practice game and a reload. `TvFinal` is only exported; nothing else changed.

**Gates on `de26509` (one run on one revision each; superseded by `a82ea44` below):**

| Run | Level | Verdict | Steps | Wall |
|---|---|---|---|---|
| `20261115-071221-de265098-5268` | targeted (13 drivers: cup-team-games, one-path, tv-show, results, relay, team-huddle, tug-of-war, know-your-rivals, game-night-flow, cup-party, official-practice, lifecycle, night-card) | **PASSED** (exit 0) | 15/15 (cup-team-games 27, one-path 70 checks) | 4 min 29 s |
| `20261115-071657-de265098-7750` | fast | **PASSED** (exit 0) | 5/5 (unit 1960/1960) | 1 min 15 s |

**Gates on `a82ea44`, the tested SHA for this round:**

| Run | Level | Verdict | Steps | Wall |
|---|---|---|---|---|
| `20261115-072853-a82ea449-16515` | targeted (the same 13 drivers) | **PASSED** (exit 0) | 15/15 (one-path 74, cup-team-games 27 checks) | 4 min 22 s |
| `20261115-073324-a82ea449-18915` | fast | **PASSED** (exit 0) | 5/5 (unit 1966/1966) | 1 min 08 s |

- **No full gate ran on `de26509` or `a82ea44`,** as the review asked ("do not rerun unchanged historical full suites"). The full checkpoint pass stays `c27e242`'s alone.
- **No gate run failed or was cancelled.** One local screenshot run did fail, on my own check's wrong expectation (`docs/evidence/stage1215r-local/README.md`).
- **The reviewer's screen, locally:** a local run with the testing-only time scale played the review's three-team Official Relay. The TV's list reads 1, 1 (Team Coral), 2, 2 (Team Sun), 3, 3 (Team Mint), as `relay-tiebreak-3teams-cup-tv-final-1920` shows.
- **Actual time:** about 40 minutes, from the review at 1:58 a.m. ET to the screenshot run at about 2:37 a.m. ET. The first repair's gates passed at 2:18; the rendered coverage the review asked for took the rest.
- **Also corrected:** the link repair itself happened at about 2:15 a.m. ET, not 2:25 as I first wrote in the three edit notes; those notes now say 2:15.
