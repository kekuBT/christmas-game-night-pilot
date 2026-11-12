# Stage 9.2: Spectrum foundation (rules, privacy, a pure module)

- **Handoff:** ChatGPT's 6811101479 on PR #15, which also cleared Stage 9.1.
- **Base:** `aaa6981`, on branch `claude/stage9-2-spectrum`, as a PR stacked on #15.
- **Architecture answers:** ChatGPT's 6811445149 on PR #16 (the team result accepted for this unwired foundation; digits allowed in clues; the existing product described as changed). Guidance during development, not clearance.
- **Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:** the rules contract, a pure game module (`src/games/modules/spectrum.ts`), a curated content pack (`src/games/modules/packs/spectrum-pairs.ts`), and tests.
- **It isn't wired into the product.** The module is not registered in `GAME_MODULES`, the registry, the manifest or the lifecycle policy table. So nothing offers it: no picker, Quick Party, Cup, solo, Memory Book or navigation entry.
- **The existing product IS changed** (6811445149), even though Spectrum is unregistered, by the separate Jebena Rush terminal cleanup (commit `abafb95`, D-S92-09, for the Stage 9.1 clearance note):
  - the module contract gains an optional `onFinish`, and the room's `finalize` now calls it for every finishing game, before the result is recorded. Only Jebena Rush defines it; for every other game the call does nothing;
  - Jebena Rush's own endings (the last one standing, every bank used up) now also drop every player's last rejected try;
  - at the room's own ending (the match limit), the holder's last rejected try is dropped too. Before, it stayed in the saved state, and the holder's own view of the finished game could still show it (nobody else's);
  - scores, standings, endings, results and replay are meant to be untouched. Engine tests pin every terminal path; the gate's Jebena browser driver covers an ending and Play again. The reviewer's private existing-product browser audit (Jebena endings and replay) is still needed before clearance.
- **Next slice:** the phone and TV journey, after this contract is independently reviewed.
- **Spend:** no paid AI, no new service, no deployment, no public port, nothing paid for.

## 2. The game
An original cooperative guessing game. Everyone works toward one shared team score.

- **A round** shows a scale with two labelled ends, for example *Cold* ↔ *Hot*, from 0 to 100.
- **The target:** the server picks a secret spot on the scale. Only this round's clue-giver sees it.
- **The clue:** the clue-giver writes a short clue that sits at about that spot. For a target near *Hot* on Cold ↔ Hot, that might be "a cup of tea".
- **The guesses:** everyone else places their own guess on the scale.
- **The score:** the team's guess (the middle of everyone's guesses) is compared with the target, and the closer it is, the more points the team earns.

The copy, the art direction and the content are original. No external AI and no copied assets.

## 3. Rules (reversible defaults from the handoff; decisions in §11)
- **Who:**
  - Casual and practice only, 2–10 players.
  - The roster is fixed at the start; late joiners will watch.
  - A seeded seat order decides who gives the clue: the clue-giver rotates each round to the next player in seat order who is still taking part.
- **The match:** four rounds. Each round's opposing pair and its target are chosen once, at the start, from the seed, and persisted. No pair repeats within a match. Targets are whole numbers from 10 to 90.
- **The phases of a round:**
  1. **Clue (60 s):** the clue-giver sends one clue.
     - Control characters become spaces, inner spaces are collapsed and the ends trimmed; it must then be 1–80 Unicode code points (so 80 Amharic or accented letters are fine, though they take more bytes).
     - Any language, and digits too: "a 10-minute walk" is a fair clue (D-S92-03, 6811445149). "Give a clue, not the target number" is a social rule the briefing explains (§10). It is not a filter: a digit ban would be bypassed by spelling the number out, and there is no semantic policing.
     - An accepted clue moves the round to guessing at once.
  2. **Guess (45 s):** every other player taking part sends one whole number from 0 to 100.
     - A guess can't be changed once accepted.
     - When every required guess is in, the phase ends early.
  3. **Reveal (8 s):** shows the target, the team's guess, the distance, the round's points and the running total. A skipped round says why. Then the next round starts, or the match ends after round 4.
- **The team's guess:** the median of the guesses received. With an even count, it is the mean of the two middle guesses, rounded to the nearest whole number with .5 rounding up.
  - With no guesses, the round scores 0 and has no team guess. A neutral guess is never invented.
- **Points per round, for the team:**

  | Distance from the target | Points |
  |---|---|
  | 5 or less | 10 |
  | 10 or less | 7 |
  | 20 or less | 4 |
  | more than 20 | 0 |

  The maximum is 40.
  - The result is a shared team result only: no per-player winner, no Cup ledger, no personal best (§8).
- **When things go wrong:**
  - **No clue in time, or the clue-giver sits out during the clue phase:** the round is skipped for 0 and goes to the reveal, which says why. A clue is never generated.
  - **The clue-giver sits out after giving the clue:** the round carries on (the clue is out). The player is out of future roles.
  - **A guesser sits out:**
    - Their required guess for this round is removed. A guess they already sent stays, because accepted guesses can't be changed.
    - They take no future role.
    - If every remaining required guess is then in, the guess phase ends.
    - A round can't run out of guessers while the match goes on: with fewer than two players still taking part, the match ends (next point).
  - **Fewer than two players still taking part:** the match ends cleanly with the points earned so far and the reason. An unrevealed round scores nothing.
  - **A disconnect alone changes nothing.** No role or roster changes, and no clock pauses. A disconnected guesser simply may not guess in time.

## 4. Exactly once, on server time
- **Stale or wrong sends:**
  - Every send names its round (`round`).
  - A send for another round is `STALE_ROUND`. A send that doesn't fit the current phase is `WRONG_PHASE`: a clue during guessing, or a guess during the clue phase or the reveal.
  - The client's `phaseKey` is checked by the room as well, as for every lock-step game.
- **Duplicates:**
  - The room drops a repeat of the same client event id, returning the original result.
  - A second clue is `WRONG_PHASE`, because the round has moved on.
  - A second guess is `ALREADY_GUESSED`, and the first stands.
- **The deadline boundary:**
  - The room's tick processes a phase at its deadline instant, before any request, so a send arriving after it finds the next phase.
  - The module is also idempotent on its own. It records when each phase started (the event's instant, never the wall clock), and it expires a phase only when `now >= started + duration`. A repeated expiry at the same instant finds a phase that has just started, and does nothing.
- **Catch-up after a restart:** each phase expires at its own original deadline, and the next phase starts from that instant (§5). The restart's clock is never used.
- **No injection:** a payload with anything beyond its fields is refused (`INVALID_PAYLOAD`). Those fields are `round` and `text` or `value`, plus the client's `phaseKey`. So a `target`, `points` or `score` can never be sent in.

## 5. Timing contract and the integration plan
- **One source for the durations:** `SPECTRUM_PHASE_MS = { clue: 60_000, guess: 45_000, reveal: 8_000 }`. The test time scale multiplies them, as for every module.
- **The planned policy entry** (added in the integration slice, not now):
  - `{ model: "phased", gameWindowMs: 10 min, phaseMs: SPECTRUM_PHASE_MS, officialEligible: false }`, casual-only.
  - Four rounds at the longest take 452 s; the 10-minute window is a backstop.
- **Absolute instants:** the room persists each phase's deadline (`phaseDeadlineAt`), as it already does. The module persists each phase's start. Catch-up after a restart walks the original deadlines (the room's tick). The module test drives the same walk.

## 6. State, actions and refusals
- **State** (JSON, persisted with the room):
  - `rulesVersion`, `packVersion`, `seed`;
  - the seat `order`; `satOut` (who left, and when);
  - `rounds`: four entries of `{ pairId, giver, target, clue, guesses, outcome }`;
  - `round`, `phase` (`clue | guess | reveal | finished`), `phaseStartedAt`;
  - `total`, `end` (`completed | too-few-players`).
- **Actions:**
  - `spectrum-clue { round, text }`, by the round's clue-giver;
  - `spectrum-guess { round, value }`, by a required guesser;
  - the room's own `abstain` ("sit this one out" for the rest of the match).
- **Refusals; nothing changes:**
  - `NOT_IN_GAME`, `SAT_OUT`, `ALREADY_FINISHED`;
  - `STALE_ROUND`, `WRONG_PHASE`;
  - `NOT_CLUE_GIVER`, `GIVER_CANNOT_GUESS`, `NOT_A_GUESSER` (joined the round's roles later);
  - `ALREADY_GUESSED`;
  - `INVALID_PAYLOAD`, `INVALID_CLUE` (not text, empty or blank once cleaned, or more than 80 code points), `INVALID_GUESS` (not a whole number from 0 to 100).
- **Accepted:** `{ ok: true, result: { round, phase } }`. No secret is ever in a result.

## 7. Privacy (who sees what)
| | Before the reveal | At the reveal and after |
|---|---|---|
| **Public view** (TV, spectators, late joiners, anyone not in the round's roles) | The round number, the pair's two labels and meaning, who gives the clue, the clue once given, counts (guesses in, of how many), the total so far, and every **past** revealed round | Plus this round's target, team guess, distance, points and reason |
| **The clue-giver** | The public view, plus **this round's target** | The same as public |
| **A guesser** (the host included, when guessing) | The public view, plus **their own guess** once sent | Plus their own guess |
| **Never, to anyone** | Future rounds' pairs and targets; the seed; anyone else's individual guess; the pack | Individual guesses stay private after the reveal too (only the team's guess is shown); future rounds stay hidden |

- The pack is server-side, as with Jebena Rush.
- Free text is kept to a minimum: the clue (public once given) and nothing else. Rejections carry codes, never stored text.

## 8. One shared team result: the contract question
**The conflict.** The room's results pipeline is per player:
- `GameModule.scores()` feeds `rawScores`, the "score-awarded" log and the results hero ("X wins").

**Accepted for this unwired foundation only (6811445149 §1):**
- **The authoritative result** is `spectrumTeamResult(state)`: one shared total (0–40), the revealed rounds and the end reason. It names no player.
- **`scores()` is a compatibility representation:** the same earned total copied to every **original** roster player, those who sat out included (the team earned it together).
  - The copies are never summed into the team total; summing would count it once per player.
  - They are never described as individual achievement.
  - Tests at 2, 4 and 10 players, for a completed match, a partial ending and an ending before anything is earned, pin all of this.
- **Equal scores are not enough on their own.** They don't prove that every downstream surface avoids naming a winner.
- **Before any production registration** (the integration slice), there must be an explicit cooperative results branch for the phone results and the TV. It shows the team result, and it prevents any individual winner, personal best, achievement or Cup credit from being drawn from the adapter scores.
- **Spectrum stays practice-only and casual-only,** so it never reaches a Cup ledger.

The room contract is not widened for Spectrum now.

## 9. Content (`sp-pairs-1`)
- **30 curated, year-round opposing pairs.** Each has a stable id (`sp-…`), a left and a right label, and a one-line meaning (what the scale measures).
- **No sensitive rankings:** no Christmas-specific pairs, and nothing about people's identity (looks, wealth, nationality, religion, body, intelligence). Pairs measure things, places, foods, activities and moments.
- **Themes never choose content.** A match draws four different pairs from the seed. A test checks the ids, the labels, that no pair repeats within a pack or within a match, and the counts.

## 10. Accessibility contract for the next UI slice
- **The briefing** tells the clue-giver, in words: "Give a clue, not the target number." (6811445149 §2).
- **The scale:**
  - a real, keyboard-operable control with an accessible name naming both ends, for example "From Cold (0) to Hot (100)";
  - the arrow keys move it by 1 and Page Up/Down by 10;
  - the number is always shown as text;
  - the guess is sent with a button or Enter.
- **The ends are text,** never only colours or pictures. The target, the team's guess and the guesses are told apart by shape and label as well as colour.
- **The result** is explained in words: "Target 72 · team guess 68 · 4 away · +10".
- **Layout:** phone first at 320 and 390 px, with no sideways scroll, and a TV layout.
- **Looks and motion:** both looks; reduced motion and Animations Off keep every meaning (no animation is needed to read a result).

## 11. Decisions (details in docs/DECISIONS.md)
- **D-S92-01:** a pure module, not registered; the planned wiring is in §5.
- **D-S92-02:** four seeded rounds, chosen at the start: pair, target 10–90, and clue-giver rotation over players still taking part.
- **D-S92-03:** clue rules: cleaned and trimmed, 1–80 Unicode code points, any language, digits allowed (revised by 6811445149, which reversed my earlier no-digits default). The briefing says "Give a clue, not the target number."
- **D-S92-04:** the median team guess (even count: the mean of the middle two, rounded half up); scoring bands 10/7/4/0; no invented guesses.
- **D-S92-05:** sit-outs, skipped rounds and the fewer-than-two ending as in §3; disconnects change nothing.
- **D-S92-06:** exactly once: round and phase checks, strict payloads, and phase expiry by the module's own recorded start (§4).
- **D-S92-07:** privacy as in §7; individual guesses are never shown, even after the reveal.
- **D-S92-08:** `spectrumTeamResult` is the single authoritative result. `scores()` copies the team total to every original roster player as a compatibility representation, never to be summed or read as individual achievement. A cooperative results and TV branch is required before production registration (§8, accepted by 6811445149 for this unwired slice).
- **D-S92-09:** Jebena Rush's terminal cleanup via an optional `onFinish` hook, called once by the room's `finalize`. This changes the existing product (§1).

## 12. Validation and report
- **Unit scenarios** at 2, 4 and 10 players: every phase, clue-giver rotation, four-round completion, partial endings, no guesses, clue timeout, one or all disconnected, explicit sit-outs, ties and median rounding, every scoring boundary.
- **Negative tests:**
  - injected targets or scores;
  - the wrong actor;
  - a stale round or phase;
  - a duplicate clue or guess;
  - invalid numbers; blank, oversized or non-text clues (and clues with digits or non-ASCII text accepted);
  - repeated deadline processing.
- **Exhaustive projection checks** for each role and phase, with unmistakable canaries:
  - the host as a guesser, spectators and late joiners;
  - views after a save and reload;
  - past rounds revealed, future rounds hidden;
  - both the positive path (at the reveal) and the negative path (before it).
- **Content checks:** the inventory and its ids.
- **Gates:** sequential clean fast then full gates on the completed checkpoint, then a new completed report.
- **This slice has no Spectrum UI:**
  - the existing product is changed by the Jebena cleanup (§1): engine tests, and the gate's existing browser drivers, Jebena Rush's included; the reviewer's private browser audit is still to come;
  - the Spectrum UI and real devices are NOT RUN;
  - there are no screenshots of a flow that doesn't exist yet.

## 13. As built and tested
| Area | Tests |
|---|---|
| Content | `tests/stage92-spectrum.test.ts`: 30 pairs, stable ids, two different ends, a one-line meaning, no repeats; nothing Christmas-specific and nothing that ranks people; four different pairs and targets from 10 to 90 for 300 seeds; the same seed gives the same match |
| Rules | the median and its rounding; every scoring boundary, both directly and through real rounds on either side of the target |
| Whole matches | at 2, 4 and 10 players: the rotation, the early end of the guess phase, the total, an equal team score for everyone, participation |
| The team result | at 2, 4 and 10 players: a completed match with a sit-out (40), a partial ending (10), an ending before anything is earned (0). `spectrumTeamResult` holds the one total, its rounds add up to it, and it names no player; `scores()` has a key for every original roster player, sat-out included, each the same total; their sum is n × the total, never the team's result |
| Nobody acting | everyone disconnected, at 2, 4 and 10 players: every round skips on its clock, roles never change, and the match ends |
| Missing input | no clue, no guesses, and only the guesses received (one player connected) |
| Sit-outs | the clue-giver before and after the clue; a guesser before and after their guess; fewer than two left; two players; during a reveal |
| Refusals (state unchanged, deep-equal) | injected targets, points and scores; the wrong actor; a stale round; the wrong phase; a duplicate clue or guess; invalid numbers; empty, blank (spaces or control characters only), over 80 code points (ASCII and Amharic) or non-text clues; after the end |
| Clues accepted | digits ("a 10-minute walk", "about 70", Arabic-Indic digits), accents, Amharic, emoji; exactly 80 code points of multi-byte letters (more than 80 bytes) |
| Exactly once | a repeated or early expiry; the exact deadline; the time scale; catch-up after a restart equal to a clock that never stopped (bounded, idempotent, every phase starting at the previous deadline) |
| Privacy | canaries (the seed 987654321, targets 73/61/37/29, guesses 44/58), checked first to be in the state. For each phase (clue, guess, reveal, next round, finished) and each role: the clue-giver, the host as a guesser, the other guessers, a sat-out player, spectators/TV and late joiners. Plus the views after a save and reload |
| Not in the product | not a registered module, game, manifest or policy; its actions reach nothing; `tests/stage91-bank-privacy.test.ts` keeps the module and its pairs out of the web app |
| Jebena cleanup | `tests/stage92-jebena-terminal.test.ts`: every terminal path |

**Mutation checks (temporary, reverted):**
- a target in the public view fails 4 tests;
- other players' guesses in a guesser's view fail 2;
- rounding .5 down fails 1;
- the Jebena cleanup removed fails 6 of its 7 tests;
- `scores()` leaving out sat-out players fails 8 tests;
- the team result made a sum of the per-player copies fails 10.

