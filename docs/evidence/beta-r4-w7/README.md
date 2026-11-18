# Beta R4 W7: rollback, local preparation (handoff 6941129590)

**Preparation only.** The real W7 is **PENDING**. Nothing here ran on Render, over SSH, against production data, with the owner's keys, or as a provider-side rollback. The runbook is [render-w7.md](../../beta/render-w7.md).

**There is no audited predecessor artifact (B-W7-01).** `7097ac2` (archive `a693c543…`) is the first audited archive of this route. Everything below uses a clearly labelled **LOCAL SURROGATE** predecessor, which tests the protocol but **cannot pass the actual predecessor-artifact check**.

## The surrogate predecessor
| | |
|---|---|
| Revision | `f93e9cba8613859be9891706ead1c60157c73de2`: the commit before the R5 UI changes |
| Built by | [runners/build-predecessor.sh](runners/build-predecessor.sh), the R2 procedure: Node v22.16.0, `npm ci`, `pack.mjs` ([log](dev/predecessor-build.log)) |
| Archive | `e34c6c1cde04d022cff8b161a6edb4d89b298f2bd049e9b58961b2cddaf16210` (local; not committed, not published) |
| Inventory | 144 files, SHA-256 `338e693179d285033198369f133d285ac2438bf7a7f1cce4e118daf81ddfd1d3` |
| Against `7097ac2` | Only the web bundle differs: 5 of the 144 files, all under `apps/web/dist`. The server, the content and the packages are identical: `git diff f93e9cb 7097ac2 -- src package.json package-lock.json` is empty. So the data format is the same by construction. |
| Its image | Built by `scripts/beta/w7-artifact-check.sh`. The build context is `scripts/beta/w7-pred-context.sh`: the reviewed `deploy/render` with **only its artifact pins** changed, the model of a revert commit. It went through the **unchanged** gate (`ARTIFACT_GATE_OK revision=f93e9cb…`, `INSTALLED_OK`), and its guard scripts are byte for byte the reviewed ones. |

## The tools (new)
| File | What it does |
|---|---|
| `scripts/beta/w7-pred-context.sh` | The previous release's build context, as a revert commit makes it. The substitutions are exact and counted, the guard scripts are checked unchanged, and the diff is printed. |
| `scripts/beta/w7-artifact-check.sh` | **A1:** the predecessor through the same gate, with its `release.json` and guard scripts checked. **A2–A4:** the gate refuses a wrong artifact: the current archive under the previous name; the previous context with its archive pin pointed at the current archive (refused on the inventory); and the canonical context given the previous archive. |
| `scripts/beta/w7-rehearsal.sh` | The rollback rehearsal: three windows, COMPAT, and the denials D1, D2, D4, D5 and D6, S1–S5 and F (see [render-w7.md](../../beta/render-w7.md#the-local-rehearsal-preparation-only)). |
| `scripts/beta/w7-check.mjs` | Its checks: the reference ledger at a stop; the live checks through the gate (seats, entry, answers, completed ledger, the new action); the persisted state, with its own negative controls. |
| `scripts/beta/w7-selftest.sh` | T0 static; T1 a port in use; T2 the rehearsal; T3 an unlistable inventory; T4 an interruption. Sentinels of another owner are checked after every case. |
| [runners/w7-static.sh](runners/w7-static.sh), [runners/w7-final.sh](runners/w7-final.sh) | The static checks, and the final on one clean checkout. |

Reused unchanged: `scripts/beta/w5-seed.mjs`, `w6-check.mjs fingerprint`, `render-like-proxy.mjs`, `deploy/render/operator/cgn-receive.sh`, and every `deploy/render` file.

## Development runs (on the uncommitted candidate, the images `cgn-render:check` and `cgn-render:w7-pred`)
| Log | Run | Verdict |
|---|---|---|
| [artifact-dev1.log](dev/artifact-dev1.log) | 07:22Z | **W7 ARTIFACT CHECK PASSED, 7/7** (LOCAL SURROGATE) |
| [rehearsal-dev1.log](dev/rehearsal-dev1.log) | `20261117T073050Z-f7382c08` | **W7 REHEARSAL PASSED, 46/46.** It printed "containers on the volume: 0" at D5a while it correctly refused (a missing newline in the count); fixed before the final. |
| [selftest-dev1.log](dev/selftest-dev1.log) | 07:32Z | **W7 SELFTEST PASSED, 13/13** |

## The final: one clean detached checkout of `988c53558bbbcc1545fe0ca32882f30c1970794b`, status 0 lines before and after, 07:37–07:42Z
Every run below is on that one revision, by [runners/w7-final.sh](runners/w7-final.sh) ([summary](final/summary.txt)). The images under test were built from that checkout:
- **current** `cgn-render:check` = `sha256:91b950e2ab69a333bbc5353d736505585c46f40b2cf6c9badda631f1a8a1edaf` (the local rebuild of `7097ac2` under a test pin, as in W4–W6);
- **previous** `cgn-render:w7-pred` = `sha256:d3b91ae7eec093c983be6dc68d4a648500ed1c089f6e09fbf686718c5e1720fa` (the LOCAL SURROGATE `f93e9cb`, through the same gate).

| Step | Log | Run | Verdict |
|---|---|---|---|
| 1 | [1-static.log](final/1-static.log) | 2 s | **W7 STATIC CHECKS PASSED, 10/10.** Scope since `d2b1242`: `docs/` and `scripts/beta/w7-*` only; `deploy/`, the runtime and the other scripts unchanged; the canonical pins; eslint; syntax; links; secret scan. |
| 2 | [2-image-checks.log](final/2-image-checks.log) | 68 s | **IMAGE CHECKS PASSED, 30/30** (the current image) |
| 3 | [3-artifact-check.log](final/3-artifact-check.log) | 8 s | **W7 ARTIFACT CHECK PASSED, 7/7** (LOCAL SURROGATE: the protocol only). A1 `ARTIFACT_GATE_OK revision=f93e9cb…` and `INSTALLED_OK`. A2–A4: `ARTIFACT_GATE_FAILED` on the archive's SHA-256, then on the inventory, then on the archive's SHA-256. |
| 4 | [4-w7-selftest.log](final/4-w7-selftest.log) | tag `599189`, 78 s | **W7 SELFTEST PASSED, 13/13.** The rehearsal [`20261117T073823Z-90aed9d8`](final/w7-T2-rehearsal.log) passed **46/46**; its kept evidence is in [T2-evidence/](final/T2-evidence/). |
| 5 | [5-guard-selftest.log](final/5-guard-selftest.log) | `20261117T073938Z-21cd3e46`, 53 s | **W6 GUARD SELFTEST PASSED, 37/37** |
| 6 | [6-hold-selftest.log](final/6-hold-selftest.log) | `20261117T074031Z-88cf3b13`, 19 s | **W6 HOLD SELFTEST PASSED, 12/12** |
| 7 | [7-w6-selftest.log](final/7-w6-selftest.log) | tag `e127fc`, 57 s | **W6 SELFTEST PASSED, 13/13** (its rehearsal 46/46) |
| 8 | [8-w5-selftest.log](final/8-w5-selftest.log) | tag `034b82`, 35 s | **W5 SELFTEST PASSED, 12/12** (its rehearsal 33/33) |

**From the rehearsal's raw log:**
- **D5a:** the start gate counted 1 container on the volume and refused. **D5b:** the data lock refused the second server (`Another process is using this data directory`, exit 2), and the current writer kept serving.
- **D4:** the probe said `UP f93e9cb…` where `7097ac2…` was expected, so the gate refused. The reopen gate then passed on `f93e9cb`.
- **S1–S5:** each exited 78 with its `REFUSED` line. The record was byte-identical, the folder's files unchanged, and the public side stayed 503.
- **F:** exit 137. The start reached only the guard's APPROVED line, killed before the restore. The recovery is an ordinary start on `7097ac2`.
- **Leak scan:** 0 files hold a code (current or old), a token, a gate cookie or an age secret key.
