# W5 on Render: backup and independent receipt (Beta R4, handoff 6937786587)

**Status: prepared. The real W5 is PENDING.** Nothing here has run on Render, over SSH, or against the owner's storage or keys.
- **The local rehearsal below** proves the chain's mechanics on this machine, with the pinned image and the reviewed scripts unchanged. The transport and the storage are **explicitly labelled local surrogates**. **It does not prove SSH, `scp`, a cloud upload or download, Render's maintenance mode, Render's timing, or the owner's keys.**
- **What W5 is:** the proposal's row (`beta-r4-hosting-proposal.md`): "`cgn-backup` during a validation night, then `scp -s` off Render to the owner's storage, fetch it back, then `cgn-receive`". The pass condition is "`BACKUP_OK`, then `RECEIPT_OK` on the owner's device".
- **Who runs it:**
  - **the operator,** who owns the Render account and its operations, inside an owner-approved window;
  - **the owner,** who holds the private `age` identity and the private storage, on the receiving device.

  Claude doesn't operate the account, the storage or the keys.

## Three facts, never merged
Each is a different claim, made at a different place, and only the last permits anything.

| # | The fact | Where | Shown by | What it does NOT show |
|---|---|---|---|---|
| 1 | **Source success:** the encrypted archive is complete on the Render disk | the instance, in the operator's SSH session | `BACKUP_OK <archive> sha256=<H> files=<n> server_stopped_s=<s>` | that any copy exists off Render; that anyone can decrypt it |
| 2 | **Independently received encrypted bytes:** a copy off Render, then in the owner's storage, then fetched back | the receiving device and the owner's storage | the fetched-back file, checked against `<H>` by step 5 | that it decrypts, or that its contents are whole |
| 3 | **A verified decrypted copy** | the receiving device | `RECEIPT_OK <archive> sha256=<H> files=<n> copy=<folder>` from `cgn-receive`, run on the **fetched-back** file | anything about a later backup |

**`BACKUP_OK` alone is never enough** for a deploy, a restore, a rollback or a data-folder change: each needs fact 3 for a backup from the same window. W6 (restore, data-folder switching) is a separate step and is not part of W5.

## Before the window (all required)
1. **The owner opened a window,** and named the operator. W1–W4 have passed on this service, or the owner has explicitly ordered W5 differently.
2. **Maintenance mode** is on outside the window and between sessions. The backup runs **between sessions**: no game in play.
3. **The recipient key:** the service's `CGN_BACKUP_RECIPIENT` is the owner's **public** key, `<OWNER-AGE-RECIPIENT>` (`age1…`). It isn't a secret. The matching **private** identity, `<OWNER-IDENTITY-FILE>`, stays with the owner. **It is never on Render, never in GitHub, never in a chat, never in a log.**
4. **The storage:** the owner's **already-selected** private off-provider storage, `<OWNER-STORAGE>`. This runbook doesn't choose it, and nobody reselects it here.
5. **The receiving device** has `age` (v1.2.x), `sha256sum`, `tar`, `find`, `grep` and `sh`, a copy of `deploy/render/operator/cgn-receive.sh` from the reviewed revision, and room for both the archive and its decrypted copy.
6. **Disk capacity on Render:** check that `/var/data` has room for one more plaintext copy and its archive (`df -h /var/data` over SSH). Each archive is a few KB per room.
7. **Retention** follows the proposal's row:
   - **off Render:** every pre-deploy and pre-restore backup for 90 days, plus the last 8 game-night backups;
   - **on the disk:** the last 3 plaintext copies, deleted only after their archive is confirmed off Render, meaning a `RECEIPT_OK` exists.

   `cgn-backup` keeps the plaintext copy `/var/data/backups/<STAMP>/` and its checksum list next to the archive. Those are as private as the data itself.
8. **The window record:** a private note, kept by the operator. Never put a secret in it. It holds:
   - the start and end times;
   - the `/health` revision before and after;
   - the data folder's path;
   - the `BACKUP_OK` line, verbatim, with its hash `<H>`;
   - the times the site was unavailable;
   - each later step's outcome, and the `RECEIPT_OK` line.

## The journey (one window, one operator, one backup)
| Step | Where | Do | Pass | On anything else |
|---|---|---|---|---|
| 0 | browser, SSH | Confirm maintenance mode, then read `/health` (`"revision":"7097ac2bb062925bb296a129f4771f1e68fd522d"`). Note the time. | the pinned revision | stop: nothing has changed yet |
| 1 **Source** | the instance, over SSH (`ssh <SERVICE-SSH-ADDRESS>`) | `cgn-backup` | the session shows `cgn-backup: stopping the server (pid …)`, `server stopped`, `hold released`, then **exactly one `BACKUP_OK` line**. Copy that line into the window record: **`<H>` is its `sha256=` value, and only that.** | `BACKUP_FAILED: …` or no `BACKUP_OK`: **stop.** Nothing downstream. See the failure table. |
| 1b | browser | `/health` answers again with the pinned revision, and a seat still opens its room without rejoining. Note how long the site was unavailable. | the original service is back by itself (the entrypoint restarts the server when the hold is released) | if it doesn't come back: follow W4's recovery; no further W5 step |
| 2 **Transport** | the receiving device | `scp -s <SERVICE-SSH-ADDRESS>:/var/data/backups/cgn-<STAMP>.tar.age <RECEIVING-FOLDER>/` into a **new, empty** folder for this window | the file is there and non-empty | no file, or a partial one: delete only that partial file, then retry the transfer. The archive is still on the Render disk. |
| 3 **Upload** | the receiving device | upload `cgn-<STAMP>.tar.age` to `<OWNER-STORAGE>`, private (never a public link), under a name that includes `<STAMP>`; never next to the identity file | the storage lists it with its full size | retry. Never overwrite an older archive of the same name. |
| 4 **Fetch back** | the receiving device | download it from `<OWNER-STORAGE>` into a **separate new** folder, `<FETCHED-FOLDER>` (not the transport folder) | the file is there | missing or partial: fetch again. If the stored copy itself is bad, upload again from step 2's copy, then fetch again. |
| 5 **Receipt** | the receiving device | `sh cgn-receive.sh <FETCHED-FOLDER>/cgn-<STAMP>.tar.age <H> <OWNER-IDENTITY-FILE> <EMPTY-WORK-FOLDER>`, with `<H>` **typed or pasted from the window record**, never computed from any downloaded file | **`RECEIPT_OK … sha256=<H> … copy=…`**, exit 0. Record the line. | `RECEIPT_FAILED: …` (exit 1): the copy may not be relied on. See the failure table. |
| 6 | the receiving device | Keep `<EMPTY-WORK-FOLDER>/<STAMP>` (the decrypted copy) private, or delete it once fact 3 is recorded, as the owner decides | — | — |
| 7 | browser | Maintenance mode per the window's plan; note the end time | — | — |

**Why the expected hash comes only from the `BACKUP_OK` line:** the checksum list travels inside the archive, and anyone holding the public key can make an archive that agrees with itself. The only independent anchor is the hash the instance printed in the operator's own SSH session. A hash recalculated from a downloaded file proves nothing about that file.

**Why fetch back:** the receipt must check what the storage really holds, not the copy that was uploaded from.

## Failure outcomes: what each means, and the safe action
In every case: no deploy, no restore, no rollback and no data-folder change rely on this backup. Nothing is overwritten. The next stage doesn't run.

| Stage | Symptom | What it means | Safe action |
|---|---|---|---|
| 1 | `BACKUP_FAILED: another backup holds the server` | a hold exists | wait for the other run; never delete `/tmp/cgn/hold` by hand |
| 1 | `BACKUP_FAILED: the server did not stop within 10 s` | nothing was copied, and the hold was released | the pending `SIGTERM` stops the server; the platform restarts the instance. Check `/health`, then retry later. |
| 1 | `BACKUP_FAILED: datatool backup failed or timed out`, or `… verify failed` | no archive was published, and the run's files were removed | `/health` should be back; retry once; if it fails again, stop and report |
| 1 | the session dropped before `BACKUP_OK` | unknown | `cgn-backup reconcile` (removes only an abandoned run's own files), then a fresh `cgn-backup` |
| 2–4 | a missing or partial file | the transfer, upload or download didn't complete | repeat that stage only, into a new file name or folder; the Render archive is still the source |
| 5 | `the archive's SHA-256 is …, not the expected <H>` | the fetched file isn't the published archive: changed, truncated, the wrong file, or a mistyped `<H>` | check `<H>` against the window record; fetch again; if the stored copy is bad, upload again from step 2's copy |
| 5 | `decryption failed (wrong key, or a damaged archive)` | not the owner's identity for this recipient, or damage | check that `<OWNER-IDENTITY-FILE>` matches `<OWNER-AGE-RECIPIENT>`; never try other people's keys |
| 5 | `a file doesn't match its checksum`, or the counts differ | the decrypted contents aren't the copy made on the instance | not usable; fetch again, or take a new backup in a later window |
| 5 | `the work folder … is not empty` | a fresh, empty folder was not used | use a new empty folder; never clear an existing folder to make room |

The archive stays on the Render disk until its `RECEIPT_OK` exists. Nothing in W5 deletes it.

## The local rehearsal (preparation only)
`scripts/beta/w5-rehearsal.sh <image tag> [work dir]`, run by `scripts/beta/w5-selftest.sh <image tag>`. The evidence is in `docs/evidence/beta-r4-w5/`.

| Real step | In the rehearsal |
|---|---|
| the Render instance and its disk | the pinned image `cgn-render:check` (runtime `7097ac2`, `cgn-backup` and `cgn-entrypoint` checked byte-identical to the reviewed files) on a run-owned Docker volume, in production mode with a throwaway access code |
| the owner's keys | two **disposable** `age` identities made per run (the receiving one and a wrong one) in a private mode-700 folder, removed on exit |
| validation data | a synthetic room: a finished Trivia game; an **approved** Memory Book entry "W5 seed" linked to it; three acknowledged answers in a second game |
| the SSH session and `cgn-backup` | `docker exec … env -i … cgn-backup` (no service environment, as over SSH); the expected hash is parsed from that session's `BACKUP_OK` line |
| `scp -s` | **LOCAL SURROGATE:** `docker cp` out of the run's container into a "surrogate-device" folder |
| the owner's storage | **LOCAL SURROGATE:** a copy into a "surrogate-storage" folder |
| fetch back | a copy from the surrogate storage into a separate "fetched" folder |
| `cgn-receive` | the reviewed `deploy/render/operator/cgn-receive.sh`, unchanged, on the **fetched** file only |

**What it checks:**
- the writer is excluded (`/health` refused while stopped; a new server pid after);
- the original service resumes on its own (same seats, the approved entry, a new acknowledged answer);
- no second container ever mounts the data;
- the received copy holds the pre-backup state, and not the answer made after the backup;
- the checker fails on three damaged copies;
- eight negatives, each stopping at the right stage with nothing promoted and nothing overwritten;
- the source archive is unchanged;
- cleanup is verified, with an unlistable inventory failing the run.

**What it does not prove:**
- SSH or `scp`, a cloud upload or download, the owner's identity or storage;
- Render's maintenance mode, health checks, timing or disk;
- scale, or real devices.

## Pending (the real W5)
- **The real run:** in an owner-approved window, by the operator, with the owner's recipient, storage and identity.
- **Its record:** the `BACKUP_OK` line, the measured unavailability, the outcomes of steps 2–4, and the `RECEIPT_OK` line.
- **Then** ChatGPT's independent review. W1–W8 and the physical-device results stay pending until each is actually run.
