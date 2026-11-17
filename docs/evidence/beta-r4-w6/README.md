# Beta R4 W6: restore of a received backup, local preparation (handoff 6938602366)

**Preparation only.** The real W6 is **PENDING**: nothing here ran on Render, over SSH, against the owner's storage, with the owner's keys, or as a Render disk snapshot. The runbook is [render-w6.md](../../beta/render-w6.md).

## What was built
| File | What it is |
|---|---|
| `scripts/beta/w6-rehearsal.sh` | **The local W6 rehearsal.** It runs the pinned image (runtime `7097ac2`) on a run-owned volume, with a throwaway code and a disposable receiving identity. Every step below runs with the reviewed scripts **unchanged**: `cgn-backup`, `cgn-receive`, `cgn-authorize`, `cgn-entrypoint` and `datatool` `verify`/`restore`/`check`. |
| `scripts/beta/w6-check.mjs` | **The rehearsal's checks.** `fingerprint`: a SHA-256 for every data file, leaving out the lock record. `restored`: the restored folder against B1's verified copy. `live`: over the reopened ingress. |
| `scripts/beta/w6-selftest.sh` | **The rehearsal and its isolation controls,** with sentinels of another owner: T0 static; T1 a port in use; T2 the rehearsal, including its own log in the leak scan; T3 an inventory docker can't give; T4 an interrupted run. |
| `docs/beta/render-w6.md` | **The operator runbook:** R and C; the preconditions; the procedure; the fallback; finding **F-W6-01**; the Render disk snapshot, separate and PENDING; the failure outcomes; the rehearsal mapping and limits. |
| `docs/evidence/beta-r4-w6/runners/w6-static.sh` | **The static checks** (below). |

**Reused, not changed:**
- `scripts/beta/w5-seed.mjs`, the synthetic state;
- the Render-like proxy, with `--maintenance`;
- the private probe from `render-w5.md`.

**Not changed:**
- the runtime;
- `deploy/` (the three pinned scripts, `operator/cgn-receive.sh`, the pins);
- the image;
- the release pin `7097ac2`.

The rehearsal checks that the image's `cgn-backup`, `cgn-entrypoint` and `cgn-authorize` are byte-identical to the reviewed `deploy/render` files.

## What a rehearsal run does and checks
Ports 18680 (the backend), 18643 and 18644 (the proxy), on the label `w6.owner=<run id>`. The original folder is `/var/data/cgn-w1`; the target is `/var/data/cgn-w6`.

1. **Setup:** service A is ready on the pinned revision; maintenance is on (the public `/health` gives 503); the script hashes match.
2. **Seed** (`w5-seed.mjs`):
   - a room, and a finished Trivia game;
   - an **approved** "W5 seed" entry;
   - three acknowledged answers in a second game, with their private submitted values.
3. **B1, the backup to restore:**
   - `cgn-backup` exits 0 with exactly one `BACKUP_OK`;
   - then the original service resumes: the same seats, the approved entry, and a NEW answer after the backup.
4. **B2, the fresh same-window backup of the CURRENT data:** `BACKUP_OK`, then `RECEIPT_OK` on its **fetched-back** copy, through the W5 chain. In that chain, the transport and storage are LOCAL SURROGATES and `cgn-receive` is unchanged.
5. **N1, a receipt for exactly R:**
   - a changed fetched copy gets `RECEIPT_FAILED` and no receipt record;
   - B2's receipt offered for B1 is refused by the upload gate (a different hash);
   - nothing is uploaded.
6. **B1 received:** `RECEIPT_OK` with the hash from B1's `BACKUP_OK` line.
7. **N2, an invalid copy:**
   - an **incomplete** or a **changed** staged copy: `datatool verify` refuses (exit 1);
   - no restore target is created.
8. **Upload** of the verified decrypted copy into a new staging folder. This is a LOCAL SURROGATE for `scp -s`: a tar stream as the service user, with every file owned by `cgn`.
9. **Verify, restore, check:**
   - `verify OK`;
   - `restore OK` into the new folder;
   - `check OK`, as the service user;
   - the folder belongs to `cgn`, with mode 700.
10. **The restored state** equals B1's:
    - the same data files (the manifest aside);
    - the score ledger deep-equal;
    - each pre-backup answer with its exact submitted value, in the pinned shape (`extra.answers`, an integer);
    - the post-backup answer **absent**;
    - the approved entry linked to the warm-up game's finish.
11. **N3, an occupied target:** `datatool restore` refuses (exit 1), and the file already there is unchanged.
12. **N4, a start on the target without authorizing it:**
    - the guard refuses: exit 78, a `REFUSED` line, no server;
    - recovery onto the original works, and the original's files are unchanged.
13. **The cutover:**
    - preflight: B2's receipt in this window, the target checked, the target a different folder;
    - `cgn-authorize <target>` from the live instance;
    - a graceful stop (exit 0);
    - the original's fingerprint taken;
    - the old container removed and confirmed gone, and no container on the volume;
    - the new container starts, and the entrypoint logs that the environment matches the authorized configuration.
14. **N5, a revision mismatch at the reopen gate:** the private probe is `UP` but not on the expected revision, so the ingress stays at 503.
15. **The reopen gate:** the private probe is `UP` on the pin, then the proxy reopens.
16. **Through the reopened ingress:**
    - the original host and guest seats work with no rejoin;
    - the approved entry is there;
    - **a repeated answer is refused** (`ALREADY_ANSWERED`) and keeps its value;
    - a new answer is acknowledged;
    - **a replay of the same event id isn't recorded twice**;
    - the host has exactly 2 answers.
17. **The fallback is kept:** the original's fingerprint after the switch equals the one taken at the stop.
18. **The fallback cutover:**
    - authorize the original, graceful stop, one writer, the reopen gate;
    - the retained folder's later state is served (the post-backup answer, with its value), along with the seats and the entry.
19. **N6, finding F-W6-01** (below).
20. **At the end,** exactly one container is on the volume. The cleanup leaves no container, volume, process, listener or private file of the run. The leak scan covers the kept run folder **and the run's own log**.

## Finding F-W6-01: no supported recovery on Render if the switched start fails (OPEN)
**Where:** a reviewed design gap in the guard pair (`cgn-authorize`, `cgn-entrypoint`) combined with Render's platform limits. It is **not** a defect in a script's behaviour: each script does what was reviewed. Per the handoff, it is reported with a reproduction, and nothing reviewed was changed.

**The reproduction** (`w6-rehearsal.sh`, case N6, in every run below):
1. a second target `/var/data/cgn-w6-n6` is restored from the verified staging copy and passes `datatool check`;
2. a LOCAL fault (`chmod 0500` as root) makes it unwritable;
3. `cgn-authorize /var/data/cgn-w6-n6 …` runs from the live instance;
4. a graceful stop, then a container on the target. The entrypoint accepts the record, and the server exits 2 with `EACCES`;
5. a container on the **original** folder is **refused, exit 78**: `REFUSED: MCHEZO_DATA_DIR is not the authorized data folder…`;
6. the original's fingerprint is unchanged.

**On Render:**
- a failing or refusing instance gives no SSH, and Render has no one-off job with the disk;
- so step 5's state can't be undone with the reviewed tools;
- locally it took a one-off container (`docker run --entrypoint cgn-authorize`).

The candidate recoveries and the interim rules are in [render-w6.md](../../beta/render-w6.md#finding-f-w6-01-no-supported-recovery-on-render-if-the-switched-start-fails-open). **All of them need an owner decision.**

## The runs
**Development runs** (in `dev/`). All are on the uncommitted working tree, before the candidate; the script hashes are in each log's header.

| Log | Run | Verdict |
|---|---|---|
| [dev0-docker-down.log](dev/dev0-docker-down.log) | `20261117T051139Z-6df95418` | **VOID: FAILED at preflight.** The local docker daemon had stopped, so the image wasn't available. Nothing started. Kept as run. |
| [dev1.log](dev/dev1.log) | `20261117T051200Z-5d4dc53b` | W6 REHEARSAL PASSED, 39/39 |
| [dev2.log](dev/dev2.log) | `20261117T051357Z-cbb3b0b4` | W6 REHEARSAL PASSED, 39/39 |
| [selftest-dev1.log](dev/selftest-dev1.log) | tag `dc4689` | W6 SELFTEST PASSED, 12/12 |
| [dev3.log](dev/dev3.log) | `20261117T051730Z-28d3ae74` | W6 REHEARSAL PASSED, 39/39. This is after two output fixes: the full `AUTHORIZED` line, and a no-overwrite copy in place of `cp -n`. |
| [selftest-dev2.log](dev/selftest-dev2.log) | tag `2d0e7a` | W6 SELFTEST PASSED, 13/13, with the new T2 check that the run's own log is in its leak scan |

**The final: one clean detached checkout of `b4bba0994f725825ca190c7241c95df2ff2511e1`, status 0 lines, run at 05:22Z.** Both runs below are on that one revision. The `node_modules` link is untracked and ignored.

| Log | Run | Verdict |
|---|---|---|
| [static-final.log](final/static-final.log) | `runners/w6-static.sh`, about 10 s | **W6 STATIC CHECKS PASSED.** Nothing outside `docs/` and `scripts/beta/w6-*` changed; the runtime, `w5-seed.mjs` and `deploy/` are unchanged (from `d2e7edf` and from `2e2257c`); the pin is intact; the three pinned scripts match `pins/scripts.sha256`. Also: eslint; `bash -n` on 13 files; `node --check`; 8 relative links, 0 missing; the secret scan found nothing. |
| [selftest-final.log](final/selftest-final.log) | tag `de127f`, 46 s | **W6 SELFTEST PASSED, 13/13** |
| [T1-rehearsal.log](final/T1-rehearsal.log) | `20261117T052218Z-68cb538d` | **FAILED at preflight, as expected:** a listener was already on 18680. Nothing started, nothing left. |
| [T2-rehearsal.log](final/T2-rehearsal.log) | `20261117T052219Z-200994c2`, about 18 s | **W6 REHEARSAL PASSED, 39/39**, with N1–N6. Its own log was in the leak scan: 0 hits. |
| [T3-rehearsal.log](final/T3-rehearsal.log) | `20261117T052238Z-48824f02` | **FAILED, as expected:** 39/39 checks, but the inventory was UNVERIFIED (the docker shim), so the run is never read as clean. Real docker confirmed the removal. |
| [T4-rehearsal.log](final/T4-rehearsal.log) | `20261117T052258Z-3cecf71a` | **FAILED, as expected:** SIGTERM after seeding, exit 143. The cleanup ran, and nothing was left. |

**`final/T2-evidence/`** holds T2's run evidence:
- `provenance.json`: the image id, and the `datatool` and `cgn-receive` hashes;
- `seed.json`: ids only, no tokens or values;
- `B1-backup-session.txt` and `B2-backup-session.txt`: the `cgn-backup` sessions;
- `b1.receipt` and `b2.receipt`: each `BACKUP_OK` hash with its `RECEIPT_OK`;
- the original's fingerprint at the stop and after the switch (equal);
- `summary.json`.

The encrypted archives and the decrypted copies aren't published. The decrypted copies and the disposable identity were removed with the run.

## Limits
**What this doesn't prove:**
- SSH or `scp`, the owner's cloud storage or keys;
- Render's redeploy, health checks, maintenance mode, or its behaviour after a failed stop-before-start deploy;
- the Render disk snapshot (PENDING; see the runbook);
- physical devices.

**What was local:**
- the transport, the storage, the ingress and its maintenance mode are LOCAL SURROGATES;
- the N6 fault is injected locally;
- the N6 recovery is LOCAL-ONLY.
