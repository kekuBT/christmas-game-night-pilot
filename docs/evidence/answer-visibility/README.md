# Answer visibility and accessibility: H1/H2 evidence (handoff 7008903623)

**What this is:** Claude's developer-run checks, on this session's machine: unit and contract tests, and headless Chromium. It is not independent evidence, not a real-device test, and **not a screen-reader test**: the live region's contents and attributes are checked in the page, but how and when VoiceOver or TalkBack actually announce them was not tested.
- **The acceptance criteria** are the handoff's, from the November 19 audit's page 4 findings. The audit itself is not in this repository.
- **The decisions** are D-AV-01..04 in `docs/DECISIONS.md`.
- **The base:** #52's reviewed head `235cab949bfda138fda40e78f7d17374bcf7ae56`. **The tested commit:** `b936586e4989ce6f56dd6b1124bab3ebb25521c2`. This folder and the PROGRESS entry were added after it, in a docs-only commit.

## H1, Pattern Pulse: a transient cue
**Before (`235cab9`):** the memorise screen drew the whole pattern for the whole window, as a row of cells.
- Its accessible name listed the complete sequence ("The pattern: Purple hexagon, Green triangle, Pink star").
- Each cell had a visible one-word name.

**After:**
- **The slots:** one symbol at a time, each in an equal slot of the server's unchanged memorise window. The symbol shows for 80% of its slot, then a short gap.
- **The cue:** each symbol is named with its place ("2 of 3: Green triangle") in an assertive, atomic live region.
- **Never present:** a text, live region or accessible name holding more than the current symbol, while memorising or while tapping back.

**`scripts/check-pattern-pulse.mjs`** samples the page every 15 ms through the memorise window, recording:
- each symbol shown, in order, against the server's pattern for that player;
- the most cue elements on screen at once;
- the most symbol names (full or one-word) in the page's text, and in any accessible name, at once;
- the live region's attributes;
- the animation (pop-in with full motion, none with reduced motion).

| Run | Build | Result |
|---|---|---|
| `runs/pp-before-235cab9.log` | the base's web and server (built from `84955a5`, whose app code is identical to `235cab9`), driven by the new driver | **the H1 checks FAIL as expected**, then the run stops (exit 1) |
| `runs/check-pattern-pulse-b936586.log` | `b936586`, from the full gate below | **55 PASS, 0 FAIL** (exit 0) |

**The negative control: what the new driver saw on the base.**
- The pattern was `[1,3,1]` (square, diamond, square).
- **One symbol at a time:** no cue elements at all (`maxAtOnce` 0). The whole row was drawn for the whole window instead.
- **Names in the page text at once:** 2, both of the pattern's distinct shapes, the whole sequence's names. The counter counts distinct symbol names.
- **Names in one accessible name at once:** 2, from the row's accessible name.
- **The live region:** none.
- **Why the run stops:** the driver taps back what the screen showed one symbol at a time. On the base it saw nothing, so its tap fails at `mz-pp-key-NaN`. That is the expected end of a negative control, not a separate defect.

**On the tested commit:**
- **The pattern:** `[0,3,0]`, seen one symbol at a time and in order: Red circle, Blue diamond, Red circle.
- **At once:** at most 1 cue element on screen.
- **Names:** at most 1 symbol name in the page's text; none in any accessible name.
- **The live region:** `aria-live="assertive"`, `aria-atomic="true"`, with the words "1 of 3: Red circle", "2 of 3: Blue diamond", "3 of 3: Red circle".
- **Reduced motion:** a second player saw `[2,0,1]` the same way, with no animation.
- **The rest of the game:** after the window the stage is gone from the screen and the pattern from the player's projection. The recall controls (undo, clear, tapping back, Lock it in), the post-round line, the recap and the TV checks pass unchanged.

**Limit of the browser counter:** it counts distinct names, so for a pattern that repeats one shape, two copies of the same name would count as 1. The unit tests below close that gap: they check that no text or accessible name holds two of the pattern's symbols in order, with a pattern that repeats a shape (`[3,1,4,4,0]`).

**Unit tests:**
- `apps/web/src/components/mchezo/MchezoPulse.test.tsx`: the slot maths; one symbol per slot and none in a gap; no text or accessible name holding two of the pattern's symbols in order (memorise and recall); the countdown not a live region; recall controls and the post-round line unchanged.
- `tests/stage5-pulse.test.ts`: `showFrom` is the window's start, for the round's own player only.
- `tests/stage62-solo-shelf.test.ts`: `PULSE_RULES_VERSION` 2 (D-AV-02), with lengths, symbols, windows and scoring unchanged.

**Screenshots** (`screenshots/`):

| File | What it shows |
|---|---|
| `before-pp-memorise-390.png` | The base, full motion: the whole row with each shape's name, from the negative-control run above. |
| `before-pp-memorise-reduced-375.png` | The base, reduced motion: the same whole row. This is the repository's Stage 5 screenshot as it stands at `235cab9` (captured in `fa823de`), not re-run here: the negative-control run stopped before its reduced-motion step. |
| `after-pp-memorise-390.png` | `b936586`, full motion: one shape with "1 of 3: …". The picture is taken during the shape's 160 ms pop-in, so it is drawn part-faded. |
| `after-pp-memorise-reduced-375.png` | `b936586`, reduced motion: one shape with "1 of 3: …", no animation. |

## H2, Spectrum: the target only for the clue-giver before the reveal
**The source review found no leak.**
- Every phone (the host's included) uses the player audience, and the module sends `me.target` only to the round's clue-giver in the clue and guess phases.
- The host and cohost tool views, the TV and spectators get only the public view, which carries a target only once revealed.
- The phone draws a target only on the clue-giver's screen and at the reveal.

**The contracts now pinned:**
- `tests/h2-spectrum-target.test.ts`:
  - **The engine projections:** five players (the host and a cohost among them), the host and cohost tool views, the TV, a late joiner and a sit-out. All four rounds, with a different canary target each. Each round's clue and guess phases, its reveal, and the finished game. The roles rotate (checked), and the host plays in a guessing seat (checked).
  - **Over HTTP:** the clue-giver's phone, the host's own phone in a guessing seat, the host's tool view, another guesser, a spectator and the TV, before and at the reveal.
  - **The negative control:** with the module changed to send the target to guessers too, both tests fail. The change was reverted (no diff).
- `apps/web/src/components/mchezo/MchezoSpectrum.test.tsx`: the rendering per role (giver, guesser, the host guessing, a guess already in, sat out, a late joiner, the TV), the reveal for everyone, the roles rotating, and a stale or forged projection handing a guesser or watcher a target (not drawn). The guesser's labelled range, value text and help stay.
- `scripts/check-spectrum.mjs`, round 2 (after the roles rotate): every non-giver phone and the TV, with no target marker, no "Target N" text and no accessible name holding it. Round 1's existing checks already cover the host as a guesser.

| Run | Build | Result |
|---|---|---|
| `runs/check-spectrum-b936586.log` | `b936586`, from the full gate below | **203 PASS, 0 FAIL** (exit 0) |

## Gates on `b936586`
| Run | Result | Record |
|---|---|---|
| Targeted gate on `db1d427` (the first commit), run `20261119-123945-db1d427f-27227` | **FAILED (exit 1)**, 7 passed, 1 failed | `gates/targeted-db1d427-FAILED-summary.txt`, `gates/targeted-db1d427-check-solo-shelf.log` |
| Full gate on `b936586e4989ce6f56dd6b1124bab3ebb25521c2`, run `20261119-124950-b936586e-29240`, clean tree, Node v22.23.4, headless Chromium | **PASSED (exit 0)**, 113/113 | `gates/full-b936586-PASSED-summary.txt` |

**Why the targeted gate failed:** `check-solo-shelf` asserted a best stored under `pattern-pulse@1`. With `PULSE_RULES_VERSION` 2 (D-AV-02) it is stored under `pattern-pulse@2`.
- **The fix, `b936586`, is to the driver only:** it expects version 2, and it now also checks in the browser that a best stored under `pattern-pulse@1` is never shown.
- **The full gate's driver logs kept here:** `runs/check-pattern-pulse-b936586.log`, `runs/check-spectrum-b936586.log`, `runs/check-solo-shelf-b936586.log` (58 PASS) and `runs/check-pulse-timing-b936586.log` (41 PASS).
- **Its unit-test step:** 169 files, 2123 tests passed, with lint and both typechecks clean.
- **Redaction:** this session's scratch paths are replaced with `<scratchpad>`.

## Limits
- **Not a screen-reader test.** The live region's text and `aria-live="assertive"` / `aria-atomic="true"` are checked in the page, but announcement timing with VoiceOver or TalkBack is unverified. A 0.68–0.88 s slot may be short for a slow speech rate. The handoff's native-device retest is the place to measure it.
- **Headless Chromium on one Linux machine;** native phones are untested.
- **The player's own projection still carries the round's pattern** during the memorise window, as it always has (the phone needs it to present the cue). The criterion is about rendered and announced text and accessible names.
- **H2's audit observation is not reproduced** as a leak by these checks. Its exact steps were not available here.
