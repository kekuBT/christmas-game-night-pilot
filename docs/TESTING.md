# Testing Mchezo

One entry point: `scripts/gate.mjs`. It runs the same way on Windows, macOS and Linux.

| Level | Command | What runs | Typical time |
|---|---|---|---|
| fast | `npm run gate` | typecheck (server and web), ESLint, Vitest, production build | ~20–45 s |
| targeted | `npm run gate:targeted -- math mobile` | production build + the named browser drivers | 1–5 min |
| full | `npm run gate:full` | fast + every `scripts/check-*.mjs` driver + Chromium E2E, in parallel | ~20–30 min on 3 workers (4 CPUs); `npm run gate:timings` for this machine |
| full, sequential | `npm run gate:full:sequential` | the same steps on one worker, one at a time (the reference mode) | ~85–95 min |

Use **fast** after every change and **targeted** for the subsystem you touched. Only a **full** run on the final commit counts as release verification. A fast or targeted pass is never reported as "the gate passed".

## Parallel runs and time estimates (Stage 5.2)

The full gate runs browser drivers on a bounded pool of workers. The default is `--workers=auto`: 2 workers on a 2-CPU machine, CPUs − 1 above that, at most 3, and at least 1.5 GB of available memory per worker. All of these were benchmarked; see `docs/test-optimization/README.md` §7–8. Each worker has its **own gate server** (own port, own data directory, own log), and a worker runs one step at a time, so no two steps ever share a server at the same time. Drivers that start their own servers were already isolated (port 0, a temporary data directory). Design, measurements and the isolation audit are in `docs/test-optimization/README.md`.

| Command | What it does |
|---|---|
| `node scripts/gate.mjs full` | full gate, automatic worker count |
| `node scripts/gate.mjs full --workers=2` | full gate on exactly 2 workers (`--workers=1` = one at a time) |
| `node scripts/gate.mjs full --sequential` | one worker, the old fixed order: the reference mode |
| `node scripts/gate.mjs full --plan` (`npm run gate:plan`) | prints the plan and its time estimate; runs nothing |
| `node scripts/gate.mjs timings` (`npm run gate:timings`) | each step's recorded times and full-gate estimates for 1–4 workers |
| `node scripts/gate.mjs timings --update-baseline` | rewrites `scripts/lib/gate-timings.json` from the history (commit it on purpose) |
| `--progress=<sec>` | progress and estimate every `<sec>` seconds (default 60; 0 = off) |
| `--step-timeout=<step>=<sec>` | one step's time limit (repeatable) |
| `--history=<file>` or `MCHEZO_GATE_HISTORY` | where timing history is kept (default `test-results/timing-history.jsonl`, git-ignored) |

**Estimates.** Before running, the gate prints the number of steps and drivers, the worker count, the time the same steps take one after another, the estimated time for this run as a range, the longest step, and how the estimate was made. Each step's time is its median (p10–p90 for the range) over up to 10 earlier **sequential** runs; a parallel run multiplies it by the **contention factor** measured on earlier runs with the same worker count, and replays the scheduler. The estimate is labelled `measured`, `modeled` (contention not yet measured for this worker count) or `low-confidence` (steps without history, which are named). During the run a progress block shows steps done/total, pass/fail/timeout/cancel counts, what is running on which worker, elapsed time, time remaining as a range, a likely finishing time, slow steps (well past their usual time), and when the estimate moves substantially. After the run the summary shows wall time, the sum of step times, worker utilisation, predicted vs actual, the longest steps, machine CPU and memory, and backpressure waits. Estimates are never promises.

**Timing history.** Every run appends one line to `test-results/timing-history.jsonl` (git-ignored, so no repository churn). `scripts/lib/gate-timings.json` is a committed baseline of real measured samples, so a fresh clone or CI has estimates too; it changes only when someone runs `timings --update-baseline` and commits it.

**What parallel mode adds to the guarantees below.**
- A step that times out is killed with its process group and every process carrying **its** ownership tag; other workers' steps are untouched (self-test case 11).
- Cancelling kills every worker's steps, their browsers and every worker server, and nothing else (case 16).
- Once the tree changes, no new step starts, running steps are stopped as CANCELLED, and the run is INVALID (case 13).
- Every planned step either has a status or is listed as **not run** with the reason; a run with an unexplained missing step cannot pass (case 12, where a worker's server dies).
- Each step's log lines carry the time since the step started (`[+12.3s] …`), and the report records each step's worker, start and end, CPU seconds and peak memory (Linux), browser use (contexts, pages) and rooms created on its gate server.
- Every non-passing step has a failure kind: functional, timeout, infrastructure or cancelled. The report also carries the driver's DIAG lines, and says whether the machine was short of memory or CPU while the step ran.
- The gate never retries a step. A step that fails, fails the run.

## Verdicts

| Exit | Verdict | Meaning |
|---|---|---|
| 0 | PASSED | every step passed |
| 1 | FAILED | a check failed or timed out, the run is invalid (tree changed during the run, or tracked files were modified), or a planned step did not run without an infrastructure reason |
| 2 | INFRASTRUCTURE ERROR | the environment is broken (no browser, server could not start, dependencies missing); no check failed |
| 130 | CANCELLED | Ctrl-C / SIGTERM; the run's own processes were stopped |

The summary lists every non-passing step with its first failing assertions. Each run writes `test-results/<runId>/`:

- `report.json`: revision, uncommitted files, source fingerprint, Node version, browser build and source, server port, and every step with status, duration and log path
- `summary.txt`: the verdict and the non-passing steps
- `logs/NN-<step>.log`: full output per step (lines time-stamped from the step's start), plus `server-w<N>.log` per worker server
- `screenshots/`: whatever drivers captured (they no longer write into `docs/`); one folder per step in parallel mode
- `web-dist/`: the bundle this run built and tested

`<runId>` is `<timestamp>-<commit>-<pid>`, so a log can always be traced to its exact revision.

## What the gate guarantees

- **Builds what it tests.** Every level builds the bundle from the current tree into the run directory. The tree is fingerprinted (all files under `apps/`, `src/`, `scripts/`, `tests/` and the manifests) and re-checked before each browser step and at the end. Any edit during the run makes the result `INVALID`.
- **Owns its servers.** It starts `src/server/serve.ts` once per worker, each on an OS-assigned port with a fresh data directory, and stops them at the end. It never touches a dev server you started. A worker server that dies stops scheduling: the remaining steps are listed as not run and the verdict is INFRASTRUCTURE ERROR. (A server killed by a signal is detected too; the pre-5.2 gate only noticed a non-zero exit code.)
- **Isolated runs.** Two gates can run at once: separate builds, servers, ports, data and results.
- **Hard timeouts.** Each step runs in its own process group, and every process it starts carries a run-specific environment tag. After each step, and at the end, anything still carrying the tag is killed, which catches browsers that Playwright starts in their own process group. Limits: 300 s for typecheck, lint and build, 900 s for unit tests, and per-driver budgets of about twice the measured duration (600 s default; 1800 s for `leaderboard` and E2E, 1500 s for `f5`, 900 s for `mchezo`, `tv-lifecycle` and `game-night`). `--driver-timeout=<sec>` overrides the driver limit and `--timeout=<min>` caps the whole run. A hung step is killed with its children and reported as `TIMEOUT`.
- **Infrastructure vs failure.** A browser preflight runs before any driver. A missing browser is one `INFRA` line, not 28 failures.
- **Clean tree.** A run that modifies tracked files fails.

The self-test proves each guarantee by making the gate fail on purpose in a throwaway copy of the repo:

```sh
npm run gate:selftest
```

It covers: a failing unit test, a failing driver, a hanging driver, a hanging driver whose detached child (like Playwright's browser) ignores SIGTERM and holds the step's output open, a missing browser, a source edit after the build (stale bundle), a check that edits a tracked file, two concurrent runs, and cancellation that leaves unrelated processes alone. Stage 5.2 adds the parallel cases: steps really overlap on separate workers, servers, data and screenshot folders; a failure is attributed to its own step and worker; a timeout kills only its own step while a neighbour passes; a dead worker server lists the steps that never ran; a mid-run edit stops running steps and starts nothing new; `--sequential` keeps the given order; `--plan`, progress lines, predicted vs actual and the timing history; and cancelling a three-worker run cleans up every worker.

## Browsers

Drivers launch Chromium through `scripts/lib/driver-env.mjs`, which uses the build matching the pinned Playwright (`npx playwright install chromium`); headless runs use `chrome-headless-shell`. On hosts that ship their own Chromium, set `MCHEZO_CHROMIUM_PATH`, preferably to a headless-shell build. The report records the browser version, the build kind and its source, and warns about a full Chrome build. Driver timing assumptions are calibrated on the headless shell (see DEVELOPMENT.md).

**Answering helpers (Sprint 2).** `scripts/lib/answer.mjs` answers kit question screens (Trivia, Geography, Math) by waiting on the app's observable states (`Question N of M`, `Answer locked in`, the waiting ring, results), with bounded timeouts. It never returns early silently: when an answer is not confirmed, it throws `AnswerStuckError` naming the player, the question and the state it was stuck in. `check-game-night` and `check-leaderboard` use it. `check-answer-helper` proves the behaviour on fake screens: the old fixed-sleep helper answered 0 of 3 questions on a slow app without any error.

**Failure diagnosis (Sprint 3).** `scripts/lib/diagnose.mjs` prints one `DIAG` line per player that puts what the server says next to what the screen shows. The server side covers game, status, phase, seconds to the phase and game deadlines, submitted counts, the outcome and the player's own participation. The screen side covers its label and the countdown text. Each line ends with a failure type: `server-ended-client-behind`, `deadline-overdue`, `waiting-on-players`, `client-not-on-game`, `no-game`, `server-unreachable`, or `finished-and-shown`. Every `AnswerStuckError` now carries this line. The E2E and `check-f5` loops print it for every player when a game fails, so they no longer fail with only "did not reach finished". The classifier has unit tests (`tests/diagnose.test.ts`), and its real output is checked in a browser by `check-lifecycle`.

**Deadlines in real browsers (Sprint 3).** Game time limits are minutes long, so the shared gate server runs the real durations and the drivers that run on it finish their games by playing. `scripts/check-lifecycle.mjs` starts **its own** server (free port, temporary data directory, the gate's build through `MCHEZO_WEB_DIST`) with `MCHEZO_LIFECYCLE_SCALE=0.1`. This test-only setting makes every time limit ten times shorter, and `serve.ts` refuses it when `NODE_ENV=production`. On that server the driver watches real deadlines pass and checks:
- a Trivia game ends with no host action;
- the wording for partial play and for no play;
- a player who goes offline and comes back;
- a phone clock that is 10 minutes wrong still shows the right countdown;
- a Closest question times out;
- the practice-only lobby.

Server-side deadline behaviour is covered with a fake clock in `tests/lifecycle.test.ts`, `tests/phased.test.ts`, `tests/math-timing.test.ts` and `tests/cup-integrity.test.ts`.

## Running one driver by hand

```sh
npm run build:web && PORT=3461 npm run serve     # terminal 1
node scripts/check-math.mjs http://localhost:3461 # terminal 2
```

Run by hand like this, drivers still write their reference screenshots into `docs/`, which is how those images are deliberately regenerated. Commit them only on purpose.

## Scripts that are not checks

Only the gate's verdict is evidence. The gate runs every `scripts/check-*.mjs` driver plus `scripts/e2e-browser.mjs`. Every other script in `scripts/` is listed here, and `tests/script-inventory.test.ts` fails if a new one appears without a classification.

| Script | What it is | Can it pass? |
|---|---|---|
| `gate.mjs`, `gate-selftest.mjs` | The gate itself, and its self-test (which makes the gate fail on purpose). | — |
| `screenshot-*.mjs` | Tools that write reference screenshots for visual review. | No verdict: they produce images, not a pass. |
| `content-quality/sprint-sources.ts` (`npm run content:sprint-sources`) | A report tool. It fetches the Category Sprint membership sources over the network, saves snapshots, and writes `docs/content-quality-2/SPRINT_SOURCE_CHECK.md`. Its output is evidence for a person's source check, never an approval. `tests/sprint-sources.test.ts` checks the committed snapshots offline. | No verdict: it writes a report. A fetch failure exits 1. |
| `measure-persistence.mjs` | **Stage 5.1, Phase 4.** A measurement tool: one busy Draw & Guess turn with 4, 6 and 10 players (saves, disk bytes, room file size, server CPU and memory, WebSocket bytes), then a restart and five SIGKILLs while saving. Linux only (reads `/proc`). Its numbers are in `docs/stage5-qa/README.md`. It does report recovery checks, but it is not part of the gate's verdict. | No gate verdict: a measurement. Exits 1 if a recovery check fails. |
| `clickthrough-api.mjs` | **Retired 2026-11-07.** A tombstone that always exits 2. It was a manual API playthrough from 2026-11-04 that was never in the gate and went stale as the rules changed. Its coverage map is in the file header. | **Never.** |

## CI

`.github/workflows/ci.yml` runs the same gate on GitHub (a fast run plus a `restart` + `errors` browser smoke test, or the full gate). It is manual-dispatch only until the account's Actions allowance is confirmed; pushing a branch never triggers it.

## Content in tests (Sprint 4)

- **Test content mode.** `MCHEZO_CONTENT_TEST_MODE=approve-provisional` treats provisional content as approved, so a test can play many official games in one Cup. `vitest.config.ts`, the gate server and the own-server drivers set it; production refuses it. The real approval state is tested without it (`tests/content.test.ts`).
- **Content oracle.** Games now draw their questions from content packs, so drivers can't hard-code answers. `scripts/lib/content-oracle.mjs` reads the pack files on disk and finds the right answer for whatever is on screen: trivia, geography, who-said-that options, Guess the Year years, Connections groups by their words. The server never sends answers to the browser; the oracle is test-side knowledge only.
- **Own-server drivers.** `check-lifecycle`, `check-connections` and `check-caption` each start their own server with the test time scale, so deadlines pass in seconds. They also run inside the full gate.

**Numeric input and reveals (Content Quality 2.0).**
- `check-closest` and `check-year` play on an emulated phone (Chromium with `isMobile`, `hasTouch` and a 390 px viewport; no WebKit here). They type key by key and tap, checking the keypad type (`inputmode`), values above the old limits (5,570; 2,419,200; 1066), decimals (42.195) and visible refusals (negative numbers, too many decimals, 999).
- `check-answer-reveal` plays Geography and Closest Wins on two emulated phones with a spectator TV. It checks that no answer appears while any answer can still change, and that answers (matched against the content packs) and explanations appear on phones and the TV once they are locked.
- API-level drivers send the current client protocol via `scripts/lib/protocol.mjs`; the server refuses numeric guesses from older tabs.
