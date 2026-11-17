# W5 on Render: backup and independent receipt (Beta R4, handoff 6937786587; review 6938403611)

**Status: prepared. The real W5 is PENDING.** Nothing here has run on Render, over SSH, or against the owner's storage or keys.
- **The local rehearsal below** proves the chain's mechanics on this machine, with the pinned image and the reviewed scripts unchanged. The transport and the storage are **explicitly labelled local surrogates**, and so is the maintenance proxy. **It does not prove SSH, `scp`, a cloud upload or download, Render's maintenance mode, Render's timing, or the owner's keys.**
- **What W5 is:** the proposal's row (`beta-r4-hosting-proposal.md`): "`cgn-backup` during a validation night, then `scp -s` off Render to the owner's storage, fetch it back, then `cgn-receive`". The pass condition is "`BACKUP_OK`, then `RECEIPT_OK` on the owner's device".
- **Who runs it:**
  - **the operator,** who owns the Render account and its operations, inside an owner-approved window;
  - **the owner,** who holds the private `age` identity and the private storage, on the receiving device.

  Claude doesn't operate the account, the storage or the keys.

## One procedure, two uses (review 6938403611, item 1)
**The backup-and-receipt procedure** is the journey below: `cgn-backup` → `scp -s` → upload → fetch back → `cgn-receive`. It is used in two different ways, each recorded separately.

| Use | When | Needs first | What it records | What it is NOT |
|---|---|---|---|---|
| **A. A same-window prerequisite** | inside the owner-approved window of any deploy, restart (**W4**), rollback, restore or data-folder change, before that operation | W1–W3 passed (for W4); the owner opened that window | a **procedure-completion record** in that window's note: the `BACKUP_OK` line and its `RECEIPT_OK` line, for the same backup | not W5's acceptance |
| **B. W5's own acceptance** | in an owner-approved W5 window, between sessions | **W1–W3 passed. W4 is NOT required.** | the **W5 acceptance record**: the same two lines, plus the measured unavailability (private watch), each stage's outcome, and the play-window seat check | — |

**So W4 is never blocked on W5:**
- **W4's window** opens with use A. W4's live drill runs only after `BACKUP_OK` and `RECEIPT_OK` for that same backup are both verified.
- **A use-A run** can also serve as W5's acceptance, but only if the owner says so, and only if everything in use B's last column was recorded.
- **The receipt is never waived,** and nobody acts outside an owner-approved window.

## Three facts, never merged
Each is a different claim, made at a different place, and only the last permits anything.

| # | The fact | Where | Shown by | What it does NOT show |
|---|---|---|---|---|
| 1 | **Source success:** the encrypted archive is complete on the Render disk | the instance, in the operator's SSH session | `BACKUP_OK <archive> sha256=<H> files=<n> server_stopped_s=<s>` | that any copy exists off Render; that anyone can decrypt it |
| 2 | **Independently received encrypted bytes:** a copy off Render, then in the owner's storage, then fetched back | the receiving device and the owner's storage | the fetched-back file, checked against `<H>` by step 5 | that it decrypts, or that its contents are whole |
| 3 | **A verified decrypted copy** | the receiving device | `RECEIPT_OK <archive> sha256=<H> files=<n> copy=<folder>` from `cgn-receive`, run on the **fetched-back** file | anything about a later backup |

**`BACKUP_OK` alone is never enough** for a deploy, a restore, a rollback or a data-folder change: each needs fact 3 for a backup from the same window. W6 (restore, data-folder switching) is a separate step and is not part of W5.

## Maintenance mode and the private health probe (review 6938403611, item 2)
- **During the whole procedure, maintenance mode stays ON.** Render's maintenance mode answers every **public** request with **503**, including `/health`, whatever the service is doing; SSH keeps working ([Render: maintenance mode](https://render.com/docs/maintenance-mode)). **A public 503 during maintenance is expected, and it is never evidence that the writer stopped, nor that recovery failed.** The public URL tells the operator nothing during the procedure.
- **Every health reading during the procedure is PRIVATE,** taken inside the instance over SSH. The probe asks the app itself on `127.0.0.1:10000` (the image's `PORT`), behind Render's proxy. It only **reads** `/health`, and uses only Node 22, which is in the image. It writes one file, to `/tmp` in the instance's ephemeral filesystem, not the disk.
- **The interactive seat check** (a seat opens its room without rejoining) needs the public site, so it happens **only with maintenance off, in the already-approved play window**: W4's live drill (use A), or the next approved play session (use B). It is never done while maintenance is on.

**The private health probe.** In the SSH session (`ssh <SERVICE-SSH-ADDRESS>`), paste this once. It creates `/tmp/cgn-probe.mjs`:

```sh
cat > /tmp/cgn-probe.mjs <<'PROBE'
// cgn-probe (W5 runbook): READ-ONLY. It asks the app itself on 127.0.0.1, inside the instance, so the public
// maintenance 503 doesn't apply. It reads /health only. Node 22 (in the image); nothing is installed.
//   node /tmp/cgn-probe.mjs check          one sample: "PROBE <time> UP <revision>" (exit 0); else HTTP <code> or DOWN (exit 1)
//   node /tmp/cgn-probe.mjs watch <secs>   a sample every 100 ms for <secs> s: each change of state, then one WATCH line
const [mode = "check", secs = "60"] = process.argv.slice(2);
const url = `http://127.0.0.1:${process.env.PORT || 10000}/health`;
async function probe() {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
    const m = (await r.text()).match(/"revision":"([0-9a-f]+)"/);
    return r.status === 200 ? `UP ${m ? m[1] : "no-revision"}` : `HTTP ${r.status}`;
  } catch (e) {
    return `DOWN ${e.cause?.code ?? e.name}`;
  }
}
if (mode === "check") {
  const s = await probe();
  console.log(`PROBE ${new Date().toISOString()} ${s}`);
  process.exit(s.startsWith("UP ") ? 0 : 1);
}
const end = Date.now() + Number(secs) * 1000;
let last = "", firstDown = 0, backAt = 0, n = 0;
while (Date.now() < end) {
  const t = Date.now(), s = await probe();
  n++;
  if (s !== last) { console.log(`PROBE ${new Date(t).toISOString()} ${s}`); last = s; }
  if (!s.startsWith("UP ")) { if (!firstDown) firstDown = t; backAt = 0; }
  else if (firstDown && !backAt) backAt = t;
  await new Promise((r) => setTimeout(r, 100));
}
const iso = (t) => new Date(t).toISOString();
console.log(firstDown ? `WATCH down from ${iso(firstDown)}, ${backAt ? `back at ${iso(backAt)} (${backAt - firstDown} ms)` : "NOT back by the end"}; ${n} samples; ${last}` : `WATCH never down; ${n} samples; ${last}`);
process.exit(firstDown && !backAt ? 1 : 0);
PROBE
```

- **A check:** `node /tmp/cgn-probe.mjs check`. Expect `PROBE <time> UP 7097ac2bb062925bb296a129f4771f1e68fd522d`.
- **A watch across the backup,** in the same session: `node /tmp/cgn-probe.mjs watch 60 > /tmp/cgn-watch.txt 2>&1 & cgn-backup; wait; cat /tmp/cgn-watch.txt`. The `WATCH` line gives when the app went down and came back, in ms.

**Reading the states:**

| What the operator sees | What it means | Action |
|---|---|---|
| public URL: 503 "under maintenance", any time maintenance is on | **nothing** about the service; Render answers for it | none; never use it as evidence |
| private: `PROBE … UP 7097ac2…` | **healthy**, on the pinned revision | proceed |
| private: `DOWN …` between `cgn-backup: stopping the server` and a few seconds after `hold released` | **recovering, as designed**: the writer is stopped for the copy | wait; the `WATCH` line measures it |
| private: still `DOWN` 30 s after `hold released`, or `WATCH … NOT back by the end` | **recovery failed** | stop; W4's recovery (`render-w4.md`); no further step |
| private: `UP` with another revision, or `HTTP <code>` | not the pinned service | stop; nothing downstream |

## Before the window (all required)
1. **The owner opened the window,** named the operator, and said which use it is: **A** (a prerequisite, for example W4's) or **B** (W5's acceptance). **W1–W3 have passed.** W4 is not needed for either.
2. **Maintenance mode is ON for the whole procedure,** between sessions, with no game in play. It may be turned off afterwards only for the window's approved play portion: W4's drill, or the play session.
3. **The recipient key:** the service's `CGN_BACKUP_RECIPIENT` is the owner's **public** key, `<OWNER-AGE-RECIPIENT>` (`age1…`). It isn't a secret. The matching **private** identity, `<OWNER-IDENTITY-FILE>`, stays with the owner. **It is never on Render, never in GitHub, never in a chat, never in a log.**
4. **The storage:** the owner's **already-selected** private off-provider storage, `<OWNER-STORAGE>`. This runbook doesn't choose it, and nobody reselects it here.
5. **The receiving device** has `age` (v1.2.x), `sha256sum`, `tar`, `find`, `grep` and `sh`, a copy of `deploy/render/operator/cgn-receive.sh` from the reviewed revision, and room for both the archive and its decrypted copy.
6. **Disk capacity on Render:** check that `/var/data` has room for one more plaintext copy and its archive (`df -h /var/data` over SSH). Each archive is a few KB per room.
7. **Retention** follows the proposal's row:
   - **off Render:** every pre-deploy and pre-restore backup for 90 days, plus the last 8 game-night backups;
   - **on the disk:** the last 3 plaintext copies, deleted only after their archive is confirmed off Render, meaning a `RECEIPT_OK` exists.

   `cgn-backup` keeps the plaintext copy `/var/data/backups/<STAMP>/` and its checksum list next to the archive. Those are as private as the data itself.
8. **The window record:** a private note, kept by the operator. Never put a secret in it. It holds:
   - the use (A or B), and the start and end times;
   - the private probe's revision before and after;
   - the data folder's path;
   - the `BACKUP_OK` line, verbatim, with its hash `<H>`;
   - the `WATCH` line;
   - each later step's outcome, and the `RECEIPT_OK` line;
   - for use B, the play-window seat check.

## The procedure (one window, one operator, one backup)
| Step | Where | Do | Pass | On anything else |
|---|---|---|---|---|
| 0 | dashboard, SSH | Confirm maintenance is **on** (the public URL answering 503 is expected). In SSH, create the probe (above), then `node /tmp/cgn-probe.mjs check`. Note the time. | `PROBE … UP 7097ac2bb062925bb296a129f4771f1e68fd522d` | stop: nothing has changed yet |
| 1 **Source** | the instance, over SSH | `node /tmp/cgn-probe.mjs watch 60 > /tmp/cgn-watch.txt 2>&1 & cgn-backup; wait; cat /tmp/cgn-watch.txt` | the session shows `cgn-backup: stopping the server (pid …)`, `server stopped`, `hold released`, then **exactly one `BACKUP_OK` line**. Copy that line into the window record: **`<H>` is its `sha256=` value, and only that.** The watch shows `WATCH down from …, back at … (N ms); … UP 7097ac2…`. | `BACKUP_FAILED: …` or no `BACKUP_OK`: **stop.** Nothing downstream. See the failure table. |
| 1b | the instance, over SSH | `node /tmp/cgn-probe.mjs check` again | `UP` on the pinned revision: the original service came back by itself (the entrypoint restarts the server when the hold is released). Record the `WATCH` line's ms. | still `DOWN`, or `NOT back by the end`: W4's recovery; no further step. **A public 503 here means nothing; maintenance is on.** |
| 2 **Transport** | the receiving device | `scp -s <SERVICE-SSH-ADDRESS>:/var/data/backups/cgn-<STAMP>.tar.age <RECEIVING-FOLDER>/` into a **new, empty** folder for this window | the file is there and non-empty | no file, or a partial one: delete only that partial file, then retry the transfer. The archive is still on the Render disk. |
| 3 **Upload** | the receiving device | upload `cgn-<STAMP>.tar.age` to `<OWNER-STORAGE>`, private (never a public link), under a name that includes `<STAMP>`; never next to the identity file | the storage lists it with its full size | retry. Never overwrite an older archive of the same name. |
| 4 **Fetch back** | the receiving device | download it from `<OWNER-STORAGE>` into a **separate new** folder, `<FETCHED-FOLDER>` (not the transport folder) | the file is there | missing or partial: fetch again. If the stored copy itself is bad, upload again from step 2's copy, then fetch again. |
| 5 **Receipt** | the receiving device | `sh cgn-receive.sh <FETCHED-FOLDER>/cgn-<STAMP>.tar.age <H> <OWNER-IDENTITY-FILE> <EMPTY-WORK-FOLDER>`, with `<H>` **typed or pasted from the window record**, never computed from any downloaded file | **`RECEIPT_OK … sha256=<H> … copy=…`**, exit 0. Record the line. | `RECEIPT_FAILED: …` (exit 1): the copy may not be relied on. See the failure table. |
| 6 | the receiving device | Keep `<EMPTY-WORK-FOLDER>/<STAMP>` (the decrypted copy) private, or delete it once fact 3 is recorded, as the owner decides | — | — |
| 7 | dashboard | **Use A:** the procedure is complete. Only now may maintenance be turned off for the window's operation (W4's drill begins with its own checks). **Use B:** maintenance stays on until the approved play session. | — | — |
| 8 (use B) | the play window, maintenance **off** | The seat check: a seat opens its room without rejoining, and the public `/health` reports the pinned revision. | recorded in the W5 acceptance record | the acceptance record stays incomplete; the receipt still stands |

**Why the expected hash comes only from the `BACKUP_OK` line:** the checksum list travels inside the archive, and anyone holding the public key can make an archive that agrees with itself. The only independent anchor is the hash the instance printed in the operator's own SSH session. A hash recalculated from a downloaded file proves nothing about that file.

**Why fetch back:** the receipt must check what the storage really holds, not the copy that was uploaded from.

## Walkthrough: W1–W3 passed, W4 and W5 pending
1. **The owner opens a W4 window** (use A). The operator starts with maintenance on. The public URL answers 503, which is expected and ignored.
2. **Over SSH,** the operator creates the probe; `check` shows `UP 7097ac2…`.
3. **Step 1** runs `cgn-backup` with the watch.
   - The private probe goes `DOWN` right after `stopping the server`: the writer is stopped, as designed.
   - It comes back `UP 7097ac2…` within seconds of `hold released`. The `WATCH` line records how long.
   - The public URL stays 503 the whole time. It never says anything about the writer.
4. **Steps 2–5** on the receiving device end with `RECEIPT_OK` for the hash in the `BACKUP_OK` line. The window note now holds the **procedure-completion record**: both lines, for one backup.
5. **Only now** does the operator turn maintenance off for W4's live drill. The seat checks happen there, on the public site.
6. **If anything failed in 1–5,** no drill: maintenance stays on, and the failure table applies.
7. **W5's acceptance** is recorded later, in its own window (use B), or from this run if the owner says so and every column of use B was captured.

## Failure outcomes: what each means, and the safe action
In every case: no deploy, no restore, no rollback and no data-folder change rely on this backup. Nothing is overwritten. The next stage doesn't run.

| Stage | Symptom | What it means | Safe action |
|---|---|---|---|
| any | the public URL answers 503 | maintenance is on | nothing; use the private probe |
| 1 | `BACKUP_FAILED: another backup holds the server` | a hold exists | wait for the other run; never delete `/tmp/cgn/hold` by hand |
| 1 | `BACKUP_FAILED: the server did not stop within 10 s` | nothing was copied, and the hold was released | the pending `SIGTERM` stops the server; the platform restarts the instance. Check with the private probe, then retry later. |
| 1 | `BACKUP_FAILED: datatool backup failed or timed out`, or `… verify failed` | no archive was published, and the run's files were removed | the private probe should show `UP` again; retry once; if it fails again, stop and report |
| 1 | the session dropped before `BACKUP_OK` | unknown | reconnect over SSH, run the private probe, then `cgn-backup reconcile` (removes only an abandoned run's own files), then a fresh `cgn-backup` |
| 1b | the private probe still `DOWN` after recovery should have finished | recovery failed | W4's recovery; no further step |
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
| Render's maintenance mode (public side) | **LOCAL SURROGATE:** `scripts/beta/render-like-proxy.mjs --maintenance` in front; its public `/health` must answer 503 on every sample, before, during and after the backup |
| the private probe over SSH | **the probe text above, taken from this file,** copied into the container and run there with no service environment (`docker exec … env -i …`): a `check`, and a `watch` across the backup |
| the owner's keys | two **disposable** `age` identities made per run (the receiving one and a wrong one) in a private mode-700 folder, removed on exit |
| validation data | a synthetic room: a finished Trivia game; an **approved** Memory Book entry "W5 seed" linked to it; three acknowledged answers in a second game, with their submitted values kept in the private fixture only |
| the SSH session and `cgn-backup` | `docker exec … env -i … cgn-backup` (no service environment, as over SSH); the expected hash is parsed from that session's `BACKUP_OK` line |
| `scp -s` | **LOCAL SURROGATE:** `docker cp` out of the run's container into a "surrogate-device" folder |
| the owner's storage | **LOCAL SURROGATE:** a copy into a "surrogate-storage" folder |
| fetch back | a copy from the surrogate storage into a separate "fetched" folder |
| `cgn-receive` | the reviewed `deploy/render/operator/cgn-receive.sh`, unchanged, on the **fetched** file only |
| the seat check | over the API on the loopback service port (not the public side): the same seats, the approved entry, and a new acknowledged answer |

**What it checks:**
- the public side answers 503 throughout, while the private probe shows `UP`, then `DOWN`, then `UP` on the pinned revision;
- the writer is excluded (a new server pid after);
- the original service resumes;
- no second container ever mounts the data;
- the received copy holds the pre-backup state, **with each answer's exact submitted value**, and not the answer made after the backup;
- the checker fails on four damaged copies, including **same keys with a different value**;
- eight chain negatives, each stopping at the right stage with nothing promoted and nothing overwritten;
- the source archive is unchanged;
- cleanup is verified, with an unlistable inventory failing the run.

**What it does not prove:**
- SSH or `scp`, a cloud upload or download, the owner's identity or storage;
- Render's real maintenance mode, health checks, timing or disk;
- scale, or real devices.

## Pending (the real W5)
- **The real run:** in an owner-approved window, by the operator, with the owner's recipient, storage and identity.
- **Its record:** the use (A or B), the `BACKUP_OK` and `WATCH` lines, the outcomes of steps 2–4, the `RECEIPT_OK` line, and, for B, the play-window seat check.
- **Then** ChatGPT's independent review. W1–W8 and the physical-device results stay pending until each is actually run.
