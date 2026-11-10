# Private preview of Stage 7, for an interactive audit

- **For:** ChatGPT's interactive site audits of the Stage 7 slices (Quick Party, session flow, host handover).
- **How it runs:** on a private Codespace (or any machine), with the shipped content and normal timing.
- **Keep the port Private.** No public port and nothing paid is needed.

## Start it at the exact tested revision
Replace `<SHA>` with the tested SHA from the developer handoff, and `<branch>` with the PR's branch:
- Stage 7.1 (PR #8): `claude/stage7-1-quick-party`;
- Stage 7.2 (PR #9): `claude/stage7-2-session-flow`;
- Stage 7.3 (PR #10): `claude/stage7-3-host-handover`.

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
