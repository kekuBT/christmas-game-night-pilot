# W6 on Render: restoring a received backup (Beta R4, handoff 6938602366; repair review 6939462697)

**Status: prepared; the recoverable switch is rehearsed locally. The real W6 is PENDING.** Nothing here has run on Render, over SSH, against the owner's storage or keys, or as a Render disk snapshot.
- **The local rehearsal** (below) proves the restore and the switch mechanics on this machine, with the pinned runtime `7097ac2`. The transport, the storage and the ingress are **explicitly labelled local surrogates**.
- **The guard changed** (review 6939462697), so a failed switch is recoverable:
  - `cgn-authorize` and `cgn-entrypoint` now support a prepare / commit-or-abort switch of the data folder.
  - That's two `deploy/render` scripts and their pins. The runtime and the release pin are unchanged.
- **What W6 is:** the proposal's row (`beta-r4-hosting-proposal.md`): "Restore of the received copy … Separately, a Render snapshot restore on throwaway data." The pass condition is "the rooms and books back; the old folder kept".
- **Who runs it:**
  - **the operator,** who owns the Render account, inside an owner-approved window;
  - **the owner,** who holds the private `age` identity and the receiving device.

  Claude doesn't operate the account, the storage or the keys.

## How a data-folder switch works now (review 6939462697)
**The record** on the disk (`/var/data/cgn-authorized.conf`):
- It holds the **approved** configuration: the data folder, the public origin, the proxy count, and a salted hash of the access code.
- It may hold **at most one pending** replacement folder. The pending folder shares the origin, proxy count and code, and carries the approved folder it was prepared against.
- A record with no pending entry is exactly the earlier format, so existing records keep working.

**The operator's actions** (`cgn-authorize`, over SSH):

| Command | Where it runs | What it does |
|---|---|---|
| `cgn-authorize --prepare <dir>` | the running instance | Names `<dir>` as the one pending folder. **The approved folder keeps starting with its own `MCHEZO_DATA_DIR`.** Refused if another switch is pending, or if `<dir>` is the approved folder, is nested with it, is missing, or isn't the service user's. |
| `cgn-authorize --commit <dir>` | **only** the instance serving `<dir>` (checked) | `<dir>` becomes the approved folder. **From then on, the previous folder is refused.** |
| `cgn-authorize --abort <dir>` | **only** an instance NOT serving `<dir>` (checked) | Removes the pending entry. **From then on, `<dir>` is refused.** The approved folder is unchanged. |
| `cgn-authorize --status` | the running instance | Prints the approved folder, the pending one (or `none`) and the folder this instance serves. It never prints the code or its hash. |

**At start, the entrypoint** (`MCHEZO_DATA_DIR` selects explicitly which folder starts):
- **the approved folder** starts and is logged as `APPROVED`;
- **the pending folder** starts and is logged as `PENDING (not committed …)`;
- **anything else is refused (exit 78):** an unrelated folder; a mismatched origin, proxy count or code; or an unusable record (malformed, or a STALE pending entry).

**Every record change** holds a lock, writes a new file, flushes it and renames it into place. An interrupted change leaves the old record or the new one, never a mix.

**Why this fixes F-W6-01:**
- A failed start on the pending folder no longer touches what the approved folder needs.
- **An ordinary redeploy with the original environment** brings the service back, while maintenance stays on.
- That needs no SSH to the failed instance, no one-off job and no edit to the record.
- Then `--abort` runs from the recovered instance.

## Two backups, both received off Render, before any switch
| | What | Why |
|---|---|---|
| **R, the restore source** | the backup to bring back: its `BACKUP_OK` line, and its `RECEIPT_OK` on the **fetched-back** copy (W5's procedure, `render-w5.md`) | only a verified decrypted copy is ever uploaded |
| **C, the current data** | **a fresh backup of the CURRENT data folder, in THIS window:** `BACKUP_OK`, then its `RECEIPT_OK` (W5's procedure, use A) | the switch replaces what is being served. **No live switch without C's `RECEIPT_OK` from this same window.** |

The receiving identity stays on the receiving device. The plaintext copy is uploaded only after its `RECEIPT_OK`, and only to a new folder.

## Before the window (all required)
1. **The owner opened a W6 window** and named the operator. W1–W5 have passed. **Maintenance mode is ON** for the whole procedure (a public 503 means nothing; use the private probe from `render-w5.md`).
2. **The deployed image carries the reviewed scripts** of this repair (their hashes are in `deploy/render/pins/scripts.sha256`). `cgn-authorize --status` must answer on the instance.
3. **R's receipt exists:** its `RECEIPT_OK … sha256=<H_R>` line, and the decrypted copy `<RECEIVE-WORK>/<STAMP_R>` on the receiving device.
4. **The names, written in the window note:**
   - the current folder `<CURRENT>` (the approved one, e.g. `/var/data/cgn`);
   - a **new** target folder `<TARGET>` (e.g. `/var/data/cgn-restored-<STAMP_R>`);
   - a **new** staging folder `<STAGING>` (e.g. `/var/data/restore-<STAMP_R>`).

   None of the three may exist yet, except `<CURRENT>`.
5. **Disk capacity:** `df -h /var/data` has room for the staging copy plus the restored folder.
6. **The players are told before the window** that the restore brings the night back to the time of R. Anything played after R is lost.

## The procedure
| Step | Where | Do | Pass | On anything else |
|---|---|---|---|---|
| 0 | SSH | Create the private probe (`render-w5.md`), then `node /tmp/cgn-probe.mjs check`; `cgn-authorize --status` | `UP 7097ac2bb062925bb296a129f4771f1e68fd522d`; `STATUS data_dir=<CURRENT> … pending_data_dir=none serving=<CURRENT>` | stop |
| 1 **C** | SSH and the receiving device | W5's procedure for the **current** data (use A): `BACKUP_OK`, then its `RECEIPT_OK` on the fetched-back copy | both lines, for the same backup, in the window note | **stop: no switch.** The service keeps running on `<CURRENT>`. |
| 2 **Upload R** | the receiving device | `ssh <SSH> test ! -e <STAGING>` must succeed, then `scp -s -r <RECEIVE-WORK>/<STAMP_R> <SSH>:<STAGING>` | the folder is there, owned by the service user | delete only `<STAGING>`, then retry |
| 3 **Verify** | SSH | `cd /app && node dist/server/datatool.js verify --backup <STAGING>` | `verify OK: <n> file(s) match the manifest of <time>` | stop: the copy is incomplete or changed. Nothing is restored. |
| 4 **Restore** | SSH | `cd /app && node dist/server/datatool.js restore --backup <STAGING> --into <TARGET>` | `restore OK: <rooms> room(s), <books> Memory Book(s) restored and verified` | `<TARGET>` occupied, or the copy refused: stop. Never empty a folder to make room. |
| 5 **Check** | SSH | `cd /app && node dist/server/datatool.js check --data <TARGET>` | `check OK: …; owned by this user … A server run by this user can use it.` | stop: no preparation, no switch |
| 6 **Preflight** | the window note | all of: C's `RECEIPT_OK` (this window); steps 3–5 OK; `<TARGET>` ≠ `<CURRENT>`; the probe `UP`; nothing pending | all true | stop |
| 7 **Prepare** | SSH (the running instance) | `cgn-authorize --prepare <TARGET>` | `PREPARED pending_data_dir=<TARGET> approved_data_dir=<CURRENT> …` | stop. Nothing has switched. |
| 8 **Switch** | dashboard | set `MCHEZO_DATA_DIR=<TARGET>`, then save (it redeploys: stop the old instance, then start the new) | the deploy log shows `the environment matches the authorized configuration: the PENDING data folder <TARGET> (not committed …)`, and the server starts | **the recovery below** |
| 9 **Check privately** | SSH (the new instance) | the probe (create it again; `/tmp` is per instance); `cgn-authorize --status`; then a private look at the known room (host and guest seats, the expected answers and scores, the Memory Book) | `UP` on the pin; `pending_data_dir=<TARGET> serving=<TARGET>`; R's state, and NOT anything played after R | **the recovery below** (or `--abort` after it) |
| 10 **Decide** | SSH (the new instance) | `cgn-authorize --commit <TARGET>` | `COMMITTED data_dir=<TARGET> (the previous folder <CURRENT> is no longer authorized)` | — |
| 11 **Reopen gate** | SSH | the probe, and `cgn-authorize --status` | `UP` on the pin; `STATUS data_dir=<TARGET> … pending_data_dir=none serving=<TARGET>` | maintenance stays on |
| 12 **Reopen** | dashboard | maintenance OFF, only after step 11 | — | — |
| 13 **Acceptance** (the play window) | phones and TV | **Every phone and the TV reloads** (a page from before can show cached state briefly). Then: the known room opens on the original seats with no rejoin; the expected answers and scores; the Memory Book's approved entries; nothing from after R | "the rooms and books back" | maintenance on, then the return below |
| 14 **Keep the old folder** | — | `<CURRENT>` stays untouched on the disk | "the old folder kept" | — |

**The recovery, from step 8 or 9 (before the commit):**
1. Maintenance stays on.
2. **Set `MCHEZO_DATA_DIR` back to `<CURRENT>` and save** (an ordinary redeploy). The approved folder starts. This needs no SSH to the failed instance.
3. On the recovered instance: `cgn-authorize --abort <TARGET>`, then `--status` shows `pending_data_dir=none serving=<CURRENT>`.
4. The probe. Reopen only if the window should go on; otherwise end the window.

`<TARGET>` is refused from then on. A new attempt starts again at step 7 (with a new target folder, or the same one after its check).

**A later return to `<CURRENT>`, after play resumed on `<TARGET>`:**
- This is a **new switch**, not an undo: `<CURRENT>` is refused after the commit.
- It needs maintenance, a **new backup of `<TARGET>`** with its `RECEIPT_OK` (W5, this window), then steps 7–12 with `<CURRENT>` as the folder.
- What `<TARGET>` gained since the commit isn't carried back; the new backup keeps it.

## The Render steps still to validate (a throwaway hosted window)
**These steps need a validation service and disk with no family data,** in an owner-approved window, before any real W6:

| What | Why it can't be settled locally |
|---|---|
| A deploy whose instance exits on start, on a disk-backed service (stop-before-start) | What Render does after it: retry, keep the service down, or bring back the previous deploy. The protocol must work in every case: the previous deploy's environment names `<CURRENT>` and starts. Render's exact sequence isn't verified here. |
| Redeploying with the original `MCHEZO_DATA_DIR` while the service is in maintenance and the last deploy failed | the platform's handling of a deploy after a failed one |
| `cgn-authorize --prepare/--commit/--abort/--status` over Render SSH | the SSH session's user, its `/tmp/cgn` (the server's pid file) and the disk path |
| The deploy log line (`PENDING data folder …`) as startup evidence | where Render shows the entrypoint's standard error |
| The probe and `--status` before turning maintenance off | the reopen gate on the real host |

## The Render disk snapshot: separate, and PENDING
- **What it does:** Render's disk snapshots are daily, kept 7 days. Restoring one **overwrites the whole disk** with its state at that time: every folder, the backups, the plaintext copies **and the authorization record**. Anything written after the snapshot is lost. ([Render: persistent disks](https://render.com/docs/disks); check the current page on the day.)
- **So it may run only:**
  - on a **throwaway target** (a validation service and disk holding no family data);
  - in an **explicit owner-approved window**;
  - after **C's `RECEIPT_OK`**: an off-provider copy of the disk's current data, which is then the only fallback, since the disk's own folders are overwritten.
- **What to record:** which snapshot (its time); what was lost after it; `/health`; `cgn-authorize --status` (the record comes back as it was at that time); the probe; then the acceptance checks.
- **The platform action is PENDING.** Nothing here rehearses it. The local rehearsal covers only folder restore and the switch.

## Failure outcomes
In every case: `<CURRENT>` is never written by these steps; nothing is overwritten; the next step doesn't run.

| Step | Symptom | What it means | Safe action |
|---|---|---|---|
| 1 | no `RECEIPT_OK` for C | the current data has no independent copy from this window | no switch; the service stays on `<CURRENT>` |
| 2 | `<STAGING>` exists | an earlier attempt | choose a new staging name; never reuse it |
| 3 | `verify` refuses | the upload is incomplete or changed | delete `<STAGING>`; upload again from the receipted copy |
| 4 | `restore` refuses | `<TARGET>` occupied, or the copy refused | a new `<TARGET>` name, or stop |
| 5 | `check` refuses | ownership, privacy, lock or write problem | stop; no preparation |
| 7 | `AUTHORIZE_FAILED` | a switch already pending, a wrong folder, or another change in progress | `--status`; commit or abort the earlier switch first, or stop |
| 8 | the server exits on `<TARGET>` | the pending folder can't be served | **the recovery:** redeploy with `<CURRENT>`, then `--abort` |
| 8 | `REFUSED` (exit 78) | the environment matches neither folder, or the record is unusable | redeploy with `<CURRENT>`; don't force it |
| 9 | the wrong data, or the probe not `UP` on the pin | not the intended restore | **the recovery** |
| 10 | `AUTHORIZE_FAILED` | not run on the instance serving `<TARGET>` | run it there, or **the recovery** |
| 11 | `pending_data_dir` isn't `none` | the switch is neither committed nor aborted | don't reopen; finish it |

**An unusable record** (damaged outside these tools, since every change is atomic) refuses every start, by design (fail closed). Its recovery is a Render snapshot or a reviewed fix; that is outside this procedure.

## The local rehearsal (preparation only)
`scripts/beta/w6-rehearsal.sh <image tag> [work dir]`, run by `scripts/beta/w6-selftest.sh <image tag>`. The guard on its own is tested by `scripts/beta/w6-guard-selftest.sh <image tag>`. The evidence is in `docs/evidence/beta-r4-w6/`.

| Real step | In the rehearsal |
|---|---|
| the instance and its disk | the image built from the pinned runtime with this repair's scripts (byte-identical to `deploy/render`), on a run-owned Docker volume |
| maintenance and reopening | **LOCAL SURROGATE:** the Render-like proxy, with `--maintenance` until the reopen gate (the private probe `UP` on the pin, and `--status` approving the expected folder with nothing pending) |
| R and C | **B1** (seeded state, approved entry, answers with private values) and **B2** (after a later answer), both through W5's chain: transport and storage **LOCAL SURROGATES**; `cgn-receive` unchanged on the fetched copy |
| `scp -s` of the verified copy | **LOCAL SURROGATE:** a tar stream into the container as the service user, into a new staging folder |
| steps 3–5 | the reviewed `datatool verify`, `restore --into` (new folder) and `check`, as the service user |
| steps 7–12 | `--prepare` in the live container; a graceful stop (exit 0), removed and confirmed gone; one container on the volume; a new container on the target (PENDING); the private checks; `--commit`; the reopen gate; then the proxy reopens |
| step 13 | over the reopened ingress: the original seats, the approved entry, the exact restored answers; a repeated answer refused; a replayed event recorded once; the round played to its end; then the **persisted** scores (one finish, one score event per player, equal to the recomputed score), with the check's own negative controls |
| step 14 and the later return | the original folder's fingerprint unchanged while the target serves; B3 (a new backup of the target, with its receipt), then the switch back with `--prepare`/`--commit` |

**The negatives:**
- **N1:** no receipt for exactly R, so no upload.
- **N2:** `verify` refuses an incomplete or changed copy.
- **N3:** `restore` refuses an occupied target.
- **N4:** a folder neither approved nor pending is refused (78), with recovery onto the original.
- **N5:** the reopen gate refuses a switch still pending, and a revision mismatch.
- **N6:** a pending folder that breaks after its preparation fails to start. **An ordinary start with the original environment recovers it,** with the record unchanged since `--prepare`. Then `--abort`.
- **N7:** the prior folder is refused after the commit.

**The guard self-test covers:**
- an existing single-configuration record;
- the `--prepare` refusals;
- one pending folder only;
- the approved folder starting while a switch is pending;
- unrelated folders and mismatched origin, proxy or code;
- the pending start, and a restart before commit;
- abort, and commit;
- the prior folder after a commit, and the aborted folder after an abort;
- a failed pending start undone by an ordinary restart;
- interrupted record changes (a leftover partial file, a change killed while it waited, a lock holder killed, a lock held too long);
- ten unusable records.

**What it does not prove:**
- SSH or `scp`, the cloud storage or the owner's keys;
- Render's redeploy, failed-deploy behaviour, health checks, maintenance mode or timing (see the hosted validation above);
- the Render disk snapshot;
- real devices.

## Pending
- **The guard repair's review** (ChatGPT), then the hosted validation window above.
- **The real W6:** an owner-approved window, the operator, and the owner's receipts and keys.
- **The Render snapshot restore,** on a throwaway target.
