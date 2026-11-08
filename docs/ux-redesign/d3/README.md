# D3: rules and Ready before every game (branch `claude/d3-briefing`)

**What changed:** in a room created on this branch, tapping Start opens a **briefing**, not the game.
- **Every phone shows the rules.** The rules come from each game's existing intro copy (or its one-line description), plus its real time limits.
- **No clock runs.** No question, role or answer is sent to any phone or TV until play begins.
- **Everyone taps I'm ready**, and can take it back until the game starts. Everyone sees who is ready, and whether each phone is connected.
- **The game starts for everyone at the same server instant**, the moment the last player is ready. There is no second intro.
- **The host or a cohost can use Start now** after 20 seconds. They must first confirm the people it names: those not ready, or not connected. The host doesn't have to name themself, and isn't marked ready.
- **An unstarted briefing shows a warning at 4 minutes**, with a countdown on every screen, and is cancelled at 5. Nothing is scored or used up, and everyone is told. The host can also cancel at any time.
- **Rooms created before this change keep today's behaviour** (timing version 1). Running and finished games are never changed.

This branch also contains all of Stage 1 (it starts from the verified Stage 1 code), so one codespace tests both.

Contract and rulings: [`../D3_TIMING_CONTRACT.md`](../D3_TIMING_CONTRACT.md). Decisions: D-UX-07 to D-UX-11 in `docs/DECISIONS.md`.

## Screens (Chromium phone emulation, captured by `scripts/check-briefing.mjs`)

| | |
|---|---|
| [01 phone briefing](01-briefing-phone.png) | Rules, real time limit, who is ready, I'm ready |
| [02 TV briefing](02-briefing-tv.png) | The same rules and readiness on the big screen; no controls |
| [03 Start now confirmation](03-start-now-confirm.png) | Names exactly who isn't ready; Keep waiting / Start everyone's clock |
| [04 warning](04-warning.png) | Cancellation countdown on every screen |
| [05 cancelled](05-cancelled-note.png) | Back in the lobby: "cancelled before it started" |

## Test it on your iPhone: a separate codespace, your existing ones untouched

This creates a **new** codespace for this branch, with its own server and its own test data. Your existing preview (`claude/codespaces-preview`) and the Stage 1 codespace are not changed.

1. *(Optional, saves free hours)* At **github.com/codespaces**, tap **⋯** on any running codespace, then **Stop codespace**. Stop, don't Delete.
2. In Safari, open **https://codespaces.new/kekuBT/christmas-game-night-pilot/tree/claude/d3-briefing**. Keep **2-core**, then tap **Create codespace**.
   - If GitHub offers to resume another codespace, choose **create a new one**.
   - Wait 3–5 minutes.
3. When *"Your application running on port 3000 is available"* appears, tap **Open in Browser**.
4. Type your name and tap **Host a game**. Open the same address in a **second Safari tab** (or a second device signed into the same GitHub account), and join with the code.

**What to check** (the time limits are real: 20 s and 5 min):

| # | Do this | You should see |
|---|---|---|
| 1 | Tab 1: choose **Trivia Showdown**, **Official**, then **Start** | Both tabs show **How to play**, the time limit, and "Nobody's clock is running yet". No question anywhere. |
| 2 | Tab 2: tap **I'm ready** | Tab 1 shows a green ✓ and "Ready" next to that name, and the count goes up. |
| 3 | Tab 2: tap it again | The ✓ disappears on both tabs (Ready can be taken back). |
| 4 | Tab 1: look at **Start now** | Locked, with a countdown from 20 s. Then it unlocks. |
| 5 | Tab 1: tap **Start now** | A confirmation names tab 2's player as **not ready yet** (never you). **Keep waiting** changes nothing. |
| 6 | Tab 2: tap **I'm ready**. Tab 1: tap **I'm ready** | The first question appears on both tabs together. No 8-second intro. |
| 7 | Play or sit out to finish, then Start another game and tap **Cancel game** → **Cancel the game** | Both tabs are back in the lobby with **Game cancelled … Nothing was scored**. |
| 8 | Start a game and leave it alone for 4 minutes | A yellow warning with a countdown appears on both tabs. At 5 minutes both return to the lobby with the cancelled note. |
| 9 | During a briefing, refresh tab 2 | Back on the rules, with the same Ready state. |
| 10 | During a briefing, lock the phone holding tab 2 for 10 s, then unlock | Tab 1 shows that player as **reconnecting**, then back to normal. Tab 2 is still on the rules. |
| 11 | *(Optional)* On a laptop, open the address, type the room code and tap **Watch as spectator — no seat needed** | The TV shows the same rules and who is ready, with no buttons. |

**When done:** at **github.com/codespaces**, choose **⋯ → Delete** on this codespace (or Stop it to keep it).

Note anything odd with the row number, a screenshot and the time, using `docs/device-testing/RESULTS_TEMPLATE.md` or a quick message.
