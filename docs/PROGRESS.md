# Muse local progress and resume checkpoint
Updated: 2026-11-04 00:30 EST (F1 API playthrough + 2 fixes; real-browser click-through still blocked)

## Current milestone
M0–M5: COMPLETED as backend/engine checkpoints ONLY — see docs/FRONTEND_MILESTONES.md. They are NOT evidence the full product is finished.
F1 (browser app shell + all 11 game screens): BUILT; API-level playthrough of all 11 games PASSED (see below). Real-browser click-through: STILL NOT RUN — browser tab service failed 2026-11-04 (see below). F2–F7: NOT DONE.

## Completed with evidence
- M0 (commit 905643a): TypeScript+Zod+Vitest foundation, 23 tests, typecheck/build exit 0, static shell.
- M1 (commit 33552a2): HTTP/WebSocket adapter (`src/server/http.ts`, ws package), snapshot persistence to JSON, restart restore test, 26 tests.
- M2 (commit d805540): Impostor, Caption Clash, Closest Wins end-to-end with projections and cheating tests, 30 tests.
- M3 (commit cab3ad3): Remaining 7 games — Trivia, Word Connections, Who Said That (fictional pack only), Guess the Year, Category Sprint, Charades, Geography (6 modes, text/region fallbacks) — plus championship ledger (`src/scoring/ledger.ts`) and 7-day worked example, 39 tests. All 11 games now `implemented` in the registry.
- M4 (commit 0b194c0): TV Hub (`src/server/hub.ts`, public only), Memory Book (`src/server/memorybook.ts`, approve/revoke, event-grounded export only), achievements and day ceremony, 42 tests.
- M5 (engine): Rate limiting (20 joins/room/60s), 64 KB payload cap, security tests (forged score, replay, XSS, snapshot checksum), audit doc `docs/SECURITY_AUDIT.md`. Final engine counts: `npm run typecheck` exit 0, `npm test` — 8 files, 45 tests passed, 0 failed.
- F1 (this session, commit pending at write time — see git log): React browser app in `apps/web/` (Vite 5 + React, `apps/web/src/App.tsx`, `main.tsx`, `index.css`, `vite.config.ts`), served by LocalServer at `/` from `apps/web/dist` after `npm run build:web`. Features: create room (host), join by code, lobby/roster, host start (official/practice) for all 11 games with tutorials, host cohost grant, per-game play screens for all 11 games via real intents, finished-game score reveals, championship standings (provisional midrank, client-computed), TV Dashboard (public only), Memory Book via new server endpoints (add/approve/revoke/export, event-grounded), reconnect button, WebSocket projection + 2s polling fallback, 44px targets, reduced-motion support.
  - New server endpoints in `src/server/http.ts`: `GET /games`, `POST /rooms/join-by-code`, `GET /rooms/:id/ledger`, `GET/POST /rooms/:id/memory`, `POST /rooms/:id/memory/:id/approve|revoke`, `GET /rooms/:id/memory/export`, static serving of the built web app.
  - New script: `npm run serve` (`src/server/serve.ts`, port 3000 by default).
  - Verified this session: `npm run typecheck` exit 0, `npm test` 8 files / 45 passed, `npm run build:web` exit 0 (34 modules, dist/index.html + assets), live smoke on port 3456: `/` served built app, `/games` returned registry, join-by-code worked, host + 2nd player started Math Mayhem and projection returned 10 questions in playing state. Smoke data cleaned (data/ removed).
  - NOT YET VERIFIED in a real browser: no human/browser click-through of all 11 games, no Playwright E2E, no real iPhone Safari. Do not claim F2 complete until that happens.

## Cron run 2026-11-04 00:15 EST (local-dev-christmas-30m, first scheduled run — COMPLETED with commit)
- Tree was clean; worked task-board item 1 (browser click-through + fix pass).
- Live-browser attempt FAILED at the harness level, not the app: the browser tab service returned no usable tab ("did not load the requested URL (invalid_request)") for http://localhost:3457 and 127.0.0.1:3457, and reported no open tabs. No room created, no game tested in a real browser. Do NOT retry the identical browser delegation blindly; retry only once the tab service is healthy, or via Playwright (task 2).
- Fallback within scope: API-level playthrough mirroring the UI's exact intent flows, new script `scripts/clickthrough-api.mjs` (run: `node scripts/clickthrough-api.mjs http://localhost:3457` against `npm run serve`). 4 fictional players (Alex/Sam/Jo/Kim), official mode, every game played to `finished`:
  - All 11 FINISHED with scores revealed via TV projection: Impostor, Caption Clash (3 rounds), Trivia, Word Connections, Who Said That?, Guess the Year, Closest Wins (8 questions), Category Sprint (3 rounds), Charades (4 turns), Geography, Math Mayhem (all answers computed from prompts, not index 0). Ledger: 11 game-finished events / 106 total. Memory Book add/approve/export and reconnect-by-token also verified in the same run.
  - Two real bugs found and FIXED in this run:
    1. Connections tiles rendered as raw ids in the UI (`t.word ?? t.label ?? t.id` in `apps/web/src/App.tsx`, but tiles are `{id, text, category}`) — fixed to `t.text ?? t.id`.
    2. Connections categories leaked to all clients: `src/server/room.ts` projected full board tiles including `category`, making the puzzle trivially solvable from the projection — fixed to project only `{id, text}` for both player and TV audiences. Re-verified: a still-playing Connections game now projects tiles with no `category` field, and the driver still solves all 4 groups (groups are server-side only).
  - Non-issue clarified: the driver's first `answerKeyLeak=true` flag was overbroad — finished Math questions legitimately include `correctAnswer` post-finish (by design); no pre-finish key leak found.
  - Caveat: Category Sprint finished with all-zero scores because the driver submitted invented names, not real category examples; sprint scoring of valid answers is covered by unit tests, not by this driver. Math scores used computed answers; quiz games answered index 0 (completion, not score quality).
  - Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 45 passed, `npm run build:web` exit 0, playthrough exit 0 (`ALL GAMES FINISHED`), twice (before and after fixes). Test server data/ removed after each run.
- This run is the FIRST scheduled local-dev run to actually complete and commit — the cron being enabled is no longer the only evidence, but real-browser verification is still outstanding, so do not claim full F1 verification.

## What is NOT done — do not claim otherwise
- Browser click-through for all 11 games: NOT RUN in a real browser (API-level smoke only).
- Playwright multi-browser E2E: NOT RUN.
- Real browsers: iPhone Safari, Android, desktop, TV — NOT RUN.
- Cloudflare: UNTESTED-CLOUD, no provisioning per owner instruction.
- npm audit: NOT RUN — registry proxy returned 403 policy_denied; no bypass attempted.
- ESLint: NOT CONFIGURED.
- Autonomous local-development cron `local-dev-christmas-30m`: CREATED and ENABLED, interval@30m, next run Wed 2026-11-04 00:15:46 EST, but HAS NOT RUN YET — do not claim autonomous background development is proven until a scheduled run actually completes and commits. GitHub coordination cron `hourly-github-coordination-christmas-pilot` remains DISABLED.

## Task board (next three)
1. (PARTLY DONE via API, still open for real browser) Browser click-through + fix pass: retry in a real browser once the tab service is healthy — two tabs as different players, play each of the 11 games to completion; API playthrough (`scripts/clickthrough-api.mjs`) already passes and stays as the regression check.
2. Add Playwright multi-browser E2E (Chromium/Firefox/WebKit) for a 4-player room, plus manual real-device checklist (marked NOT RUN until actually run). Note 2026-11-04: `npm view playwright` reached the registry (1.64.1), so the earlier 403 was audit-endpoint-specific; browser-binary download still untested.
3. Prepare a PR-ready checkpoint packet (summary, test evidence, screenshots, limitations, open owner decisions) — but do NOT publish to GitHub until Keku explicitly asks, per local-only mode.

## External approvals pending
None queued. Local-only mode: do not initiate GitHub publishing or approval requests until Keku explicitly asks. GitHub coordination cron remains paused.

## Unresolved owner decisions
See `docs/DECISIONS.md` and `docs/FRONTEND_MILESTONES.md`. Championship formula, Geography modes, Finale, host recovery, AI, and photo policy remain PROVISIONAL / OPEN-OWNER.

## Last commands actually run
- `npm run typecheck` — exit 0
- `npm test` — 8 files, 45 tests passed
- `npm run build:web` — exit 0, 34 modules
- `node scripts/clickthrough-api.mjs http://localhost:3457` — exit 0, ALL GAMES FINISHED (twice: before and after the 2026-11-04 fixes)
- Live smoke (port 3456, 2026-11-03): `/`, `/games`, join-by-code, host start Math Mayhem with 2 players — all as reported above
- `npm audit --omit=dev` — blocked by registry proxy 403, NOT RUN (earlier session); `npm view playwright` 2026-11-04 succeeded (1.64.1)

## Next session exact resume step
Open this file, confirm local git status in `~/workspace/christmas-game-night-pilot-local`, then start task 2 above (Playwright E2E install + 4-player script) and, if the browser tab service is healthy, retry the real-browser click-through (task 1 remainder). Do NOT re-request GitHub publishing. If the autonomous cron runs first, it must follow the same task board and the dirty-tree rule in its instructions.
