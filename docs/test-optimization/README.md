# Stage 5.2: parallel testing, performance and time estimates

Branch `claude/stage5-parallel-testing`, built on the verified Stage 5.1 head `5a4454c`. Nothing was merged or deployed. No port was made public, and nothing was paid for.

**Measurement machine:** a cloud container with 4 CPUs and 16 GB of memory, Node 22.23.4, and `chrome-headless-shell` 153.0.8010.12 (through `MCHEZO_CHROMIUM_PATH`). "Chromium" below means that headless shell. "Measured on 2 CPUs" means the gate and everything it started were pinned to 2 of those 4 CPUs with `taskset`. That is the same CPU speed with half the cores, and memory was not limited. It is not a real 2-core machine.

Every number below comes from a real run, and each one says which run it came from. Model output is labelled as modelled.

## Summary

| | Before (the existing sequential gate) | After |
|---|---|---|
| Full gate wall time | **95.4 min** (Stage 5.1 final, `0a3964f`, run `20261110-003130-0a3964f3-11617`) | **{{F3_WALL}}** on 3 workers (run `{{F3_RUN}}`) |
| Sum of step times | 95.4 min | {{F3_SUM}} |
| Same work, 2 workers on 2 CPUs | – | {{F2_LINE}} |

Two changes do the work, and neither removes a test:
- **A bounded parallel scheduler** runs the drivers on 3 workers by default on this machine, each worker with its own gate server.
- **Unnecessary waits removed from three drivers:** `check-leaderboard`, E2E and `check-f5`. They waited out Playwright's 30 s default on optional elements, or probed for absent buttons with 0.5–2 s waits. Their step time fell from 45 to 23 minutes, with the same checks.

## 1. The previous architecture

`scripts/gate.mjs`, from Sprint 1 to Stage 5.1, ran every step **one after another**:
1. typecheck (server and web), ESLint, Vitest (1,080 tests), and the production build;
2. a browser preflight;
3. **one** gate server (`src/server/serve.ts`, port 0, its own data directory, test content mode);
4. the 67 `scripts/check-*.mjs` drivers in alphabetical order, then `scripts/e2e-browser.mjs`.

Each step ran in its own process group, with a hard time limit. Ownership tags in the environment let it sweep leftovers, including Chromium, which Playwright starts outside the group. The tree was fingerprinted before each step and at the end, and a run that changed tracked files failed. The parallel gate keeps all of this (§13).

30 drivers start **their own** server (port 0, a `mkdtemp` data directory) for the test time scale, the real content approval state, or a server kill. The other 37 drivers and E2E shared the gate's one server.

## 2. Baseline timing measurements

**Sources:** the `report.json` of every gate run kept on this machine (111 runs, 32 of them full gates, 2026-11-06 to 2026-11-10). In every sequential run, wall time equals the sum of the step times, because nothing overlaps.

| Full gate | Steps | Wall time |
|---|---|---|
| `3119f179` (2026-11-06) | 40 | 67.9 min |
| `e06fe92c` (2026-11-07) | 44 | 74.0 min |
| `3483e0c6` (2026-11-08) | 49 | 75.6 min |
| `84ed7ed0` (2026-11-09) | 59 | 79.1 min |
| `8879c3f6` (Stage 5 baseline) | 65 | 88.3 min |
| `0a3964f3` (Stage 5.1 final) | 74 | **95.4 min** |

The gate grew by roughly 7 minutes a day as drivers were added. CI's full-gate limit is 100 minutes.

**Per step:** the median of up to 10 sequential passes, with the range in brackets (seconds). These are the 12 longest:

| Step | Median | Range | Share |
|---|---|---|---|
| check-leaderboard | 1,073 | 1,012–1,127 | 19% |
| e2e-chromium | 831 | 785–975 | 15% |
| check-f5 | 814 | 630–855 | 15% |
| check-game-night | 319 | 303–335 | 6% |
| check-audit-fixes | 218 | 208–230 | 4% |
| check-pulse-timing | 161 | 152–169 | 3% |
| check-tv-lifecycle | 151 | 143–158 | 3% |
| check-lifecycle | 128 | 121–134 | 2% |
| check-mchezo | 109 | 104–114 | 2% |
| check-caption | 76 | 76–111 | 1% |
| check-briefing | 93 | 88–98 | 2% |
| check-tv-reveal | 83 | 73–85 | 1% |

The other 62 steps sum to about 24 minutes, and 40 of them take under 30 s. The fast steps take 5 + 5 s (typecheck), 8 s (lint), 24 s (unit tests) and 4 s (build).

**Resource use per driver** (CPU seconds, peak memory including Chromium, browser contexts and pages, rooms) is in §8. It was measured by the new gate. The old gate recorded none of it.

**Machine load:** with the old gate, the 1-minute load average was 0.2 on 4 CPUs while a 4-player driver ran. The machine was about 95% idle.

## 3. Root causes of slow execution

1. **Everything ran in sequence.** Wall time equalled the sum of step times while the machine sat nearly idle.
2. **Three drivers were 49% of the time:** the leaderboard, E2E and F5.
3. **`check-leaderboard`:** 712 of its 1,077 s was neither gameplay nor briefing.
   - Its room's ledger showed games of 15–57 s, but gaps of about 96 s between games, and 275 s after the first.
   - After each game, the driver read every TV row's rank-movement chip and every phone row's gain chip with `textContent()`.
   - Rows that rightly have no chip waited out **Playwright's 30 s default** before `.catch(() => "")` returned "". That happened about 20 times a run.
4. **E2E and F5 kit questions** (Trivia, Geography, Math): the answer loops probed for usually-absent buttons ("Back to lobby", "Waiting for the game to finish", "Next question") with 0.5–1 s waits, plus fixed sleeps. That cost about 3.5 s per question per player in E2E, and about 9 s per question round in F5.
5. **E2E and F5 Closest Wins and Guess the Year:** every finished-check waited out a 2 s lookup for a `game-panel` these kit screens never render, plus 0.5–1 s input probes. That was about 16 s per pass with four players, or 99–131 s per game.
6. **Real game time on the shared server, kept on purpose.** Majority Rules reveals each round for 10 s and Draw & Guess for 8 s, and `check-game-night` deliberately waits for a real time limit. These are what the drivers test.
7. **Setup per driver, kept for isolation:** each driver starts its own Chromium (about 0.5 s), and 30 start their own server (about 1–2 s). That's 1–2 minutes in total.
8. **Fast checks in sequence:** about 45 s.

**Kept as valuable duplication:** E2E and F5 both play all 14 games through the UI in one room, but they assert different things (§6). `check-game-night` and `check-ten-players` both use 10 players, but test different journeys.

## 4. Parallel scheduler architecture

The code is in `scripts/gate.mjs` and `scripts/lib/gate-plan.mjs`.

- **Phases:**
  1. The fast checks and the build run on the worker pool.
  2. The browser preflight runs once.
  3. One gate server starts per worker, in parallel.
  4. The browser drivers and E2E run on the pool.
- **Pool:** `--workers=N`. A step occupies `weight` slots (default 1); an `exclusive` step occupies all of them, though no step needed that (§12). `--sequential` means 1 worker and the old order.
- **Automatic worker count** (`--workers=auto`, the default): 2 CPUs get 2 workers; above that, the CPU count minus 1. It also requires 1.5 GB of available memory per worker, and the cap is 3, the largest count benchmarked.
- **Queue order:**
  - Sequential mode keeps the old order.
  - Parallel mode puts exclusive steps first, when nothing is in flight to drain, then **longest first** by historical median. Ties break by name, so the order is deterministic.
- **Strict order:** a step starts only at the head of the queue, when enough slots are free; nothing jumps ahead. `simulate()` replays exactly this policy for the estimates.
- **Backpressure:** while anything is running, a new step waits if the 1-minute load average is above the CPU count, or available memory is under 1 GB. With nothing running, a step always starts, so the pool can't stall. Every wait is reported.
- **No retries:** a failed step fails the run.
- **Stopping:** a dead worker server, a changed tree or cancellation stops new starts. Steps that never started are listed as **not run**, with the reason. An unexplained missing step fails the run.

## 5. Isolation strategy

| Resource | Old gate | Parallel gate |
|---|---|---|
| Gate server | one, shared by 37 drivers and E2E | one **per worker**; a worker runs one step at a time, so no two steps ever share a server at the same time |
| Server data | `server-data/` | `server-data/w<N>/` |
| Port | OS-assigned | OS-assigned, per server |
| Own-server drivers (30) | port 0, `mkdtemp` | unchanged; audited: each uses port 0 and a private temporary directory |
| Browser | one Chromium per driver | unchanged |
| Screenshots | `screenshots/` | `screenshots/<step>/` |
| Logs | `logs/NN-<step>.log` | same, every line time-stamped; one `server-w<N>.log` per worker |
| Ownership tags | run + step | run + step + worker server; a step's sweep matches only its own tag |
| Rooms | random IDs per room | unchanged; never shared between drivers |
| Server per-address limits (recovery requests, join attempts) | shared by every driver, in sequence | shared only by the drivers run in sequence on the same worker |

**Why one server per worker** rather than one shared server: every driver connects from 127.0.0.1, and the server keeps per-address budgets. Concurrent drivers on one server would spend each other's budgets. With one server per worker, each server sees a subset of what the old single server saw, in sequence.

**`check-tv-outage`** stops its own server and restarts it on the same port to simulate an outage. Another process could take the port in that gap; this hasn't happened in any run (§15).

## 6. Test coverage comparison

**Every original step still runs.** The gate discovers every `scripts/check-*.mjs`, exactly as before, plus E2E: 74 steps in both gates. Each planned step either reports a status or is listed as not run with the reason (§13, self-test case 12).

**Same checks, by count.** The three drivers I changed made the same number of checks as in the sequential Stage 5.1 final run on `0a3964f`, with no failures:

| Driver | Sequential `0a3964f` | B1 (3 workers) | B1b (3 workers, second round) |
|---|---|---|---|
| check-leaderboard | 23 passed | 23 passed | 23 passed |
| check-f5 | 36 passed | 36 passed | 36 passed |
| e2e-chromium | 15 OK | 15 OK | 15 OK |

The full-run comparison of every driver's check count, sequential against parallel, is in §12.

**Driver changes, and what each keeps:**

| Driver | Change | Coverage |
|---|---|---|
| `check-leaderboard` | Waits for the TV board's `data-phase="after"`, where movement chips render, then reads optional chips without auto-waiting. The fixed 3 s settle wait became the same phase wait. | Same checks, same values. **Stronger:** a board that never reaches "after" now fails at that wait, instead of silently reading "no movement". |
| `e2e-browser` | Kit questions are answered through `scripts/lib/answer.mjs` (option 0, as before). The finished-checks and the Closest/Year probes are checks, not waits. | Same games, options and end states. **Stronger:** an unconfirmed answer throws `AnswerStuckError` with a DIAG line, instead of looping silently. |
| `check-f5` | Kit-question, Closest and Year probes are checks, not waits. There is still one action per player per pass, so players stay interleaved. | Same interleaving, same assertions. |
| `lib/stage5-games.mjs` (used by E2E and F5) | Draw & Guess reads, and Draw & Guess and Majority taps, give up after 2 s, not 30 s, and retry on the next pass. | Fixes a race that F2 exposed (§12). A game that never finishes still fails at the game deadline. |

**What E2E and F5 each assert.** This is why both stay:
- **F5:** the TV projection has no leaks while each game plays. It also checks ledger finish events per game, the Cup view, the Dashboard's 5-game cap, and Memory Book export.
- **E2E:** the views, Memory Book add, approve and export, and reconnect.

## 7. Worker configuration

| Machine | `auto` picks | Why |
|---|---|---|
| 1 CPU | 1 | – |
| 2 CPUs | 2 | Measured: B4, and F2 (§8) |
| 3 CPUs | 2 | One CPU kept for the servers and the gate; not measured |
| 4 CPUs (this machine) | **3** | Measured: B2, B1, F3 |
| 5+ CPUs | 3 | The cap: 4+ workers were not benchmarked |
| Under 1.5 GB per worker available | fewer | Each driver peaked at 250–400 MB with Chromium (§8) |

**Overrides:**
- `--workers=N` sets the count directly.
- `--sequential` runs the old order on 1 worker.
- CI's manual dispatch has a `workers` input (`auto`, 1, 2 or 3).

## 8. Benchmark results

All runs start from fresh clones of one exact commit, through `bench.sh` (kept in the session scratchpad, not committed). Each run records the verdict, any leftover Chromium or server processes, and the CPU set.

| Run | Commit | What | Workers / CPUs | Verdict | Wall | Sum of steps | Speed-up | Utilisation | Contention | Leftovers |
|---|---|---|---|---|---|---|---|---|---|---|
| B2 | `959eac0` | 21-driver subset | 3 / 4 | PASSED 23/23 | 10m 51s | 31m 33s | 2.91× | 97% | ×1.021 | 0 / 0 |
| B1 | `959eac0` | leaderboard, F5, E2E (first round) | 3 / 4 | PASSED 5/5 | 12m 02s | 29m 00s | 2.41× | 80% | (too few steps) | 0 / 0 |
| B1b | `4a7e132` | the same, after the Closest/Year change | 3 / 4 | PASSED 5/5 | 8m 26s | 22m 49s | 2.71× | 90% | (too few steps) | 0 / 0 |
| B4 | `4a7e132` | 21-driver subset | 2 / **2** | PASSED 23/23 | 17m 10s | 31m 48s | 1.85× | 93% | ×1.051 | 0 / 0 |
| F2 | `8642da0` | **full gate** | 2 / **2** | {{F2_VERDICT}} | {{F2_WALL}} | {{F2_SUM}} | {{F2_SPEEDUP}} | {{F2_UTIL}} | {{F2_CONT}} | {{F2_LEFT}} |
| V1 | `d5e175f` | F5 and E2E after the race fix | 2 / **2** (CPUs 2–3) | {{V1_VERDICT}} | {{V1_WALL}} | | | | | |
| F3 | `{{F3_SHA}}` | **full gate, final** | 3 / 4 | {{F3_VERDICT}} | {{F3_WALL}} | {{F3_SUM}} | {{F3_SPEEDUP}} | {{F3_UTIL}} | {{F3_CONT}} | {{F3_LEFT}} |

**Machine:**

| Run | CPU mean / peak | Lowest memory available | Peak load (1-min) | Backpressure |
|---|---|---|---|---|
| B2 | 28% / 90% | 13,459 MB | 4.09 | none |
| B1 | 21% / 89% | 13,983 MB | 2.64 | none |
| B1b | 27% / 88% | 13,835 MB | 3.46 | none |
| B4 | 18% / 55% of 4 CPUs, i.e. up to all of the 2 pinned | 13,764 MB | 3.85 | 4 waits, 140 s |

**Per driver** (B2, 3 workers): times were within 0–9% of their sequential medians.
- `check-caption` read ×1.41, but its own sequential history swings between 76 and 111 s.
- `check-ten-players` was ×1.09 here and ×1.40 on 2 CPUs (25 s → 35 s), and it passed both times.
- Peak memory per step, including its Chromium (and its own server, where it has one), was 157–381 MB. CPU use was 1.3–23.8 s per step.

The full per-step profile from the final run is under "Per-step profile" below.

**Timing-sensitive drivers under load:** the values they measure stayed within a few milliseconds of the sequential run, far inside their thresholds.

| Measurement | Sequential (`0a3964f`) | 3 workers (B2) | 2 workers on 2 CPUs (B4) |
|---|---|---|---|
| Pulse: answer screen after the memorise deadline (limit 1 s) | 567 / 343 ms | 591 / 346 ms | 567 / 360 ms |
| Math: a 1-second answer is timed at | 1,104 ms | 1,079 ms | 1,128 ms |
| Math network: delayed open, prompt usable after (limit 1.5 s) | 24 ms | 62 ms | 32 ms |
| Math network: polling only (limit 3 s) | 2,037 ms | 2,046 ms | – |
| Draw & Guess: every viewer catches up within 4 s | yes | yes | yes |

## 9. Sequential versus parallel runtime

| Configuration | Full gate | Source |
|---|---|---|
| Old gate, sequential | **95.4 min** | measured: `0a3964f`, run `20261110-003130-0a3964f3-11617` |
| New gate, 3 workers, 4 CPUs | **{{F3_WALL}}** | measured: run `{{F3_RUN}}` |
| New gate, 2 workers, 2 CPUs | {{F2_WALL}} | measured: F2 (see §12 for its failure) |
| New gate, 1 worker (sequential, with the driver changes) | about {{SEQ_MODEL}} | **derived**, not run: F3's sum of step times divided by its measured contention |

**Improvement:** {{IMPROVEMENT}}.

## 10. Time-estimation methodology

- **Base durations:** each step's median, and p10–p90 for the range, over its most recent samples (up to 10).
  - Samples come from `test-results/timing-history.jsonl`, topped up from the committed baseline `scripts/lib/gate-timings.json`. That baseline was seeded from the 111 earlier runs on this machine and then from the benchmarks.
  - Sequential runs count as measured.
  - **Parallel runs count divided by their run's contention ratio.** A run with too few steps to measure its own ratio uses the median measured for the same workers and CPUs.
  - Failed or timed-out steps never count.
- **Changed steps:** when the two newest samples both sit more than 30% from the older median, in the same direction, the step changed (`currentRegime()`). Only the samples since then count, and the estimate stays low-confidence until there are 3. One outlier never resets a step.
- **Contention:** the median over a parallel run's steps (longer than 5 s, at least 5 of them) of actual ÷ base duration. It is kept per **workers@CPUs**, because 2 workers on 2 CPUs (×1.05) is not 2 workers on 4.
  - With no measured run for a combination, the factor is **modelled**: 1 + 0.1 per extra worker, with a range from 1 to 1 + 0.3 per extra worker. It is labelled as modelled.
- **Schedule:** the queue is replayed through `simulate()`, the runner's own policy, with the low, mid and high durations.
- **During the run:** remaining time is the simulated finish of the queued steps, plus what the running steps have left.
  - A step past its estimate is given at least 15 s, or 15% of its time so far.
  - A step well past its range is named as slow.
  - A move of more than 20% (and 2 minutes) in the total is reported as a revision.
- **Labels:**
  - `measured`: every step has 3+ samples, and contention was measured for this workers@CPUs;
  - `modeled`: contention is not measured;
  - `low-confidence`: steps with fewer than 3 samples, named in the plan.
- **After the run:** the summary reports:
  - wall time, the sum of step times, and per-worker busy time and utilisation;
  - predicted versus actual, and the longest steps;
  - machine CPU and memory, and backpressure waits;
  - the baseline sequential wall time (the mean of the newest recorded sequential passes).

  Every run appends one history line. Estimates are never promises.

## 11. Predicted versus actual durations

| Run | Prediction (label) | Actual | Error | Notes |
|---|---|---|---|---|
| B2 | 9–18 min, about 12m 13s (modelled) | 10m 51s | −11% | contention not yet measured; the modelled 1.2 was pessimistic |
| B1 | 16–22 min, about 18m 16s ("measured") | 12m 02s | −34% | **the history was stale**: the leaderboard's samples predated its 62% speed-up. The progress block reported the revision mid-run ("about 18m 22s → about 14m 15s"). This led to the change-point rule. |
| B1b | about 18m 16s ("measured") | 8m 26s | −54% | the same staleness; the prediction was made before the change-point rule existed |
| B4 | 14–22 min, about 16m 57s (modelled) | 17m 10s | +1% | |
| F2 | {{F2_PRED}} | {{F2_WALL}} | {{F2_ERR}} | |
| F3 | {{F3_PRED}} | {{F3_WALL}} | {{F3_ERR}} | |

**Lesson:** a "measured" label describes the samples, not whether the step changed since. The change-point rule and the contention-normalised parallel samples make the history catch up after two runs, without needing a sequential run.

## 12. Reliability and flakiness results

**Every failure in every Stage 5.2 run is listed here.** None was retried into a pass.

1. **Gate self-test, first run: 55/58.**
   - **Case 9:** the gate correctly failed a run whose fixture wrote a record file inside the repo.
   - **Case 13 (two checks):** timing history built up by earlier cases inside the sandbox changed the longest-first order, so the edit ran last.
   - All three were **test-design errors**, fixed in the self-test: records are kept outside the sandbox, and each gate run gets a fresh history. Rerun: 58/58.
2. **F2 (full gate, 2 workers on 2 CPUs): `check-f5` FAILED in Draw & Guess**, with `locator.textContent: Timeout 30000ms exceeded`.
   - The DIAG lines showed the game healthy on turn 4.
   - **Cause, a real race in the shared driver helper `scripts/lib/stage5-games.mjs`:**
     - the helper saw the drawer's screen;
     - then it read the secret word with a 30 s auto-wait;
     - in between, a guess sent earlier on the same pass ended the turn, so the word never came back on that phone, and the read threw.
   - 2 busy CPUs widen that window. Sequential runs never hit it. It predates Stage 5.2: the helper came from Stage 5, so the Stage 5.1 branch (PR #4) carries it too. It hasn't been seen there, and changing that verified branch is the owner's call, so it was raised with the owner rather than patched there.
   - **Fix (`d5e175f`):** reads and taps give up after 2 s and retry on the next pass.
   - **Validation, V1:** F5 and E2E on 2 workers pinned to CPUs 2–3, alongside F2: {{V1_VERDICT}}.
3. {{F2_OTHER}}

**Exclusivity:** none was needed. No timing-sensitive driver failed or drifted under 2 or 3 workers (§8).

**Backpressure** was active only on 2 CPUs: 4 waits and 140 s in B4, and {{F2_BP}} in F2. The 1-minute load average lags, so a wait can outlast the CPU pressure it reacted to (§15).

## 13. Failure and cleanup verification

`node scripts/gate-selftest.mjs` passes **59 of 59 checks** on `8642da0`, and was rerun on the final commit (§14). Every case runs the gate in a throwaway copy of the repo.

**Cases from before Stage 5.2,** still passing:
- a failing unit test;
- a failing driver, named with its assertion;
- a hanging driver killed at its time limit, with its child;
- a detached child that ignores SIGTERM (like Chromium), swept by its tag;
- a missing browser (infrastructure error, exit 2);
- a source edit after the build (INVALID, nothing runs against the stale bundle);
- a check that edits a tracked file;
- two gates at once;
- cancellation that spares unrelated processes.

**New parallel cases:**
- **9:** three steps really overlap, each with its own worker, server, data directory and screenshot folder.
- **10:** a failure is named with its assertion, worker and **failure kind** ("functional"), while the other steps pass.
- **11:** a timeout kills only its own step (failure kind "timeout"). A step running beside it was alive during the kill, and passed.
- **12:** a worker's server dies (a fixture kills it, SIGKILL). The steps that never started are **listed as not run**, with "server w1 died", and the verdict is INFRASTRUCTURE ERROR. The old gate checked only `exitCode`, and would have missed a signal-killed server.
- **13:** a mid-run edit stops the running step (CANCELLED: "the run became invalid"). Queued steps never start, and the run is INVALID.
- **14:** `--sequential` gives 1 worker, 1 server and the given order.
- **15:** `--plan` runs nothing. Progress lines appear, the summary compares predicted with actual, and the timing history is appended.
- **16:** cancelling a 3-worker run kills every worker's driver and children (the detached one included) and every worker server. An unrelated process survives, and every step is CANCELLED, none counted as passed.

**Leftovers after every benchmark run:** 0 Chromium and 0 server processes. `bench.sh` counted them before and after each run.

**Diagnosis on failure:**
- each step's log lines are time-stamped from the step's start;
- the report gives each step's worker, start and end, CPU seconds and peak memory, browser use, rooms on its gate server and failure kind;
- it includes the driver's DIAG lines (server game state next to what the screen shows);
- it says whether the machine was short of memory (under 1 GB) or CPU (10+ s saturated) while the step ran.

F2's failure shows this working: the DIAG lines, the worker and the time stamps located the race in minutes.

**Bug found in the old gate:** cancelling a step before its close handler ran made the old gate crash while printing its summary (`TypeError … padEnd`), seen in Stage 5.1. The new gate records such a step as CANCELLED (case 16).

## 14. Passing gate: revision and run ID

{{F3_VERDICT_BLOCK}}

## 15. Remaining performance bottlenecks

1. **E2E (about 500 s) and F5 (about 460 s)** are now the longest steps. Most of what remains is real game time: Majority reveals (10 s × 5), Draw & Guess turns, and Charades. Making them faster would mean playing fewer rounds (less coverage) or a test time scale (which changes what they test).
2. **`check-leaderboard` (about 400 s)** plays 8 Trivia games in sequence. Its players still answer one after another. They could answer at the same time without changing any assertion, but that changes the interaction pattern; it was left as it is.
3. **`check-game-night` (about 320 s)** waits for a real time limit on purpose.
4. **The critical path:** on 3 workers the run is now bounded by the sum of the work divided by 3, not by the longest step. A 4th worker might help on this machine (CPU mean 28%, peak 90%), but it was not benchmarked, and the cap stays at 3.
5. **Backpressure on 2 CPUs uses the 1-minute load average,** which lags. A per-second CPU reading would react faster, but it's harder to read correctly when the gate is pinned to some CPUs.
6. **Pattern Pulse's multi-key entry** in `stage5-games.mjs` keeps 30 s auto-waits. The same kind of race as Draw & Guess is possible there, but has never been seen. A partial retry could double-enter keys, so it was left as it is.
7. **`check-tv-outage`** re-binds its own port after a simulated outage. A port taken in that gap would fail the driver. It has not happened in any run.
8. **Estimates after a driver change** stay low-confidence until there are 3 new samples (§11).

### Per-step profile (final run)

{{PROFILE_TABLE}}
