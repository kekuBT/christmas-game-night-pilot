# Sprint 1 Plan: Engineering Foundation & Reliability

Branch `claude/sprint-1-foundation`, started from `761e17f` (frozen handoff branch `handoff/muse-2026-11-05`).
Scope: correctness, reproducibility, persistence and privacy. No new gameplay, no visual redesign, no rule changes.

## Baseline (reproduced 2026-11-06, before any edit)

| Check | Result |
|---|---|
| `npm ci` on a clean checkout | OK (252 packages) |
| `npm run build:web` | **FAILS**: `@fontsource-variable/unbounded` is imported by `apps/web/src/main.tsx` but missing from `package.json` (the lockfile has it, so `npm ci` skips it) |
| Playwright | pinned `1.64.1` wants `chromium-1248`; a host that pre-installs a different build has no supported override, so every driver crashes at launch |
| `scripts/run-gate.sh` | every driver is `\|\| true`, exits 0 on failure, never rebuilds, timeout only between drivers, hard-coded `~/workspace` paths |
| Engine probes (audit) | disconnect stall, late joiner sees the Impostor word, one torn snapshot loses every room on restart |

## Order of work (one commit per item)

1. **A: Reproducible build.** Declare the font packages (versions already in the lockfile). Add a browser-path override (`MCHEZO_CHROMIUM_PATH`) shared by all drivers, plus a preflight that reports a missing browser as an infrastructure error. Write `docs/DEVELOPMENT.md` (clean start on Windows, macOS and Linux/cloud).
2. **B: Trustworthy gate.** `scripts/gate.mjs` (Node, cross-platform) with three levels: `fast` (typecheck, lint, unit, build), `targeted <drivers>`, `full`. Each run:
   - builds its own bundle into a per-run directory from the exact tree under test, and records a source fingerprint
   - starts its own server on a free port with its own data directory
   - sends driver screenshots to the run directory
   - fails if tracked files change
   - enforces per-step timeouts by killing the step's process group
   - exits `0` pass, `1` test failure or timeout, `2` infrastructure error, `130` cancelled
   - writes a JSON report and one log per step under `test-results/<runId>/`

   Self-tests (`scripts/gate-selftest.mjs`) prove each failure mode in a disposable copy of the repo. CI: a GitHub Actions workflow for fast checks plus a browser smoke test, triggered only on `pull_request` or manual dispatch, so pushing this branch consumes no minutes.
3. **C: Persistence.**
   - Atomic snapshot writes: temp file in the same directory, fsync, rename, then best-effort directory fsync.
   - Per-file restore with schema validation and a restore report.
   - Corrupt files are reported and left untouched, never overwritten.
   - Leftover temp files are moved to `quarantine/`, never deleted.
   - The host-claim token moves into the room snapshot as a hash (versioned envelope; v1 files still load), which removes the room/claim two-file inconsistency.
4. **D: Private information.** Players get private game state only for games they are in; everyone else gets the public projection. Audit every game projection and the `/ledger` endpoint. The ledger currently exposes other players' abstentions (contrary to L33) and live per-answer Math points.
5. **E: Bounded fixes.**
   - Math `game-finished` events always carry `official`.
   - A host claim with no claim token on record is rejected.
   - `/reconnect` no longer creates a "connected" player with no socket.
   - Socket disconnects are broadcast.
   - The client retries an intent with the **same** `clientEventId`, so server deduplication actually works.
   - A failed save returns 500 instead of a misleading 400.
6. **F: Scenario tests.** A real-server harness (HTTP + WebSocket + temp data directory) covering the 13 family-night scenarios. Tests that describe a behaviour pending an owner decision are labelled `CURRENT BEHAVIOUR (decision Dn pending)`.
7. Final: fresh clone → `npm ci` → full gate on the final HEAD → push → report.

## Test strategy

Unit and integration tests run in Vitest, both engine-level and through a real `LocalServer`. Browser drivers are unchanged except for launch and screenshot plumbing; no assertion is weakened. Every reported result names the exact commit it ran on.

## Compatibility risks

- Snapshot format v2: older code cannot read v2 files. Old v1 files are read as-is and only rewritten as v2 on their next change, never migrated in bulk.
- Clients relying on the TV projection are unchanged. Players' views of games they are not in lose private fields (intended).
- The ledger endpoint now redacts other players' abstentions and in-progress score events. The Memory Book and override audit only use `game-finished` and `score-override`, which are kept.

## Needs owner decision (not changed in this sprint; tests document current behaviour)

- **D1** Disconnected players and completion: re-check on disconnect, grace period, inclusion at Start.
- **D2** The 5-minute deadline for all games, and whether timed-out games score partially or are excluded.
- **D3** Session persistence (`sessionStorage` vs `localStorage`) and host-assisted seat recovery.
- **D4** Charades team scoring (the result is fixed by team size).
- **D5** Math speed bonus measured from game start vs per question.
- **D6** Content repetition across a 7-day Cup.
- **D7** Persistent Family Cup history beyond a single room.
