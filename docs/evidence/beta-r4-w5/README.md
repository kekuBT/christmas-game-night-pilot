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

## Limits
- **Local surrogates:** `docker cp` stands in for `scp -s`, and local folders for the owner's storage. **They prove the chain's ordering, refusals and checks, not SSH or cloud transport.**
- **Not Render:** Render's maintenance mode, health checks, disk, SSH user and environment, and timing aren't exercised. The stop measured here is local.
- **Not the owner's keys:** the identities are disposable test keys made per run and removed on exit. The owner's recipient, identity and storage are placeholders in the runbook.
- **Small and synthetic:** one room, two seats, a few KB.
- **The lifecycle code** in `w5-rehearsal.sh` follows the reviewed `w4-control.sh` rules (with the `w5.owner` label). Its unlistable-inventory branch is exercised by the self-test's T3, a docker shim, not by mock unit cases.
