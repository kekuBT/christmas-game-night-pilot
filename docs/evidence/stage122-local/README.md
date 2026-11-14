# Stage 12.2: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

**How they ran:**
- **Drivers:** `local-driver.sh` (copied here) starts a fresh server on the worktree's built web app, with its own data dir and port and content test mode `approve-provisional`, like the gate. Then it runs one driver.
- **Unit tests:** `npx vitest run`.
- **Paths:** `$SP` stands for the session's scratch directory.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `check-content-look-r1.log` | `6ef6b2d` (spec and server) + the web work, uncommitted | 7/0 | Before this first run I corrected a mistake of mine in the new driver: it called a made-up `/rooms/:id/content` route instead of the real `/rooms/:id/season`. It was never run with the wrong route. |
| `check-one-path-s122r1.log` | + the extended check-one-path, uncommitted | 67/0 | The nudge, the undo round trip on host, guest and TV, the refusal after an official game, the Invite line, `/tv` and `/tv?code=`. |
| `vitest-s122.log` | the same tree, committed as `ccb6174` | 1778/1778 | 8 tests are new (`tests/stage122-one-path.test.ts`). Lint and both typechecks were clean too. |
| `check-one-path-s122r2.log`, `check-content-look-s122r2.log` | the tree committed as `f4fc9bd` (Stage 12.2 screens moved to their own folder) | 67/0, 7/0 | The committed screenshots come from these runs. |
