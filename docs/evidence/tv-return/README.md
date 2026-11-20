# Getting back from the TV view on a phone: evidence (handoff 7044277833, D-TV-01)

- **The handoff:** [7044277833](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7044277833), acknowledged in [7044287517](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7044287517). The decision is D-TV-01 in `docs/DECISIONS.md`.
- **Draft PR:** #58, stacked on #57 (exact base `640d2ee779d0da339d3714501739f2af76fae6c0`).
- **The fix commit, and the tested SHA:** `6ac91f63f8e3a64fd78af6315063d4e72a455769`. This folder was added afterwards, in a docs-only commit.
- **Synthetic local data only.** Chromium phone emulation with touch, not real phones.

## The defect on `640d2ee`
- **What fails:** in a casual Trivia game's TV stage on a phone, an ordinary tap or click on **Back to phone view** times out, because the TV picture takes the event. The keyboard (focus + Enter) still works.
- **The cause:**
  - The director bar is styled for a spot inside the 1920×1080 picture, but it was rendered outside it and placed against the page.
  - On a phone it floated over the picture and spilled the page sideways to about 788 px.
  - The browser widened its layout viewport (zooming out), and the tap landed on `.mz-tv-outer` / `.mz-tv`.
- **The probe:** `probe-640d2ee.jsonl` has one line per route, size and method. It records the control's box, the element at its centre, the page width against the layout viewport, the zoom, and the outcome of `click()` and `tap()`:

| Route on `640d2ee` | 320×568 | 375×667 | 390×844 | 1280×800 |
|---|---|---|---|---|
| Trivia TV stage, playing | **tap and click time out** (`.mz-tv-outer` intercepts) | **time out** (`.mz-tv` intercepts) | **time out** | works |
| Trivia TV stage, results | **time out** | **time out** | **time out** | works |
| TV show (lobby; Math live) | works, but the target is **34×9 px** | **40×10 px** | **42×11 px** | 136×35 px, in the picture by design |
| Briefing TV | works (167×46) | works | works | works |

## The fix (D-TV-01)
- **A shared control layer outside the scaled picture:** `TVStage`'s `controls`, `TVControls` and `.mz-tv-controls`.
- **On a phone:** the picture's box is its own 16:9 height, and the way back comes first, right under it at 191×48 px, with the other controls wrapping below.
- **On TVs and desktops:** the full-screen picture is kept. Trivia's controls take the spare band under the picture, and the TV show keeps its director inside the picture.
- **Changed files:**
  - `apps/web/src/ui/mchezo/components/tv/tv.tsx`
  - `apps/web/src/ui/mchezo/styles/mchezo.css`
  - `apps/web/src/components/mchezo/MchezoTv.tsx`
  - `apps/web/src/components/mchezo/TvShow.tsx`

## The regression: `scripts/check-tv-return.mjs` (218 checks)
**How it activates:**
- Only Playwright's own `tap()` and `click()`, with no force, no dispatch and no devtools. The keyboard is checked separately.
- Phones are emulated with touch at 320×568, 375×667 and 390×844, in the Everyday and the Christmas look.

**What it checks:**
- **Routes:**
  - V: the TV show before a game.
  - B: the briefing TV.
  - T: Trivia while playing, by tap and by click.
  - R: Trivia at its results.
  - M: Math Mayhem live on the TV show.
- **On every route:**
  - The way back is on the first screen, not covered, and at least 44×44.
  - The page has no sideways overflow and is not zoomed out.
  - No control overlaps the picture or another control.
  - After a normal scroll, an ordinary tap returns.
- **On return:** the same room, seat, game and question come back, and the server's state is unchanged.
- **K (keyboard):** Tab reaches the way back, and Enter returns.
- **S (Stay and auto-advance):**
  - With Stay, the next answer after the TV stage is still stayed and holds past the reading time.
  - Without Stay, the next question opens by itself.
- **D (desktop and TV, 1280×800 and 1920×1080):**
  - Trivia's picture keeps its full size, no control overlaps it, and a click returns.
  - The TV show's picture fills the screen, with its director inside.

**Results:**

| Run | Result | Log |
|---|---|---|
| `640d2ee` (negative control: its own worktree and web build) | **59 FAIL**, 158 PASS. It includes the reported interception on T at all three sizes in both looks, and on R, S1 and S2. The TV show's way back is 34×9 to 42×11, and on desktop the director overlaps the picture | `before-640d2ee-check-tv-return.log` |
| `6ac91f6`, development build | 218/218 PASS | `after-dev-6ac91f6-check-tv-return.log` |

## The gates on `6ac91f6`
Each verdict belongs to its own run.

| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `tv-return`, `tv-entry`, `tv-show`, `tv-moments`, `tv-spectator`, `tv-lifecycle`, `tv-reveal`, `quiz-advance`, `warm-ivory`, `reveal`, `mchezo`, `audit-fixes`, `one-path`, `family-questions`, `answer-reveal`, `leaderboard`, `stage2` | **`PASSED (exit 0)`**, 19/19 (`check-tv-return` 218 checks in 70 s) | `20261120-164146-6ac91f63-31692` | `gate-6ac91f6-targeted.txt`, `after-gate-6ac91f6-targeted-check-tv-return.log` |
| **Full**: typecheck, lint, unit tests, build and every driver | **`PASSED (exit 0)`**, 118/118 (`check-tv-return` 218 checks in 70.3 s) | `20261120-165227-6ac91f63-2592` | `gate-6ac91f6-full.txt`, `after-gate-6ac91f6-full-check-tv-return.log` |

- Also on `6ac91f6`, before the gates: the unit suite (2173 tests, 173 files), typecheck and `eslint .` were all clean.

## Screenshots (`before/` on `640d2ee`, `after/` on `6ac91f6`)
- **`everyday-320x568-trivia-playing.png`, `everyday-375x667-…`, `christmas-390x844-…`:** the TV stage while playing.
  - Before, the page is zoomed out, the director's chips float over the picture's box, and the way back is off to the side.
  - After, the picture is at the top, Back to phone view is right under it, and the director wraps below.
- **`everyday-320x568-trivia-results.png`, `christmas-390x844-trivia-results.png`:** the same at the results, with the question chips.
- **`everyday-320x568-tvshow.png`, `christmas-320x568-tvshow-math.png`:** the TV show. Before, the way back is a 34×9 px chip inside the picture; after, it is a full-size button under the picture.
- **`christmas-1280x800-trivia-results.png`:** desktop. Before, the director floats over the picture; after, the controls sit in the band under the 1280×720 picture.
- **`tv-1920x1080-tvshow.png`:** a TV. It is unchanged: the full-screen picture with its director inside.

## Limitations
- Chromium emulation with synthetic data only. Real iPhone and Android devices are a separate check, and H3's native iPhone confirmation also remains open.
- On an exactly 16:9 screen, Trivia's TV stage keeps the full-screen picture, so its controls are one scroll below it. Before, they floated over the picture.
- **Briefing TV at 320 px (seen during the trace, not changed):** its rules card is 15 px wider than the screen and is clipped at the right edge. It is not a control, and it is outside this slice.
- The broader crowded-layout redesign is not attempted here; it needs owner-selected options first.
