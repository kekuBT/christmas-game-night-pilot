# Stage 2 "Night Circle": Home B, Lobby A, the visual library, real addresses (branch `claude/stage2-night-circle`)

**What changed** (presentation and navigation only; no server rule, score, eligibility, content approval or Cup record changed):

- **Home B (games first).**
  - The wordmark, today's featured game (a plain daily rotation, not a recommendation), and a shelf of covers for all 11 games.
  - **Join with a code** and **Host a party** are always in the bottom dock.
  - A **Rejoin** card appears only when this tab really holds a seat. It also says when a game is in progress or about to start.
  - No rankings, recommendations or recent activity are shown: nothing is invented.
- **Join** (`/join?code=…`, where QR and invite links now point) fills in the code. **Host** (`/host`) asks for your name first, so nobody hosts as "Player 1" (audit A-04).
- **Lobby A (stage and dock).**
  - **Top:** the room code with **Invite**, the Cup day, and the room menu (☰).
  - **Middle:** "You're in, …", an honest headline ("Everyone's here" or "Waiting for 1 more"), and the Circle, where a check means the server says that player will be in the next game.
  - **Below the Circle:** the up-next game with its cover and **Change**, then Official / Practice.
  - **Bottom:** **Start** in a dock that stays above Safari's toolbar. Errors and confirmations show right above Start, so a refused Start is never off screen.
  - **Guests** see who will start.
- **Sheets** (each has its own address, so Back or a swipe closes it first):
  - **Invite:** QR, code, Share, Copy link.
  - **Pick a game:** covers, filters, 🎲 Surprise me, Smart shuffle.
  - **Room menu:** TV, Family Cup, Memory Book, all games, motion, This device, Reconnect, Mchezo home, and host tools (cohosts, Studio).
  - **Game details:** pitch, players, estimate vs real time limit, practice-only reason, and **Make this up next** for hosts.
- **Library.** Covers first, search always on screen, the rarer filters behind **Filters**, active filters as removable chips with **Clear filters** (also in the empty state), and practice-only games marked.
- **Back.** Browser Back, the in-app back arrow and iOS swipe-back agree:
  - **A sheet** closes first.
  - **The Cup or the library** returns to the lobby.
  - **The lobby** goes Home with **Rejoin**. The seat, connection and any running game keep going, and the timer keeps running, as the card says.
  - **A reload** keeps you on the same screen. A seated phone that reloads Home goes back to its room.

Decisions: D-UX-14 to D-UX-20 in `docs/DECISIONS.md`. Design: `docs/ux-redesign/PROPOSAL.md` §1–§7 and the mockups next to it.

## Screens (Chromium phone emulation, captured by `scripts/check-stage2.mjs`)

Phone sizes 375 (iPhone SE / mini class), 390 (iPhone 15), 430 (Pro Max); tablet 768; laptop 1440. iOS Safari itself is not available in this environment: these are Chromium renders, not iPhone screenshots.

| | |
|---|---|
| [Home 375](home-375.png) · [390](home-390.png) · [430](home-430.png) | Featured game, covers, the Join/Host dock |
| [Game details](home-details-390.png) | Pitch, chips, estimate vs real limit |
| [Host](host-390.png) | Name first (A-04) |
| [Join from a QR link](join-qr-390.png) | Code already filled in |
| [Lobby, host, 2 players: 375](lobby-host-375.png) · [390](lobby-host-390.png) · [430](lobby-host-430.png) · [768](lobby-host-768.png) · [1440](lobby-host-1440.png) | Code + Invite, Cup day, ☰; the Circle; up next; mode; Start dock |
| [Lobby, 10 players with long names: 375](lobby-host-10-375.png) · [390](lobby-host-10-390.png) · [430](lobby-host-10-430.png) · [768](lobby-host-10-768.png) · [1440](lobby-host-10-1440.png) | A full room |
| [Lobby, guest](lobby-guest-390.png) | "Waiting for Keku to start" |
| [Invite](invite-390.png) · [Pick a game](choose-390.png) · [Room menu](menu-390.png) | The three lobby sheets |
| [Library](library-390.png) | Covers, search, Filters |
| [Home with Rejoin](home-rejoin-390.png) | After Back from the lobby: the seat is kept |
| [A QR link to another room while seated](join-while-seated-390.png) | Explained; no second seat |
| [Journey: question](journey-question-375.png) · [results](journey-results-390.png) | Home → Host → Invite → Choose → Briefing → Play → Results |

## Test it on your iPhone: a separate codespace, your existing ones untouched

This creates a **new** codespace for this branch, with its own server and its own test data. Existing previews and codespaces are not changed.

1. *(Optional, saves free hours)* At **github.com/codespaces**, tap **⋯** on any running codespace, then **Stop codespace**. Stop, don't Delete.
2. In Safari, open **https://codespaces.new/kekuBT/christmas-game-night-pilot/tree/claude/stage2-night-circle**. Keep **2-core**, then tap **Create codespace**.
   - If GitHub offers to resume another codespace, choose **create a new one**.
   - Wait 3–5 minutes.
3. When *"Your application running on port 3000 is available"* appears, tap **Open in Browser**. Keep the port **private** (the default); don't make it public.
4. You land on **Home**. Use a second Safari tab as a second player. The preview address only opens for your GitHub account, so other people's phones can't join it (the Invite sheet says so).

**What to check first** (in this order):

| # | Do this | You should see |
|---|---|---|
| 1 | Look at Home without scrolling | The wordmark, **Featured today** with a cover, a row of covers, and **Join with a code / Host a party** at the bottom, above Safari's toolbar. Swipe the row of covers sideways. |
| 2 | Tap a cover, then swipe back from the left edge | The game's details slide up; the swipe closes them and you stay on Home. |
| 3 | **Host a party**, then try **Host a game** without typing | It stays greyed out and says to type your name. Type a name, then host. |
| 4 | In the lobby, look without scrolling | Code + **Invite**, the Cup day, ☰, "You're in, …", the Circle with you at the bottom, the up-next card, Official/Practice, and **Start** at the bottom. Start should not hide behind Safari's toolbar, and scrolling should still work. |
| 5 | Tap **Invite**, then swipe back | The QR sheet opens; the swipe closes it, and you are still in the lobby. |
| 6 | Tab 2: open the link from **Copy link** | Join opens with the code already filled in. Type a name and join. Tab 1's Circle shows the new player with a ✓. |
| 7 | Tab 1: **Change** → pick a game; then ☰ → **All games** → **Filters** → **Team**; then **Clear filters** | The picked game is up next. The library shows only the team game, then all 11 again. |
| 8 | Tab 1: ☰ → **Family Cup**, then swipe back | Back in the lobby, not in the menu. |
| 9 | Tab 1: swipe back from the lobby | Home, with **Rejoin room …** at the top. Tap **Rejoin**: you're back in the same seat. |
| 10 | Start a game, play a question, swipe back to Home, then Rejoin | The game kept going ("Its clock keeps running" on the Rejoin card) and you are back in it. |
| 11 | Pull down to refresh in the lobby, then in the Cup | Each screen comes back as it was. |
| 12 | ☰ → **This phone → Animations → Off**, then iOS Settings → Accessibility → Motion → Reduce Motion | Nothing slides or bounces in either case. |

**When done:** at **github.com/codespaces**, choose **⋯ → Delete** on this codespace (or Stop it to keep it).

Note anything odd with the row number, a screenshot and the time, using `docs/device-testing/RESULTS_TEMPLATE.md` or a quick message.

## Limitations

- **Not verified on a real iPhone.** Safari's toolbar, the swipe-back gesture and the keyboard were exercised in Chromium emulation only (Back is emulated with `history.back()`).
- **Join from a QR link** fills in the code but does not yet show "Room found · Keku's party · 4 here" before the name (PROPOSAL §6.3): that needs a public room-preview endpoint, which is a server change left for a later stage.
- **Solo practice** on Home waits for decision D2.
- **The old full-page views** (Championship, Memory Book, the TV dashboard, older games' results) keep their look; Stage 2 only reaches them through the room menu. Rebuilding them is out of scope.
- **The screenshot scripts outside the gate** (`scripts/screenshot-*.mjs`) still drive the Stage 1 landing page and were not migrated.
