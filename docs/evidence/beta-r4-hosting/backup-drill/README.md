# Beta R4: the stopped-writer backup and the rollback guard, drilled locally (reviews 6917441687, 6918277617)

**Round 5 (review 6918922306)** added the reconciliation of runs killed after their files exist, and corrected round 4's "every failure leaves nothing": see [round5/](round5/README.md).

**Round 4 (review 6918277617)** repaired the backup's failure handling and the hold's ownership, and added the off-Render receipt (`cgn-receive`). See [round4/](round4/README.md): the reproduction on the scripts as committed at `6aad6d5`, the focused negatives, the full drill and every run. **The scripts in [deploy/](deploy/) are now the round-5 versions.** Round 4's are at commit `37ff3e8`; round 3's at `6aad6d5`. The rest of this page is round 3, kept as it ran.

Evidence for [the proposal](../../../beta/beta-r4-hosting-proposal.md).
- **Where it ran:** this session's machine, on disposable data, against the **unchanged** server in production mode. No Render, no account, no network beyond localhost. The runtime is unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d`; each log's header shows the runtime diff.
- **What the review asked:** a backup that enforces quiescence, rather than inferring it from two matching copies; its failure rules; and the smallest implementation slice, if the existing tools aren't enough.

## Why the existing tools weren't enough on Render
`datatool backup` without `--allow-running` already enforces the rule: it holds the data lock, refuses while a server runs, and blocks a server start until it ends.

**The gap is on Render.** The disk is reachable only from the running instance: not from builds, pre-deploy commands or one-off jobs. And if the server is the container's only process, stopping it ends the container, and with it SSH and the disk. So the smallest slice is a container entrypoint that keeps the instance up while the server is stopped on purpose. It is deploy-side shell, not a runtime change.

## The proposed deploy-side slice
Proposed files, not deployed anywhere. Three are for the image; `cgn-receive` runs where the off-Render copy is received. The descriptions are the round-5 versions.

| File | What it does |
|---|---|
| [cgn-entrypoint.sh.txt](deploy/cgn-entrypoint.sh.txt) | The container's command. It runs the server, passes `SIGTERM` on, and holds the server stopped while a backup runs. A hold whose owner is gone is released within about a second (round 4), and only once no process that owner started still runs (round 5). A server exit with no hold ends the container, so the platform restarts it. **The rollback guard:** before starting, the environment must match the authorized record, or it exits 78. |
| [cgn-backup.sh.txt](deploy/cgn-backup.sh.txt) | **The steps:** preflight; take the hold atomically (`mkdir`, owner pid and token); `SIGTERM`; wait up to 10 s; `datatool backup` under the lock (no `--allow-running`; 30 s limit); `verify`; check `serverWasRunning: false`; release (owner only); a checksum list; tar to a file and list it; encrypt with `age`; hash; publish by rename. **Every step's status is checked, with no pipeline.** `BACKUP_OK` means the archive is complete on the disk. On any failure it observes, everything this run made is removed. Round 5: it records its paths and token before creating anything, and reconciles abandoned runs first (`cgn-backup reconcile` alone). It reads the data folder and the key from the running server when an SSH session lacks them. |
| [cgn-authorize.sh.txt](deploy/cgn-authorize.sh.txt) | Records the approved data folder, origin, proxy count and a salted hash of the access code (read from standard input, never printed or stored) on the disk, mode 600. |
| [cgn-receive.sh.txt](deploy/cgn-receive.sh.txt) | Round 4. Run where the independent copy is received, with standard tools only. `RECEIPT_OK` only if the archive has the `BACKUP_OK` hash, decrypts with the owner's key, and every file matches the checksum list, which covers the whole copy. A deploy, a restore or a data-folder change requires it. |

## The drill
[drill.sh.txt](drill.sh.txt) runs every case in order and ends with one verdict. Its helpers:
- [play.mjs.txt](play.mjs.txt): the live load;
- [monitor.mjs.txt](monitor.mjs.txt): watches the stop from outside;
- [check.mjs.txt](check.mjs.txt): the consistency checks;
- [mutate.mjs.txt](mutate.mjs.txt): the checker's own negatives;
- [lock-holder.mjs.txt](lock-holder.mjs.txt): holds the lock as a backup does.

**The setup:**
- `NODE_ENV=production`, with an access code (generated per run, never printed), a public origin, and a data folder under a throwaway `var/data`.
- An `age` key pair generated per run stands in for the owner's.

| Case | What happens | Must |
|---|---|---|
| E1 | The entrypoint starts the server, with no data and no record | `/health` 200; the API refuses a request with no cookie (401); the log says "first install" |
| A1 | `cgn-authorize` records the configuration | Mode 600; the access code itself isn't in the file |
| N1 | `datatool backup` with no `--allow-running`, while the server runs | Refused; nothing written |
| N3 | `cgn-backup` with a bad recipient key | `BACKUP_FAILED` before any stop; the same server pid still serving |
| **P1** | **`cgn-backup` during live play:** 2 rooms × (host + 4 players + TV). A warm-up Trivia game is finished first; then a second Trivia game is played, each player answering about once a second, while each host saves a Memory Book note about every 1.2 s. The backup runs without the service's environment, as from an SSH session. | `BACKUP_OK`; the archive's hash matches; no plaintext in it; another key can't open it; the owner's key can; `datatool verify` passes on the owner's copy. Then the checks below. |
| P1 checks | [check.mjs.txt](check.mjs.txt), against what the monitor saw at the stop | `serverWasRunning: false`. Every copied file matches its manifest entry, and the copy holds nothing else. The copy's files equal the data folder as it was once the server had stopped. Every answer and note acknowledged before the stop is in the copy; none first sent after the restart is; none acknowledged while it was stopped. Every answer and note saved by the end. Every socket reconnected. Down under 10 s. |
| C-* | The checker's own negatives, each on a damaged copy: an acknowledged answer removed; a later answer added; one byte added | The checker fails each time |
| N4 | `cgn-backup` whose copy times out after the stop | `BACKUP_FAILED`; no archive; the hold released; the server back; any partial copy fails `verify` |
| R | Restore the owner's copy into a **new** folder: `check`, every file compared, re-authorize, then stop the entrypoint with `SIGTERM` and start it on the new folder | Every step passes; each room and its host's saved session come back |
| G1–G4 | The rollback guard: start with the previous data folder; an older access code; another proxy count; data present with the record removed | Each exits 78, and the server never starts |
| N2 | Start a server while a process holds the lock as a backup does | The server refuses |
| N5 | `cgn-backup` with the server frozen (`SIGSTOP`), so it can't stop | `BACKUP_FAILED` after 10 s and the hold released. Then the pending `SIGTERM` stops the server, and the entrypoint exits for the platform to restart the instance. |

## Every run, in order
Runs 1–7 ran from my scratch copy of the scripts as they stood at each run (uncommitted). Only the final run binds to the committed files.

| Run | What changed before it | Verdict | Log |
|---|---|---|---|
| 1 | First version (answers only) | PASSED, 26/26; the copy held **no Memory Book**, so the room-and-book case wasn't exercised | [drill-run1.log](drill-run1.log) |
| 2 | Host notes added, but a note must cite a finished game, so every save was refused and retried | **FAILED: timed out** (exit 124) under my 300 s limit; the log is partial | [drill-run2.log](drill-run2.log) |
| 3 | A warm-up game finished first; the notes cite it | PASSED, 26/26; 2 rooms and 2 Memory Books in the copy | [drill-run3.log](drill-run3.log) |
| 4 | The rollback guard and `cgn-authorize`, with cases A1 and G1–G4 | PASSED, 33/33 | [drill-run4.log](drill-run4.log) |
| 5 | The checker's own negatives (C-*) | **FAILED, 35/36:** C-flip-byte wasn't caught. The checker compared the manifest with the folder at the stop, but never hashed the copied files themselves. | [drill-run5.log](drill-run5.log) |
| 6 | The checker now hashes every copied file and refuses extra ones | PASSED, 36/36 | [drill-run6.log](drill-run6.log) |
| 7 | `cgn-backup` reads the data folder and key from the running server when they're missing; P1 runs without them | PASSED, 36/36 | [drill-run7.log](drill-run7.log) |
| **Final** | **The committed files, unchanged, on a clean tree** | see the log | [drill-final.log](drill-final.log) |

## To reproduce
Build the server (`npm run build`). Copy this folder, dropping `.txt` from each name, so that `deploy/cgn-*.sh` sit next to the scripts. Then run:
```
bash drill.sh <repo root> <that folder>
```
It needs `age`, `curl`, GNU `timeout` and Node 22.

## What this drill does not prove
- **Render itself:** the entrypoint as the container's first process, SSH sessions on Render (their user and environment), maintenance mode, Render's health-check timing, the disk's ownership, and the snapshot restore. These are W4–W7 in the proposal.
- **Scale and real devices:** 2 rooms of 5 players over localhost. Family-scale load, drawing strokes and real phones are W2, W3 and W8.
- **Timing:** about 1 s down was measured on this machine. On Render, it is measured in W5.
