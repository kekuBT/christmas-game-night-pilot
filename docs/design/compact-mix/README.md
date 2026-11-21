# Compact UI mix (handoff 7065498313, D-UI-02)

The owner selected a mix from the compact UI proposal (`docs/design/compact-options/`, #63):

- Option A's **Home**;
- the current seat circle plus Option B's next-game card, chips and sheet in the **Lobby**;
- Option B's podium **Jebena Rush results**.

They also asked for a colour exploration, compared before any default changes. This folder holds the colour tools and their results, and the app's screenshots. The screenshots come from `check-compact-mix` in the targeted gate on the candidate (`shots/app/`).

- **Candidate:** `414e3d4` (branch `claude/compact-ui-mix`, stacked on the proposal head `9992014`). It is made of two commits: `7eddbd4`, the mix, and `414e3d4`, a hidden-text class fix (see Checks).
- **Draft only:** not for merge or deploy.

## What changed

### Home (Option A)

- Join a room and Host a game sit in the page, under the header, with more room above and between them.
- They are no longer pinned in a bottom dock.
- Play solo stays a quieter link.
- Games are 64 px rows with 48 px covers, in one rounded list with hairlines (two columns from 720 px wide).
- Featured comes first.

### Lobby (the circle, then Option B)

- **The circle.** The seat circle, its readiness checks and the reactions are unchanged. It is the only place the players are shown.
- **The next-game card.** Below the circle: cover, "Up next", title, facts and Change.
- **The chips.** The card's facts are chips:
  - the mode (read-only, e.g. "Casual · just for fun");
  - the cups and the content. For the host these are 44 px buttons that open one **Next game settings** sheet; for guests they are labels;
  - whether the game fits the people here.
- **Activities.** Quick Party, Teams and Family Questions are grouped under **More for tonight**.
- **Unchanged:**
  - the room code with Invite, the menu, the "Everyone's here" line and the Start dock (Start, the mode line, the guest note);
  - a Cup room's Official/Practice choice, which stays inline.

### Jebena Rush results (Option B)

- **The result card,** tighter. The casual quip and the winners list are hidden, because the podium names the winners. Your own line ("You came 1st of 3 · 230 pts", "You missed this one…") stays.
- **The podium:** 2nd, 1st, 3rd.
  - Places and points are the server's standings, exactly.
  - A tie at the top raises every 1st place.
  - Full names are clamped to two lines, so two players who share a first name stay distinct; the standings below give each name whole.
- **The explained standings,** unchanged: "Outlasted 2 players (200) + 3 whole cups (30) = 230", and "Played: 2 answers · 0 timeouts".
- **The rest,** unchanged: Save a memory and the outcome line.
- **One dock:**
  - **Host:** one main action (Play again, or Next game / Resume when a lineup or a break applies), plus **More…**. More opens a sheet with Pick another game, Take a break, Plan another lineup (when the lineup is complete) and Back to lobby.
  - **Guests:** who picks next, and Back to lobby.
- Every other game's results keep the What's next panel as before.

### Join (one change outside the three surfaces)

- A refusal ("Room not found for that code") now shows directly under Join the game, and a new refusal is scrolled into view once.
- On `9992014` at 320 × 568 it rendered at the end of the screen, below the fold. The handoff asked to verify room-code errors.

## Colour exploration

| Palette | What changes |
|---|---|
| **Now** (reference) | The app's tokens (`apps/web/src/ui/mchezo/tokens/tokens.ts`). |
| **T1 · warmer, lighter Everyday surfaces** | Everyday only: an espresso-brown ground and cards (`#2A211C` / `#382C25` / `#463830`) in place of the near-black plum, and warmer text. Coral, gold and teal keep their jobs. Christmas is unchanged. |
| **T2 · a different accent balance** | Everyday: gold leads (Join, Start, Play again, kickers) and coral becomes the highlight (focus ring, the winner's ring, your score). Christmas: evergreen leads and cranberry becomes the highlight. Surfaces and text are unchanged. |

**Unchanged in every palette:**

- the circle-and-dots mark;
- the game covers;
- Everyday stays a dark look and Christmas a light one.

### Side by side

`shots/palettes/palettes-390-everyday.jpg`, `palettes-390-christmas.jpg`, `palettes-320-everyday.jpg` and `palettes-320-christmas.jpg`. These were shot on the full gate's own build of `414e3d4`.

Each sheet shows:

- one column per palette;
- one row each for Home, the Lobby top, the Lobby's next-game card and the Jebena results;
- the same live room throughout: Keku, Amina and Baraka, 3 cups, results 230 / 100 / 0.

### Contrast

- **Token pairs** (`shots/palettes/contrast-tokens.md` and `contrast.json`, from `node docs/design/compact-mix/palettes.mjs`): 23 pairs per look, covering:
  - text, secondary text and kickers on the page, cards and chips;
  - the focus ring against each;
  - primary buttons and their labels;
  - control outlines;
  - ready checks;
  - error text;
  - score highlights and the winner's ring.
  - **Result:** every pair meets WCAG 2.1 AA in all three palettes.
  - **Lowest pair in each look:**
    - Everyday: the control outline on a card. Now 3.57:1, T1 4.20:1, T2 3.57:1.
    - Christmas: the control outline on the page, 3.67:1 in every palette (no treatment changes those two tokens).
- **As rendered** (`shots/palettes/report.json`, from `capture-palettes.mjs`):
  - 48 shots, with every visible text element measured against what is painted behind it: **0** below AA.
  - The focus ring on Join (Home) and on Play again (results): 24 of 24 at 3 px and at least 5.06:1.

### Recommendation

**If the Everyday look should change, choose T1. Keep Christmas as it is. Don't adopt T2.**

- **T1** does what was asked: a lighter, warmer Everyday that stays clearly apart from the ivory Christmas look. It moves no meaning:
  - coral still means "go";
  - gold still means focus, the winner and your score;
  - teal still means ready.

  Control outlines get stronger: 4.20:1 on a card, from 3.57:1. Body text stays between 10.59:1 and 14.85:1.
- **T2** passes contrast but moves meanings people have already learned:
  - In Everyday, a gold Start sits next to gold covers (Math Mayhem, Impostor), and the coral highlight competes with coral covers.
  - In Christmas, an evergreen Start is in the same green family as the ready checks (`#2F6A4F`), so "ready" and "start" read alike.
- **Before T1 becomes the default:**
  1. View it on a real phone in a dim room, where OLED and LCD screens shift browns differently.
  2. Look at the TV screens, where large surfaces dominate. They were not part of this comparison.
- **No default has changed.** The treatments exist only in the screenshot browser.

## Checks

- **Targeted gate on `7eddbd4`: FAILED (exit 1)**, run `20261121-165735-7eddbd4d-6501`; 21 of 22 steps passed.
  - `check-mobile-everyday` read the chips' screen-reader suffix (", change", in `mz-sr-only`) as text clipped inside its box.
  - **Fix (`414e3d4`):** the chips and the results dock's hidden heading use `mz-sr`, the app's other visually hidden class (8 existing uses), which the layout checks already treat as hidden. The accessible names are unchanged.
  - W8's Lobby and menu records were re-recorded for the class name.
- **Targeted gate on `414e3d4`: PASSED (exit 0)**, run `20261121-171745-414e3d40-12896`, 22 of 22 steps. It ran 20 drivers:

  | Driver | Result |
  |---|---|
  | `check-compact-mix` | 151/151 |
  | `check-lobby-mode` | 88/88 |
  | `check-one-path` | 78/78 |
  | `check-jebena-rush` | 252/252 |
  | `check-mobile-everyday` | 134/134 |
  | `check-warm-ivory` | 199/199, including W8 |
  | `casual`, `jebena-categories`, `themes-seasonal`, `errors`, `stage2`, `lobby-fixes`, `session-flow`, `game-night-flow`, `quick-party`, `host-handover`, `f5`, `solo-shelf`, `spectrum`, `official-practice` | passed |

- **Full gate on `414e3d4`: PASSED (exit 0)**, run `20261121-172822-414e3d40-17085`, 122 of 122 steps.
- **Focused, before the candidate commit:**
  - web and root typecheck: clean;
  - `CompactMix.test.tsx`: 9/9, within 150/150 focused tests (web components and Jebena tests).

## Reproduce

```sh
npx vite build --config apps/web/vite.config.ts --outDir <dist> --emptyOutDir
MCHEZO_WEB_DIST=<dist> node docs/design/compact-mix/capture-palettes.mjs <shotsDir>
node docs/design/compact-mix/compare-palettes.mjs <shotsDir> <sheetsDir>
node docs/design/compact-mix/palettes.mjs <outDir>          # token contrast table
MCHEZO_WEB_DIST=<dist> MCHEZO_SCREENSHOT_DIR=<dir> node scripts/check-compact-mix.mjs   # or: node scripts/gate.mjs targeted compact-mix
```

## Known limits

- **Emulation only.** Everything here is Chromium emulation (phones at 320 × 568 and 390 × 844, desktop 1280, TV 1920). Native iPhone/Android checks remain open, as does the Draw & Guess native iPhone confirmation.
- **Lobby at 320 × 568.** The first screen holds the room code, who's here, the circle and Start. The next-game card is one scroll down, below the circle, by the owner's arrangement.
- **Jebena results at 320 × 568.** The first screen holds the result card, the podium and the end line. The explained standings are one scroll down. The guest's dock is three lines (status, button, content).
- **Name length.** The app's own name fields stop at 24 characters. `check-compact-mix` uses 31–32 character names (the server's limit) through the API to test wrapping beyond what the fields allow.
- **Ties.** A tie at the top is covered by the component test. No live match was forced into a tie, which needs a match-limit finish.
