# DRAFT release record: `72e9d8b`, the newer release for B-W7-01 (handoff 6963579755)

**Status: DRAFT, not audited.**
- **What it is:** a developer build for ChatGPT's independent private archive audit.
- **What it is not:** the audited archive. Nothing is promoted, pinned, merged or deployed, and B-W7-01 stays OPEN until that audit.
- **The rollback target stays the audited `7097ac2`** (`a693c543…`, `docs/beta/release-7097ac2.md`).
- **Where this record lives:** it is staged privately outside the repository, and isn't committed (the handoff requested no push).

## The candidate
| Field | Value |
|---|---|
| **Runtime revision** | `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`, the reviewed uncertain-delivery repair |
| **Differences from `7097ac2` in the shipped sources** | `apps/web/src/App.tsx`, `apps/web/src/components/intentRetry.ts` and `apps/web/src/ui/mchezo/lib/errors.ts` (89 insertions, 3 deletions). There are none in `src/` (the server), `content/`, `package.json` or `package-lock.json`. |

## The full gate on that exact revision
| Field | Value |
|---|---|
| **Run** | `20261117-231232-72e9d8ba-471` |
| **Verdict** | **PASSED (exit 0)**: 112 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled, 0 not run |
| **Unit tests** | 2,085 / 2,085 (163 files) |
| **The tree** | a fresh clone, detached at `72e9d8b`, clean (`git.dirty` empty), fingerprint `56dc2266fa63` (653 files) |
| **The environment** | Node v22.23.4; chrome-headless-shell 153.0.8010.12 (`MCHEZO_CHROMIUM_PATH`); 3 workers on 4 CPUs |
| **Time** | wall 41m 39s, 2026-11-17 23:12:32–23:54:12 UTC |
| **The raw evidence** | `evidence/gate-run-20261117-231232-72e9d8ba-471/`: the report, the summary, the console, every step log and the screenshots |

## The developer archive (the R2 procedure, `docs/beta/beta-r1-release.md`, "Building the package")
| Field | Value |
|---|---|
| **File** | `cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.tgz`, 1,185,263 bytes |
| **Archive SHA-256** | **`f3bd00ea2f2c17e1f84e0b413822f5cd181247774f9872923860c1120f4d72ca`** |
| **Built** | 2026-11-17T23:54:58.655Z, from a second fresh, clean, detached clone of `72e9d8b` |
| **The tools** | Node **v22.16.0**, the official linux-x64 binary; `npm ci`; then `scripts/release/pack.mjs` |
| **The archive itself** | `tar -czf … -C <package> .`: 163 entries (145 files, 18 folders), with no duplicates, no absolute or `..` paths, and no `node_modules` |
| **`release.json`** | `{"revision": "72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d", "builtAt": "2026-11-17T23:54:58.655Z", "node": "v22.16.0"}`, with no `-dirty` |
| **Inventory** (every file but `release.json`) | **144 files, digest `4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef`** (`cgn-72e9d8b….inventory.sha256`). The extracted archive's own inventory is identical. |
| **Runtime packages** | `npm ci --omit=dev --ignore-scripts` installs `ws@8.22.1` and `zod@3.25.76` only |
| **Smoke test** (synthetic code, temp data, loopback, `NODE_ENV=production`) | `/health` = `{"ok":true,"revision":"72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d"}`; a gated API call without the code gets 401; the code appears in no log |

**Against the audited `7097ac2` inventory (`fe6d74f8…`, 144 files):**
- **Changed:** only `apps/web/dist/index.html` and `apps/web/dist/sw.js`.
- **Renamed:** the two hashed web bundles, `index-*.js` and `index.es-*.js`.
- **Identical:** every server, content and package file. That matches the three changed web-client sources.

**Cross-check:** the same inventory digest `4f58b323…` was recorded for the `988c535` pack. That was in Claude's build, and in ChatGPT's own Codespace build (review 6956743716). `988c535`'s runtime files are identical to `72e9d8b`'s, so three independent builds agree on these 144 files.

## Why the archive hash isn't the identity
- **Archives aren't byte-reproducible:** `release.json` carries `builtAt`, and tar records the files' times.
- **So each archive is identified by its own SHA-256.** The inventory digest proves which files it holds.
- **Two ways to audit:**
  - **(a) Audit these exact bytes,** `f3bd00ea…`. They must be transferred privately first.
  - **(b) The `7097ac2` precedent:** ChatGPT builds the package in its own Codespace from a clean detached `72e9d8b` under Node v22.16.0. It checks that the inventory digest is `4f58b323…`, audits that archive, and records **that** archive's SHA-256 as the promotion artifact.

## Verifying an archive (the auditor)
```
sha256sum cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.tgz     # f3bd00ea2f2c17e1f84e0b413822f5cd181247774f9872923860c1120f4d72ca for this developer build
tar -tzf cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.tgz | sort | uniq -d                    # no output: no duplicate entries
V=$(mktemp -d) && tar -xzf cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.tgz -C "$V" && cat "$V/release.json"   # revision 72e9d8b…, no -dirty; node v22.16.0
(cd "$V" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > inventory.txt
sha256sum inventory.txt                                       # 4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef
diff inventory.txt cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.inventory.sha256             # no output
```

## Not done (outside this handoff)
- **Not done yet:** the independent private archive audit (ChatGPT's), and the compatibility proof on a disposable **received** copy (`7097ac2` reading data that `72e9d8b` wrote).
- **Not done here:** the pins-only forward commit and its revert, promotion, Render, production data, and any spend.
- **What W7 still needs:** these, with W7's release-pair run itself. #50 stays draft.
