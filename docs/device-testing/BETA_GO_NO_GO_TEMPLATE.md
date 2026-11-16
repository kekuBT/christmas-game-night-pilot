# Beta go/no-go record: YYYY-MM-DD

Copy this file to `beta-go-no-go-YYYY-MM-DD.md`, fill it in during the checks in [`docs/REAL_DEVICE_TESTING.md` §7](../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2), and attach it to the release PR or issue.

**Never write here:** the access code, family names, room contents, or anything from the data folder. Room codes are fine once the night is over.

## The release
| Field | Value |
|---|---|
| Runtime revision | `7097ac2bb062925bb296a129f4771f1e68fd522d` |
| Audited archive's SHA-256 (recomputed by its holder) | |
| Inventory digest of the archive installed on the host | expected `fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c` · seen: |
| `/health` after the start | |
| Node on the host (`node -v`) | |
| Host route chosen (H1–H4, runbook preflight) and its name | |
| Read-only preflight R1–R8 completed on (date), by (runbook Stage 0) | |
| Approval 1, given on (date), by | |
| Artifact gate printed `VERIFIED` on the host (Stage 1, throwaway data and code) | |
| Route checks V1–V3 (Stage 2) | |
| `MCHEZO_TRUST_PROXY` value and how it was counted | |
| Backup folder name, and where the off-host copy is | |

## The devices
| Device | Model | OS version | Browser and version | Network |
|---|---|---|---|---|
| iPhone | | | Safari | |
| Android | | | Chrome | |
| TV or laptop | | | | |

## The checks (✅ / ❌ / ⚠️, with a note for anything not ✅)
| # | iPhone | Android | TV | Note |
|---|---|---|---|---|
| P1 gate | | | | |
| P2 invite by QR | | | | |
| P3 manual join | | | | |
| P4 TV watches | — | — | | |
| P5 reconnect | | | | |
| P6 small-screen lock and continue | | | | |
| P7 TV privacy through a rematch | — | — | | |
| P8 reload mid-game | | | | |

| # | Result | Evidence (paste the lines) |
|---|---|---|
| H1 revision | | |
| H2 restart with persistence | | |
| H3 independent backup | | |
| H4 restore into an isolated folder | | |
| H5 stop with no previous release | | |
| H6 no way around the proxy | | |

## Issues
| # | Severity (Blocker / Major / Minor / Feel) | Device | What happened vs expected | Screenshot or recording |
|---|---|---|---|---|

## Decision
- **Go / No-go:**
- **If no-go, what stays stopped and what happens next:**
- **Owner's sign-off** (name, date and time):
- **ChatGPT's review** (comment link):
