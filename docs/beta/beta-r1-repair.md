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
- **Actual:** about 35 min of wall clock, from the review at 4:43 p.m. to the report at about 5:15 p.m. ET.
  - **R3:** 4:49 to 4:57 p.m.
  - **R4 and B-13:** 4:57 to 5:08 p.m.
  - **The gates:** 5:08 to 5:11 p.m.
- **Why it was faster:** the TLS proxy and the checks reused the existing gate and release check patterns.
- **The two surprises:** the sandbox's outbound proxy and B-13. Each took one diagnostic run.


## Third round: the zod advisory's real exposure (review 6903002137)
**The review:** the owner's ChatGPT review confirmed R3 and R4/B-13 with no remaining finding. Its private journey audit is still blocked by Codespaces' forwarded `Origin` (ChatGPT's to solve). It asked me for one bounded task: a reproducible assessment of how exposed the app is to zod 3.25.76's advisory GHSA-mrhx-c7xc-m3w5 ("Zod can exhaust memory while validating oversized constrained collections"; high; fixed only in 4.6.6+). That replaces the earlier single measurement (D-2, D-BR1-05). #42 stays separate. Nothing is merged or deployed.

**Plan:**
1. **The map:** every zod schema that network input reaches (HTTP bodies, WebSocket intents and their payloads), with:
   - its collections and constraints, nested ones included;
   - the limits in front of it: the body and message caps, the beta gate, sessions, rate limits;
   - what the server sends back from a failed parse (the issue list, or one message).
2. **Measurement in a capped child process:** small heap limits (`--max-old-space-size`), never run alongside anything else. For each reachable collection schema, the worst inputs that fit the caps: long invalid arrays, nested invalid arrays, arrays over `.max()`. It records the issues produced, peak heap, time and response size. Through the real server too: an authenticated client at the cap, sequential and concurrent, watching the server's heap.
3. **The verdict:**
   - **If the memory can't be exhausted within the bounds,** the precise bounds and the residual dependency risk.
   - **If it can,** the smallest compatibility-tested mitigation: for example, check a collection's length before zod walks it, or an upgrade path. Valid messages, scoring and rejections must be preserved. No `audit fix --force`, and no unrelated migration.
4. **Focused checks;** broader gates only if production code or dependencies change. Then one new completed report.

**Estimate (written before the work, at 6:15 p.m. ET):** about **2 h 30 min** for the assessment and report, plus about 1 h 30 min if a mitigation is needed.

| Part | Estimate |
|---|---|
| The map (schemas, limits, error responses) | 40 min |
| The capped measurements (isolated and through the server) | 50 min |
| Verdict, docs, report | 1 h |
| A mitigation, if one is needed, with its tests and gates | 1 h 30 min |

### What the assessment found
Evidence: `docs/evidence/beta-r1-repair-local/round3/README.md`.

**1. The map.**
- **What network input reaches:** 12 zod schemas, LocalServer's 11 for HTTP and `IntentSchema` for intents over HTTP and WebSocket.
- **The two arrays:**
  - **Family Questions `options`:** max 8 strings.
  - **The Quick Party lineup's `items`:** 1–8 objects, inside a union.
- **Who can reach them:** any seat holder, and anyone with the beta code can make a room and take its seat. The host check comes after the parse, and these routes have no rate limit.
- **The two records:** settings and the intent payload. Their entries can't fail, so they cost time but build no issues.
- **What a failed parse returns:** a fixed message of at most 106 bytes, never the issues.
- **Nothing else** zod validates comes from the network: room snapshots, Cup rules, Memory Book facts and content.

**2. The cost, measured in capped children.** At the 64 KiB cap, both arrays walked every element: about 32,700 issues, 44–50 ms, +13–16 MB of heap. The smallest old space that finished was 24 MB, against 12 MB for a valid question.
- **Nested and deep arrays are never worse:** zod stops at each element's first type mismatch.
- **Through the real server:**
  - **32 MB old space:** it survived 900 worst-case requests, 500 sequential and 400 from 16 clients at once. The heap went back to its resting size.
  - **24 MB:** it **died** in both runs, with "Reached heap limit"; 27 MB was live during a validation, against 13 MB at rest.
  - **A bystander** waited p50 553 ms and up to 1 s per request while 16 clients sent.

**3. The verdict: reachable, and bounded per request.**
- **What the cap bounds:** one request's peak, about 14 MB above a resting server, and its time, 50–90 ms. Because validation is synchronous and nothing keeps the issues, it doesn't add up across requests or clients.
- **What that means:** a server whose heap limit leaves less room than that dies on one request. For scale, this container's default limit is 2,096 MB; the host's is unknown. Any seat holder could also stall everyone's game for as long as they kept sending.
- **So the mitigation was needed.**

### The mitigation (B-14, D-BR1R-07, D-BR1R-08)
- **`boundedArray()`:** a length check before any element is read, as zod 4.6.6 does. Over the limit it records one `too_big` issue; anything else is parsed by the same `z.array(...).min().max()` as before. Both arrays use it. The production change is `src/server/boundedArray.ts` plus three lines in `src/server/http.ts`.
- **After the fix:** 1 issue (the union adds 3), 2–4 ms, no extra heap. The server at 24 MB took all 900 worst-case requests, and the bystander waited p50 21 ms.
- **Compatibility:** 8,000 generated bodies around the limits get the same verdict and the same parsed value as the previous schemas. Through the server, the same 400s are sent, the room is unchanged, and valid questions and lineups save.
- **Not done:** no zod upgrade, no `npm audit fix`, no other schema changed.

### Checks
- **Before the fix,** the new tests showed the walk.
  - **Run 1:** 6 failed. Two of the failures were bugs in my tests: the generator was too strict, and I used 8 options where the room allows 4.
  - **Run 2:** with those fixed, exactly the four that show the walk failed.
- **After the fix:** the new tests passed 7/7, and the six focused files 88/88.
- **Gates on `456cb0d`:**
  - **Targeted** `20261115-233420-456cb0de-5276`: PASSED (exit 0), 8/8. It ran Family Questions, Quick Party, the session flow, the release package and both beta-gate checks.
  - **Fast** `20261115-233744-456cb0de-6799`: PASSED (exit 0), unit 2046/2046.
- **No full gate:** the change is two request schemas, proven equivalent, and every driver that posts to them ran.

### Estimate vs actual (third round)
| Part | Estimate | Actual |
|---|---|---|
| The map | 40 min | about 7 min (6:16 to 6:23) |
| The capped measurements | 50 min | about 6 min before the fix (6:23 to 6:29); the after-fix runs are in the next row |
| The mitigation, its tests and gates | 1 h 30 min (if needed) | about 10 min: code, tests and after-fix runs to the 6:34 commit, then both gates to 6:39 |
| Verdict, docs, report | 1 h | about 4 min to the docs commit (6:39 to 6:43); the report followed |
| **Total** | about 2 h 30 min, plus 1 h 30 min for a mitigation | **about 28 min** (6:15 p.m. to 6:43 p.m. ET, the docs commit) |

The times come from the runs' own timestamps (the isolated sweep started at 6:23, the first test run at 6:30, the fix was committed at 6:34, the gates ran 6:34 to 6:39). The estimate assumed the map and the measurements would be slower than they were: the schemas are few and live in one file, and the earlier rounds' harness patterns carried over.
