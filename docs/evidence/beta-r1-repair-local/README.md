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
