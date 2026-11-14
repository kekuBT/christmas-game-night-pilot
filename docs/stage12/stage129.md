# Stage 12.9: Relay, a race for teams

**Authorization:** the owner, directly in chat on 2026-11-14, about 3:25 a.m. ET:
> "we definitely need more games that can be played with teams"

Relay is the second game built for teams. It was split out of Stage 12.8 so each PR stays reviewable.

- **Branch:** `claude/stage12-9-relay`, stacked on Stage 12.8. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

## 1. The game (D-S129-01)
- **The idea:** each team runs a relay of 12 quick sums.
  - Only the runner's phone can answer. Teammates see the same sum and can shout help.
  - A right answer passes the baton to the next teammate.
  - The first team to finish all 12 legs wins.
- **Teams:** the same rule as Stage 12.8 (D-S128-01): the night's teams, or two dealt for the game.
- **Fair legs:** every team runs the same 12 sums in the same order (seeded, from Math Mayhem's generator).
  - A team never sees another team's sums: each phone gets only its own team's current leg.
  - The TV shows lanes and progress, never a sum.
- **Runners:** a team's players take legs in turn, so a smaller team's players run more legs.
- **Mistakes and absences:**
  - **A wrong answer** freezes that runner for 3 s, then they try again (the wrong option is greyed out).
  - **No answer:** if the runner doesn't answer within 20 s, the baton passes to the next teammate on the same sum. So a phone that drops never stalls its team.
- **The finish:** the race ends when every team has finished, or after 4 minutes.
- **Places:** most legs first; on equal legs, whoever finished their last leg first.
- **Scoring:** 10 per leg, plus 30, 20 or 10 for finishing 1st, 2nd or 3rd. Every player scores their team's points (team-derived).
- **Where:** casual rooms only and practice-only. Never in Quick Party, and never Home's "featured today".

## 2. Screens
- **The runner's phone:**
  - "Your leg! Answer to pass the baton", the sum and four big options;
  - "Leg 5 of 12 · baton passes in 14 s";
  - after a wrong answer, "Not that one! Frozen: 3", counting down, with the options locked and the wrong one marked "Tried".
  - Countdowns never show more than the whole freeze or turn, even when the phone's clock estimate trails the server's by a few milliseconds.
- **Teammates' phones:** "Keku is running", the same sum (read-only), and "Help Keku out loud! Only the runner's phone can answer."
- **Every phone:** a lane per team showing progress and the runner, never a sum. Your team's lane is outlined.
- **TV:** "The race is on!", then a lane per team with its mark, name, runner and legs done. A team that finishes gets a flag and its place.
- **Results:**
  - the team-led heading (12.8, "Team Coral wins Relay") and the team results card;
  - each team's lane as it finished;
  - a team still out when time ran out reads "Time ran out: 7 of 12 legs", never a runner.
- **Team results for games built for teams (applies to Team Huddle and Charades too):**
  - **Phones:** the card says "A team game", shows each team's points ("150 pts"), and reads "Everyone on a team scores the team's points".
  - **TV:** the kicker says "A team game · each team's points".
  - **Why:** these games give every player the team's points, so 12.7's "average" wording was true but misleading there. 12.7's played-as-teams games keep "average".

## 3. Acceptance
1. **Teams and legs:** teams as in 12.8. The same sums for every team. A team's sums never reach another team or the TV.
2. **The baton:**
   - a right answer passes it;
   - a wrong answer freezes the runner for 3 s, with the wrong option greyed out;
   - 20 s without an answer passes it to the next teammate on the same sum;
   - smaller teams' players run more legs.
3. **Places and scores:**
   - finish order and legs;
   - places, with equal legs ranked by the earlier finish;
   - every player scores their team's points;
   - the race ends when all finish, or at 4 min.
4. **Screens:** phones and the TV as in §2. Nothing else moves, and the full gate passes.

## 4. Validation
- **Unit tests (the module, pure):**
  - baton passing, the freeze and the 20 s pass;
  - the finish order, places and scores;
  - privacy: per-team projections with canaries.
- **Room tests:** a whole race through `RoomEngine`.
- **Browser:** `scripts/check-relay.mjs`, four phones and a TV:
  - the runner and teammates;
  - a wrong answer and the freeze;
  - a dropped runner is passed over;
  - the finish, results and TV lanes;
  - 320 px.
- **Gates:** targeted, fast, then one full checkpoint.

## 5. Estimate
About 4 hours.
