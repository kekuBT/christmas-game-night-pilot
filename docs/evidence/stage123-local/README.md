# Stage 12.3: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

**How they ran:**
- **Drivers:** `local-driver.sh` (copied here) starts a fresh server on the worktree's built web app, with its own data dir and port and content test mode `approve-provisional`, like the gate. Then it runs one driver.
- **Unit tests:** `npx vitest run`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) unit tests, first full run | the Stage 12.3 server change, uncommitted | **6 FAIL (expected)** | Six older tests asserted "Quick Party is casual-only" (stage71 ×3, stage121, stage122, stage72-session-flow). Each was updated to the new rule with a Stage 12.3 note. |
| `check-cup-party-s123r1.log` | the web work, uncommitted | **19 pass, 3 FAIL** | **A real gap:** a Cup's Math Mayhem results had no What's next (Cup results use the older results screen). Fixed by adding the panel there, only while a Cup runs a lineup. |
| `check-cup-party-s123r2.log` | + that fix | **25 pass, 1 FAIL** | **A driver bug:** the casual planner's kicker renders in capitals, so a case-sensitive match failed. Its TV screenshot showed **a layout bug**: a six-game lineup pushed the Family Cup card under the director's buttons. Fixed: a Cup lobby shows three lineup games and how many more. A layout check was added. |
| (no log) unit tests after the rebase onto Stage 12.2 | `bb1ce9e` + decisions | **1 FAIL (expected)** | `stage72-client` asserted a Cup's TV feed has no lineup. Updated to the new rule: the lineup is there, and never a break. |
| `vitest-s123.log` | the same tree, after that update | 1787/1787 | Lint and both typechecks were clean too. |
| `check-cup-party-s123r3.log`, `check-quick-party-s123r3.log`, `check-one-path-s123r3.log` | the tree committed as Stage 12.3's tested revision | 28/0, 68/0, 67/0 | The committed screenshots come from this check-cup-party run. |
