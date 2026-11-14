# Stage 12.8: games built for teams

**Authorization:** the owner, directly in chat on 2026-11-14, about 3:25 a.m. ET:
> "But we definitely need more games that can be played with teams"

- **What Stage 12.7 did:** let 14 existing games be played as teams. Each player still plays alone, and the team's score is an average.
- **What this stage adds:** games where a team plays *together*:
  - **Team Huddle** (new): a quiz the team answers together.
  - **Charades** plays with the night's teams: 2–4 of them, with equal turns.
- **Next, Stage 12.9:** Relay (new), a race where the team passes the baton. It's a separate stage so each PR stays reviewable.

- **Branch:** `claude/stage12-8-team-games`, stacked on Stage 12.7. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

## 1. Which teams a team game uses (D-S128-01)
- **The night's teams:** used when at least two of them have players in this game. Pausing the night's teams doesn't apply here: these games are always team games.
- **No usable teams:** the game deals its own two balanced teams (seeded) for this game only. The briefing names both teams before anyone plays.
- **The copy:** as in 12.7, the game keeps its own copy of the teams from its start, so moving someone later never changes it.
- **Before play:** the briefing lists the teams on every phone and the TV, and each phone says "You're on …". This applies to every game played as teams, 12.7's too. The teams are public, so the briefing sends them while it still sends no game content.
- **Results:**
  - **Phones:** the heading names the winning team ("Team Sun wins Team Huddle"), and your place is your team's ("Your team came 2nd of 2").
  - **Phones and TV:** the 12.7 team results card.
  - **Night totals:** tonight's team wins count the game.

## 2. Team Huddle (D-S128-02)
- **The idea:** a quiz where a team answers *together*.
  - Each phone shows the question, and teammates' picks appear live on each other's phones ("Amina: B · You: C").
  - Other teams never see which option a team is leaning towards.
- **Questions:** 8 multiple-choice questions, from the same pool as Trivia, in this session's content (Everyday or Christmas). They're used up the same way, so a night doesn't repeat them.
- **Never in Quick Party** (it's casual-only, like Jebena Rush and Spectrum), **and never Home's "featured today".** The daily rotation is keyed to how many games are in it, so adding one would reshuffle every day's pick. It's in the shelf and the library like every game.
- **Picking:**
  - Tap an option to pick it. You can change your pick until the question closes.
  - The question closes when time runs out (25 s), or early once every team agrees. A team agrees when everyone on it has picked (or sat out) and all the picks are the same option.
  - Each phone says where the team stands: "Pick an answer", "Waiting for the rest of your team", "doesn't agree yet: talk it over", or "Your team agrees".
- **The team's answer:** the option most of its members picked. On a tie, the tied option picked first. A team where nobody picked has no answer.
- **Scoring:** 100 to the team for a right answer, and 25 more when everyone on the team who picked chose it. Every player gets their team's score, as in Charades.
- **The reveal (6 s):** shows the right answer, each team's answer, and how each team's picks were split.
- **TV:**
  - the question and its options;
  - each team's progress ("2 of 3 picked", "agreed ✓"), never the option, in a column of its own;
  - the reveal;
  - the team results.
- **Where:** casual rooms only and practice-only, for 4–10 players (at least 2 per team).

## 3. Charades with the night's teams (D-S128-03)
- **Teams:** the night's teams (2–4) when the room has them, or two balanced teams dealt for this game. This replaces the old split by join order.
- **Equal turns:** each team acts the same number of times, which is the size of the largest team. A smaller team's players act more than once, so team sizes never decide the game.
- **Screens:** the teams' names and marks replace "Team 1/Team 2" on phones and the TV, and the results use the team results card.
- **Unchanged:** the prompts, Correct/Pass, and practice-only.

## 4. Acceptance
1. A team game uses the night's teams, or deals two. It keeps its copy, and later moves don't change it.
2. **Team Huddle:**
   - teammates see each other's picks, and nobody else does (phones, the TV, spectators);
   - the question closes early only when every team agrees;
   - majority and tie-breaks are correct, and so are the scores;
   - the reveal is correct.
3. **Charades:** 2–4 teams with equal turns, and the teams' names shown.
4. Results on phones and the TV, and tonight's team wins.
5. 320 px fits. Nothing else moves, and the full gate passes.

## 5. Validation
- **Unit tests:**
  - the module (pure): majority, ties, early close, scores, sit-outs;
  - privacy: per-team projections with canaries;
  - the room: teams dealt or used, the copy, Charades turns.
- **Browser:** `scripts/check-team-huddle.mjs` with four phones and a TV:
  - teammates' picks;
  - nothing leaks to the other team or the TV;
  - agreeing closes early;
  - the reveal, the results and 320 px.
  - The Charades driver gets checks for the night's teams too.
- **Gates:** targeted, fast, then one full checkpoint.

## 6. Estimate
About 5 hours.
