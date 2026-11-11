# Compact choices clipped their labels (found while validating repair R82-01)

**How it was found.** No reviewer reported this. While the R82-01 shots were being taken on `224a2d2` (Settings on a device that can't save, 320×640), the Look control showed "Match | Everyday | hristmas": the label "Christmas ✓" was wider than a third of the row and was cut off. Every compact two- or three-way choice was built the same way, and the defect has been there since the first Stage 8.2 candidate, so the R82-01 repair did not cause it.

**Why nothing caught it.**
- The drivers' "text clipped" check only looks at boxes that hide their overflow or show an ellipsis. Here the label overflowed a button whose overflow is visible, so the check never saw it.
- No driver opened Settings at 320 px.

**The cause** (`apps/web/src/ui/mchezo/styles/mchezo.css`):
- Compact choices were a fixed grid of equal columns, and every label was non-wrapping (`inline-flex`).
- The ✓ was laid out after the label, so choosing an option made its label wider.
- At 320×640, Settings gives each of the three options about 78 px, minus 24 px of padding. "Christmas ✓" needs about 100 px.

**The fix** (stage82.md §7.5, D-S82-09): CSS only, plus one inline style removed in `Choice.tsx`.
- **The row:** a compact choice is now a wrapping flex row. Its options share the row but never shrink below their label (`min-width: max-content`), so when the labels can't all fit on one line the row wraps rather than clipping.
- **The ✓** hangs just after the label, out of the flow, inside the side padding that every option has, chosen or not. Choosing never changes a width or moves the other options.
- **The content choice** (shelf, Word Connections start screen, lobby) keeps its "Content" label on the same line as the choice when both fit. Otherwise the choice takes its own full line, before its options would have to wrap.

**The check: `scripts/check-themes-seasonal.mjs`, section G.**
- **What it opens:** Settings → Look in each of its three states, and the solo content choice on the shelf and the Word Connections start screen in both states.
- **Where:** 320×640, 390×844 and 1440×900, with the page's own font stack and every wide fallback installed on this machine (DejaVu Sans, Liberation Sans, FreeSans), each forced in turn (`scripts/lib/fonts.mjs`, shared with `check-mobile-everyday`).
- **What it measures, after each choice:**
  - the label's own text, through a Range over the text, so visible overflow is caught, lies inside its button;
  - the ✓ lies inside its button and never covers the label;
  - every option is at least 44 px;
  - no option moved or changed size within its group.

| Run | Section G | File |
|---|---|---|
| `224a2d2` web build | **19 of the new checks FAIL**: Settings → Look at 320 and 390, and the shelf and start-screen content choices at 320; the rest of the driver passes | `check-themes-seasonal-on-224a2d2.log` |
| the fix (working tree) | all 251 driver checks pass | `check-themes-seasonal-fixed.log` |

**Not made worse.**
- **The R81-01 compact shelf** still keeps the first Start and the second game's title on the first screen at 320×640 with every font: `check-mobile-everyday` passes all 134 checks (`check-mobile-everyday-fixed.log`).
  - With the page's font, Liberation Sans and FreeSans, the content choice stays on the label's line, and the second title ends at 559 px.
  - With DejaVu Sans (the widest), the choice takes its own line and the title ends at 633 px.
  - An intermediate version (14 px side padding) pushed DejaVu to 641 px and failed that check, so the padding and gaps were tightened.
- **Ten other drivers** were rerun with 0 failures (`regression-drivers.txt`). Unit tests (1,379), lint and typecheck are clean.

**What it looks like now:**
- At 320 px, Settings → Look shows Match and Everyday on one line and Christmas on the next, every label whole.
- From 390 px up, all three fit on one line with every font measured.
- Pictures: `docs/stage8/screenshots-82/r82-01/`, taken on the final candidate.
