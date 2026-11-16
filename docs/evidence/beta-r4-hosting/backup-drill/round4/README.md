# Round 4: the backup's failure handling and hold ownership, repaired (review 6918277617)

Evidence for [the proposal](../../../../beta/beta-r4-hosting-proposal.md). Disposable local data only: no Render, no account, no network beyond localhost. The runtime is unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d`; each log's header shows the runtime diff.

> **Correction (review 6918922306; see [round5/](../round5/README.md)).** Two statements below held only for failures the script itself observes:
> - "on any failure, everything this run created is removed";
> - H3's "nothing left".
>
> H3 killed the backup before any copy existed. A run killed outright (`SIGKILL`) can't run its own cleanup, so once its files exist they stay until **reconciliation** (added in round 5). Also, the entrypoint now keeps the hold while a process the dead owner started still runs.

## What the review found, reproduced first
On the scripts as committed at `6aad6d5` ([focused.sh.txt](focused.sh.txt), run against them: [repro-old-run1.log](repro-old-run1.log), [repro-old-run2.log](repro-old-run2.log)):

| | The defect | Reproduced as |
|---|---|---|
| 1 | `tar \| age` under `/bin/sh` checks only the encryptor's status | **X1:** the archiver failed after partial output, the encryptor succeeded, and the script exited 0 with `BACKUP_OK` and an archive. **X3** (a failed hash) also gave `BACKUP_OK`. **X2 and X4** failed, but left a `.part` file and the plaintext copy behind. |
| 2 | The hold was checked and created in two steps, and the exit trap removed it unconditionally | **H2:** the first run's exit removed the second run's hold. A server started inside the second run's hold (5 samples of a live server), and the second run's copy was refused. |
| 3 | No bounded recovery for an abandoned session | **H3** (killed outright) and **H4** (hang-up): the hold stayed, and the server didn't come back (over 11 s, until the hold was removed by hand) |

(Run 2 reran the same cases after one harness change: H2 now measures B's hold up to B's last line when B never releases it. In run 1 that count read 0 because B never printed a release.)

## The repair (the proposed scripts in [../deploy/](../README.md#the-proposed-deploy-side-slice))
- **`cgn-backup`: every step checked, no pipeline.**
  - **The steps, each with its own status checked:** copy, verify, manifest check, checksum list (cross-checked against the manifest's count), the tar written to a file, the tar listed and every file found in it, encryption from that file, hash, publish by rename, removal of the temporary plaintext tar.
  - **`BACKUP_OK` only after all of them.**
  - **On any failure the script observes** (a failed step, `HUP`, `INT`, `TERM`), everything this run created in the backup folder is removed: no archive, no `.part`, no checksum list, no copy. *(A run killed outright is the exception: see the correction above.)*
- **The hold is exclusive and owned:**
  - **Taken atomically:** `mkdir` fails if any hold exists. It records the run's pid and a random token.
  - **Released only by its owner:** the token must match. That holds on every exit path, `HUP`, `INT` and `TERM` included.
  - **The backup's names** (from a per-second stamp) are chosen and checked only while holding. A run that finds them taken stops before claiming them, so it can never remove another run's files.
  - **Consistency still rests on the data lock,** not the hold: `datatool backup` without `--allow-running` refuses while any process holds the lock.
- **Bounded recovery (`cgn-entrypoint`):**
  - **A hold whose owner pid is gone** is released within about a second, and the server starts again. *(Round 5: only once no process the owner started still runs.)*
  - **A hold that never recorded an owner** is stale after 10 s.
  - **An instance restart** clears the hold in any case.
- **Two stages of success:**
  - `BACKUP_OK` means the archive is complete **on the Render disk**.
  - **`RECEIPT_OK`** comes from the new `cgn-receive`, run where the independent copy is received. It means the received archive has the `BACKUP_OK` SHA-256, decrypts with the owner's key, and every file matches the checksum list made on the instance, which covers the manifest's files plus the manifest.
  - **A deploy, a restore or a data-folder change requires `RECEIPT_OK`.**

## The focused negatives ([focused.sh.txt](focused.sh.txt))
Failures are injected by stub commands put first on `PATH` for one backup run: `tar`, `age`, `sha256sum`, `mv`, `timeout` and `date`. The server runs unchanged, in production mode, under the entrypoint.

| Case | Must |
|---|---|
| P0 | A normal backup: `BACKUP_OK`, an archive, the server back |
| X1–X4 | The archiver fails (with partial output) while the encryptor succeeds; the encryptor fails; hashing the archive fails; publishing fails. Each must give `BACKUP_FAILED`, no `BACKUP_OK`, **nothing new left in the backup folder**, the hold released and the server back. |
| H0 | Two backups started at the same instant, 5 times: exactly one `BACKUP_OK` and one refusal by the hold each time |
| H1 | A second backup while the first holds: refused by the hold itself, without releasing the first one's hold |
| H2 | A second backup takes the hold after the first released it but while the first still encrypts. The first ends inside the second's hold; no server may run until the second releases; both `BACKUP_OK`. |
| H5 | A second backup with the same per-second stamp (pinned by the `date` stub), while the first still encrypts: refused, without touching the first one's copy, checksum list or archive |
| H3 | An abandoned session (the backup killed outright while holding): the server back within 10 s, no `BACKUP_OK`, nothing left |
| H4 | An interrupted session (a hang-up to its process group): the same |

## The full drill ([drill.sh.txt](drill.sh.txt))
This is round 3's drill, with three changes:
1. **RC, the receipt:** the archive is copied to a separate folder standing in for the owner's device (in reality, `scp -s` off Render and the private storage). `cgn-receive` must print `RECEIPT_OK`. Then `datatool verify` and the consistency checks run on **the received copy**.
2. **RN1–RN4, the receipt negatives:**
   - a hash that isn't the `BACKUP_OK` one;
   - a damaged archive, given its own hash;
   - another key;
   - a re-encrypted archive with one changed file, given its own hash.

   Each must give `RECEIPT_FAILED`.
3. **R restores the received copy:** upload, `datatool verify` on the instance, restore into a new folder, `check`, re-authorize, then the switch. N4 now also requires that nothing new is left in the backup folder.

The helpers it uses are round 3's, unchanged: [play](../play.mjs.txt), [monitor](../monitor.mjs.txt), [check](../check.mjs.txt), [mutate](../mutate.mjs.txt), [lock-holder](../lock-holder.mjs.txt).

## Every run, in order
| Run | Scripts | Verdict | Log |
|---|---|---|---|
| Repro 1 | As committed at `6aad6d5` | **FAILED, as expected:** 2 passed, 7 failed (X1–X4, H2–H4) | [repro-old-run1.log](repro-old-run1.log) |
| Repro 2 | The same, after the H2 measurement change | **FAILED, as expected:** the same 7; H2 shows 5 samples of a live server inside B's hold | [repro-old-run2.log](repro-old-run2.log) |
| Focused 1 | The repair, first version | PASSED, 9/9. But H1's second run was refused by its preflight ("no running server"), not by the hold, so the hold's atomicity wasn't exercised. | [focused-run1.log](focused-run1.log) |
| Focused 2 | Hold taken before any server check; names chosen and checked only while holding (found while adding H0; covered by H5); H0 and H5 added; H1 must be refused by the hold | PASSED, 11/11 | [focused-run2.log](focused-run2.log) |
| Drill 1 | The repaired scripts, the full drill with receipt and restore from the received copy | PASSED, 39/39 | [drill-r4-run1.log](drill-r4-run1.log) |
| **Final, focused** | **The committed files, on a clean tree** | see the log | [focused-final.log](focused-final.log) |
| **Final, drill** | **The committed files, on a clean tree** | see the log | [drill-final.log](drill-final.log) |

**One edit to the logs:** in the focused and reproduction logs, the header line naming the scripts' folder had my local scratch path; it is replaced with `<scratch>`. Nothing else was changed.

## To reproduce
Build the server (`npm run build`). In a new folder, assemble, dropping `.txt` from each name:
- `deploy/cgn-*.sh` from [../deploy/](../README.md#the-proposed-deploy-side-slice);
- `drill.sh` and `focused.sh` from this folder;
- `play.mjs`, `monitor.mjs`, `check.mjs`, `mutate.mjs` and `lock-holder.mjs` from [../](../README.md).

Then:
```
bash focused.sh <repo root> <that folder>
bash drill.sh   <repo root> <that folder>
```
They need `age`, `curl`, `setsid`, GNU coreutils and Node 22.

## What this does not prove
- **Render itself:** the entrypoint as the container's first process, the SSH session's user and environment, maintenance mode, health-check timing, and what a dropped SSH session sends. H3 and H4 stand in for that last one locally.
- **The real off-Render path:** `scp -s`, the owner's storage, and the owner's device. Here a local folder stands in, and the owner's key is generated per run.
- These are W4–W7 in the proposal.
