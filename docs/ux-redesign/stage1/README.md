# Stage 1: approved fixes (branch `claude/ux-stage1-fixes`)

**Scope:** the narrowly scoped work you authorised on 2026-11-07. The Home and Lobby migration, Championship, TV and the eleven games are **not** rebuilt here.

| # | Fix | Where | Kind |
|---|---|---|---|
| D1 | The server refuses official games with fewer than 2 competitors, **before** content is chosen (409 `OFFICIAL_NEEDS_TWO`). The lobby explains why and offers an explicit **"Play it as practice instead"**; it never switches modes silently. Old one-player official games keep their stored record, but no longer report that they count. | `src/server/room.ts`; `apps/web/src/App.tsx`; `tests/official-two-competitors.test.ts` (failing first: commit `8a1b699`) | Rule (approved) |
| F2 | The room-code Share button opens an **invite sheet**: QR code, code, native **Share…** (where the browser has one), **Copy link** with visible feedback, the link shown when copying isn't possible, and an honest note on private-preview and localhost links. | `ui/mchezo/components/InviteSheet.tsx`, `lib/share.ts`, `phone/screens.tsx` | Presentation |
| F3 | **Official/Practice** is a segmented choice directly above Start. The selected mode fills (Official yellow, Practice mint) with a ✓ and `aria-pressed`. Practice-only games and the 2-player minimum explain themselves. | `ui/mchezo/components/Choice.tsx`; `App.tsx` | Presentation |
| F5 | **Advance to next day** asks first ("Day 1 closes for good…"). **Not yet** changes nothing. Server refusals are shown, no longer swallowed. | `components/ChampionshipView.tsx` | Presentation |
| V1/V6 | The lobby title no longer overlaps the Cup badge. The cause: the children of a fixed-height screen were shrinking. The up-next name wraps inside the centre disc, and seat tokens fit the ring gap. Checked at 5 sizes, with 10 players and long names. | `ui/mchezo/styles/mchezo.css` | Presentation |
| V2 | Document background, `theme-color` and title are Mchezo (`#16111D`, "Mchezo"). Remaining legacy screens use the Night Circle palette, so nothing green remains. | `apps/web/index.html`, `apps/web/src/index.css` | Presentation |
| F7 | No more Sound switch that does nothing. The setting now says "Mchezo doesn't play any sounds yet." | `components/SettingsBar.tsx` | Presentation |
| F8 | **Animations Full / Less / Off** applies on every screen, including the landing page and TV/spectator. **Off** stops all motion. The phone's own Reduce Motion is still the floor. | `App.tsx`, `MchezoProvider.tsx`, `mchezo.css` | Presentation |

**Tests added:**
- `tests/official-two-competitors.test.ts` (5);
- `tests/stage1-ui.test.ts` (9);
- browser driver `scripts/check-lobby-fixes.mjs` (28 checks, picked up by the gate automatically).

**Existing hooks:** all kept (`mode-official`, `mode-practice`, `start-<mode>-<game>`, `practice-only-note`, `settings-bar`, the "Share room code …" accessible name, "Advance to next day"). New hooks are listed in the driver.

## Before and after (Chromium phone emulation, 390×664)

| Before | After |
|---|---|
| Title over the Cup badge ([evidence](../evidence/lobby-iphone-safari-390x664.jpg)) | [01-lobby-top-alone](01-lobby-top-alone.jpg), [04-lobby-top-5-players](04-lobby-top-5-players.jpg) |
| Official and Practice identical ([evidence](../evidence/mode-practice-selected.jpg)) | [05-official-selected-start](05-official-selected-start.jpg), [03-practice-selected](03-practice-selected.jpg) |
| One-player official game allowed, then didn't count | [02-official-needs-two](02-official-needs-two.jpg) |
| Share did nothing | [06-invite-sheet-copied](06-invite-sheet-copied.jpg) |
| Green settings card, dead Sound switch ([evidence](../evidence/settings-legacy-card.jpg)) | [07-settings](07-settings.jpg) |
| Advance day: one tap, no confirmation | [08-advance-day-confirm](08-advance-day-confirm.jpg) |
| Green Championship ([evidence](../evidence/championship-legacy.jpg)) | [09-championship-recoloured](09-championship-recoloured.jpg) (layout unchanged until its rebuild is approved) |

Re-capture with `node docs/ux-redesign/stage1/capture-after.mjs http://localhost:PORT` against `npm run serve:device-test`.

**Still the same, by design:**
- Start is still at the end of a long lobby. Lobby A (sheets, a compact layout) is the next approval.
- Rules still auto-start after 8 s; D3 is a contract awaiting approval (`../D3_TIMING_CONTRACT.md`).
- There is no fixed bottom dock yet.

## Test it on your iPhone: a separate Codespace, your old one untouched

Your existing preview (`claude/codespaces-preview`) is not changed. This creates a **second, separate** codespace with its own server and its own test data.

1. *(Optional, saves free hours)* Open **github.com/codespaces**, tap **⋯** on your existing codespace, then **Stop codespace**. Stop, don't Delete; it resumes later exactly as it was.
2. In Safari, open:
   **https://codespaces.new/kekuBT/christmas-game-night-pilot/tree/claude/ux-stage1-fixes**
   Keep **2-core**, then tap **Create codespace**. If GitHub offers to resume an existing codespace, choose **create a new one** for this branch. Wait 3–5 minutes.
3. When *"Your application running on port 3000 is available"* appears, tap **Open in Browser**. Or copy the `Codespaces preview … app.github.dev` address from the Terminal.
4. Type your name, then tap **Host a game**.

**What to check:**

| # | Do this | You should see |
|---|---|---|
| 1 | Look at Safari's top and bottom bars; scroll a little | Dark plum, not green |
| 2 | Top of the lobby | The title sits *below* the "Family Cup · Day 1 of 7" badge, not over it. Your token doesn't touch the "Up next" circle. |
| 3 | Tap the room code (with the share icon) | The **Invite players** sheet, with a yellow **Private preview link** note, the QR code and code, then **Share…** and **Copy link** |
| 4 | Tap **Copy link** | Green "Link copied." Paste it somewhere to check. **Share…** opens the iOS share sheet. (Remember: only you can open this private link.) |
| 5 | Scroll to the bottom. Choose **Word Connections** under "Game setup", then tap **Official** | Official fills **yellow with ✓**. A yellow card explains **Official games need at least 2 players**, with **Play it as practice instead**. Start reads "Waiting for players (1/2)". |
| 6 | Tap **Play it as practice instead** | Practice fills **mint with ✓**, the card goes away, and Start is ready. You can play a solo practice round. |
| 7 | Open the address in a **second Safari tab**, join with the code, then go back to tab 1 | Official no longer shows the card, and Start is enabled. Start an official game and play it in both tabs. Results say it counts. |
| 8 | **This phone → Animations:** tap **Off**, reload | Nothing moves (the landing ring stops spinning). **Less** gives short fades. Set it back to **Full**. The Sound line says Mchezo has no sounds. |
| 9 | iOS Settings → Accessibility → Motion → **Reduce Motion** on, then back to Mchezo | Fades only, even with Full selected. Turn it off afterwards. |
| 10 | Lobby → **Championship** → **Advance to next day** | The **"End Day 1 and start Day 2?"** confirmation. **Not yet** leaves Day 1. Confirming moves to Day 2. (Do this only in this test codespace.) |

**When done:** `github.com/codespaces` → **⋯** → **Delete** on the stage-1 codespace (or Stop it to keep it). Then resume your old one if you like.

Note anything odd with the row number, a screenshot and the time, using `docs/device-testing/RESULTS_TEMPLATE.md` or a quick message.
