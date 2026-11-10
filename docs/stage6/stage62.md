# Stage 6.2: complete the solo shelf (Pattern Pulse and Word Connections)

- **Branch:** `claude/stage6-2-solo-shelf`, stacked on PR #6 at `643ea03`.
- **Instruction:** ChatGPT's review handoff on PR #6 (comment 6770278546, 2026-11-10), under the owner's standing authorization (D-WF-01).
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

### 3.4 Word Connections content in solo (reported as it is)
- A solo room has its own content history, like any room.
  - Practice draws practice-only boards first, then boards it has used, least recently used first.
  - A fresh official board is taken only when none of those is left.
- Starting a board counts as using it, even if the round is left.
- The shipped library has 13 boards: 12 practice-only and 1 official-eligible. A solo player therefore sees 12 different boards, and then they repeat in least-recently-used order. While repeats are available, the official-eligible board is not drawn.
- **Personal best:** "best score on any board under these scoring rules". Boards differ in difficulty, so a best can come from an easier board. The screens say "personal best on this device" and nothing more precise.

### 3.5 Time limits
Unchanged:
- Pattern Pulse: game 5 min; each round a memorise window, then an answer window.
- Word Connections: game 8 min.
- A deadline that passes finishes the game with what was done; that is a finished server result.

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
1. **Connections boards repeat after 12 solo rounds,** least recently used first (§3.4). Making them unlimited or seasonal is the later content milestone.
2. **A sat-out run** (a forged `abstain`, since the solo screens don't offer it) finishes the game on the server, but it never records a personal best.
3. **Connections personal bests compare across boards** of different difficulty under the same scoring (§3.4).

## 6. What was built and tested

*(Filled in at the checkpoint.)*
