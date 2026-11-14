# Stage 12.1: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

**How they ran:**
- **Drivers:** `local-driver.sh` starts a fresh server (its own data dir and port, content test mode `approve-provisional`, like the gate) on the worktree's built web app, then runs one driver.
- **Unit tests:** `npx vitest run`.
- **Paths:** `$SP` stands for the session's scratch directory.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| `check-casual-run1.log`, `check-f4-run1.log` | one-path web work, uncommitted | no checks ran | **My harness mistake:** these drivers need a server's address (the gate passes one), and I ran them without one (`ERR_CONNECTION_REFUSED`). That's why `local-driver.sh` exists. |
| `check-casual-run2.log` | same | **24 pass, 1 FAIL** | **A real bug:** "Family Cup: Start is Official by default" failed after "Make it a Family Cup". The casual room's stored up-next plan (always practice) carried over. |
| `check-f4-run2.log` | same | **FATAL** | Same bug: `start-official-math-mayhem` never appeared. |
| `check-casual-run3.log`, `check-f4-run3.log` | + the fix (the server sets the stored plan to Official; the host's phone follows) | 30/0, 11/0 | The fix holds. It's committed in `baaa18c`, with a unit test. |
| `unit-server.log` | `ba36c46`, server upgrade | 1752/1752 | |
| `check-one-path-run1.log` | TV work, uncommitted | **22 pass, 2 FAIL** | **Driver bugs:** kicker labels render in capitals (a text match needed `/i`), and the host phone was still on results when the driver waited for the lobby. |
| `check-one-path-run2.log` | + driver fixes | 47/0 | Its screenshot showed **a product bug**: the Cup view said "No Cup points yet" with three players tied on 50. |
| `check-one-path-run3.log` | + `cupPodium` (shared lead = shared gold) and a driver check | 48/0 | |
| `unit-tv.log` | TV work | 1770/1770 | Lint and both typechecks were clean too. |
| `check-tv-show-tv1.log`, `check-tv-dashboard-tv1.log` | TV work | 29/0, 10/0 | The existing TV drivers' assertions on finals still hold. |
| `check-one-path-run4.log` | `5bc3a13` (journey screenshot names, sheet wait) | 48/0 | Screenshots from this run were replaced by run 7's. |
| `wi-dump.log` | `5bc3a13` + a temporary dump of W8's differences (reverted) | W8 FAIL ×4 | Every Everyday difference behind the early full gate's W8 failure: the 12 intended element keys only. |
| `wi-run2.log` | `ce3e0a8` (W8 accepts those exact keys only if they reuse a base style) | ALL PASSED | |
| `check-contrast-podium1.log` | podium fix (solid base under each gradient) | exit 0 | **Didn't exercise the fix:** its random game ended "Everyone tied", so no podium was drawn. That's why check-one-path got a deterministic podium-contrast check. |
| `check-one-path-run5.log` | podium fix | 48/0 | |
| `check-one-path-run6.log` | podium fix + new checks: podium numbers 3:1 (check-contrast's rule), empty steps show no number | 50/0 | Podium numbers measured 12.76, 9.78 and 8.55:1. |
| `check-one-path-old-css.log` | the same driver, with `ce3e0a8`'s stylesheet built in temporarily (restored and rebuilt after) | **48 pass, 2 FAIL (expected)** | The new checks catch the gate's failure (1.00:1) and the dark numbers on empty steps. |
| `check-one-path-run7.log` | `aebbb29` (final candidate) | 50/0 | The committed journey screenshots come from this run. |
| `wi-negative.log` | `ce3e0a8` + a temporary recolour of the new menu row's detail text (reverted, rebuilt) | **W8 FAIL ×2 (expected)** | The guard still catches a real Everyday colour change on a listed element. |

**Also here:** the before/after screenshot scripts (`compare-shots.mjs`, `compare-run.sh`).
