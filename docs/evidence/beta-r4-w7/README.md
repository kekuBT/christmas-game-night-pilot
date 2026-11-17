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
