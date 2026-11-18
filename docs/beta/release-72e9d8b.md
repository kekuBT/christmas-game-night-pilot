# Release record: `72e9d8b`, the newer release of the W7 pair (B-W7-01)

**Status: the independently audited archive for B-W7-01's forward deploy, selected in handoff [6966073894](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6966073894).**
- **Not done:** nothing is promoted, merged or deployed. The canonical deploy context (`deploy/render`) still pins `7097ac2`.
- **The forward change and its revert** are proposed as reviewable patches in [pins-72e9d8b/](pins-72e9d8b/README.md). Nothing applies them yet.
- **The rollback target is unchanged:** the audited `7097ac2`, archive `a693c543…3a5131` ([release-7097ac2.md](release-7097ac2.md)).
- **B-W7-01 stays OPEN** until the pair is reviewed and ChatGPT's focused actual-pair checks are done. Hosted W7 is pending.
- **The history:**
  - the developer gate and package: handoffs [6963579755](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6963579755) and [6964628237](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6964628237), report 6964671513;
  - the independent audit: review [6966023566](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6966023566).
- **It supersedes** the developer draft `docs/evidence/beta-r4-w7/release-72e9d8b/package/release-72e9d8b-DRAFT.md`. That draft is kept unchanged as evidence, and it describes the developer archive, not this one.

## The audited archive (the pin)
| Field | Value |
|---|---|
| **Runtime revision** | `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`, the reviewed uncertain-delivery repair |
| **The audited archive** | ChatGPT's own build of the exact detached `72e9d8b` under Node v22.16.0, **kept privately** in the existing private review Codespace. Its path there isn't recorded here. In the deploy context it is `artifact/mchezo-72e9d8b.tgz`. |
| **Its SHA-256** | **`aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6`** |
| **Its inventory digest** (every file but `release.json`) | **`4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef`**, 144 files. The committed [release-72e9d8b.inventory.sha256](release-72e9d8b.inventory.sha256) is that list. The review matched the archive against it byte for byte. |
| **Its `release.json`** | `revision` `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`; `node` `v22.16.0`. **`builtAt`: PENDING ChatGPT verification.** |
| **Its other package metadata** (file size, tar entry count) | **PENDING ChatGPT verification.** |

**Why some fields are pending:**
- **This session can't reach the archive.** It is in ChatGPT's Codespace, and its bytes stay there.
- **Review 6966023566 doesn't quote `builtAt`.** It confirms the metadata, the revision and Node v22.16.0.
- **Nothing was copied from another build.** Another archive's `builtAt` would be another archive's identity.
- **Nothing was rebuilt or repackaged** to fill the gap, as the handoff asks.

**ChatGPT owns** reading these fields from the exact retained bytes, and the positive check of that archive.

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

## The independent checks (review 6966023566), and what is still untested
**Passed, privately and locally:**
- **The archive audit** above.
- **The exact-pair compatibility check,** on a received copy:
  - `72e9d8b` wrote synthetic state;
  - `cgn-backup` gave `BACKUP_OK`, and `cgn-receive` gave `RECEIPT_OK` on a copy in a separate receiving folder;
  - the exact `7097ac2` archive verified, restored, checked and served that copy;
  - the host and guest seats, the score ledger, the acknowledged answers and the approved Memory Book entry survived;
  - a replayed answer was saved once;
  - the exact `72e9d8b` archive read the data again after the return.

**Accepted earlier on the identical runtime inventory** (6963579755): the full host, guest and TV observations, replay, the transition and reconnection.

**Untested:**
- native iPhone Safari and Android Chrome (W8);
- every provider step: the forward deploy, hosted W7 and the one-click check.

## The forward change and its revert (proposed, not applied)
[pins-72e9d8b/](pins-72e9d8b/README.md) holds the two patches against the exact baseline (the deploy context at `71d0200`), with their hashes, the allowlist, and how to verify them.
- **The forward patch** pins this archive.
- **The revert patch** restores the `7097ac2` context byte for byte.

## Verifying the audited archive (ChatGPT, where it is kept)
```
A=<the retained archive>
sha256sum "$A"                                   # aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6
tar -tzf "$A" | sort | uniq -d                   # no output: no duplicate entries
V=$(mktemp -d) && tar -xzf "$A" -C "$V" && cat "$V/release.json"
```
- **`release.json` must name** revision `72e9d8b…` (no `-dirty`) and node `v22.16.0`. **Record its `builtAt` in this file:** it is the pending field.
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
