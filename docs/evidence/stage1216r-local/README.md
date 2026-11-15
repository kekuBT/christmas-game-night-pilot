# Stage 12.16-R: local runs (every run, failures included)

**What these are:** local runs during the repair, before the gates. They are not gate verdicts; the gates are in `docs/evidence/gate-runs/` and listed at the end.

## R1: a raw pack label approved a Split Clues puzzle

| File | Revision | Result | What it shows |
|---|---|---|---|
| `r1-repro-pack-status.mts.txt`, `r1-repro-pack-status-a1032ad.out.txt` | `a1032ad`'s tree (before the repair) | gap confirmed | In a temporary copy of `content/` with no `approvals.json`, `sc-001` labelled `approved`, `sc-002` `legacy` and `sc-003` `verified-computed` were each `officialEligible = true` with no approval record. `sc-004` (`provisional`) was not. |
| `r1-tests-before-fix.log` | the new tests on the unrepaired loader | **6 FAIL**, 26 pass | Each raw label (no file, no record, a stale record): 3 failures. Six records, then one invalidated with raw `approved` on all six (the review's stale case). Revocation between the briefing and play with a raw `approved` left in the pack. The test mode with a raw label. The two that passed (rejected with a matching record; Practice with a raw label and other games' legacy and computed rules) pin behaviour that was already right. |
| `r1-tests-after-fix.log` | `06bebdc` | 32/32 | |
| `content-check.txt` | `06bebdc` | CONTENT OK | The shipped content has no raw-label problem (every Split Clues puzzle is `provisional`). |

## R2: temporary trees and servers

| File | Revision | Result | What it shows |
|---|---|---|---|
| `r2-unit-leak-before.txt` | the test file before the cleanup | **42 leaked** | One run of `tests/stage1216-split-clues-content.test.ts` left 42 `mz-s1216-*` content trees in `/tmp`. |
| `r2-unit-leak-after.txt` | with `afterEach`/`afterAll` cleanup | 0 leaked | |
| `r2-old-driver-injected.log`, `r2-old-driver-injected.summary.txt` | a scratch copy of the pre-repair driver (`20cf06d`) with a thrown error after server A's room is open (the copy was deleted afterwards) | **leaked** | Exit 1, but server A **still running** and its data directory **left on disk**. I stopped and removed them by hand (this session's own). |
| `r2-driver-inject-server-start.log` | `06bebdc` + `MCHEZO_S1216_INJECT_FAIL=server-start` | exit 1, nothing left | Server A was given a setting `serve.ts` refuses, so it exited before listening ("MCHEZO_LIFECYCLE_SCALE must be a positive number"). The driver reports the failure, prints the server's output, and leaves no process or directory. |
| `r2-driver-inject-after-A-start.log` | `06bebdc` + `MCHEZO_S1216_INJECT_FAIL=after-A-start` | exit 1, nothing left | A thrown error while A's room and browser contexts are open: the server is stopped (its exit awaited), then its data is deleted. |
| `r2-driver-success.log` | `06bebdc`, ordinary run | 30/0, exit 0, nothing left | "cleanup: 2 server(s) stopped, 3 temporary dir(s) removed; still running: none; left on disk: none". |

`verify-cleanup.sh.txt` ran each driver run and counted this driver's directories (`/tmp/mz-s1216-A-*`, `-B-*`, `-fixture-*`) and processes (those whose `MCHEZO_DATA_DIR` is one of them) before and after. Before these runs I removed 465 leftover `/tmp/mz-s1216-*` directories, which my own earlier test runs and gate clones had left.

## Gates (one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-141525-06bebdc3-4879` | `06bebdc` | targeted (split-clues-content, split-clues, official-practice, content-variety, themes-seasonal, lobby-mode, cup-team-games) | PASSED (exit 0) | 9/9; split-clues-content 30/0, with its cleanup line "still running: none; left on disk: none" | 3 min 32 s |
| `20261115-141904-06bebdc3-6995` | `06bebdc` | fast | PASSED (exit 0) | 5/5; unit 1998/1998 | 1 min 20 s |

- **No full gate.** The only shared-code change is the loader's and `officialEligible`'s new rule, and it applies to `split-clues` alone (`RECORD_ONLY_APPROVAL`). Other games' content behaviour is covered by the whole unit suite (in the fast gate) and by the content-variety, official-practice and themes-seasonal drivers above. The driver change is in `check-split-clues-content` only.
- **Screenshots:** `docs/stage12/stage1216-screenshots/` now come from `check-split-clues-content` in `20261115-141525-06bebdc3-4879` (Chromium emulation, not real devices). The UI didn't change in this repair.
