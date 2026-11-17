# Beta R4 W5: backup and independent receipt, local preparation (handoff 6937786587)

**Preparation only.** The real W5 is **PENDING**: nothing here ran on Render, over SSH, against the owner's storage, or with the owner's keys. The runbook is [render-w5.md](../../beta/render-w5.md).

## What was built
| File | What it is |
|---|---|
| `scripts/beta/w5-rehearsal.sh` | **The local rehearsal of the W5 chain.** It runs the pinned image (runtime `7097ac2`) on a run-owned volume with a throwaway code and two disposable test `age` identities. **The source:** seed (below), then the reviewed **`cgn-backup` unchanged**, inside the container with no service environment (as over SSH). The expected hash is parsed from that session's `BACKUP_OK` line. It then checks that the writer was excluded, and that the original service resumed. **The chain:** transport (**LOCAL SURROGATE** for `scp -s`: `docker cp`) → upload (**LOCAL SURROGATE** storage folder) → fetch back (a separate folder) → the reviewed **`cgn-receive` unchanged**, on the fetched file only → a receipt record, written only after `RECEIPT_OK`. Every stage runs only if the one before it passed, and nothing overwrites an existing file. **The checks** that follow are listed below. Isolation follows the reviewed W4 rules. |
| `scripts/beta/w5-seed.mjs` | **The synthetic state, over the API, through the access gate:** a room; a finished Trivia game; an **approved** Memory Book entry "W5 seed" saved from that game; three acknowledged answers in a second game. **`resume`:** the same seats, the approved entry, and a new acknowledged answer after the backup. **`check-copy`:** the received copy holds the pre-backup state and not the post-backup answer. **`mutate`:** the checker's own negatives. |
| `scripts/beta/w5-selftest.sh` | **Runs the rehearsal and its isolation controls,** with sentinels of another owner: T0 static; T1 a port in use; T2 the rehearsal; T3 an unlistable inventory (a docker shim); T4 an interrupted run. |
| `docs/beta/render-w5.md` | **The operator runbook:** the three facts kept apart, the preconditions, the journey, the failure outcomes, and the rehearsal's mapping and limits. |
| `docs/beta/render-w4.md` | **The W4 seed-memory steps,** corrected to the path ChatGPT verified, and the independent W4 verdict. |
| `docs/evidence/beta-r4-w4/README.md` | **The independent W4 verdict,** recorded without re-attributing any run. |

**Not changed:**
- the runtime;
- `deploy/` (`cgn-backup.sh`, `cgn-entrypoint.sh`, `operator/cgn-receive.sh`, the pins);
- the image;
- the release pin `7097ac2`.

**The rehearsal records the script hashes:** the image's `cgn-backup` and `cgn-entrypoint` must be byte-identical to the reviewed `deploy/render` files.

**Prior evidence reused:**
- the round-5 backup drill ([backup-drill/](../beta-r4-hosting/backup-drill/README.md)), for the stopped-writer design and the `cgn-backup` and `cgn-receive` negatives;
- the image checks' C9 ([final log](../beta-r4-render-package/final/image-checks-final.log)), the first container-level `BACKUP_OK` → `RECEIPT_OK`.

W5 adds what neither had:
- seeded and approved state checked inside the received copy;
- the fetch-back from storage;
- the transport, upload and fetch stages with refusals;
- the source resuming;
- the chain negatives.

## What a rehearsal run checks
1. **Setup:** readiness on the pinned revision, and the image's `cgn-backup` and `cgn-entrypoint` byte-identical to the reviewed files.
2. **Seed:** the synthetic state, every write acknowledged.
3. **Source:**
   - `cgn-backup` exits 0 with exactly one `BACKUP_OK`;
   - its own lines show the stop, the copy under the lock, and the hold released;
   - `/health` was refused during the stop, and a NEW server pid came back;
   - the data volume's only user before and after is the one service container.
4. **Resume:** the original service is ready on the pinned revision. The same host and guest seats work with no rejoin, the approved entry is there, and a NEW answer is acknowledged.
5. **The positive chain:** every stage passes, then `RECEIPT_OK` on the **fetched-back** archive, then the receipt record; the sentinels are unchanged.
6. **The received copy** (decrypted, private):
   - the manifest says `serverWasRunning: false`;
   - the room and both games are there, and the warm-up finished;
   - its finish event is in the ledger;
   - exactly the 3 pre-backup answers are present (a positive control on the reader), and the post-backup answer is absent;
   - the "W5 seed" entry is approved and linked to that finish.
7. **The checker's own negatives:** check-copy must FAIL on three damaged copies: the post-backup answer added, a pre-backup answer dropped, and the entry unapproved.
8. **Chain negatives:** each must stop at the expected stage, with no `RECEIPT_OK`, no receipt record, no later stage, and every pre-existing file unchanged.

   | Case | Fault | Must stop at |
   |---|---|---|
   | wrong-hash | the expected hash isn't the `BACKUP_OK` one | receipt: `the archive's SHA-256 is …, not the expected …` |
   | changed-bytes | one byte of the fetched copy changed | receipt (hash) |
   | truncated | the fetched copy cut 16 bytes short | receipt (hash) |
   | wrong-key | a different disposable identity | receipt: `decryption failed` |
   | missing-transfer | no such archive on the source | transport; nothing after it runs |
   | missing-download | the stored object is gone | fetch; the receipt doesn't run |
   | nonempty-work | a pre-existing file in the receiving work folder | receipt: `not empty`; that file unchanged |
   | occupied-fetch | a pre-existing file at the fetch destination | fetch: refused; that file unchanged |
9. **At the end:** the source archive still has the `BACKUP_OK` hash, and the service still serves the pin.
10. **Cleanup and inventory:**
    - only what the run owns is removed, its label read back first;
    - the private folder (code, keys, sessions, decrypted copies) is removed;
    - an unlistable inventory is **UNVERIFIED** and fails the run;
    - no access code, session token, gate cookie or age secret key may be in the kept run folder.

## Every run, in order
All on this machine's Docker with the pinned image `cgn-render:check` (`sha256:7b53109a7d69`). The dev runs used the working tree, before the candidate was committed.

| Run | What changed before it | Verdict | Log |
|---|---|---|---|
| dev 1 | first version | **FAILED, 1 check:** `check-copy` couldn't find the three acknowledged answers. Its reader looked only at a game's top-level `answers`, and Trivia keeps them in its module state (`extra.answers`). Every other stage and all eight chain negatives passed, and cleanup was verified. The "post-backup answer absent" line passed **vacuously**, which is why the reader now has a positive control. | [dev/dev1.log](dev/dev1.log) |
| dev 2 | the reader searches every `answers` map in the second game's own record, and must find exactly the 3 pre-backup answers | PASSED, 24/24 | [dev/dev2.log](dev/dev2.log) |
| dev 3 | the checker's own negatives (three damaged copies) | PASSED, 27/27 | [dev/dev3.log](dev/dev3.log) |
| self-test dev 1 | first version of `w5-selftest.sh` | **FAILED, 3 passed and 9 failed, all from the self-test's own bugs:** the sentinel volume needed `--user root` to write its file (the image runs as `cgn`), and the run-ID pattern missed hex letters, so every "nothing left" check read "no-run-id". The rehearsal itself passed in T2. | [dev/selftest-dev1.log](dev/selftest-dev1.log) |
| self-test dev 2 | both fixed | PASSED, 12/12 | [dev/selftest-dev2.log](dev/selftest-dev2.log) |

The final run is on a clean checkout of the committed candidate; see the next section.

## The final, on ONE clean SHA: `63f9dc58b6b00817737d51cf6c72b3173aa57503`
A clean detached checkout, with `git status --porcelain` at 0 lines before and after, and 0 Docker containers and volumes before and after. The candidate was pushed before testing. The runs below ran one after another.

| Step | Command | Run | Verdict | Log |
|---|---|---|---|---|
| Static, run 1 | `bash runners/w5-static.sh <checkout>` | 04:28Z | **FAILED, 1 check, a false positive in my scan:** the pattern `AGE-SECRET-KEY-` matched the harness's own leak-scan line (the pattern text itself, not a key). Narrowed to a real key's shape (`AGE-SECRET-KEY-1` followed by 50+ key characters); the candidate is unchanged. | [final/static-run1.log](final/static-run1.log) |
| Static, final | the same runner, narrowed | 04:28Z | **W5 STATIC CHECKS PASSED (exit 0):**<ul><li>nothing outside `docs/` and `scripts/beta/w5-*` changed since #47's head `a4bfdf9`;</li><li>the runtime, tests, manifests and other scripts unchanged;</li><li>`deploy/` unchanged from `a4bfdf9` and from `2e2257c`;</li><li>the pin `7097ac2`;</li><li>`cgn-backup.sh` matches its pin;</li><li>eslint, `bash -n` on 10 scripts, and `node --check`;</li><li>42 links, 0 missing;</li><li>no secret-shaped value.</li></ul> | [final/static-final.log](final/static-final.log) |
| Self-test | `bash scripts/beta/w5-selftest.sh cgn-render:check --work <scratch>/w5/st-final` | 04:29:02–04:29:23Z | **W5 SELFTEST PASSED (exit 0), 12/12** | [final/selftest-final.log](final/selftest-final.log) |
| ↳ T1 port in use | (inside the self-test) | | FAILED at preflight as required, nothing started | [final/T1-rehearsal.log](final/T1-rehearsal.log) |
| ↳ **T2 the rehearsal** | (inside the self-test) | run **`20261117T042904Z-ae58ddeb`** | **W5 REHEARSAL PASSED, 27/27** | [final/T2-rehearsal.log](final/T2-rehearsal.log), [final/T2-evidence/](final/T2-evidence/) |
| ↳ T3 unlistable inventory | (inside the self-test) | | **UNVERIFIED and FAILED** as required; real docker found 0 left | [final/T3-rehearsal.log](final/T3-rehearsal.log) |
| ↳ T4 interrupted | (inside the self-test) | | exit 143, cleanup ran, 0 left | [final/T4-rehearsal.log](final/T4-rehearsal.log) |

**T2 in numbers** (the T2 evidence folder: `backup-session.txt`, `expected-from-BACKUP_OK.sha256`, `stop-timing.json`, `provenance.json`, `seed.json`, `negatives.jsonl`, `summary.json`):
- **Runtime:** the image `sha256:7b53109a7d69…`, `/health` revision `7097ac2bb062925bb296a129f4771f1e68fd522d`.
- **Script hashes:**
  - `cgn-backup` is `accca1784e22…c63c`, in the image and in the repository;
  - `cgn-entrypoint` is `6c623dd08bbf…4b6157`;
  - `cgn-receive` is `2fb3fe903f28…b084cd`.
- **`age`:** v1.2.1 in the image encrypted; the receiving side's `age` 1.1.1 decrypted.
- **The source:** `BACKUP_OK /var/data/backups/cgn-20261117T042906Z.tar.age sha256=66f31647425721528824a77d75a8ac9a84a6c95b89a58df4785063cde74d51dc files=4 server_stopped_s=0`.
  - `cgn-backup` took **375 ms** in all.
  - Seen from outside, `/health` was **unavailable for 1,110 ms**, from +172 ms to +1,282 ms after the backup began, over 26 samples. That includes the server's restart.
  - The server pid went from 11 to 146.
  - The data volume's only user before and after was the one service container.
- **The positive chain:** `transport=ok upload=ok fetch=ok receipt=ok promotion=ok`. `RECEIPT_OK` was printed on the **fetched** file, with the same hash and `files=4`.
- **The received copy:**
  - `serverWasRunning: false`;
  - the room, both games, and the warm-up's finish event;
  - exactly the 3 pre-backup answers, and not the post-backup one;
  - "W5 seed" approved and linked to that finish.

  The checker failed on all three damaged copies.
- **The eight chain negatives** stopped at their expected stages, each with nothing promoted and nothing overwritten. The source archive still hashed to the `BACKUP_OK` value at the end.

**The receiving `age` version:** the runbook asks for `age` v1.2.x on the receiving device, to match the image. This rehearsal shows that 1.1.1 also decrypts what 1.2.1 encrypted. It doesn't change that recommendation.

## Limits
- **Local surrogates:** `docker cp` stands in for `scp -s`, and local folders for the owner's storage. **They prove the chain's ordering, refusals and checks, not SSH or cloud transport.**
- **Not Render:** Render's maintenance mode, health checks, disk, SSH user and environment, and timing aren't exercised. The stop measured here is local.
- **Not the owner's keys:** the identities are disposable test keys made per run and removed on exit. The owner's recipient, identity and storage are placeholders in the runbook.
- **Small and synthetic:** one room, two seats, a few KB.
- **The lifecycle code** in `w5-rehearsal.sh` follows the reviewed `w4-control.sh` rules (with the `w5.owner` label). Its unlistable-inventory branch is exercised by the self-test's T3, a docker shim, not by mock unit cases.

## The repair (review 6938403611: changes requested)
Reported first in 6938393714 (tested `63f9dc5`). The review found three problems, all accepted (acknowledged in 6938453591).

| # | Finding | The repair |
|---|---|---|
| 1 | **A W4/W5 deadlock.** W5 required W4 to have passed; W4 required a same-window receipt, which links to W5. With W1–W3 green and W4 pending, the operator couldn't proceed. | `render-w5.md` now separates **the procedure** from **W5's acceptance**. **Use A:** the same-window prerequisite of a W4 window (or of any deploy, restore or data change), which writes a procedure-completion record. **Use B:** W5's own acceptance record, which needs W1–W3 and **not** W4. `render-w4.md`'s prerequisite 2 runs W5's procedure inside the W4 window with maintenance on, and starts the live drill only after `BACKUP_OK` **and** `RECEIPT_OK` for that same backup are verified. An operator walkthrough covers W1–W3 green with W4 and W5 pending. The receipt is never waived, and every step is inside an owner-approved window. |
| 2 | **Public browser probes during maintenance.** With maintenance on, the public URL answers 503 to everything. | **A private health probe:** the exact text is in `render-w5.md`; it runs over SSH inside the instance, needs only Node 22, and only reads `127.0.0.1:10000/health`. It has a `check` mode and a timed `watch` across the backup. Maintenance **stays on** for the whole procedure. A public 503 is documented as never being evidence about the writer, and there is a table for reading the states. The interactive seat check moved to the approved play window (maintenance off): W4's drill, or the next play session. |
| 3 | **The copy checker accepted changed answer values:** it checked keys and the count only. | `w5-seed.mjs` records each acknowledged answer's submitted value **in the private fixture only** (`seed.json`'s `secret`; never printed). It submits three different values, so a swap can't match. `check-copy` requires each answer to be stored where the pinned runtime keeps it (`extra.answers[player][question]`, per `room.ts` at `7097ac2`) and to **equal** the submitted integer. A new checker negative, **`change-pre-value`** (same keys, a different value), must fail, and fail **only** on the value line. |

**The rehearsal now also checks, on the target-host-shaped path:**
- the **runbook's own probe text** (taken from `render-w5.md` between its heredoc markers) copied into the container and run there with no service environment: a `check` before the backup must report `UP 7097ac2…`, and a `watch` across the backup must show `UP → DOWN → UP` on the pinned revision;
- a **`--maintenance` Render-like proxy** in front (a LOCAL stand-in for the public side): its public `/health` must answer **503 on every sample**, before, during and after the backup.

### Repair runs, in order (working tree, before the candidate)
| Run | Verdict | Log |
|---|---|---|
| The reproduction (synthetic fixture): `63f9dc5`'s checker against the repaired one | `63f9dc5` accepts a changed value (**COPY OK, exit 0**); the repair rejects it, exit 1, on the value line only | [repair/repro/](repair/repro/README.md) |
| Rehearsal dev 1 | PASSED, 33/33 (the probe `UP`; the watch `DOWN` for 1,118 ms; 71/71 public samples 503; `change-pre-value` failing only on the value) | [repair/dev/rehearsal-dev1.log](repair/dev/rehearsal-dev1.log) |
| Self-test dev 1 | PASSED, 12/12 (T2 33/33) | [repair/dev/selftest-dev1.log](repair/dev/selftest-dev1.log) |

The final on the committed repair candidate follows.
