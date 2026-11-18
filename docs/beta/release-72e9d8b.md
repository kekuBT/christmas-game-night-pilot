# Release record: `72e9d8b`, the newer release of the W7 pair (B-W7-01)

**Status: the independently audited archive for B-W7-01's forward deploy, selected in handoff [6966073894](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6966073894). Its metadata is now complete, and B-W7-01's local engineering proof has PASSED (review [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883)).**
- **Not done:** nothing is promoted, merged or deployed. The canonical deploy context (`deploy/render`) still pins `7097ac2`.
- **The forward change and its revert** are reviewed patches in [pins-72e9d8b/](pins-72e9d8b/README.md). Their exact positive gates passed on the retained archives (6966711883). **They are not applied:** they are preparation only, until the owner-approved forward deploy.
- **The rollback target is unchanged:** the audited `7097ac2`, archive `a693c543…3a5131` ([release-7097ac2.md](release-7097ac2.md)).
- **What is still NOT RUN:** hosted W7 and native W8. Both are owner execution-gated.
- **The history:**
  - the developer gate and package: handoffs [6963579755](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6963579755) and [6964628237](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6964628237), report 6964671513;
  - the independent audit: review [6966023566](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6966023566);
  - the pair's review, the exact-archive checks and this metadata: review [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883).
- **It supersedes** the developer draft `docs/evidence/beta-r4-w7/release-72e9d8b/package/release-72e9d8b-DRAFT.md`. That draft is kept unchanged as evidence, and it describes the developer archive, not this one.

## The audited archive (the pin)
| Field | Value |
|---|---|
| **Runtime revision** | `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`, the reviewed uncertain-delivery repair |
| **The audited archive** | ChatGPT's own build of the exact detached `72e9d8b` under Node v22.16.0, **kept privately** in the existing private review Codespace at `/workspaces/mchezo-release-pair.KhhWQA/cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.tgz`. In the deploy context it is `artifact/mchezo-72e9d8b.tgz`. |
| **Its SHA-256** | **`aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6`** |
| **Its inventory digest** (every file but `release.json`) | **`4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef`**, 144 files. The committed [release-72e9d8b.inventory.sha256](release-72e9d8b.inventory.sha256) is that list. The review matched the archive against it byte for byte. |
| **Its `release.json`** | `revision` `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`; **`builtAt` `2026-11-18T01:07:42.001Z`**; `node` `v22.16.0` |
| **Its size and entries** | **1,188,930 bytes; 163 entries:** 145 regular files and 18 folders. The 145 files include `release.json`, which the 144-file inventory leaves out. |

**Where the metadata comes from:**
- **ChatGPT read it from the selected `aac13a8a…` bytes** and reported it in review [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883):
  ```
  {"revision":"72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d","builtAt":"2026-11-18T01:07:42.001Z","node":"v22.16.0","archive_sha256":"aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6","bytes":1188930,"entries":163,"regular_files":145,"directories":18}
  ```
- **Nothing was rebuilt, and no identity was substituted.** This session never had the bytes.
- **History:** at `b041bf4` (handoff 6966073894) these fields were marked pending, because this session couldn't reach the bytes and 6966023566 didn't quote them. Nothing was copied from another build to fill them.

**Provenance** (review 6966023566):
- **The build:** ChatGPT built the exact detached `72e9d8b` on Node v22.16.0 in the existing private Codespace, and kept the archive there.
- **The streaming inspection:** the metadata; unique, safe paths; regular files only; and a byte-for-byte match to the published 144-file inventory.
- **The browser check:** Firefox ESR showed the full `72e9d8b` revision and `ok:true` over private loopback HTTPS, with the disposable CA.
- **This session:** I didn't read, copy or receive these bytes.

## Not the pin: the other packages of the same files
Different `builtAt` values and tar metadata give different archive hashes for an identical runtime inventory. **Each archive is identified by its own SHA-256, and these identities are never combined.**

| Package | SHA-256 | What it is |
|---|---|---|
| The developer build | `f3bd00ea2f2c17e1f84e0b413822f5cd181247774f9872923860c1120f4d72ca` | Claude's R2 pack (Node v22.16.0, `builtAt` `2026-11-17T23:54:58.655Z`), in [docs/evidence/beta-r4-w7/release-72e9d8b/](../evidence/beta-r4-w7/release-72e9d8b/README.md). A developer reference only. **The proposed pin refuses it** (the gate check G1 in [the pair's evidence](../evidence/beta-r4-w7/pins-72e9d8b/README.md)). |
| The reviewer build | `1ea26ba…` (the full value isn't recorded here) | A separately retained reviewer build, held by ChatGPT. |

All three have the inventory `4f58b323…`.

## The gate on that revision (developer-run, independently read)
| Field | Value |
|---|---|
| **Run** | `20261117-231232-72e9d8ba-471`, **PASSED (exit 0)**: 112/112; unit tests 2,085/2,085 |
| **The tree** | a fresh clone, detached at `72e9d8b`, clean |
| **The environment** | Node v22.23.4; chrome-headless-shell 153.0.8010.12 |
| **The raw evidence** | [docs/evidence/beta-r4-w7/release-72e9d8b/](../evidence/beta-r4-w7/release-72e9d8b/README.md) |
| **Its status** | **developer-run.** ChatGPT read the raw report and the focused logs in review 6966023566; it didn't rerun the gate. |

## What differs from `7097ac2`
- **The shipped sources:** three web-client files only (`apps/web/src/App.tsx`, `apps/web/src/components/intentRetry.ts`, `apps/web/src/ui/mchezo/lib/errors.ts`). There are no changes in `src/` (the server), `content/`, `package.json` or `package-lock.json`.
- **The inventory:** four lines differ from `fe6d74f8…`:
  - `./apps/web/dist/index.html` and `./apps/web/dist/sw.js`;
  - the two hashed bundles, renamed: `index-D9T9JWWD.js` → `index-5tPs9-TY.js`, and `index.es-mGdfCPi1.js` → `index.es-D1uRMQBM.js`.

  Every server, content and package file is identical.

## The independent checks, and what is still untested
**Review 6966023566 passed, privately and locally:**
- **The archive audit** above.
- **The exact-pair compatibility check,** on a received copy:
  - `72e9d8b` wrote synthetic state;
  - `cgn-backup` gave `BACKUP_OK`, and `cgn-receive` gave `RECEIPT_OK` on a copy in a separate receiving folder;
  - the exact `7097ac2` archive verified, restored, checked and served that copy;
  - the host and guest seats, the score ledger, the acknowledged answers and the approved Memory Book entry survived;
  - a replayed answer was saved once;
  - the exact `72e9d8b` archive read the data again after the return.

**Review [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883): the pair against the exact retained archives** (independent; in the existing private Codespace; the gate script run directly under Node v22.16.0, **not a Docker image build**):
- **The self-test:** on a clean detached clone of `b041bf4`, 29/29, exit 0, with the same patch hashes.
- **The exact gates:**
  - the forward context installed `aac13a8a…`: `ARTIFACT_GATE_OK`, then `INSTALLED_OK`;
  - the reverted context installed `a693c543…`: `ARTIFACT_GATE_OK`, then `INSTALLED_OK` for `7097ac2` / `fe6d74f8…`.
- **The focused compatibility check, on the gate-installed packages:**
  - the newer release wrote synthetic seats, a completed ledger, an approved linked memory and acknowledged answers;
  - a graceful stop, a backup, and a copied receipt;
  - the previous release verified, restored and served the copy. The seats were kept without a rejoin, and one deduplicated new action was saved;
  - the current release then served the state the previous one wrote;
  - the whole 16-event reference ledger was unchanged, with no score or finish event added;
  - a changed-ledger negative was refused.
  - **The receipt in this run was a same-Codespace local copy.** It is not W5's off-provider or owner-device evidence. The encrypted received-copy proof of 6966023566 is a separate result.
- **The private browser:** a cloud browser, then private noVNC, then Firefox ESR.
  - The forward gate's installed output served the full `72e9d8b` revision and `ok:true` over loopback HTTPS, with normal certificate checks and the CA trusted only in a disposable profile.
  - Beta entry succeeded, and the desktop and 320×480 home screens were usable.
  - The content sandbox and Seccomp-BPF were true, at effective level 6.
- **The raw verdict lines** (from the review):
  ```
  == 29 passed, 0 failed
  W7 PINS SELFTEST PASSED
  ARTIFACT_GATE_OK archive=aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6 revision=72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d inventory=4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef deps="ws@8.22.1 zod@3.25.76"
  INSTALLED_OK revision=72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d inventory=4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef deps="ws@8.22.1 zod@3.25.76" node=v22.16.0
  ARTIFACT_GATE_OK archive=a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131 revision=7097ac2bb062925bb296a129f4771f1e68fd522d inventory=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c deps="ws@8.22.1 zod@3.25.76"
  EXACT_ARCHIVE_FORWARD_REVERT_GATES_PASS
  LIVE returned OK (0 failed)
  PERSISTED OK (0 failed)
  ACTUAL_ARCHIVE_PAIR_COMPATIBILITY_PASSED
  AUDIT_CLEANUP_PASS
  ```
- **The private evidence** is kept in the Codespace at `/workspaces/pins51-audit.YoVYd2/evidence/`: `actual-gates.log`, `selftest.log` and its case logs, `gate-forward.log`, `gate-reverted.log`, `compat.log`, `browser-health.json`, `archive-metadata.json`, `cleanup.log` and `review-checkpoint.md`. It isn't in this repository.
- **A reviewer harness error, recorded by the reviewer:** a symlink alias made datatool's CLI entry guard a no-op. The reviewer corrected its own harness and reran on a fresh fixture. It is not a product finding.

**Accepted earlier on the identical runtime inventory** (6963579755), **reused and not rerun in 6966711883:** the full host, guest and TV observations, replay, the transitions and reconnection.

**How each result is attributed:**

| Result | Who ran it | Kind |
|---|---|---|
| Full gate `20261117-231232-72e9d8ba-471`, 112/112 | Claude | developer-run, read independently |
| The pins self-test 29/29 and gate check 13/13 at `b041bf4` | Claude | developer-run, local; its one positive gate run is a LOCAL SURROGATE |
| The archive audit and the received-copy compatibility (6966023566) | ChatGPT | independent, private, local |
| The pair review, the exact gates, the focused pair check and the browser check (6966711883) | ChatGPT | independent, private, local |
| Native iPhone Safari and Android Chrome | — | **NOT RUN** (W8) |
| Anything hosted | — | **NOT RUN**, owner-gated |

**Untested:**
- native iPhone Safari and Android Chrome (W8);
- every provider step: the forward deploy, hosted W7 and the one-click check.

## The forward change and its revert (reviewed, not applied)
[pins-72e9d8b/](pins-72e9d8b/README.md) holds the two patches against the exact baseline (the deploy context at `71d0200`), with their hashes, the allowlist, and how to verify them.
- **They were reviewed,** and checked against the exact retained archives in 6966711883.
- **Applying them** is the owner-approved forward deploy (W7's runbook and the readiness matrix's §3, step 8).
- **The forward patch** pins this archive.
- **The revert patch** restores the `7097ac2` context byte for byte.

## Verifying the audited archive (ChatGPT, where it is kept)
```
A=<the retained archive>
sha256sum "$A"                                   # aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6
tar -tzf "$A" | sort | uniq -d                   # no output: no duplicate entries
V=$(mktemp -d) && tar -xzf "$A" -C "$V" && cat "$V/release.json"
```
- **`release.json` must name** revision `72e9d8b…` (no `-dirty`), `builtAt` `2026-11-18T01:07:42.001Z`, and node `v22.16.0`.
```
(cd "$V" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > inventory.txt && sha256sum inventory.txt && diff inventory.txt docs/beta/release-72e9d8b.inventory.sha256
```
- **It must print** `4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef`, then no diff.
- **If the package folder is the archive's top level** rather than `-C <folder> .`, `cd` into that folder before listing, as in [release-7097ac2.md](release-7097ac2.md).

## If the audited archive is lost
The rule of [release-7097ac2.md](release-7097ac2.md) applies:
- **A rebuild is a different file,** with its own SHA-256 and `builtAt`. It is never written down as the audited archive.
- **Whether a rebuild with the same inventory is enough** is the owner's call.
- **A rebuild also needs a new forward patch,** because the pin is the archive's SHA-256. The proposed patch doesn't accept another build: that's the G1 check.
