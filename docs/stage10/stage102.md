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
