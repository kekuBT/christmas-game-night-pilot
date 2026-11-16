# Round 5: runs killed after their files exist, and reconciliation (review 6918922306)

Evidence for [the proposal](../../../../beta/beta-r4-hosting-proposal.md). Disposable local data only: no Render, no account, no network beyond localhost. The runtime is unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d`.

## What the review found, reproduced first
On the scripts as committed at `37ff3e8`, with two deterministic checkpoints ([repro-37ff-run1.log](repro-37ff-run1.log)):
- **K1, during the copy:** a stub copy has written a room file and a manifest into the run's copy folder, then waits.
- **K2, during encryption:** the temporary plaintext tar, the file lists, the checksum list, the copy and a partial encrypted archive all exist, and a stub encryptor waits.

The backup is killed outright at each checkpoint: the shell alone (a), or its whole process group (b).

**Expected, and seen:**
- no `BACKUP_OK`;
- **the killed run's files survived** (the copy folder with its room file and manifest; in K2 also the plaintext tar, the lists and the `.part`);
- there was no reconciliation to remove them: the old script ignores the `reconcile` argument and just took another backup.
- **K3** failed too: there was nothing that could report a healthy run as still running.

An `EXIT` trap can't run after `SIGKILL`, so round 4's "every failure leaves nothing" held only for failures the script observes. Round 4's H3 had killed the run before any copy existed.

## The repair (the proposed scripts in [../deploy/](../README.md#the-proposed-deploy-side-slice))
- **A run record, before any file.** Each run writes `.cgn-run-<stamp>` in the backup folder: a temporary file renamed into place, so it is never half-written in place. It holds the run's token, its pid, and the exact paths it may create.
  - **Removed by the run's own cleanup** on any failure it observes.
  - **On success, removed just before `BACKUP_OK`.** So a record never describes a backup that reported success.
- **The run's token on every process.** `cgn-backup` exports `CGN_BACKUP_RUN=<token>`, so the copy (under `timeout`, in its own process group) and the encryptor still identify the run after its shell is killed.
- **Reconciliation, under the hold:**
  - **When:** automatically at the start of every backup, before the new run names anything. Or alone, as `cgn-backup reconcile`, which prints `RECONCILED removed=N kept=M`.
  - **Abandoned:** a record whose pid is gone, and whose token no live process carries. Exactly the paths it lists are removed (all inside the backup folder; never `..`), then the record.
  - **Still running:** a record whose run has a live process is left untouched and reported.
  - **Never touched:** a path no record lists, such as every successful or retained backup.
  - **A half-written temporary record** (a kill between writing and renaming it) is removed alone; its run had created nothing else.
- **The hold after a kill (`cgn-entrypoint`).** A hold whose owner is gone is released only once no process carries the owner's token.
  - So the server never restarts under a copy that is still running.
  - That stays bounded by the copy's own time limit (30 s by default; 8 s in K1), after which the hold is released within about a second.
- **Not automatic cleanup-on-kill.** The proposal and round 4's README now say so: a killed run's files remain until the next backup or `cgn-backup reconcile`. Every promotion (a deploy, a restore, a data-folder change) requires a fresh backup's `BACKUP_OK` and `RECEIPT_OK`, and every backup reconciles first. So no promotion happens before reconciliation.

## The cases added ([focused.sh.txt](focused.sh.txt); everything from round 4 is kept)
| Case | Must |
|---|---|
| K1a, K1b | Killed at the copy checkpoint (the shell / the group). No `BACKUP_OK`. Reconciliation is refused (the hold is still kept) while the copy runs, and the files stay. The server is back within the copy limit + 6 s. A later reconciliation removes exactly that run's files. The neighbouring successful backup (P0's copy, checksum list and archive) is byte-for-byte intact. |
| K2a | Killed at the encryption checkpoint, the shell alone: the encryptor lives on. The first reconciliation reports the run **still running** and leaves every file. After the encryptor ends, reconciliation removes them all. Neighbour intact. |
| K2b | The same, the whole group: the encryptor dies with it, and the first reconciliation removes the files. Neighbour intact. |
| K3 | Reconciliation while a healthy backup is still encrypting: that run is reported still running, left alone, and still ends `BACKUP_OK` with its archive intact |
| H3 (revised) | Killed during the hold, with its copy step delayed 6 s: the delayed copy runs on, the server comes back once it ends, and reconciliation then leaves nothing |

## Every run, in order
| Run | Scripts | Verdict | Log |
|---|---|---|---|
| Repro 1 | `37ff3e8` | **FAILED, as expected:** P0, X1–X4, H0–H5 passed; K1a, K1b, K2a (both checks), K2b and K3 failed | [repro-37ff-run1.log](repro-37ff-run1.log) |
| Focused 1 | The repair | PASSED, every case. The log is noisy: "Permission denied" from reading `/proc/1/environ`, printed by both the scripts' and my harness's process scans. | [focused-r5-run1.log](focused-r5-run1.log) |
| Focused 2 | The scripts' scans silenced (a redirection error now goes to `/dev/null`) | PASSED, every case. The remaining noise is the harness's own scan only. | [focused-r5-run2.log](focused-r5-run2.log) |
| Drill 1 | The repair; the full backup/receipt/restore drill, unchanged from round 4 ([../round4/drill.sh.txt](../round4/drill.sh.txt)) | PASSED, 39/39 | [drill-r5-run1.log](drill-r5-run1.log) |
| **Final, focused** | **The committed files, clean tree**; the harness's scan silenced too | see the log | [focused-final.log](focused-final.log) |
| **Final, drill** | **The committed files, clean tree** | see the log | [drill-final.log](drill-final.log) |

**One edit to the logs:** my local scratch path is replaced with `<scratch>`; nothing else was changed.

## To reproduce
Assemble a folder, dropping `.txt` from each name:
- `deploy/cgn-*.sh` from [../deploy/](../README.md#the-proposed-deploy-side-slice);
- `focused.sh` from this folder;
- `drill.sh` from [../round4/](../round4/README.md);
- the helpers from [../](../README.md).

Then run `bash focused.sh <repo root> <folder>` and `bash drill.sh <repo root> <folder>`. They need `age`, `curl`, `setsid`, GNU coreutils and Node 22.

## What this does not prove
- **Render itself:** what a dropped SSH session sends there, and whether `/proc/<pid>/environ` is readable for the service user's own processes in Render's container. The latter is assumed (same user) and must be checked in W5.
- **A real copy or encryption interrupted at other points:** the checkpoints are stubs at the two points the review named.
