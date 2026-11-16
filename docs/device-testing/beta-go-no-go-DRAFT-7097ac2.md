# Beta go/no-go record: DRAFT for `7097ac2` (not a decision)

**Status: DRAFT.** Prepared from [BETA_GO_NO_GO_TEMPLATE.md](BETA_GO_NO_GO_TEMPLATE.md) for Beta R3 (handoff [6909443770](https://github.com/kekuBT/christmas-game-night-pilot/pull/43#issuecomment-6909443770)).
- **What is filled:** only what existing evidence supports. Everything that needs the target host, real phones or the owner is **PENDING**.
- **The current verdict:** **NO-GO by default.** Nothing here authorizes installing, inviting or launching.
- **Renaming:** when the checks run, this file is copied to `beta-go-no-go-YYYY-MM-DD.md` and completed there. This draft is kept as written.
- **The checks:** [REAL_DEVICE_TESTING.md §7](../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2).
- **The runbook:** [beta-r1-release.md](../beta/beta-r1-release.md).
- **The approvals this record serves:** the runbook's [two approvals](../beta/beta-r1-release.md#two-approvals-before-anyone-is-invited-beta-r3).

**Never written here:** the access code, family names, room contents, or anything from a data folder.

## The release
| Field | Value | Evidence |
|---|---|---|
| Runtime revision | `7097ac2bb062925bb296a129f4771f1e68fd522d` | [release-7097ac2.md](../beta/release-7097ac2.md) |
| Audited archive's SHA-256 | `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131` | ChatGPT's verification, [6909443770](https://github.com/kekuBT/christmas-game-night-pilot/pull/43#issuecomment-6909443770) |
| Audited archive's `release.json` | revision `7097ac2…`, Node `v22.16.0` | the same |
| Inventory digest, expected | `fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c` (144 files) | [release-7097ac2.inventory.sha256](../beta/release-7097ac2.inventory.sha256) |
| Inventory digest, seen **on the host** | **PENDING:** no host yet | H1 |
| Archive SHA-256, seen **on the host** | **PENDING** | H1 |
| `/health` **on the host** after the start | **PENDING:** no host yet | H1 |
| Node on the host (`node -v`) | **PENDING** | preflight P2 |
| Host route chosen (H1–H4) and its name | **PENDING:** the owner's facts (runbook "Deciding the route"), then ChatGPT's recommendation and the owner's choice | — |
| Preflight P1–P9 completed on (date), by | **PENDING** | — |
| `MCHEZO_TRUST_PROXY` value and how it was counted | **PENDING:** the route proof's measured count | runbook step 3 |
| Backup folder name, and where the off-host copy is | **PENDING** | H3 |

## Evidence so far (none of it replaces a row below)
| Evidence | What it shows | What it does **not** show |
|---|---|---|
| Full gate `20261116-035311-7097ac2b-9479`, PASSED (exit 0), 111/111, unit 2,068/2,068 ([run](../evidence/gate-runs/20261116-035311-7097ac2b-9479/)) | The runtime's automated suite, in Chromium emulation, on a fresh clone of `7097ac2` | Real phones, the target host, the real route |
| ChatGPT's private Firefox audit of `7097ac2` ([6908014247](https://github.com/kekuBT/christmas-game-night-pilot/pull/43#issuecomment-6908014247)) | The gate; separate host, guest and TV; phone-sized layouts; reconnect; a natural Trivia finish and scores; TV privacy through the start of a rematch; Geography and Math continuation | Desktop Firefox ESR at phone sizes is **not** native iPhone Safari or Android Chrome. It ran in a private Codespace, **not** the target host. |
| Local preflight rehearsal, run 6 ([log](../evidence/beta-r2-preflight/drill-run6-confirmed-ownership.log)), and its safety check, 24/24 ([log](../evidence/beta-r2-preflight/drill-safety-check-run2.log)) | The runbook's commands on a disposable container: install, HTTPS through Caddy (local CA), restart with persistence, backup, isolated restore, first-install stop | **Not** the target host, a public certificate, systemd as PID 1 or a real route. It used one of my rebuilds (`d827e14d…`), not the audited archive. |

## The devices
| Device | Model | OS version | Browser and version | Network |
|---|---|---|---|---|
| iPhone | PENDING | PENDING | Safari, PENDING | PENDING |
| Android | PENDING | PENDING | Chrome, PENDING | PENDING |
| TV or laptop | PENDING | PENDING | PENDING | PENDING |

## The checks
| # | iPhone | Android | TV | Note |
|---|---|---|---|---|
| P1 gate | PENDING | PENDING | — | |
| P2 invite by QR | PENDING | PENDING | — | |
| P3 manual join | PENDING | PENDING | — | |
| P4 TV watches | — | — | PENDING | |
| P5 reconnect | PENDING | PENDING | — | |
| P6 small-screen lock and continue | PENDING | PENDING | — | The Firefox audit covered this at phone sizes on desktop; native phones are still to do. |
| P7 TV privacy through a rematch | — | — | PENDING | The Firefox audit covered this in a private Codespace; the target host and a real TV are still to do. |
| P8 reload mid-game | PENDING | PENDING | — | |

| # | Result | Evidence |
|---|---|---|
| H1 revision | PENDING | |
| H2 restart with persistence | PENDING | (rehearsed locally only) |
| H3 independent backup | PENDING | (rehearsed locally only) |
| H4 restore into an isolated folder | PENDING | (rehearsed locally only) |
| H5 stop with no previous release | PENDING | (rehearsed locally only) |
| H6 no way around the proxy | PENDING | |

## Issues
None recorded: the checks haven't run.

## Decision
- **Approval 1, private target-host validation of the pinned artifact:** **PENDING.** It needs the owner's explicit approval, after the route is chosen.
- **Approval 2, invitations and go:** **PENDING.** It needs P1–P8 and H1–H6 recorded here with no blocker, then:
  - the owner's sign-off;
  - ChatGPT's review.
- **Go / No-go:** **NO-GO (default) until both approvals are given.**
- **If no-go:** the runbook's stop and rollback conditions apply ("Rolling back"; §7.3's no-go triggers).
- **Owner's sign-off** (name, date and time): PENDING
- **ChatGPT's review** (comment link): PENDING
