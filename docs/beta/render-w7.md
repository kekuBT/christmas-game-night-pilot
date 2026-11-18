# W7 on Render: rolling back to the previous release (Beta R4, handoff 6941129590)

**Status (2026-11-18, review [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883)): B-W7-01's local engineering proof has PASSED. The real W7 is NOT RUN; it waits for the owner's execution approval.**
- **The release pair is audited:** `72e9d8b` (`aac13a8a…`) forward, `7097ac2` (`a693c543…`) to roll back to.
- **What passed:** the compatibility on a received copy, the reviewed pins-only forward and revert patches, and the exact positive gates and protocol check on the retained archives.
- **Not applied yet:** the forward and revert patches are preparation artifacts only.
- **Nothing here has run** on Render, over SSH, against production data, with the owner's keys, or as a provider-side rollback.
- **What W7 is:** the proposal's row ([beta-r4-hosting-proposal.md](beta-r4-hosting-proposal.md)): "a revert-commit deploy of the previous release, then the acceptance checks. And one deliberate one-click rollback across a configuration change, to see the guard refuse it." The pass condition is "the previous release serves the current configuration; the one-click rollback fails closed".
- **The rules** (the proposal's "Rollback" section, unchanged):
  - **Never use Render's one-click rollback.** It brings back the old deploy's environment values, but never the disk.
  - **Roll back by a revert commit** in the deploy repository, then a normal manual deploy. That runs the same artifact gate and keeps the service's **current** environment values.
- **Unchanged here:** the runtime and the canonical release pins (`7097ac2`, archive `a693c543…`); the guard scripts; the Dockerfile; the artifact gate. W7 adds a runbook, a local rehearsal and its tools, with no runtime or deploy change.
- **Who runs it:**
  - **the operator,** who owns the Render account, inside an owner-approved window;
  - **the owner,** who holds the private `age` identity and the receiving device.

  Claude doesn't operate the account, the storage or the keys.

## B-W7-01: the audited release pair (local engineering proof PASSED; hosted W7 pending)
- **Where it stands** (handoff [6966073894](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6966073894)):
  - **Done (local engineering):**
    - the full gate on `72e9d8b`: developer-run, 112/112, its raw evidence read independently;
    - its independent archive audit: archive `aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6`, inventory `4f58b323…`, `builtAt` `2026-11-18T01:07:42.001Z`, recorded in [release-72e9d8b.md](release-72e9d8b.md);
    - the exact-pair compatibility check on a received copy (review 6966023566);
    - the pins-only forward patch and its revert, in [pins-72e9d8b/](pins-72e9d8b/README.md). They were reviewed, and checked independently in review 6966711883:
      - the proposed forward context installed the exact `aac13a8a…` through its own unchanged gate (`ARTIFACT_GATE_OK`, `INSTALLED_OK`);
      - the reverted context installed the exact `a693c543…` the same way;
      - the focused actual-pair protocol check passed on those gate-installed packages.
  - **Not done, and owner-gated:**
    - **applying the patches** in the private deploy repository. The forward and revert commits are not made; the patches are preparation only;
    - **the hosted operation below;**
    - **native W8.**
- **History (as written on 2026-11-17; superseded by the above):**
  - `7097ac2` was then the **only** audited archive of this route: SHA-256 `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131`, recorded in [release-7097ac2.md](release-7097ac2.md). No other archive had been audited, pinned or received.
  - So the actual predecessor-artifact check **could not pass then**: there was nothing to identify by revision and digest, and no data-format evidence for a real release pair.
  - It has since passed locally, with `72e9d8b` as the newer release.
- **What was needed (history):** an audited release **newer** than `7097ac2`, to deploy first and roll back from. The rollback target, `7097ac2` (`a693c543…`), is already audited. Preparing and independently auditing the newer release is engineering work. Only the hosted execution and any spending need the owner's decision (clarified in [6951228654](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6951228654)).
  - **The proposed candidate:** `72e9d8b`, the reviewed uncertain-delivery repair. Its runtime differs from `7097ac2` only in three web-client files; the server, the content and the packages are identical. It was unpackaged then; it is now audited (above).
  - **The engineering steps:**
    1. a full gate on it: **done** (developer-run, independently read);
    2. the package and its release record: **done** ([release-72e9d8b.md](release-72e9d8b.md); `builtAt` recorded from the selected bytes, 6966711883);
    3. the independent private audit of the archive: **done** (6966023566);
    4. a pins-only forward commit, and its revert prepared in advance: **prepared as patches and reviewed** ([pins-72e9d8b/](pins-72e9d8b/README.md)). They are not applied: the commits are made in the deploy repository only in the owner-approved forward deploy;
    5. the local checks under test pins: **done for the pair** (the LOCAL SURROGATE gate check L1 in [the evidence](../evidence/beta-r4-w7/pins-72e9d8b/README.md));
    6. the real predecessor check on the audited `a693c543…`, where that archive is kept: **done** (6966711883: the reverted context's exact gate and the focused actual-pair check). The received-copy compatibility part passed in 6966023566.
  - **The owner-gated hosted operation:** the forward deploy, then W7's rollback and return, and separately the deliberate one-click check. That check runs on the single planned service, and only in its synthetic-data phase ([the exception below](#the-synthetic-phase-exception)). Any new resource needs approval too.
  - **Why the pair was needed (history):** without it, a W7 on Render could only "roll back" to the release already running, which proves nothing.
- **For the local rehearsal only,** a clearly labelled **LOCAL SURROGATE** stands in for the predecessor, built from `f93e9cba8613859be9891706ead1c60157c73de2`, the commit before the R5 UI changes. Its identity and build:
  - built by [build-predecessor.sh](../evidence/beta-r4-w7/runners/build-predecessor.sh), the same procedure as the R2 rebuild (Node 22.16.0, `npm ci`, `pack.mjs`);
  - archive SHA-256 `e34c6c1cde04d022cff8b161a6edb4d89b298f2bd049e9b58961b2cddaf16210`;
  - inventory 144 files, SHA-256 `338e693179d285033198369f133d285ac2438bf7a7f1cce4e118daf81ddfd1d3`.

  It differs from `7097ac2` only in the web bundle (`apps/web/dist`). The server, the content and the packages are identical: `git diff f93e9cb 7097ac2 -- src package.json package-lock.json` is empty.

  **The surrogate tests the protocol; it cannot pass the actual predecessor-artifact check.** Because its server is identical, its compatibility result says nothing about a future predecessor whose server differs. Each real W7 needs its own compatibility evidence (step 3 below).

## Before the window (all required)
1. **The owner's approval** of a W7 window, its date, and the release to roll back to.
2. **The previous audited release:**
   - its revision (40 hex digits);
   - its archive SHA-256;
   - its inventory, with the inventory's own SHA-256;
   - its release record (like [release-7097ac2.md](release-7097ac2.md)).

   No release record means no W7 (B-W7-01).
3. **Its compatibility with the current data**, shown on a **disposable copy**: the latest received backup (`RECEIPT_OK`), never the live disk, on the operator's own machine. This is the rehearsal's COMPAT step:
   1. Build the previous image through the same gate (`scripts/beta/w7-artifact-check.sh`, step A1).
   2. On a throwaway volume, use the previous release's own datatool to `verify` the copy, `restore` it into a new folder, and `check` it as the service user.
   3. `cgn-authorize` that folder, then start the previous release on it. The startup log must say `[restore] N room(s) restored, 0 not loaded`, with no quarantine.
   4. Through the gate: the seats, the approved Memory Book entries, the answers and the completed score ledger are as before, and one new action is acknowledged.
   5. After a graceful stop, the action is persisted and the ledger is kept.
   6. The **current** release's `datatool check` accepts the folder the previous release wrote.

   **If any of this fails, STOP:** the previous release can't safely read the current format. That is a blocker for the owner, not something to work around in the window.
4. **The revert commit, reviewed.** It changes **only the artifact pins** back to the previous release:
   - the gate's `REVISION`, `ARCHIVE` and `INVENTORY_SHA256`;
   - the inventory pin file;
   - `pins/archive.sha256`;
   - the two file names in `.dockerignore` and the Dockerfile.

   `scripts/beta/w7-pred-context.sh` makes exactly that change and prints the diff. **The guard scripts and their pins stay the current ones.** If the commit being reverted also changed a guard script, don't revert that part.
5. **The players are told** about the window and its cutoff (as in W4–W6). No game starts during it.
6. **A throwaway rehearsal of steps 2–4 on this machine passed** on the commits involved (the local rehearsal below).

## The procedure (revert-commit path)
Every step happens in maintenance (Render's maintenance mode on), and each must pass before the next.
1. **Maintenance on.** The public `/health` answers 503.
2. **The preflight, over SSH** (`cgn-authorize --status`): `data_dir` is the approved folder, `pending_data_dir=none`, and `serving=` is that same folder.
   - **A pending switch (W6) refuses the rollback.** Commit or abort it first (`--abort` only from the instance serving the approved folder).
3. **The window's backup and its receipt:**
   - `cgn-backup` prints `BACKUP_OK <archive> sha256=<hash>`;
   - `scp -s` takes it off Render to the owner's storage;
   - it is fetched back;
   - `cgn-receive` on the owner's device prints `RECEIPT_OK … sha256=<the same hash>`.

   **A missing receipt, a receipt for another backup (an earlier nightly one, or one taken before a record change), or a `RECEIPT_FAILED` refuses the rollback.** If the record changed after the backup, take a new one.
4. **The compatibility evidence** (Before the window, item 3) exists **for this window's received copy**.
5. **Deploy the revert commit** by a manual deploy (auto-deploy is off). **Don't touch the environment:** the service keeps its current data folder, origin, proxy count and code.
   - **The build log must show** `ARTIFACT_GATE_OK archive=<previous archive> revision=<previous revision> inventory=<previous inventory>` and `INSTALLED_OK revision=<previous revision>`.
   - **A disk means one instance:** Render stops the old instance before it starts the new one, so the old writer is gone before the new one starts.
6. **After the start, still in maintenance:**
   - the startup log has the guard's line, `the environment matches the authorized configuration: the APPROVED data folder <folder>`, and `[restore] N room(s) restored, 0 not loaded (data: <folder>)`;
   - **the reopen gate:** the private probe says `UP <previous revision>`, and `cgn-authorize --status` approves `<folder>`, with `pending_data_dir=none` and `serving=<folder>`;
   - **a wrong revision, a pending switch, or a folder not served keeps maintenance on.**
7. **Maintenance off**, then the acceptance checks:
   - the authorized code opens the gate, and an old one doesn't;
   - a known room's host and guest seats work with no rejoin;
   - the completed score ledger and the approved Memory Book entries are as before;
   - a new action is acknowledged and persisted;
   - phones reconnect.
8. **The return to the reviewed release** is the same procedure. Maintenance; a new backup and its receipt; the preflight; then a commit restoring the reviewed pins (the revert of the revert), deployed; the reopen gate on the reviewed revision; the checks. The current release must serve what the previous one wrote (the rehearsal's window 2).

## Failure outcomes
| What happens | What it means | What to do |
|---|---|---|
| The build's gate fails (`ARTIFACT_GATE_FAILED`) | The archive, its pin or its inventory isn't the reviewed previous release | **Nothing was deployed.** The running instance keeps serving, still in maintenance. Fix the commit, or abandon the window. |
| The start refuses (exit 78, `cgn-entrypoint: REFUSED: …`) | The environment no longer matches the record | **Don't re-authorize to make it pass.** Find the value that changed. The record and the data are untouched (the rehearsal's S1–S5). |
| The start fails (a crash, a failed health check, a killed instance) | The previous release didn't come up. With a disk, the old instance has already stopped. | **The safe recovery is an ordinary deploy of the reviewed release's commit**, with the current environment. Don't edit the record and don't use a special container. The guard accepts it, and the data are unchanged (the rehearsal's F). Then the reopen gate on the reviewed revision. |
| The reopen gate refuses | The wrong revision, a pending switch, or a folder not served | Stay in maintenance. Find out why before going on. |
| Something is wrong after reopening | — | Maintenance on. Return to the reviewed release (procedure step 8). For a data problem, restore the window's received backup by W6 ([render-w6.md](render-w6.md)). |

## The provider one-click rollback: never used; modelled locally; one deliberate check later
**Why it fails closed:** a one-click rollback restores an old deploy with that deploy's environment values. The disk, and so the record written by `cgn-authorize`, is not rolled back. Before every server launch, the entrypoint compares the environment with that record. So any value changed since that deploy is refused with exit 78, and no server starts. Those values are:
- the data folder;
- the access code (as a salted hash);
- the origin;
- the proxy count.

**Locally (the rehearsal's window 3),** the previous image ran against the preserved record with stale values:
- an old data folder (the validation folder);
- a rotated code;
- an old origin;
- an old proxy count;
- all of them at once.

Each start was refused (78). The record stayed byte-identical, the data folder's files were unchanged, and maintenance stayed closed.

### The synthetic-phase exception
The architect's decision is in review [6954485280](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6954485280). Execution still needs the owner's approval. It replaces this runbook's earlier "a throwaway service, never the family's service", without a second service or its cost.
- **The condition:** the deliberate one-click check may run on **the single planned service**, but only while that service and its disk **have never held family data or a real access code.** That means:
  - the data folder is the throwaway `/var/data/cgn-w1`;
  - the access code and the `age` identity are throwaway ones;
  - `/var/data/cgn` has never been authorized.
- **Once real data or a real code has existed on the service, the exception ends for good.** A later one-click check would need a separate throwaway service. That is a new resource with its own approval, and none is proposed.
- **Recovery:** step 6 below. An ordinary manual deploy of the current commit, with the current environment; the record, the folder, the synthetic room and the reopen gate exactly as before; auto-deploy still off.
- **Cleanup:** step 7 below, and the synthetic data at the go/no-go.

**The provider-specific steps for a future authorized window.** They run only under the exception above, with a throwaway access code and `age` identity.
1. **A configuration change to cross:** on the service, still in its synthetic phase, `cgn-authorize` new values (for example, a rotated throwaway code). Then save the environment, which redeploys. The checks pass on the new values.
2. **Maintenance on.** A backup and its receipt (procedure step 3), as before any rollback.
3. **The deliberate one-click rollback,** from the dashboard, to the deploy **before** the change.
4. **Expect:**
   - the deploy fails;
   - the instance's log shows `cgn-entrypoint: REFUSED: the access code is not the authorized one` (or the line for the value that changed), exit 78;
   - no `Listening` line;
   - the public side stays in maintenance.
5. **Verify on Render** (each is a provider fact to record, not assumed here):
   - which values a rollback restores (environment variables, and secret files if any);
   - whether it reuses the old build or rebuilds;
   - whether the platform retries the refused start, and for how long;
   - what the dashboard and the deploy's events show;
   - that the disk was not rolled back.
6. **Recover** with an ordinary manual deploy of the current commit, with the current environment. Then confirm:
   - `cgn-authorize --status` shows the record exactly as before;
   - `datatool check` passes on the folder;
   - the room, its seats and the ledger are there;
   - the reopen gate passes.

   Check that auto-deploy is still off afterwards.
7. **Cleanup.** The service and its disk stay: W8 still runs on them with synthetic data. Record the refused deploy, which stays in the service's deploy history. **At the go/no-go,** once the real folder is authorized and serving:
   - delete `/var/data/cgn-w1` and its backups on the disk;
   - delete the off-Render backups encrypted to the throwaway `age` identity, then destroy that identity;
   - the throwaway code has already been replaced by the real one.

   Render's daily snapshots from the synthetic phase hold only synthetic data, and expire after seven days.

**Remaining prerequisites for that window:**
- the owner's approval of the window (the execution decision). Reusing the service and disk avoids a second service or disk charge. The usual Render overages and tax may still apply ([beta-r4-readiness.md](beta-r4-readiness.md) §3);
- the exception's condition, checked first: no real data or real code has ever been on the service;
- a throwaway access code and `age` identity created for it;
- the revert-commit half's release pair: **done locally** (B-W7-01, above). The forward deploy of `72e9d8b` has to come first, in its own owner-approved step;
- the hosted validation of the W6 switch, which is still open.

## The local rehearsal (preparation only)
**What it is:** `scripts/beta/w7-rehearsal.sh <current image> <previous image>`, with its self-test `scripts/beta/w7-selftest.sh`. It runs on throwaway Docker volumes owned by the run, with:
- a throwaway access code (and an old one);
- a disposable `age` identity;
- a Render-like proxy for the public side, a LOCAL STAND-IN that starts and stops maintenance;
- the transport and storage of the W5 chain as LOCAL SURROGATES.

**The images:**
- **The current image:** `cgn-render:check`, built from this checkout's `deploy/render`, with the local rebuild of `7097ac2` under a test pin (as in W4–W6).
- **The previous image:** the LOCAL SURROGATE `f93e9cb`, built through the same gate by `scripts/beta/w7-artifact-check.sh`. That script also shows the gate refusing a wrong artifact:
  - the current archive under the previous name;
  - the previous context with its archive pin pointed at the current archive;
  - the canonical context given the previous archive.

**What the rehearsal does:**

| Part | What it shows |
|---|---|
| B0 | An earlier backup with its receipt, used only to show it can't stand in for the window's |
| Window 1 | **D6:** a pending switch refuses the preflight, even with a receipt. **D1:** a missing receipt refuses it. **D2:** a changed copy (`RECEIPT_FAILED`), B0's receipt and a receipt from before the abort each refuse it. **COMPAT** on a disposable copy (Before the window, item 3), required by the preflight. **The preflight** passes. **D5:** a second writer is refused by the start gate (a container still on the volume), and the data lock refuses a second server in the instance's own network namespace. Then: a graceful stop, and the window's backup equals the data at the stop; one writer; the previous release on the **current** environment (the APPROVED folder, the room restored). **D4:** the reopen gate refuses a wrong served revision. Then the reopen gate on the previous revision, and the checks through the ingress: the seats, the completed ledger, the approved entry, the answers' values, a new acknowledged action; an old code refused (401). |
| Window 2 | **The return.** A backup and its receipt; the persisted state after the previous release (the ledger kept event for event, no score or finish added, the action persisted), with the check's own three negative controls; the current release on the same environment, the reopen gate, and the previous release's data served |
| Window 3 | **S1–S5:** the one-click model, the previous image with stale values, each refused (78), the record and data unchanged, maintenance closed. **F:** the previous release killed during its start; the record and data unchanged; the recovery is an ordinary start of the reviewed release, then the reopen gate and the checks. |

**Isolation:** the W4–W6 rules.
- Label `w7.owner=<run id>`; removal only after the label reads back, and confirmed gone.
- Private material in a mode-700 folder removed on exit.
- Cleanup runs twice. An unlistable inventory is UNVERIFIED and fails the run.
- A leak scan covers the kept run folder and the run's own log.
- The self-test adds a port conflict, an unlistable inventory, an interruption, and sentinels of another owner that must survive.

**The limits of the rehearsal:**
- **The previous release is a LOCAL SURROGATE** with an identical server. That was the rehearsal's limit; the actual pair has since been checked separately (B-W7-01).
- **The data lock is per network namespace.** A second container on the same volume in its own namespace is NOT excluded by the lock. On Render, one instance per disk and stop-before-start deploys exclude it, and the runbook's one-writer rule checks it. The rehearsal proves the in-instance lock (D5b) and the start gate (D5a), not the platform's guarantee.
- **Maintenance, the build service, the deploy events and the one-click rollback** are Render's, and are only modelled here.

Evidence: [docs/evidence/beta-r4-w7/](../evidence/beta-r4-w7/).

## Pending
- **B-W7-01:** the local engineering proof PASSED (6966711883). What remains is the owner-gated forward deploy that applies the reviewed patches.
- **The real W7** (the revert-commit deploy and the deliberate one-click check), in owner-approved windows. The one-click check runs only under the synthetic-phase exception.
- Render, production data, owner keys and provider-side execution all stay gated on separate owner approval.
