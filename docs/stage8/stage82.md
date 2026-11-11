# Stage 8.2: Everyday and Christmas themes, and seasonal content kept apart

**Instruction:** ChatGPT's clearance of Stage 8.1 and handoff on PR #12 (comment 6795218622), under the owner's standing authorization D-WF-01.
**Branch:** `claude/stage8-2-themes-seasonal`, from `0f3cc54` (PR #12's cleared head), stacked on PR #12. Linked: #12, #5.
**Roadmap:** `docs/MILESTONES.md`, item 1 after Stage 8.1. Home Screen installation is next, then Jebena Rush, then Spectrum.

This spec comes first. The inventory (§1) and the catalog audit (§8) were made on `0f3cc54` before any change.

## 1. What is there today (`0f3cc54`)

### 1.1 Themes and appearance
- **Two themes exist in code, and only one is ever shown.**
  - `apps/web/src/ui/mchezo/tokens/tokens.ts` defines `everyday` (id `everyday`) and `christmasFamilyCup` (id `christmas`), with the same structure: 22 colour tokens, a ring style and four reactions.
  - Christmas changes colour and decoration only: a pine ground, cranberry brand, a wreath ring and a "brr" reaction.
  - Every surface hard-codes `themes.everyday`: 36 places in `App.tsx`, plus `ConnectionOverlay.tsx` and the unused `TvDashboardParts.tsx`. **The Christmas theme never renders.**
- **There is no appearance control and nothing is stored.**
  - The settings sheet has Animations only (`localStorage` `cgn_anim`).
  - No theme key is kept on the device or the server, and no query parameter sets one.
- **Theme variables live on `.mz-root` only.**
  - `MchezoProvider` sets them inline on its own `div`.
  - The document background, `<meta name="theme-color">` (a static `#16111D`) and the legacy variables in `index.css` (`--bg`, `--panel`, `--gold`, …; D-UX-04) are hard-coded Everyday values.
- **The legacy shell still renders some screens.**
  - Gameplay for Category Sprint, Who Said That?, Impostor and Charades.
  - The old intro, waiting and Cup results screens.
  - Its header reads "🎄 Christmas Game Night" in every room, Everyday ones included.
- **Smaller gaps:**
  - `--mz-danger` is used but never defined (only fallbacks).
  - A few chrome colours are hard-coded in CSS.
  - The Memory Book's share image uses the old "Midnight Christmas" colours.
  - Contrast is checked for Everyday only (`check-contrast.mjs`).
- **Earlier decisions that still hold:**
  - **L35:** Everyday is the year-round platform look; the Family Cup is shown as event data, not as a skin.
  - **A10 (Stage 6.1):** the theme does not depend on whether a room is casual or a Cup.
  - **L31:** no new visual system without the owner's direction. This stage completes the existing Christmas theme; it designs nothing new.

### 1.2 Content and selection
- **Items have no season field.** The only signal is a free-text `category` ("Christmas", "Festive"), and nothing filters on it. `tags` exist but selection never reads them.
- **Solo and casual rooms draw from every practice-usable item.** This is `selectForVariety` (Stage 7.4, D-S74-01): unused first, then least recently used.
  - So Christmas boards are dealt in everyday play. Example: `con-legacy-1` and `con-s4-03` are 2 of the 13 Word Connections boards in solo.
- **Draw & Guess prompts are a list in code** (`draw-prompts.ts`, 70 prompts). Three are Christmas: `dg-002` reindeer, `dg-003` candy cane, `dg-004` gingerbread house. Majority Rules has none.
- **No room setting could carry a content choice.** Rooms persist `kind`, `name`, `cup`, `contentUsage`, `contentSeq`, `party` and `session`. A missing field is filled with a default in `fromJSON`.
- **Starts are already identity-checked** (Stage 7.2, 7.4):
  - A casual press carries `attempt {id, sessionRevision}`.
  - A replay returns the original game; a press made against an older revision is refused.
  - A briefing freezes its items (`pendingContent`, by hash) and checks them again when play begins.

### 1.3 Catalog audit (summary; §8 has the item list)

| Game | Items | Christmas-only | Usable in solo/casual | Notes |
|---|---|---|---|---|
| Trivia | 143 | 11 | 11 | `trv-fest-101…110`, `trv-lite-046` (*A Christmas Carol*) |
| Word Connections | 13 | 2 | 2 | `con-legacy-1`, `con-s4-03` |
| Caption Clash | 40 | 8 | 8 | `cap-legacy-1…5`, `cap-s4-005`, `-006`, `-028` |
| Charades | 84 | 9 | 9 | `chr-legacy-1…6`, `chr-s4-032`, `-062`, `-076` |
| Impostor | 68 | 6 | 6 | `imp-legacy-1…6` (their shown hint is "Christmas") |
| Category Sprint | 29 | 2 | 1 | `spr-s4-015`; `spr-legacy-3` is rejected |
| Closest Wins | 59 | 1 | 1 | `cls-k-27` |
| Guess the Year | 53 | 3 | 2 | `year-s4-044`, `-045`; `year-s4-043` is rejected |
| Who Said That?, Geography | 92 | 0 | 0 | |
| Draw & Guess (in code) | 70 | 3 | 3 | `dg-002`, `-003`, `-004` |
| **All** | **651** | **45** | **43** | |

**What counts as Christmas-only:** the item names Christmas itself, or something only Christmas has. That covers Santa, reindeer, sleighs, the Christmas tree and its decorations, crackers, mince pies, candy canes, gingerbread, *A Christmas Carol*, "Silent Night" and the Twelve Days.

**What stays year-round:** winter and snow, presents and gifts (birthdays), facts about December, turkey, *The Nutcracker* as a ballet question, and the first SMS (a technology fact whose explanation quotes "Merry Christmas"). §8 lists every borderline call.

## 2. Goals (from the handoff)
1. **Complete the Everyday and Christmas themes on every surface:**
   - home and library;
   - solo shelf, round and results;
   - casual lobby, briefing, games, results, break and handover;
   - TV;
   - Cup and Memory Book.
   Reuse the tokens and the circle-and-dots logo. Keep Stage 8.1's sizing, contrast, touch targets, reduced motion and answer privacy. No broad component rewrite.
2. **Separate a device's look from a session's content.**
   - A guest changing their phone's look never changes the room's content.
   - New solo and casual sessions are Everyday unless Christmas is chosen.
   - The choice is shown before Start, kept through replay, reload and reconnect, and bound at start.
3. **Seasonal eligibility comes from content metadata, never from text matching.**
   - Everyday excludes Christmas-only items. Christmas uses the seasonal pool plus eligible general items.
   - Unused-first and least-recently-used order is kept among the eligible items.
   - Small pools behave deterministically. Cup selection and history are unchanged.
4. **Validate through the normal entry points**, with focused regressions. Emulated results and real devices are labelled apart.

## 3. Design

### 3.1 Two choices, kept apart

| | **Look** (device appearance) | **Content** (session content) |
|---|---|---|
| What it changes | Colours and decoration on this device only | Which items a solo or casual game may deal |
| Values | **Match the game** (default), **Everyday**, **Christmas** | **Everyday** (default), **Christmas** |
| Who sets it | Anyone, on their own device (Settings) | Solo: the player, on the shelf. Casual: the host or a cohost, in the lobby (as for the game choice). Cup: not offered (§3.4). |
| Where it is kept | This device only (`localStorage` `mz_look`). Never sent to the server. | On the server: the room's `contentSeason`, persisted. Solo also remembers the last choice on the device (`mz_solo_season`). |
| Bound at start | — | Yes. Each game records the content it was started with, and so does its frozen briefing (§3.4). |

**Match the game** works as follows:
- In a solo or casual session whose content is Christmas, the device shows the Christmas look. Otherwise it shows Everyday.
- So choosing Christmas content shows on every phone and the TV at once, while any device can still pin its own look.
- Nothing runs the other way: a look never changes content. The server never receives a device's look, so two phones with different looks see the same room, the same content and the same answers.
- Cup rooms show Everyday under Match the game (L35, A10). A device can still choose Christmas for itself.

### 3.2 Seasonal metadata
- **The new field.** Every content item may carry `season: "christmas"`. No field means year-round.
  - The schema is a closed enum, `z.enum(["christmas"]).optional()` in `BaseItem`, so a typo fails loading. Another season can be added to the enum later.
  - `DrawPrompt` gets the same optional field.
- **Tagging.** The 45 items in §8 are tagged in their packs. Ids, text, answers, status, eligibility, provenance and pack versions are not changed.
- **The season is left out of the content hash**, like `review`:
  - The hash binds an approval to what players see and answer. The season only says where an item may be dealt, and Cup selection never reads it.
  - Tagging or re-tagging therefore never voids an approval, and never cancels a frozen briefing on a hash mismatch.
  - A test pins that tagging leaves every shipped item's hash unchanged.
- **Audit safety net (text only, never a filter).** `npm run content:check` reports any item whose words look Christmas-specific (the §8 word list) but which has no tag and is not on a reviewed year-round list.
  - It is a review warning only, so a new Christmas item can't slip into Everyday unnoticed. A unit test keeps the shipped library free of such warnings.
  - The game itself never matches text.

### 3.3 Selection (server)
- **Every content selection for a solo or casual game names a season,** `everyday` or `christmas`. `selectForVariety` refuses a request without one (a programming error, not a fallback). In order:
  1. **Eligible pool:**
     - **Everyday:** practice-usable items without `season: "christmas"`.
     - **Christmas:** every practice-usable item.
  2. **Order** (unchanged rotation, seeded shuffle as the tie-break):
     1. never used before used;
     2. among the never used, Christmas items first in a Christmas session, so Christmas content leads;
     3. then least recently used.
  3. **Small pool:** items repeat within one game only when the pool is smaller than the game needs (as before), and the reasons say so.
     - An empty eligible pool refuses the start with a plain message ("No Everyday content is available for this game yet"). It never falls back to the other season.
     - No shipped game has an empty Everyday pool. Fewest: Connections 11 boards, Sprint 25 categories, Year 45.
  4. **Reasons:** the `content-selected` ledger event records the season. Example: `variety pool (casual room, everyday): 7 unused of 11 eligible, Christmas-only excluded`.
- **Draw & Guess:** `init` takes the season. An Everyday game deals from the 67 year-round prompts; a Christmas game deals Christmas prompts first.
  - Cup games pass no season and keep today's full list.
- **Cups are unchanged.** Official and practice selection in a Cup room ignore `season`, and the selector refuses a season on a Cup request. Christmas items stay in the Christmas Family Cup.
  - The Cup test that pins pre-Stage-7.4 picks (`stage74-content-variety.test.ts`) still passes unchanged.

### 3.4 The session's content (server)
- **Room state.** `contentSeason: "everyday" | "christmas"` exists on solo and casual rooms. It is persisted, projected to every member and the TV, and defaults to `everyday`.
  - Cup rooms have none; the projection omits it.
- **Casual: `POST /rooms/:id/season {season, baseRevision}`.** Host or cohost only.
  - Refused in a Cup room.
  - Refused if `baseRevision` isn't the session's current revision (the presser saw an older room).
  - On success it bumps the session revision, so any start pressed before the change is refused as stale.
  - It is idempotent: setting the current value again changes nothing.
  - It takes effect for the **next** start. A game in progress, and a briefing already frozen, keep the content they started with.
- **Casual start.** The start body carries `season`, the content the presser saw. The server refuses a mismatch with the room's current content: 409 `CONTENT_CHANGED`, "The host changed the content to Christmas. Check and press Start again."
  - With the revision check, a retry can't silently switch eligibility.
  - A replayed attempt still returns its original game, whose content was bound at its first acceptance.
- **Solo start.** The solo room has one player, so the start body's `season` is the choice. The server stores it on the room and binds it to the game.
  - A replay of the same attempt with a different season is refused as a different press (`ATTEMPT_MISMATCH`).
  - The device remembers the last solo choice and re-sends it after a reload, so "Play again" keeps it.
- **Bound at start.**
  - Each game records `season`, so Play again and rematch can show what was played.
  - A frozen briefing records `pendingContent.season`.
  - When play begins, the re-check (`pendingItems`) also checks each frozen item against that season. A briefing frozen under an older build has no season and is checked as Everyday, so an Everyday room never begins play with a Christmas-only item. A failure cancels the briefing with the existing content-changed notice.
- **Rematch and the Quick Party lineup** use the room's current content. The lineup holds games, not content.
- **The ledger** gets a `content-season-changed` event (actor, from, to, revision) when the host changes it.

### 3.5 Compatibility
- **Existing rooms** (snapshots without `contentSeason`) restore as `everyday`.
  - A casual or solo room that used to be dealt Christmas boards now gets year-round ones until Christmas is chosen. That is the intended change (MILESTONES, review 6786060026).
  - Usage history is kept, so the rotation continues among the eligible items.
- **Cup rooms, their history, their ledger and their standings** are untouched.
- **Persisted values added:**
  - room `contentSeason`;
  - game `season`;
  - `pendingContent.season`, optional because the persistence schema is strict;
  - device `localStorage` `mz_look` and `mz_solo_season`.
  None is required on read; an absent value means `everyday` (or "Match the game" for the look).
- **Old clients:** a start body without `season` is accepted with the room's current content. The app always sends it, so this only covers a page loaded before an upgrade. An unknown value is refused with a 400.

### 3.6 The themes on every surface (client)
- **One look, worked out once.** A pure `resolveLook(pref, sessionKind, contentSeason)` gives `everyday` or `christmas`. App and Solo pass the result to every `MchezoProvider` instead of `themes.everyday`.
- **The page follows the look.** The page background, the browser toolbar colour (`theme-color` meta), `color-scheme`, and the legacy `--bg`/`--panel`/… variables are set from the same tokens on `<html>`. So the legacy shell, the overscroll area and the status bar match.
- **Legacy shell header.** It shows the circle-and-dots wordmark and the room's name in the current look. The 🎄 shows only in the Christmas look.
  - It no longer says "Christmas Game Night" in an Everyday room. The Cup room's own default name is unchanged; that is event data.
- **Token gaps closed:**
  - `--mz-danger` is defined in both themes (contrast checked).
  - Chrome colours hard-coded in CSS use tokens.
  - The Memory Book share image uses the current look's tokens instead of the retired Midnight Christmas colours. Its words and file names are unchanged.
  - Game artwork keeps its own colours (covers, Pattern Pulse keys, Draw & Guess pens). They identify games and stay readable on both grounds.
- **Christmas decoration stays what the theme already defines:** the wreath ring (lobby circle, TV circle), the cranberry and pine palette, and the "brr" reaction. No new art, no motion, nothing over the answer areas.
- **Contrast.** A unit test checks every token pair the design handoff names, in both themes:
  - text, muted text, success and highlight on ground and both surfaces: at least 4.5:1;
  - on-accent on each answer colour: at least 4.5:1;
  - danger on the ground and both surfaces: at least 4.5:1.
  The browser contrast check also runs in the Christmas look.
- **Unchanged:** reduced motion and Animations Off, Stage 8.1's sizing and touch targets, and every projection and answer-privacy rule.

### 3.7 Where the content choice is shown
- **Solo shelf:** an "Everyday / Christmas" choice above the games, with one line on what it changes. The shelf's look follows it under Match the game. Each game's Start uses it.
- **Solo round and results:** a small "Christmas content" label when Christmas is chosen. Play again keeps the choice.
- **Casual lobby:**
  - **Host and cohost:** a two-way choice (Everyday, Christmas) beside the game choice, above Start, with the note "Changes what's dealt for the next game."
  - **Guests and the TV:** see the current content as a label. They cannot change it.
- **Briefing:** a line naming the content this game was frozen with, e.g. "Christmas content".
- **What's next and casual results:** the content the next Start will use. Changing it is in the lobby.
- **Settings (every device):** "Look: Match the game / Everyday / Christmas", with the note "Only changes how this device looks. It never changes what anyone is dealt."

## 4. Must stay as it is
- Cup selection, eligibility, usage, ledger and standings, and every official rule.
- Content ids, text, answers, approval statuses, provenance, hashes and pack versions.
- Answer privacy and per-player projections. The look is never sent; the room's content is public (it isn't a secret).
- Stage 8.1's layout, sizes, the 44 px minimum touch targets (52 px on the solo shelf's Start), reduced motion, and the font-robust shelf checks.
- Stage 7.x start identity, rematch and handover behaviour.

## 5. Validation plan
- **Unit tests** (`tests/stage82-seasonal.test.ts`, new):
  - Schema: the season enum accepts `christmas` and refuses a typo.
  - The shipped tags match §8 exactly. Hashes are unchanged by tagging. The audit warning list is empty.
  - Everyday never deals a Christmas-only item, in any game, over many seeds and rooms. Christmas deals seasonal items first, then general, with LRU. A small or empty pool is deterministic. A Cup refuses a season and its picks are unchanged.
  - Draw & Guess: Everyday excludes the three prompts; a Cup is unchanged.
  - Room, over HTTP:
    - casual season set and refused (guest, Cup, stale revision);
    - a start refused on mismatch;
    - a replay returns the bound game;
    - solo season bound and kept through Play again;
    - a restart keeps the room and game season;
    - an old snapshot defaults to Everyday;
    - a frozen briefing re-checks season;
    - the look never reaches the server (no endpoint accepts it).
  - `resolveLook` and the token-contrast pairs in both themes.
- **Browser driver** (`scripts/check-themes-seasonal.mjs`, new; Chromium emulation):
  - solo shelf to Connections in both content modes, with replay, a reload and a server restart;
  - a casual room with two phones on different looks, a host change of content, a guest refused, the TV label, and an interrupted Start retried after a change;
  - 320 and 390 portrait, landscape, desktop and TV, in both looks, with reduced motion and contrast.
- **Regression drivers:** casual, lobby fixes, session flow, briefing, solo, solo shelf, content variety, mobile everyday, contrast.
- **Gates:** fast, then full, one after the other, on the final clean commit.
- **Screenshots:** before (`0f3cc54`) and after, at the same sizes.
- **Labelling:** everything above is emulation. Real iPhone Safari, Android Chrome and WebKit are not available here.

## 6. Choices and real ambiguities (for review)
1. **Look default "Match the game"** (Christmas content shows the Christmas look on every device unless a device pins one). The alternative, Everyday unless a device picks Christmas, would make a Christmas session look the same as any other.
2. **Cup rooms look Everyday under Match the game, and keep their full content.** This follows L35 and A10. If the owner wants the Family Cup to wear the Christmas look by default, it is a one-line change to `resolveLook`. Cup selection stays untouched either way.
3. **Christmas sessions deal unused Christmas items first,** then general ones, then least recently used. Without this, a Christmas Connections game would show a Christmas board 2 times in 13.
4. **The season is outside the content hash** (§3.2). Otherwise tagging 45 items would void approvals and cancel briefings frozen before an upgrade.
5. **Borderline classification** (§8): winter, presents, December facts, turkey, *The Nutcracker* and the first SMS stay year-round; "Decorating a tree" is Christmas.
6. **A content change applies to the next start.** A frozen briefing keeps its content. There is no mid-game switch.
7. **The host and a cohost can change content,** the same rule as choosing the game.
8. **Existing casual and solo rooms become Everyday** (§3.5).
9. **The legacy shell header** loses "Christmas Game Night" in Everyday rooms. That shell's layout is unchanged otherwise; it is not rebuilt in this stage.
10. **The solo choice is remembered per device,** like personal bests.

## 7. What was built and tested
To be filled in when the milestone is complete.

## 8. Catalog audit: every item considered
Text matching was used **only** to find candidates for this review. The game filters on the `season` tag alone.

**Tagged `season: "christmas"` (45):**
- **Trivia (11):**
  - `trv-fest-101`, `-102`, `-103`, `-104`, `-105`, `-106`, `-107`, `-108`, `-109`, `-110` (Festive: Santa, stockings, reindeer, the Twelve Days, mistletoe, Rudolph, candy canes);
  - `trv-lite-046` (who wrote *A Christmas Carol*).
- **Word Connections (2):**
  - `con-legacy-1` (Christmas foods, Christmas decorations, reindeer names);
  - `con-s4-03` ("On a Christmas tree", "Santa's reindeer").
- **Caption Clash (8):**
  - `cap-legacy-1` … `-5` (category Christmas);
  - `cap-s4-005` (a reindeer at flying school);
  - `cap-s4-006` (the Christmas tree redecorates itself);
  - `cap-s4-028` (Santa's sleigh gets a parking ticket).
- **Charades (9):**
  - `chr-legacy-1` … `-6` (category Christmas);
  - `chr-s4-032` (decorating a tree);
  - `chr-s4-062` (pulling a cracker);
  - `chr-s4-076` (a reindeer pulling a sleigh).
- **Impostor (6):** `imp-legacy-1` … `-6`. Their hint shown to players is "Christmas", including Fireplace and Snowflake.
- **Category Sprint (2):** `spr-s4-015` "Christmas things"; `spr-legacy-3` "Christmas things" (rejected, tagged for completeness).
- **Closest Wins (1):** `cls-k-27` (gifts in the Twelve Days of Christmas).
- **Guess the Year (3):** `year-s4-044` (*A Christmas Carol*), `year-s4-045` ("Silent Night"), `year-s4-043` (first Christmas card; rejected, tagged for completeness).
- **Draw & Guess (3):** `dg-002` reindeer, `dg-003` candy cane, `dg-004` gingerbread house.

**Reviewed and kept year-round (on the audit's reviewed list):**
- **Caption Clash:**
  - `cap-s4-003` (snowman at the beach)
  - `cap-s4-004` (the dog in charge of the turkey)
  - `cap-s4-010` (car won't start on holiday morning)
  - `cap-s4-016` (garden gnome on holiday)
- **Category Sprint:**
  - `spr-s4-008` (things that are cold)
  - `spr-s4-011` (birds, including turkey)
  - `spr-cs-asia`, `spr-cs-wc2026`, `geo-s4-010` (Turkey, the country)
  - `spr-cs-nfl`, `spr-cs-us-states` (Carolina)
- **Charades:** `chr-s4-003` (making a snowman), `chr-s4-012` (wrapping a present), `chr-s4-058` (opening a present you don't like).
- **Closest Wins:** `cls-legacy-8`, `cls-c-09` (days and hours in December).
- **Guess the Year:**
  - `year-s4-015` (the first SMS)
  - `year-s4-031`, `-032`, `-037`, `-042` (events in December)
- **Impostor:** `imp-s4-045` … `-054` (hint "Winter").
- **Trivia:**
  - `trv-legacy-02`, `trv-ever-099` (December in the calendar)
  - `trv-arts-061` (*The Nutcracker*'s composer)
- **Who Said That?:** `who-s4-006` (a snowman), `who-s4-016` and `who-s4-029` (presents).
- **Draw & Guess:** `dg-001` snowman, `dg-005` … `dg-012` (mitten, scarf, sled, fireplace, present, bell, candle, cookie), `dg-041` igloo, `dg-051` tree.
