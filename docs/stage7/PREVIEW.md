# Private preview of Stage 7, for an interactive audit

- **For:** ChatGPT's interactive site audits of the Stage 7 slices (Quick Party, session flow, host handover, content variety), Stage 8.1 (mobile usability and solo presentation) and Stage 8.2 (Everyday and Christmas looks, seasonal content kept apart).
- **How it runs:** on a private Codespace (or any machine), with the shipped content and normal timing.
- **Keep the port Private.** No public port and nothing paid is needed.

## Start it at the exact tested revision
Replace `<SHA>` with the tested SHA from the developer handoff, and `<branch>` with the PR's branch:
- Stage 7.1 (PR #8): `claude/stage7-1-quick-party`;
- Stage 7.2 (PR #9): `claude/stage7-2-session-flow`;
- Stage 7.3 (PR #10): `claude/stage7-3-host-handover`;
- Stage 7.4 (PR #11): `claude/stage7-4-content-variety`.
- Stage 8.1 (PR #12): `claude/stage8-1-mobile-solo`.
- Stage 8.2 (PR #13): `claude/stage8-2-themes-seasonal`.

```bash
git fetch origin <branch>
git worktree add --detach /tmp/mz-audit <SHA>     # an isolated, clean checkout
cd /tmp/mz-audit
npm ci
npm run build:web
PORT=3457 MCHEZO_DATA_DIR=/tmp/mz-audit-data npm run serve
```

- **Codespaces:** in the Ports panel, check that port 3457 is **Private**, then open it in the browser.
- **Separate players:** each browser tab keeps its own seat (session storage). Separate tabs or windows of one browser are therefore separate players. A private window works too.
- **The TV:** on another tab, **Join a room** → enter the code → **Watch as spectator**.
- **Clean up:** stop the server (Ctrl+C), then `rm -rf /tmp/mz-audit-data` and `git worktree remove /tmp/mz-audit`.

## Stage 8.1: mobile usability and solo presentation (about 10 minutes)
Use the browser's device emulation for phone sizes (320×640, 390×844, and 844×390 for a phone held sideways), or real phones on the same network.
1. **The solo shelf:** Home → **Play solo**. On a phone: compact cards, a small square cover beside each game's words, two Start buttons on a 390×844 screen. On a laptop: all three games side by side, every Start on the first screen.
2. **Pattern Pulse's game clock:** Start **Pattern Pulse**, play round 1. The screen before round 2 shows **Game time left** and says it keeps running between patterns, even now. It is the server's time: change the computer's clock a few minutes and reload; the time left stays right.
3. **Time up on that screen** (optional, about 30 s): a second server with a short game window, testing only:
   ```bash
   PORT=3459 MCHEZO_DATA_DIR=/tmp/mz-short-data MCHEZO_LIFECYCLE_SCALE=0.1 npm run serve
   ```
   Solo Pattern Pulse, then wait on its first screen without pressing anything: the clock shows the warning tone with "Running low"; at 0:00 **Show me the pattern** is replaced by "The game's time is up. Your results are on their way.", then the results. The server refuses `MCHEZO_LIFECYCLE_SCALE` when `NODE_ENV=production`.
   Then again, but stop that server a few seconds before 0:00: the screen says the game server isn't answering and offers **Check again** (and Leave round). Start it again with the same data directory and press Check again: the results.
4. **Sideways (844×390):** Pattern Pulse's tap-back screen shows all six shapes and **Lock it in** without scrolling; Math Mayhem shows all four answers.
5. **Casual room with long names** (24 characters, e.g. "Wolfeschlegelsteinhausen"): lobby, rules screen (**I'm ready** waits at the bottom while the rules scroll), Pattern Pulse (one game clock on each screen), results with **What's next** on the first screen, **Play again**.

## Stage 7.4: content variety and the cancel wording (about 10 minutes)
1. **Solo, shipped content:** Home → **Play solo** → **Word Connections**. Play a board (or leave it), then **Play again** a few times.
   - Each board should be one you haven't had in this solo room. With 13 shipped boards, a repeat comes only after all 13, oldest first.
   - Before Stage 7.4, normal mode cycled 12 of the 13 boards and never dealt the approved legacy one; with every board approved (the gate's test mode), it dealt the same board every time.
2. **Casual room, Ada and Bea:** play Word Connections, then on the results **Play again** → in the briefing **Cancel game**.
   - The question says **"You'll go back to the Word Connections results."**, and that is where both tabs go.
   - Then **Back to lobby** → start any game → **Cancel game**: it says **"You'll go back to the lobby."**
3. **Play again** (now played): a board this room hasn't used.
4. **Optional, a small controlled pool** (testing only, as the browser check runs it): one practice-only board, two approved and one rejected.
   ```bash
   node -e "import('./scripts/lib/small-pool.mjs').then((m) => m.writeSmallPool('/tmp/mz-pool'))"
   PORT=3458 MCHEZO_DATA_DIR=/tmp/mz-pool-data MCHEZO_CONTENT_DIR=/tmp/mz-pool npm run serve
   ```
   Solo Word Connections four times: three different boards, then the first again; the rejected one never. The server refuses `MCHEZO_CONTENT_DIR` when `NODE_ENV=production`.
5. **A server restart** (stop it, start it again with the same data directory), then **Play again** in the same solo tab: it starts. Before Stage 7.4 every solo Start after a restart was refused ("Need at least 1 connected players").

## Stage 7.3: hand the host role over (about 10 minutes)
1. **Tab 1 (Ada):** Home → **Host a game** (Casual is the default). **Tabs 2 and 3 (Bea, Cal):** join with the code. **Tab 4:** watch as the TV. The TV marks Ada as host.
2. **Bea's room menu:** no "Players and roles" tools.
3. **Ada's Room menu → Players and roles:** **Make host** next to Bea → read the question → **Cancel** (or Escape). Nothing changed.
4. **Ada:** **Make host** next to Bea → **Make Bea the host**.
   - Every tab shows who did what.
   - Ada's Start is gone and she waits for Bea; Bea has the Start.
   - The TV marks Bea and says Bea starts the next game.
5. **Bea:** start a game; everyone plays; on the results, only Bea has What's next.
6. **Bea:** **Take a break**, back to the lobby, then hand the host role back to Ada from the menu. The break is kept; only Ada sees **Resume**.
7. **Also worth trying:**
   - reload Ada's and Bea's tabs: still exactly one host;
   - close Cal's tab, then the host's menu: Cal is "not connected" and can't be chosen;
   - in a Family Cup room there is no Make host.

## Stage 7.2: results and what's next
A two-game lineup (Quick Party), played through: the casual results screen with What's next under the result heading, Next game, Play again, Take a break / Resume, and a game picked by hand that leaves the lineup untouched.

## Stage 7.1: Quick Party
Plan a lineup (size, 15/30/60 minutes, suggest, edit, apply). Start says "game 1 of N". A lineup for 4 with 3 here asks first.

## Stage 8.2: Everyday and Christmas looks, seasonal content kept apart (about 15 minutes)
Use phone sizes (320×640, 390×844, 844×390) and a laptop. Separate tabs are separate devices for seats; the **look** is kept per browser (localStorage), so use a private window, or another browser, for a phone with a different look.
1. **Solo:** Home → **Play solo**. The shelf says **Content: Everyday**, in the everyday colours.
   - Choose **Christmas**: the page turns pine and cranberry, including the browser's toolbar colour. The note says only Word Connections changes.
   - Reload: Christmas is kept.
   - Start **Word Connections**: a Christmas board (Christmas foods, decorations, reindeer, or "On a Christmas tree"), labelled "Christmas content". Play again: the other Christmas board.
   - Choose **Everyday** on its start screen: year-round boards only.
2. **A casual room, two phones:** the host chooses **Word Connections**. Both see "Everyday content" on the up-next card; only the host has the **Content** choice.
   - The guest opens the room menu → **Look → Christmas**: only the guest's phone changes. The room still says Everyday.
   - The host chooses **Christmas**: both phones and the TV say "Christmas content". The host's phone and the TV turn Christmas (Match the game).
   - The guest sets **Look → Everyday**: their phone turns everyday, and the room still deals Christmas.
3. **Start:** the briefing says "Christmas content" and the board is a Christmas one. **Sit this game out** on both phones; What's next says Christmas; **Play again** keeps it.
4. **Back to Everyday** in the lobby: the next game deals a year-round board. A guest's reload keeps both the room's content and their own look.
5. **A server restart:** stop the server and start it with the same data directory. Reload: the solo and casual content choices are kept.
6. **A Family Cup:** host a Cup. It stays in the everyday look under Match the game, and its content is unchanged (Christmas items stay in the Cup). A phone set to **Look → Christmas** shows it in Christmas colours.
