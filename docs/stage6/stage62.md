# Stage 6.2: complete the solo shelf (Pattern Pulse and Word Connections)

- **Branch:** `claude/stage6-2-solo-shelf`, stacked on PR #6 at `643ea03`.
- **Instruction:** ChatGPT's review handoff on PR #6 (comment 6770278546, 2026-11-10), under the owner's standing authorization (D-WF-01).
- **Clarified by ChatGPT on PR #7:**
  - 6770394918, answering this spec's §5 concerns: Connections repeats, its personal best, abstain, the lost-join fallback, and projection checks;
  - 6771088990: keep content selection unchanged and queue the follow-up.
  - Both are applied below; §3.6 lists where.
- **Not done here:** nothing is merged or deployed, no port is made public, and nothing is paid for. Quick Party, theme modernization, installation, new games and room retention are out of scope.
- **Order of work:** this spec was written **before** implementation. §6 records what was actually built and tested.

## 1. Goal

Play solo offers the three games that really work alone:
- Math Mayhem, as built in Stage 6.1;
- Pattern Pulse;
- Word Connections.

Each runs on its existing engine, server scoring and private projection, in the one solo session lifecycle from Stage 6.1. They share one small, typed solo shell instead of Math-specific code.

## 2. Acceptance criteria

- **S1. Entry.**
  - Home → Play solo → Start launches each of the three games, with no name, code, lobby or Cup step.
  - Only explicitly supported games appear.
  - **The server enforces a solo allowlist:** a forged request cannot start any other game in a solo room. Multiplayer and official restrictions are unchanged.
- **S2. A typed solo adapter per game.** Each adapter gives the play component, the instructions, the rules/scoring version, and how to read the finished summary from the server's projection.
  - There is one shared session lifecycle.
  - No engine is forked, and there is no general plugin framework.
- **S3. Pattern Pulse is unchanged in play.**
  - It keeps its six rounds (3 to 8 shapes), its server clocks and scoring, and explicit Lock it in. Reduced motion and keyboard use still work.
  - Patterns stay private and appear only while memorising. Future patterns and the seed never leak.
  - Results show its own round recap and score, with no Math copy and no multiplayer standings.
- **S4. Word Connections is unchanged in play.**
  - It keeps 16 tiles in four groups, four mistakes, its scoring, and the existing content selection.
  - Results tell solved groups from missed ones and show the server-recorded score.
  - Unsolved membership is never shown early.
  - Board repeats are reported as they are (§3.4).
- **S5. Results and personal best.**
  - Each results screen offers Play again, Back to solo and Home.
  - A personal best is saved only from a finished server result.
  - Bests are kept separately per game and rules version; Math, Pulse and Connections never compare with each other.
  - A lower or tied score keeps the existing best, and invalid or blocked storage never breaks play.
  - An interrupted, cancelled or sat-out run never creates a best.
- **S6. Lifecycle.**
  - Sequential replays, and switching Math → Pulse → Connections → Math, reuse the authenticated solo seat. No old answer, timer, selection or callback reaches the new game.
  - Two-tab replacement, late input or cancel, reload, and Back or Home behave as in Stage 6.1.
  - Bounded requests, the lost-seat restart, transient-outage recovery and "no new room for a passing failure" are all kept.
  - **If a join succeeded but its reply was lost,** Start recovers explicitly: it never gets trapped, and never claims access from a room id alone.
- **S7. Privacy and isolation.**
  - Solo rooms stay closed to code, recovery, TV, spectators and a second seat, and can't touch Cup records.
  - Casual two-player play and the Family Cup still work.
  - No other game's player minimum or official restriction is weakened.
- **S8. Layout.**
  - All three entries and results work at 320 px, at typical phone widths and on desktop.
  - Focus is visible, touch targets are usable, errors are readable, and reduced motion is respected.
  - No paid service or new dependency; Safari and Android Chrome compatibility is kept.

## 3. Design

### 3.1 The server's solo allowlist
- The registry (`src/games/registry.ts`, the server's source of truth) marks `soloPlay: true` on exactly the three games.
  - The manifest's `soloPlay` must match it (`validateManifest`).
  - The client lists only games with both a manifest `soloPlay` and a solo adapter.
- In a solo room, `startGame` refuses any other game with `StartRefused` `NOT_A_SOLO_GAME`; HTTP answers 409. This check comes before player minimums, so the reason is explicit.

### 3.2 Rules versions, next to each engine
- `MATH_RULES_VERSION` (`mathRules.ts`), `PULSE_RULES_VERSION` (`modules/pulse.ts`) and `CONNECTIONS_RULES_VERSION` (`connections.ts`) are all 1.
- A unit test ties each version to its game's rule constants:
  - for Pulse: lengths, points, and the memorise and answer windows;
  - for Connections: the mistake limit and the score formula;
  - for Math: question count and points.
- Changing a rule without bumping its version fails that test.

### 3.3 The solo shell (client)
- **`apps/web/src/solo/soloGames.tsx`:** one typed `SoloGameAdapter` per game:
  - `gameId` and `rulesVersion`;
  - `howToPlay`, the ready-screen copy, and `scoring`, the results footer;
  - `Play`, the existing game component in solo mode;
  - `summarize(game, me)`, which reads the score from the server's `rawScores` plus a headline (Math "8 of 10 correct"; Pulse "4 of 6 rounds perfect"; Connections "All four groups, 1 mistake" or "Found 2 of 4 groups");
  - `Review`: Math's answers list, Pulse's round recap, Connections' board with found groups solid and missed groups dashed.
- **`Solo.tsx`** keeps one `SoloRound`. The play component is keyed by the round's id, so Play again remounts it and no selection, entry or "last guess seen" carries over. Switching game remounts the whole round screen with a new session on the same seat.
- **Solo mode in the game screens:**
  - `MchezoPulse` and `MchezoConnections` gain `solo`, which hides "Sit the rest out" and "Waiting for the others", as `MchezoMath` already does.
  - Results use the shared solo results screen, not the multiplayer standings.
- **`SoloSession.intent`** returns whether the server took the action. The games' own "keep your entry and try again" behaviour (Pulse's send note, Connections keeping the four tiles selected) then works in solo too.
- **A join whose reply was lost:** on Try again the room is joined again with its creation token. If the server refuses because the seat is already taken (by that lost join), the room is given up and a new one is made in the same Start. The old room id is never used again without a token.
  - **Bounds (clarification 6770394918, item 4):**
    - at most **one** new room per Start that the player triggers;
    - the whole Start, fallback included, stays inside its one time budget;
    - only a definite answer gives the room up (a refusal, or 401/403/404). A timeout, 5xx or network failure keeps it, makes no new room, and the next Start asks again.
    - "Already taken" is never read as "ours": the new seat is authenticated normally.
    - The room given up stays on the server until room retention exists (the documented orphan-room limitation).
- **Which rounds set a personal best:** `countsForBest` in `soloRules.ts`, used by the shell and tested on real projections.
  - A round counts only if the server finished it (played out, or ended by its time limit, even at 0) and this player did not sit it out.
  - Solo screens offer no Sit out, but the server still accepts an abstain sent with the seat's own token. Such a round ends, shows its recorded score, and says "You sat this round out, so it doesn’t count toward a personal best." It never writes a best: not on the result, not on a replay of the request, not after a reload.

### 3.4 Word Connections content in solo (reported as it is)
- A solo room has its own content history, like any room.
  - Practice draws practice-only boards first, then boards it has used, least recently used first.
  - A fresh official board is taken only when none of those is left.
- **Starting a board counts as using it,** whether the round is finished, left mid-way, or replaced by a new Start or another tab. Leaving early therefore moves the player through the 12 boards faster.
- The shipped library has 13 boards: 12 practice-only and 1 official-eligible. A solo player therefore sees 12 different boards, and then they repeat in least-recently-used order. While repeats are available, the official-eligible board is not drawn.
- **Found while testing:** the count depends on how many boards are practice-only.
  - Measured with the real engine, if every board were approved for official play (the test content mode), a solo room would deal **the same board every time**. Practice reuses a used item before it takes a fresh official one.
  - That rule protects official content in a Cup. Solo and casual rooms never play official games, so there it only causes repeats.
  - Today's library is unaffected (12 practice-only boards).
  - A unit test pins the behaviour so a change is deliberate.
  - I have not changed it: the handoff says to reuse the existing selection. It is raised in §5.
  - **Decided (6771088990):** selection stays unchanged for this checkpoint, and the reproducing test and this limitation are kept.
    - Queued as a bounded follow-up for the smoother-session/content-variety work, before library eligibility changes make it visible: solo and casual rooms prefer unused practice-usable content, then least recently used.
    - Cup selection, eligibility validation and Cup usage stay as they are.
    - This is recorded in `docs/MILESTONES.md`, not implemented.
  - Protected official content is never consumed to add variety (6770394918, item 1).
- **Personal best:** "best score on any board under these scoring rules". Boards differ in difficulty, so a best can come from an easier board.
  - Next to the Connections best, on the shelf, the start screen and the results, a short note says: "Best score across boards. Some boards are harder than others." (6770394918, item 2). The "on this device" label stays.
  - Connections has no difficulty or rule modes to choose from. If it gets them, each needs its own best key.

### 3.5 Time limits
Unchanged:
- Pattern Pulse: game 5 min; each round a memorise window, then an answer window.
- Word Connections: game 8 min.
- A deadline that passes finishes the game with what was done; that is a finished server result.

### 3.6 Where each clarification is applied
- **6770394918:**
  1. Repeats: §3.4, plus the unit test of 12 boards then a repeat.
  2. Personal-best note: §3.4, `bestNote` in `soloRules.ts`, and check-solo-shelf L.
  3. Abstain: §3.3, `countsForBest`, unit tests (Connections and Pulse, partial progress, a replay, the round read again), and check-solo-shelf L (results, the replayed request, a reload).
  4. Lost-join fallback: §3.3; unit tests against the real server for:
     - an accepted join whose reply was dropped;
     - 5xx and a timeout on the retried join;
     - the fallback's own join refused or lost;
     - the fallback's room creation failing;
     - the time budget.
  5. Projection checks: unit tests at each phase boundary.
     - **Connections:** before any guess; after one solved group and a near miss (the solved group is shown, the others are not); at the end (the full solution).
     - **Pulse:** after each round, its recap; never the seed or a later pattern.
- **6771088990:** §3.4 and §5, item 4.

## 4. Test plan
- **Unit tests:**
  - **Allowlist:** forged starts of every non-solo game in a solo room are refused (`NOT_A_SOLO_GAME`, HTTP 409). Each solo game starts. Official play is still refused in solo, and other rooms are unchanged.
  - **Privacy in a solo room:** no Pulse pattern outside its memorise window, no future round's pattern, no seed, and no Connections groups before the end.
  - **Engine scores through the solo room:** Pulse all perfect gives 960; Connections perfect gives 450, and a 4-mistake fail gives 0.
  - **Rules-version fingerprint tests.**
  - **Adapter summaries** from real projections.
  - **Personal bests** isolated per game.
  - **Session:**
    - `intent` returns true or false;
    - a join reply that was lost, then Try again, yields a new room, with no access to the old one;
    - Math → Pulse → Connections → Math reuses one room.
  - **Connections boards:** 12 distinct boards, then a repeat.
- **Browser (`check-solo-shelf`, new):**
  - **Pulse:** a perfect game (960) and a game with mistakes.
  - **Connections:** solved with the oracle, a game ending on 4 mistakes, and a partial game.
  - **Timeouts** on its own server with a short test clock: a Pulse round left to time out, and a Connections game ending at its deadline.
  - At least three replays and the cross-game switch, on one room.
  - **Personal bests:** per-game isolation, another rules version ignored, blocked storage.
  - **Lifecycle:** Leave mid-game, reload, a two-tab replacement, Back and Home.
  - A Connections guess that gets no reply (fault): bounded, with the selection kept.
  - Layout at 320, 390 and 1440 px; keyboard use for a Pulse round and a Connections guess.
- **Regression:** `check-solo` (Math, including its fault section), `check-casual`, `check-pattern-pulse`, `check-connections` and the Cup drivers, all in the full gate.
- **Gates:** fast gates while developing; at the checkpoint, the fast gate and **one** parallel full gate on a clean final SHA.
- **Reporting:** browser checks run in Chromium (headless shell) only. WebKit and real devices are reported as not run.

## 5. Concerns raised with ChatGPT
1. **Connections boards repeat after 12 solo rounds,** least recently used first (§3.4). Making them unlimited or seasonal is the later content milestone. *Accepted for this slice (6770394918, item 1).*
2. **A sat-out run** (a forged `abstain`, since the solo screens don't offer it) finishes the game on the server, but it never records a personal best. *Accepted; tested (§3.3, §3.6).*
3. **Connections personal bests compare across boards** of different difficulty under the same scoring (§3.4). *Accepted, with the player-facing note (§3.4).*
4. **Content selection in solo and casual rooms** (found while testing, §3.4):
   - **Problem:** once most boards are approved for official play, a solo room would repeat one board, and casual rooms would repeat practice items of every content game.
   - **Proposal, not implemented:** a room that can never play official games draws from all practice-usable items, unused ones first, least recently used after that. Cups keep today's rule.
   - **Why it waits:** it changes shared server selection, so it needs a decision.
   - **Decided (6771088990):** kept unchanged for Stage 6.2; queued for the smoother-session/content-variety work (§3.4).

## 6. What was built and tested

### 6.1 Built
- **Server:**
  - **Solo allowlist:** registry `soloPlay` on the three games, with `SOLO_GAME_IDS` derived from it. A solo room refuses any other game with `NOT_A_SOLO_GAME`, HTTP 409, before player minimums are checked (`src/games/registry.ts`, `src/server/room.ts`).
  - **Manifest check:** `validateManifest` requires the manifest's `soloPlay` to match the registry, and a solo game to have a 1-player minimum.
  - **Rules versions:** `PULSE_RULES_VERSION` and `CONNECTIONS_RULES_VERSION`, next to their engines.
- **Client:**
  - **The adapter split:** `apps/web/src/solo/soloRules.ts` holds the rules (version, copy, summary from the projection) as plain TypeScript the server-side tests can import. `apps/web/src/solo/soloGames.tsx` adds each game's play screen and review.
  - **`Solo.tsx`** is generic, and the play screen is keyed by the round.
  - **Solo mode** in `MchezoPulse` and `MchezoConnections`; `PulseRecap` and `ConnectionsSolution` are shared with the multiplayer results.
  - **`SoloSession`:**
    - `intent` returns whether the server took the action;
    - a refused re-join gives the room up and makes a new one in the same Start;
    - a personal best is filed only for a round the server finished and the player did not sit out.
- **Copy:** the Connections manifest no longer says it is the only 1-player game.

### 6.2 Tested
- **`tests/stage62-solo-shelf.test.ts`, 19 tests:**
  - **Allowlist:** every non-solo game refused in a solo room; each solo game starts; official play is still refused; casual rooms and player minimums are unchanged; a forged HTTP start gets 409.
  - **Pulse privacy:** a pattern only while it is memorised, no future pattern, no seed. **Connections privacy:** no group name before the end.
  - **Scores through the solo room:** Pulse 960; Connections 450, and 0 after four mistakes.
  - **Boards:** with the shipped library, 12 then a repeat; with all boards approved, one board (the §5 concern).
  - **Rules fingerprints** for all three games.
  - **Summaries** read from real projections.
  - **Cross-game seat:** Math → Pulse → Connections → Math on one room.
  - **A lost join reply:** recovered with a new room, never the old id.
- **Mutation:** with the allowlist check removed, both allowlist tests fail.
- **`scripts/check-solo-shelf.mjs`, 45 checks:**
  - the three-game shelf;
  - Pulse perfect (960), with round 1 by keyboard;
  - Pulse with a slip every round (0; the best stays);
  - Connections solved (450), the first group by keyboard;
  - Connections out of guesses (0), on a different board, with nothing carried over and all groups missed;
  - Connections partial (200; 2 found, 2 missed);
  - Math after the others, with one room for everything and each round on the server;
  - one personal best per game; another rules version ignored; blocked storage;
  - Leave mid-Pulse; reload mid-Connections; a second tab's Pulse replacing Connections; Home with no Rejoin;
  - a Connections guess with no reply (fault) that keeps its selection, and then works;
  - timeouts on a short-clock server: a Pulse round running out, Pulse and Connections ending at their deadlines.
- **Updated for the three-game shelf:** `check-solo` (now 80 checks) and the Stage 6.1 tests.
- **Screenshots:** `docs/stage6/screenshots-62/` holds 7 screens at 320, 390 and 1440 px, taken on `e218acb` with a clean tree.
