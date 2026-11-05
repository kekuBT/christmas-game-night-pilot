# Game Duration and Deadline Review (Milestone J.4 — Work Package A)

**Status: investigation. No timing rule is changed by this document.**
This is the per-game companion to `docs/DEADLINE_VS_DURATION.md`
(the J.4 deadline-vs-duration investigation, committed `8f2e696`).
That document established the deadline mechanics and the options; this
one answers the ten questions for all eleven games, game by game.

## 0. The distinction that matters

There are two different times, and the codebase conflates them in one
number each:

- **Submission deadline** — the server rule. One value, five minutes,
  set when a game starts (`room.ts:295`: `deadlineAt = startedAt +
  5 * 60 * 1000`). After it, no answer, guess, vote, clue, or
  abstention is accepted anywhere (`PHASE_CLOSED`). It is a maximum,
  not a duration: a game can finish well before it.
- **Expected total gameplay duration** — the design estimate in the
  Game Manifest (`src/games/manifest.ts`, `duration.minutes`,
  `source: "design-default", measured: false` on all eleven games).
  It describes the intended experience — reading, thinking, discussing,
  performing — not a measured time. No human session has ever been
  timed, so every estimate is an unmeasured design default.

The deadline governs submissions. The estimate describes the
experience. They disagree by 3–10 minutes on ten of eleven games, and
the server enforces the shorter one.

## 1. The ten questions, answered from code

### 1. What actually starts the server deadline?
`startGame` (`room.ts:280–295`). When the host/cohost starts a game,
the engine creates the `GameInstance` with `startedAt: Date.now()`
and `deadlineAt: Date.now() + 5 * 60 * 1000`. One deadline per game
instance, the same five minutes for every game, official or practice.
Nothing else starts or resets it — not a phase change, not a round
advance, not a reconnection.

### 2. Does the deadline apply to the complete game or an individual phase?
The complete game. There is exactly one `deadlineAt` per game
instance and no per-phase or per-question timer anywhere in the server
(no `setTimeout`/`setInterval` in `src/server/`). A phase or round
advance does not extend it: a three-round Caption Clash and a
three-phase Impostor game each get five minutes total, not five
minutes per round or phase. The 8-second intro and the post-finish
reveal are client-side (`ShowIntro`, the Trivia reveal walk) and sit
outside the deadline entirely.

### 3. Can a game conclude earlier?
Yes — every game can, and normally does. Each game finishes when all
*active* players are done (see §1.6 for the definition of active),
via `finishGame` (`room.ts:680–710` and the per-handler calls). The
deadline is a ceiling, not a schedule: a fast Trivia game finishes in
two minutes, a slow one is cut off at five. No game waits for the
deadline if its players are done.

### 4. How does host skip interact with the deadline?
Skip is the only exit for an unfinished game, and it is gated *by* the
deadline: `skipTimedOutGame` (`room.ts:833–841`) requires host/cohost,
requires the game to be `playing`, and throws "Game has not timed out
yet" while `now < deadlineAt`. So the host cannot skip a slow game
early — they must wait out the five minutes — and after the deadline
the host *must* skip for the room to proceed (a stuck game blocks both
the next game and `advanceDay`). The skip marks the game `finished` +
`timedOut: true`; players keep their partial raw scores, but the game
is excluded from Family Cup standings everywhere (see the J.4 doc §1.1).

### 5. How do abstentions affect completion?
An abstained player counts as done and never blocks completion. The
scope differs by game (decision L33, pinned by the manifest):
- **Whole-game:** Trivia, Who Said That, Geography, Guess the Year,
  Word Connections, Category Sprint, Math Mayhem — abstaining sits the
  player out for the rest of the game (0 for what they skipped).
- **Per-question:** Closest Wins — abstaining sits the player out for
  the current question only; they play the next one.
- **Per-phase:** Impostor (clue / vote / guess phases) and Caption
  Clash (submit / vote per round).
- **None:** Charades — there is no abstention; turns are actor-driven
  and Pass already exists.
Abstentions are also deadline-gated: `submitAbstain` rejects after the
deadline (`room.ts:586`), so a player cannot sit out once submissions
have closed. And a player who already guessed cannot then abstain
(Closest: `abstainClosest` throws `ALREADY_GUESSED`).

### 6. What happens if a player disconnects?
A disconnected player does not block completion. Completion is
computed over `activePlayers(game)` (`room.ts:338–341`): the players
whose `connected` flag is true — **falling back to all players if
none are connected**. So a game finishes when every *connected*
player is done; a disconnected player's unanswered parts score 0 and
their partial scores stand. The fallback matters: if *everyone*
disconnects, no one is active and the game cannot finish until
someone reconnects (or the host skips after the deadline). A
disconnected player also does not block the deadline: their intents
are rejected after it just like anyone else's, and the host can skip.

### 7. Can a disconnected participant submit after reconnecting, before the deadline?
Yes. Reconnect is token-verified (`reconnect`, `room.ts:203–211`:
unknown slot or wrong token throws; the HTTP handler turns it into a
400) and sets `connected = true`, which makes the player active again.
Their prior answers are preserved in the game state, so they can
submit for the questions they have not answered — as long as the game
is still `playing` and the deadline has not passed. Re-submitting a
question they already answered returns `ALREADY_ANSWERED`; submitting
after the deadline returns `PHASE_CLOSED`. Reconnection changes
nothing about the deadline itself.

### 8. Are there game-specific differences?
Yes, in completion conditions and in how the deadline bites — see the
table in §2. The deadline rule itself is identical for all eleven
games; what differs is what "done" means (all questions answered, a
rotation finished, a grid solved, phases resolved) and how much play
the five minutes has to contain.

### 9. What happens when the deadline expires?
Three things, in order: (a) every gameplay intent and every
abstention is rejected with `PHASE_CLOSED` (social intents
`room.ts:388`, abstentions `room.ts:586`, math answers `room.ts:860`
— the math check also has a legacy `startedAt + 5 min` fallback for
games created before `deadlineAt` existed); (b) the game stays
`playing` — nothing auto-finishes it; (c) the only exit is the
host/cohost skip, which marks it `timedOut` and excludes it from the
Cup. A game that expires with unanswered players is therefore a
skipped game, not a finished one, and the room cannot advance until
the host acts.

### 10. Are the existing duration estimates realistic, aspirational, or simply unmeasured design defaults?
Unmeasured design defaults — by their own declaration
(`measured: false` on every manifest). They are best read as
*aspirational*: they describe the experience the designer intended
(Trivia with time to read and talk, Charades with time to act), not a
time anyone has measured. Against the five-minute deadline they are
not realistic for ten games: the server will cut those games off
before the designed experience completes. The one exception is Math
Mayhem, whose 5-minute design fits the deadline exactly. The estimates
are not wrong as *intentions*, but they are wrong as *predictions* of
how long a game will take under the current rules — and they must not
be treated as guaranteed completion times (see §3).

## 2. Per-game table

Deadline behavior is the same rule for every game (one 5-minute
whole-game submission cutoff; host skip only after it; skipped games
excluded from the Cup). The table records what differs: the designed
experience, the content, the completion condition, and the
contradiction.

| Game | Server deadline behavior | Est. experience duration (manifest) | Rounds / questions | Completion conditions | Known contradiction | Recommended future solution | Scoring / rule change required? |
|---|---|---|---|---|---|---|---|
| Impostor | 5-min whole-game cutoff; phases share it | 10 min (unmeasured) | 3 phases: clue → vote → guess | All active players clue, then vote, then the impostor's guess resolves it (`room.ts:414–423`); abstention is per-phase | A social-deduction game whose play *is* discussion, in 5 minutes total | Per-game deadline (10 min), or phase-aware timers | Yes — deadline |
| Caption Clash | 5-min whole-game cutoff; rounds share it | 10 min (unmeasured) | 3 rounds (caption + vote each) | All active players submit + vote per round (abstentions count) → advance; after round 3, finished (`room.ts:502–503`, `advanceCaptionRound`) | Writing + voting × 3 in 5 minutes | Per-game deadline (10 min) | Yes — deadline |
| Trivia Showdown | 5-min whole-game cutoff; countdown ring shown (the only game with one) | 10 min (unmeasured) | 10 questions | All active players answered all 10, or abstained whole-game (`quizAllDone`, `room.ts:546–552`) | 30 s/question at the deadline vs 60 s/question by design | Per-game deadline (10 min), or a per-question timer | Yes — deadline |
| Word Connections | 5-min whole-game cutoff | 8 min (unmeasured) | 1 grid (4 groups) | Every active player solved all 4 groups, or made 4 mistakes, or abstained (`room.ts:486–492`) | A puzzle that can take minutes of thinking, for the whole room, in 5 minutes | Per-game deadline (8 min) | Yes — deadline |
| Who Said That | 5-min whole-game cutoff | 10 min (unmeasured) | 8 questions | All active players answered all 8, or abstained whole-game (`quizAllDone`) | 37.5 s/question at the deadline vs 75 s/question by design | Per-game deadline (10 min) | Yes — deadline |
| Guess the Year | 5-min whole-game cutoff; no countdown shown (old panel) | 8 min (unmeasured) | 8 events | All active players guessed all 8, or abstained whole-game (`yearAllDone`, `room.ts:571–575`) | 37.5 s/event at the deadline vs 60 s/event by design | Per-game deadline (8 min); the modernized UI (Package D) should surface the countdown, as Trivia does | Yes — deadline |
| Closest Wins | 5-min whole-game cutoff; no countdown shown (kit panel) | 8 min (unmeasured) | 8 questions | All active players guessed/abstained the current question → advance; after Q8, finished (`room.ts:442–444`) | 37.5 s/question vs 60 s by design; the deadline can cut the sequence mid-way, so the game is skipped and excluded from the Cup | Per-game deadline (8 min); surface the countdown in the kit panel | Yes — deadline |
| Category Sprint | 5-min whole-game cutoff | 10 min (unmeasured) | 3 rounds | All active players submitted the round, or abstained → advance (`room.ts:502–503`); after round 3, finished | ~100 s/round at the deadline vs ~200 s/round by design | Per-game deadline (10 min) | Yes — deadline |
| Charades | 5-min whole-game cutoff; no per-turn timer | 15 min (unmeasured) | One full rotation (decision L15) | The rotation finishes (every player acted) → phase finished (`room.ts:510`) | The worst case: 15 min designed vs 5 min allowed; a 10-player rotation gets 30 s/turn at the deadline | Per-game deadline (15 min), or a per-turn timer | Yes — deadline |
| Geography | 5-min whole-game cutoff | 12 min (unmeasured) | 8 questions | All active players answered all 8, or abstained whole-game (`quizAllDone`) | 37.5 s/question at the deadline vs 90 s/question by design | Per-game deadline (12 min) | Yes — deadline |
| Math Mayhem | 5-min whole-game cutoff; speed scoring uses elapsed time | 5 min (unmeasured) | 10 questions | All active players answered all 10, or abstained whole-game (`room.ts:686–692`) | **None on duration** — the only game whose design fits the deadline. Note: points depend on `elapsedMs`, so a correct answer at 4:59 scores less than at 0:10; the deadline is a hard cutoff, not a scoring input | None needed | No |

## 3. What the tournament scheduler must not do

The future tournament scheduler must not treat an unmeasured design
estimate as a guaranteed completion time — for two reasons:

1. **The estimates exceed the enforced bound.** Ten of eleven design
   durations (8–15 min) are longer than the five minutes the server
   actually allows. A schedule built on the design durations promises
   more time per round than the room will give; rounds would be cut
   off and skipped, and skipped rounds do not score.
2. **The only guaranteed bound is the deadline.** A round's
   submissions end by the deadline (five minutes) or earlier (all
   active players done). So the per-round maximum a scheduler can rely
   on today is five minutes of play plus the host skip — not the
   design duration. Conservative time budgets should use the deadline
   as the worst case and treat the design duration as the *intended*
   case, never the guaranteed one.

Until the deadline is decided (see the J.4 doc §7: measure real
sessions first, then choose between per-game measured deadlines and a
universal extension), any tournament schedule should budget five
minutes per round and expect some rounds to be skipped at human pace.

## 4. Factual corrections noted (not implemented)

- The manifest durations are correctly labelled design defaults
  (`measured: false`); no metadata correction is needed — the label
  is honest. What is missing is *measured* data, not a better label.
- Two games show no countdown to the player (Guess the Year, Closest
  Wins) while Trivia does. That is a UI inconsistency, not a metadata
  error; the modernized panels should surface the remaining time
  (Package D for Year; a follow-up for Closest).
- No validation correction is needed: the manifest schema already
  requires `source: "design-default"` and `measured: false`, so no
  duration can be mistaken for a measurement.

## 5. Recommendation (unchanged from the J.4 doc)

Measure first (the next real session's ledger gives actual durations:
`game-finished.createdAt − startedAt` per game), then decide between
per-game deadlines from *measured* durations and a universal extension.
Do not build per-question or per-phase timers before measuring, and do
not remove the cutoff (it is the stall bound). The four owner
questions from the J.4 doc (§9) still stand.
