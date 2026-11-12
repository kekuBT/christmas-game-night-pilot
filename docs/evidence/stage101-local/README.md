# Stage 10.1 repair: local evidence (not gate runs)

These are local runs in the working tree. They are not gate verdicts: the gate runs are in `../gate-runs/`, listed in `../README.md`.

## The R1/R2 browser regressions (review 6822605156)
| File | What it is |
|---|---|
| `check-jebena-rush-new-driver-on-f157422-build.log` | The repaired `check-jebena-rush` driver run against the web build of `f157422` (the code before the repair). **10 FAILs**:<br>- the R2 same-tab cross-room break;<br>- the R2 short-reconnect replay;<br>- Amina's resync replay;<br>- the TV missing the deciding cup;<br>- every R1 check (TV, Keku's phone, the loser's phone, the runner-up row);<br>- the check that cups still break after the reconnect. |
| `check-jebena-rush-on-repair.log` | The same driver on the repaired code (`3eb835d`'s tree): every check passes, `ALL PASS`. |

## The solo-harness timeout flake (D-S101-10)
Fast gate `20261112-121526-3eb835d3-186` failed in `stage62-solo-shelf`, a test with no faults (`math-mayhem: expected 'error' to be 'playing'`).

| File | What it is |
|---|---|
| `request-times-alone.txt`, `request-times-under-load.txt` | Every passing request in the `stage62` describe, fetch to headers, in ms. The second file is with lint, typecheck and the whole unit suite running at once. Under load: 55 requests, median 4.6 ms, max 29.2 ms. So slowness is not the cause. |
| `event-loop-stall.patch` | A temporary switch (applies to the committed tests with `git apply`; never committed into them). With `S62_STALL_MS` / `S74_STALL_MS` set, it blocks the event loop for that long during one passing request per test, which is what a loaded gate does. |
| `stall-before-stage62.log`, `stall-before-stage74.log` | `S62_STALL_MS=400` / `S74_STALL_MS=400` with the old 300 ms / 250 ms allowances. 4 of 5 tests fail in each harness; the first `stage62` failure is the gate's exact error. |
| `stall-after-stage62.log`, `stall-after-stage74.log` | The same stall with the fix (2 s with faults, 5 s without): 5 of 5 pass in each. |

To reproduce:
```
git apply docs/evidence/stage101-local/event-loop-stall.patch
S62_STALL_MS=400 npx vitest run tests/stage62-solo-shelf.test.ts -t "the solo session across games"
S74_STALL_MS=400 npx vitest run tests/stage74-content-variety.test.ts -t "solo Start recovery"
git apply -R docs/evidence/stage101-local/event-loop-stall.patch
```
To see the failure, also set the allowances back to 300 ms and 250 ms.

## The TV outage driver's note race (D-S101-11)
Full gate `20261112-122710-25c28143-13503` failed one check in `check-tv-outage`: "server back: the note goes away… (locator.getAttribute: Timeout 30000ms exceeded.)".

| File | What it is |
|---|---|
| `tv-note-race.patch` | A temporary `TVNOTE_GAP_MS` gap between the old helper's two calls (count the note, then read it), in the "note goes away" check only. It applies to `scripts/check-tv-outage.mjs` as of `25c2814`. |
| `tv-note-race-before.log` | The old helper with `TVNOTE_GAP_MS=4500`: the note's 4 s removal falls in the gap, and the check fails with the gate's exact message. |
| `tv-note-race-after.log` | The fixed helper (one `evaluate`), with the same 4.5 s delay before its single read: all checks pass. |

## The out screen, whichever turn takes the last cup (D-S101-12)
The full gate `20261112-130723-36e222fb-785` passed, but its `check-jebena-rush` never ran the out-screen checks: Baraka's last cup went on his R2 short-drop turn, and that branch skipped them.

| File | What it is |
|---|---|
| `out-in-resync.patch` | A temporary `JR_SHORT_CUT_ON_LAST` switch that holds Baraka's short drop until his last cup, so he always goes out during it. Never committed into the driver. |
| `check-jebena-rush-forced-out-in-resync.log` | The fixed driver with that switch. The out checks run in their resync form (his last cup shows broken without breaking), and "someone went out before the end, and their out screen was checked" passes. ALL PASS. |
| `check-jebena-rush-final-driver.log` | The fixed driver, run normally: 162 PASS, 0 FAIL. |

## The reconnect check's history (review 6828948844, S101-R3; D-S101-13)
| File | What it is |
|---|---|
| `reviewer-run-0516e3e.md` | ChatGPT's failing run on `0516e3e` (160 PASS, 1 FAILED), quoted from the verdict; its raw log is in the reviewer's private Codespace. |
| `r3-old-lifetime-check.patch` | Puts the old lifetime check back into the repaired driver (which always drops Amina's phone after a live loss of hers). Applies to `scripts/check-jebena-rush.mjs` as of `0d9e4b4`. |
| `r3-old-lifetime-check-forced-ordering.log` | That run: 164 PASS, 1 FAIL, exactly the reviewer's check (her earlier HUD and seat breaks of slot 2 counted as a replay). |
| `r3-new-cursor-check.log` | The repaired driver: 165 PASS, 0 FAIL (the earlier break is asserted present; no new break of her seat after the cursor). |
