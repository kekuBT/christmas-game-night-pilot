# W4 on Render: the restart drill (Beta R4, handoff 6933392621)

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
   - the code is the throwaway code.

   Record all of them before and after each step.
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
   - Each phone answers question 1 and shows `Answer locked in`. Those answers are **acknowledged**.
   - Note who answered what, **in words**: never the correct answer.
5. **Optional:** at the same time, run `node scripts/beta/w1-check.mjs reconnect $O --code-file <code file>` (see `render-w1.md`). It watches its own room's sockets through the deploy or restart.

## The two checks, mid-round
| # | The operator does | During it, on the screens | After it, on the screens |
|---|---|---|---|
| **D1** Manual deploy | Render dashboard: **Manual Deploy** of the same pinned commit | The connection banner: `Connection lost. Reconnecting…`. A tap now must **not** show as in. *Known wording:* it may say `Request failed (502)` (or another 5xx) rather than the friendly "We couldn't confirm that…": see the finding below. | Within the budget, every screen reconnects **by itself**, without a reload or a rejoin: the same names and round; the acknowledged answers still locked in; the TV still showing the playing round. A tap made during the deploy is **not** counted; tap it again: it locks in once. |
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
  - a tap made during the restart not counted, and counted once when tapped again;
  - every screen back within budget, without a rejoin;
  - the revision unchanged, and the guard's "matches" line;
  - after D2, the round finished with consistent standings on every screen, and the Memory Book note readable.
- **FAIL** if any of these happens:
  - an acknowledged answer is lost, or counted twice;
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
  - **The safety property holds:** the tap is **not** shown as in, the server never records it, and tapping again after the restart locks it in once.
- **Where it comes from:** the pinned client (`apps/web/src/App.tsx` `sendAction`, `apps/web/src/components/intentRetry.ts`, `apps/web/src/ui/mchezo/lib/errors.ts`) turns a final 5xx into `Request failed (<status>)`, which `humanError` passes through unchanged. Render's edge may answer 5xx while a disk-backed service restarts, so players could see this during W4.
- **A proposed bounded repair, for review; not made here:**
  - when the intent retries end on a 502, 503 or 504 whose body isn't the app's own JSON, show the `NOT_DELIVERED` wording;
  - add a unit test in the existing errors and intent-retry tests, and a check in the W4 rehearsal.

  It would change the runtime, so it needs its own approval and a new candidate. **The release pin is unchanged.**

## The local rehearsal (W4, prepared)
```
MCHEZO_CHROMIUM_PATH=<a chrome-headless-shell build> bash scripts/beta/w4-rehearsal.sh <packaged image tag> <work dir>
MCHEZO_CHROMIUM_PATH=<…> bash scripts/beta/w4-selftest.sh <packaged image tag>    # the rehearsal and its controls
```
- **The harness, `w4-rehearsal.sh`:**
  - **The setup:** the packaged pinned image in production mode, on a **Docker volume owned by the run**, with throwaway data and a throwaway code, behind `render-like-proxy.mjs`.
  - **The restarts:** on the driver's request: `docker stop` (graceful `SIGTERM`, passed on by `cgn-entrypoint`), then `docker start` of the same container; or a **fresh container** on the same volume.
  - **After each:** readiness, the pinned `/health` revision, and the run's label.
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
  - **G, the rollback guard:** a second container with another public origin refuses with 78.
  - **F:** the round finishes; every answer once; the score equals the score of the recorded answers; the host's, guest's and TV's rendered standings equal the recorded scores.
- **The controls, `w4-selftest.sh`:**
  - **K1:** the W3 harness's mock cases M1–M5, pointed at the W4 harness.
  - **K2:** the rehearsal.
  - **K3, the negative control:** a fresh container on **empty** data must fail exactly the six continuity and durability checks after R2.
  - **K4:** a port already in use.
  - **K5:** a wrong expected revision.
  - **Sentinels must survive every case:** a pre-existing `w4-svc` container, a `w4-data-sentinel` volume and a look-alike process.
- **The one-writer lock's scope:** the lock is per network namespace (`docs/beta/beta-r1-architecture.md`), so the rehearsal checks it **inside** the running container. A second container is a different namespace: what stops two writers there is the order, stop before start, which the harness follows and Render's disk-backed deploys follow.

**What the rehearsal does not cover:**
- Render's build and deploy pipeline, its edge's answers during the restart, the disk's detach and attach, and the 30 s `SIGKILL` deadline;
- a real network;
- phones.

Those are D1 and D2 above, and they stay **pending**.
