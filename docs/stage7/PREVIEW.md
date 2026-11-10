# Private preview of Stage 7.1, for an interactive audit

- **For:** ChatGPT's interactive site audit, which comment 6773171824 on PR #8 asks for.
- **How it runs:** on a private Codespace (or any machine), with the shipped content and normal timing.
- **Keep the port Private.** No public port and nothing paid is needed.

## Start it at the exact tested revision
Replace `<SHA>` with the tested SHA from the developer handoff on PR #8.

```bash
git fetch origin claude/stage7-1-quick-party
git worktree add --detach /tmp/mz-audit-71 <SHA>     # an isolated, clean checkout
cd /tmp/mz-audit-71
npm ci
npm run build:web
PORT=3457 MCHEZO_DATA_DIR=/tmp/mz-audit-71-data npm run serve
```

- **Codespaces:** in the Ports panel, check that port 3457 is **Private**, then open it in the browser.
- **Separate players:** each browser tab keeps its own seat (session storage). Separate tabs or windows of one browser are therefore separate players. A private window works too.
- **Clean up:** stop the server (Ctrl+C), then `rm -rf /tmp/mz-audit-71-data` and `git worktree remove /tmp/mz-audit-71`.

## A path through Stage 7.1 (about 10 minutes)
1. **Tab 1:** Home → **Host a game** (Casual is the default) → note the room code.
2. **Tabs 2 and 3:** **Join a room** with the code. Three players are now here.
3. **Tab 1 (host), plan:** **Plan a Quick Party**. The size starts at 3 and is labelled as expected; press **+** for 4, choose 30 min, then **Suggest a lineup**.
4. **Edit:** move a game, remove one, **Replace** one (only fitting games are offered), **Suggest again**. Nothing reaches the server until **Use this lineup**.
5. **Apply:** **Use this lineup**. Every tab shows the same lineup card, and the host's Start says "Start … · game 1 of N".
6. **Roster mismatches:**
   - If the first game needs 4, Start waits and the card offers **replan for 3**.
   - Otherwise Start asks "You planned for 4; 3 are here": **Start with 3**, **Replan for 3** or **Wait**.
7. **Play:** the first game goes through its rules screen (everyone taps I'm ready) to play and results. Back in the lobby, the lineup is kept with game 1 marked "started", and nothing else starts.
8. **Also worth trying:**
   - reload the host tab, and the lineup comes back;
   - in a guest tab there are no Edit or Clear controls;
   - Clear asks first;
   - a Family Cup room has no Quick Party.

Out of scope here, and arriving in the next slice: Next game, results/rematch/break controls, and advancing through the lineup.
