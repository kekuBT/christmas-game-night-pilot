# Stage 12.7: teams for the night

**Authorization:** the owner, directly in chat on 2026-11-14, about 3:25 a.m. ET:
> "Don't add item 6. The rest that I mentioned can be added. But we definitely need more games that can be played with teams"

That covers suggestion 7 (Teams) and asks for more team games. Little-ones mode (item 6) is dropped.
- **This stage:** teams for the whole night, and most existing games playable as teams.
- **Stage 12.8:** new games built for teams.

- **Branch:** `claude/stage12-7-teams`, stacked on Stage 12.6. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

**Before this stage:** the only real teams were Charades', which splits by join order and is practice-only. Spectrum is one cooperative team. The Tournament Studio's "Team Clash" only had Charades.

## 1. The night's teams (D-S127-01)
- **Who and where:** the host or a cohost of a casual room, from the lobby's Teams card ("Make teams"). A Family Cup stays individual (D-S127-03).
- **The teams sheet:**
  - **How many:** 2, 3 or 4 teams (no more teams than players).
  - **Make / Shuffle:** everyone in the room is dealt round the teams in a seeded random order, so sizes differ by at most one. Shuffling again keeps the names the teams already had.
  - **Names and marks:** each team has a default name and a colour *and* a shape ("Team Coral ▲", "Team Sun ●", "Team Mint ■", "Team Iris ◆"). The colour is never the only cue. Names can be changed (up to 20 characters, all different).
  - **Moving someone:** every player has a "Move to" button for each other team. A move made against an older view of the teams is refused, and the sheet shows the teams as they are now. A view is never mistaken for a newer one: the teams' revision number is never given out twice, even after "No teams tonight" or a restart.
  - **No teams tonight:** clears them after a second tap. Games already played keep their team results.
- **Newcomers** join the smallest team; the host can move them.
- **Everyone sees the teams:**
  - every phone's lobby lists the teams and says "You're on …";
  - the TV lobby lists them with tonight's team wins.
- **Saved with the room.** Teams that can't be read back whole are dropped (never half a team).

## 2. Playing as teams (D-S127-02)
- **The games:** 14 of the 17 can be played as teams, every competitive game that scores each player:
  - Trivia, Word Connections, Who Said That?, Guess the Year, Closest Wins, Category Sprint, Geography, Math Mayhem, Caption Clash, Majority Rules, Pattern Pulse, Draw & Guess, Jebena Rush, Family Questions.
  - **Not:** Impostor (its scores belong to a side), Charades (it has its own two teams, see 12.8) and Spectrum (one cooperative team).
- **When:** while the room has teams, every team game starts as a team game, whichever way it starts (picked, lineup, Play again).
  - The host can "Play the next games individually" for a while, and switch back.
  - A game is played as teams only if at least two teams have players in it.
- **The game's own copy:** the game keeps a copy of the teams from its start, with only its players. Moving someone later never changes a game.
- **Team score:** the **average** of the team's players who took part (answered at least once, or scored). So:
  - a team of two can beat a team of four;
  - a player who sat the whole game out doesn't pull their team down;
  - a team with nobody taking part has no score.
- **Ranking:** best average first; equal averages share a place.
- **Everyone keeps their own score.** Individual standings are unchanged.
- **Results:**
  - **Phones:** "👥 Played as teams", the winning team, each team's average and players, your team marked.
  - **TV final:** leads with the winning team ("The Lions wins") and shows the team results in place of the podium. Everyone's own standings stay alongside.
  - **TV lobby:** tonight's team wins.

## 3. What stays the same (D-S127-03, a provisional default)
- **A Family Cup is individual:** teams can't be made in a Cup, and official scoring is untouched. Team play in a Cup would change Cup scoring, which needs the owner (AGENTS.md).
- **Solo rooms:** no teams.

## 4. Acceptance
1. Host or cohost only, casual only.
   - Make 2–4, balanced and seeded; move (refusing a stale view), rename (checked), pause and resume, clear.
   - A newcomer joins the smallest team. Teams are public and saved.
2. A team game copies its teams at its start and is unchanged by later moves. Not a team game, paused teams, or one side only means no team play.
3. Team scores are averages of players who took part, with shared ranks; individual scores are unchanged.
4. Phones and the TV show §2; the lobby card and sheet fit 320 px.
5. Nothing else moves, and the full gate passes.

## 5. Validation
- **Unit and HTTP tests:** `tests/stage127-teams.test.ts` covers:
  - the rules (pure): lists, balance, the smallest team, names, results, the winner line, the night's wins, the game list;
  - the room: permissions, Cup refused, stale moves, rename, pause, clear, newcomers, public and saved;
  - team games through Math Mayhem: averages, the copy, later moves;
  - no team play when paused, for Impostor, or with one side;
  - HTTP statuses.
- **Browser:** `scripts/check-teams.mjs`, four phones and a TV:
  - make, move, rename;
  - "You're on…", the TV lobby;
  - a team game's results on phones and the TV;
  - pause, then a game without teams, then resume;
  - a newcomer, the TV's team wins;
  - 320 px;
  - clear.
- **Gates:** targeted, fast, then one full checkpoint.

## 6. Estimate
About 4 hours.
