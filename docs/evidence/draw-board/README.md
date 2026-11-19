# Draw & Guess drawing board on phones: H3 evidence (handoff 7020760499)

**What this is:** Claude's developer-run checks on this session's machine, in **Chromium phone emulation**. It is **not a native iPhone test**: no iPhone, Safari or iOS in-app browser was available. This evidence cannot clear H3; the native checks below can.
- **The report:** a nearly black **drawer** screen in an iPhone in-app browser, while the timer stayed visible. Its cause on that device is **not established**.
- **The decision:** D-H3-01 in `docs/DECISIONS.md`.
- **The base:** #53's cleared head `6897765ee6c33eab6d0ce508ad2be8ec27cd93d1`. **The tested commit:** `9d2eda5a9cf7ef817a2bee854829573394de72db`. This folder and the PROGRESS entry were added after it, in a docs-only commit.

## The trace (`scripts/check-draw-board.mjs`)
**The setup:**
- A synthetic private room with three phones: 320×568, 375×667 and 390×844, each mobile with touch and 2× pixels. Each phone is the drawer once.
- An isolated server at time scale 0.5.

**For each drawer, it records:**
- **Mounts and opacity:** the screen's mounts and its opacity every 100 ms through the turn.
- **The board SVG:** its box; whether it is in view; what is painted at its centre (`elementFromPoint`); its paper fill; and the computed display, visibility, opacity, transform and filter of it and every ancestor.
- **Brightness:** the screenshot's mean brightness at the board's centre and across the whole screen.
- **Touch:** a finger stroke (CDP touch events: Chromium's emulation of touch, not a native touch screen), on the drawer's board, the server and every guesser's board.
- **A reload mid-turn** (turn 1), and **the next drawer** (give up → reveal → the next turn).

It runs with a WebSocket, and with `DG_NO_WS=1` without one, where the app falls back to HTTP polls. That is a stand-in for an in-app browser that blocks WebSockets.

**What it found:** everything above renders and works.
- **The drawer's board:** always in view and painted, with the paper fill at its centre and opacity 1 up the ancestor chain. Its centre measures about 240–253 of 255 in brightness.
- **Strokes:** on every board.
- **The screen:** mounted once, never dimmed.
- **Reload and next drawer:** both fine.

**The one way it reproduces the reported picture:**
- **The layout:** the game clock is rendered *above* the screen, outside it, while every screen fades in from opacity 0 (`mz-enter`, fill mode `both`).
- **The stall:** the driver holds that entry animation at its first frame after a reload, as a suspended or throttled web view can leave it. The drawer's screen then stays at opacity 0: the whole screen measures **19 of 255**, while the clock still shows. A guesser's screen does the same.

| Build | Run | Result |
|---|---|---|
| `6897765` (#53, before the fix) | `runs/check-draw-board-before-6897765.log` | **FAIL (exit 1)** on exactly the two stalled-entry checks (drawer and guesser: opacity 0, brightness 19, the clock visible). Every other check passes. |
| `9d2eda5`, from the full gate below | `runs/check-draw-board-9d2eda5.log` | **27 PASS, 0 FAIL** (exit 0), the two stalled-entry checks included (opacity 1, board brightness 244). |
| The fix, dev build, `DG_NO_WS=1` (no WebSocket) | `runs/check-draw-board-nows-dev.log` | **ALL PASSED** (exit 0). The web code and the driver are the tested commit's; it was a dev run, outside the gate. |

**Screenshots** (`screenshots/`):

| File | What it shows |
|---|---|
| `before-stalled-drawer-320x568.png` | `6897765`, entry held at its first frame: the drawer's screen is dark, and only "Time left for this round" shows. |
| `after-stalled-drawer-320x568.png` | The fix, entry held the same way: the whole drawer screen, with the word, the board and its stroke, the palette and the tools. |
| `after-drawer-320x568.png`, `after-drawer-375x667.png`, `after-drawer-390x844.png` | The fix: each phone size's first drawer render. |

## The fix (D-H3-01)
- **The change:** the drawing, guessing and reveal screens carry `mz-dg-screen`, which turns the entry animation off in every motion setting. They are visible from their first frame, whatever a web view does with animations.
- **Unchanged:** the board, the word only on the drawer's phone, turn ownership, stroke limits and scoring.
- **`MchezoDraw.test.tsx`:** pins the class on the three screens and the stylesheet rule. It also checks that the drawer alone sees the word, and that every board carries the paper fill and the drawing.

## Gates
| Run | Revision | Result | Record |
|---|---|---|---|
| Targeted gate (draw-board, draw-guess, draw-sync, team-draw), run `20261119-202306-4a25bbcd-6172` | `4a25bbc` | **FAILED (exit 1)**, 5/6: `check-draw-board`'s own reload check compared with a server signature captured mid-stroke. Fixed driver-only in `9d2eda5` (it waits until the drawer has nothing unsent). | `gates/targeted-4a25bbc-FAILED-summary.txt`, `gates/targeted-4a25bbc-check-draw-board.log` |
| Targeted gate, the same drivers, run `20261119-202708-9d2eda5a-7629` | `9d2eda5` | **PASSED (exit 0)**, 6/6 | `gates/targeted-9d2eda5-PASSED-summary.txt` |
| **Full gate**, run `20261119-202837-9d2eda5a-8435`, clean tree, Node v22.23.4, headless Chromium | **`9d2eda5a9cf7ef817a2bee854829573394de72db`** | **PASSED (exit 0)**, 114/114 | `gates/full-9d2eda5-PASSED-summary.txt` |

- **The full gate's unit-test step:** 170 files and 2132 tests passed. Lint and both typechecks passed.
- **Its drivers:** `check-draw-board` 27/27, `check-draw-guess` 61/61, `check-draw-sync` 62/62, `check-team-draw` 45/45.
- **Redaction:** this session's scratch paths are replaced with `<scratchpad>`.

## Native evidence still needed (cannot be produced here)
Run the exact candidate on a private preview, with at least three phones or two phones and a TV, with an **iPhone** in the room. Record for each item: pass or fail, a screenshot, and the time.
1. **The device:** iPhone model, iOS version (Settings → General → About), and the browser. Safari's version is the iOS version.
2. **Safari, the iPhone as the drawer:**
   - **First drawer render:** a screenshot within about 2 s of its turn starting. Are the board (light paper), the word and the clock visible?
   - **The suspected trigger:** lock the phone or switch apps while waiting for the turn. Come back after the turn has started, and repeat the first-render check.
   - **Touch drawing:** draw three strokes. Do they appear on the iPhone at once, and on another phone within about 1 s?
   - **Reload** mid-turn: are the board, the word and the strokes back?
3. **Safari, the iPhone as a guesser:** the drawer's strokes appear on its board, and then the next drawer's turn.
4. **The next drawer:** through the reveal into the next turn, as a guesser and as the drawer.
5. **The in-app browser, recorded separately:** open the room link from the app the audit used (name it and its version) and repeat 2–4.
6. **Optional controls:**
   - iOS Settings → Accessibility → Motion → Reduce Motion on, and repeat 2.
   - On the old build `6897765` (or the live beta), the in-app "Animations Off" setting is a workaround to confirm the mechanism: it removes every entry animation.

## Limits
- **Chromium only:** Chromium phone emulation on one Linux machine. WebKit (Safari's engine) was not available, and a native iPhone was not either.
- **The stalled entry is simulated:** the driver pauses the animation. Whether an iPhone web view actually held it, and why, is not established. The fix removes the dependency for Draw & Guess either way.
- **Other screens still fade in from opacity 0:** every other screen, Team Draw's drawing screen included, still does, out of this slice's scope (D-H3-01).
- **This is developer-run evidence,** not independent testing.
