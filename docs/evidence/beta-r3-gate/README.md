# Beta R3 repair: the order of execution and the artifact gate (review 6909578563)

**Round 2** (review 6910988491: failed prerequisites must stop the later steps, even when a block is run as a whole) is in [round2/](round2/README.md). This folder is round 1, kept as it ran at `ca15c99`. Its harness targets the round-1 blocks, which round 2 replaced.

Docs and evidence only. No host action, browser run or full-gate rerun. The runtime is unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d` ([runtime-diff.txt](runtime-diff.txt)).

## What the review asked, and where it is
| Review item | Where |
|---|---|
| 1. One order: read-only preflight, Approval 1, isolated staging, route checks, host and device checks, then go/no-go. Checks needing the running isolated preview marked PENDING. No public-port exception. Routes needing exposure, provisioning or spending unavailable. Approval 2 tied to evidence and sign-off. | [beta-r1-release.md](../../beta/beta-r1-release.md), "The order of execution" and its Stage 0–4 sections; "Two approvals before anyone is invited"; the [draft record](../../device-testing/beta-go-no-go-DRAFT-7097ac2.md); the [template](../../device-testing/BETA_GO_NO_GO_TEMPLATE.md); [REAL_DEVICE_TESTING.md §7](../../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2). D-BR3-05, D-BR3-07. |
| 2. The checksum as a command precondition: the full pinned hash, failing on a mismatch or missing input; unpacking bound to it; stop before the switch on a failed manifest or inventory check; rebuilds kept distinct. | "Promoting it", step 1 (the `promote` block); "First install" (the `first install` block); Stage 4's `switch` block. D-BR3-06. |
| Acceptance: fixtures (correct → sentinel; wrong and missing → never) | [gate-fixtures-final.log](gate-fixtures-final.log), from [gate-fixtures.sh.txt](gate-fixtures.sh.txt) |
| Acceptance: trace from the read-only preflight to go/no-go | [trace.md](trace.md) |
| Acceptance: changed links, runtime diff | [doc-links-final.out.txt](doc-links-final.out.txt), [runtime-diff.txt](runtime-diff.txt) |

## How the fixtures work
- **The blocks:** [gate-fixtures.sh.txt](gate-fixtures.sh.txt) extracts the runbook's three gated blocks verbatim, between their `>>>`/`<<<` markers: `promote`, `first install` and `switch`.
- **What it substitutes:** only fixture values and harmless stand-ins, and it prints the diff of each.
  - The values: `SHA`, the expected hashes, the archive path and a throwaway `OPT` and data folder.
  - `systemctl stop|start|enable` → `echo SENTINEL-…`.
  - The datatool backup → `echo SENTINEL-BACKUP`, or `false`.
  - `useradd`/`install -o cgn` → no-ops or `mkdir`.
- **The fixture archives** are shaped like the real package: `release.json`, the real `package.json` and lock from `7097ac2`, and a few files. `npm ci` runs for real against the registry.

| Case | Archive | Must |
|---|---|---|
| G1 | correct | `VERIFIED`; stop, backup and start sentinels; `current` → the release; only `ws zod` installed |
| G2 | wrong bytes (one byte appended) | `STOP`; nothing unpacked; no marker; no sentinel; no switch |
| G3 | missing | the same |
| G4 | wrong revision in `release.json` (its own hash pinned) | the same, at the revision check |
| G5 | an extra file (its own hash pinned) | the same, at the inventory check |
| G6 | a stale marker from an earlier attempt, then wrong bytes | the marker cleared first; no sentinel |
| G7 | correct, but the backup fails | verified and stopped; then no switch and no start |
| G8 | **the same files repacked:** a different SHA-256, the same revision and inventory, as with my rebuilds | `STOP` at the hash alone; nothing unpacked |
| F1 | first install, correct | `VERIFIED`; linked; the unit names the throwaway folder; the start sentinel; only the throwaway folder created and checked |
| F2, F3 | first install, wrong bytes / missing | `STOP` at the gate and at the link; nothing linked; no start |
| F4 | first install, correct, but the unit has no `ReadWritePaths=` line | no start |
| W1 | switch, settings edited to the new real folder | start sentinel; the unit names the new folder |
| W2 | switch, settings still naming the throwaway folder | no start (so no invitations) |

**The harness's own negatives** ([gate-mutations.sh.txt](gate-mutations.sh.txt)): each mutation removes one guard from a copy of the runbook, and the case written for it must fail.

| Mutation | Removes | Must fail |
|---|---|---|
| hash | the `sha256sum --check --strict` link | G8 |
| marker | `rm -f "$MARK"` | G6 |
| stopgate | the marker check before stopping the server | G2 |
| backup | the backup requirement for the switch | G7 |
| link | the marker check before the first install's link | F2 |
| unitgate | the unit-line check before the first install's start | F4 |
| switchgate | the settings check before the switch's start | W2 |

## Every run, in order (raw logs)
| Run | What | Verdict | Log |
|---|---|---|---|
| 1 | Fixtures G1–G7, first harness | **FAILED**, 25/26: G1's package check listed `node_modules` and counted the empty dev-scope folders npm leaves (`@babel`, …) | [gate-fixtures-run1.log](gate-fixtures-run1.log) |
| 2 | The same, with the listing printed | **FAILED**, 25/26, the same cause, now visible | [gate-fixtures-run2.log](gate-fixtures-run2.log) |
| 3 | The harness counts folders with a `package.json`, and separately checks the scope folders are empty | PASSED, 27/27 | [gate-fixtures-run3.log](gate-fixtures-run3.log) |
| 4 | Step 3's `STOP` message split (not verified vs no backup) | PASSED, 27/27 | [gate-fixtures-run4.log](gate-fixtures-run4.log) |
| 5 | Plus the first install (F1–F4) and the switch (W1–W2), after the trace's fixes | PASSED, 40/40 | [gate-fixtures-run5.log](gate-fixtures-run5.log) |
| 6 | First install's `cd && datatool check` chained; full diffs printed | PASSED, 40/40 | [gate-fixtures-run6.log](gate-fixtures-run6.log) |
| 7 | Plus G8 (repacked archive) | PASSED, 42/42 | [gate-fixtures-run7.log](gate-fixtures-run7.log) |
| M1 | Mutations, against run 7's harness | 7 of 7 caught | [gate-mutations-run1.log](gate-mutations-run1.log) |
| — | One mutation attempt was cut off when my session's worker restarted, before it started; nothing ran | not run | — |
| **Final** | **Fixtures on the committed docs** (clean tree; the docs commit is named in the log header) | see the log | [gate-fixtures-final.log](gate-fixtures-final.log) |
| **Final** | **Mutations on the committed docs** | see the log | [gate-mutations-final.log](gate-mutations-final.log) |
| **Final** | **The record check** ([check-r3-record.mjs.txt](check-r3-record.mjs.txt), now 49 checks) and its 8 negatives ([record-negatives.sh.txt](record-negatives.sh.txt)) | see the logs | [record-check-final.out.txt](record-check-final.out.txt), [record-negatives-final.out.txt](record-negatives-final.out.txt) |

Runs 1–7 and M1 ran on the uncommitted working tree as it was then. Only the final runs bind to the committed docs: each final log's first line names the commit, `ca15c999b822c722b35a21df1be6fa775ab9c4e6`, with 0 uncommitted paths.

**One edit to the final logs:** my local checkout path in their header lines is replaced with `<repo checkout>`. Nothing else was changed.

## To reproduce
```
bash gate-fixtures.sh.txt <repo root>                       # needs network for npm ci
bash gate-mutations.sh.txt <repo root> gate-fixtures.sh.txt
node check-r3-record.mjs.txt <repo root>                    # rename to .mjs first
bash record-negatives.sh.txt <repo root> check-r3-record.mjs
```

## Limitations
- **The fixtures prove the gating, not the host commands they stand in for:** `systemctl`, `useradd`, `install -o cgn`, the datatool, Caddy, `nc`.
- **Not the audited archive:** the fixtures use small fixture archives. The gate would check the audited archive the same way, by its full hash, revision, inventory and packages.
- **No host, no browser, no full gate:** none was run for this repair, as the review asked. The runtime gate of record stays `20261116-035311-7097ac2b-9479`, PASSED (exit 0), on `7097ac2`.
