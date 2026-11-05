# Deadline vs Duration (Milestone J.4 — investigation only)

**Status: investigation. No timing rule is changed by this document.**
A deadline change would change gameplay rules, so it needs an owner
decision checkpoint — it is not autonomous work. This document records
the current behavior, the tension, the options, and a recommendation.

## 0. Summary

Every game gets exactly one deadline: **5 minutes from its start**
(`deadlineAt = startedAt + 5 min`). The deadline is a **hard submission
cutoff**, not a game timer: after it passes, no answer, guess, vote,
clue, or abstention is accepted, and nothing auto-finishes the game.
The only exit for an unfinished game is a host/cohost skip, and a
skipped game never counts toward Family Cup standings.

The design durations in the Game Manifest say the games *take* 8–15
minutes (only Math Mayhem, at 5, fits the deadline). The tension is
real but its severity is **unproven**: the design durations are
unmeasured estimates (`measured: false` on every manifest), and no
human play time has ever been recorded. The drivers finish every game
well inside 5 minutes — because they answer instantly. Whether a
family playing at a natural pace routinely overruns the deadline is
unknown, and it is measurable from data the server already records.

## 1. Current server behavior (grounded)

All references are to `src/server/room.ts` unless noted.

- **Assignment.** `startGame` sets `deadlineAt: Date.now() + 5 * 60 * 1000`
  (line 295) and `startedAt: Date.now()` (line 294), for every game,
  official or practice. One constant, no per-game value, no config.
- **Enforcement — submissions.** After the deadline, every gameplay
  intent is rejected with `PHASE_CLOSED`:
  - `submitSocialIntent` (line 388): all non-math gameplay intents
    (answers, guesses, votes, clues, captions, connections, sprint).
  - `submitAbstain` (line 586): abstentions, too — a player cannot sit
    out after the deadline either.
  - `submitMathAnswer` (lines 855–860): the same check, with a legacy
    fallback (`elapsedMs > 5 min` from `startedAt`) only for games that
    predate `deadlineAt`. The comment is explicit: "One deadline
    governs every game."
- **Enforcement — skip.** `skipTimedOutGame` (lines 833–841) is the
  only exit: host/cohost only, only while the game is `playing`, and
  only *after* the deadline (`now < deadlineAt` throws "Game has not
  timed out yet"). The game is marked `finished` + `timedOut: true`,
  players keep their current (zero or partial) raw scores, and the
  game is excluded from Cup standings (see §1.1).
- **No auto-finish.** There is no `setTimeout`/`setInterval` anywhere
  in `src/server/`. Nothing finishes a game when the deadline passes.
  A game that has not finished by its deadline stays `playing` until
  a host/cohost skips it.
- **A stuck game blocks the room.** `startGame` rejects while a game
  is playing, and `advanceDay` refuses while a game is playing — so an
  unskipped past-deadline game blocks both the next game and the day
  advance. The host skip is the only unblock, which is why the waiting
  views surface it (see §3).
- **Projection.** `deadlineAt` is sent to clients in the public
  projection (line 932), so every client can compute the countdown.

### 1.1 What a skipped game costs

`timedOut` games are excluded everywhere it matters
(`room.ts:117` — "host-skipped after deadline; never counts toward
official standings"; `officialStandings` line 719; overrides line 755;
championship results lines 775, 807). The exclusion is whole-game:
the partial raw scores players earned before the cutoff stay in the
game record, but the game contributes nothing to the Cup. The Cup does
not punish a skipped game (no negative points, no eligibility loss);
it simply has fewer scoring games that day. The cost is
**undercounting, not punishment** — a day with two skipped games feeds
the daily placement from fewer games.

## 2. The design durations

From `src/games/manifest.ts` (every entry `source: "design-default",
measured: false` — see `docs/GAME_MANIFEST.md`, decision L43: durations
are design defaults, never presented as measured). Question counts are
from the game modules.

| Game | Design | Questions | Budget at 5 min |
|---|---|---|---|
| Impostor | 10 min | clue + vote + guess phases | — (phases, not questions) |
| Caption Clash | 10 min | 3 rounds (caption + vote) | ~100 s/round |
| Trivia Showdown | 10 min | 10 | 30 s/question |
| Word Connections | 8 min | 1 grid (4 groups) | — (one puzzle) |
| Who Said That | 10 min | choice questions | — |
| Guess the Year | 8 min | numeric guesses | — |
| Closest Wins | 8 min | 8 | ~37 s/question |
| Category Sprint | 10 min | 3 rounds | ~100 s/round |
| Charades | 15 min | one full rotation (L15) | 75 s/turn (4 players), 30 s/turn (10 players) |
| Geography | 12 min | choice questions | — |
| Math Mayhem | 5 min | 10 | 30 s/question |

Only Math Mayhem's design duration fits the deadline. Every other game
is designed to take longer than the server allows submissions for.
Charades is the extreme: a full rotation at 10 players cannot fit in
5 minutes at any plausible acting pace.

## 3. What players see

- **Trivia** is the only game with a live countdown: `MchezoTriviaPlay`
  computes `secondsLeft` from `publicGame.deadlineAt`
  (`MchezoTrivia.tsx:76`) and passes it to the question screen, whose
  ring shows real game time (Phase 2 deviation #2 — the ring is the
  300-second deadline, not a per-question timer).
- **Waiting views** (old `ShowWaiting`, kit `MchezoWaiting`, and now
  `MchezoClosest`) compute `stalled = deadlineAt passed` and, when
  stalled, show the host/cohost a "Skip timed-out game (no scores
  invented)" button and show other players "The host can skip this
  game if it stays stalled."
- **Other games show no countdown.** The old GamePanel shows only
  "Status: playing"; the kit Closest panel shows no timer. A player
  in a non-Trivia game learns the deadline only when their submissions
  start being rejected — or when the waiting view appears.

## 4. The actual tension

Two facts pull in opposite directions, and neither settles the question:

- **The deadline is satisfiable.** The F5 driver plays a full 11-game
  day, and every game finishes inside 5 minutes — because the driver
  answers instantly, with no reading, thinking, or discussion time.
  The 5-minute bound is not impossible; it is a *pace* bound.
- **The design durations imply a slower pace.** A 10-question Trivia
  at 30 seconds per question leaves no room for reading the question,
  let alone talking about it. A family playing Charades or Impostor
  socially will not fit 10–15 minutes of designed play into 5.

What is missing is measurement. The design durations are guesses
(`measured: false` on all 11 manifests), and no human session has
ever been timed. The severity of the tension — how often real games
actually overrun, and which games — is unknown. It is also
**measurable without new instrumentation**: every ledger event carries
`createdAt` (`room.ts:169–171`), and every game records `startedAt`,
so a finished game's actual duration is `game-finished.createdAt −
startedAt`, readable from the room snapshot after any real session.

## 5. Tournament inheritance

Tournament rounds are room games, so each round inherits the same
5-minute deadline (this is contradiction #4 from the Milestone I
format/lifecycle review: the 5-minute deadline vs design durations
up to 15 minutes, inherited by tournament rounds). A 6-round
tournament at the deadline is 30 minutes minimum if every round runs
long; at design durations it would be hours. Any deadline decision
therefore gates tournament scheduling too — but no tournament is
executable yet, so this is a design note, not an urgent fix.

## 6. Options

Every option changes a gameplay rule and therefore needs an owner
decision checkpoint. None is autonomous.

### A. Keep the universal 5-minute deadline (status quo)

- *Change:* none.
- *For:* one rule, simple to explain and test; the Cup exclusion for
  skipped games is coherent (a game that could not finish in 5 minutes
  does not count); all drivers and tests pass against it.
- *Against:* at human pace, most games are designed to overrun it, so
  host skips (and Cup undercounting) may become routine rather than
  exceptional.
- *Needs:* nothing — but the measurement in §7 should still happen, so
  the status quo is a choice rather than a default.

### B. Per-game deadlines from design durations

- *Change:* `deadlineAt = startedAt + manifest.duration.minutes`, per
  game (Trivia 10, Charades 15, Math 5, …).
- *For:* matches the documented design; fewer skips; more games count
  toward the Cup.
- *Against:* the design durations are unmeasured estimates — this
  bakes guesses into a rule (and collides with L43's honesty rule: a
  deadline derived from an estimate is a rule built on an estimate).
  Longer deadlines also mean a stalled game blocks the room longer
  before the host can skip it. The manifest durations would become
  load-bearing instead of display-only.
- *Needs:* owner approval; a deadline source in the manifest or
  registry; updated enforcement tests; updated driver expectations
  (the trivia ring's 300 s assumption changes).

### C. Per-question / per-phase deadlines

- *Change:* e.g. Trivia 30 s per question, Closest 60 s per question,
  Charades per turn — new server logic per game, new UI per game.
- *For:* the finest fit to how each game is actually played.
- *Against:* the most new machinery (per-game timers, per-game UI,
  per-game tests) for a problem whose size is unmeasured. The
  per-question times would also be guesses. Not recommended before
  measurement, if ever.
- *Needs:* owner approval + a design per game; a large implementation
  slice per game.

### D. Deadline as soft guidance (no submission cutoff)

- *Change:* remove the late-rejection checks; games finish naturally
  whenever all players are done; host skip available without waiting
  for a deadline.
- *For:* games always finish; no Cup exclusions from timeouts.
- *Against:* removes the stall bound entirely — a connected player who
  walks away blocks the game indefinitely unless the host notices and
  skips, and the host becomes the timer. The late-rejection semantics
  (`PHASE_CLOSED` after the deadline) are load-bearing, tested
  behavior from the deadline/timeout work; removing them is a
  regression in the anti-stall design, not a simplification.
- *Needs:* owner approval; rework of the skip/waiting UI (the "stalled"
  concept disappears) and of the deadline tests.
- *Not recommended.*

### E. Extend the universal deadline (e.g. 10 minutes for all)

- *Change:* one constant (`5 * 60 * 1000` → `10 * 60 * 1000`).
- *For:* the smallest change; halves the tension for most games
  (only Charades at 15 and Geography at 12 still exceed it).
- *Against:* still arbitrary — 10 is a guess, not a measurement; the
  two longest games still overrun; stalls last twice as long before
  the host can skip.
- *Needs:* owner approval; updated tests/drivers (the trivia ring,
  the "stalled" timing, the F-run expectations).

## 7. Recommendation

**Measure first; decide second. No code change in J.4.**

1. At the next real family session, play normally and read the actual
   durations out of the room ledger afterwards (`game-finished`
   `createdAt` − `startedAt` per game). That single session answers
   the question the design durations cannot: which games overrun 5
   minutes, and by how much.
2. Then decide at a checkpoint between **B** (per-game deadlines from
   *measured* durations — not the design estimates) and **E** (a
   universal extension, e.g. 10 minutes, as a compromise). The
   measurement is what makes either choice defensible.
3. Do not pursue **C** (too much machinery for an unmeasured problem)
   or **D** (removes the stall bound).

## 8. What each option would touch (for the future implementer)

- **A:** nothing.
- **B:** `room.ts` startGame (deadline source), manifest/registry
  (deadline as a first-class field, distinct from the display
  duration), `submitSocialIntent`/`submitAbstain`/`submitMathAnswer`
  (unchanged logic, new values), trivia ring + waiting views (new
  countdowns), drivers (F5, e2e, check-mchezo timing assumptions),
  `docs/GAME_MANIFEST.md` (L43 — the duration field's meaning changes).
- **C:** per-game engine state (phase/question timers), new server
  methods, per-game UI, per-game tests — one slice per game.
- **D:** remove the three `PHASE_CLOSED` deadline checks, rework
  `skipTimedOutGame` (no deadline gate), rework waiting views
  (no "stalled" state), rewrite the deadline tests.
- **E:** one constant in `room.ts:295`, plus the test/driver timing
  assumptions that encode 300 seconds.

## 9. Questions for the owner (decision checkpoint)

1. Is 5 minutes the right bound, or is the family routinely hitting
   it? (Answer with the measurement from §7, not with the design
   durations.)
2. If a game is skipped, should it stay fully excluded from the Cup,
   or should partial scores count? (Today: fully excluded.)
3. Should the deadline be per-game (matching how long each game takes)
   or universal (one rule for the whole room)?
4. Should non-Trivia games show a countdown, so players can see the
   deadline coming instead of discovering it through rejected
   submissions?
