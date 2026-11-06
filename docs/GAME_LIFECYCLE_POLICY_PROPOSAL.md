# Game Lifecycle Policy Proposal (for Sprint 3)

**Status: proposal, not implemented.** Nothing in this document changes deadlines, completion, scoring or Family Cup rules. Every rule below needs an owner decision (listed in §5). Facts come from the engine source at Sprint 2, not from the registry's duration estimates (`defaultDurationMinutes` is a design guess, never measured).

## 1. What the code does today (all games)

- **One deadline:** `deadlineAt = startedAt + 5 min` for every game (`room.ts` `startGame`). After it, every action is rejected (`PHASE_CLOSED`).
- **Nothing finishes at the deadline.** The game stays `playing` until the host or a cohost presses "Skip", which marks it `timedOut`. Timed-out games are **excluded from official standings and the Family Cup**, so complete answers are discarded with it.
- **Completion** waits for every *connected* roster player (`activePlayers`). A player whose socket is closed stops blocking, but a disconnect does not re-check completion; the next action does. A connected player who simply stops answering blocks until the host skips.
- **Exploit:** a player who is losing can stop answering (or disconnect and reconnect) until the deadline, then the host's only way out is a skip, which removes the game from the Cup. Every player's result is thrown away because one person stalled.
- **Rosters** are fixed at start. Sprint 2 makes the host choose explicitly before leaving out a reconnecting player; nobody joins later.

## 2. Game-by-game facts

| Game | Structure (engine) | Play | Needs host mid-game | What blocks completion | Partial progress scorable? | Disconnect today | Refusal today | Official-Cup fit |
|---|---|---|---|---|---|---|---|---|
| Trivia | 10 questions, any order | simultaneous, independent | no | each connected player answering all 10 (or abstaining) | **yes**: 120 per correct, independent of others | stops blocking; answers kept | blocks until deadline, then skip voids everyone | good |
| Who Said That | 8 questions, any order (legacy UI) | simultaneous, independent | no | same as Trivia | **yes**: 100 per correct | same | same | good once its UI is modernised |
| Geography | 8 questions, any order | simultaneous, independent | no | same | **yes**: 100/0 | same | same | good |
| Guess the Year | 8 events, any order | simultaneous, independent | no | same | **yes**: 100 − 10·\|error\| | same | same | good |
| Math Mayhem | 10 questions, any order, scored live | simultaneous, independent | no | same | **yes**, already scored live; speed bonus measured from game start (only the first ~2 answers can earn it, D5) | same | same | good after D5 |
| Closest Wins | 8 questions in **lock-step** | simultaneous per question | no | every connected player guessing the *current* question | **yes, per completed question**; ranks within a question depend on who guessed | one straggler blocks everyone on that question | blocks the whole room per question | good with per-question timers |
| Caption Clash | 3 rounds × (write → vote), lock-step phases | simultaneous per phase | no | every connected player submitting / voting in the phase | **per completed round** (25 per caption + 100 per vote received); a half-done round is not | blocks the phase | blocks the room | fair only with phase timers; subjective voting |
| Impostor | 1 round: clues → vote → impostor's guess | simultaneous per phase, then one player | no | all clues, then all votes, then (if caught) the impostor's guess | **no**: the outcome is binary and only exists at the end | blocks the phase; the impostor leaving mid-game decides nothing | blocks; an impostor who refuses the guess blocks until skip (abstaining = honest win) | questionable as official: social game, small samples |
| Word Connections | 1 board per player, 4 groups, 4 mistakes | independent puzzles | no | each connected player solved 4 groups or used 4 mistakes | **yes**: 100 per group (+bonus) | stops blocking | blocks until deadline | good |
| Category Sprint | 3 rounds, lock-step, answers scored by uniqueness | simultaneous per round | no | every connected player submitting the round | **per completed round**, but scores depend on everyone's submissions | blocks the round | blocks the room | fair with round timers (a sprint should be timed) |
| Charades | each player acts once, sequential turns, actor self-reports "correct" | one actor at a time | effectively yes (someone must judge) | the current actor pressing correct (pass limit 3) | no meaningful partial: team score = 100 × team size (D4) | **an absent actor stalls the game forever** (their turn never comes; no abstention) | same | **not fit for official play until redesigned** |

## 3. Timing models compared

| Model | How it works | Strengths | Weaknesses | Fits |
|---|---|---|---|---|
| A. One game deadline | One clock for the whole game; at the deadline the game finishes with what was answered | simple; one number per game; no mid-game waits | a straggler on one question cannot hold anyone up, but a lock-step game still stalls *inside* the window | independent games: Trivia, Who Said That, Geography, Year, Math, Connections |
| B. Per-question / per-round timer | Each question/phase has its own clock (e.g. 45 s); when it ends the phase closes and the game moves on | nobody blocks the room for long; natural party rhythm; TV can show a countdown | needs server-driven phase transitions (a timer or a check on each action/poll); more UI | lock-step games: Closest, Caption, Sprint; Impostor phases |
| C. Host-directed with bounded waiting | The host advances ("Next"), and the server enforces a maximum wait | social games keep the host in charge; flexible | depends on an attentive host; a host who drifts off stalls it | Charades, Impostor (optional) |
| D. Hybrid | B for phases + A as an overall backstop | covers stragglers and forgotten games | two numbers to tune | recommended default for lock-step games |

**Recommendation:** use A for independent games and D (per-phase B plus an overall backstop) for lock-step games. Use C for Charades only after its redesign. Timers should advance the game when the room next acts or polls, using server time: no per-room background timers. That fits the existing no-background-process design, and a fake clock can test it.

**Starting values (to measure, not to trust):** these are design starting points for the first family session, not measured figures.

| Game | Window |
|---|---|
| Trivia, Who Said That, Geography, Guess the Year | 6 min game window |
| Math | 4 min |
| Word Connections | 8 min |
| Closest Wins | 40 s per question + 8 min backstop |
| Caption Clash | 90 s write, 45 s vote, 10 min backstop |
| Category Sprint | 60 s per round |
| Impostor | 90 s clues, 60 s vote, 45 s guess |

The ledger already timestamps every action, so the first real session can replace these with measured numbers (`DEADLINE_VS_DURATION.md` J.4 option B).

## 4. Partial-result policy

Options for a game that ends with some answers missing:

| Option | Meaning | When it is fair |
|---|---|---|
| Finish and count officially | Unanswered = 0; standings as usual | every roster player had the whole window, and the game's scores do not depend on others finishing (independent games) |
| Finish with incomplete-participation markers | Counts; results show "answered 4 of 10" | same as above, plus transparency for the room |
| Finish as practice only | Results shown, Cup untouched | lock-step games where a phase could not complete fairly |
| Void | Nothing recorded except the audit trail | technical failure (server lost the game, a bug), never a player's choice |
| Host intervention | Host picks one of the above, audited | genuinely ambiguous cases; must not become the routine path |

**Recommendations:**

1. **Independent games** (Trivia, Who Said That, Geography, Year, Math, Connections): at the deadline, finish and **count officially**, with incomplete-participation markers. This removes the exploit in §1: stalling can no longer void everyone's results, it only costs the staller.
2. **Lock-step games** (Closest, Caption, Sprint): per-phase timers close phases. Completed questions and rounds count; a missing guess, caption or vote scores 0 for that item. The game counts officially if it reached its end through timers. If the backstop fires mid-phase, finish with completed rounds only and **count as practice** (the host can upgrade it, audited).
3. **Impostor:** per-phase timers, and missing votes count as abstentions (existing L33 semantics). Keep it official only if the owner wants a social-deduction game in the Cup; a sound alternative is **practice-only by default**.
4. **Charades:** practice-only until redesigned (D4): guesser credit, timed turns, an "actor absent → skip turn" rule, and teams balanced or scored per player.
5. **Disconnect-based completion:** do not finish on disconnect. Within 45 s of a drop, the game simply waits (with Sprint 2's honest "reconnecting" display). After that, the timer models above handle it. A reconnecting participant always resumes their own answers.
6. **Family Cup eligibility:** a "qualifying day" should require **at least one answered item** in a completed official game, not merely being on the roster. Being in the room with a locked phone should not earn attendance; answering one question should.
7. **Math speed bonus (D5):** measure per question from when the player *saw* that question (the server records when it was served). Otherwise drop the bonus. Today it is effectively a bonus for the first two answers.

## 5. Decisions required from the owner

| # | Decision | Recommended |
|---|---|---|
| P1 | Timing model per game (table §3) | A for independent games, D for lock-step, C for Charades after redesign |
| P2 | Starting window values | §3 values for the first session, replaced by measured ledger durations afterwards |
| P3 | What happens at a deadline | finish and count (independent games); finish completed rounds (lock-step) |
| P4 | Timed-out game treatment | stop voiding complete results; "void" only for technical failures |
| P5 | Incomplete-participation markers in results | yes |
| P6 | Disconnect-based completion | no early finish; grace window, then timers |
| P7 | Qualifying-day rule | at least one answered item in a completed official game |
| P8 | Impostor in the official Cup | owner's call; practice-only default suggested |
| P9 | Charades | practice-only until redesign (guesser credit, timed turns, absent-actor skip) |
| P10 | Math speed bonus | per-question timing from first view, or remove |
| P11 | Host override of a game's official/practice status after it ends | allowed, audited, visible to the room |

## 6. What Sprint 3 would build once decided

A small server-side lifecycle module, shared by every game, with explicit, testable states:

- **States:** `playing → (phase deadlines) → finished | finished-practice | void`.
- **Transitions:** evaluated on every action and every projection read using server time, so no background timers are needed and the fake-clock harness covers it.
- **Per-game policy objects**, so games declare their model instead of special-casing `room.ts`.
- **Tests:** one family-night scenario per row of §2, using the Sprint 2 harness.
