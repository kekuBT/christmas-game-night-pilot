# M5 Hardening Audit — updated 2026-11-04 (F7 clean-install, final test matrix)

## Final test matrix (F7, 2026-11-04 ~03:45 EST)

Clean-install evidence: fresh `git clone` of the local repo to /tmp, then
`npm install` (107 packages, Node v24.22.1, npm 10.9.4), `npm run typecheck`,
`npm test`, `npm run build`, `npm run build:web` — ALL exit 0. Main-tree
re-run the same morning: typecheck exit 0, 8 files / 48 tests passed,
build:web exit 0 (34 modules). The /tmp clone was deleted after the run.

| Area | Result | Evidence |
|---|---|---|
| Clean install | PASS | Fresh clone + `npm install` exit 0, 107 packages |
| Typecheck | PASS | `npm run typecheck` exit 0 (clean clone and main tree) |
| Unit/integration tests | PASS | 8 files, 48 tests passed, 0 failed (Vitest 2.1.9) |
| Build (server) | PASS | `npm run build` exit 0 (clean clone) |
| Build (web) | PASS | `npm run build:web` exit 0, 34 modules, dist/index.html + assets |
| Projection leak (TV / other player) | PASS | Canary tests in room/m2/m3/security suites; browser leak scans in check-multiplayer (12/12) and check-f5 (30/30) while games were PLAYING |
| Forged score / replay / wrong actor / wrong room | PASS | security.test.ts |
| XSS / text caps | PASS | escapeHtml + 140-char caption cap, tested |
| Join rate limiting | IMPLEMENTED, not load-tested | 20 joins/room/60s in LocalServer; no load test run |
| Payload size limit | IMPLEMENTED | 64 KB cap in LocalServer.readBody |
| Snapshot backup/restore | PASS | Ledger checksum preserved after fromJSON restore, tested |
| 10-player HTTP + WebSocket | PASS | integration.test.ts |
| Restart persistence | PASS | Snapshot file restore test, integration.test.ts |
| Multiplayer / reconnect (browser) | PASS | check-multiplayer 12/12: 4 simultaneous pages, mid-game reload returns to same slot, roster still 4, WS connected tracking after reload |
| Championship / TV / Memory Book (browser) | PASS | check-f4 11/11: standings + breakdown, TV Dashboard, approve→export, revoke disappears from export |
| Full-day browser playlist | PASS | check-f5 30/30: all 11 games to finished in one room, leak-free, 11/11 ledger finish events |
| Mobile / accessibility (emulation) | PASS (emulation only) | check-mobile 32/32: 320/375/390px, no overflow, >=44px targets, visible focus, reduced motion |
| Playwright E2E | PASS (Chromium + Firefox) | e2e-browser 12/12 each: all 11 games to finished via real UI clicks |
| npm audit | NOT RUN — BLOCKED | npm audit endpoint returned 403 policy_denied from the registry proxy; not a code failure, and no bypass was attempted |
| Playwright WebKit | NOT RUN — BLOCKED | Binaries downloaded, launch fails on missing host libraries (libgstreamer-1.0, libgtk-4, libgraphene, libevent, gstreamer plugins); system package install is outside local-only scope, not attempted |
| Real iPhone Safari | NOT RUN | No real device available in this session; Playwright WebKit is not a substitute |
| Real Android / desktop Safari / TV browsers | NOT RUN | Same as above |
| Manual real-device checklist | NOT RUN | Needs real devices + a family member with no dev tools; cannot be done from this VM |
| Cloudflare Workers / DO / D1 | NOT RUN — UNTESTED-CLOUD | No account provisioning, per owner instruction |
| ESLint | PASS (2026-11-04) | `npm run lint` exit 0, zero errors; ESLint 9 flat config + typescript-eslint, `npm run lint` script added (see cron run 2026-11-04 ~04:15 EST in PROGRESS.md) |

## Known limitations for owner review

- The React/Vite browser app is BUILT (F1–F5 closed via real-browser drivers),
  but the final family-member acceptance test (a family member, no dev tools,
  no developer in the room) has NOT been run — that is the remaining gate
  before any owner demo claim.
- Geography outline/map modes use text/region fallbacks, not licensed SVG geometry or map tiles, as documented in the module.
- Championship formula is PROVISIONAL, not owner-approved for a real trophy.
- Who Said That uses a fictional pack only, by design, to avoid invented real attributions.

## No P0 defects open in tested scope

No private-state leak, score forgery, duplicated official scoring, or data-loss bug was found in the tested paths. If one is found later, stop that feature, write a failing test, and fix before demoing it, per project AGENTS.md.

## Explicit NOT RUN list (F7 release readiness)

Nothing below has been run, claimed, or worked around: Playwright WebKit
(host libraries), real iPhone Safari, real Android, desktop Safari, TV
browsers, the manual real-device checklist, the family-member acceptance
test, npm audit (registry proxy 403, re-confirmed 2026-11-04), Cloudflare
deployment (not provisioned), and load testing of the join rate limiter.
ESLint was configured and passes as of 2026-11-04 (see table above).
No merge, deploy, spend, or GitHub publish has happened.
