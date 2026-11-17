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

(Recorded in the evidence commit after the candidate.)
