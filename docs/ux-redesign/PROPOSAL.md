# Mchezo redesign proposal

**Status:** a proposal for your review. Nothing in it is implemented.

**What it keeps:**
- the wordmark and Circle mark;
- the dark plum ground;
- coral for the primary action;
- the four answer colours and shapes;
- the keycap buttons;
- *The Circle*.

**What it retires:**
- the green Christmas shell;
- the global element styles;
- walls of text;
- identical purple boxes.

The mockups are in [`mockups/`](mockups/): rendered PNGs from `mockups.html`, reproducible with `render.mjs`. The yellow dashed line marks where Safari's bottom toolbar starts on an iPhone 15 (≈664 px). The docked buttons sit just above it.

## 1. Information architecture

```
Home (Discover) ─┬─ Game details (sheet) ── Play solo* / Host with friends
                 ├─ Join (code → name) ──────────┐
                 ├─ Host a party ────────────────┤
                 └─ Rejoin (remembered seat) ────┤
                                                 ▼
                                   Room ── Lobby ─┬─ Choose game (sheet) ── Game details
                                    │             ├─ Invite (sheet: QR · Share · Copy)
                                    │             └─ Room menu (sheet) ─┬─ Show on a TV
                                    │                                   ├─ Family Cup ── Full standings · How scoring works
                                    │                                   ├─ Memory Book
                                    │                                   ├─ This phone: motion · seat backup · leave room
                                    │                                   └─ Host tools: players & cohosts · Cup admin
                                    ├─ Game (server-driven): Rules/Ready → Play → Waiting → Results
                                    └─ Spectator / TV (separate entry, no seat)
* solo practice needs decision D2
```

**Principles:**
1. **One job per screen, one primary button.** Coral is reserved for that button.
2. **The server decides what you see in a room.** When a game is playing, the room shows the game. Navigation can't strand you outside an active game.
3. **Secondary things go in sheets,** not further down the page.
4. **Everything a host does rarely, or can't undo,** lives under Host tools, with confirmation.

## 2. Navigation model (fixes F4)

**Routes.** Use real URLs through a small history hook. No router library is needed; about 80 lines over `pushState`/`popstate`.

| URL | Screen |
|---|---|
| `/` | Home |
| `/games/:id` | Game details (a sheet over Home) |
| `/join?code=ABC123` | Join (QR links point here) |
| `/room` | Lobby, or the live game |
| `/room/cup` | Championship |
| `/room/cup/standings` | Full standings |
| `/room/tv` | TV view |
| `/room/memories` | Memory Book |
| `/watch?code=` | Spectator |

**What a route never holds:**
- Credentials and seats stay where they are today (the `session.ts` seat store).
- Route changes never touch the seat, scores or projection.
- The room code shown in a URL is the public 6-character code, never a token.

**Back behaviour:**
- **Sheets** push a history entry, so iOS swipe-back and Android Back close the sheet first.
- **Back from `/room/cup`** returns to the lobby.
- **Back from the lobby** goes to Home *without leaving the room*. Home then shows "Rejoin room ABC123 · Game in progress" at the top. Leaving is a separate, explicit action ("Leave this room on this phone"), with a confirmation.
- **During a game:** `/room` *is* the game, so Back from it goes to Home with the same Rejoin card. Rejoining is instant and nothing is lost: the server holds the game, and the timer keeps running, which the Rejoin card states.
- **No `beforeunload` traps or browser confirm dialogs.** iOS ignores them anyway.

**Refresh and deep links:**
- Every route renders correctly after a reload.
- A QR deep link to `/join?code=` on a phone that already holds a seat *in that room* goes straight to the room.
- A QR link to a *different* room asks "Join ABC123 instead? You'll keep your seat in XYZ789."

**Reconnect:** the existing WebSocket logic is unchanged. The connection banner moves into the shared app bar slot, so it never covers the title.

**Regression tests to add:**
- Back closes a sheet.
- Back from Cup returns to the lobby.
- Back from the lobby keeps the seat, and Rejoin restores it.
- Reload on each route.
- A deep link while seated.
- No duplicate seat after Back, then forward, then a QR scan.

## 3. Home page: three arrangements

| | **A. Join first** ([mock](mockups/home-a.png)) | **B. Discover, with a fixed Join/Host dock** (recommended, [mock](mockups/home-b.png)) | **C. Play / Discover tabs** ([mock](mockups/home-c.png)) |
|---|---|---|---|
| Above the fold | Code entry, Host, start of the catalog | Rejoin card (if any), featured game, a row of covers. **Join and Host are always visible in the dock.** | Three cards: Join, Host, Solo |
| Invited guest | 1 screen, type the code | QR → `/join` directly (no Home at all). Typed code: tap **Join with a code** → code screen | 1 tap |
| Discovery | Below the fold; feels like an afterthought | It *is* the page; covers sell the games | Hidden behind a tab |
| Risk | Reads as a utility, which is today's problem | Join is one tap further than A for people typing a code | Tabs hide state, and the extra tap adds friction |

**Recommendation: B.**
- Invited guests rarely see Home at all, because the QR code goes straight to `/join`. So Home can be for discovery.
- The dock keeps Join and Host one thumb-tap away, which answers "don't bury joining".
- **Returning players:** a remembered seat shows as a highlighted Rejoin card above everything else.
- **Solo practice** gets a "Play solo" shelf once D2 is approved.

## 4. Host lobby: three arrangements

| | **A. Stage and dock** (recommended, [mock](mockups/lobby-a.png)) | **B. Tabs: Game / Players / Invite** ([mock](mockups/lobby-b.png)) | **C. Game-first poster** ([mock](mockups/lobby-c.png)) |
|---|---|---|---|
| Visible without scrolling | Code + Invite, Cup day, readiness headline, the Circle, the up-next game card with cover, the Official/Practice control, Start | One tab's content plus Start | Big cover, a strip of players, mode, Start |
| The Circle | Kept as the centrepiece | Becomes a list in a tab | Reduced to a strip |
| Readiness | On the Circle (✓ or … badge on each token), summarised in the headline | Only visible in the Players tab | A count only |
| Effort | Medium: reuses `CircleLobby` and `ReadinessCard` logic | Medium | Low, but it loses the identity |

**Recommendation: A.**
- It is the only arrangement where the host can see who is ready, what is next, which mode is selected, and Start, together, on one screen.
- It keeps the Circle, which you liked.
- Everything else moves to three sheets:
  - **Invite:** QR, code, Share, Copy.
  - **Choose game:** covers.
  - **Room menu (☰):** TV, Cup, Memory Book, this phone, host tools.

**Guests** see the same lobby without the mode control and Start. Their dock says "Waiting for Keku to start · tap someone to nudge".

**Fixes this covers:**
- F2: Share works.
- F3: the mode control has an unmistakable selected state.
- U1–U4: one column, one action, secondary tools moved out.
- V1: the overlap disappears with the new shell (§6).

## 5. Visual direction: "Night Circle"

**The idea.** A party at night: a deep plum room, lit by the colour of whatever game is on. The chrome stays quiet so the **cover art and the game's accent carry the colour**. That is how we avoid both "identical purple rectangles" and a SaaS dashboard: surfaces are calm, and each game brings its own hue. Coral never decorates; it only ever means "the thing to press".

### 5.1 Colour tokens (roles, not just colours)

| Token | Value | Role |
|---|---|---|
| `ground` | `#16111D` | Page and document background. Also `theme-color`, so Safari's toolbars match |
| `surface-1 / 2 / 3` | `#211A2B` / `#2D2539` / `#3A3048` | Cards, sheets, raised controls (3 elevations max) |
| `line` / `line-soft` | `#7A6E8E` / `rgba(199,190,210,.16)` | Control borders (≥3:1) / dividers |
| `text` / `text-muted` | `#F7F1E8` / `#C7BED2` | Body / secondary (both AA on every surface) |
| `brand` (coral) | `#FF6B4A` + deep `#B8432A` | **The primary action only**, one per screen |
| `sun` | `#FFC94A` | Official, the Cup, winners, "you" highlights |
| `mint` | `#3CCFB4` | Ready, correct, success, practice |
| `iris` | `#9AA5FF` | Time, info, quiz games |
| `pink` (new) | `#FF7AC6` | Social and humour moments, reactions |
| `lime` (new) | `#B6F05A` | A sixth game hue (geography, charades) |
| `error` (new) | `#FF5470` | Errors. Always with an icon and words, never colour alone |

Each game owns one accent (§7). The accent fills the game's cover, kicker and progress, and never the primary button.

**Contrast:** text on any accent uses `ground`, which gives at least 7:1. `check-contrast.mjs` gets the new tokens.

### 5.2 Typography

Typefaces are the bundled OFL fonts, so there is no cost: **Unbounded** for display and numbers, **Figtree** for text.

| Style | Font | Size/line | Use |
|---|---|---|---|
| Display XL | Unbounded 800 | 40/1.0 | Intro titles, TV headlines (×2.4 on TV) |
| Display L | Unbounded 700 | 30/1.1 | Results headline |
| H1 | Unbounded 700 | 26/1.12 | Screen titles |
| H2 | Unbounded 700 | 19/1.2 | Sheet and section titles |
| Title | Figtree 800 | 16–17/1.25 | Card titles, list rows |
| Body | Figtree 500 | 15–16/1.4 | At most 2 lines per card; anything longer goes behind "How it works" |
| Caption | Figtree 600 | 13/1.35 | Metadata ("2–10 · 6 min") |
| Kicker | Figtree 800, +0.1em caps | 12 | Section labels, game names over titles |
| Numbers | Unbounded 700, tabular | Scales with context | Scores, timers, codes |

Sizes use `rem` so iOS Text Size and Android font scale work. Layouts are tested at 200%.

### 5.3 Buttons and states

| Level | Look | Rule |
|---|---|---|
| **Primary** | Coral keycap, 58 px, Unbounded label, 6 px depth | **Exactly one per screen,** docked at the bottom |
| **Secondary** | `surface-2` keycap with a line border, Figtree label | Alternatives next to the primary ("Full results") |
| **Tertiary** | Underlined text button, 44 px target | Escape hatches ("Sit this game out", "Lost your seat?") |
| **Icon** | 44 px square, `surface-1`, aria-label | Menu, close, back, shuffle |
| **Segmented choice** | Two large cells with a title and a one-line explanation | Official/Practice, motion setting |

**States:**

| State | Treatment |
|---|---|
| **Selected** | The cell **fills** with its role colour (Official = sun, Practice = mint), shows ✓ and bolder text, and sets `aria-pressed`/`aria-checked`. Never border-only. |
| **Disabled** | `surface-2`, muted text, **plus a reason line** ("Needs 2 players"). Never a mysteriously dead button. |
| **Loading** | The label changes ("Starting…") and three dots pulse (static under reduced motion). Double taps are ignored, as today. |
| **Success** | A mint toast or an inline line ("Link copied"). |
| **Error** | An inline banner under the app bar, using the `error` colour with an icon and an action ("Try again"). Raw server text is never shown (`humanError` stays). |

### 5.4 Components (the shared kit)

| Component | Notes |
|---|---|
| **AppBar** | Back or brand · title · one action. Slot for the connection banner. |
| **Dock** | Fixed to the bottom, above the safe area and the keyboard (`visualViewport`). Holds the primary button plus an optional secondary. |
| **Sheet** | Bottom sheet with a grab handle. Pushes a history entry. Focus is trapped while open. |
| **Dialog** | Only for one-way actions, stating the consequence ([mock](mockups/confirm.png)). |
| **Toast** | Short confirmations. |
| **SegmentedChoice** | See §5.3. |
| **GameCover** | Procedural SVG (§7); sizes S 32 / M 64 / L 156 / Hero full-width. |
| **GameCard** | Cover, title, meta caption, optional badge (Up next, Practice only, Solo). |
| **PlayerToken** | Existing; adds a readiness badge. |
| **Circle** | Existing `CircleLobby`; the centre shows the count; geometry tuned so tokens never touch the centre (V6). |
| **ScoreBreakdown** | Rows of "what earned points". |
| **StandingsRow** | Existing `StandingsList`; adds a movement arrow. |
| **DayRail** | The Cup's seven days. |
| **RuleSteps** | Three numbered lines in the game's accent. |
| **ReadyRoster** | Who has tapped Ready. |
| **Chip** | Metadata only, never an action. |

### 5.5 Motion

| Kind | Duration and easing | Examples |
|---|---|---|
| Feedback | 90–150 ms ease-out | Key press, tile select |
| Transition | 220–380 ms `ease-out` | Sheets, screen enter |
| Delight | 400–1,200 ms spring | Token arrival, Locked In stamp, results confetti |

**Celebration:** CSS-only shape confetti, built from the four answer shapes, 12–16 elements, at most 1.2 s, on results only. This is a deliberate, scoped exception to the M6 "no confetti systems" rule; that exception is D5.

**Rules:**
- Nothing waits on an animation. Scores and buttons are live immediately.
- Reduced motion, from the OS or the in-app setting, replaces movement with 150 ms fades and removes confetti.
- The in-app setting must apply on every screen (F8).

### 5.6 Layouts

| Layout | Rules |
|---|---|
| **Phone (players and host)** | One column, max 480 px. AppBar + content + Dock. **The document scrolls**, not an inner box (fixes A3/V1, and lets Safari's toolbars collapse). Host-only controls appear inline, never as a different screen. |
| **TV** | A real 16:9 stage that scales from 1280×720 to 4K with `vw`/`clamp`, not fixed pixels. Large type, no inputs except the host's director buttons. Phones never render it: "Show on a TV" explains how to open the spectator view on a TV (F9). |
| **Tablet and laptop** | The phone column centred, with the TV layout available. |

### 5.7 Safe areas and the browser chrome (fixes V2, V7, M6)

- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- **Page head:**
  - `<meta name="theme-color" content="#16111D">`;
  - `<title>Mchezo</title>`;
  - a small web app manifest and icon (the Circle mark).
- **Global styles:**
  - `html, body { background: var(--ground) }`.
  - Delete the global legacy element styles.
- **Spacing:**
  - The AppBar pads `env(safe-area-inset-top)`.
  - The Dock pads `env(safe-area-inset-bottom)`.
  - Landscape pads the left and right insets.
- **Viewport height:** use `100svh`/`100dvh` only for full-bleed intros; never fix the height of scrolling screens.

## 6. Screen by screen

Each spec covers: the goal · what must be visible without scrolling · actions · what is secondary or hidden · empty and error states · components.

1. **Home / Discover** ([mock](mockups/home-b.png))
   - **Goal:** pick something fun, or get into a room.
   - **Above the fold:**
     - the wordmark;
     - a Rejoin card (if a seat is remembered);
     - "Tonight's pick" hero;
     - a row of party-game covers;
     - the Dock (Join with a code / Host a party).
   - **Secondary:** settings (⚙); "All 11" grid; category chips.
   - **Empty or error:** offline → "Can't reach Mchezo. Check your Wi-Fi" with Retry; the catalog is bundled, so it still renders.
   - **Components:** AppBar, GameCard, GameCover, Dock, Rejoin card.

2. **Game details** ([mock](mockups/details.png))
   - **Goal:** understand a game in 10 seconds.
   - **Above the fold:**
     - the cover;
     - a one-line pitch;
     - chips for players, minutes and modes, including *"Counts in the Cup (2+ players)"* (honest about F1);
     - three rule steps;
     - actions.
   - **Actions:**
     - **outside a room:** Play solo (if eligible) / Host with friends;
     - **inside a room, host:** "Make this up next";
     - **inside a room, guest:** browse only.
   - **Secondary:** a "How scoring works" expander.
   - **Components:** Sheet, GameCover, Chip, RuleSteps.

3. **Join** ([mock](mockups/join.png))
   - **Goal:** get a guest in within 15 seconds.
   - **From a QR code:** the code is already validated. Show "Room found · Keku's party · 4 here" before asking for a name. Only the name field is empty.
   - **Typed code:** a 6-cell code entry first, then the same step.
   - **Secondary:** Remember this phone (off by default, explained in one line); Lost your seat? Recover it.
   - **Errors, inline:**
     - "No room with that code. Check the letters with the host."
     - "That name is taken in this room. Add an initial?"
     - "Room is full (10)."
   - The Dock stays above the iOS keyboard.

4. **Host lobby** ([mock](mockups/lobby-a.png))
   - **Above the fold (nothing else):**
     - code + **Invite**, Day chip, ☰;
     - "Everyone's here" or "Waiting for 2 more";
     - the Circle with readiness badges;
     - the up-next card (cover, title, length, Change);
     - the Official/Practice choice;
     - the **Start [game]** dock.
   - **Start disabled:** with the reason ("Trivia needs 2 connected players").
   - **Reconnecting players:** the existing "Start without Mzee?" question, as an inline card above the dock.
   - **Invite sheet** ([mock](mockups/invite.png)):
     - a large QR code, the code, **Share…** (`navigator.share`) and **Copy link**;
     - feedback toast "Link copied";
     - on a private preview address (`*.app.github.dev`) or `localhost`, a yellow notice explains who can open the link (F10).

5. **Choose game** ([mock](mockups/choose.png))
   - **Goal:** pick visually.
   - **Layout:**
     - a sheet with a 2-column cover grid, filtered to games that fit the connected player count ("Fits 5 players"; others listed after a "Needs more players" divider);
     - category chips and 🎲 Surprise me / Smart shuffle as chips;
     - the selected game shows a thick outline plus "✓ Up next";
     - practice-only games carry a badge.
   - **Tapping a card** opens its details; "Make this up next" closes both sheets.

6. **Rules and Ready** ([mock](mockups/rules.png))
   - **Goal:** everyone understands, and nobody loses time.
   - **Layout:**
     - the cover as a header;
     - the kicker "Closest Wins · official";
     - a one-line objective and three steps, including the real timing;
     - the ready roster;
     - the dock **I'm ready**.
   - **Timing** is decision D3:
     - **Target (server change):** play begins when everyone is ready, or after 20 s. The first deadline starts then, for everyone.
     - **Interim (presentation only):** see Plan stage 2.

7. **Gameplay shell** ([mock](mockups/play.png))
   - **Every game gets:**
     - a header with a mini cover, the game name and the timer chip;
     - a progress line (Question 3/10, Groups 1/4, Mistakes ●●●○);
     - the game body;
     - the dock with the game's primary action;
     - a tertiary "Sit this game out".
   - **Word Connections specifics:**
     - tile text auto-fits from measured width (V5);
     - the tile row shrinks to 3 columns below 340 px of width;
     - Shuffle and Clear become labelled icon buttons, so **Submit** is the only large button;
     - solved groups stack as accent bands.
   - Existing mechanics and `data-testid`s are unchanged.

8. **Results** ([mock](mockups/results.png), corrected 2026-11-07)
   - **Goal:** a moment of drama, then the next game.
   - **Order:**
     1. a headline;
     2. your card: placing, score, and a **breakdown taken from the server's recorded scoring details**;
     3. Cup movement;
     4. the dock (Full results / Back to lobby; host: **Next game**).
   - **Hard rule:** the client never computes or invents a number.
     - The breakdown shows what the server recorded: per-item points, bonuses and misses.
     - A speed bonus appears only where the game really scores one. Math Mayhem times each question. **Trivia does not**: the server uses a fixed reference time, so every correct answer is worth 120.
     - Movement arrows compare the server's standings before and after the game, and are hidden when there is nothing to compare.
     - Superlatives, streaks and comebacks appear only when they are computed from recorded answers and scores.
   - **Celebration:** at most 1.2 s of shape confetti, results only; none under reduced motion; never blocks the buttons.
   - **Details on demand:** the per-question review sits under "Full results".

9. **Championship** ([mock](mockups/cup.png))
   - **Order:**
     1. the DayRail (7 days, ✓ done, current highlighted);
     2. a podium of the top 3;
     3. **your card**: rank, total, qualification progress "2 of 3 days ✓", and a next-step sentence;
     4. today's games with their winners.
   - **On demand:** Full standings (table with day scores, eligibility, best-three) and How scoring works (today's rules text, reworded).
   - **Moved out:** host corrections and Advance day go to *Host tools → Cup admin*, behind a confirmation ([mock](mockups/confirm.png)). The audit trail stays visible to everyone under Full standings.
   - All rules and calculations are unchanged; this is presentation only.

10. **TV and spectator** ([lobby mock](mockups/tv-lobby.png), [standings mock](mockups/tv-results.png))
    - **Stages:**
      - **Lobby:** up-next cover, a big QR code and code, the Circle of players.
      - **In game:** the per-game TV view (Trivia stage today; Connections and Caption today; the rest get a generic "Now playing" stage with a progress ring and answered count, never content).
      - **Reveal:** only after the server reveals it.
      - **Standings:** movement arrows and a witty line.
    - Uses the spectator projection only. Existing leak checks keep running against it.
    - The host's phone gets director controls (Next / Auto) in the lobby menu, not on the TV.

11. **Room menu: settings, recovery and admin** ([mock](mockups/menu.png))
    - **This room:** Show on a TV · Family Cup · Memory Book.
    - **This phone:**
      - Motion (Full / Less / Off as a segmented control);
      - Sound shows "Coming soon" until audio exists (F7);
      - Seat backup (recovery code).
    - **Host tools:**
      - Players and cohosts;
      - Cup admin (advance day, score corrections with reason, audit trail);
      - Studio, behind a "Labs" label.
    - **Leave this room on this phone**, in red, with a confirmation.
    - Recovery screens keep their flows and move into the new shell.

## 7. Cover art: eleven original covers at no cost

[All covers](mockups/covers.png). **Procedural SVG.**
- One table maps each game to an accent, a hero glyph and a pattern.
- One function draws every cover from four shared ingredients:
  - the accent gradient;
  - one hero glyph built from the kit's own answer shapes and simple strokes;
  - a light dot pattern;
  - the Circle's eight-seat ring in the corner, which ties every cover to the brand.

**Why this way:**
- Each cover is about 1 KB of inline SVG with no image files.
- Covers render crisply at any size, from a 32 px list icon to a 4K TV.
- They are original by construction, and consistent because one grammar makes them all.
- A twelfth game costs one table row and one glyph.

| Alternative | Verdict |
|---|---|
| Hand-drawn art by you or family | Charming, but hard to keep consistent across 11 |
| CC0 illustration packs | Free, but mismatched styles and licence diligence per asset |
| AI image generation | Costs or licence ambiguity, heavy files, and inconsistent. Needs your approval; not recommended |

The prototype in `mockups.html` is about 60 lines of code. In the app it becomes `ui/mchezo/components/GameCover.tsx`, with a snapshot test per game.

## 8. Personality: wit without slowing the game

**A small, curated copy bank** (`ui/mchezo/lib/quips.ts`). Approved scope (D6): start with **20–30 Mild lines**, reviewed like content; no Spicy mode and no large library until real players have tried them.
- Original lines, tagged by situation: clear win, narrow win (≤5%), comeback (rank gain ≥2), perfect score, zero, tie, last place, a streak, a fast finisher, a sat-out player.
- **Choosing a line:** deterministic per game id, so every phone and the TV show the same line. No repeat within a session.

**Superlatives:** computed from data the results already have, for example:
- "Fastest finger" (Math or Trivia speed);
- "Bullseye" (Closest Wins exact);
- "Sharpshooter" (no Connections mistakes);
- "Crowd favourite" (Caption votes).

**Guardrails:**
- Roast the play, never the person. Nothing about appearance, age, identity, intelligence or family role.
- Never mock someone who sat out or disconnected.
- Family-safe.
- Every line is reviewed like content, with an editorial status.

**Optional setting:** "Banter: Mild / Spicy", default Mild. Decision D6.

**Timing:** lines appear with the results and never delay them. Scores are always visible first; a line is decoration.

## 9. Solo practice and the one-player Cup mismatch

**Engine check.** All of these come from the code:

| Game | Works solo? | What the engine does with one player |
|---|---|---|
| Trivia | Yes | Each answer is scored on its own |
| Math Mayhem | Yes | The speed bonus is timed per question for that player |
| Guess the Year | Yes | Scored by distance from the year |
| Geography | Yes | Right or wrong scoring |
| Closest Wins | **No** | Scores by rank among guessers, so a lone guesser always "wins" 100. It needs a solo scoring rule before it can be offered solo |

**Proposal (decision D2):**
- Add `practiceMinPlayers: 1` to those four games' lifecycle policy. The server checks it only when `official === false`.
- `minPlayers` keeps meaning "competitive".
- A Home "Play solo" shelf creates a private one-person practice room.
- Solo practice should **not** draw from the official content pool. Today, once the practice pool is exhausted, practice selection falls back to unused official items (`select.ts:160-168`). That needs a rule.

**The mismatch (F1, decision D1).** Recommended: the server refuses an *official* start with fewer than 2 players, before any content is selected. Then nothing is consumed, and the lobby says "Solo games are practice" and selects Practice automatically.

**Alternative:** let it start, but mark it `countsOfficially: false` with a note.

**Either way:**
- A failing test comes first (AGENTS.md safety rule).
- Existing finished games keep their recorded outcome.

**Presentation-only interim (safe now):** the lobby disables Official, with a reason line, when only one player is connected. The server is unchanged, so this is a guard, not a rule.

## 10. Corrections after the owner's review (2026-11-07)

1. **Results arithmetic.** The original mock showed 7 × 100 + 80 = "680", which is wrong; the sum is 780. That example was also built on a Trivia speed bonus that the server doesn't award: Trivia uses a fixed reference time, so each correct answer scores exactly 120. The mock now shows 7 × 120 = 840. Real results will always render the server's recorded scoring details (§6.8).
2. **No invented statistics.** Speed bonuses, streaks, rank movement, comebacks and superlatives are shown only when computed from recorded game data. If the data doesn't support a line, the line isn't shown.
3. **The dock isn't proven by static mockups.**
   - Before the dock ships, it must pass on a real iPhone and Android: Safari toolbars expanded and collapsed, the keyboard open (`visualViewport`), home-indicator insets, the largest text size, and an SE-class screen.
   - Stage 1 deliberately did **not** introduce the dock. Start keeps its in-flow position until that work is approved and tested.
4. **Mode state.** Shipped in stage 1:
   - the selected mode fills with its colour and shows ✓, with `aria-pressed`;
   - practice-only games and the two-player minimum for official play explain themselves, with an explicit switch.
5. **The lobby isn't dominated by secondary tools.** In the approved Lobby A, game selection, QR and sharing, player administration and advanced Cup controls live in sheets or Host tools. The lobby must not be forced onto one screen where that causes collisions or accessibility problems on small phones; scrolling is fine as long as Start stays easy to reach and respects safe areas.
6. **Championship and TV** move to the Mchezo system while keeping server-authoritative scoring, the audit history and the secrecy boundaries. They are only recoloured until the rebuild is approved.
7. **Compatibility.** Seat recovery, reconnection, active-game state, the roster and reconnection protection, and historical Cup records are preserved. An away player is never silently dropped from an official game: the readiness card names everyone who would miss it.
