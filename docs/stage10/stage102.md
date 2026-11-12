# Stage 10.2: a results line for a genuine moment (Jebena Rush and Spectrum)

**Instructions:** ChatGPT's handoff 6829484451 on PR #18, which also cleared Stage 10.1 on `0d9e4b4`.

**Branch:** `claude/stage10-2-result-lines`, from PR #18's head `30a56f9`. A new stacked PR, unmerged and linked to #18 and #5.

**Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:**
  - one short, optional line on a finished Jebena Rush or Spectrum result, when a real moment in the recorded result supports it;
  - on every player's results and on the TV's final view;
  - the same line on every phone, the TV, and after a reload.
- **It isn't:**
  - a saving feature (the next slice);
  - a change to scores, places, projections, the protocol or the Memory Book;
  - AI, a service or a new dependency;
  - a line for any other game.

## 2. Where it comes from
- **Extending an existing pure layer.** `apps/web/src/ui/mchezo/lib/moments.ts` (Stage 5, S5-E) already gives Majority Rules, Pattern Pulse and Draw & Guess one "moment" line per finished game. Each line is told only from what the server recorded, deterministic, and nothing when no fact fits. Two functions join it: `jebenaMoment` and `spectrumMoment`.
- **Input:** only finished, public facts that every role already has.
  - **Jebena:** the public state's `end`, `startHearts` and `standings` (place, cups left, out, sat out).
  - **Spectrum:** the public `outcome.team`: `end`, `roundsPlanned`, `rounds[]` (each with `reason`, `distance`, `points`), `total` and `max`.
  - No private state, no individual guess, no clue-giver identity.
- **Output:** one line or nothing. The lines are fixed, authored strings (with numbers filled in), never chosen at random, so every device shows the same words.

## 3. The lines and when they appear
### Jebena Rush
Every Jebena line needs all three of these:
- **The module ended the match:** `end` is `last-standing` or `banks-exhausted`. When the room ended the game (match limit, abort), `end` is null, and there's no line.
- **One sole winner:** exactly one standings row in first place, not out and not sat out. A shared first place gets no line.
- **Someone was knocked out:** at least one opponent lost every cup, out and not sat out. A winner whose opponents all left gets no line: the win came from absence, and the line never comments on that.

| Priority | Fact | Line |
|---|---|---|
| J1 | The sole winner has exactly 1 cup left | "One cup left. Still enough for the win." |
| J2 | The sole winner has every cup they started with | "All {n} cups still whole. Not a single crack." |

The two can't both hold (the game starts with 3, 5 or 7 cups). Nothing else gets a line.

The line names nobody: the headline above it already names the winner. The actual cup counts, places and points stay in the standings and the headline; the line repeats nothing.

**Zero answers:** a survivor with no accepted answer still wins on cups, and the line is still true. "One cup left" is the reviewer's own live 110–0 match. Nothing about answers, speed or timeouts is said.

### Spectrum (team only)
Every Spectrum line needs both of these:
- **The module completed the match:** `end` is `completed`.
- **Every planned round was revealed:** `rounds.length === roundsPlanned`.

So an early ending (`too-few-players`) or a room ending (`end` null) gets no line. An early ending is the main fact there, and a quip beside it would read as commentary on who left.

| Priority | Fact | Line |
|---|---|---|
| S1 | Every round scored, and `total === max` (40 of 40) | "40 out of 40. The whole team was on one wavelength." |
| S2 | At least one scored round at distance 0 | one: "Round {n} landed exactly on the target."; several: "Rounds {a} and {b} both landed exactly on the target." (three or four: "Rounds 1, 2 and 4 all landed …") |

- **Team only:** the lines speak of the team and its rounds. They never name or credit a player, and never mention a winner, a place, the Cup or anyone's own guess.
- **The factual result** stays the existing team summary ("Team result: 27 out of 40").

### No line
These get the normal result, with no line and no empty box:
- a missing result;
- a tie;
- an aborted or room-ended game;
- an early ending;
- a win only by others leaving;
- an ordinary win;
- an ordinary team score.

## 4. Where it shows
- **Phone results:** right under the game's own result line (Jebena: "Keku kept the jebena!"; Spectrum: the team-result header).
  - That's after the result hero and the What's next panel, so Play again, Pick another game and Take a break stay where they are.
  - It reuses the Stage 5 element: `<p class="mz-moment" data-testid="results-moment">`.
- **The TV's final view:** under the result line, on Jebena's final (`tv-jr-final`) and Spectrum's (`tv-team-final`), as `<p class="mz-tvshow-line mz-tv-moment" data-testid="tv-results-moment">`.
- **Both looks, 320 px and the TV** keep the existing `.mz-moment` style: a dashed outline, the body font and wrapping text. The TV uses its own line size. No other layout changes.
- **The Memory Book** and its eligibility are untouched.

## 5. Decisions
D-S102-01 to D-S102-05 in `docs/DECISIONS.md`:
- extend `moments.ts`;
- Jebena guards;
- Spectrum guards;
- placement;
- fixed, unnamed copy.

## 6. Validation plan
- **Unit:** `tests/stage102-moments.test.ts`, every trigger and its guards.
  - **Jebena:**
    - J1, and J2 at 3, 5 and 7 cups;
    - a 2-cup winner gets nothing;
    - a tie, a room-ended game (`end` null), and a winner whose opponents only sat out get nothing;
    - the zero-answer winner;
    - missing or partial data gets nothing.
  - **Spectrum:**
    - S1 over S2 (priority);
    - S2 with one, two and four exact rounds;
    - an early ending with an exact round gets nothing;
    - `end` null, fewer revealed rounds than planned, or a round with no clue or no guesses (distance null) get nothing;
    - the lines contain no player name, "win", "place", "Cup" or "guess by".
  - **Determinism:** the same facts give the same line, and no input order or time changes it.
- **Browser** (reusing the established drivers):
  - **`check-jebena-rush`:**
    - **Room C** (the zero-answer survivor, 1 cup left, "One cup left. Still enough for the win."): the line on the host's phone (Everyday, 390 px), the guest's (Christmas, 320 px) and a TV opened on that room, and the same after a reload.
    - **Play again in room C:** both players leave the replay, so its result gets no line, and none is carried over.
    - **The main match:** the driver works out the expected line from the server's own standings, with its own copy of the rules, not the app's selector. It checks the same line, or none, on all three phones and the TV, and after a reload.
  - **`check-spectrum`:**
    - one round's guesses are set to the target, so that round lands at distance 0;
    - the bullseye line shows on every phone and the TV, and after a reload;
    - the early-ended replay gets no line.
  - Scores and the server's projections are compared with the same scenarios as before. No server file changes.
- **Gates:**
  - focused runs while developing: targeted `jebena-rush spectrum`, then a fast gate;
  - then one full gate on the final product code.

## 7. Estimate
| Step | Time |
|---|---|
| Spec, PR and links | 0.5 h |
| Selector and unit tests | 1 h |
| Wiring (2 phone results, 2 TV finals) and CSS | 0.5 h |
| Browser checks in the two drivers, screenshots | 1.5–2 h |
| Gates (targeted, fast, one full gate of about 33 min) | about 40 min |
| Docs and the report | 0.5 h |
| **Total** | **about 4.5–5.5 h** |

## 8. As built and tested
| Area | Where | Tests |
|---|---|---|
| The selectors | `apps/web/src/ui/mchezo/lib/moments.ts`: `jebenaMoment`, `spectrumMoment`, `JEBENA_LINES`, `SPECTRUM_LINES` | `tests/stage102-moments.test.ts` (24): every trigger, guard and priority, missing and partial data, ties, room and early endings, wins by absence, the zero-answer winner, team-only wording, determinism, and the real modules' finished views (scores unchanged) |
| Phone results | `MchezoJebenaResults` (under the game's result line), `MchezoSpectrumResults` (under the team total): `results-moment`, the Stage 5 element | The browser checks below |
| TV final | `JebenaTvFinal`, `SpectrumTvFinal`: `tv-results-moment`; `styles/stage102.css` (a dashed rule, the accent, bold) | The browser checks below |
| In real browsers | `scripts/check-jebena-rush.mjs`, `scripts/check-spectrum.mjs`. Each works out the expected line from the server's own state with its own copy of the rules | See below |
| Unchanged | No file under `src/` (server, modules, projections) or `src/shared/`, and the Memory Book is untouched | `git diff 30a56f9 cdb77ad -- src` is empty; the drivers compare results with the server's scores |

### In real browsers
- **Jebena, room C** (the zero-answer survivor, one cup left):
  - the line on the winner's phone (Everyday, 390 px), the other player's (Christmas, 320 px) and a TV opened on that room;
  - under the result and What's next, no sideways scroll;
  - the same after reloading the phone and the TV.
- **Jebena, Play again in room C:** last match's winner leaves, so the other player wins by absence. No line on either phone, and the TV shows the replay's final (a new winner) with no line carried over.
- **Jebena, the main match:**
  - the expected line, or none, on all three phones and the TV, and after a reload;
  - Keku kept 2 of 3 cups in these runs, so no line, correctly;
  - its replay (both others left) gets none.
- **Spectrum:**
  - round 3's guesses are put on the target, so it lands at distance 0: "Round 3 landed exactly on the target." on all three phones and the TV, naming nobody;
  - the same after reloading a phone and the TV;
  - the next match ends early (too few players) with no line, so nothing carries over.

### Gates
`docs/PROGRESS.md`, Stage 10.2. On `cdb77ad`:
- targeted (`jebena-rush`, `spectrum`) `20261112-164638-cdb77add-1528` PASSED;
- fast `20261112-164851-cdb77add-2300` PASSED;
- checkpoint full gate `20261112-165001-cdb77add-5562` PASSED (88/88).

Screenshots: `docs/stage10/stage102-screenshots/`.

## 9. Repairs (ChatGPT's verdict 6831760093)
**Instructions:** two P2 repairs on #19, both found in the independent audit of `cdb77ad`. Decisions D-S102-06 and D-S102-07.

### S102-R1: the Memory Book waited forever on an event hidden from this viewer
- **What the reviewer saw:**
  - two players finish a Spectrum match, then play again, and the guest sits out in round 1, ending it early;
  - the host's Memory Book says "Checking for the latest finished game…" forever, with Add off, even after a reload;
  - the room's newest event (35) is the guest's sit-out, which `ledgerFor` correctly hides from the host.
- **Cause:** the screen compared the newest visible event (34) with the room's unfiltered seq (35). That gap stays open whenever the newest event is private to someone else: another player's sit-out or recovery code, or a live game's scores. A sit-out that ends a game is logged after its finish, so the gap appears in exactly the rooms where a highlight is wanted.
- **Repair:**
  - **Server:** `GET /rooms/:id/ledger?watermark=1` returns `{ seq, events }`: the room's public seq, read in the same pass that filters the events for this viewer. Without the opt-in, the plain array is unchanged.
  - **Web:** the screen keeps the loaded response's watermark (`ledgerAt`). The pure `memoryLink` (`lib/memoryLink.ts`) gives one of five states:
    - `loading`: nothing loaded yet;
    - `syncing`: the loaded watermark is behind the room;
    - `none`: no game has finished;
    - `unavailable`: the last finished game is a team game;
    - `ready`: Add is on.
  - **Ordering:** `newerLedger` keeps an older overlapping response from replacing a newer one.
- **What Spectrum shows:** "The last game that finished is **Spectrum**, a team game: team games aren't saved to the Memory Book yet." The hint reads "You can add a highlight after the next game that isn't a team game." The server's `NOT_IN_MEMORY_BOOK` refusal is unchanged; saving Spectrum is the next slice.
- **Unchanged:**
  - redaction (`ledgerFor` filters as before);
  - the stale-citation guard (a ledger behind the room still can't cite the game before);
  - every existing ledger consumer.

### S102-R2: the short reconnect proves its preconditions
- **What the reviewer saw:** `check-jebena-rush` ended 186 PASS and 4 FAIL:
  - the resync was "not within 6000ms (locator.evaluate: Timeout 30000ms exceeded)";
  - the window check got "null ms";
  - the runner-up's last cup didn't break on Baraka's phone;
  - no live break followed the reconnect.
- **Cause:** a validation gap, not a runtime bug.
  - In the main match, turns kept running out while the driver handled Amina's offline resync, so Baraka's drop could land on the turn that ended the match. His phone was cut through the deciding loss.
  - The driver accepted the finished game, then waited on a playing-screen element on the results with a locator that blocks for 30 s.
  - No later live loss could follow.
- **Repair (driver only):** room S, its own room.
  - **Players:** Pendo (390 px, reduced motion, socket and polls through the driver) against Halima, who answers whenever the jebena is hers. Three cups.
  - **Three steps, each checking its preconditions first:**
    1. **The drop, 3 → 2:** the match must still be on, and the resync must be seen within 3 s of the server's recorded loss, showing the cup broken without breaking it;
    2. **a later live loss, 2 → 1:** that cup breaks once, still;
    3. **the final loss, 1 → 0:** the match ends, and Pendo's results break the last cup once.
  - **Bounded waits:** `scripts/lib/deadline.mjs` `soonUntil` races each probe against the time left, so late is FAIL.
  - **The main match** keeps Amina's offline resync, Keku's reload, and the R1 checks on the runner-up's phone, which is no longer cut.
- **Result:** the final-loss break passes once the scenario is valid, so no runtime change.

### Validation
- **Unit:**
  - `tests/stage102-memory-freshness.test.ts` (13);
  - `tests/stage102-deadline.test.ts` (5).
- **Browser:**
  - **`check-spectrum`** (the reviewer's journey): Keku's watermark is the room's seq, and the newest event (the last leaver's sit-out) is hidden from him. The Memory Book says plainly that the last game was a team game, with Add off. It stays that way after 2.5 s and after a reload, and the server still refuses a Spectrum entry.
  - **`check-jebena-rush`:**
    - **G:** the main room's replay is ended by two sit-outs. Keku's Memory Book is ready, "Linked to Jebena Rush", and the added highlight cites exactly that replay's finish.
    - **Room S:** the three steps above.
- **Before and after:**
  - the Spectrum driver against the pre-fix web build fails exactly the new Memory Book checks (still "Checking…"), and passes against the repaired build;
  - a copy of the Jebena driver that keeps the phone cut past the window fails the window checks instead of passing late.
