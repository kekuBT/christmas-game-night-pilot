# Stage 11.1 screenshots: Warm Ivory, before and after

**Source:** `scripts/check-warm-ivory.mjs`, desktop Chromium (chrome-headless-shell).
- **Phones:** 320×640 and 390×844. **Desktop:** 1280×800. **TV:** 1920×1080.
- **Motion:** Animations Off and reduced motion, so nothing is caught mid-transition.
- **Room:** Keku (host), Amina and Baraka, in a casual room.

**Which build:**
- **`before-…`** is the base build `d4dc408`. It was taken by the driver's `--record-everyday` run, which also recorded the Everyday baseline.
- **`after-…`** is this stage's build. It was taken by a passing local run of the driver on `b7ef25a`.

The room content, questions and room codes differ from shot to shot. Only the look is being compared.

## Christmas: green before, Warm Ivory after
| Screen | Before | After |
|---|---|---|
| Home, 390 px | `before-christmas-home-390.png` | `after-christmas-home-390.png` |
| Lobby, 390 px | `before-christmas-lobby-390.png` | `after-christmas-lobby-390.png` |
| A live quiz question, 390 px | `before-christmas-question-390.png` | `after-christmas-question-390.png` |
| Results with What's next and the answer review, 390 px | `before-christmas-results-390.png` | `after-christmas-results-390.png` |
| Memory Book (one approved note, one pending), 390 px | `before-christmas-memory-390.png` | `after-christmas-memory-390.png` |
| TV question, 1920×1080 | `before-christmas-tv-question-1920.png` | `after-christmas-tv-question-1920.png` |

**Warm Ivory only:**
- 320 px: `after-christmas-lobby-320.png`, `after-christmas-question-320.png` and `after-christmas-memory-320.png`.
- The room menu with the Look choice: `after-christmas-menu-390.png`.
- The briefing: `after-christmas-briefing-390.png`.
- A locked answer: `after-christmas-locked-390.png`.
- The solo shelf: `after-christmas-solo-390.png`.
- Results on a desktop: `after-christmas-results-1280.png`.
- The TV reveal: `after-christmas-tv-results-1920.png`.

**What to look for:**
- the ivory page and cream cards with hairlines;
- cranberry primary keys with a deep edge;
- answers in cranberry, antique gold, pine sage and slate, with cream text and their shapes;
- in the review, unchosen answers as readable cream cards rather than faded colour;
- the game kicker ("TRIVIA SHOWDOWN · CASUAL") readable on cream;
- the jebena disc on its card;
- the wreath ring in cranberry, sage and gold.

## Everyday: unchanged
| Screen | Before | After |
|---|---|---|
| Home, 390 px | `before-everyday-home-390.png` | `after-everyday-home-390.png` |
| Lobby, 390 px | `before-everyday-lobby-390.png` | `after-everyday-lobby-390.png` |
| Question, 390 px | `before-everyday-question-390.png` | `after-everyday-question-390.png` |
| TV question, 1920×1080 | `before-everyday-tv-question-1920.png` | `after-everyday-tv-question-1920.png` |

**Proof that Everyday is unchanged:** these pairs are for people to look at. The evidence is check W8.
- It compares the computed colours of every element kind on 22 Everyday screens with the base build's, and they're identical.
- The base build matched its own recording on a second run, so the comparison is deterministic.

## Not shown
- **Real devices:** iPhone Safari, Android Chrome and real TV panels weren't tested.
- **Colour blindness:** no colour-blindness simulation was run. Answers still carry their letter and shape.
