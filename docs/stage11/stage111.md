# Stage 11.1: the Warm Ivory Christmas look

**Instructions:** ChatGPT's handoff in comment 6847066185 on PR #22. That comment also cleared Stage 10.5 on `1c2447f`/`d4dc408` for development.

**Owner decision:** Keku chose **Option A, Warm Ivory** in comment 6845465785. This spec carries out that choice; it doesn't reopen it.

**Branch:** `claude/stage11-1-warm-ivory`, from PR #22's head `d4dc408`. It's a new stacked PR, unmerged, and linked to #22 and #5.

**Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:** one presentation milestone. The Christmas look changes from deep green slabs to:
  - a warm ivory page with clean cream and white cards;
  - dark warm text;
  - restrained cranberry for primary actions;
  - small gold and sage touches.
- **What stays:**
  - the circle-and-dots identity;
  - the wreath ring, recoloured;
  - fixed player colours;
  - answer letters and shapes.
- **Green:** green becomes an accent (success, answer C, one wreath colour), never the page or a card.
- **It isn't:**
  - new game or session mechanics, or changes to the server, scores, approvals or protocol;
  - a new dependency or service;
  - a logo or brand change;
  - a new choice of option.
- **Everyday:** looks exactly as it does now, and the default look and its persistence don't change.
- **Content stays separate:** what a session deals (Everyday or Christmas content) is unchanged, and so is the Family Cup choice.

## 2. Where colour comes from today
- **The one source:** `apps/web/src/ui/mchezo/tokens/tokens.ts`. It defines `MchezoTheme.color` for `everyday` and `christmas`.
  - `<MchezoProvider>` writes it as `--mz-*` variables on `.mz-root`.
  - `look.ts` `applyDocumentLook` writes the same variables, and the legacy `--bg`/`--panel`/… set, on `<html>`. It also sets `theme-color`.
- **Generated copy:** `tokens.css` is a generated copy for non-React surfaces. It's regenerated from `tokens.ts` by a new script, `scripts/gen-tokens-css.mjs`, never edited by hand.
  - A unit test fails if the generated file and `tokens.ts` disagree.
- **Two dark looks today:** both themes are dark, and the CSS relies on that in four ways. The inventory follows (§3).

## 3. Inventory: dark-look assumptions that break on a light ground
| # | Where | Assumption | Fix |
|---|---|---|---|
| A1 | `tokens.ts` `onAccent` | One foreground for every coloured fill. That includes the **fixed** player colours (`.mz-token`) and the **fixed** game cover accents (`.mz-hero-card`, `.mz-solo-results__pb.is-new`). These are light pastels that need dark text in every look. | A new semantic token **`onBright`** (`--mz-on-bright`): the text on colours that never change with the look. It's `#16111D` in both looks. `onAccent` stays the text on the look's own accents and becomes cream on Warm Ivory. Everyday's `onBright` equals its `onAccent`, so nothing there changes. |
| A2 | game accent as text: `.mz-rhero__kicker`, `.mz-upnext-card__kicker` | A bright game accent (e.g. `#FFC94A`) reads on a dark card; on cream it is about 1.3:1. | On a light look, these kickers mix the game accent into the text colour (`color-mix`, 35% accent) so the hue stays and the text passes 4.5:1 on both card colours (tested for every cover accent). Everyday keeps the pure accent. |
| A3 | Containers with no border (`.mz-card`, `.mz-standings__row`, `.mz-cup__seg`, `.mz-switch-row`, `.mz-lib-filters`, TV rows and pills, the Memory Book cards) | A lighter surface on a dark ground shows the card's edge. Cream on ivory doesn't. | On a light look, cards get a hairline (`--mz-line` at 35%) and a soft warm shadow. |
| A4 | Heavy black shadows (`rgba(0,0,0,.35–.5)` on banners, sheets and chosen options) | Black glows suit a dark ground; on ivory they read as dirt. | On a light look, they're replaced by warm, lighter shadows. |
| A5 | `.mz-key--neutral` edge `#9C93A8` | A lavender edge under a cream key. | On a light look the neutral key (dark-brown fill) gets a near-black edge. |
| A6 | `html { color-scheme: dark }` (index.css) | Form controls, scrollbars and autofill are drawn dark. | `applyDocumentLook` and the provider set `color-scheme` from the look's tone. |
| A7 | Legacy `.err` `#FFB3B3`, `.ok` `#A8E6C5`, `.dot.on` (index.css; the older game panels and reactions) | Pastel text for a dark ground; about 1.4:1 on ivory. | On a light look they take `--mz-danger` and `--mz-success`. |
| A8 | Jebena pot disc `#F7F1E8` (`MchezoJebena.tsx`), the cini cups | A cream disc reads on dark green; on ivory it disappears. | On a light look the disc takes the card colour with a visible line ring. Cups already have a dark outline, so they're kept. |
| A9 | `.mz-conn--restored` dot `#5ED39B`, the TV stale/restored banners | Fixed colours. | The dot follows `--mz-success` on a light look. The TV banners already carry their own dark-on-gold and white-on-teal text, so they're kept. |
| A10 | Memory Book PDF (`jsPDF`, black on white) and share image (painted from the look's tokens) | The share image follows the tokens automatically. The PDF has no look. | Christmas PDFs get the ivory page, a cranberry title and dark warm text. Everyday PDFs are unchanged. The words and which notes are included don't change. |

**Unchanged on purpose, because they draw their own fixed colours and read on any ground:**
- Pattern Pulse pads (with their names and shapes);
- the Draw & Guess board and palette;
- game cover art;
- player colours;
- the invite QR's white plate.

## 4. The Warm Ivory palette (roles)
| Role (token) | Everyday (unchanged) | Christmas until now | **Warm Ivory** |
|---|---|---|---|
| Page (`ground`) | `#16111D` | `#0E1A16` | `#F7F1E6` warm ivory |
| Card (`surface1`) | `#211A2B` | `#16261F` | `#FFFCF6` cream white |
| Inset / chosen (`surface2`) | `#2D2539` | `#20352B` | `#EFE6D6` deeper cream |
| Lines, borders (`line`) | `#7A6E8E` | `#5E8A74` | `#8C7A66` warm taupe |
| Text (`text`) | `#F7F1E8` | `#F7F1E8` | `#2B211C` dark warm brown |
| Muted text (`textMuted`) | `#C7BED2` | `#BFD0C5` | `#66564A` |
| On the look's accents (`onAccent`) | `#16111D` | `#16111D` | `#FFFDF8` cream |
| **On fixed bright colours (`onBright`, new)** | `#16111D` | (was `onAccent`) | `#16111D` |
| Primary (`brand`) | `#FF6B4A` | `#F2545B` | `#A3253A` cranberry |
| Key edge (`brandDeep`) | `#B8432A` | `#A33238` | `#6E1626` |
| Answers A–D (`answer`) | coral, sun, mint, iris | red, gold, mint, sky | cranberry `#A3253A`, antique gold `#8A5E12`, pine sage `#2F6A4F`, slate `#3B5A8A` |
| Answer edges (`answerDeep`) | … | … | `#6E1626`, `#5E3F0A`, `#1D4634`, `#263C5E` |
| Success (`success`) | `#3CCFB4` | `#7FD6A8` | `#2F6A4F` pine sage |
| Highlight, focus ring (`highlight`) | `#FFC94A` | `#F2C14E` | `#8A5E12` antique gold |
| TV glow (`spotlight`) | iris 18% | gold 16% | `rgba(201,162,74,.18)` soft gold |
| Errors (`danger`) | `#FF8A7A` | `#FF8A7A` | `#B3261E` |
| Wreath ring (decoration only) | — | red, mint, deep green | cranberry `#A3253A`, sage `#7FA88C`, gold `#C9A24A` |
| **Tone (new)** | `dark` | `dark` | `light` |

**Contrast:** every pair below is checked by the pure test, `tests/stage111-warm-ivory.test.ts`.
- **Text on the page and on both card colours, at least 4.5:1:** text 12.7–15.3; muted 5.7–6.9; success 5.2–6.2; highlight 4.6–5.6; danger 5.3–6.4; brand 5.9–7.1.
- **Cream on each accent fill (answers, brand, highlight, success, danger), at least 4.5:1:** 5.6–7.2.
- **Fixed dark text on every player colour and game accent, at least 4.5:1:** 6.6–14.3.
- **Things that mean something on the page and cards, at least 3:1:**
  - borders (`line`) 3.3–4.0;
  - the focus ring (`highlight`) 4.6–5.6;
  - the primary border 5.9–7.1;
  - answer slabs against the page 5.1–6.5.

**Why accents are dark (D-S111-02):** on Warm Ivory each accent is dark enough to be both text on cream and a fill under cream text. The existing CSS uses every accent both ways (`highlight` is a kicker colour, a focus ring and a badge fill). So one colour per role keeps every existing rule correct, with no second set of text tokens.

## 5. Consumers, and what each shows on Warm Ivory
- **Home and join:**
  - ivory page, wordmark in dark text;
  - the wreath ring in cranberry, sage and gold;
  - cream cards with hairlines;
  - the cranberry primary key with a deep cranberry edge;
  - the code tiles in cream with taupe lines.
- **Lobby and Quick Party:**
  - the circle and seats: player tokens keep their colours, with dark text (`onBright`);
  - the cream centre disc;
  - mode and content badges;
  - Quick Party rows;
  - the dock on ivory.
- **Briefing and the shared game shell:** kickers, rules card, timer ring, answer slabs in cranberry, gold, sage and slate with cream text and their shapes, locked and waiting cards, the reveal and the result card.
- **Games that draw their own colours:**
  - **Pattern Pulse:** fixed pads, named and shaped, on a cream card.
  - **Jebena Rush:** pot disc on the card colour; cini cups unchanged.
  - **Spectrum:** dial track and marker in the look's tokens.
  - **Draw & Guess:** fixed board.
  - **Connections:** level bands in answer colours with cream text.
- **Results:** results hero (game kicker readable), standings rows, What's next, Save a memory.
- **Menus:** host tools, settings sheet (the backdrop stays dark for focus), invite sheet, confirmations, connection and room notices.
- **TV:** the ivory stage with a soft gold glow, cream rows and pills, the lead row in antique gold with cream text, answer slabs and bars, director controls.
- **Memory Book:** cream entry cards, approved and pending badges, Approve and Revoke, the Markdown view, the export status, and the error text in `danger`.
  - The share image is painted with the look's tokens: ivory, an antique-gold title and dark text.
  - The PDF follows §3 A10.

## 6. Validation
- **Pure (`tests/stage111-warm-ivory.test.ts`):**
  - every pair in §4;
  - Everyday's tokens equal the values above, byte for byte;
  - `onBright` is dark on every fixed player and cover colour;
  - `tokens.css` matches `tokens.ts`;
  - `tone` is `light` only for Warm Ivory.
  - The existing contrast tests in `tests/stage82-look.test.ts` keep running on both looks unchanged.
- **Browser (`scripts/check-warm-ivory.mjs`, new, in the gate):**
  1. **Rendered contrast on Warm Ivory.** Every visible text element on these screens, against its painted background:
     - home, the solo shelf and a solo round;
     - the casual lobby with Quick Party, the briefing, a live quiz with answer slabs, locked and waiting, results with What's next;
     - the settings and invite sheets, the host tools;
     - the TV;
     - the Memory Book with a pending and an approved note.
     - Normal text needs at least 4.5:1, large text at least 3:1. Disabled controls are reported but exempt.
  2. **Controls and focus at least 3:1** against the surface behind them: input borders, choice outlines, keys, the focus ring after Tab, approval badges. The disabled key must look different from the enabled one (its fill differs).
  3. **No dark-green slabs:** the page and every card's background are light, with luminance above 0.6, on every screen in step 1.
  4. **No clipped labels** at 320 and 390 px, and every touch target at least 44 px. The existing viewport rules are re-run on Warm Ivory.
  5. **The theme switch keeps the session:** with a Memory Book draft typed and a game running, switching the look from Christmas to Everyday and back keeps the draft and the game's state.
  6. **Memory Book:**
     - live freshness still works on Warm Ivory (another page's add appears);
     - revoke takes the Markdown down;
     - a fresh export leaves out the revoked note;
     - the PDF bytes carry the ivory page fill and cranberry title on Christmas, and none on Everyday;
     - the share image's top-left pixel is ivory on Christmas.
  7. **Everyday unchanged:** the same Everyday screens are rendered on the base build (`d4dc408`) and on this build. Every element's computed colour, background, border colour, outline and shadow are compared, and must be identical.
  8. **Reduced motion:** the Warm Ivory screens render with motion reduced, and nothing animates.
- **Kept:**
  - `check-contrast`, `check-themes-seasonal`, `check-mobile`, `check-viewports`, `check-reduced-motion`;
  - `check-book-live`, `check-cup-memory`, `check-spectrum`, `check-jebena-rush`, `check-pattern-pulse`, `check-tv-show`.
  - These cover game colours with shape and text, Pattern Pulse, Jebena and Spectrum.
- **Screenshots, before and after:**
  - both looks at 320 and 390 px;
  - desktop at 1280 px;
  - the TV at 1920×1080;
  - home, lobby, a game, results, the TV and the Memory Book.
  - The "before" ones come from the base build.
- **Gates:**
  - focused drivers during development;
  - fast once on the clean final SHA;
  - **one** full checkpoint gate after the final palette and consumer changes.

## 7. Limits
- **Desktop Chromium only.** Real iPhone Safari and Android Chrome colour rendering, and true TV panels, aren't tested.
- **Contrast is measured** from computed styles and painted pixels, with WCAG 2.1 ratios. That's not a perceptual or colour-blindness study. Answer colours still carry their letter and shape.
- **Seasonal decoration stays small:** the wreath ring and the 🎄 marks that already exist. No new illustrations.

## 8. Estimate
These are separate, because gates take wall time while the code doesn't change.
- **Implementation:** about 2.5–3 h.
  - tokens, tone and the generator: 30 min;
  - the light-look stylesheet and consumer fixes: 60–75 min;
  - Memory Book PDF and share: 15 min;
  - the driver, with the Everyday comparison and switch check: 45 min;
  - screenshots and docs: 20 min.
- **Gate time:** about 45 min.
  - fast: about 1 min;
  - a targeted run of the theme and Memory Book drivers: about 8 min;
  - one full checkpoint: about 34 min, from recent runs at 33–34 min; that's not a promise.
- **Calibration:** recent stages came in under estimate (Stage 10.5: estimate 6–6.5 h, actual 1 h 20 min). This one is mostly visual review, where iterations depend on what the screenshots show.

## 9. The private preview recipe
These are the steps the independent audit used. It's for audits only; it isn't a deployment.
1. **Inspect before starting:**
   - run `git status` in the existing checkout;
   - check that no gate, driver or Vite worker is running (`ps -ef | grep -E "gate|check-|vite|vitest|playwright"`);
   - don't touch another person's checkout or process.
2. **Create a detached worktree at the exact SHA:**
   ```
   git fetch origin <branch>
   git worktree add --detach /workspaces/mchezo-review-<stage> <sha>
   ```
3. **Build it:** `npm ci` (or link the existing `node_modules`), then `npm run build:web`. Log to `/tmp/mchezo<stage>-build.log`.
4. **Serve it with its own data and port:**
   ```
   PORT=31xx MCHEZO_DATA_DIR=/tmp/mchezo-audit-<stage>-data npm run serve > /tmp/mchezo<stage>-server.log 2>&1 &
   ```
   Data and port are never shared with another run.
5. **Prove what's served:**
   - `git -C <worktree> rev-parse HEAD` must equal the SHA;
   - `sha256sum apps/web/dist/index.html` must equal the hash of `curl -s localhost:31xx/ | sha256sum`.
6. **Keep the port PRIVATE** in the Codespace Ports panel. Never make it public.
7. **Sign-in recovery:** if the cloud browser lands on GitHub's sign-in page, stop and ask the owner to sign in in that same browser session. Never store, paste or work around credentials.
8. **Stop only your own server** when done (kill its PID), and leave the worktree for inspection until the stage clears.

## 10. Results (built and gated)
**Tested SHA:** `f944b3f`.

**Commits:**
- `283cfc8`: the spec.
- `9935508`: tokens, tone, `onBright`, `stage111.css`, the Christmas PDF, and the pure tests.
- `b7ef25a`: `check-warm-ivory` and the Everyday baseline.
- `2cf10bb`: screenshots and local evidence.
- `d0d9600`, `7ce8d2d` and `f944b3f`: test-script fixes found by the gates (below).

**Validation:**
- **Pure test (`tests/stage111-warm-ivory.test.ts`, 12 tests):**
  - every §4 pair;
  - Everyday's values and CSS variables exactly as at `d4dc408`;
  - `onBright` on every player and cover colour;
  - the 35% kicker mix for every cover accent;
  - `tokens.css` equal to `tokensCss()`.
- **`check-warm-ivory`:** 199 checks. Their measured values are in the gate logs. It covers:
  - 29 Warm Ivory screens: 320 and 390 px, 1280 px results and Memory Book, the TV briefing, question and results;
  - text contrast and control contrast;
  - no dark panels;
  - overflow, 44 px targets and clipped labels at 320 px;
  - nothing running with Animations Off;
  - the focus ring;
  - a disabled key against the same key enabled;
  - a look switch keeping a Memory Book draft and a running game;
  - the Christmas PDF and share image, the Everyday PDF, and a revoked note left out of a fresh PDF;
  - **W8:** the computed colours of 22 Everyday screens equal those recorded on `d4dc408`.
- **On the base build:** the same driver fails the old green look, W0 and W3 on all 29 screens and W7, while W8 still matches. The checks catch what this stage fixes.

**Gates, one after another** (raw output in `docs/evidence/gate-runs/<run>/`):

| Revision | Gate | Run | Result |
|---|---|---|---|
| `b7ef25a` | targeted (theme, contrast, viewports, Memory Book, TV and game drivers) | `20261113-080757-b7ef25a2-4720` | **FAILED**, 15/16. `check-themes-seasonal` still expected the old green toolbar colour `#0e1a16`. Fixed in `d0d9600`. |
| `d0d9600` | fast | `20261113-081635-d0d9600b-8918` | **FAILED**: 1 unit test of 1,720. The new `gen-tokens-css.mjs` wasn't in the script inventory. Fixed in `7ce8d2d`. |
| `7ce8d2d` | fast | `20261113-081939-7ce8d2d2-15554` | PASSED |
| `7ce8d2d` | full | `20261113-082053-7ce8d2d2-19001` | **FAILED**, 88/90. Two Everyday driver assumptions, unrelated to the theme: `check-leaderboard` (option A every time can score 0) and `check-tv-lifecycle` (judged the TV before it left the briefing). Both reproduced and fixed in `f944b3f`. |
| `f944b3f` | fast | `20261113-093113-f944b3fa-5062` | PASSED (1,720 unit tests) |
| **`f944b3f`** | **full (the checkpoint)** | `20261113-093231-f944b3fa-8535` | **PASSED** (exit 0, 90/90, 34 min 32 s) |

**Root causes and reproductions:** `docs/evidence/stage111-local/README.md`.
