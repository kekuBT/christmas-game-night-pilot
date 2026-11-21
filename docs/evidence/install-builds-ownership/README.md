# Whose install attempt: the `check-install-builds` E1 flake (handoff 7052991290, D-IB-01)

- **The handoff:** [7052991290](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7052991290).
  - Acknowledged in [7055587114](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7055587114).
  - Status and revised ETA in [7057264930](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7057264930).
  - The decision is D-IB-01 in `docs/DECISIONS.md`.
- **Base:** `618c5674f5834f6b70ee524d2ce328d68ab1b0a5` (#59's head).
- **The fix commit, and the tested SHA:** `54170200c9a7a883793203d04c1132ad7e060040`.
  - It changes one file: `scripts/check-install-builds.mjs`.
  - There is no runtime change.
  - This folder was added afterwards, in a docs-only commit.
- **Data:** local and synthetic only, in headless Chromium. Paths are redacted (`<scratch>`, `<tmp>`).

## The flake
`FAIL E1 no candidate is left, nothing else is touched` showed a stage cache, `mchezo-stage-<W>-…`, at the moment the driver read the cache names. It happened in gate run `20261120-175449-6d884195-29338` and in 1 of 4 standalone runs.

## The trace (`trace-618c567/`, on `618c567`)
**The harness** is a scratch copy of the driver with instrumentation only. The differences are in `trace-harness.patch`; the driver's checks are unchanged. It records:
- every `ServiceWorkerRegistration.update()` and `navigator.serviceWorker.register()` call in every page, with its caller (the driver's `page.evaluate`, or the app's `registerSw` bundle);
- every install attempt the browser creates, with each state change, from DevTools `ServiceWorker.workerVersionUpdated`;
- the stage caches, polled every 25 ms, with each candidate's creation time decoded from its name;
- the driver's own steps.

**The runs:** seven in all. Run 1 ran alone; runs 2 to 7 ran three at a time, like the gate's three workers.

**Run 6 reproduced the failure** (`trace-run6-E1-FAIL.log`; times in ms after the browser context was created):
```
+  2409  page1 /    reg.update() called  [caller: driver (page.evaluate)]
+  2414  browser    version 1: new                     <- the driver's attempt
+  2433  cache      ["…-mwpwmju7-…"]  (created at +2422 ms)
+  2527  browser    version 1: redundant
+  2533  cache      []                                 <- its own candidate is gone
+  2600  browser    version 2: new                     <- no page called update(): the browser started it
+  2634  cache      ["…-mwpwmjzd-…"]  (created at +2608 ms)
+  2672  driver     cacheNames read: ["…-mwpwmjzd-…"]   <- read while version 2 installs
+  2673  driver     check FAIL: E1 no candidate is left
+  2719  browser    version 2: redundant
+  2733  cache      []                                 <- version 2 deleted its own candidate
```

**What all seven runs show** (each attempt and who asked for it: `attempts-by-initiator.txt`, made by `classify.py`):
- **The candidate E1 reported was not the driver's.** It belonged to a second install attempt that the browser started itself: no page had called `update()` since the driver's attempt began. That attempt was still installing when the driver read the cache names. It then failed and deleted its own candidate, about 60 ms later.
- **The browser starts attempts of its own,** with no page calling `update()`. This happened in 5 of the 7 runs (1, 2, 3, 4 and 6):
  - **At the reload in the driver's offline step,** in runs 1, 2 and 6. The page was offline, but the browser still fetched the worker script, so Playwright's page offline emulation does not cover that fetch.
  - **Shortly after the driver's E1 attempt ended:**
    - Run 6: 73 ms after, before E1 read the cache names, so E1 failed.
    - Run 4: 470 ms after, once E1 had read them, so E1 passed only by timing.
  - **Right after W (missing a file) was deployed,** in run 3. The driver's own `update()` then joined that attempt.
- **The app starts more.** Its `online` re-check (`registerSw.ts`) calls `reg.update()` from the open pages when the offline step ends.
  - **In E2 of runs 1, 4, 5 and 7,** an attempt was created 1–2 ms after the driver's deploy of W finished, and before the driver asked for anything. The only page calls before it were the app's.
  - **The driver's `update()` came 5–10 ms later,** and no other attempt followed before it returned. So the driver followed an attempt it had not started.
  - **In runs 2, 3 and 6,** the driver's call came while an earlier attempt was still in flight, so which attempt it then followed is ambiguous.
- **E2's "install fails with storage full" check therefore observed, in at least 4 of 7 runs, an attempt that the driver did not start.**
  - This also explains the earlier delayed-read experiment (`docs/evidence/briefing-tv-fit/install-builds-investigation/`).
  - The old driver lifted the storage-full override as soon as its attempt ended, so a later attempt could install W successfully.
- **Attempts never overlap:** each one is created after the previous one has ended.
- **Failed attempts remove their own candidates:**
  - **Where the cache watcher was running** (until the offline step reloads the home page), each stage cache disappeared at its own attempt's `redundant`, within the 25 ms polling resolution. This covers version 1 in every run, plus version 2 in run 6.
  - **Later in each run,** the driver's own reads found no leftover candidate after E2, E4 and E5.

**Conclusion:** this is a timing race in the driver, between its single-moment reads and update attempts it did not start. It is not a production lifecycle defect, and no runtime behaviour was changed.

## The repair (D-IB-01; `scripts/check-install-builds.mjs` only)
- **`settle()`** waits until no install attempt is in flight on the page's registration and none has started for 1 s. It watches every attempt through `updatefound` and each worker's state, whoever started it, and gives up after 30 s.
- **`ownUpdate(page, prepare)`** is the driver's own attempt:
  1. settle;
  2. run `prepare` (the deploy);
  3. ask for an update, and follow the worker that this update starts. It checks that the worker is new, not one already in flight, and follows it to `redundant` or `installed`;
  4. settle again.

  It returns `{ own, others, calm }`, where `others` are the end states of every other attempt that started meanwhile. The checks print it.
- **E1, a deterministic second attempt:** the round's tab asks for an update the moment W's install ends. It does what the browser did in run 6, but on every run. The new check requires that second attempt to start and fail too. Then **no candidate is left** must hold for both attempts.
- **E2:** the storage-full override is applied **before** W is deployed, and kept until every attempt has ended.
- **E3 to E5** use `ownUpdate()` the same way.
- **Kept, unchanged in substance:**
  - a failed install leaves no candidate (now for every attempt, the driver's own and the others);
  - A's live cache is exactly as it was;
  - someone else's cache (`not-mchezo`) survives;
  - the round in the other tab plays on;
  - offline, the shell is whole.
- **Also kept:** E3's waiting worker, scoped cleanup and activation checks, and E4/E5.
- **The count:** 34 checks, one more than before (the second attempt).

## The negative control (`negative-control/`)
- **What it is:** the old driver from `618c567`, plus only the same second attempt in E1. The difference is in `negctl.patch`.
- **The result:** **5 of 6 runs FAIL** with the reported message, for example:
```
FAIL E1 no candidate is left, nothing else is touched — ["mchezo-shell-654a7428e2c621a4","mchezo-stage-e53a77ceedc1f749-mwpwtska-3o997r37","not-mchezo"]
```
- **Run 5 passed:** the second attempt's candidate happened to fall outside the old driver's read.

## Focused reruns on `5417020` (`focused-5417020/`)
- **The runs:** 12, three at a time, with the tree clean at the tested SHA.
- **The result:** **12/12 `exit 0`, 34/34 checks each.**
- **E1 and E2 in every run:**
```
PASS E1 W deployed with a listed file missing: W's install runs and fails — {"own":"redundant","others":["redundant"],"calm":true}
PASS E1 another tab asks for an update the moment W's install ends: a second attempt, not the driver's, starts and fails too — {"second":"started","others":["redundant"]}
PASS E1 no candidate is left, nothing else is touched — ["mchezo-shell-654a7428e2c621a4","not-mchezo"]
PASS E2 W with storage full (Chromium's quota override): W's install runs and fails — {"own":"redundant","others":["redundant"],"calm":true}
PASS E2 no candidate is left — ["mchezo-shell-654a7428e2c621a4","not-mchezo"]
```

**The repaired driver, traced once** (`trace-5417020.log`; harness in `trace-5417020-harness.patch`):
- **In E1:** the driver's attempt (version 1) ends, then the second tab's attempt (version 2), started by the driver's own fixture in the round tab.
- **Before E2:** E1's offline reload set off the browser's attempt (version 3), and its `online` event set off the app's (version 4). The settle step waited for both before deploying W.
- **In E2:**
  - the driver's attempt (version 5) failed under full storage;
  - one more attempt (version 6) started about 0.4 s later, with no page calling `update()`, so the browser started it;
  - version 6 also failed under full storage, because the override stays until everything has settled.

## Gates on `5417020`
Each verdict belongs to its own run.

| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `install-builds`, `install` | **`PASSED (exit 0)`**, 4/4 | `20261121-043756-54170200-7451` | `gate-5417020-targeted.txt`, `gate-5417020-targeted-check-install-builds.log` |
| Fast: typecheck, lint, unit tests, build | **`PASSED (exit 0)`**, 5/5 | `20261121-044021-54170200-8351` | `gate-5417020-fast.txt` |

- **The full gate was not run.** This slice changes one browser driver, and nothing else in the tree. The targeted gate runs that driver and its neighbour, `check-install`, and the fast gate covers lint, types and unit tests.

## Limitations
- **The source of the browser's own attempts:** they are identified only by elimination. No page called `update()`, and DevTools shows the new attempt. Chromium's internal trigger is not traced; the reload in the offline step is one of them.
- **The 1 s settle window adds time:** about 2 s for each of the driver's seven attempts (a settle before and after). One run took 42 s standalone and 45 s in the targeted gate.
- **What a longer quiet would mean:** if the browser waited longer than 1 s and then started an attempt after a settle, `ownUpdate` would still follow only its own new worker. The cache checks after the next settle would still cover that attempt.
- **Real devices:** this is Chromium only. Real-device install and update checks stay in `docs/REAL_DEVICE_TESTING.md`.
