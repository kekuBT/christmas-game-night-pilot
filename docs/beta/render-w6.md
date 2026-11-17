# W6 on Render: restoring a received backup (Beta R4, handoff 6938602366)

**Status: prepared. The real W6 is PENDING.** Nothing here has run on Render, over SSH, against the owner's storage or keys, or as a Render disk snapshot.
- **The local rehearsal** (below) proves the restore and cutover mechanics on this machine, with the pinned image and the reviewed scripts unchanged. The transport, the storage and the ingress are **explicitly labelled local surrogates**.
- **What W6 is:** the proposal's row (`beta-r4-hosting-proposal.md`): "Restore of the received copy: upload, `verify`, into a new folder, then `check`, authorize, switch, redeploy. Separately, a Render snapshot restore on throwaway data." The pass condition is "the rooms and books back; the old folder kept".
- **Who runs it:**
  - **the operator,** who owns the Render account, inside an owner-approved window;
  - **the owner,** who holds the private `age` identity and the receiving device.

  Claude doesn't operate the account, the storage or the keys.

## Two backups, both received off Render, before any switch
| | What | Why |
|---|---|---|
| **R, the restore source** | the backup to bring back: its `BACKUP_OK` line, and its `RECEIPT_OK` on the **fetched-back** copy (W5's procedure, `render-w5.md`) | only a verified decrypted copy is ever uploaded |
| **C, the current data** | **a fresh backup of the CURRENT data folder, in THIS window:** `BACKUP_OK`, then its `RECEIPT_OK` (W5's procedure, use A) | the switch replaces what is being served. **No live switch without C's `RECEIPT_OK` from this same window.** |

The receiving identity stays on the receiving device. The plaintext copy is uploaded only after its `RECEIPT_OK`, and only to a new folder.

## Before the window (all required)
1. **The owner opened a W6 window** and named the operator. W1–W5 have passed. **Maintenance mode is ON** for the whole procedure (a public 503 means nothing; use the private probe from `render-w5.md`).
2. **R's receipt exists:** its `RECEIPT_OK … sha256=<H_R>` line, and the decrypted copy `<RECEIVE-WORK>/<STAMP_R>` on the receiving device.
3. **The names, written in the window note:**
   - the current folder `<CURRENT>` (the fallback, e.g. `/var/data/cgn`);
   - a **new** target folder `<TARGET>` (e.g. `/var/data/cgn-restored-<STAMP_R>`);
   - a **new** staging folder `<STAGING>` (e.g. `/var/data/restore-<STAMP_R>`).

   None of the three may exist yet, except `<CURRENT>`.
4. **Disk capacity:** `df -h /var/data` has room for the staging copy plus the restored folder.

## The procedure
| Step | Where | Do | Pass | On anything else |
|---|---|---|---|---|
| 0 | SSH | Create the private probe (`render-w5.md`), then `node /tmp/cgn-probe.mjs check` | `UP 7097ac2bb062925bb296a129f4771f1e68fd522d` | stop |
| 1 **C** | SSH and the receiving device | W5's procedure for the **current** data (use A): `BACKUP_OK`, then its `RECEIPT_OK` on the fetched-back copy | both lines, for the same backup, in the window note | **stop: no switch.** The service keeps running on `<CURRENT>`. |
| 2 **Upload R** | the receiving device | `ssh <SSH> test ! -e <STAGING>` must succeed, then `scp -s -r <RECEIVE-WORK>/<STAMP_R> <SSH>:<STAGING>` | the folder is there, owned by the service user | delete only `<STAGING>`, then retry |
| 3 **Verify** | SSH | `cd /app && node dist/server/datatool.js verify --backup <STAGING>` | `verify OK: <n> file(s) match the manifest of <time>` | stop: the copy is incomplete or changed. Nothing is restored. |
| 4 **Restore** | SSH | `cd /app && node dist/server/datatool.js restore --backup <STAGING> --into <TARGET>` | `restore OK: <rooms> room(s), <books> Memory Book(s) restored and verified` | `<TARGET>` occupied, or the copy refused: stop. Never empty a folder to make room. |
| 5 **Check** | SSH | `cd /app && node dist/server/datatool.js check --data <TARGET>` | `check OK: …; owned by this user … A server run by this user can use it.` | stop: no authorization, no switch |
| 6 **Preflight** | the window note | all of: C's `RECEIPT_OK` (this window); steps 3–5 OK; `<TARGET>` ≠ `<CURRENT>`; `<CURRENT>` noted as the fallback; the probe `UP` | all true | stop |
| 7 **Authorize** | SSH (the **running** instance) | `cgn-authorize <TARGET> <PUBLIC-ORIGIN> <HOPS>`, with the access code on standard input (never on the command line or in a log) | `AUTHORIZED data_dir=<TARGET> …` | stop. Nothing has switched yet. |
| 8 **Switch** | dashboard | set `MCHEZO_DATA_DIR=<TARGET>`, then save (it redeploys: stop the old instance, then start the new) | the deploy log shows `cgn-entrypoint: the environment matches the authorized configuration`, and the server starts | **see finding F-W6-01 below** |
| 9 **Private health** | SSH (the new instance) | `node /tmp/cgn-probe.mjs check` (create the probe again; `/tmp` is per instance) | `UP` on the pinned revision | maintenance stays on; investigate |
| 10 **Reopen** | dashboard | maintenance OFF, only after step 9 | — | — |
| 11 **Acceptance** (the play window) | phones and TV | the known room opens on the original seats with no rejoin; the expected answers and scores; the Memory Book's approved entries | "the rooms and books back" | maintenance on, then the fallback |
| 12 **Keep the fallback** | — | `<CURRENT>` stays untouched on the disk | "the old folder kept" | — |

**The fallback to `<CURRENT>`, while the new instance runs:**
1. maintenance on;
2. `cgn-authorize <CURRENT> …` over SSH;
3. set `MCHEZO_DATA_DIR=<CURRENT>` and save;
4. the private probe;
5. reopen.

The data `<CURRENT>` held at the switch comes back, as it was. Anything written on `<TARGET>` after the switch isn't carried back. If it matters, back it up (W5's procedure) before the fallback.

## Finding F-W6-01: no supported recovery on Render if the switched start fails (OPEN)
**After step 7, the authorization record names `<TARGET>`.** If the new instance then can't serve `<TARGET>` (a permission or disk fault after step 5's check, for example), the server exits. Render deploys a disk-backed service stop-before-start, so the old instance is already stopped.
- **Every way back to `<CURRENT>` is then refused by the guard** (exit 78: the record names `<TARGET>`). That covers whatever Render does next: retrying the new deploy, bringing back the previous one, or a revert of `MCHEZO_DATA_DIR` to `<CURRENT>`. This is exactly as designed for one-click rollbacks. (What Render does after a failed stop-before-start deploy isn't verified here.)
- **Re-authorizing `<CURRENT>`** needs `cgn-authorize` on a **running** instance over SSH. A failing or refusing instance offers no SSH, and Render has no one-off job with the disk.

**The local rehearsal reproduces this** (case N6):
1. a second target is restored and passes `check`;
2. a local fault makes it unwritable (`chmod 0500` as root);
3. it is authorized from the live instance;
4. after a graceful stop, its start fails (exit 2, `EACCES`);
5. the original is then refused (exit 78);
6. the original folder's fingerprint is unchanged.

Locally, recovery needed a **one-off container** (`docker run --entrypoint cgn-authorize` on the volume) that re-authorized the original. **That has no Render equivalent.**

**Until the owner decides:**
- **Don't authorize** before steps 3–5 have all passed on this window's disk.
- **If step 8 fails:** keep maintenance on, change nothing else, and escalate.
- **The candidate recoveries** (each needs a decision, and none is done here):
  - (a) a Render disk snapshot restore from before step 7, on the conditions below (it overwrites the whole disk, the record included);
  - (b) a temporary Render **Docker Command** that keeps an instance up without the server (the image's command is `cgn-entrypoint`, and the setting replaces it), so SSH can re-authorize `<CURRENT>`; then the setting is cleared again. It deliberately bypasses the guard for that instance, and how Render treats an instance with no `/health` is **unverified**;
  - (c) a change to `cgn-entrypoint`, such as staying up without a server after a refusal, so SSH can re-authorize;
  - (d) a record that can name a pre-approved fallback folder for one switch.

  Option (b) departs from the reviewed configuration (the Docker Command stays empty). Options (c) and (d) change reviewed components. Each would need its own review and rehearsal.

## The Render disk snapshot: separate, and PENDING
- **What it does:** Render's disk snapshots are daily, kept 7 days. Restoring one **overwrites the whole disk** with its state at that time: every folder, the backups, the plaintext copies **and the authorization record**. Anything written after the snapshot is lost. ([Render: persistent disks](https://render.com/docs/disks); check the current page on the day.)
- **So it may run only:**
  - on a **throwaway target** (a validation service and disk holding no family data);
  - in an **explicit owner-approved window**;
  - after **C's `RECEIPT_OK`**: an off-provider copy of the disk's current data, which is then the only fallback, since the disk's own folders are overwritten.
- **What to record:** which snapshot (its time); what was lost after it; `/health`; the authorization record's folder; the probe; then the acceptance checks.
- **The platform action is PENDING.** Nothing here rehearses it. The local rehearsal covers only folder restore and recovery.

## Failure outcomes
In every case: `<CURRENT>` is never written by these steps; nothing is overwritten; the next step doesn't run.

| Step | Symptom | What it means | Safe action |
|---|---|---|---|
| 1 | no `RECEIPT_OK` for C | the current data has no independent copy from this window | no switch; the service stays on `<CURRENT>` |
| 2 | `<STAGING>` exists | an earlier attempt | choose a new staging name; never reuse it |
| 3 | `verify` refuses | the upload is incomplete or changed | delete `<STAGING>`; upload again from the receipted copy |
| 4 | `restore` refuses | `<TARGET>` occupied, or the copy refused | a new `<TARGET>` name, or stop |
| 5 | `check` refuses | ownership, privacy, lock or write problem | stop; no authorization |
| 8 | `REFUSED` (exit 78) | the environment and the record disagree | don't force it; see F-W6-01 |
| 8 | the server exits on `<TARGET>` | F-W6-01 | maintenance on; escalate; no ad-hoc changes |
| 9 | the probe isn't `UP` on the pin | not the intended service | maintenance stays on |

## The local rehearsal (preparation only)
`scripts/beta/w6-rehearsal.sh <image tag> [work dir]`, run by `scripts/beta/w6-selftest.sh <image tag>`. The evidence is in `docs/evidence/beta-r4-w6/`.

| Real step | In the rehearsal |
|---|---|
| the instance and its disk | the pinned image (`cgn-backup`, `cgn-entrypoint` and `cgn-authorize` checked byte-identical to the reviewed files) on a run-owned Docker volume |
| maintenance and reopening | **LOCAL SURROGATE:** the Render-like proxy, with `--maintenance` until the reopen gate (the private probe `UP` on the pin) |
| R and C | **B1** (seeded state, approved entry, answers with private values) and **B2** (after a later answer), both through W5's chain: transport and storage **LOCAL SURROGATES**; `cgn-receive` unchanged on the fetched copy |
| `scp -s` of the verified copy | **LOCAL SURROGATE:** a tar stream into the container as the service user, into a new staging folder |
| steps 3–5 | the reviewed `datatool verify`, `restore --into` (new folder) and `check`, as the service user |
| steps 7–10 | `cgn-authorize` in the live container; a graceful stop (exit 0), removed and confirmed gone; one container on the volume; a new container on the target; the entrypoint's line; the private probe; then the proxy reopens |
| step 11 | over the reopened ingress: the original seats, the approved entry, the exact restored answers, the ledger equal to B1's; a repeated answer refused; a replayed event recorded once |
| step 12 and the fallback | the original folder's fingerprint unchanged while the target serves; then the cutover back, with its later state served |

**The negatives:**
- **N1:** no receipt for exactly R, so no upload.
- **N2:** `verify` refuses an incomplete or changed copy.
- **N3:** `restore` refuses an occupied target.
- **N4:** an unauthorized target is refused (78), with recovery onto the original.
- **N5:** a revision mismatch keeps the ingress in maintenance.
- **N6:** F-W6-01 reproduced.

**What it does not prove:**
- SSH or `scp`, the cloud storage or the owner's keys;
- Render's redeploy, health checks, maintenance mode or timing;
- the Render disk snapshot;
- real devices.

## Pending
- **The real W6:** an owner-approved window, the operator, and the owner's receipts and keys.
- **The Render snapshot restore,** on a throwaway target.
- **The owner's decision on F-W6-01.**
- **Then** ChatGPT's independent review.
