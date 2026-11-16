# Beta R4 packaging: local evidence for the Render package and the W1 checker (handoff 6919813048)

**Where it ran:** this session's machine, with a local Docker daemon, on throwaway data and throwaway codes generated per run. No Render account, no Render service, no real data.
- **The runtime:** unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d`.
- **What is being checked:** [deploy/render/](../../../deploy/render/README.md) (the package and the exact configuration), and `scripts/beta/w1-check.mjs` (the W1 checker; steps in [render-w1.md](../../beta/render-w1.md)).

## Two substitutions, both local only
1. **The archive is a LOCAL REBUILD, not the audited archive.**
   - **Which:** the R2 rebuild "build 2": SHA-256 `e57380943f7bf8c0e9e83da565b4fcc4eb4d2f3ec0a3802ea5a9acb2ce95fe52`, Node v22.16.0, from a fresh clone of `7097ac2`, with the same 144-file inventory `fe6d74f8…` ([release record](../../beta/release-7097ac2.md)).
   - **Why:** this session can't reach the audited `a693c543…` archive.
   - **How the builds handle it:** the positive builds use a **test pin**: the assembled context's `pins/archive.sha256` is replaced by the rebuild's own hash (`harness/assemble.sh.txt`, printed as "TEST PIN" in every log).
   - **The production pin refuses the rebuild:** check G1.
2. **The two build stages' base images are local copies that add this sandbox's TLS-inspection certificate authority** (`harness/local-ca-*.Dockerfile.txt`).
   - **Why:** this sandbox inspects outbound TLS, so without them `npm ci` and the Go download can't verify certificates. The pinned images are their bases, by digest.
   - **How:** BuildKit's `--build-context` (`harness/build.sh.txt`).
   - **The runtime stage is not substituted:** it is the exact pinned `node:22.16.0-bookworm-slim@sha256:048ed02c…` (pulled from a mirror and tagged with its Docker Hub name, the same digest).

## What is checked
**`harness/image-checks.sh.txt`**: builds, then the container.

| Case | Must |
|---|---|
| B0 | The image builds with no cache. The gate prints `ARTIFACT_GATE_OK`, the runtime stage `INSTALLED_OK`, the age stage `age: OK` (the pinned binary hash). |
| G1 | **The production pin** (`a693c543…`) refuses the local rebuild |
| G2–G7 | Refused, each re-pinned so that only the gate's own check can stop it: one changed file (the inventory); `release.json` naming another revision; `-dirty`; a symbolic link (before unpacking); `node_modules` shipped; one extra file |
| G8 | A changed `cgn-backup.sh`: refused as not the reviewed script |
| G9 | A second file in `artifact/` never enters the build (`.dockerignore`), and the gate itself refuses it when run directly |
| G10 | A wrong age pin: the age stage fails |
| G11 | The same package inside one top-level folder (the other archive layout) is accepted |
| G12 | A "secret file" in the build context's root (Render copies those into the context) appears neither in the image's files nor in its history |
| C1 | The image: user `cgn:cgn`; `CMD cgn-entrypoint`; `NODE_ENV=production`, `PORT=10000`, `MCHEZO_LISTEN_HOST=0.0.0.0`; no secret, data folder, origin or proxy count baked in |
| C2 | Inside: uid 10001, bash, `~/.ssh` 700, `/var/data` 700 `cgn`, `/app` read-only, age v1.2.1, Node v22.16.0, the scripts' hashes = the reviewed ones, `INSTALLED_OK` |
| C3 | First install on a fresh volume: `/health` 200 with the revision; the API 401 without the cookie; PID 1 is `cgn-entrypoint`; the server runs as uid 10001; the log says first install |
| C4 | `cgn-authorize` through `docker exec` (as SSH): `AUTHORIZED`; the record is 600 `cgn` and holds no code |
| C5 | The gate signs in: 303, a cookie `HttpOnly`, `Secure`, `SameSite`. A room is created and its host joined. |
| C6 | `docker stop` (`SIGTERM`, as a Render deploy or restart): the server closes, and the entrypoint exits 0 in well under 30 s |
| C7 | Restart: the guard accepts the authorized configuration; the room and its host are restored |
| C8a–e | The rollback guard exits 78, the server never starting, for: another data folder; an older code; another proxy count; another origin; data with the record removed |
| C9 | `cgn-backup` with **no** service environment (as an SSH session): `BACKUP_OK`, the server back with a new pid. Then `cgn-receive` off the container: `RECEIPT_OK`. The room still answers. |
| C10 | **A root-owned `/var/data`** (Render's mount ownership is unverified): the server never serves; the container exits non-zero (fail closed) |
| C11 | `installed` refuses an extra package in `node_modules` and a changed file in `/app` |
| — | The container never printed the access code |

**`scripts/beta/w1-selftest.sh`**: the W1 checker against the image behind `scripts/beta/render-like-proxy.mjs`. The proxy is a local stand-in for Render's edge: TLS, an appended `X-Forwarded-For`, an `http` → `https` redirect, maintenance 503.

| Scenario | The checker must say |
|---|---|
| S1: right (one hop, count 1) | `closed` FAILED (the service is open); `boundary`, `reconnect` (across `docker restart`), `forgery` and `separation` (from 127.0.0.2) PASSED; `forgery` again at once INCONCLUSIVE |
| S2: count too high (one hop, count 2) | `forgery` FAILED |
| S3: count too low (unset) | `forgery` PASSED (it can't see this), `separation` FAILED |
| S4: two hops, count 1 | `forgery` PASSED, `separation` FAILED |
| S5: two hops, count 2 | both PASSED |
| S6: maintenance on | `closed` PASSED, `boundary` FAILED |
| S7: no redirect | `boundary` FAILED on exactly the redirect check |
| S8: the service stopped, never back | `reconnect` FAILED |
| — | The access code appears in no log and no evidence file |

## Every run, in order
The package's own files were the same for image-check runs 1–3: only the harness changed. Runs 1–3 of each harness ran on my working files. **Only the final runs bind to the committed files.**

| Run | What changed before it | Verdict | Log |
|---|---|---|---|
| Build 1 | First build | **FAILED** at the gate: after `npm ci --omit=dev`, `node_modules` held empty scope folders (`@babel`, `@types`, …) beside `ws` and `zod` | [dev-logs/build-test-run1.log](dev-logs/build-test-run1.log) |
| Build 2 | The gate checks that nothing but `ws`, `zod` and `.package-lock.json` holds any file or link. It removes only EMPTY top-level folders (`rmdir`), then requires the exact listing. | PASSED | [dev-logs/build-test-run2.log](dev-logs/build-test-run2.log) |
| age ×2 | Two fresh builds of age | Byte-identical: `e9f29db5…13f0` | [dev-logs/age-reproducible.log](dev-logs/age-reproducible.log) |
| Image checks 1 | First run | **FAILED, 28/30.** B0: the build passed, but its stages were cached, so the expected lines weren't printed. G9: the second artifact never entered the context, so the expected gate refusal couldn't happen. | [dev-logs/image-checks-run1.log](dev-logs/image-checks-run1.log) |
| Image checks 2 | B0 builds with no cache; G9 also runs the gate directly | **FAILED, 29/30.** G11's build was a cache hit (its re-made archive was byte-identical), so it printed nothing. | [dev-logs/image-checks-run2.log](dev-logs/image-checks-run2.log) |
| Image checks 3 | Every check build with no cache | PASSED, 30/30 | [dev-logs/image-checks-run3.log](dev-logs/image-checks-run3.log) |
| W1 self-test 1 | First run | **FAILED, 15/17.** `closed` had posted a wrong code to the open service, so `forgery`'s 10th attempt already got 429. `reconnect` ran after `forgery`, from the locked address. | [dev-logs/w1-selftest-run1.log](dev-logs/w1-selftest-run1.log) |
| W1 self-test 2 | `closed` uses GET only (it never counts as a wrong code). `forgery` passes if a 429 comes by the 11th attempt and only 429s follow, and it reports earlier failures. Order: boundary, reconnect, forgery, separation. | **FAILED, 14/18.** After the restart the guard refused to start, exit 78: data existed, and the self-test had never run `cgn-authorize`. Everything after it got 502. | [dev-logs/w1-selftest-run2.log](dev-logs/w1-selftest-run2.log) |
| W1 self-test 3 | The self-test authorizes the throwaway configuration after each start, as W1 Step 0 now requires | PASSED, 18/18 | [dev-logs/w1-selftest-run3.log](dev-logs/w1-selftest-run3.log) |
| **Final, image checks** | **The committed files:** a clean checkout of `405f06f924813516416243570fe1692f5120ca31`, the harness taken from that commit | **PASSED, 30/30** | [final/image-checks-final.log](final/image-checks-final.log); every build's log in [final/builds/](final/builds/) |
| **Final, W1 self-test** | The same checkout; the image from the final image checks | **PASSED, 18/18** | [final/w1-selftest-final.log](final/w1-selftest-final.log); the checker's evidence files in [final/w1-evidence/](final/w1-evidence/) |
| Final, static checks, run 1 | The same checkout | **Incomplete:** step 2 (repack) refused, because my `node_modules` link counted as an untracked file, so `pack.mjs` saw a dirty tree. Steps 3–6 passed. | [final/static-final-run1.log](final/static-final-run1.log) |
| **Final, static checks, run 2** | The link excluded locally (`.git/info/exclude`, not committed). git status clean. | **Passed every step:**<ul><li>no runtime file differs from `7097ac2`;</li><li>a repack of this commit has the 144 pinned files, digest `fe6d74f8…`, identical to `pins/release-7097ac2.inventory.sha256`;</li><li>the three scripts and `cgn-receive` are byte for byte the round-5 files;</li><li>eslint and shell syntax pass;</li><li>30 relative links, none missing;</li><li>the secret scan finds only the expected throwaway-code writers.</li></ul> | [final/static-final.log](final/static-final.log) |

**Two findings from these runs changed the W1 steps:**
- `cgn-authorize` must run before any restart or redeploy;
- `forgery` must come after `boundary` and `reconnect`.

**One edit to the logs and evidence files:** my local scratch path is replaced with `<scratch>`. Nothing else was changed. The throwaway codes of the final runs appear in none of these files (checked).

## To reproduce
1. In a folder outside the repository, put the four `harness/*.txt` files (dropping `.txt`) and the two local-CA Dockerfiles.
   - **Where TLS isn't inspected:** skip the CA images, and drop the two `--build-context` lines from `build.sh`.
2. Build the CA images from them.
3. Run `bash image-checks.sh <repo>/deploy/render <a 7097ac2 rebuild .tgz> <work dir>`. It tags the image `cgn-render:check`.
4. Then, from the repository root (after `npm ci`), run `bash scripts/beta/w1-selftest.sh cgn-render:check <work dir>`.

It needs Docker with BuildKit, Node 22, `age` and `age-keygen`, `openssl`, `curl`, and ports 18080, 18443 and 18480 on 127.0.0.1.

## What this does not prove
- **Render.** None of these is known until W1 Step 0 and the checks there:
  - whether its disk mount is writable by uid 10001;
  - its real `X-Forwarded-For` chain (the proxy count);
  - its `http` → `https` redirect and maintenance page;
  - its SSH user and environment;
  - its build host's architecture (the age pin assumes `amd64`, and fails closed otherwise);
  - its Docker Hub pulls.
- **The audited archive itself:** the image was built from a rebuild with the same inventory. The production pin, `a693c543…`, is verified only by the real build.
- **Real devices and networks** (W3, W8), backups off Render (W5), restore (W6) and rollback (W7).
