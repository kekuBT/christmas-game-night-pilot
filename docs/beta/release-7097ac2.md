# Release record: the beta candidate `7097ac2` (Beta R2, item 1)

**Status:** a record for promotion, written before any host exists. Nothing is provisioned, deployed or merged. The beta stays on **HOLD** until the owner explicitly approves execution (handoff [6908014247](https://github.com/kekuBT/christmas-game-night-pilot/pull/43#issuecomment-6908014247)). The release steps themselves are in [`beta-r1-release.md`](beta-r1-release.md).

## What is recorded

| Field | Value | Source |
|---|---|---|
| **Runtime revision** | `7097ac2bb062925bb296a129f4771f1e68fd522d` | cleared in review 6908014247 |
| **Full gate on that revision** | `20261116-035311-7097ac2b-9479`, **PASSED (exit 0)**, 111/111, unit 2,068/2,068 | [`docs/evidence/gate-runs/20261116-035311-7097ac2b-9479/`](../evidence/gate-runs/20261116-035311-7097ac2b-9479/) |
| **Node** | **v22.16.0** for the audited package (`release.json`'s `node`). The host runs Node 22: [Node 22 is in Maintenance LTS, with end of life on 2027-04-30](#node-22s-support-window). | the handoff; `nodejs/release` |
| **The audited archive** | `/workspaces/mchezo-r5-review-7097ac2/mchezo-7097ac2.tgz`, in the private review Codespace | the handoff |
| **Its SHA-256** | **Not recorded here: this session can't reach that Codespace,** and I didn't try to. Whoever holds the file recomputes it (below) and writes it into the go/no-go record. | — |
| **Its content inventory** | **144 files**, digest **`fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c`**. Every file of the package except `release.json`, with its SHA-256: [`release-7097ac2.inventory.sha256`](release-7097ac2.inventory.sha256). | three independent builds, below |
| **Runtime packages** | `npm ci --omit=dev --ignore-scripts` installs **ws 8.22.1** and **zod 3.25.76** only, pinned with integrity hashes by `package-lock.json` (which is in the inventory) | the preflight drill, step A6 |

## Why an inventory, and not my archive's hash

- **The archive isn't reproducible byte for byte.** `pack.mjs` writes the build time into `release.json`, and `tar` records each file's time. So no rebuild can match the audited archive's SHA-256.
- **The files are reproducible.** I built `7097ac2` three times, each from a fresh clone (`docs/evidence/beta-r2-preflight/`). All three gave **the same 144-file inventory**, digest `fe6d74f8…`. Only `release.json` differed: its `builtAt`, and in build 3 its `node`.

  | Build | Node | Archive SHA-256 | Inventory digest |
  |---|---|---|---|
  | 1 | v22.16.0 (official download, checksum verified) | `d827e14da84be8df7733a4eff043c6788f5150ed02402690ba518b8c7197ea7d` | `fe6d74f8…a61c` |
  | 2 | v22.16.0 | `e57380943f7bf8c0e9e83da565b4fcc4eb4d2f3ec0a3802ea5a9acb2ce95fe52` | `fe6d74f8…a61c` |
  | 3 | v22.23.4 (this machine's) | `432f53df3e5ec71794e3043943a027dec8bddddf7b5b56ac1a0cdba77556cdcc` | `fe6d74f8…a61c` |

- **These three archives are not the promotion artifact.** Their hashes only identify my builds. What runs on the host is the **audited** archive, identified by its own SHA-256 (rule 1 of the runbook).

## How a reviewer verifies the audited archive (in the Codespace, or wherever it is kept)

```
sha256sum /workspaces/mchezo-r5-review-7097ac2/mchezo-7097ac2.tgz       # record this: it is the promotion hash
V=$(mktemp -d) && tar -xzf /workspaces/mchezo-r5-review-7097ac2/mchezo-7097ac2.tgz -C "$V"
cat "$V/release.json"                    # "revision": "7097ac2bb062925bb296a129f4771f1e68fd522d", no "-dirty"; "node": "v22.16.0"
(cd "$V" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 \
   | LC_ALL=C sort -z | xargs -0 sha256sum) > inventory.txt
sha256sum inventory.txt                  # fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
diff inventory.txt docs/beta/release-7097ac2.inventory.sha256    # no output: the same 144 files, byte for byte
```

- **If the archive was made with the package folder at its top level** (not `-C <folder> .`): `cd` into that folder before listing. The paths in the inventory start at the package root (`./dist/...`, `./apps/web/dist/...`, `./content/...`, `./package.json`).
- **If anything differs,** that archive is not `7097ac2`'s package as built by `pack.mjs`: stop, and don't promote it.

## On the host, after unpacking (before switching `current`)

```
cd /opt/christmas-game-night/releases/7097ac2bb062925bb296a129f4771f1e68fd522d
cat release.json                                          # the revision, as above
LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum
                                                          # fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
npm ls --omit=dev --depth=0                               # ws@8.22.1 and zod@3.25.76, nothing else
```

**And after the start:**

```
curl -s https://<host>/health        # {"ok":true,"revision":"7097ac2bb062925bb296a129f4771f1e68fd522d"}
```

`/health` is open without the access code and says nothing else.

## If the audited archive is lost

- **Rebuild it** with the runbook's "Building the package" steps, from a clean checkout of `7097ac2`, under Node v22.16.0.
- **Check its inventory digest:** it must be `fe6d74f8…a61c`.
- **Record the rebuild as a different file.** It gets its own SHA-256 and `builtAt`. Never write it down as the audited archive.
- **Whether that is enough is the owner's call:**
  - **Enough:** the inventory proves the runnable files are identical to the audited ones;
  - **Or:** a short private re-check of the rebuilt package (the runbook's "Previews are private" rule) before promotion.

## Node 22's support window
- **Node 22 ("Jod"):** "Maintenance LTS". Active LTS started 2024-10-29, maintenance 2025-10-21, and **end of life is 2027-04-30**.
  - Source: the release schedule in [`nodejs/release`](https://github.com/nodejs/release#release-schedule), which says "Dates are subject to change".
- **Node's own guidance:** "Production applications should only use _Active LTS_ or _Maintenance LTS_ releases" ([nodejs.org, previous releases](https://nodejs.org/en/about/previous-releases)). Both were read on 2026-11-16.
- **The consequence:** the beta can run on Node 22 through April 2027. Moving to a newer LTS is a later, separately gated change.
