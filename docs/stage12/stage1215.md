# Stage 12.15: team games in a Family Cup

**Authorization:** the owner, directly in chat on 2026-11-14: "Also this both can be added for casuals and cups". The message was sent at about 1:22 p.m. ET, just after the five-game plan, and reached me at 3:57 p.m. ET, once Stage 12.14 was built. I asked two questions; the owner answered at 6:12 p.m. ET:
- **Which games:** "All 7 team games": Team Huddle, Relay, Split Clues, Team Draw, Territory, Tug of War and Know Your Rivals become playable in a Family Cup as well as casual rooms.
- **Cup points:** "Yes, count it". The host picks Official or Practice like any Cup game; an Official one counts in the Cup standings, every player getting their team's result. This answers D-S127-03 ("a Family Cup stays individual", provisional) with yes.

**Branch:** `claude/stage12-15-team-games-cup`, stacked on Stage 12.14. Unmerged.
**Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

## 1. How a team game counts (D-S1215-01)

The owner already approved how team games count, in the Cup rules of 2026-11-04 (`docs/CHAMPIONSHIP_RULES.md`). This stage applies them; it invents no new scoring.
- **One game:**
  - the competitors in a team game are the **teams**;
  - they are ranked by the team's result, with the usual 0–100 midrank placement (ties share the average place; fewer than two teams that scored: the game doesn't count);
  - every member gets the team's placement, "not multiplied by team size".
- **One day:** 75% the average of individual games, 25% the average of team games (the "Family Cup" format, `combined-75-25`).
  - A day with no team game is exactly as before: the individual average at 100%.
  - A day with only team games uses the team average at 100% (the engine's existing default, still listed as configurable in the rules).
- **Fixed on the way:** the engine ranked a team game's *players* rather than its teams. With uneven teams that changes the numbers (a winning team of 3 against a team of 2 got 75 and 12.5, not 100 and 0). The seven team games are now ranked by team. A Charades result recorded as Official before Sprint 3 keeps its old numbers: Cups that already exist keep their results exactly (D-S3-07, `tests/cup-integrity.test.ts`).

## 2. Which Cups (D-S1215-01)

- **New Family Cups** (and casual rooms made into one) use the owner-approved **Family Cup** format: 75% individual, 25% team.
  - The temporary "Individual Family Cup" of Sprint 3 (D-S3-07) existed because no team game could count fairly: Charades had no checked result and fixed teams. The seven team games now give checked, team-ranked results.
- **A Cup already created as an Individual Family Cup** keeps its format: a Cup's rules never change while it runs (D-S3-07). In such a Cup, team games can still be played, but as Practice only, and the screen says why: "This Family Cup counts individual games only, so team games are practice here."

## 3. Where and how (D-S1215-01)

- **The seven games** play in casual rooms and Family Cups, Official or Practice in a Cup, for 4–10 players.
  - Still never picked automatically: not by Quick Party, Shuffle or Home's "featured today". The host chooses them.
  - **Charades** stays practice-only: its scoring hasn't been redesigned (Sprint 3, P9).
- **Teams in a Family Cup:** the host can make the night's teams in a Cup room too (and a casual room made into a Cup keeps its teams).
  - In a Cup, teams are used only by the games built for teams.
  - Every other game stays individual: "Play as teams" for per-player games stays a casual-room feature. Team scoring for those games in a Cup was not asked about, so it isn't decided.
  - Without the night's teams, a team game deals two balanced teams for itself, as in a casual room.
- **The screens:**
  - **Lobby:** the Official/Practice choice works for team games like any other game.
  - **Results:**
    - a team game's results say whether it was Official (it counts toward the Cup), Practice or Casual. Until now they said "Practice game" in any Cup;
    - the one-line comment under the heading is picked from the teams' scores ("Head to head, and Team Sun edged it."). Picked from the players' scores, teammates looked "tied for first" ("Tied for first. Diplomacy wins.").
    - Only Official games pick from those lines, so this was new with team games in a Cup; I found it in the driver's first screenshot.
  - **Cup screen:** each official game's placements come from the server, so a team game shows team placements. The note explains the 75/25 day and team ranking.
  - **TV medals (display only):** a team game's medals go by team place: everyone on the winning team gets gold, the next team silver, then bronze. Until now the medal table ranked a team game's players, so with a winning team of two or more the second team got no medal (a display fault since Stage 12.8, in casual rooms too).

## 4. Acceptance

1. **Starting:** the seven games start in a Family Cup, Official or Practice. Official needs the game's 4 players. Charades stays practice-only.
2. **Counting:** an Official team game counts by team placement, 25% of the day. Results already recorded in existing Cups are unchanged.
3. **Individual Cups:** an existing Individual Family Cup refuses an Official team game, with the reason, and so does a lineup with one. A casual room made into a Cup is always a Family Cup now, so its lineup's team games become Official (where 2 or more are planned).
4. **Teams:** teams can be made in a Cup room. Team games use them; per-player games stay individual there.
5. **Screens:**
   - the results' wording is right for Official, Practice and Casual;
   - the Cup screen's placements are the server's;
   - TV medals for team games go by team.
6. **The full gate passes.**

## 5. Validation

- **Unit tests** (`tests/stage1215-cup-team-games.test.ts`):
  - team-ranked placement with uneven teams, ties and a team that didn't score;
  - the day's 75/25 split;
  - new Cups use the Family Cup format;
  - an Individual Cup refuses (start, lineup, upgrade relabel);
  - teams in a Cup room, used by team games only;
  - a whole Official Tug of War in a Cup feeding the championship;
  - legacy Charades results unchanged.
- **Existing tests updated:**
  - the Individual Family Cup tests now build such a Cup explicitly;
  - the manifest's practice-only list;
  - the Cup lineup and the teams refusals.
- **Browser:** a new driver, `scripts/check-cup-team-games.mjs`. It covers:
  - a Family Cup with teams;
  - an Official Tug of War (team placements on the Cup screen, the standings, the results wording, TV medals by team);
  - the results' wording and comment.
  - **Not in the driver:** an Individual Cup's refusal. Every new Cup is a Family Cup now, so a browser can't reach one; the unit tests build one the way it is saved.
  - **Re-run:** `check-lifecycle` (its Cup label check follows the format), `check-teams`, `check-one-path`, `check-cup-party`, `check-tv-show` and `check-official-practice`.
- **Gates:** targeted, fast, then one full checkpoint.

## 6. Estimate

About 3 hours, written before the work began: the scoring engine already has the team channel; the work is the ranking by team, the format default, the Cup room's teams and the screens.
