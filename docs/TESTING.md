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
