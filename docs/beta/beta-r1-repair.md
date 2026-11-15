# Beta R1-R: repairs from review 6900450343 (R1, R2)

**Status (2026-11-15):** completed.
- **Tested code:** `23abfbc`.
- **Gates:** targeted, fast and full all PASSED on it.
- **Evidence:** `docs/evidence/beta-r1-repair-local/README.md`. The completed report is on #43.

**Review:** the owner's ChatGPT review on #43, comment 6900450343 (2026-11-15; D-WF-01). It asked for changes on tested `92a3722` (head `1430f06`). The beta is held, and no unrelated milestone is assigned.

**Branch:** same branch and PR (`claude/beta-r1-readiness`, #43). #42 stays separate. Nothing is merged or deployed. No host, account or paid resource is used.

**What stays with ChatGPT:** the private preview's recovery and the delayed interactive gate (host, guest and TV; gameplay, reconnect, layout). The real host and the real-phone rehearsal are separate again.

## R1: the single-writer guarantee during overlapping starts
**The defect (source-confirmed by the review):** in `src/server/datalock.ts`, creating `server.lock` (`open wx`) and writing the pid into it are two steps.
- A second start can read the new, still-empty file, call it stale, delete it and take the lock. Both starts then run.
- Stale recovery has a second race. Two starters that find the same stale lock can each delete and recreate it, and the second one deletes the first one's fresh lock.
- The backup and archive tools only *check* for a live server. A server can start between that check and their writes.

**The repair:** an atomic exclusion that the kernel holds for exactly as long as the process lives.
- **The mechanism:** each process that writes a data directory binds an exclusive Linux abstract Unix socket named after the directory's identity (device and inode).
  - Binding is atomic: a second binder gets `EADDRINUSE`.
  - The kernel releases the name when the process ends, however it ends (SIGTERM, a crash, `kill -9`). So there is never a stale lock to recover, and no recovery race.
  - It needs nothing installed and leaves no file behind.
- **`server.lock` becomes a record only.** It says who holds the directory (pid, role, host, start time), for people and messages, and is written only by the holder. A leftover record from a crash is simply replaced.
- **The tools take the same lock for their whole operation:**
  - a backup without `--allow-running`;
  - `prune --apply`;
  - a restore, on its new target folder.

  A server start during any of them is refused with the tool's name, and they are refused while a server runs.
- **Unchanged:** the persistent data format. The rooms, books, `.prev` generations and quarantine are untouched; only the lock record gains a `role` field.
- **Scope:** one Linux host, as the architecture already says. The service and the tools must share the host's network namespace, which is systemd's default. The runbook says not to add `PrivateNetwork=` to the unit.
- **Alternatives considered:**
  - **`flock`:** Node has no `flock`, and a native module or a helper process would add a dependency or a second lifetime to manage.
  - **A link-based lock file with a recovery guard:** it fails closed, but a crash inside recovery still needs a person, and a reused pid can block a start.

## R2: restore under the actual service user
**The defect:**
- The runbook backs up and restores as root, while the unit runs as `cgn`.
- A root restore creates a root-owned 0700 folder and 0600 files that `cgn` can't read or lock.
- The runbook never hands the restored data to `cgn`, and the packaged drill used one user.

**The repair:**
- **`restore --owner <user>`:** after copying and verifying, it hands the new folder to the service user (`chown`, keeping 0700 and 0600), while still holding the target's lock.
- **`datatool check --data <dir>`, run as the service user:** a read-and-probe check. It confirms that this user owns the folder and its files, that they are private, that every room decodes and every book parses, that the lock can be taken, and that a write succeeds (a temporary file, removed).
- **A plain refusal:** a server that can't create or lock its data folder (`EACCES`) exits with a reason that names the folder, the user and the fix, not a stack trace.
- **The runbook:**
  - restore as root with `--owner cgn`, then `sudo -u cgn ... check`, then start;
  - first install with no previous package;
  - roll back when there is no previous package to roll back to.
- **The packaged drill** (in the release check, under real local users: a service user and an operator user created for the run and removed after it), from the packed tarball:
  1. the service user runs the server and plays into it: a room and a Memory Book entry;
  2. it stops;
  3. root backs up;
  4. a restore without `--owner` is refused by the service, with the reason;
  5. a restore with `--owner` passes `check` as the service user;
  6. the service starts on it, loads the room and the Memory Book, holds the lock and saves a later change;
  7. the backup is still private and verifies, and the original data is byte-for-byte unchanged.

## Validation
- **A reproduction on `92a3722` first:**
  - the deterministic interleaving (an empty lock read as stale);
  - many processes started at once on a fresh folder, and on one with a stale lock, counting overlapping holders.
- **Unit and process tests on the repaired code:**
  - overlap at first start and at stale recovery (many processes at once; exactly one holder);
  - a tool holding the lock refuses a server start, and a running server refuses the tools;
  - crash and restart (`kill -9`, then start);
  - a clean SIGTERM frees the lock for the next start and the tools;
  - restore ownership and `check`.
- **The packaged release check** (`scripts/check-release-package.mjs`): the overlapping starts and the service-user drill, from the tarball.
- **Gates:** targeted (the release and beta checks), fast, and one full gate on the final SHA. The server's startup changes, and every driver starts a server, so a full gate is warranted.

## Estimate (written before the work, at 3:05 p.m. ET)
About **7 h 30 min**.

| Part | Estimate |
|---|---|
| Reproductions on `92a3722` | 30 min |
| The lock (server, tools, record) | 1 h 15 min |
| Lock tests (processes, maintenance, crash, SIGTERM) | 1 h |
| Restore ownership, `check`, the refusal | 1 h |
| The packaged service-user drill | 1 h 15 min |
| Runbook (first install, rollback, restore), architecture | 45 min |
| Targeted, fast and full gates, evidence | 1 h 15 min |
| Report | 30 min |

**Risks:**
- Tests and drivers that start several servers on one folder, or in one process, may now be refused. Each will be checked and named, not loosened.
- An abstract socket is per network namespace, so a sandboxed unit would not share it. This is documented and checked in the runbook.

## Estimate vs actual
- **Estimate:** about 7 h 30 min, written at 3:05 p.m. ET.
- **Actual:** about 1 h 15 min of wall clock, from the review at about 3:01 p.m. ET to the report at about 4:16 p.m. ET.
  - **The repair and its evidence:** 3:05 to 3:30 p.m. That was the reproductions, the lock, the tools, the tests, step U, the docs, the commit and the packaged drill.
  - **The gates, one after another:** 3:29 to 4:12 p.m., 41 minutes of it the full gate.
- **Why it was so much faster:** both repairs were small in code. The kernel exclusion removed the recovery protocol the estimate allowed for. Step U reused the release check's existing structure, and the gates passed first time.
- **One estimate risk didn't happen:** no existing test or driver was refused by the new lock. The only tests that changed were the ones that faked a running server with a lock file.
- **Found along the way:** B-12 (backup ownership), by step U, on its third local run.


## Second round: R3 and R4 (review 6901841738)
**The review:** the owner's ChatGPT review of the first repair (report 6901467992, tested `23abfbc`). It found the R1–R2 repairs sound and asked for two validation repairs. #42 stays separate. Nothing is merged or deployed.

**R3, the lock race test's child protocol (a test-harness defect, not a production one).**
- **The defect:** in `tests/beta-r1r-lock.test.ts`, the race helper wrote END to every child once all had answered. A refused child (`tests/fixtures/lock-child.mts`) had already let go of stdin and exited. So a write could hit a closed pipe: an uncaught `write EPIPE` and a failed run, as the reviewer saw on Node 22.16.
- **The repair:**
  - END goes only to a confirmed live holder.
  - The helper fails explicitly on an unexpected exit, a missing READY or outcome, a timeout or any pipe error. It never treats them as refusals and never ignores EPIPE.
  - The exactly-one-holder, all-others-refused assertions and the cleanup stay.
- **Validation:**
  - a deterministic reproduction of the EPIPE with the real fixture, on `23abfbc`;
  - repeated runs of the focused files after the repair, every run and exit status recorded.

**R4, the gate through a configured production origin.**
- **The gap:** `scripts/check-beta-gate.mjs` runs the development server over plain HTTP on localhost, with no public origin. It doesn't show the HTTPS, configured-origin behaviour the release needs.
- **The repair:** a new check, `scripts/check-beta-gate-https.mjs`.
  - **Setup:** the packed release on plain node in production, with `MCHEZO_PUBLIC_ORIGIN=https://beta.test:<port>`, a trusted proxy and a loopback listen address. In front of it, a local TLS proxy like Caddy's: a self-signed certificate made for the run, the `Host` and `Origin` kept, `X-Forwarded-For` appended, WebSocket upgrades passed through. Chromium resolves `beta.test` to the proxy.
  - **What it shows:**
    - correct-code entry that returns to the page asked for, its query included;
    - a Secure, HttpOnly, SameSite cookie;
    - clear wrong-code feedback;
    - the API and a WSS socket working after entry;
    - both refused without the cookie;
    - foreign origins still refused;
    - the gate page fitting at 320 and 390 px.
  - **How:** browser-driven (Chromium over HTTPS), plus protocol-level requests for the foreign-origin cases.
  - **Isolation:** private, $0, no host, no real credentials.
- **Production origin checks are not loosened.** If the check finds a defect in production code, it is reproduced first, fixed, and a proportionate wider regression is run.

**Gates:** focused repeated runs of the protocol tests, then a targeted gate (the release, beta and HTTPS checks) and a fast gate on one SHA, one after another. There is no full gate unless production code changes, as the review allows.

**Estimate (written before the work, at 4:48 p.m. ET):** about **4 h**.

| Part | Estimate |
|---|---|
| R3 reproduction, repair, repeated runs | 45 min |
| R4 check (TLS proxy, packaged server, browser and protocol checks, screenshots) | 2 h |
| Targeted and fast gates, evidence | 30 min |
| Docs and report | 45 min |

**Second round, done:**
- **Tested code:** `8b02b39`. Targeted `20261115-220845-8b02b394-22816` and fast `20261115-220948-8b02b394-24641` both PASSED.
- **B-13 found and fixed:** a production code change (a gate-page header), explained in D-BR1R-04.

**Second round, estimate vs actual:**
- **Estimate:** about 4 h, written at 4:48 p.m. ET.
- **Actual:** about 40 min of wall clock, from the review at 4:43 p.m. to the report at about 5:20 p.m. ET.
  - **R3:** 4:49 to 4:57 p.m.
  - **R4 and B-13:** 4:57 to 5:08 p.m.
  - **The gates:** 5:08 to 5:11 p.m.
- **Why it was faster:** the TLS proxy and the checks reused the existing gate and release check patterns.
- **The two surprises:** the sandbox's outbound proxy and B-13. Each took one diagnostic run.

