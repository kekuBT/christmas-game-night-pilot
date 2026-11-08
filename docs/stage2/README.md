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
