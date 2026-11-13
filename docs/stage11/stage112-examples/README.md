# Stage 11.2 export examples: downloaded PDFs and Markdown

These are the real files the app produced: the PDF downloaded from the page, and the Markdown from "Export approved" or the export endpoint. Each pair comes from the same steps run against both builds.

| File | Build | What it shows |
|---|---|---|
| `before-casual.md` | `602b73d` | A casual room: `## Day 1` headings and `- player-1: 120 points` |
| `after-casual.md` | `adf6e8d` | The same room: `## Math Mayhem` headings and `- Keku: 120 points`. No "Day", no ids |
| `before-casual.pdf` | `602b73d` | Notes end "(Day 1)"; facts read "player-1: 120 points" |
| `after-casual.pdf` | `adf6e8d` | Notes end "(Math Mayhem)"; facts read "Keku: 120 points" ("Zoë" prints, since it's Windows-1252) |
| `before-cup.md` | `602b73d` | A Cup note added on Day 2 about a Day 1 game is headed `## Day 2`, with ids |
| `after-cup.md` | `adf6e8d` | The same note is headed `## Day 1` (its game's day), with names |
| `before-unicode.pdf` | the web bundle built from `9e85bd5` (old PDF code) | Players 李雷, 王芳 and Łukasz: each of their lines is two-byte text the font can't read |
| `after-unicode.pdf` | `adf6e8d` | "??", "?? (2)", "?ukasz", and one closing line explaining why (D-S112-04) |
| `after-unicode.md` | `adf6e8d` | The same book's Markdown, with every name and the note "雪 night 🎄" in full |
| `after-cup-legacy-restored.pdf` | `adf6e8d` | A restored older Day 2 note about a Day 1 finish: "(Day 1)" |
| `after-cup-legacy-restored.md` | `adf6e8d` | The same book: `## Day 1` |
| `before-9d19970-cup-legacy-restored.pdf` | web bundle built from `9d19970` (the previous rule) | "(Day 2)": the stored day |
| `before-summary.json`, `after-summary.json` | each | What the capture script read from each page: entries, "Day N" count, link preview, sideways scrolling, the Cup entry's stored day |

**Unchanged in every file:** each entry's facts, points and order are exactly the stored `derivedFacts` (one line per score event, as before this stage); only the id became a name.

**Not changed (out of scope):** a fact line is per score event (30 lines for a 3-player, 10-question game), as it always was. Totals per player are on the screen's results line, not in the exports.
