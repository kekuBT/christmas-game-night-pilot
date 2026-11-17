# Beta R4: the integrated stack (#47 + #46), one clean candidate

Handoff 6936988676 (on #47) asked for one candidate that carries both reviewed branches. It authorized an ordinary branch merge: no rebase, no force-push and no GitHub PR merge. #47 stays a draft and unmerged.

**Scope.** Only the already-reviewed W4 tooling fixes are brought into #47. There are no new runtime features, no deployment configuration changes, no release re-pin and no W5 advancement. The release pin stays `7097ac2`. The exact-pin W4 live audit (restart, replacement, Memory Book) stays **OPEN**, and ChatGPT owns it.

## Ancestry

| Role | Commit | Reviewed as |
| --- | --- | --- |
| #47 head (first parent) | `e577579cae3003bfbce93dea607190e901f0a9fb` | tested `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d` (report 6936977433), cleared in 6936988676. `72e9d8b..e577579` is documentation and evidence only. |
| #46 head (second parent) | `e6cbe110af673b32d5dbbc245988b3f7a853a251` | tested `3eb05bc00c282455fb365857024424b7b7e986ee` (report 6936778015), tooling verified in 6936797118. `3eb05bc..e6cbe11` is documentation and evidence only. |
| merge base | `8101c5cb8a493aefc93f1edbf6cdb9d8bc1c2dfe` | #47's effective base |
| merge commit | `d811ed9bf9a8036fb35a64def8765f24888afaa4` | `git merge --no-ff e6cbe11` on the #47 branch |
| candidate | the commit that adds this file | the merge plus this record and a PROGRESS entry; no code |

**The merge.** Exactly two files were changed by both branches, and both are documentation:

- **`docs/PROGRESS.md`** conflicted, because both branches appended a section. Both are kept unchanged, in this order:
  1. #46's continuation of its "W4 repair" section;
  2. #47's "uncertain delivery" section;
  3. #46's "W4 follow-up" section.

  The check: every non-blank line of each parent is present, and no line is in neither. The count is 3,209 (base) + 23 (#47) + 14 (#46) = 3,246.
- **`docs/beta/render-w4.md`** merged automatically. The result is the base, plus #47's one added line (the pointer to the repair candidate), plus #46's follow-up wording.

No code file was changed by both branches, so the merge involved no semantic choice.

## What the candidate must show (acceptance 1–2)

- The runtime (`apps/`, `src/`) is identical to the reviewed `72e9d8b`. So are the tests, the package manifests, the TypeScript configs, the gate and the browser drivers.
- The W4 tooling (`scripts/beta/`) is identical to the reviewed `e6cbe11`, which equals the tested `3eb05bc`.
- `deploy/` is identical to both parents. The release pin `7097ac2` is unchanged: the artifact gate's `REVISION` and the W4 harness's `PIN`.
- Compared with `72e9d8b`, the only other changes are documentation and `scripts/beta/w4-*`. Compared with `e6cbe11`, they are #47's client fix (3 files under `apps/web/src`), its tests (2 files), its driver (`scripts/check-uncertain-delivery.mjs`) and documentation.
- There are no secrets in the changes, and the private constraints hold: nothing hosted, nothing public, no account touched.

## Focused validation (acceptance 3), one clean checkout of the candidate, one step at a time

1. The static and integration checks for the points above, with the raw output kept.
2. The W4 control mocks: K0 (`scripts/beta/w4-control-selftest.sh`, every fault case fails closed against a mock docker) and K0M (the same tests against a copy with the reviewed defects put back must FAIL). Both run from the candidate's own `scripts/beta/w4-selftest.sh` lines. No real container is started.
3. `node scripts/gate.mjs fast`: typecheck, lint, build and the unit tests.
4. `node scripts/gate.mjs targeted uncertain-delivery action-ack errors`, run after the fast gate, never at the same time.

No full historical gate is planned. The delta is tooling and documentation, and both sides were already gated on their own reviewed SHAs. Earlier runs (on `72e9d8b`, `3eb05bc` and older) are **not** tests of this candidate. The results are recorded below, with the run IDs and exits, in the evidence commit that follows the candidate.

## Results

**The tested candidate: `0c42ed6564c1f920653e82233d828102d8091269`.** It was pushed before testing. Every step ran on one clean detached checkout of it, with `git status --porcelain` at 0 lines before and after. Its `node_modules` came from a symlink to the #47 worktree. The steps ran one after another: each started only after the previous one had exited. No other gate or unit run was active.

| # | Step | Run | Verdict | What it showed | Raw evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Integration checks (`runners/int-checks.sh`) | 03:47Z | **INTEGRATION CHECKS PASSED (exit 0)**, 25 PASS, 0 FAIL | <ul><li>**Ancestry:** the candidate's parent is the merge; its parents are `e577579` then `e6cbe11`; the base is `8101c5c`; both tested SHAs are ancestors.</li><li>**Tested→head:** `72e9d8b..e577579` and `3eb05bc..e6cbe11` touch only `docs/`.</li><li>**Identical to `72e9d8b`:** `apps/`, `src/`, `tests/`, the package manifests, the TypeScript configs and `scripts/` outside `scripts/beta`.</li><li>**`scripts/beta/`:** identical to `e6cbe11` and to `3eb05bc`.</li><li>**`deploy/`:** identical to both heads and to `2e2257c`; `REVISION` and `PIN` are `7097ac2…`.</li><li>**The whole tree:** compared with `72e9d8b`, only `docs/` and `scripts/beta/w4-*` differ. Compared with `e6cbe11`, only `docs/`, the 3 client files, the 2 test files and the driver.</li><li>**Static:** `eslint scripts/beta` exit 0; `bash -n` passes on 8 files; 62 relative links, 0 missing; no secret-shaped string in the added lines.</li></ul> | [final/int-checks.log](final/int-checks.log) |
| 2 | W4 control mocks: K0 and K0M (`runners/int-w4-mocks.sh`, running the candidate's own `w4-selftest.sh` lines 41–44 and 47–72) | tag `78ee00`, 03:48Z | **W4 CONTROL MOCKS PASSED (exit 0)**, 7 passed, 0 failed | <ul><li>**K0:** 88/88 fault cases fail closed (`W4 CONTROL SELFTEST PASSED`).</li><li>**K0M:** the 6 weakened lines were put back, and the tests FAIL as required, with 18 failures: forced exit, OOM, still running, both baseline cases, each ignored removal, and both unlistable inventories.</li><li>**Same as reviewed:** these match #46's reviewed final on `3eb05bc` (K0 88/88; K0M 18 required failures).</li><li>**Docker:** none was used (the daemon wasn't even running), and 0 containers and 0 volumes were left.</li></ul> | [final/w4-mocks.log](final/w4-mocks.log), [final/w4-mocks-K0.log](final/w4-mocks-K0.log), [final/w4-mocks-K0M.log](final/w4-mocks-K0M.log) |
| 3 | `node scripts/gate.mjs fast` | `20261117-034840-0c42ed65-8445` | **PASSED (exit 0)**, 5/5 | typecheck (server and web), lint, build, **unit tests: 163 files, 2,085 tests passed**. Wall time 1 min 11 s. | [final/gate-fast.log](final/gate-fast.log), [final/unit-tests.log](final/unit-tests.log) |
| 4 | `node scripts/gate.mjs targeted uncertain-delivery action-ack errors` (started after step 3 exited) | `20261117-034958-0c42ed65-12859` | **PASSED (exit 0)**, 5/5 | build, browser preflight, then three drivers:<ul><li>**`check-uncertain-delivery`:** 81 PASS, 0 FAIL ("UNCERTAIN DELIVERY ALL PASSED"), covering cases A–E and E-committed.</li><li>**`check-action-ack`:** 52 PASS, 0 FAIL.</li><li>**`check-errors`:** 5 PASS, 0 FAIL.</li></ul>Wall time 37 s. Chromium (chrome-headless-shell 153). | [final/gate-targeted.log](final/gate-targeted.log), [final/check-uncertain-delivery.log](final/check-uncertain-delivery.log), [final/check-action-ack.log](final/check-action-ack.log), [final/check-errors.log](final/check-errors.log), [final/screens/](final/screens/) |

**No failed run.** Every run on the candidate is listed above, and each passed the first time.

**The logs:** ANSI codes are stripped and the scratch path is shown as `<scratch>`. Nothing else was edited.

**The screenshots** (390 px, from step 4) show what the client fix renders on the integrated build:
- `a-502-couldnt-confirm-390.png`;
- `b-502-committed-went-through-390.png`;
- `e-502-gateway-json-couldnt-confirm-390.png`.

## Limitations

- **This is focused validation, not a full gate.** The last full gate of this client fix ran on `f4c558f`, and of the W4 tooling on its own SHAs. Neither is a test of this candidate. The decision was the handoff's: the delta is tooling and documentation.
- **The W4 check here is the mock layer only (K0, K0M).** No real-Docker case (K1–K8) and no rehearsal of the pinned image ran on this candidate. The W4 tooling is byte-identical to the reviewed `3eb05bc`, whose full `w4-selftest.sh` (81/81) is the evidence for those, and is attributed there.
- **The browser drivers are Chromium simulations,** on a developer machine against a local server. This is not Safari, not Android, not Render, and not the release pin `7097ac2`'s package.
- **The exact-pin W4 live audit stays OPEN,** owned by ChatGPT. Nothing here clears it. There was no deployment, no W5 work and no account operation.
