# Stage 11.2 screenshots: before and after

**Before:** the base build, `602b73d` (PR #23's head).

**After:** the Stage 11.2 build, `adf6e8d`.

**How they were made:** both sets came from the same script, `docs/evidence/stage112-local/capture-112.mjs`, with the same steps run against each build. It drives a casual room and a Cup room:
- **Casual room "Friday games":** players Keku, Amina and Zoë play two practice Math Mayhem games. There are three notes: one on the first game (approved), one on the rematch (approved), and one pending.
  - The host's page is shown at 320 and 390 px, in both looks.
  - A draft is typed, so the link preview under it is visible.
- **Cup room "Family Cup":** an official game is played on Day 1 and the host ends the day. Then Amina adds a note on Day 2 about the Day 1 game, and the host approves it.

## The casual book (acceptance 1 and 4)
| | Before | After |
|---|---|---|
| Everyday, 390 | `before-everyday-casual-memory-390.png` | `after-everyday-casual-memory-390.png` |
| Everyday, 320 | `before-everyday-casual-memory-320.png` | `after-everyday-casual-memory-320.png` |
| Christmas (Warm Ivory), 390 | `before-christmas-casual-memory-390.png` | `after-christmas-casual-memory-390.png` |
| Christmas (Warm Ivory), 320 | `before-christmas-casual-memory-320.png` | `after-christmas-casual-memory-320.png` |

Read from the pages by the same script (`../stage112-examples/{before,after}-summary.json`):
- **"Day N" on screen:** 7 times before (preview, badges, results lines) in every look and width; 0 after.
- **Link preview:** before, "Linked to Math Mayhem · Day 1: the last game that finished."; after, "Linked to Math Mayhem: the last game that finished."
- **Badges:** before, "Day 1 · approved"; after, "Math Mayhem · approved" and "Math Mayhem · pending".
- **Sideways scrolling:** none, in every look and width, before or after.

## The Cup book (acceptance 2)
`before-everyday-cup-memory-390.png` and `after-everyday-cup-memory-390.png`:
- **Before:** the note added on Day 2 about the Day 1 game was filed under Day 2 (stored `day: 2`, badge "Day 2 · approved").
- **After:** it's filed under its game's day (stored `day: 1`, badge "Day 1 · approved"). The results line already said "Day 1".

## An older Cup entry, restored (ChatGPT's spec feedback 6851031292; D-S112-05)
These come from `check-cup-memory`. The driver stops its server, rewrites the Day 2 note about the Day 1 game on disk exactly as the base build stored it (day 2, no recorded source), and restarts.
- `after-everyday-cup-legacy-restored-390.png` (`adf6e8d`): the badge reads "Day 1 · approved", from the room's citation. The stored entry still says day 2.
- `before-9d19970-everyday-cup-legacy-restored-390.png`: the same step with the web bundle built from `9d19970` (the previous rule), whose badge reads "Day 2 · approved".
- `after-cup-legacy-restored-pdf-page1.png` and `before-9d19970-cup-legacy-restored-pdf-page1.png`: the downloaded PDF reads "(Day 1)" after and "(Day 2)" before.

## PDF pages (rendered with poppler's `pdftoppm`, page 1, 60 dpi)
- **The casual PDF:**
  - `before-casual-pdf-page1.png`: notes end "(Day 1)", and facts read "player-1: 120 points".
  - `after-casual-pdf-page1.png`: notes end "(Math Mayhem)", and facts read "Keku: 120 points".
- **Names in other scripts** (check-book-live R4: players 李雷, 王芳 and Łukasz, note "雪 night 🎄"):
  - `before-unicode-pdf-page1.png` (the web bundle built from `9e85bd5`): 李雷 prints as "gN–÷", 王芳 as "s‹³" and Łukasz as "Aukasz", silently wrong, and the note's start is garbage.
  - `after-unicode-pdf-page1.png` (`adf6e8d`): "??", "?? (2)", "?ukasz", "? night ?", and one closing line saying some characters print as "?" and that the Markdown keeps every name in full (D-S112-04).

The PDFs and Markdown files themselves are in `../stage112-examples/`.
