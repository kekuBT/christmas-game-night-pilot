# Stage 5 (S5-F): quality audit of every game

**What this covers:** each of the 14 games, against the Stage 5 bar:
- a send that fails says so and keeps what was entered;
- reconnect and Back/Forward return to the same place;
- the TV and spectators see only what the public projection allows;
- results come from the server's scores;
- contrast meets WCAG AA;
- the game finishes with nobody stuck.

**How it was checked:** Chromium only (chrome-headless-shell, emulated phone sizes 320–430 and TVs 1280–1920), through the drivers named below, and by code reading.
- An independent read-only review covered the three new game modules and their engine glue (findings below).
- **No real iPhone, Android phone or TV was used.**

## Per game

| Game | Failed send | Reconnect / Back | TV and privacy | Status |
|---|---|---|---|---|
| Trivia Showdown | ✓ `check-send-failures` (S5-P) | ✓ `check-f5`, `check-ws-reconnect` | ✓ answer only after lock (E3); `check-tv-show` | OK |
| Math Mayhem | ✓ `check-send-failures` | ✓ `check-math-timing`, `check-f5` | ✓ counts, never answers (`check-tv-show`) | OK |
| Geography Challenge | ✓ `check-send-failures` | ✓ `check-f5` | ✓ dashboard | OK |
| Guess the Year | ✓ `check-send-failures` | ✓ `check-f5` | ✓ dashboard | OK |
| Closest Wins | ✓ `check-send-failures` | ✓ `check-f5` | ✓ no guesses while open (`check-tv-show`) | OK |
| Word Connections | ✓ `check-send-failures` (keeps the four tiles) | ✓ `check-f5` | ✓ no categories while playing | OK |
| Caption Clash | ✓ Stage 4 (`check-caption-4p`) | ✓ `check-caption-4p` | ✓ authors hidden until the reveal | OK |
| Category Sprint | ✓ the line beside the game (S5-F, same panel as Impostor); text kept | ✓ `check-f5` | ✓ dashboard | OK; B-3 |
| Who Said That? | ✓ the line beside the game (S5-F, same panel) | ✓ `check-f5` | ✓ dashboard | OK; B-3 |
| Impostor | ✓ `check-send-failures` (S5-F): the clue stays in the box | ✓ `check-f5` | ✓ words and clue texts never on the TV (`check-tv-show`) | OK (Practice-only) |
| Charades | ✓ the line beside the game (S5-F, same panel) | ✓ `check-f5` | ✓ the word only on the actor's phone | OK (Practice-only); B-3 |
| Majority Rules (new) | ✓ `check-majority-rules` | ✓ reload between the two steps | ✓ counts while open; totals only, never who voted what | OK (Practice-only) |
| Pattern Pulse (new) | ✓ `check-pattern-pulse` (keeps the entry) | ✓ reload mid-round never re-shows the pattern | ✓ counts only; patterns never public | OK (Practice-only) |
| Draw & Guess (new) | ✓ `check-draw-guess` (guess text kept; unsent drawing retried) | ✓ drawer leaves and comes back | ✓ the word only on the drawer's phone; wrong guesses nowhere | OK (Practice-only) |

Contrast (WCAG AA) is checked on every screen of the three new games by their own drivers (`scripts/lib/contrast.mjs`), and on the existing views by `check-contrast`.

## Found and fixed in Stage 5

- **Library and stage drivers hard-coded "11 games"** (`check-library`, `check-library-nav`, `check-stage2`, `check-mchezo`). They now read the catalogue from `/games`, so a new game can't silently break them or be silently skipped.
- **The older game panel didn't say a send had failed beside the game** (Category Sprint, Who Said That?, Impostor, Charades). Only the app's general error line, at the top, said so. It now shows the same line as the other screens, under the game (`check-send-failures`, Impostor).
- **Draw & Guess TV layout:** the shared TV panel zoom (1.6×) pushed the drawing off the bottom of the screen and broke a long drawer name mid-word. The board is now sized to the screen; checked at 1280×720, 1440×900 and 1920×1080.
- **Draw & Guess privacy checks:** the driver first matched words inside other words ("hat" in "What is it?"), a false alarm. It now matches whole words, so a real leak would still fail it.

## Independent review of the new games (S5-F)

A separate read-only review of the three modules and the engine glue reproduced each finding with a script before reporting it. It found no high-severity issue. Scoring, finishing exactly once, deadline order and input checks all held. What it found, and what was done:

| # | Finding | Severity | Done |
|---|---|---|---|
| R1 | Majority Rules: the public participation counted predictions **plus votes**, so "actions − done" gave each player's vote count. In a 1–1 room that tells who voted what. A tied round also listed every predictor, which shows who skipped. | medium-low | **Fixed.** Participation counts predictions only, and a split room names nobody. Each phone still shows its own +50. Unit test plus driver checks. |
| R2 | Draw & Guess: the public view said "the drawer passed" and carried a skip count. With two guessers that names who sat out, against L33. | medium-low | **Fixed.** Neither is public; a pass reads like any turn nobody got. Your own phone still knows you skipped. |
| R3 | Draw & Guess: anyone who knows the word list could try every word with the same letter pattern (13 at most) inside the guess cap. | low-medium | **Reduced.** The cap is now 12 guesses a turn. The list is server-side only, never sent to a phone. The rest is backlog B-4. |
| R4 | Draw & Guess: the drawer could change the word after drawing and clearing, once guessers had seen a drawing. | low | **Fixed.** No swap once anything was drawn (even if cleared) or anyone guessed. |
| R5 | Pattern Pulse: a player whose six windows all ran out was "finished", which counts as taking part. | low (Practice-only) | **Fixed.** "Finished" now needs at least one answer. |
| R6 | The intent replay store (`seenIntents`) grew without bound, and the room file is rewritten on every intent. One 6-player Draw game reached about 8,700 entries, 1.5 MB. | low (pre-existing; Draw makes it grow faster) | **Fixed.** It keeps the latest 4,000, oldest first; a retry comes seconds later. Unit test: the cap holds, a recent replay returns the very same result, and a reload stays within it. |


## Backlog (larger changes, not made in Stage 5)

- **B-1 The room file is still rewritten on every intent.** The replay store is now capped (R6), so the file stays bounded, but a busy Draw & Guess turn still writes it a few times a second. Batching writes, or not storing rejected intents, would cut that.
- **B-2 Unsent entries are lost on a reload:** a Pattern Pulse entry not yet locked in, and a Draw & Guess stroke not yet sent. The server's state is never wrong; the player re-enters. Could keep them in session storage.
- **B-3 The older game panel has no "Sending…" state.** It serves Category Sprint, Who Said That?, Impostor and Charades.
  - Since S5-F a failed send is said beside the game, in the same words as the other screens, and typed text stays in its box. This is tested on Impostor's clue.
  - The panel still has no "Sending…" state on its buttons.
  - Category Sprint, Who Said That? and Charades are not tested by a forced failure. They use the same panel and the same line.
  - Moving these four onto the Mchezo screens is a larger redesign.
- **B-4 Draw & Guess fairness and moderation.**
  - There is no "close guess" hint, and nothing stops a drawer writing the word: honour system, as at a table.
  - Wrong guesses are never shown, so there is nothing to moderate.
  - Someone who has read the word list (it is server-side only) could still try every word with a given letter pattern; R3 narrowed this.
  - A minimum gap between guesses, or a hint that appears only later in the turn, would close it.
- **B-5 Bluff Battle** (S5-D) is not built; see the README.
