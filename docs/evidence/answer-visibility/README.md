# Answer visibility and accessibility: H1/H2 evidence (handoff 7008903623)

**What this is:** Claude's developer-run checks, on this session's machine: unit and contract tests, and headless Chromium. It is not independent evidence, not a real-device test, and **not a screen-reader test**: the live region's contents and attributes are checked in the page, but how and when VoiceOver or TalkBack actually announce them was not tested.
- **The acceptance criteria** are the handoff's, from the November 19 audit's page 4 findings. The audit itself is not in this repository.
- **The decisions** are D-AV-01..04 in `docs/DECISIONS.md`.
- **The base:** #52's reviewed head `235cab949bfda138fda40e78f7d17374bcf7ae56`. **The tested commits:**
- `b936586e4989ce6f56dd6b1124bab3ebb25521c2`, for the first H1/H2 round.
- **`6750b99810819f1630fa356d0d49b2d631fb5b56`**, the current one, for review 7010784066's H1 change: the cue announcer, in the section of that name below. H2's code is unchanged since `b936586`.

This folder and the PROGRESS entries were added after each tested commit, in docs-only commits.

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

## Review 7010784066: one cue announcer, in the page and empty before the pattern opens (D-AV-05)
**The finding (ChatGPT, on `b936586`):**
- The memorise screen's live region arrived together with its first words. The ready screen had no announcer.
- A region is generally announced when a region already in the page changes. So the first spoken cue was not assured, whatever a DOM sample of the three labels showed.

**The change, tested on `6750b99810819f1630fa356d0d49b2d631fb5b56`:**
- **One announcer:** `PulseAnnouncer`, a visually hidden `aria-live="assertive"`, `aria-atomic="true"` paragraph. Every Pulse screen (ready, memorising, recall, finished) renders it right after its own `<main>`, at the same place in the tree, so React keeps ONE DOM node for the whole game.
- **Its words:** `pulseCueSay` gives "1 of 5: Blue diamond" in its slot. It gives nothing in each gap, before a round opens and once the window ends, so recall finds it empty.
- **Mounting empty:** a newly mounted announcer stays empty for 150 ms before it may speak. In play it mounts with the ready screen, long before the pattern opens; the wait matters only after a reload mid-window.
- **The visible stage:** the same one symbol in the same slot, now `aria-hidden="true"` and not live, so nothing is heard twice.
- **Unchanged:** the one-symbol constraint, the server window and scoring.

**The transition regression** (`scripts/check-pattern-pulse.mjs`):
- On the ready screen, before the pattern opens, the driver finds the announcer and checks that it is the only one, assertive and atomic, and empty. It then marks the node.
- A MutationObserver records every change of the announcer's text, with what the visible stage showed at that moment.
- At recall, for each round, the driver checks:
  - it is the same node (identity and mark);
  - the first change is the first cue;
  - each cue is said once, in order, with its place, while the stage shows that same symbol;
  - it is empty in the gaps and empty at recall.
- This is done for all 13 rounds opened through the UI in a game: Keku's and Amina's round 1 (full motion and reduced motion) on their own, and 11 more.
- Repeats: the server never puts a symbol twice in a row (`pulsePattern`). A symbol that comes back later is checked to be said again with its own place.

| Run | Build | Result |
|---|---|---|
| `runs/pp-announcer-before-b936586.log` | the web build of `b936586` (the reviewed build), driven by the new driver | **FAIL (exit 1)**, as expected. 8 announcer checks fail: no announcer before the pattern opens, and the stage was the live region. Every other check passes. |
| `runs/check-pattern-pulse-6750b99.log` | `6750b99`, from the full gate below | **62 PASS, 0 FAIL** (exit 0) |

**On the tested commit** (the full gate's step 42):
- **Keku's round 1, full motion:** it is the same node, mounted empty. It said, in order: "1 of 3: Pink star", "", "2 of 3: Green triangle", "", "3 of 3: Blue diamond", "". Each cue came with the matching visible symbol, and it was empty at recall.
- **Amina's round 1, reduced motion:** the same: "1 of 3: Blue diamond", "", "2 of 3: Pink star", "", "3 of 3: Green triangle", "".
- **All 13 rounds** (lengths 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8): one node from the ready screen to recall in each, every gap seen (3/3 … 8/8), and the first cue "1 of N: …" said from empty. The last cue was followed by empty before recall.
- **Recurring symbols:** 17 recurrences in 9 rounds, each said again with its own place. Example: "1 of 3: Blue diamond", "", "2 of 3: Pink star", "", "3 of 3: Blue diamond", "".

**Unit tests** (`MchezoPulse.test.tsx`, 14):
- `pulseCueSay` per slot and gap: the first cue at the window's start, the last cleared before recall, and nothing before a round opens;
- a hypothetical repeat in a row (the server never sends one), which is still said twice after an empty gap;
- the announcer's place (last, after `<main>`), its attributes and its empty mount on the ready, memorising (slot and gap), recall and finished screens;
- exactly one assertive region on each.

The node identity across screens needs a DOM; the browser regression above checks it.

**Cadence:** not changed, and not measured with assistive technology.
- **The timing:** each symbol is on screen and in the announcer for 0.68–0.88 s, in a 0.85–1.1 s slot.
- **The arithmetic:** "2 of 5: Yellow square" is five words, so at an illustrative 180–300 words a minute it takes 1.0–1.7 s to speak. At many speech rates, therefore, the next assertive cue arrives before the last has finished. Whether a screen reader cuts it off or queues it can only be observed on the native devices.
- **Options for a decision after that observation** (D-AV-05; none applied):
  - shorter words;
  - a polite region (queued, but trailing the symbol);
  - a per-player slower-cue option. That changes the memorise window the score depends on, so it is the owner's call.

## Gates on `6750b99`
| Run | Result | Record |
|---|---|---|
| Targeted gate (pattern-pulse, pulse-timing, solo-shelf, mobile-everyday, action-ack), run `20261119-135219-6750b998-24214` | **PASSED (exit 0)**, 7/7 | `gates/targeted-6750b99-PASSED-summary.txt` |
| Full gate on `6750b99810819f1630fa356d0d49b2d631fb5b56`, run `20261119-135611-6750b998-25340`, clean tree, Node v22.23.4, headless Chromium | **PASSED (exit 0)**, 113/113 | `gates/full-6750b99-PASSED-summary.txt` |

- **Its unit-test step:** 169 files, 2127 tests passed. Lint and both typechecks passed.
- **Drivers:** `check-pattern-pulse` 62/62 and `check-spectrum` 203/203; both logs are in `runs/`. `check-solo-shelf` 58/58 and `check-pulse-timing` 41/41.
- **H2's code is unchanged since `b936586`.**

## Limits
- **Not a screen-reader test.** The announcer is checked in the page: one node, in place and empty before the pattern opens, with its text, attributes and every change of it. What VoiceOver or TalkBack actually speak, and when, is **unverified**.
  - **The cadence:** each cue is up for 0.68–0.88 s, which is likely shorter than speaking it (see the cadence note above).
  - **Where to measure:** the native-device retest. Whether to change anything is decided after that (D-AV-05).
- **Headless Chromium on one Linux machine;** native phones are untested.
- **The player's own projection still carries the round's pattern** during the memorise window, as it always has (the phone needs it to present the cue). The criterion is about rendered and announced text and accessible names.
- **H2's audit observation is not reproduced** as a leak by these checks. Its exact steps were not available here.
