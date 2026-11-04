# Muse local progress and resume checkpoint
Updated: 2026-11-04 ~02:45 EST (F3 DONE: multiplayer/reconnect/TV browser check 12/12 + reload-connected bug FIXED; real-device checklist still NOT RUN)

## Current milestone
M0–M5: COMPLETED as backend/engine checkpoints ONLY — see docs/FRONTEND_MILESTONES.md. They are NOT evidence the full product is finished.
F1 (browser app shell + all 11 game screens): BUILT; API-level playthrough of all 11 games PASSED, and REAL-BROWSER click-through of all 11 games PASSED 2026-11-04 in Chromium and Firefox (see cron run 2026-11-04 ~01:14 EST below). F2 (Playwright E2E): DONE for Chromium/Firefox; WebKit BLOCKED on missing host libraries, real-device checklist still NOT RUN. F3–F7: NOT FORMALLY CLOSED. F6 viewport checks (320/375/390px, no overflow, >=44px targets, focus outlines, reduced motion) PASSED 2026-11-04 via Chromium emulation; real-device confirmation still open. Task 3 (PR-ready checkpoint packet): DONE 2026-11-04 ~01:20 EST, LOCAL ONLY — `docs/CHECKPOINT_PACKET.md` + 7 screenshots in `docs/checkpoint-screenshots/`; NOT published to GitHub, per local-only mode.

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
- Browser click-through for all 11 games: DONE in real browsers 2026-11-04 — Chromium and Firefox, 4-player room, all 11 games to finished, plus championship/TV/Memory Book/reconnect views (see cron run below). The earlier browser-tab-service failure is superseded by the Playwright run.
- Playwright multi-browser E2E: DONE for Chromium and Firefox. WebKit BLOCKED (binaries downloaded, but launch fails: host missing libgstreamer-1.0, libgtk-4, libgraphene, libevent, libgstreamer plugins — system package install is outside local-only scope, so not attempted).
- Real browsers/devices: iPhone Safari, Android, desktop Safari, TV — NOT RUN (real-device checklist still open).
- F6 viewport checks: DONE 2026-11-04 via Chromium emulation (see cron run below); contrast audit and real-device confirmation still open.
- Manual real-device checklist (part of task 2): NOT RUN.
- Cloudflare: UNTESTED-CLOUD, no provisioning per owner instruction.
- npm audit: NOT RUN — registry proxy returned 403 policy_denied; no bypass attempted.
- ESLint: NOT CONFIGURED.
- Autonomous local-development cron `local-dev-christmas-30m`: CREATED and ENABLED, interval@30m; it has now completed and committed runs (2026-11-04 00:15 EST and ~01:14 EST). GitHub coordination cron `hourly-github-coordination-christmas-pilot` remains DISABLED.

## Task board (next three)
1. DONE 2026-11-04 (real browser): Playwright click-through of all 11 games to finished in Chromium and Firefox, 4-player room — see cron run below. API playthrough (`scripts/clickthrough-api.mjs`) stays as the regression check.
2. DONE except WebKit + device checklist: Playwright E2E (`scripts/e2e-browser.mjs`, `npm run e2e`) covers Chromium/Firefox; WebKit BLOCKED on host libraries (see above); manual real-device checklist still NOT RUN.
3. DONE 2026-11-04 ~01:20 EST: PR-ready checkpoint packet prepared LOCALLY — `docs/CHECKPOINT_PACKET.md` (summary, test evidence, screenshots, limitations, open owner decisions) + `scripts/screenshot-checkpoint.mjs` + 7 screenshots in `docs/checkpoint-screenshots/` (home, lobby, game playing, game finished, championship, TV dashboard, Memory Book; fictional players only). NOT published to GitHub until Keku explicitly asks, per local-only mode.
4. PARTLY DONE 2026-11-04 ~01:50 EST: F6 mobile/accessibility viewport checks (Chromium emulation, NOT real devices) — see cron run below. REMAINING: manual real-device checklist (iPhone Safari, Android, desktop Safari, TV — all NOT RUN; needs real devices, cannot be done from this VM) and F4–F7 completion per `docs/FRONTEND_MILESTONES.md`.
5. DONE 2026-11-04 ~02:45 EST: F3 formally closed — see cron run below. REMAINING NEXT: F4 browser close-out (championship day/game breakdown is rendered, but Memory Book revoke-disappears-from-export is NOT yet browser-tested; the E2E views check covers add/approve/export only), then F5 full-day playlist, F7 clean-install, and the manual real-device checklist.

## External approvals pending
None queued. Local-only mode: do not initiate GitHub publishing or approval requests until Keku explicitly asks. GitHub coordination cron remains paused.

## Unresolved owner decisions
See `docs/DECISIONS.md` and `docs/FRONTEND_MILESTONES.md`. Championship formula, Geography modes, Finale, host recovery, AI, and photo policy remain PROVISIONAL / OPEN-OWNER.

## Last commands actually run
- `npm run typecheck` — exit 0
- `npm test` — 8 files, 48 tests passed (was 47; +1 WS connected test, 2026-11-04 ~02:45 EST)
- `npm run build:web` — exit 0
- `node scripts/screenshot-checkpoint.mjs http://localhost:3457` — exit 0, 7 screenshots
- `node scripts/clickthrough-api.mjs http://localhost:3457` — exit 0, ALL GAMES FINISHED (twice: before and after the 2026-11-04 fixes)
- `node scripts/check-mobile.mjs http://localhost:3457` — exit 0, 32 checks passed (see cron run 2026-11-04 ~01:46 EST)
- `node scripts/check-multiplayer.mjs http://localhost:3457` — exit 0, 12 checks passed (see cron run 2026-11-04 ~02:45 EST)
- `node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke` — exit 0, 3/3 passed (regression after WS connected fix)
- Live smoke (port 3456, 2026-11-03): `/`, `/games`, join-by-code, host start Math Mayhem with 2 players — all as reported above
- `npm audit --omit=dev` — blocked by registry proxy 403, NOT RUN (earlier session); `npm view playwright` 2026-11-04 succeeded (1.64.1)

## Cron run 2026-11-04 ~01:14 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board items 1 (remainder) and 2 (Playwright E2E).
- Installed Playwright 1.64.1 as a devDependency (`npm install -D playwright@1.64.1`); Chromium, Firefox, and WebKit binaries downloaded. Launch probe: Chromium OK, Firefox OK, WebKit FAILED (missing host libs: libgstreamer-1.0, libgtk-4, libgraphene, libevent, gstreamer plugins) — recorded as BLOCKED, no system-package install attempted (outside local-only scope).
- Added minimal test hooks to `apps/web/src/App.tsx` (per-game card `game-card-<id>`, `start-official-<id>` buttons, `game-panel`, `finished-games`) and new driver `scripts/e2e-browser.mjs` (`npm run e2e`, usage: build web, `PORT=3457 npm run serve`, then `node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium|firefox --games=all|smoke`). Driver plays only through real UI clicks/typing: host creates room, 3 players join by code, every game to "Status: finished", then championship, TV Dashboard, Memory Book add/approve/export, reconnect.
- Three real bugs found and FIXED in this run:
  1. Driver stale-panel race (driver-side): after a game finished, the panel still showed the old finished game until the new projection arrived, so the driver could "finish" a game it never played. Fixed by waiting for the `Now playing: <gameId>` heading on every page before driving, and requiring the heading to match in the finish check.
  2. APP BUG — Who Said That? unplayable in the browser: its questions use `speakers`, but the player projection mapped only `options`, so the UI rendered quotes with zero answer buttons (API driver never caught this — it bypasses rendering). Fixed in `src/server/room.ts` (`options: q["options"] ?? q["speakers"]`) + unit test "who-said-that projection exposes speakers as answer options". This was the actual cause of the first full run stalling at Who Said That? (0 answers submitted server-side).
  3. Engine allowed concurrent games (found via the stall cascade): starting a new game while one was `playing` orphaned the first game under the UI's single-active-panel assumption. Fixed with a guard in `startGame` ("A game is already in progress") + unit test; rationale recorded as decision L08 in `docs/DECISIONS.md`.
- Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 47 passed (was 45; +2 new tests), `npm run build:web` exit 0, API playthrough re-run exit 0 (`ALL GAMES FINISHED`, 11 game-finished events, no Connections category leak), E2E Chromium 12/12 passed, E2E Firefox 12/12 passed (11 games + views each). Test server data/ removed after the runs.
- No dealer contact, no GitHub publish, no merge/deploy/spend. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~01:20 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 3 (PR-ready checkpoint packet, local only).
- New driver `scripts/screenshot-checkpoint.mjs`: Chromium, 4 fictional players (Alex/Sam/Jo/Kim), room create + join by code, Math Mayhem played to finished via real UI clicks, then championship, TV Dashboard, Memory Book add/approve/export — 7 screenshots captured in `docs/checkpoint-screenshots/` (lobby screenshot visually verified: 4-player roster, all 11 game cards). One harness quirk: `pkill -f "tsx src/server/serve.ts"` matched the wrapping shell and killed it before `rm -rf data` ran; data/ was removed in a follow-up command and the server confirmed stopped. No app bug found.
- New doc `docs/CHECKPOINT_PACKET.md`: summary, exact test evidence, screenshot list, limitations (WebKit blocked, real devices not run, Cloud untested, provisional rules, npm audit not run, ESLint not configured), open owner decisions, manual real-device checklist, reproduce steps. Explicitly marked DO NOT PUBLISH.
- Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 47 passed, `npm run build:web` exit 0, screenshot script exit 0 (7 files). Test server data/ removed.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~01:46 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 4 (F6 mobile/accessibility, local part only — the real-device checklist cannot run from this VM and stays open).
- New driver `scripts/check-mobile.mjs` (`npm run check-mobile`, usage: build web, `PORT=3457 npm run serve`, then `node scripts/check-mobile.mjs http://localhost:3457`). Chromium with touch/mobile emulation, 2 fictional players (Alex host, Sam joiner), Math Mayhem started from the lobby. Per viewport (320x568, 375x667, 390x844 portrait) it checks home, lobby, and live game panel for horizontal overflow, >= 44px touch targets, and keyboard Tab order with visible :focus-visible outlines, plus a reduced-motion context check. 9 screenshots in `docs/mobile-screenshots/` (home/lobby/game per width).
- One check-design finding, NOT an app bug: tabbing past the last control lands on BODY (Chromium headless end-of-tab-order wrap) with no outline. The script now treats BODY stops as wrap markers, not failed controls, and fills the name first so the Create button is enabled and covered by Tab order. First run showed this as 6 failures (all home Tab checks); after the fix, 32/32 pass.
- Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 47 passed, `npm run build:web` exit 0, `npm run check-mobile` exit 0 (32 passed, 0 failed; overflow 0px at all widths, all visible targets >= 44px, all focused controls outlined 3px gold, reduced-motion transitions/animations off). Test server data/ removed.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~02:15 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 5 (F3 formal close-out).
- New driver `scripts/check-multiplayer.mjs` (`npm run check-multiplayer`, Chromium, 4 fictional players): simultaneous same-panel visibility for all 4 pages during Math Mayhem; TV projection leak scan while games are playing; mid-game reload of one player (sessionStorage token) returning to the same slot with no duplicate and roster still 4; Math finished on all 4 pages; Impostor started after a finished game; TV Dashboard view during a secret-role game.
- One REAL APP BUG found and FIXED in this run (decision L09 in `docs/DECISIONS.md`): WebSocket close set `connected = false` but nothing on open restored it — only the manual Reconnect button did — so after a plain reload, `startGame` counted only 3 connected players and a 4-player game failed with "Need at least 4 connected players" even though the reloaded tab was live. Fix in `src/server/http.ts`: WS open (player/host/cohost) sets `connected = true`; WS close sets false only when no other socket for that player remains (reload race: new socket may open before the old one closes). New integration test "WebSocket open/close tracks connected" covers close→false, reopen→true, overlapping sockets→still true, and startGame eligibility after reopen.
- One check-design fix, NOT an app bug: the first leak scan flagged `correctAnswer` during Impostor — but that key came from the already-FINISHED Math game, where revealing answers is by design. The scan now checks answer-key fields only inside `playing` games, and secret/token keys globally.
- Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed (was 47; +1 new test), `npm run build:web` exit 0, `npm run check-multiplayer` exit 0 (12/12), E2E smoke re-run (`--games=smoke`, Chromium) 3/3 passed. Test server data/ removed.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Next session exact resume step
Open this file, confirm local git status in `~/workspace/christmas-game-night-pilot-local`, then close out F4 in the browser (Memory Book revoke-disappears-from-export is the untested part; add/approve/export already covered by E2E views), then F5, F7, and the manual real-device checklist (iPhone Safari, Android, desktop, TV — all still NOT RUN; needs real devices). Do NOT re-request GitHub publishing. If the autonomous cron runs first, it must follow the same task board and the dirty-tree rule in its instructions.
