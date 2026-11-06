# Testing Mchezo

One entry point: `scripts/gate.mjs`. It runs the same way on Windows, macOS and Linux.

| Level | Command | What runs | Typical time |
|---|---|---|---|
| fast | `npm run gate` | typecheck (server and web), ESLint, Vitest, production build | ~20 s |
| targeted | `npm run gate:targeted -- math mobile` | production build + the named browser drivers | 1–5 min |
| full | `npm run gate:full` | fast + every `scripts/check-*.mjs` driver + Chromium E2E | ~60–75 min |

Use **fast** after every change and **targeted** for the subsystem you touched. Only a **full** run on the final commit counts as release verification. A fast or targeted pass is never reported as "the gate passed".

## Verdicts

| Exit | Verdict | Meaning |
|---|---|---|
| 0 | PASSED | every step passed |
| 1 | FAILED | a check failed or timed out, or the run is invalid (tree changed during the run, or tracked files were modified) |
| 2 | INFRASTRUCTURE ERROR | the environment is broken (no browser, server could not start, dependencies missing); no check failed |
| 130 | CANCELLED | Ctrl-C / SIGTERM; the run's own processes were stopped |

The summary lists every non-passing step with its first failing assertions. Each run writes `test-results/<runId>/`:

- `report.json`: revision, uncommitted files, source fingerprint, Node version, browser build and source, server port, and every step with status, duration and log path
- `summary.txt`: the verdict and the non-passing steps
- `logs/NN-<step>.log`: full output per step, plus `server.log`
- `screenshots/`: whatever drivers captured (they no longer write into `docs/`)
- `web-dist/`: the bundle this run built and tested

`<runId>` is `<timestamp>-<commit>-<pid>`, so a log can always be traced to its exact revision.

## What the gate guarantees

- **Builds what it tests.** Every level builds the bundle from the current tree into the run directory. The tree is fingerprinted (all files under `apps/`, `src/`, `scripts/`, `tests/` and the manifests) and re-checked before each browser step and at the end. Any edit during the run makes the result `INVALID`.
- **Owns its server.** It starts `src/server/serve.ts` on an OS-assigned port with a fresh data directory, and stops it at the end. It never touches a dev server you started.
- **Isolated runs.** Two gates can run at once: separate builds, servers, ports, data and results.
- **Hard timeouts.** Each step runs in its own process group, and every process it starts carries a run-specific environment tag. After each step, and at the end, anything still carrying the tag is killed, which catches browsers that Playwright starts in their own process group. Limits: 300 s for typecheck, lint and build, 900 s for unit tests, and per-driver budgets of about twice the measured duration (600 s default; 1800 s for `leaderboard` and E2E, 1500 s for `f5`, 900 s for `mchezo`, `tv-lifecycle` and `game-night`). `--driver-timeout=<sec>` overrides the driver limit and `--timeout=<min>` caps the whole run. A hung step is killed with its children and reported as `TIMEOUT`.
- **Infrastructure vs failure.** A browser preflight runs before any driver. A missing browser is one `INFRA` line, not 28 failures.
- **Clean tree.** A run that modifies tracked files fails.

The self-test proves each guarantee by making the gate fail on purpose in a throwaway copy of the repo:

```sh
npm run gate:selftest
```

It covers: a failing unit test, a failing driver, a hanging driver, a hanging driver whose detached child (like Playwright's browser) ignores SIGTERM and holds the step's output open, a missing browser, a source edit after the build (stale bundle), a check that edits a tracked file, two concurrent runs, and cancellation that leaves unrelated processes alone.

## Browsers

Drivers launch Chromium through `scripts/lib/driver-env.mjs`, which uses the build matching the pinned Playwright (`npx playwright install chromium`); headless runs use `chrome-headless-shell`. On hosts that ship their own Chromium, set `MCHEZO_CHROMIUM_PATH`, preferably to a headless-shell build. The report records the browser version, the build kind and its source, and warns about a full Chrome build. Driver timing assumptions are calibrated on the headless shell (see DEVELOPMENT.md).

**Known driver weakness (not fixed in Sprint 1).** Several drivers' answering helpers (e.g. `answerAllTrivia` in `check-game-night.mjs`) return silently when the UI is slower than expected, leaving questions unanswered. The run then fails later on an unrelated-looking wait. The failure is real, but the report points at the wrong place. Making those helpers fail where answers are lost is a Sprint 2 test-quality item.

## Running one driver by hand

```sh
npm run build:web && PORT=3461 npm run serve     # terminal 1
node scripts/check-math.mjs http://localhost:3461 # terminal 2
```

Run by hand like this, drivers still write their reference screenshots into `docs/`, which is how those images are deliberately regenerated. Commit them only on purpose.

## CI

`.github/workflows/ci.yml` runs the same gate on GitHub (a fast run plus a `restart` + `errors` browser smoke test, or the full gate). It is manual-dispatch only until the account's Actions allowance is confirmed; pushing a branch never triggers it.
