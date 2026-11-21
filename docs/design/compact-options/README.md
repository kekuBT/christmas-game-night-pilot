# Compact UI: two options for the owner to choose from

**Status: proposal only.** Nothing here changes the app. The two options are static mockups in this folder. The broad redesign starts only after Keku picks one (or a mix).

- **The handoff:** ChatGPT's [7060711859](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7060711859) on #51, acknowledged in [7060716374](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7060716374).
- **Keku's report:** screens feel crowded, and the host/join area is oversized.
- **The base:** `f263362` (the #62 head). The app code is the same as on that commit; this branch adds only this folder and the records.
- **The artifact revision:** see [Revision and runs](#revision-and-runs).

## The problem, measured

The same room was used for every screenshot (see [Same content](#same-content)). All figures are in CSS pixels on the first screen, before any scrolling. "Now" is the current app at `f263362`.

| Screen | Measure | Now · 390 Everyday | A · 390 | B · 390 | Now · 320 Christmas | A · 320 | B · 320 |
|---|---|---|---|---|---|---|---|
| Home | Host/join area height | 135 (fixed dock) | 94 | 112 | 131 (fixed dock) | 94 | 112 |
| Home | Featured game height | 199 | 84 | 120 | 163 | 84 | 120 |
| Lobby (host) | Top of the game's setting (cups each) | 1028 (below the first screen) | 338 | 206 | 1034 (below the first screen) | 374 | 227 |
| Lobby (host) | Dock height | 168 | 95 | 94 | 183 | 113 | 94 |
| Picker | Games fully visible | 4 | 8 | 9 | 2 | 5 | 6 |
| Results | Top of the explained standings | 706 | 220 | 299 | 802 (below the first screen) | 220 | 299 |

The first screen is 844 px tall at 390 and 568 px at 320. Every measure is the same in both looks, for the current app and the options alike. `shots/metrics.json` (Now) and `shots/checks.json` (options) hold every width and look, each with its scroll position. It is 0 everywhere except the current app's picker, where the figure is the lobby under the sheet (scrolled to Choose); the sheet itself opens at its top.

The current app spends its first screen on big pieces:
- **Home:** a featured card of about 200 px, cover art of about 140 px per game in a sideways row, and a fixed host/join dock of about 135 px. That leaves little room for anything else on a 320 × 568 phone.
- **Lobby:** the seat circle fills the first screen. The game's own setting (cups each) is far below the fold, behind a 168–183 px dock.
- **Picker:** two rows of large cover cards at 390 px, one at 320 px.
- **Results:** the hero card and the What's next panel come before the standings. The explained totals start near the bottom of the first screen at 390 px, and below it at 320 px.

## Option A · Compact list

Dense rows, small art and a short dock. The host's main controls are on the first screen, even at 320 px.

- **Home:** Join a room and Host a game sit side by side at the top, under the logo, with "Just you? Play solo" under them. They form one 94 px block, not a fixed dock. The featured game is one row, and the party games are a list of rows with 44 px art. Each row says players, length and "practice only" where it applies.
- **Lobby (host):**
  - The top bar has the room code with Invite, the room name and the menu.
  - Under it come "You're in, Keku.", a "You're hosting" badge and "3 here · all ready", then the players as name chips.
  - The Up next card holds the game, Change, and the game's settings as segmented controls: cups each (3/5/7) and content (Everyday/Christmas).
  - Under it, More for tonight is a short list of rows (Quick Party, Teams, Family questions), then the reactions and Take a break.
  - The dock is Start plus one line saying what kind of game it is ("Casual game: just for fun, no Cup · Everyday content").
- **Picker:** a sheet with search, category chips and one row per game. Up next is marked with a badge, games that don't fit are greyed with the reason, and "practice only" is kept.
- **Results:**
  - The top card carries the game and mode, the headline, "You came 1st of 3" with the points, and the cup line.
  - The explained standings follow straight away.
  - Then come the rule line and Save a memory.
  - The dock holds Play again, Pick another and Take a break, with the next game's content under them.
- **Desktop:** two columns, with the lobby on the left and More for tonight and Last game on the right.
- **TV:** the same order at TV scale. The lobby has the code, the up-next line with its settings, the players and "Keku is hosting · the game starts from Keku's phone". The final has the explained standings.
- **How it saves space:** rows replace cards, art shrinks to 44 px, the entry moves from a fixed dock into the page, settings sit inside the Up next card, and results lead with the standings.
- **Role and session controls:** the room code with Invite and the menu stay at the top. The host sees "You're hosting" as a badge, and the mode is repeated under Start.

## Option B · Focus and sheets

One focused stage per screen; secondary things move into sheets and chips.

- **Home:** a room-code field with Join on one line (the fastest join). Host a game and Play solo are text links under it. The featured game is a short banner, and the party games are a shelf of square tiles.
- **Lobby (host):**
  - The top bar has the code with a share icon, a "Hosting" badge and the menu.
  - One stage card holds:
    - the game, with Change (an icon below 360 px, its label kept for screen readers);
    - the settings as fact chips ("3 cups each", "Everyday content", "Casual just for fun"), where a tap would open a sheet;
    - an avatar stack with "3 here · all ready" and People.
  - More for tonight is a sideways strip.
  - The dock holds Start and React.
- **Picker:** the same sheet as a grid of tiles, three across.
- **Results:**
  - A podium shows the top three, using first names.
  - Then the headline and the explained standings.
  - The dock holds Play again and More… (pick another game, take a break, save a memory).
- **Desktop and TV:**
  - The desktop has two columns: the stage card on the left, More for tonight on the right.
  - The TV final shows a large podium with one explained line per player under it.
- **How it saves space:** settings collapse into chips, people into an avatar stack, and secondary actions into a strip and a More… sheet.
- **Role and session controls:** the code and menu stay at the top, with a "Hosting" badge. The mode is a chip and is repeated under Start.

## Comparison

| | Option A · Compact list | Option B · Focus and sheets |
|---|---|---|
| Host and join | Two equal buttons at the top; solo as a link | Code field + Join; host and solo as links |
| Lobby settings | Changeable in place. Cups are on the first screen; at 320 px the content setting is just below, and its value shows under Start | Shown as chips; changing one opens a sheet (one more tap) |
| Players | Name chips, readable at a glance | Avatar stack; names in one line, full list behind People |
| More for tonight | Rows under the Up next card | Sideways strip (can hide items off screen) |
| Picker | Rows: more text per game, easy to scan | Tiles: more art, names may wrap to two lines |
| Results | Standings first, all actions visible | Podium first; Take a break and Save a memory behind More… |
| Long names | Full names wrap inside rows | Full names in the list; the podium shows first names |
| Feel | Calm, tool-like, dense | Playful, more like a game console |
| Build risk | Low: mostly changes layout, reuses today's controls | Higher: needs new sheets, a podium and an adaptive button |

## Recommendation

**Option A.** It answers the report directly: the oversized host/join area becomes a 94 px block, and every screen shows its key content on the first screen at 320 px. Nothing the host needs moves behind an extra tap. Its rows carry long names and "practice only" without truncation. It is also the cheaper and safer change, because it rearranges controls the app already has.

Option B is more playful, and its one-line code entry is the fastest join. Its podium and banner could be borrowed into A where there is room, such as the TV final or the home banner on wide screens. If Keku prefers B, the main cost is the extra tap for settings and the hidden secondary actions.

## Design principles, and where they apply beyond Jebena Rush

The options share one small system (`mockups/shared.css`), so the choice carries to every screen, not just the four shown.

| Principle | Rule | Settings and menus | Other games' lobbies | Other results | TV |
|---|---|---|---|---|---|
| Spacing | 4 / 8 / 12 / 16 / 24 px; 16 px page gutter; 8–12 px inside cards | Rows 12 px apart, sections 24 px | The same Up next card | The same cards | The same steps, scaled |
| Type | 13 meta · 15 body · 17 title · 20 heading · 24 big; display font only for headings and codes | Labels 15, help 13 | Game title 17 | Headline 20, totals 17 | The same steps, larger |
| Controls | 44 px minimum, 48 px for the one primary action | Toggles and segmented controls at 44 | Settings as segmented controls (A) or chips (B) | Play again is the primary | Not touch targets |
| Thumb dock | Only the next action(s) and the mode line; about 95–115 px at 320 | None | Start + mode | Play again + next steps | None |
| Rows, not cards | 44 px art in rows; big art only where it is the content | Menu items are rows | The picker and library are rows (A) or tiles (B) | Standings are rows | Rows at TV scale |
| Role and session always visible | Code + Invite + menu at the top; host badge; mode under Start | The menu shows who is host | Every lobby | "Casual" / "Official" in the header | Code + QR on the lobby |
| Explanation first | The result and how it was earned before continuation | — | — | Trivia, Math, Spectrum (one team score), team games | The final shows the explained list |

These apply directly to:
- the briefing (a rules card, then a dock of Ready);
- Trivia, Math Mayhem and Spectrum results (the header card, explained standings, then the dock);
- team games (team rows instead of player rows);
- the Memory Book (rows with actions on the right);
- the full Library page (A's rows, or B's tiles).

## Checks

`render.mjs` opens every option, screen and look at 320 × 568 and 390 × 844, in three variants:
- the base screen;
- **long:** the longest names a family might type, 23 characters against the app's 24-character limit, and a long room name;
- **help:** each screen's error and help copy, all at once.

It also renders desktop (1280 × 800) and TV (1920 × 1080) screens. For each it checks:
- **No sideways scroll** on phones.
- **Touch targets:** every button, link and input is at least 44 × 44 px. Primary actions are drawn 48 px tall (`--c-primary`); the check holds them to the same 44 px minimum.
- **Contrast** of every piece of text against its real, composited background: 4.5:1, or 3:1 for large text (WCAG 2.2 AA). Text on art or a gradient is skipped and was checked by eye.
- **Keyboard:** Tab visits the controls in reading order (`data-tab`), and each shows a visible focus ring of at least 2 px. This is checked on base phone screens.
- **Fonts and errors:** Unbounded and Figtree load, with no page errors and no failed requests.

**Result on `c220279`: 106 of 106 renders pass, 0 fail.**
- 96 phone renders: 2 options × 4 screens × 2 widths × 2 looks × 3 variants.
- 10 desktop and TV renders.
- 2843 pieces of text checked for contrast.
- 32 keyboard walks, every one in order with a visible ring.
- No sideways scroll, no target under 44 × 44 px, no page errors, and both fonts loaded in every render.

**What the help variant shows:** each error or help line in place, to test that the copy fits. These lines never appear together. Two of them belong to other moments: "Amina is away" appears when someone is away (the base screen says "all ready"), and the results line "Only the host starts the next game" is what a guest sees in place of the host's buttons.

## Same content

`capture-before.mjs` plays a real match, so its room code and the order in which the two guests go out vary from run to run. `render.mjs --content=<its metrics.json>` passes that match's facts to the mockups, which fill marked slots (`data-slot`) with them:
- the room code;
- the 2nd and 3rd place names;
- the winner's answer count.

So "Now", Option A and Option B show the same room, players, game, settings and result. Without `--content`, the mockups keep the content they were drawn with (code 3QC2UZ).

## Revision and runs

- **Artifact revision:** `c220279df7ee8b33f9fc0e3cd3bc62167d5d890f`. The scripts and mockups are exactly as tested; every screenshot and number in `shots/` comes from one pass on it.
- **The final pass, one run on one revision:**

```
head c220279df7ee8b33f9fc0e3cd3bc62167d5d890f dirty=0
build ok
capture exit 0; captured 19 measurements
render exit 0; ALL 106 PASS
compare exit 0; 8 sheets
dirty after=0 head c220279df7ee8b33f9fc0e3cd3bc62167d5d890f
PASS DONE
```

  - **The build:** the web app built from that tree.
  - **The capture:** a casual room "Game night" with code `7A8E88`, Keku hosting, Amina and Baraka, Jebena Rush with 3 cups each. Keku answered; the guests let their turns time out. Final: Keku 230 (1st; 3 answers, 0 timeouts), Amina 100 (2nd; 0 answers, 3 timeouts), Baraka 0 (3rd; 0 answers, 3 timeouts).
  - **The render:** the options with that content (`--content`), then the comparison sheets.
  - **The tree:** clean before and after.
- **Earlier passes, each for its own revision only:**
  - `b192c2a`: 106/106, superseded. The options showed the content they were drawn with, not the captured match's, and Option A's 320 px lobby and results were measured after the keyboard walk had scrolled them.
  - `037b702`: stopped by me during the capture to add the practice-only labels; no result.
  - `2808558`: 106/106, superseded. The current app's 320 px Everyday lobby was shot scrolled.

## How to reproduce

From the repository root, on Node 22, with Chromium:

```sh
export MCHEZO_CHROMIUM_PATH=<chrome-headless-shell>        # only if Playwright's default isn't found
npx vite build --config apps/web/vite.config.ts --outDir /tmp/cui-dist --emptyOutDir
MCHEZO_WEB_DIST=/tmp/cui-dist node docs/design/compact-options/capture-before.mjs /tmp/cui/before
node docs/design/compact-options/render.mjs /tmp/cui/options --content=/tmp/cui/before/metrics.json
node docs/design/compact-options/compare.mjs /tmp/cui/before /tmp/cui/options /tmp/cui/compare
```

To look at a mockup by hand, open `mockups/option-a.html?screen=lobby&look=christmas` (or `option-b.html`) in a browser at phone width. The screens are home, lobby, picker, results, desktop-lobby, tv-lobby and tv-results. Add `&variant=long` or `&variant=help` for the variants.

## Limitations

- **Static mockups only.** Buttons don't do anything. Sheets and chips are drawn in one state, and a picker sheet is shown over a dimmed lobby. Nothing was built into the app, so nothing was checked against real game state.
- **Placeholder art.** Game art is a flat colour with a symbol; the real covers would replace it.
- **TV mockups leave out the QR code.** The app's TV lobby has one (Stage 12.1), and either option keeps it beside the code.
- **Emulation only.**
  - These are Chromium screenshots with phone emulation, not native devices.
  - Safari's text rendering, iOS safe areas and Android's system font scaling may change heights by a few pixels.
  - The private audits (screen reader and native device) are still open.
- **The keyboard order** was checked on the base phone screens; screen-reader output was not checked.
- **Contrast** is measured on flat colours. Text over art or gradients (the home banner in B, the TV podium) was checked by eye only.
- **Unchanged:** scoring, replay, role permissions and the casual/practice distinctions. Every option shows the same rule, totals, places, "Casual game: just for fun" and "practice only".
- **Draw & Guess:** the native iPhone confirmation stays open for a device.
- **Not done:** no gameplay gate ran, as the handoff asks for a docs/static slice. Nothing was merged, deployed or forwarded publicly.

## Files

- `mockups/option-a.html` and `mockups/option-b.html`: the two options, one HTML file each, all screens.
- `mockups/shared.css` and `mockups/shared.js`: the shared scale, both looks' colours (from the app's tokens), the logo, and the variants and content slots.
- `capture-before.mjs`: the current app's screens, captured from one real room.
- `render.mjs`: the options' screenshots and checks.
- `compare.mjs`: the side-by-side sheets.
- `shots/`: everything from the final pass on `c220279`:
  - `before/`: 21 screenshots of the current app;
  - `option-a/` and `option-b/`: 29 each, with the long-name and help variants at 320 px;
  - `compare/`: the 8 side-by-side sheets;
  - `metrics.json`: the current app's measures and the match's result;
  - `checks.json`: every render's checks and measures;
  - `logs/`: the pass's run, capture, render and compare output.
