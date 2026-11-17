# Beta R4 W4 preparation: the local restart rehearsal (handoff 6933392621; repaired after review 6935165862)

**Where it ran:** this machine's Docker.
- **The image:** `cgn-render:check` (`sha256:7b53109a7d69`), the local `deploy/render` build of the pinned `7097ac2` used for W1–W3. Each run checked the `/health` revision.
- **The settings:** production mode, the throwaway data folder `/var/data/cgn-w1` on a **Docker volume owned by the run**, and a throwaway code. Every container and volume is removed afterwards.
- **The browsers:** Chromium pages (`chrome-headless-shell` 153) for a host, a guest and a TV.

**This is a rehearsal of the restart mechanics, not W4.** Render's manual deploy and dashboard restart, D1 and D2 in [render-w4.md](../../beta/render-w4.md), stay **pending**.

## What a run checks
The tools are:
- `scripts/beta/w4-rehearsal.sh`, the harness: W3's isolation, plus a run-owned volume;
- `scripts/beta/w4-control.sh`, the restart and probe actions, which fail closed. The harness and the fault tests both source it.
- `scripts/beta/w4-rehearsal.mjs`, the driver;
- `scripts/beta/w4-control-selftest.sh`, the fault-injection tests, run against a mock docker;
- `scripts/beta/w4-selftest.sh`, which runs the fault tests, the rehearsal and its controls.

Labels: **rendered** is a page's own DOM; **API** is the server's record over HTTP; **harness** is the harness that did the restart.

| Step | What happens | Must hold |
|---|---|---|
| S | A first Trivia round finishes; the host saves a synthetic Memory Book note citing it | It reads back (API) |
| P | A second round; the host and guest each answer question 1 | Locked in (rendered), recorded once (API) |
| R1 | **`docker stop`** (graceful `SIGTERM`, passed on by `cgn-entrypoint`). While it is down, the guest taps question 2. Then **`docker start`** of the same container. | **The harness:** a **verified graceful stop**: the container reads back as `exited` with exit code 0, not OOM-killed. Then the start: the container was stopped, and a new start time is recorded.<br>**While down:**<ul><li>the guest's banner says it is reconnecting;</li><li>the tap is **not** shown as in (rendered).</li></ul>**After the restart:**<ul><li>the pinned revision (harness);</li><li>the same room, seats and round (API);</li><li>the acknowledged answers kept once, and the unconfirmed tap **not** saved (API);</li><li>a new live socket on each page;</li><li>each screen showing the playing round on that live connection (rendered).</li></ul>**Then:**<ul><li>the guest re-taps question 2: locked in, recorded once;</li><li>play continues: the host answers question 2 in its own page, acknowledged.</li></ul> |
| R2 | A **fresh container** of the same image on the **same** volume, with the same environment (a local analogue of a redeploy) | **The harness:** the old container stopped gracefully, then was removed (after its label read back as the run's) and confirmed gone. No container used the volume before the replacement started.<br>The same checks as R1, both earlier answers kept once; the host answers question 3 in its own page; **the seeded Memory Book note reads back** (API) |
| L | A second `node dist/server/serve.js` **inside** the running container | Refused by the one-writer lock: exit 2, "Another server (pid N) is using this data directory" |
| G | **The probe's own container**, with **another public origin**, on a **fixture volume owned by the run**. The volume holds only a copy of the authorization record, streamed as tar out of the running container. **The data volume is never mounted by a second container.** | **Refused:** `cgn-entrypoint` exits 78 with `REFUSED: MCHEZO_PUBLIC_ORIGIN is not the authorized origin` before the deadline (60 s). No server starts.<br>**Teardown:** the probe's container and volume, bounded and confirmed gone.<br>**The data volume:** its only user, before and after, is the container under test. |
| F | The round finishes (the guest through the UI, the host through the API) | **Server record (API):** every answer once, and the guest's score equal to the score of its recorded answers.<br>**Rendered:** the host's, guest's and TV's standings equal the recorded scores. |

**Any failed harness action stops the rehearsal there** (an `ABORTED` line). Nothing more is asked of the harness, and no replacement starts.

**After every run,** none of its containers, volumes, processes, listeners or private files is left, and no log or evidence file holds the code or a cookie. Screenshots mask the room code.

## The finding: a tap made during a restart can show `Request failed (502)`
- **What happens:**
  - While the service is down, the proxy answers 502.
  - The phone retries three times, then shows the raw text **`Request failed (502)`** (recorded verbatim in every run).
  - It doesn't show its friendly `NOT_DELIVERED` wording: "We couldn’t confirm that — check your connection. If it doesn’t show as in, try again."
- **The safety property holds:** the tap is never shown as in. In this fully-down case, the server never records it, and re-tapping after the restart counts it once.
- **In a real deploy, a response can also be lost after the server committed the tap.** The runbook's D1 now covers that case: reconcile with the server's state, and count each tap at most once.
- **The cause:** the pinned client turns a final 5xx into `Request failed (<status>)`, and `humanError` passes it through.
- **The repair is authorized (review 6935165862) as a separate stacked draft PR, after this tooling repair.** It will show the existing "couldn't confirm" wording, never "not received". See [render-w4.md](../../beta/render-w4.md#the-finding-from-the-rehearsal-a-tap-made-during-a-restart-can-show-request-failed-502). **The pin is unchanged** until its candidate review.

## The repair (review 6935165862)
**The review found three defects** in the tooling tested at `618f179`. None of them is in the runtime.
1. **The fresh replacement ignored a failed stop or removal,** and still answered `ok:true`. ChatGPT reproduced this with a mock. R1 also trusted the Docker CLI's exit code alone: `docker stop` exits 0 even when it had to `SIGKILL` the container (exit 137).
2. **The guard probe** ran a second container on the **active writer's volume**, with no time limit.
3. **The runbook** had two errors:
   - its prerequisite 4 said to record the code;
   - it claimed that every tap made during a deploy goes unrecorded.

**The fixes:**
- **The actions moved** into `scripts/beta/w4-control.sh`, and they fail closed. Every docker call is bounded.
  - A stop counts only when the container reads back as `exited` with exit code 0, not OOM-killed.
  - A start needs a stopped container, and a new `StartedAt` afterwards.
  - A replacement needs a graceful stop, then a removal (label read back first) confirmed gone, and no container on the volume.
  - The driver asserts these for R1 and R2, and stops at the first failed action.
- **The guard probe** runs in its own container, on a run-owned fixture volume that holds only a tar copy of the authorization record.
  - It has a deadline, and its teardown is bounded and confirmed.
  - The data volume's only user must be the writer under test.
- **The runbook** is corrected.

| Run (dev, before the tested commit) | Verdict | What it showed | Evidence |
|---|---|---|---|
| Rehearsal t1 | PASSED | <ul><li>R1: a verified graceful stop (exit code 0) and a new start recorded.</li><li>R2: the old container removed and confirmed gone, then the replacement.</li><li>G: the guard refused (exit 78) in its own container on its own fixture volume; teardown 175 ms; the data volume's only user was the writer.</li></ul> | [dev/t1.log](repair/dev/t1.log) |
| Control: a hanging guard (`W4_GUARD_MODE=hang`, 15 s) | FAILED, as required | G failed at its deadline; teardown 260 ms; the data volume's only user was the writer; ABORTED; nothing left | [dev/hang.log](repair/dev/hang.log) |
| Control: a non-refusing guard (`W4_GUARD_MODE=serve`, 15 s) | FAILED, as required | A server STARTED in the probe's container, on its fixture volume; teardown 312 ms; the data volume's only user was the writer; ABORTED | [dev/serve.log](repair/dev/serve.log) |
| Control: a forced stop (`W4_STOP_SECONDS=0`) | FAILED, as required | `docker stop exit 0`, but the container read back as exit code 137, so the stop was refused; no start and no replacement; ABORTED | [dev/forced.log](repair/dev/forced.log) |
| Fault tests, attempt 1 | **FAILED: a mock defect** | The mock `curl` ignored `-o /dev/null`, so the readiness output picked up the JSON, and the two passing cases (start-ok, fresh-ok) failed. The mock was fixed; `w4-control.sh` was unchanged. | [dev/control1.log](repair/dev/control1.log) |
| Fault tests, attempt 2 | PASSED, 72/72 | | [dev/control2.log](repair/dev/control2.log) |
| Meta-control, attempt 1 | Too weak | With only the stop check and the removal check weakened, the removal cases **still failed closed**: the new check of the volume's users catches an ignored removal by itself (two layers). So the meta-control now also weakens that check, as the original had neither. | [dev/k0m-attempt1.log](repair/dev/k0m-attempt1.log) |
| Self-test dev 1 | PASSED, 79/79 | K0, K0M, K1–K8 | [dev/selftest-dev1.log](repair/dev/selftest-dev1.log) |

**The finals, on a clean checkout of the tested commit `5a5d2878b326451302dfd73d87f5719693a67075`** (status 0 lines; 0 containers and 0 volumes before and after):

| Final | Verdict | Run IDs and observed results | Evidence |
|---|---|---|---|
| `w4-selftest.sh` | **W4 SELFTEST PASSED (exit 0)**, 79 passed, 0 failed | <ul><li>**K0:** the 72 fault cases fail closed.</li><li>**K0M:** the weakened copy fails, as required.</li><li>**K1:** the W3 mock cases pass.</li><li>**K2** `20261117T020006Z-c4032f58`: PASSED.<ul><li>R1: a verified graceful stop; a new start recorded.</li><li>R2: the old container removed and confirmed gone before the replacement.</li><li>G: refused (78) in its own container; teardown 168 ms; the data volume's only user before and after was the writer.</li><li>Standings rendered on the TV, host and guest.</li></ul></li><li>**K3** `…020042Z-6f3fe97e`: FAILED exactly the six R2 checks.</li><li>**K4** `…020213Z-2a25695b`: the port preflight.</li><li>**K5** `…020214Z-8283043c`: readiness, on the revision.</li><li>**K6** `…020216Z-97ebf713`: G failed at its 20 s deadline; teardown 284 ms; aborted.</li><li>**K7** `…020257Z-12ad2d8b`: G failed, a server STARTED; teardown 291 ms; aborted.</li><li>**K8** `…020337Z-bcb8ac00`: R1 failed with exit 137 although `docker stop` exited 0; nothing started or replaced; aborted.</li><li>The sentinels survived every case.</li></ul> | [final/selftest-final.log](repair/final/selftest-final.log); the driver's JSON for K2, K3, K6, K7 and K8 in [final/](repair/final/); [K2's screenshots](repair/final/K2-screens/), with the room code masked |
| Static checks | **Passed** | <ul><li>No runtime file differs from `7097ac2`.</li><li>No deploy file differs from `2e2257c`.</li><li>No tool other than the W4 ones changed since `5fdc73c`.</li><li>eslint and `bash -n` pass.</li><li>24 links, none missing.</li><li>The secret scan is empty.</li></ul> | [final/static-final.log](repair/final/static-final.log) |

**A false start, discarded:** the first static-check pass ran while `git worktree add` was still writing the clean checkout. It saw a partial tree, and its output was deleted. The self-test was not affected, because it starts only after the checkout completes. The checks were then rerun on the complete checkout (above).

## Every run, in order
| Run | Code | Verdict | Evidence |
|---|---|---|---|
| Dev trial 1 | the working tree | **FAILED, 1 check: my expectation, not the app.** I expected the phone to show "couldn't confirm" for the tap made while the service was down. It showed `Request failed (502)`. The tap was **not** shown as in and **not** saved: the finding above.<br>Everything else passed: both restarts, the lock, the guard, the Memory Book seed, and distinct final scores (600, 360) rendered correctly. Cleanup was clean. | [dev/trial1.log](dev/trial1.log) and its JSON |
| Dev trial 2 | the check rewritten: the safety property (not shown as in, not saved) is the pass condition, and the message is recorded verbatim as a NOTE | PASSED | [dev/trial2.log](dev/trial2.log) and its JSON |
| Control 1 (`--control empty-data`) | the same | **FAILED as intended,** with 4 failures (sockets, room, answers, the Memory Book note).<br>**But the restart-time rendered check PASSED on stale pages:** with no socket back and the room gone, the old screens still showed the round. The rendered check couldn't fail. | [dev/control1.log](dev/control1.log) and its JSON |
| Dev trial 3 | the rendered check now requires each page's **own new live socket**; "play continues" added (the host answers in its own page after each restart) | PASSED | [dev/trial3.log](dev/trial3.log) and its JSON |
| Control 2 | the same | **FAILED as intended,** exactly the **six** R2 continuity and durability checks, the rendered one included. Every R1 check passed. | [dev/control2.log](dev/control2.log) and its JSON |
| W3 mock cases on the W4 harness | `w3-harness-selftest.sh --mock-only --harness w4-rehearsal.sh`, with the mock reading any `*.owner` label (a one-line change to the W3 self-test's mock) | PASSED 36/36 | [dev/mock1-w3-mock-cases-on-w4.log](dev/mock1-w3-mock-cases-on-w4.log) |
| Self-test, dev 1 | `w4-selftest.sh`: K1–K5 with sentinels | PASSED: every case, every sentinel survived | [dev/selftest-dev1.log](dev/selftest-dev1.log) |
| Dev trial 4 | masked screenshots added | PASSED; screenshots checked by eye: the room code masked | [dev/trial4.log](dev/trial4.log), [dev/trial4-screens/](dev/trial4-screens/) |
| **Final: `w4-selftest.sh`** | **a clean checkout of `618f179`** | **PASSED (exit 0).** Containers 0 and volumes 0, before and after.<ul><li>**K1** (the W3 mock cases on the W4 harness): passed.</li><li>**K2** (run `20261117T003140Z-d06ba320`, driver `20261117T003141-e88d55`): every check passed.<ul><li>stop: `docker stop` exit 0; start: back in 509 ms;</li><li>fresh: a new container on the same volume, back in 839 ms;</li><li>the lock: exit 2; the guard: exit 78;</li><li>distinct final scores (guest 360, host 120), rendered correctly on all three screens;</li><li>the tap during the restart: `Request failed (502)`, not shown as in, not saved.</li></ul></li><li>**K3** (run `20261117T003215Z-31c5cb2b`): failed exactly the six R2 checks, none in R1.</li><li>**K4** (`…003347Z-2d469a0d`): failed at the port preflight, 0 connections.</li><li>**K5** (`…003348Z-c94ead77`): failed at readiness on the revision.</li><li>The sentinels survived every case.</li></ul> | [final/selftest-final.log](final/selftest-final.log), [K2's JSON](final/K2-w4-20261117T003141-e88d55.json), [K3's JSON](final/K3-w4-20261117T003217-fc3277.json), [K2's screenshots](final/K2-screens/) |
| **Final: the static checks** | **the same checkout** | **Passed:**<ul><li>no runtime file differs from `7097ac2`;</li><li>no deploy file differs from `2e2257c`;</li><li>the only change to an existing tool since `8b511b3` is the W3 self-test's one-line mock generalization;</li><li>eslint and `bash -n` pass;</li><li>11 links, none missing;</li><li>the secret scan finds nothing.</li></ul> | [final/static-final.log](final/static-final.log) |

## Limits
- **Not Render.** Not Render's build and deploy pipeline, its edge's answers during a restart, the disk's detach and attach, the 30 s `SIGKILL` deadline, or a real network. Docker's `stop`/`start` and a fresh container are local analogues only.
- **Not phones.** Chromium pages on one machine. Native C1–C4 (W3) and W8 stay pending.
- **The one-writer lock is per network namespace.** So L checks it inside the running container. Across containers, what separates writers is the order (stop before start), which the harness follows and Render's disk-backed deploys follow (`docs/beta/beta-r1-architecture.md`, `beta-r4-hosting-proposal.md`).
- **The browser** is `chrome-headless-shell` 1243, through `MCHEZO_CHROMIUM_PATH`. The harness ran on this machine's Node v22.23.4; the server ran inside the pinned image.
- **An observation, out of scope:** the TV leaderboard shows a player's negative change (e.g. `−120`) in the gain colour, where the phone's list shows it neutrally.
