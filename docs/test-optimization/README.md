# Stage 5.2: parallel testing, performance and time estimates

Branch `claude/stage5-parallel-testing`, based on the verified Stage 5.1 head. Machine for every measurement below: a cloud container with **4 CPUs and 16 GB of memory**, Node 22.23.4, `chrome-headless-shell` 153.0.8010.12 (`MCHEZO_CHROMIUM_PATH`). "Chromium" below always means that headless shell.

> Status while this file is being written: sections marked **(pending measurement)** are filled in only from real runs. Nothing in this file is an estimate unless it says so.

## 1. The previous architecture

`scripts/gate.mjs` (Sprint 1, extended through Stage 5.1) ran every step **one after another**:

1. typecheck (server), typecheck (web), ESLint, Vitest (1,080 tests), production build;
2. a browser preflight;
3. **one** gate server (`src/server/serve.ts`, port 0, its own data directory, test content mode);
4. every `scripts/check-*.mjs` driver in alphabetical order (67 drivers at Stage 5.1), then `scripts/e2e-browser.mjs`.

Each step ran in its own process group with a hard time limit. Processes were tagged (`MCHEZO_GATE_RUN`, `MCHEZO_GATE_STEP`) so leftovers, including Chromium launched outside the group, could be swept. The source tree was fingerprinted before every step and at the end. A run that modified tracked files failed. These guarantees are kept unchanged; parallel mode adds to them (§4, §13).

30 of the 67 drivers start **their own** server (port 0, `mkdtemp` data directory), mostly to use the test time scale (`MCHEZO_LIFECYCLE_SCALE`), the real content approval state, or to kill and restart the server. The other 37 drivers and E2E shared the gate's one server.

## 2. Baseline timing measurements

Source: the `report.json` of every gate run kept on this machine (105 runs, 27 of them full gates, 2026-11-06 to 2026-11-09), plus the Stage 5.1 final gate. In every sequential run the wall time equals the sum of the step times (for example 89.8 min and 89.8 min for `4acfea7`), because nothing ran at the same time.

| Full gate | Steps | Wall time |
|---|---|---|
| `3119f179` (2026-11-06) | 40 | 67.9 min |
| `5e05a8a8` | 41 | 69.7 min |
| `e06fe92c` (2026-11-07) | 44 | 74.0 min |
| `3483e0c6` (2026-11-08) | 49 | 75.6 min |
| `b1dd5804` | 53 | 77.2 min |
| `84ed7ed0` (2026-11-09) | 59 | 79.1 min |
| `8879c3f6` (Stage 5 baseline) | 65 | 88.3 min |
| `4acfea70` (Stage 5.1, failed) | 74 | 89.8 min |
| `42367885` (Stage 5.1 final) | 74 | (pending measurement) |

The gate grew by about 1 minute per day of new drivers. CI's full-gate time limit is 100 minutes.

Per step: median of up to 10 sequential PASS samples, p10–p90 in brackets (seconds), from `node scripts/gate.mjs timings`. The 12 longest:

| Step | Median | Range | Share of the sum |
|---|---|---|---|
| check-leaderboard | 1,056 | 1,012–1,077 | 19.6% |
| e2e-chromium | 826 | 785–868 | 15.3% |
| check-f5 | 663 | 630–815 | 12.3% |
| check-game-night | 319 | 303–335 | 5.9% |
| check-audit-fixes | 219 | 208–230 | 4.1% |
| check-pulse-timing | 160 | (1 sample) | 3.0% |
| check-tv-lifecycle | 151 | 143–158 | 2.8% |
| check-lifecycle | 127 | 121–134 | 2.4% |
| check-mchezo | 109 | 104–114 | 2.0% |
| check-caption | 106 | 76–111 | 2.0% |
| check-briefing | 93 | 88–98 | 1.7% |
| check-tv-reveal | 81 | 73–85 | 1.5% |

The other 62 steps sum to about 24 minutes; 40 of them take under 30 s. Fast steps: typecheck 5 + 5 s, lint 8 s, unit tests 24 s, build 4 s.

Machine load during a sequential run: the 1-minute load average was **0.2 on 4 CPUs** while a 4-player browser driver ran. The gate spends most of its time waiting for game time to pass, not computing.

Per-step CPU seconds, peak memory, browser contexts and pages, and rooms created: (pending measurement; the new gate records them, §5).

## 3. Root causes of slow execution

1. **Everything sequential.** Wall time = sum of step times, while the machine sat ~95% idle.
2. **Three drivers were 47% of the time** (leaderboard, E2E, F5).
3. **`check-leaderboard`: 712 of 1,077 s was neither gameplay nor briefing.** Mapping its room's ledger to its run: games took 15–57 s, but the gaps between games were ~96 s (275 s after game 1). After each game the driver read every TV row's rank-movement chip and every phone row's gain chip with `textContent()`. Rows that legitimately have no chip (no movement, no gain) waited out **Playwright's 30 s default timeout** before the `.catch(() => "")` returned "". About 20 such waits per run.
4. **E2E and F5 kit questions (Trivia, Geography, Math):** each player's answer loop probed for buttons that are usually absent ("Back to lobby", "Waiting for the game to finish", "Next question") with 0.5–1 s waits, plus fixed sleeps: about 3.5 s per question per player in E2E and about 9 s per question round in F5. Trivia took 112 s, Math 112 s, Geography 88 s inside F5 alone.
5. **Real game time on the shared server, kept on purpose.** Majority Rules reveals each round for 10 s, Draw & Guess for 8 s; `check-game-night` waits for a real time limit on purpose (a disconnect never ends a game early). These are what the drivers test; they are not shortened.
6. **Setup repeated per driver**: each driver launches its own Chromium (~0.5 s) and 30 start their own server (~1–2 s). About 1–2 minutes in total; kept, because it is what isolates them.
7. **Fast checks in sequence**: typecheck ×2, lint, unit tests and build ran one after another (~45 s).

What looks like duplication but is kept: E2E and F5 both play all 14 games through the UI in one room, but they assert different things (§6).

## 4. Parallel scheduler architecture

(See `scripts/gate.mjs`, `scripts/lib/gate-plan.mjs`.)

- **Phases.** (1) The fast checks and the build run on the worker pool. (2) The browser preflight runs once. (3) One gate server per worker starts, in parallel. (4) Browser drivers and E2E run on the pool.
- **Pool.** `--workers=N` slots (`auto`: CPUs − 1, at most 3, at least 1.5 GB of available memory per worker; `--sequential` = 1 worker and the old order). Each step occupies `weight` slots (default 1); an `exclusive` step occupies all of them.
- **Queue order.** Sequential mode keeps the old order (alphabetical drivers, then E2E). Parallel mode puts exclusive steps first (nothing is in flight yet, so they cost no drain time), then **longest first** by historical median (LPT), ties by name.
- **Strict order.** A step starts only when it is at the head of the queue and enough slots are free; nothing jumps ahead. `simulate()` replays exactly this policy for the estimates.
- **Backpressure.** With at least one step running, a new step waits while the 1-minute load average exceeds the CPU count or available memory is under 1 GB. With nothing running it always starts, so the pool cannot stall. Waits are counted in the report.
- **No retries.** A failed step fails the run.
- **Stopping.** A dead worker server, a changed tree, or cancellation stops new starts; steps never started are listed as **not run** with the reason.

## 5. Isolation strategy

| Resource | Sequential gate | Parallel gate |
|---|---|---|
| Gate server | one, shared by all 37 shared-server drivers and E2E | one **per worker**; a worker runs one step at a time, so no two steps ever share a server at the same time |
| Server data directory | `server-data/` | `server-data/w<N>/` |
| Port | OS-assigned | OS-assigned per server |
| Own-server drivers (30) | port 0 + `mkdtemp` | unchanged (audited: every one uses port 0 and a private temporary directory; `check-tv-outage` re-binds its own port after a simulated outage, see §15) |
| Browser | one Chromium per driver | unchanged |
| Screenshots | `screenshots/` | `screenshots/<step>/` |
| Logs | `logs/NN-<step>.log` | same, lines time-stamped; one `server-w<N>.log` per worker |
| Ownership tags | run + step | run + step + worker server; a step's sweep matches only its own tag |
| Room identities | random per room | unchanged; never shared across drivers |
| Per-IP limits on the server (e.g. recovery requests per address) | shared by every driver on the one server | shared only by drivers that run one after another on the same worker |

Why per-worker servers rather than one shared server: every driver connects from 127.0.0.1, and the server keeps per-address budgets (host-assisted recovery requests, join attempts per room). Sharing one server between concurrent drivers would let one driver's requests count against another's. With one server per worker, each server sees a subset of what the sequential gate's single server saw, in sequence.

## 6. Test coverage comparison

(pending measurement: per-driver check counts in a sequential run vs the parallel runs.)

Driver changes in Stage 5.2, and what each keeps:

| Driver | Change | Coverage |
|---|---|---|
| `check-leaderboard` | Waits for the TV board's `data-phase="after"` (where movement chips render), then reads optional chips without auto-waiting; the fixed 3 s settle wait is replaced by the same phase wait. | Same checks, same values. Stronger: a board that never reaches "after" now fails at that wait instead of silently reading "no movement". |
| `e2e-browser` | Kit questions answered through `scripts/lib/answer.mjs` (option 0, as before); the finished-check is a check, not a 0.5 s wait. | Same games, same option, same end state. Stronger: an answer that is not confirmed throws `AnswerStuckError` with a DIAG line instead of looping silently. |
| `check-f5` | Kit-question probes are checks, not 0.5–1 s waits; still one action per player per pass, so players stay interleaved question by question. | Same interleaving, same assertions. |

## 7. Worker configuration

(pending measurement.)

## 8. Benchmark results

(pending measurement.)

## 9. Sequential versus parallel runtime

(pending measurement.)

## 10. Time-estimation methodology

- **Base durations.** Each step's median, and p10–p90 for the range, over up to 10 earlier PASS samples from **sequential** runs (`test-results/timing-history.jsonl`, topped up from the committed baseline `scripts/lib/gate-timings.json`, which was seeded from the 105 earlier runs on this machine). Failed or timed-out steps never count as samples.
- **Contention.** A run with k > 1 workers records its contention ratio: the median over its steps (longer than 5 s, at least 5 of them) of actual / base duration. Estimates for k workers use the median of earlier ratios at k. With none, the factor is **modeled** (1 + 0.1 per extra worker, range 1 to 1 + 0.3 per extra worker) and labelled so.
- **Schedule.** The queue is replayed through `simulate()` (the runner's own policy) with low, mid and high durations, giving a range and a midpoint.
- **During the run.** Remaining time = the simulated finish of the still-queued steps plus what running steps have left (a step past its estimate is assumed to need at least 15 s or 15% of the time it has used, never 0). The block is printed every `--progress` seconds; a step running well past its usual range is named as slow; a move of the total estimate by more than 20% (and 2 minutes) is reported.
- **Labels.** `measured` (every step has 3+ samples and the contention factor was measured), `modeled` (contention not measured for this worker count), `low-confidence` (steps with fewer than 3 samples, named).
- **After the run.** Wall time, sum of step times, per-worker busy time and utilisation, predicted vs actual, the longest steps, CPU and memory of the machine, backpressure waits; one history line per run.

## 11. Predicted versus actual durations

(pending measurement.)

## 12. Reliability and flakiness results

(pending measurement.)

## 13. Failure and cleanup verification

(pending: `node scripts/gate-selftest.mjs`.)

## 14. Passing gate: revision and run ID

(pending.)

## 15. Remaining performance bottlenecks

(pending measurement.)
