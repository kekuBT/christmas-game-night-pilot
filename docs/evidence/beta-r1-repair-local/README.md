# Beta R1-R: local runs (every run, failures included)

**What these are:** local runs while repairing review 6900450343 (R1, R2) on #43. They are not gate verdicts; the gates are listed at the end. Scripts are saved as `.txt` so nothing here runs by accident. Paths under `/tmp` are throwaway folders.

## R1: one process per data directory

| File | Revision | Result | What it shows |
|---|---|---|---|
| `repro-lock-interleave.mts.txt`, `repro-lock-interleave-92a3722.out.txt` | `92a3722` (the reviewed code) | **BOTH A AND B HOLD** | The review's interleaving, step by step. A has created `server.lock` exclusively but not yet written its pid. B's `acquire()` reads the empty file as stale, deletes it and takes the lock. A then writes its pid into the deleted file and believes it holds the folder. |
| `repro-lock-interleave-repaired.mts.txt`, `-repaired-tree.out.txt`, `-repaired-script-on-92a3722.out.txt` | repaired tree; `92a3722` | only A holds it; **on `92a3722` both hold** | The same moment, replayed through the real lock: A holds the folder and its record is empty. On the repaired tree, B is refused ("Another process is using this data directory"). On `92a3722`, B takes it. |
| `repro-lock-race.mjs.txt`, `lock-child.mts.txt`, `repro-lock-race-92a3722.out.txt` | `92a3722` | **15/15 and 7/15 rounds with more than one holder** | Eight processes take the lock at the same moment, 15 rounds per case, with no artificial pause. A new folder gave 2 or 3 holders at once in every round. A folder with a crash's stale lock gave 2 to 5 holders in 7 of 15 rounds. |
| `repro-lock-race-repaired-tree.out.txt` | repaired tree | 0/15 and 0/15 | The same harness: exactly one holder in all 30 rounds. |
| `lock-tests-on-92a3722.log` | `92a3722` + the new test file | **5 FAIL, 2 pass** | `tests/beta-r1r-lock.test.ts` on the unrepaired code.<br>• **The bug itself:** the two race tests fail ([2, 2, 6] and [3, 3, 5], against [1, 1, 7]).<br>• **Unrelated failures:** three fail because the API they call or the message they expect didn't exist yet (no `check`, a different holder message, a different stale-lock note).<br>• **The two passes:** the four-real-servers test passed, because tsx's start-up spreads real servers out enough to miss the window, which is why the race tests use a handshake. The SIGTERM test passed too. |

## R2: restore under the service user

| File | Revision | Result | What it shows |
|---|---|---|---|
| `repro-backup-owner.sh.txt`, `repro-backup-owner-92a3722.out.txt` | `92a3722` | **copies owned by `nobody`** | **B-12, found by step U:** as root, with data files owned by uid 65534, the backup and the restored copies kept uid 65534 (`copyFileSync` copies the owner). |
| `repro-backup-owner-repaired-tree.out.txt` | repaired tree | copies owned by root | The tool writes its own copies; they belong to whoever runs it. |
| `release-check-local-run1.log` | uncommitted repaired tree (`-dirty`) | **FAILED (5)** | The first run of the new step U. The drill itself was wrong in one place: a Memory Book note needs a finished game to cite, so the note was refused (400). That FAIL and the three that depend on the book (backup, check and load counts) follow from it. The fifth is the backup privacy check (B-12, then unexplained). Every other check, including the R1 race and the service user refusals, passed. |
| `release-check-local-run2.log` | same | **FAILED (1)** | Step U now plays a Math Mayhem game, and the note cites it. Only "the backup is private" fails. |
| `release-check-local-run3.log` | same | **FAILED (1)** | The same check, now printing what it saw: the backup's data files were owned by the service user (uid 996), which found B-12. |
| `release-check-local-run4.log` | same, with the B-12 fix | **PASSED (59)** | Every step, including U, with the two local users removed afterwards. |
| `beta-tests-repaired-tree.log` | repaired tree | 4 files, 39/39 | `tests/beta-r1.test.ts`, `beta-r1-data.test.ts`, `beta-r1r-lock.test.ts`, `beta-r1r-restore.test.ts`. |

## The packaged release drill

| File | Revisions | Result | What it shows |
|---|---|---|---|
| `release-drill-run5.log` (script: `docs/evidence/beta-r1-local/release-drill.mjs.txt`, unchanged) | PREV `92a3722`, NEW `23abfbc` | **RELEASE DRILL PASSED (14)** | Both packed from clean checkouts and installed with `npm ci --omit=dev`. PREV live; stop; NEW's tool backs up; switch `current` to NEW; the room restored and played into; roll back to PREV, which reads what NEW wrote; the pre-deploy backup restored into a new folder and served. `92a3722` stands in for "the previous release": `1955c28` has no `pack.mjs`, and nothing has been deployed. |

## Gates (one run on one revision each, all on `23abfbc`)

| Run | Kind | Verdict | What ran |
|---|---|---|---|
| `20261115-202859-23abfbc4-28428` | targeted | **PASSED (exit 0)**, 8/8 steps, 51 s | build-web, preflight, `check-release-package` (59 checks, step U included; both local users removed), `check-beta-gate`, `check-one-path`, `check-lobby-mode`, `check-readiness`, `check-official-practice` |
| `20261115-202956-23abfbc4-30041` | fast | **PASSED (exit 0)**, 78 s | typecheck, lint, the web build and every unit test: 160 files, 2037/2037 |
| `20261115-203120-23abfbc4-2269` | full | **PASSED (exit 0)**, 109/109 steps, 40 m 59 s | every step and every browser driver, unit 2037/2037, `check-release-package` passed again (step U: 20 checks) |

- **No other gate ran on `23abfbc`,** and none failed or was stopped.
- **Nothing overlapped them:** the gates ran one after another, and no other test, driver or drill ran while they did (the release drill finished before the first gate started).
- **Logs and summaries:** `docs/evidence/gate-runs/<run id>/`.

## Second round: R3 and R4 (review 6901841738), in `round2/`

### R3: the lock race test's child protocol
| File | Revision | Result | What it shows |
|---|---|---|---|
| `r3-before-run1..10.log`, `r3-before-runs-summary.txt` | `1da3b25` (`23abfbc`'s code) | 10/10 exit 0, no EPIPE | **The reviewer's failure didn't reproduce here** in 10 runs of the three focused files (Node 22.23). The reviewer saw two uncaught `write EPIPE` errors on Node 22.16. It is a timing window, below. |
| `repro-epipe.mts.txt`, `repro-epipe-23abfbc.out.txt` | `1da3b25`'s fixture and helper logic | **`blocked`: UNCAUGHT EPIPE (exit 3)**; `processed`: no error | The window, made deterministic with the real fixture.<br>• **`blocked`:** a refused contender exits right after REFUSED. If END is written after it exited but before the parent processed the exit, the write hits a closed pipe and nothing handles the error.<br>• **`processed`:** once the exit is processed, Node has destroyed the stream and the write is dropped silently. That is why it is intermittent. |
| `r3-after-run1..20.log`, `r3-after-runs-summary.txt` | the repaired tree | **20/20 exit 0**, 18/18 tests each, no EPIPE, no unhandled errors | The repaired protocol: END only to a confirmed live holder, and explicit failures. Each run covers 3 rounds of 8 starts on a new folder and 3 on a stale record, the maintenance, crash and SIGTERM cases, restore and the data tests. |
| `r3-mutation-refusal-exits-1.log`, `-crash-before-ready.log`, `-holder-exits-early.log` | the repaired tree with a fault injected into the fixture (restored after) | **each FAILED explicitly** (exit 1, no unhandled error) | The helper fails, never passes or crashes:<br>• "a contender exited abnormally";<br>• "a contender exited before READY";<br>• "an error on a contender's pipe" (`stdin: EPIPE write EPIPE`, now caught and reported). |

### R4: the gate through a configured production origin, over HTTPS
| File | Revision | Result | What it shows |
|---|---|---|---|
| `r4-check-https-run1.log` | uncommitted tree | FAILED (1) | The first run: `ERR_CONNECTION_RESET`. Chromium sent `beta.test` to this sandbox's outbound proxy (`https_proxy`). |
| `r4-check-https-run2.log` | same | FAILED (1) | With `--no-proxy-server`, the same failure: the flag didn't override the environment. |
| `r4-check-https-run3.log` | same | FAILED (1) | The browser's environment without proxy variables: H1 passed at 320 px. Then the wrong-code page wasn't the gate page (the check crashed reading it), which led to B-13. |
| `r4-origin-header-probe.out.txt` | (a probe page, no app code) | | Chromium over HTTPS, the Origin header received under each referrer policy. A form POST sends `"null"` under `no-referrer`, and the page's origin under `same-origin` or no policy. `fetch` and WebSocket always send the page's origin. |
| `r4-check-https-run4-before-fix.log` | uncommitted tree, before the B-13 fix | **FAILED (11)** | The reproduction: the code form posts `Origin: "null"` → 403 `FOREIGN_ORIGIN` for the wrong and the right code. No cookie, so no app, API or socket after "entry". |
| `r4-b13-tests-before-fix.log` | same | 1 FAIL, 1 pass | The B-13 header test fails (`no-referrer` on the gate page). The origin-unchanged test passes, as it must before and after. |
| `r4-beta-r1-tests-after-fix.log` | with the fix | 23/23 | `tests/beta-r1.test.ts`, B-02 included. |
| `r4-check-https-run5-after-fix.log` | with the fix | FAILED (6) | H1–H5 all pass. H6's WebSocket half failed because my `ws` client looked up `beta.test` in DNS. Its API and form halves already showed the right 403s. |
| `r4-check-https-run6-after-fix.log` | with the fix | **HTTPS BETA GATE PASSED (28)** | Everything, H6's handshakes included. |
| `r4-check-https-final-driver-on-1da3b25.log` | the final check against `1da3b25`'s packed release (no fix) | **FAILED (11)** | The same final check before the fix: B-13 as above. |
| `docs/beta/screenshots/beta-gate-https-wrong-code-390-before-b13.png` | before | | What a family member saw after typing a code: the JSON refusal. |
| `docs/beta/screenshots/beta-gate-https-{320,390,wrong-code-390,then-app-390}.png` | after | | The gate at 320 and 390 px over HTTPS, the wrong-code message, and the app after entry. |
