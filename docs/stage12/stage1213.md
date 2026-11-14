# Stage 12.13: Tug of War

**Authorization:** the owner's direction of 2026-11-14 (about 1:20 p.m. ET), recorded in `docs/stage12/stage1210.md`: five games built for teams, one stage and one stacked draft PR each. This is the fourth.
**Branch:** `claude/stage12-13-tug-of-war`, stacked on Stage 12.12. Unmerged.
**Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates. The team kit of 12.10 (D-S1210-01) applies, with this game's own catch-up gap (below).

## 1. The game (D-S1213-01)

- **The idea:** everyone pulls at once. Every player answers quick sums on their own phone as fast as they can, and every right answer pulls the rope for their team.
- **Bouts:** three, of 40 s each, then a 6 s result.
- **The sums:**
  - everyone gets the same sums in the same order (seeded, a new set each bout, from Math Mayhem's generator);
  - each player works through them at their own pace.
- **Answering:**
  - a right answer is one pull and moves you to the next sum;
  - a wrong answer freezes you for 2 s, and that option is greyed out.
- **Fair for uneven teams:** a team's pull is its right answers **per player** (total ÷ the team's size in this game), so a smaller team can win. Everyone on a team counts, so a teammate who stops answering pulls their team's average down.
- **The rope:**
  - two teams pull a rope;
  - three or four teams pull a knot in the middle of a star;
  - the knot leans toward the team pulling hardest, and a line under it says so in words ("Leaning to Team Sun");
  - each rope end carries its team's colour and shape.
- **Points per bout, by pull:** 100, 75, 55, 40 (a tie shares the place). Everyone scores their team's points.
- **Catch-up:** a team alone in last place and at least **40** points behind pulls ×1.2 in the next bout.
  - The kit's 100 couldn't be reached here: a bout's places differ by at most 60 points (45 with three teams), so with two or three teams the gap after two bouts is at most 90.
  - 40 is about a place and a half in one bout.
- **No sitting out:** your team's pull is per player.
- **Secrecy:** a phone gets only its own current sum and never its answer. The TV and other players see pulls, never a sum.
- **The TV** (not zoomed, sized in the 1920 × 1080 canvas's pixels): the rope or star, each team's pull per player (right answers and players), the catch-up mark, and the bout's winner at the result.
- **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's "featured today". Uses the night's teams (a team needs at least 2), or deals two.

## 2. Acceptance

- Everyone gets the same sums.
- A right answer moves you on; a wrong one freezes you for 2 s.
- Pull is per player, so a smaller team can win.
- The rope (2 teams) and the star (3–4 teams) lean the right way.
- Places and points per bout, with ties shared.
- Catch-up ×1.2.
- No sum on the TV or in its data.
- Phones at 320–390 px; the TV at 1920 px fits above its footer; the full gate passes.

## 3. Validation

- **Unit tests:** `tests/stage1213-tug-of-war.test.ts` (8).
  - **The module:**
    - same sums for everyone;
    - right, wrong, freeze and greyed options, stale sums and rounds;
    - secrecy;
    - pull per player with uneven teams;
    - ties;
    - catch-up;
    - a whole game.
  - **The room:** a whole game with uneven night's teams, bouts ending on the room's clock.
- **Browser:** `scripts/check-tug-of-war.mjs` (24 checks), with seven phones in three uneven teams and a TV. It covers:
  - the briefing;
  - the star;
  - the same first sum on every phone;
  - secrecy;
  - a right and a wrong answer on a phone (freeze);
  - pull per player and the lean;
  - the bout result;
  - catch-up in bout 2 winning it;
  - results;
  - 320 px;
  - the TV's fit.
- **Re-run:** `check-relay` (it shares the sum generator), `check-warm-ivory` (W8 lists Tug of War's library cards) and `check-library`.
- **Gates:** targeted, fast, then one full checkpoint.

## 4. Estimate

About 3 hours (the sum generator, the kit and the scoreboard exist; the rope is new).
