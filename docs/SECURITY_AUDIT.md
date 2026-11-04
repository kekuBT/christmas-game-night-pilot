# M5 Hardening Audit — 2026-11-03

## Test matrix (honest)

| Area | Result | Evidence |
|---|---|---|
| Typecheck | PASS | `npm run typecheck` exit 0 |
| Unit/integration tests | PASS | 8 files, 45 tests passed, 0 failed (Vitest 2.1.9) |
| Build | PASS | `npm run build` exit 0 (checked M0–M3; re-run before any demo) |
| Projection leak (TV / other player) | PASS | Canary tests in room/m2/m3/security suites; TV payload contains no correctIndex, no tokens, no secret prompts |
| Forged score / replay / wrong actor / wrong room | PASS | security.test.ts |
| XSS / text caps | PASS | escapeHtml + 140-char caption cap, tested |
| Join rate limiting | IMPLEMENTED, not load-tested | 20 joins/room/60s in LocalServer; no load test run |
| Payload size limit | IMPLEMENTED | 64 KB cap in LocalServer.readBody |
| Snapshot backup/restore | PASS | Ledger checksum preserved after fromJSON restore, tested |
| 10-player HTTP + WebSocket | PASS | integration.test.ts |
| Restart persistence | PASS | Snapshot file restore test, integration.test.ts |
| npm audit | NOT RUN — BLOCKED | npm audit endpoint returned 403 policy_denied from the registry proxy; not a code failure, and no bypass was attempted |
| Real iPhone Safari | NOT RUN | No real device available in this session; Playwright WebKit is not a substitute |
| Real Android / desktop / TV browsers | NOT RUN | Same as above |
| Cloudflare Workers / DO / D1 | NOT RUN — UNTESTED-CLOUD | No account provisioning, per owner instruction |
| React/Vite browser app | NOT BUILT | Static shell only in apps/web/index.html; engine games are playable via HTTP/WebSocket API and in-process tests, not via a polished browser UI yet |
| ESLint | NOT CONFIGURED | Typecheck + tests are the gates that passed; lint remains a follow-up |

## Known limitations for owner review

- The 11 games are fully implemented at engine/API level, with server-side scoring and projections. A family cannot yet play them through a polished phone UI — that browser UI is the largest remaining piece before an owner demo, and must not be claimed as done.
- Geography outline/map modes use text/region fallbacks, not licensed SVG geometry or map tiles, as documented in the module.
- Championship formula is PROVISIONAL, not owner-approved for a real trophy.
- Who Said That uses a fictional pack only, by design, to avoid invented real attributions.

## No P0 defects open in engine scope

No private-state leak, score forgery, duplicated official scoring, or data-loss bug was found in the tested engine paths. If one is found later, stop that feature, write a failing test, and fix before demoing it, per project AGENTS.md.
