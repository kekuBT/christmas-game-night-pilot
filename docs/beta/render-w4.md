# W4 on Render: the restart drill (Beta R4, handoff 6933392621; review 6935165862)

**Status: prepared. The real W4 is PENDING.** Nothing here has run on Render.
- **The local rehearsal below** proves the restart mechanics of the pinned artifact on this machine's Docker: a stop and start of the same container, and a fresh container on the same data. **It is not a Render deploy, and not a dashboard restart.**
- **What W4 is:** the proposal's row (`beta-r4-hosting-proposal.md`): "a manual deploy, and a dashboard restart, each mid-game". The pass condition is "the room restored; acknowledged answers kept; sockets back".
- **Who runs it:**
  - **the operator,** who owns the Render account and its operations, inside an owner-approved window;
  - **someone at the screens:** the host, one or more guests, and the TV.

  Claude doesn't operate the account.

## Before any real deploy or restart (all required, in the same window)
1. **W1 to W3 have passed** on this service, and the owner has opened a window.
2. **A backup, received off Render, in this window:**
   - `cgn-backup` on the service ends with **`BACKUP_OK`**;
   - the copy is transferred off Render to the owner's chosen storage;
   - `cgn-receive` on the receiving device ends with **`RECEIPT_OK`**.

   **Without both lines from this same window, don't deploy or restart.** The steps are in `deploy/render/README.md` and are W5's.
3. **Maintenance mode:** **on** outside the window. The operator turns it **off** for the drill, records the times, and turns it back **on** at the end.
4. **The exact revision and data folder:**
   - `/health` reports `"revision":"7097ac2bb062925bb296a129f4771f1e68fd522d"`;
   - the service's `MCHEZO_DATA_DIR` is the **throwaway** `/var/data/cgn-w1`, never the real folder;
   - the access gate takes the throwaway code: check it by being admitted with it.

   **Record, before and after each step:**
   - the revision;
   - the data folder's identity (its path, `/var/data/cgn-w1`);
   - the gate's outcome (admitted, or refused).

   **Never record the code itself,** anywhere.
5. **The guard, and the way back:**
   - **The guard:** the deploy log must show `cgn-entrypoint: the environment matches the authorized configuration`. A `REFUSED: …` (exit 78) means the environment no longer matches the record. **Stop. Don't change the environment to force it through.** Find out why.
   - **The way back** is W7's: a revert-commit deploy of the previous release. **Never a one-click rollback across a configuration change:** the guard is meant to refuse it.

## Start from a known room and round
1. **Admit every screen** with the throwaway code: the host's, at least one guest's, and the TV's.
2. **Set up the room:** the host hosts (`W4 Host`); each guest joins (`W4 Guest 1`, …); the TV joins as a spectator.
3. **Seed a Memory Book note:**
   - play one short Trivia round to the end;
   - the host saves a note on its results ("Save a memory", text `W4 seed`);
   - the note shows in the Memory Book.
4. **Start a second Trivia round.**
   - Each phone answers question 1 and shows `Answer locked in`. Those answers are **acknowledged**: the server confirmed them.
   - Note who answered what, **in words**: never the correct answer.
5. **Optional:** at the same time, run `node scripts/beta/w1-check.mjs reconnect $O --code-file <code file>` (see `render-w1.md`). It watches its own room's sockets through the deploy or restart.

## The two checks, mid-round
**A tap made during a deploy or restart is UNCONFIRMED, not necessarily unrecorded.** There are two cases.
- **The service is fully down.** The tap never reaches a server, so nothing is recorded. This is the local rehearsal's controlled case.
- **A response is lost.** The tap reached the old instance, which recorded it and then stopped before the answer got back. The tap **is** recorded, though the phone couldn't confirm it.

The phone can't tell which case it was in. After it reconnects, it shows the server's **authoritative** state:
- a recorded tap shows as `Answer locked in`;
- an unrecorded one shows the question still open.

Retrying is safe: each tap carries its own request ID, and the server records an answer at most once. The rule for players:
- if the question shows open, tap again;
- if it shows locked in, don't.

| # | The operator does | During it, on the screens | After it, on the screens |
|---|---|---|---|
| **D1** Manual deploy | Render dashboard: **Manual Deploy** of the same pinned commit | The connection banner: `Connection lost. Reconnecting…`. A tap now must **not** show as in **until the server confirms it**. *Known wording:* it may say `Request failed (502)` (or another 5xx) rather than the friendly "We couldn't confirm that…": see the finding below. | Within the budget, every screen reconnects **by itself**, without a reload or a rejoin: the same names and round; the acknowledged answers still locked in; the TV still showing the playing round. **A tap made during the deploy:** the phone shows what the server recorded, locked in or still open. If it's open, tap again: it locks in once. Either way, it's counted **at most once**. |
| **D2** Dashboard restart | Render dashboard: **Restart** | As D1 | As D1. Then **finish the round:** each phone's Standings and the TV's Leaderboard show the same points for each player; no answer counted twice. Finally, the seeded Memory Book note is still there. |

**After each step,** record:
- the `/health` revision, which must still be the pin;
- the deploy log's guard line;
- the time from the operator's action until every screen showed the round again.

## The observation budget
**Rehearsal timings** (local, Docker, one machine):
- the service was back about 0.5 s after `docker start`, and about 0.8–0.9 s after a fresh container started;
- each screen's socket came back within the driver's checks.

**On Render the restart itself is longer,** and it is Render's to measure: a deploy builds and starts a new instance; a disk-backed service stops the old instance first, then gives it up to 30 s after `SIGTERM`.

| Measure | **W4 budget** |
|---|---|
| Every screen shows the round again, after `/health` answers with the pin | **within 30 s** |
| A screen still showing "Reconnecting…" **60 s** after `/health` answers | **FAIL** |

## Pass, fail and inconclusive
- **PASS** requires all of these, for D1 and for D2:
  - the same room, names and round;
  - every acknowledged answer kept, each counted once;
  - every tap made during the restart **counted at most once**, and each screen, after reconnecting, matching what the server recorded (locked in, or the question still open); a retry of an open question locks in once;
  - every screen back within budget, without a rejoin;
  - the revision unchanged, and the guard's "matches" line;
  - after D2, the round finished with consistent standings on every screen, and the Memory Book note readable.
- **FAIL** if any of these happens:
  - an acknowledged answer is lost, or any answer is counted twice;
  - after reconnecting, a screen shows an answer as in that the server didn't record, or shows a recorded answer's question still open;
  - the room, a seat or the Memory Book note is gone;
  - a screen needs a rejoin or a recovery code;
  - a screen still disagrees 60 s after `/health` is back;
  - the revision changes unexpectedly;
  - the guard refuses;
  - a code, a cookie, a token or a room code appears in the evidence.
- **INCONCLUSIVE** in any of these cases:
  - Render didn't actually restart (the same instance and start time);
  - a screen couldn't be observed;
  - recovery took 30–60 s.

  **Repeat that check once.**

## Evidence: what to record, and what never
- **Record:**
  - times;
  - the revision before and after;
  - the deploy log's guard line;
  - what each screen showed, in words;
  - the verdict per check.
- **Never record:** the access code, the room code or its QR, recovery codes, tokens, cookies, real names, or a correct answer before the round ends.

## The finding from the rehearsal: a tap made during a restart can show `Request failed (502)`
- **What happens:**
  - While the service is down, the proxy in front of it answers a tap with 502.
  - The phone retries three times (about 1.6 s), then shows the raw text **`Request failed (502)`**.
  - It shows that instead of its friendly wording for an unconfirmed tap, "We couldn’t confirm that — check your connection. If it doesn’t show as in, try again."
  - **The safety property holds:** the tap is **not** shown as in. In the rehearsal's fully-down case, the server never records it, and tapping again after the restart locks it in once.
  - **In a real deploy, a response can also be lost after the server committed the tap.** The phone then shows it as in once it reconnects (see "The two checks" above). This wording must never claim that the server didn't receive the tap.
- **Where it comes from:** the pinned client (`apps/web/src/App.tsx` `sendAction`, `apps/web/src/components/intentRetry.ts`, `apps/web/src/ui/mchezo/lib/errors.ts`) turns a final 5xx into `Request failed (<status>)`, which `humanError` passes through unchanged. Render's edge may answer 5xx while a disk-backed service restarts, so players could see this during W4.
- **A bounded repair is authorized (review 6935165862) as a separate stacked draft PR, after this tooling repair.**
  - When the intent retries end on a 502, 503 or 504 that carries no authoritative app error, the phone shows the existing "couldn't confirm" wording, never "not received".
  - **It must preserve:** typed app errors, the retry count and event IDs, the pending state, and exactly-once scoring.
  - **Its tests cover:**
    - the server down, with nothing committed;
    - a committed tap whose response was lost;
    - meaningful app errors.

  It changes the runtime, so it needs its own candidate review. **The release pin is unchanged until then.**
- **The repair candidate** is on the stacked draft branch `claude/beta-r4-c502-uncertain-delivery` (decision D-BR4-C502-01; evidence in `docs/evidence/beta-r4-c502/`). **Until a candidate built from it is reviewed and pinned, the release in W4 still shows `Request failed (502)`,** so expect that wording in D1 and D2.

## The local rehearsal (W4, prepared)
```
MCHEZO_CHROMIUM_PATH=<a chrome-headless-shell build> bash scripts/beta/w4-rehearsal.sh <packaged image tag> <work dir>
MCHEZO_CHROMIUM_PATH=<…> bash scripts/beta/w4-selftest.sh <packaged image tag>    # the rehearsal and its controls
```
- **The harness, `w4-rehearsal.sh`:**
  - **The setup:** the packaged pinned image in production mode, on a **Docker volume owned by the run**, with throwaway data and a throwaway code, behind `render-like-proxy.mjs`.
  - **The restarts:** on the driver's request: `docker stop` (graceful `SIGTERM`, passed on by `cgn-entrypoint`), then `docker start` of the same container; or a **fresh container** on the same volume.
  - **The actions fail closed** (`w4-control.sh`, review 6935165862). Every docker call is bounded.
    - **A stop** counts only when the container reads back as `exited` with exit code 0, not OOM-killed. `docker stop` also exits 0 after it had to `SIGKILL` (exit 137), and that is a failure.
    - **A start** needs a stopped container, and a new start time afterwards.
    - **A replacement** starts only when all of these hold:
      - the old container stopped gracefully;
      - it was removed, after its label read back as the run's, and confirmed gone;
      - no container uses the data volume.

      After any failure, **no replacement starts**, and the driver stops the rehearsal there.
  - **After each restart:** readiness, the pinned `/health` revision, and the run's label.
  - **Isolation is W3's:** a run id; labelled containers and volumes, removed only when the label reads back as the run's; a port preflight; checked startup steps; owned processes; private, removed code and key files; cleanup run twice.
- **The driver, `w4-rehearsal.mjs`,** with a host, a guest and a TV in Chromium. Its checks:
  - **S:** a seeded Memory Book note.
  - **P:** acknowledged answers before the first stop.
  - **R1 (stop and start):**
    - a tap while down isn't shown as in, and isn't saved;
    - the same room, seats and round;
    - the answers kept once;
    - a new live socket on each page;
    - each screen showing the playing round on that live connection (rendered);
    - play continuing (the host answers in its own page).
  - **R2 (a fresh container on the same data):** the same checks, and the Memory Book note still reads back.
  - **L, the one-writer lock:** a second server in the running container is refused, exit 2.
  - **G, the rollback guard:**
    - **The setup:** a probe container with another public origin, on its **own fixture volume** that holds only a copy of the authorization record. The record is copied as a tar stream out of the running container; the running server never writes it. **The data volume is never mounted by a second container.**
    - **The pass:** the probe must exit 78 with `REFUSED` before its deadline (60 s).
    - **Failures:** a server starting, any other exit, or the deadline.
    - **Teardown:** bounded; labels read back first; confirmed gone.
    - **The data volume's only user,** before and after, must be the container under test.
  - **F:** the round finishes; every answer once; the score equals the score of the recorded answers; the host's, guest's and TV's rendered standings equal the recorded scores.
- **The controls, `w4-selftest.sh`:**
  - **K0:** the fault-injection tests, `w4-control-selftest.sh`. They source the same `w4-control.sh` and run it against a mock docker.
    - **The stop failures:** the CLI fails; a forced exit (137); an OOM kill; an unreadable state; still running.
    - **The start failures:** not stopped; no new start.
    - **The fresh failures:** each stop failure; a failed or unconfirmed removal; a container that isn't the run's; another container on the volume.
    - **The guard failures:** hanging; a server starting; another exit; 78 without `REFUSED`; a failed teardown.

    Each must fail closed, with no replacement after a failure and the sentinels kept.
  - **K0M, the meta-control:** the same tests, pointed at a copy with the reviewed defects put back, must FAIL on those cases. The defects:
    - a stop judged by the CLI's exit alone;
    - a removal's outcome ignored;
    - no check of the volume's users.
  - **K1:** the W3 harness's mock cases M1–M5, pointed at the W4 harness.
  - **K2:** the rehearsal.
  - **K3, the negative control:** a fresh container on **empty** data must fail exactly the six continuity and durability checks after R2.
  - **K4:** a port already in use.
  - **K5:** a wrong expected revision.
  - **K6:** a guard that never answers.
  - **K7:** a guard that lets a server start (the server run without `cgn-entrypoint`).
  - **K8:** a forced stop (`SIGKILL` at once).

    Each of K6–K8 must fail at its step and stop the run there. For K6 and K7, the probe's teardown must also be bounded and confirmed, and the data volume's only user must stay the container under test.
  - **Sentinels must survive every case:** a pre-existing `w4-svc` container, a `w4-data-sentinel` volume and a look-alike process.
- **The one-writer lock's scope:** the lock is per network namespace (`docs/beta/beta-r1-architecture.md`), so the rehearsal checks it **inside** the running container.
  - **Across containers:** a second container is a different namespace. What stops two writers there is the order: stop, then a confirmed removal, then the replacement. The harness enforces that order, and Render's disk-backed deploys follow it.
  - **The lock probe:** it deliberately runs a second server on the live data folder, because the lock is what it tests. If the lock regressed, that process would run for at most 20 s, on the run's throwaway data only, and L would fail.

**What the rehearsal does not cover:**
- Render's build and deploy pipeline, its edge's answers during the restart, the disk's detach and attach, and the 30 s `SIGKILL` deadline;
- a real network;
- phones.

Those are D1 and D2 above, and they stay **pending**.
