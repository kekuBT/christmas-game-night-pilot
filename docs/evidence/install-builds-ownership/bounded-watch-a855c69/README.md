# The bounded second-tab watch (review 7057502077, D-IB-01)

- **The review:** [7057502077](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7057502077), acknowledged in [7057509921](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7057509921).
- **Base:** `b90fc0760bb820201207c9eb66126f6e7427a4d8` (#60's earlier head; tested SHA `5417020`).
- **The fix commit, and the tested SHA:** `a855c6979cae76eb257987be395537a2501ee11b`.
  - It changes `scripts/check-install-builds.mjs` and adds `scripts/check-install-builds-no-worker.mjs`.
  - It is driver-only, with no runtime change.
  - This folder was added afterwards, in a docs-only commit.

## The finding, reproduced on `5417020`
- **The defect:** `armSecondAttempt` waited for `updatefound`, and then for the first worker's state, with no deadline. When no new worker appeared, E1's `round.evaluate(() => window.__mzSecond)` never settled, so the run never reached its checks or its `finally`.
- **The negative control** (`negative-control-5417020/`):
  - It is the committed driver of `5417020` with one change, shown in `negctl-no-new-worker.patch`: E1 deploys the build already in charge, so no new worker appears.
  - It was run standalone in its own process group.
- **What happened** (`run1-hangs.log`):
  - The driver printed `E setup` and then nothing more. It was **still running after 151 s**, with the driver and its server alive.
  - The control then killed it.
  - Its temp directories were never removed: the four builds, the live folder, the server data and the browser profile. They were removed by hand afterwards.

## The repair
- **The second tab's watch has one deadline,** `SECOND_DEADLINE_MS` (15 s). Within it, the first attempt must appear and end, and the second must start.
  - Every listener (`updatefound`, `statechange`) and the timer are removed on completion, timeout or cancel.
  - The outcome is always one named string, for example:
    - `started`;
    - `cancelled: …`;
    - `no first attempt appeared within 15 s`;
    - `the first attempt did not end within 15 s`;
    - `no second attempt started within 15 s`.
  - A cancel that arrives before the watch begins is honoured.
- **When the driver's own update starts no attempt** (`own` is not `redundant` or `installed`), E1 cancels the watch at once.
- **Driver-side deadlines** (`within()`) bound every in-page wait the driver reads: `settle`, `ownUpdate` (and its `update()` call), arming the watch, cancelling it, and reading its outcome.
  - A late read of the watch's outcome becomes a named outcome.
  - Any other late wait becomes a named error, which reaches the catch (a `no unexpected error` failure) and the `finally` cleanup.
- **Fault modes,** set by `MCHEZO_INSTALL_BUILDS_FAULT` and only for the regression (the gate never sets it; any other value exits 2):
  - `e1-no-new-worker`: E1 deploys the build in charge.
  - `e1-watch-too-late`: the watch is armed only after the driver's attempt has ended, and the build in charge is deployed again so no later attempt can come. Only the watch's own deadline can end it.
- **Kept:** the second-attempt assertion, and both attempts' cleanup checks.

## The regression: `scripts/check-install-builds-no-worker.mjs`
It runs the driver once in each fault mode, the way it runs outside the gate: its own process group, a private `TMPDIR`, and no gate timeout. For each mode it checks that:
- **the driver ends by itself** within 240 s, with **status 1** (not a pass, not a signal);
- **E1 fails by name:**
  - for `e1-no-new-worker`: `{"own":"no new worker"}`, and the second-attempt check FAILS with `cancelled: the driver's own update gave "no new worker"`;
  - for `e1-watch-too-late`: the driver's own attempt passes, and the second-attempt check FAILS with `no first attempt appeared within 15 s`;
- **nothing reached the driver's catch,** and its summary line is printed;
- **nothing is left behind:**
  - no process of its group (the driver and the server);
  - no process anywhere whose command line names its private temp directory (the browser, which runs in a process group of its own);
  - its private temp directory is empty.
  - tsx's own compile cache (`tsx-<uid>`), which the server's loader keeps in the temp directory, is not the driver's and is not counted.

**A probe of the browser check:** a browser launched with a private `TMPDIR` is seen by the scan while open (1 process) and not after closing (0, directory empty).

## Results on `a855c69`
| Run | Result |
|---|---|
| Negative control on `5417020` (no new worker) | **still running after 151 s**; temp directories left behind |
| `check-install-builds-no-worker`, standalone | **20/20 PASS**, 1 min 44 s (`no-worker-selftest-a855c69.log`) |
| `check-install-builds`, normal path, 6 runs three at a time | **6/6 exit 0**, 34/34 checks each (`focused-a855c69/`) |
| Targeted gate: `install-builds`, `install-builds-no-worker`, `install` | **`PASSED (exit 0)`** 5/5, run `20261121-050401-a855c697-17553` |
| Fast gate: typecheck, lint, unit tests, build | **`PASSED (exit 0)`** 5/5, run `20261121-050624-a855c697-18967` |

In the targeted gate, the fault runs took 46 s (`e1-no-new-worker`) and 59 s (`e1-watch-too-late`); the self-test step took 106.9 s.

**E1 in every normal run:**
```
PASS E1 W deployed with a listed file missing: W's install runs and fails — {"own":"redundant","others":["redundant"],"calm":true}
PASS E1 another tab asks for an update the moment W's install ends: a second attempt, not the driver's, starts and fails too — {"second":"started","others":["redundant"]}
```

## Limitations
- **The full gate was not run.** This is a driver-only change; the targeted gate runs both changed drivers and their neighbour `check-install`.
- **The 240 s bound** is generous for a run of about 45–60 s. It measures that the run ends by itself, not how fast.
- **Coverage of the fault modes:** they exercise the watch's cancel path and its deadline path. A worker that appears but never ends is covered by the same timer, which reports `the first attempt did not end within 15 s`, but no fault mode forces it.
