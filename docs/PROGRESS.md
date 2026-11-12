# Muse local progress and resume checkpoint
Updated: 2026-11-04 ~07:40 EST (PR #3 review fixes, local only, no GitHub — see section at end; real-device checklist + family-member acceptance still NOT RUN)

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
- F6 viewport checks: DONE 2026-11-04 via Chromium emulation (see cron run below); contrast audit DONE 2026-11-04 ~04:45 EST via Chromium computed styles (57/57 pairs pass WCAG AA); real-device confirmation still open.
- Manual real-device checklist (part of task 2): NOT RUN.
- Cloudflare: UNTESTED-CLOUD, no provisioning per owner instruction.
- npm audit: NOT RUN — registry proxy returned 403 policy_denied; re-tried 2026-11-04 ~04:15 EST, still blocked; no bypass attempted.
- ESLint: CONFIGURED 2026-11-04 ~04:15 EST (`npm run lint` exit 0, zero errors; see cron run below).
- Autonomous local-development cron `local-dev-christmas-30m`: CREATED and ENABLED, interval@30m; it has now completed and committed runs (2026-11-04 00:15 EST and ~01:14 EST). GitHub coordination cron `hourly-github-coordination-christmas-pilot` remains DISABLED.

## Task board (next three)
1. DONE 2026-11-04 (real browser): Playwright click-through of all 11 games to finished in Chromium and Firefox, 4-player room — see cron run below. API playthrough (`scripts/clickthrough-api.mjs`) stays as the regression check.
2. DONE except WebKit + device checklist: Playwright E2E (`scripts/e2e-browser.mjs`, `npm run e2e`) covers Chromium/Firefox; WebKit BLOCKED on host libraries (see above); manual real-device checklist still NOT RUN.
3. DONE 2026-11-04 ~01:20 EST: PR-ready checkpoint packet prepared LOCALLY — `docs/CHECKPOINT_PACKET.md` (summary, test evidence, screenshots, limitations, open owner decisions) + `scripts/screenshot-checkpoint.mjs` + 7 screenshots in `docs/checkpoint-screenshots/` (home, lobby, game playing, game finished, championship, TV dashboard, Memory Book; fictional players only). NOT published to GitHub until Keku explicitly asks, per local-only mode.
4. PARTLY DONE 2026-11-04 ~01:50 EST: F6 mobile/accessibility viewport checks (Chromium emulation, NOT real devices) — see cron run below. REMAINING: manual real-device checklist (iPhone Safari, Android, desktop Safari, TV — all NOT RUN; needs real devices, cannot be done from this VM) and F5/F7 completion per `docs/FRONTEND_MILESTONES.md` (F4 closed 2026-11-04 ~03:05 EST).
5. DONE 2026-11-04 ~03:30 EST: F5 formally closed — see cron run below. REMAINING NEXT: F7 clean-install, and the manual real-device checklist.
6. DONE 2026-11-04 ~03:50 EST: F7 formally closed — see cron run below. REMAINING NEXT (all need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room), plus contrast audit (F6 remainder). Local-only follow-ups that WERE doable: ESLint setup — DONE 2026-11-04 ~04:15 EST (see cron run below); npm audit retry — RE-TRIED 2026-11-04 ~04:15 EST, still BLOCKED by registry proxy 403 (installs work, audit POST denied by policy, no bypass attempted); WebKit host-library question (system install outside local-only scope — owner decision, not attempted).
7. DONE 2026-11-04 ~04:45 EST: F6 contrast audit (automated, via computed styles in Chromium emulation — see cron run below). REMAINING (all need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). No further local-only candidate tasks remain on the board; future runs should re-verify (typecheck/tests/lint + a driver smoke run) or wait for owner input.

## External approvals pending
None queued. Local-only mode: do not initiate GitHub publishing or approval requests until Keku explicitly asks. GitHub coordination cron remains paused.

## Unresolved owner decisions
See `docs/DECISIONS.md` and `docs/FRONTEND_MILESTONES.md`. Championship formula, Geography modes, Finale, host recovery, AI, and photo policy remain PROVISIONAL / OPEN-OWNER.

## Last commands actually run
- `npm run lint` — exit 0, 0 errors (2026-11-04 ~04:15 EST)
- `npm audit` / `npm audit --omit=dev` — BLOCKED, registry proxy 403 policy_denied (2026-11-04 ~04:15 EST)
- `npm run typecheck` — exit 0
- `npm test` — 8 files, 48 tests passed (was 47; +1 WS connected test, 2026-11-04 ~02:45 EST)
- `npm run build:web` — exit 0
- `node scripts/screenshot-checkpoint.mjs http://localhost:3457` — exit 0, 7 screenshots
- `node scripts/clickthrough-api.mjs http://localhost:3457` — exit 0, ALL GAMES FINISHED (twice: before and after the 2026-11-04 fixes)
- `node scripts/check-mobile.mjs http://localhost:3457` — exit 0, 32 checks passed (see cron run 2026-11-04 ~01:46 EST)
- `node scripts/check-multiplayer.mjs http://localhost:3457` — exit 0, 12 checks passed (see cron run 2026-11-04 ~02:45 EST)
- `node scripts/check-f4.mjs http://localhost:3457` — exit 0, 11 checks passed (see cron run 2026-11-04 ~03:05 EST)
- `node scripts/check-f5.mjs http://localhost:3457` — exit 0, 30/30 passed (see cron run 2026-11-04 ~03:30 EST)
- `node scripts/check-contrast.mjs http://localhost:3457` — exit 0, CONTRAST CHECK OK (57 unique pairs passed, 0 failed, see cron run 2026-11-04 ~04:45 EST)
- F7 clean-install (fresh clone to /tmp, 2026-11-04 ~03:50 EST): `npm install` exit 0 (107 packages), `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run build` exit 0, `npm run build:web` exit 0 (34 modules); /tmp clone deleted after
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

## Cron run 2026-11-04 ~03:05 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 5 (F4 formal close-out).
- New driver `scripts/check-f4.mjs` (`npm run check-f4`, Chromium, 4 fictional players): Math Mayhem played to finished via real UI clicks, then championship view (standings list all 4, per-game breakdown names math-mayhem), TV Dashboard view (join code, full roster, standings, finished game in recent games), Memory Book add from last finished game → approve → export contains the entry → revoke → fresh export no longer contains it, entry stays listed as pending.
- Two driver pitfalls found and FIXED in this run — NOT app bugs (server approve/export verified working via curl against the live test server during diagnosis):
  1. First F4 run waited for `/approved/` after clicking Approve, but that regex also matches the static "Only approved entries appear in the export" paragraph, so the run exported before approval landed and falsely failed "export contains the approved entry" (the revoke check then passed vacuously). Fixed: wait for the entry card's own `Day 1 · approved` / `Day 1 · pending` status text.
  2. Playwright `getByRole` name matching is substring-based, so unscoped "Approve" also matches the "Export approved" button — which comes first in DOM order, so `.first()` clicked Export instead of approving. Fixed in `check-f4.mjs` by scoping to the entry card (`.card` containing the highlight) with `exact: true`. The same pitfall was present in `scripts/e2e-browser.mjs` views check (and `scripts/screenshot-checkpoint.mjs`, screenshots only, not fixed): E2E's old views check only asserted the highlight text appears somewhere (`.last()`), which the entry list alone satisfies, so it never actually proved approve→export. Fixed E2E's Approve click the same way (scoped + exact + wait for `Day 1 · approved`); E2E smoke re-run Chromium 3/3 passed, so its views check now genuinely proves approve→export.
- Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run build:web` exit 0, `npm run check-f4` exit 0 (11/11), E2E smoke (`--games=smoke`, Chromium) 3/3 passed. No app code changed in this run (drivers + docs only). Test server data/ removed.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~03:30 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 5 (F5 formal close-out).
- New driver `scripts/check-f5.mjs` (`npm run check-f5`, Chromium, 4 fictional players): all 11 games in registry order played to finished in ONE room via real UI clicks, TV projection leak scan while each game is PLAYING, then ledger/TV-projection settlement checks, championship view, TV Dashboard, Memory Book add → approve → export from the full day. The 7-day API half of F5 is covered by the passing championship/scoring unit tests.
- First run was 27/29 with TWO CHECK-DESIGN FLAWS, not app bugs:
  1. Ledger scan looked for registry game ids in the ledger JSON, but ledger events carry gameInstanceIds (game-1…game-11) and Math Mayhem's score reasons are per-question (math:math-1…math:math-10), so "math-mayhem" never appears as a substring even though its game-finished event exists (verified in the room snapshot: 11 game-finished events, game-11 finished). Fixed: count `game-finished` events (11/11) and cross-check finished ids via the TV projection.
  2. TV Dashboard check expected all 11 finished games listed, but "Recent games" is by design the last 5 (`src/server/hub.ts` and `apps/web/src/App.tsx` both `slice(-5)`). Fixed: assert the 5 most recent finished games are listed.
- Server-stop quirk repeated from the checkpoint run: `pkill -f "tsx src/server/serve.ts"` matched the wrapping shell and killed it before `rm -rf data` ran; data/ was removed in a follow-up command and the server confirmed stopped (same pattern: stop via `lsof -ti:3457 | xargs kill`, then `rm -rf data`, then verify).
- Evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run build:web` exit 0, `npm run check-f5` exit 0 (30/30: 11 leak-free scans, 11 finished-without-sticking, all-finished, 11/11 ledger finish events, TV projection all finished, championship standings + breakdown, TV recent 5, Memory Book export). No app code changed in this run (driver + docs only). Test server data/ removed.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~03:50 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 6 (F7 formal close-out).
- Clean-install proof via a fresh clone, NOT the working tree: `git clone` of the local repo to /tmp, `npm install` (107 packages, Node v24.22.1, npm 10.9.4), then `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run build` exit 0, `npm run build:web` exit 0 (34 modules, dist/index.html + assets). /tmp clone deleted after the run. Main-tree re-run the same morning: typecheck exit 0, tests 48 passed, build:web exit 0. No code changes needed — all gates passed first try.
- Docs updated in this run: `docs/SECURITY_AUDIT.md` rewritten with the final F7 test matrix (clean-install evidence, all browser-driver results, explicit NOT RUN list: WebKit host libs, real iPhone/Android/desktop-Safari/TV, manual real-device checklist, family-member acceptance test, npm audit proxy 403, ESLint not configured, Cloudflare unprovisioned, join-limiter load test) and `docs/FRONTEND_MILESTONES.md` F7 marked DONE, F6 marked PARTLY DONE (emulation 32/32, contrast + real-device confirmation still open).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~04:15 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 6's local follow-up (ESLint setup, previously "NOT CONFIGURED").
- Installed ESLint 9 + @eslint/js + typescript-eslint + globals as devDependencies (93 packages; registry installs work fine) and added flat config `eslint.config.mjs` (ignores dist/docs/node_modules; Node globals for src/tests/scripts, browser globals for apps/web/src, plus browser globals inside driver scripts' page.evaluate callbacks) and `npm run lint` script.
- First lint run: 20 errors, all FIXED properly (no blanket disables):
  1. `apps/web/src/App.tsx`: loose server-JSON alias changed from `Record<string, any>` to `Record<string, unknown>` (file is outside the tsc scope in tsconfig.json — src + tests only, pre-existing, unchanged); 6 `catch (e: any)` clauses narrowed to `e instanceof Error ? e.message : "Request failed"`; `(crypto as any).randomUUID` replaced with a `typeof crypto.randomUUID === "function"` check; 2 empty catch blocks given explanatory comments. No runtime behavior change except the error-message fallback for non-Error throws.
  2. `src/games/caption.ts` / `src/games/closest.ts`: intentionally unused contract parameters renamed to `_playerIds` / `_isTv` with an `argsIgnorePattern: ^_` rule (every projection takes actorId/isTv; call sites unchanged).
  3. `scripts/check-mobile.mjs`: browser globals added to the scripts config (document/window/getComputedStyle inside page.evaluate run in the page).
- Evidence: `npm run lint` exit 0 (0 errors), `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run build:web` exit 0, E2E smoke (Chromium, `--games=smoke`) 3/3 passed after the App.tsx edits. Test server data/ removed, port confirmed closed.
- npm audit RETRIED in this run and still BLOCKED: `npm audit` (with and without `--omit=dev`) returns 403 policy_denied from the registry proxy (`POST /-/npm/v1/security/audits/quick not permitted by policy`); installs succeed, so this is a proxy-policy block on the audit endpoint only. No bypass attempted. `docs/SECURITY_AUDIT.md` updated (ESLint row now PASS, NOT RUN list updated).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~04:45 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked task-board item 7 (F6 contrast audit, the last local-only board task).
- New driver `scripts/check-contrast.mjs` (`npm run check-contrast`, usage: build web, `PORT=3457 npm run serve`, then `node scripts/check-contrast.mjs http://localhost:3457`). Chromium, 2 fictional players (Alex host, Sam joiner), Math Mayhem played to finished via real UI clicks, then championship, TV Dashboard, and Memory Book (add from last finished game) views. Each view samples every visible text element's computed foreground colour against its effective background (first non-transparent ancestor) and checks the WCAG 2.1 ratio (>= 4.5:1 normal, >= 3:1 large >= 24px or >= 18.66px bold). Disabled controls are reported as informational only (WCAG exempts inactive UI).
- Two driver pitfalls found and FIXED in this run — NOT app bugs:
  1. First run timed out waiting for "Status: finished" because only the host answered questions; Math Mayhem advances only when every player answers (same pattern as check-f4.mjs). Fixed: loop both players' answer clicks until the panel reports finished.
  2. Second run timed out on the Memory Book "Add from last finished game" button because it is disabled until highlight text is entered (App.tsx line 171). Fixed: fill the highlight textarea before clicking.
- Evidence: `npm run lint` exit 0, `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run build:web` exit 0, `npm run check-contrast` exit 0 — 57 unique colour pairs passed, 0 failed, 1 disabled-info (home "Join room" button, which passes at 9.44:1 anyway). Lowest passing normal-text ratio: 7.18:1 (muted #a8bfc9 on panel #162f45); all other pairs >= 9.44:1. No app code changed in this run (driver + docs only). `docs/FRONTEND_MILESTONES.md` F6 updated (contrast DONE, real-device confirmation still open). Test server data/ removed, port 3457 confirmed closed.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.
- Remaining: only real-device checklist + family-member acceptance test (need real devices / a family member, not doable from this VM). No further local-only board tasks remain.

## Cron run 2026-11-04 ~06:45 EST (local-dev-christmas-30m — RE-VERIFICATION ONLY, no milestone)
- Tree was clean; per the task board, no local-only board task remains (all F1–F7 local parts DONE; see task board item 7). No new work invented, no app code changed.
- Re-verification evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run lint` exit 0, `npm run build:web` exit 0 (34 modules), E2E smoke (`node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke`) exit 0, 3/3 passed (closest-wins, math-mayhem, views: championship/TV/Memory Book/reconnect, 4 fictional players, room JDMWFE).
- Test server data/ removed, port 3457 confirmed closed. Working tree clean after the run except this PROGRESS.md entry.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). npm audit stays BLOCKED by registry proxy 403; no bypass attempted, not re-tried this run.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~07:15 EST (local-dev-christmas-30m — RE-VERIFICATION ONLY, no milestone)
- Tree was clean; per the task board, no local-only board task remains (all F1–F7 local parts DONE; see task board item 7). No new work invented, no app code changed.
- Re-verification evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run lint` exit 0, `npm run build:web` exit 0 (34 modules), E2E smoke (`node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke`) exit 0, 3/3 passed (closest-wins, math-mayhem, views: championship/TV/Memory Book/reconnect, 4 fictional players, room DKCE4S).
- Test server data/ removed, port 3457 confirmed closed. Working tree clean after the run except this PROGRESS.md entry.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). npm audit stays BLOCKED by registry proxy 403; no bypass attempted, not re-tried this run.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Next session exact resume step
Open this file, confirm local git status in `~/workspace/christmas-game-night-pilot-local`, then: the remaining product gates need real devices / a family member and CANNOT run from this VM — manual real-device checklist (iPhone Safari, Android, desktop Safari, TV) and the family-member acceptance test (no dev tools, no developer in the room). The F6 contrast audit is DONE (2026-11-04 ~04:45 EST); no further local-only board tasks remain, so a run with nothing new should re-verify gates (typecheck/tests/lint + one driver smoke run) and stop at a clean checkpoint rather than inventing work. npm audit stays BLOCKED by registry proxy policy; do not bypass it. Do NOT re-request GitHub publishing. If the autonomous cron runs first, it must follow the same task board and the dirty-tree rule in its instructions.

## Cron run 2026-11-04 ~05:15 EST (local-dev-christmas-30m — RE-VERIFICATION ONLY, no milestone)
- Tree was clean; per the task board, no local-only board task remains (all F1–F7 local parts DONE; see task board item 7). No new work invented, no app code changed.
- Re-verification evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run lint` exit 0, `npm run build:web` exit 0 (34 modules), E2E smoke (`node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke`) exit 0, 3/3 passed (closest-wins, math-mayhem, views: championship/TV/Memory Book/reconnect, 4 fictional players).
- Test server data/ removed, port 3457 confirmed closed. Working tree clean after the run except this PROGRESS.md entry.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). npm audit stays BLOCKED by registry proxy 403; no bypass attempted.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~05:45 EST (local-dev-christmas-30m — RE-VERIFICATION ONLY, no milestone)
- Tree was clean; per the task board, no local-only board task remains (all F1–F7 local parts DONE; see task board item 7). No new work invented, no app code changed.
- Re-verification evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run lint` exit 0, `npm run build:web` exit 0 (34 modules), E2E smoke (`node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke`) exit 0, 3/3 passed (closest-wins, math-mayhem, views: championship/TV/Memory Book/reconnect, 4 fictional players, room BX2HF7).
- Harness note, NOT an app bug: the first E2E invocation in this run failed with MODULE_NOT_FOUND because the server was backgrounded with `&` across the whole `cd && ...` chain, so the driver ran from the home directory instead of the project directory. Re-ran from the project directory and it passed 3/3. Server stopped via port kill (not the pkill pattern that previously matched the wrapping shell).
- Test server data/ removed, port 3457 confirmed closed. Working tree clean after the run except this PROGRESS.md entry.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). npm audit stays BLOCKED by registry proxy 403; no bypass attempted, not re-tried this run.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~06:15 EST (local-dev-christmas-30m — RE-VERIFICATION ONLY, no milestone)
- Tree was clean; per the task board, no local-only board task remains (all F1–F7 local parts DONE; see task board item 7). No new work invented, no app code changed.
- Re-verification evidence: `npm run typecheck` exit 0, `npm test` 8 files / 48 passed, `npm run lint` exit 0, `npm run build:web` exit 0 (34 modules), E2E smoke (`node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke`) exit 0, 3/3 passed (closest-wins, math-mayhem, views: championship/TV/Memory Book/reconnect, 4 fictional players, room UDMJDC).
- Test server data/ removed, port 3457 confirmed closed. Working tree clean after the run except this PROGRESS.md entry.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). npm audit stays BLOCKED by registry proxy 403; no bypass attempted, not re-tried this run.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.


## PR #3 review fixes — 2026-11-04 ~07:20–07:40 EST (Keku instruction: start working on all review items now, no GitHub)
- Source: ChatGPT review 5768033701 (COMMENTED, 2026-11-04 07:13:22 EST) on draft PR #3 commit 4218cec, 4 unresolved threads. No GitHub reply was posted and no snapshot was pushed in this work, per Keku's instruction.
- Regression-first: new `tests/review-fixes.test.ts` (8 tests) failed 8/8 before fixes, passes 8/8 after.
- #1 Auth: session token = join-issued recovery token, sent as `x-session-token` (HTTP) / `sessionToken` (WS); server hashes it and derives actor/role, ignoring client actorId/hostId/approverId. TV projection stays public; ledger/memory require a member token; Memory Book approve/revoke require host/cohost. UI and `scripts/clickthrough-api.mjs` updated to send tokens; integration tests updated.
- #2 Official standings: `RoomEngine.officialStandings()` (finished + official + non-timed-out, midrank) is now in every projection; browser uses the server value. Ledger game-finished events record `official`.
- #3 Memory Book: persists to `<roomId>.book.json` and restores on restart; `addFromLedger` requires a nonempty game-finished source, derives `derivedFacts` from score events, exports human text as "Note:" and facts under "From the ledger:". `tests/m4.test.ts` updated to cite a real finished game.
- #4 Deadlines: social intents after `deadlineAt` rejected (PHASE_CLOSED); host/cohost can skip a timed-out game via `skipTimedOutGame` / POST `/rooms/:id/games/:gid/skip` — game marked `timedOut`, no scores invented, excluded from official standings; browser shows a host-only skip button for past-deadline playing games.
- #5 Seed: `startGame` defaults to `crypto.randomInt`, not 42; explicit seeds still deterministic in tests.
- #6 Charades: passes advance `promptIndex` within the same turn (max 3, then PASS_LIMIT); Correct ends the turn; game lasts one turn per player (roster-sized, not fixed 4). Decision L15 in `docs/DECISIONS.md`.
- #7 Frontend typecheck: `apps/web/tsconfig.json` (strict) + `apps/web/src/types.ts` (Projection/GameState/RegistryGame/MemoryEntry/LedgerEvent/JoinResponse); `npm run typecheck` now runs server + web checks. Game-specific state is typed as GameState (optional fields) — documented limitation in L16.
- Decisions L10–L17 appended to `docs/DECISIONS.md`.
- Evidence: `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 9 files / 56 passed (was 48, +8 review tests), `npm run build:web` exit 0, API playthrough 11/11, E2E Chromium 12/12, Firefox 12/12, check-multiplayer 12/12, check-f4 11/11, check-f5 30/30 (one driver fix: ledger fetch now goes through the host page with its session token, after the auth change made the unauthenticated ledger fetch return 401), check-mobile 32/32, check-contrast 57/57. Test server stopped and `data/` removed after runs.
- Next: no GitHub reply/publish until Keku explicitly asks; remaining NOT RUN items unchanged (real devices, family-member acceptance, WebKit host libs, Cloudflare, npm audit 403).

## Cron run 2026-11-04 ~07:45 EST (local-dev-christmas-30m — RE-VERIFICATION ONLY, no milestone)
- Tree was clean; per the task board, no local-only board task remains (all F1–F7 local parts DONE; see task board item 7). No new work invented, no app code changed.
- Re-verification evidence: `npm run typecheck` exit 0 (server + web), `npm test` 9 files / 56 passed, `npm run lint` exit 0, `npm run build:web` exit 0 (34 modules), E2E smoke (`node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=smoke`) exit 0, 3/3 passed (closest-wins, math-mayhem, views: championship/TV/Memory Book/reconnect, 4 fictional players, room LTG2NM).
- Test server data/ removed, port 3457 confirmed closed. Working tree clean after the run except this PROGRESS.md entry.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test (no dev tools, no developer in the room). npm audit stays BLOCKED by registry proxy 403; no bypass attempted, not re-tried this run.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Product Completion Sprint — 2026-11-04 ~07:50–08:15 EST (Keku: continue independently, local only, no merge/deploy/publish)
- P1 verification/security: all 7 PR #3 fixes re-verified; WS token moved from URL query to subprotocol header (L18); URL-only WS token rejected 1008; cohost cannot fetch host projection; non-member cannot fetch ledger; official standings verified across many official/practice games. New file `tests/sprint-p1.test.ts` (4 tests).
- P2 feature completion: QR join (qrcode package, lobby QR + code fallback, landing pre-fills ?code=), server championship + day advance + achievements/ceremony in every projection, host override with audit trail, Memory Book PDF (jspdf) + share-image (canvas) exports, disconnected-player finishing (L19), host/cohost game starts, TV now-playing + ceremony. App refactored into `apps/web/src/components/` (GamePanel, ChampionshipView, MemoryBookView); App.tsx is now the shell + lobby + TV. New file `tests/sprint-p2.test.ts` (5 tests).
- P3 design: CSS aligned to Midnight Christmas tokens (#102C25, #245344, #E5BC70, #F7F2E8), 250ms card entrance, reduced-motion respected, iPhone-first (390px screenshots). Contrast re-checked 57/57 WCAG AA after the redesign; mobile 32/32 still passes.
- P4 QA: 138 tests total (was 56, +82 in this sprint): `tests/sprint-scoring.test.ts` (37, scoring/ties/championship maths), `tests/sprint-rules.test.ts` (14, game rules/ties/security), `tests/sprint-sessions.test.ts` (10, full multiplayer sessions + projection secrecy), `tests/sprint-http.test.ts` (12, HTTP security matrix + Memory Book durability). Several of my first-draft expectations were wrong about the actual formulas (midrank single-player = 0, championship base = 5*mean, finale placement 9 = 5, Charades PASS_LIMIT on 4th pass) — the tests were corrected to the verified code, not the code changed to fit the tests. Target 200–300 NOT yet reached; next test batch is more per-game edges + HTTP matrix, not filler.
- P5 visual review: `docs/SPRINT_REVIEW.md` + `docs/sprint-screenshots/` (10 real Chromium 390x844 screenshots: landing/joining, lobby, Impostor, Caption Clash, Trivia, Geography, championship, TV Hub, Memory Book, winner ceremony), via new `scripts/screenshot-sprint.mjs`. Two driver bugs fixed in the run (getByText strict-match failures on "Players"/"TV Dashboard" — switched to heading roles; one F4 breakdown check needed the game id alongside the title). One real UI polish bug found in screenshots and fixed: "First Game Finished — room" now reads "the whole room".
- Full gates after the sprint: typecheck exit 0 (server + web), lint exit 0, tests 138 passed, build:web exit 0, API playthrough 11/11, E2E Chromium 12/12, Firefox 12/12, multiplayer 12/12, F4 11/11, F5 30/30, mobile 32/32, contrast 57/57. F4 failed once during the sprint (breakdown check) and passed after the title+id fix — see above.
- NOT published, merged, deployed, or spent in this sprint. GitHub branch still holds snapshot 853704b; a new snapshot needs Keku's fresh approval.
- EXACT NEXT TASK: (1) continue the test batch toward 200 meaningful tests (per-game edges, HTTP matrix, timeout/abstention cases); (2) then, only on Keku's approval, push a new snapshot to PR #3 for ChatGPT re-review. Do not start a GitHub coordination cycle or reactivate the coordination cron.

## Family Cup championship rules — 2026-11-04 ~08:15 EST (Keku: approved, local only, no GitHub publishing/merging/deployment)
- Implemented the approved rules in `src/scoring/championship.ts` (`CHAMPIONSHIP_CONFIG`, `championshipTotal`, `participationBonus`, `finalePoints`) and `src/scoring/ledger.ts` (`computeChampionship` with finale placements, per-player-per-day aggregation). The old `championshipBase` (best-five / 5×mean) is removed; all callers and tests were updated to the new formula.
- `docs/CHAMPIONSHIP_RULES.md` rewritten as the approved Family Cup rules with the worked Ada/Bea/Cal example recomputed (Ada 255+15=270, Bea 270+0=270, Cal ineligible at 200; Ada wins the total tie on daily wins).
- Browser leaderboard (ChampionshipView) now explains the approved formula and shows, per player, total = best-three sum + participation + finale, with qualifying-day count, counted days, day scores, and daily wins. TV view shows Family Cup totals (falling back to session midrank sums when no championship exists).
- New deterministic tests: `tests/family-cup.test.ts` (23 tests: 3–7 day participation ladder and cap, eligibility, missing/gapped days, zero-score days, ties, 75/25 split, no-team-day handling incl. scaled alternative, finale disabled/enabled/ladder, finale changing the winner, finale giving nothing to ineligible players, end-to-end formula check).
- Evidence: typecheck exit 0 (server + web), lint exit 0, tests 161 passed (was 138, +23), build:web exit 0, E2E smoke Chromium 3/3, F4 11/11. No GitHub publishing, merging, or deployment in this step.
- EXACT NEXT TASK: continue the test batch toward 200 meaningful tests (per-game edges, HTTP matrix, timeout/abstention cases); then, only on Keku's approval, push a new snapshot to PR #3 for ChatGPT re-review.

## Follow-up review 5769121221 fixes — 2026-11-04 ~08:31 EST (Keku: yes, local only, no GitHub publishing/merging/deployment)
- All 6 follow-up issues fixed locally, regression-tests-first where the behaviour was wrong: `tests/review2-fixes.test.ts` (7 tests; 4 failed before the fixes, the Impostor role-aware test already passed because the behaviour was correct but the assertion was weak).
- (1) Docs reconciled: SPRINT_REVIEW.md now notes the 08:20 EST push (2e818f2) and the Family Cup approval, with the per-checkpoint approval rule restated; stale best-five wording removed. (2) QR localhost warning in the lobby; real-phone/LAN verification still NOT RUN. (3) advanceDay guards (no advance during a game, no day 8+). (4) Host-claim token bound to room creation, persisted, enforced on both join routes. (5) PDF per-block pagination via `apps/web/src/components/exportLayout.ts` (tested) + share-image 8-entry label/overflow. (6) Role-aware Impostor assertions at engine and HTTP level, replacing the weak seen<=2 count.
- Full gates (run after the fixes): typecheck, lint, full test suite, build:web, API playthrough, E2E Chromium, F4 — see commit message evidence in git log. No GitHub reply, push, merge, or deploy in this step; a new snapshot needs Keku's fresh approval.
- EXACT NEXT TASK: reply to review 5769121221 on PR #3 (only on Keku's approval) and/or push a new snapshot (only on Keku's approval); otherwise continue the test batch toward 200 meaningful tests.

## Follow-up review snapshot + reply — 2026-11-04 ~08:41 EST (Keku: do either one or both)
- BOTH done: new snapshot pushed to development/first-playable-checkpoint (previous head 2e818f2 verified unchanged, new GitHub commit 6ee074f7e67720b4d7fb839fac2b8c86f677071c, local HEAD 8c01c0d, 85 UTF-8 text files / 808,804 bytes, 2 new, no removals, PNGs excluded) AND a single PR #3 reply comment posted (comment 6632191304, verified by reading comments back — now 2 conversation comments total). Reply covers all 6 follow-up items in order, corrects the Family Cup provenance point (structure approved 2026-11-04, three details configurable), states the fixes are on the branch, and leaves thread resolution to ChatGPT. PR #3 verified open, draft=true, merged=false, head 6ee074f, base main 766e815. Sync record updated (4 entries). No merge, no deploy, no spend.

## Third review 5769441799 fixes — 2026-11-04 ~08:53 EST (Keku: yes, fix locally, no GitHub publishing/merging/deployment)
- All 3 issues fixed locally, regression-tests-first: `tests/review3-fixes.test.ts` (6 tests, all failed before the fixes). (1) championshipDay serialized/restored with old-snapshot default 1, plus an HTTP restart test (day 4 before/after restart, new game lands on day 4). (2) Ceremony is now day-specific with tied winners. (3) PDF paginates lines, share-image notes clamped and truncation flagged; block-level paginateBlocks removed.
- During this session the autonomous local-dev cron's test batch was found untracked (tests/test-batch-200.test.ts, 44 tests); reviewed, verified passing, and committed with these fixes (see L24). Full suite: 216 tests passed (19 files), typecheck + lint exit 0, build:web exit 0. Browser drivers not re-run for this commit (no UI behaviour changed except ceremony winner display and export pagination, both covered by unit tests); E2E/F4 re-run is the next verification step before any snapshot.
- No GitHub reply, push, merge, or deploy in this step; a new snapshot/reply needs Keku's fresh approval.
- EXACT NEXT TASK: re-run E2E Chromium + Firefox and F4/F5 on the committed tree, then (only on Keku's approval) reply to review 5769441799 and/or push a new snapshot.
- Gates on the committed tree: E2E Chromium 12/12, F4 11/11, F5 30/30 (server on 3461; an earlier F4/F5 "1/1 failed" run was a driver mistake — it defaulted to port 3457 where nothing was listening, not a product failure). Firefox E2E not re-run for this commit.
- Also committed: the autonomous cron's E2E driver fix in scripts/e2e-browser.mjs (waits for a real 6-char room code in the header pill instead of the pill element appearing with "Code: …"), which the 12/12 run above used.

## Third review reply — 2026-11-04 ~09:08 EST (Keku: reply to it)
- Single PR #3 reply comment posted (comment 6632759453, verified by reading comments back — now 3 conversation comments total). Reply covers all 3 third-review items with evidence, states fixes are local commit 89306a8 only and NOT on the branch (branch still holds 6ee074f), leaves thread resolution to ChatGPT. No push, no merge, no deploy, no spend. A new snapshot needs Keku's fresh approval.

## M6 (Show Mode & Visual Experience) — M6.1–M6.3 + M6.5 partial, 2026-11-04 ~10:15 EST (local only)
- M6.1 audit in docs/M6_PLAN.md (8 findings: landing steps, lobby scroll, no waiting state, no show states, scattered host controls, TV text dump, plain player pills, no reactions/settings). Family Cup, championship-day persistence, day ceremonies, Memory Book pagination untouched.
- M6.2 foundation: ShowIntro (per-player, auto-advances 8s) / ShowWaiting (counts only) / ShowResults (staggered reveal, official-vs-practice note); LivingLobby ornaments (stable colour per player, presence, tap-to-sparkle local only); SettingsBar (sound off by default, animation full/reduced/off + prefers-reduced-motion); landing rewritten as steps.
- M6.3 signature interactions: Impostor flippable private role card (button flip, keyboard accessible); quiz answer tiles; Year timeline slider + numeric alternative; Closest dial + numeric alternative. Connections tap grouping kept (drag deferred, L29).
- M6.5 reactions: server routes in http.ts (allowed set, rate limits, host mute, 15s ephemerality), Reactions component on lobby/TV/results only.
- Server: GameInstance.submittedPlayers + public submittedCount/totalPlayers (room.ts); projectFor() merges reactions into every projection send (http.ts).
- Tests: tests/m6-showmode.test.ts (5 tests: phase order, ornament stability, waiting-count privacy, reaction set/rate-limit/mute, no score effect). Full suite 221 tests passed (20 files), typecheck + lint exit 0, build:web exit 0.
- Browser: scripts/check-m6.mjs 9/9 (landing steps, lobby, intro, gameplay, waiting with counts, results, back to lobby, reactions); E2E Chromium 12/12 after driver learned Show Mode (L30); M6 screenshots 8/8 in docs/m6-screenshots/ (landing, lobby, intro, trivia tiles, waiting, results, reactions, impostor role).
- Real bugs found and fixed during M6: (1) GamePanel sat inside the lobby-phase fragment so gameplay phase hid it; (2) myProgressDone missed Trivia answers (extra.answers) and state questions; (3) stale 3461 server (pre-reactions build) masked the reactions route until killed and restarted; (4) waiting-as-replacement hid phase changes (L26).
- Exact next task: M6.4 — apply the shared design system + per-game personalities to the remaining games, restyle championship/TV/Memory Book as stage views, then M6.5 polish and M6.6 verification + full visual review package (iPhone + TV/desktop). No GitHub action taken for M6; branch still holds 6ee074f.

## M6 visual freeze — 2026-11-04 ~10:27 EST (owner direction)
- Visual direction changed: owner is not satisfied with the current look (too monochromatic, heavily green, prototype-like). Do NOT continue propagating the current design system across remaining games.
- Preserved: all M6 functionality, Show Mode, reactions, gameplay interactions, automated tests; code stays committed locally at f0584c6. No GitHub action.
- New constraint (L31): no large UI restyling or visual-theme decisions until the owner supplies approved visual references and a design system.
- Handoff written: docs/DESIGN_HANDOFF.md — frontend structure, current styling approach (plain CSS, tokens, layout, motion), constraints a new design must accommodate (server-authoritative, per-player vs TV projections, secret handling, touch/accessibility floors, $0 assets, performance envelope, stable test hooks), and the nonvisual backlog.
- Exact next task (nonvisual only): host-recovery edge cases, then deadline/timeout behaviour; M6.4 restyle is ON HOLD.

## Cron run 2026-11-04 ~10:45 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked the nonvisual backlog item "WS reconnect robustness" from the M6 freeze section. M6.4 restyle stayed ON HOLD per L31 — no UI text, layout, or styling changed.
- Bug fixed (client, `apps/web/src/App.tsx`): a dropped WebSocket used to stay dead for the session. Polling kept the UI fresh, but the server had marked the player "(away)" and excluded them from startGame's connected-player count until the manual Reconnect button was hit. The client now reopens the socket on close with capped exponential backoff (1s/2s/4s/8s, then 10s) from new `apps/web/src/components/wsBackoff.ts`, reading the session token fresh from sessionStorage on each attempt (never in a URL). A 1008 close (server rejected the session/room) is NOT retried; polling and manual reconnect remain. Effect cleanup stops all retries and closes the socket. Decision L32 in `docs/DECISIONS.md`.
- New tests: `tests/ws-reconnect.test.ts` (3 tests: backoff doubling and 10s cap). New driver: `scripts/check-ws-reconnect.mjs` (`npm run check-ws-reconnect`, Chromium, 2 fictional players) — it intercepts the guest's first WS connection via Playwright routeWebSocket, closes it once, and verifies: guest marked "(away)" on the host's view, then "(away)" clears with NO manual Reconnect click, then the host can start Trivia (min 2 connected players).
- Evidence: `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 21 files / 224 passed (was 221, +3), `npm run build:web` exit 0, `node scripts/check-ws-reconnect.mjs` exit 0 (4/4), E2E smoke Chromium 3/3 passed after the App.tsx change. Test server data/ removed, port 3457 confirmed closed.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist, family-member acceptance test. Remaining nonvisual backlog: per-game abstention semantics refinement (L13), host-recovery edge cases, deadline/timeout behaviour. M6.4 restyle ON HOLD pending owner visual references/design system.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~11:15 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked the nonvisual backlog item "per-game abstention semantics refinement" (L13 open item, now decision L33). M6.4 restyle stayed ON HOLD per L31 — the only UI addition is functional (one secondary button + one note line, existing styles, no palette/layout/theme change).
- Feature: explicit `abstain` intent, never silence (a silent connected player still blocks until deadline/host-skip). An abstain counts toward the current advancement threshold and scores 0 for what was skipped; the game still finishes normally and still counts as official. Per game: Impostor clue/vote abstentions are per-phase (all-abstain vote convicts nobody → impostor wins, same as a tie; convicted impostor abstaining from the guess forfeits it → honest wins); Caption submit/vote abstentions are per-round (submit abstainer earns no 25-point participation credit); Closest abstention is per-question; Trivia/Who Said That/Geography/Year/Connections/Sprint/Math abstention is whole-game ("sit out the rest", later answers rejected ALREADY_ABSTAINED, and a game whose others already finished settles immediately on the abstain); Charades rejects abstain as NOT_APPLICABLE (Pass already exists). Abstentions are audited (`player-abstained` ledger events); projections reveal only the abstainer's own status.
- Two real bugs found and FIXED in this run (not driver issues):
  1. `finishGame` did not normalise rawScores: scoring helpers only list players who earned points, so a player who abstained from everything vanished from rawScores instead of standing at 0 (hit caption + closest tests). Fixed: every game player now gets an entry, default 0.
  2. Player projections (`myGames`) never included `rawScores`, so ShowResults and the finished panel always rendered empty scores — a pre-existing gap the new abstain driver caught (finished view showed "Results" with no score rows). Fixed with the same finished-only policy as the public games list (finished/revealed only, never pre-reveal).
- Driver pitfalls fixed in this run — NOT app bugs: the first check-abstain run stalled on the finish check because Show Mode replaces the game panel with the results screen, so the panel locator never resolved (30s textContent timeouts per loop iteration); the driver now treats visible `show-results` as finished, and reads scores from the results screen with panel fallback. The first E2E-style assumption (panel "Status: finished") is documented in the driver header.
- One pre-existing lint error fixed en passant: `scripts/check-ws-reconnect.mjs` had an unused `label` argument (renamed to `_label`); it was not introduced by this run but the gate needs lint at 0.
- Evidence: `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 22 files / 238 passed (was 224, +14 abstention tests), `npm run build:web` exit 0, `node scripts/check-abstain.mjs` exit 0 (5/5: button offered, sat-out note, button hidden, host finishes alone, abstainer scores 0), E2E smoke Chromium 3/3 passed. Test server data/ removed, port 3457 confirmed closed.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist, family-member acceptance test. Remaining nonvisual backlog: host-recovery edge cases, deadline/timeout behaviour. M6.4 restyle ON HOLD pending owner visual references/design system.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~11:45 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean; worked the nonvisual backlog item "host-recovery edge cases". M6.4 restyle stayed ON HOLD per L31 — the only UI changes are functional (Make-cohost button now also shown to a cohost; one plain muted note when the host is away), existing styles, no palette/layout/theme change.
- Two real bugs found and FIXED in this run (tests-first: new `tests/host-recovery.test.ts` failed 3/4 before the fixes):
  1. Cohost could not delegate: `grantCohost` required the host exactly, so a room whose host had disconnected lost its only operator path if the cohost needed to hand over. Fixed: host OR cohost may grant cohost (audited `cohost-granted` with the granting actor); regular players still cannot. Granting never transfers host ownership — `hostId` is unchanged.
  2. Restart resurrected phantom players: snapshot restore kept `connected=true` for every player even though no WebSocket exists after a restart, so phantom players counted toward `startGame` minimums and blocked games from advancing until a deadline/host-skip. Fixed: `loadSnapshots` marks every restored player disconnected; each recovers explicitly via `/reconnect` or a fresh WebSocket open (the browser auto-reconnect already does this).
- Invariants verified (already correct, now covered by tests): a disconnected host keeps `hostId`, a new joiner cannot claim host with `asHost` while a host exists, and the original host regains authority by reconnecting with their token; after a restart, host + guest reconnect via `/reconnect` and the host can then start Math Mayhem.
- Evidence: `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 23 files / 242 passed (was 238, +4 host-recovery tests), `npm run build:web` exit 0, E2E smoke Chromium 3/3 passed (room U9ZWVK). Harness note, NOT an app bug: the first E2E invocation failed with MODULE_NOT_FOUND because the server was backgrounded with `&` across the whole `cd && ...` chain, so the driver ran from the home directory (same pattern as the 2026-11-04 ~05:45 run); re-ran with the server as a separate background process and it passed. Test server data/ removed, port 3457 confirmed closed.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist, family-member acceptance test. Remaining nonvisual backlog: deadline/timeout behaviour. M6.4 restyle ON HOLD pending owner visual references/design system.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Mchezo approved UI integration — Phase 2 checkpoint (2026-11-04, local only)

Owner direction 2026-11-04 11:57 EST: the application is officially named **Mchezo** and its visual identity is **The Circle**, from the approved React/TypeScript handoff in `workspace/user/files/mchezo-ui-handoff.zip`. This was an integration task, not a rewrite: Phase 1 audit, Phase 2 first checkpoint (branding + everyday tokens, landing/joining, Circle lobby, Trivia phone gameplay/waiting/results, Trivia TV stage), Phase 3 verification, then STOP visual expansion. No GitHub push/merge/deploy/spend; branch still holds 6ee074f.

- Phase 1 (complete): handoff extracted to `docs/mchezo-handoff/mchezo-ui/` (reference copy; its node_modules removed after the typecheck). Handoff `npm run typecheck` exit 0 in its own folder. Integration plan: `docs/MCHEZO_INTEGRATION_PLAN.md` (9 documented deviations: 6-char room codes not 4; no per-question timer — ring shows server `deadlineAt`; no per-question reveal — results only at game finish; waiting is counts-only per L27, so the handoff WaitingCircle is NOT used; answer distribution is aggregate-only post-finish via new server field `answerCounts`; reaction ids mapped to the server emoji set; nudges made real via an ephemeral server endpoint, not a local-only bubble; TV toggle opens the TV stage view on this device (no separate TV pairing exists); everyday theme everywhere in Phase 2, Family Cup as event data not platform skin).
- Phase 2 (complete): handoff `src/` copied to `apps/web/src/ui/mchezo/` (the integrated copy we own; minimal adaptations: LandingScreen `codeLength`/`codePattern` props, `extra` slots on Lobby/Question/PhoneReveal screens, one lint fix in tv/tv.tsx). Fonts self-hosted via `@fontsource-variable/unbounded` + `@fontsource-variable/figtree` ($0). Server: finished-Trivia projections include `correctIndex` and aggregate-only `answerCounts` (public + player branches, post-finish only — playing projections expose neither); ephemeral `POST /rooms/:id/nudge` (400 invalid/self, 429 if <3s since last nudge; target-only `nudgedBy` <10s old; never persisted/ledger/scored). Web: `apps/web/src/components/mchezo/` adapters + `MchezoTrivia.tsx` (8s intro matching old ShowIntro timing; first-unanswered question; locked view with LOCKED IN stamp; counts-only waiting; results with per-question picker, server `myScore` total, explicit note that standings are this game's raw scores and Family Cup totals live in Championship) + `MchezoTv.tsx` (featured question while playing; DirectorBar question/reveal/leaderboard after finish; `useLeaderboardPhases`; auto-director follows game status). `App.tsx`: landing, lobby, Trivia intro/gameplay/waiting/results, and TV branches render Mchezo; the old lobby JSX block was removed as dead code (LivingLobby component file remains, unused by App). All other games, ChampionshipView, MemoryBookView, reactions, achievements, and championship rules untouched; Family Cup rules (L21) unchanged — the handoff's placeholder 750-point awards and mock room data never entered production logic.
- Phase 3 verification (all green unless noted): `npm run typecheck` exit 0, `npm run lint` exit 0, `npm test` 24 files / 250 passed (242 + 8 new `tests/mchezo-integration.test.ts`: playing-Trivia secret isolation, finished-Trivia reveal + counts, server-side answer lock, host/participant start permissions, nudge rules incl. 429, join-by-code + token reconnect, `rankStandings` ties [1,1,3], practice exclusion from `officialStandings()`), `npm run build:web` exit 0 (pre-existing jspdf chunk-size warning only). Browser, Chromium, real server, fictional players: `scripts/check-mchezo.mjs` (new, `npm run check-mchezo`) 31/31 — landing, 4/8/10-player lobbies, no overflow at 320/360/390, disconnection → Away/reconnecting, Trivia lock + Next + counts-only waiting (1/4) + results standings + picker, TV auto-switch on start + leaderboard after finish + back to phone, reduced-motion root attribute; `scripts/e2e-browser.mjs` E2E ALL PASSED (11 games + views incl. Mchezo TV stage); `scripts/check-m6.mjs` 10/10 (rewritten to the Math journey — the Trivia journey is check-mchezo now); `scripts/check-ws-reconnect.mjs` 4/4; `scripts/check-abstain.mjs` 5/5 (rewritten to Mchezo Trivia); `scripts/check-f4.mjs` 11/11; `scripts/check-multiplayer.mjs` 12/12; `scripts/check-mobile.mjs` 32/32; `scripts/check-contrast.mjs` 64 pairs, 0 failed.
- Screenshots of the actual integrated app (not mockups): `docs/mchezo-screenshots/` 01-landing, 02-lobby, 03-trivia-question, 04-trivia-locked, 05-trivia-waiting, 06-trivia-results, 07-tv-question, 08-tv-leaderboard (via new `scripts/screenshot-mchezo.mjs`, `npm run screenshot-mchezo`). Verified by eye: Circle ring, "Play together.", "You're in, Ada.", Family Cup Day 1 of 7 badge, tied rank-1 standings with shared ranks, aggregate "How the room answered" counts, Q1–Q10 picker with ✓/✗, TV director bar with auto-director.
- Driver/harness fixes found during Phase 3 (NOT app bugs, except where noted): (1) share-chip room-code read raced the projection (chip renders "…" first) — all drivers now poll the aria-label until it matches 6 alphanumeric; (2) e2e `actTrivia` burned its guard on the last-answer locked view — it now clicks "Waiting for the game to finish" and returns; (3) finished pages show ShowResults instead of the panel — f4/f5/multiplayer/contrast now accept show-results as finished, and dismiss results before the next start; (4) "TV stage" exists ONLY in the Mchezo lobby extra — clicks from championship/memory/old-TV/non-Trivia-game views still use the old nav row's "TV Dashboard" (an earlier blanket rename was reverted for those); (5) host's own seat renders "You", not their name — roster checks use the lobby heading for the host and seat text for others; (6) mobile target failures were transient entrance/arrival animations (settled targets are ≥44px — verified by probe: chip button exactly 44px at rest) — check-mobile now settles 1200ms before measuring; (7) contrast sampler could not parse CSS Color 4 `color(srgb …)` for the seat-name overlay — parseRgb now handles it (effective contrast ~16:1, passes); one transient coral pair (193,86,69) appeared once in an early contrast run and did not reproduce in two later runs — noted, not chased; (8) reduced-motion gate measured duration only while index.css pairs `transition: none` with a later 150ms duration rule — the gate now accepts property-none OR duration-0s (no transition actually runs). The old index.css reduced-motion contradiction (line 25 `none` vs lines 60–62 `150ms`) is left as a cleanup item, not silently resolved.
- Real app fixes during Phase 3 (in the integrated Mchezo copy only): extensionless relative imports failed our node16 web tsconfig — all `ui/mchezo` imports now use `.js` extensions; two strictness errors fixed (`standings.ts` indexed access, `tokens.ts` answerDeep fallback to the answer colour).
- Known product gaps surfaced (not fixed — they are behaviour, not Phase 2 scope): (a) the TV stage is reachable from the lobby, not mid-game — a player on a Trivia question screen has no TV button; the TV viewer in check-mchezo switches to TV before the game starts and the stage auto-switches on start; (b) the Mchezo lobby shows only the up-next game prominently — the full 11-game picker lives in the lobby extra below; (c) mid-game TV viewers who never answer block finishing (they must answer or abstain like any player); (d) the old green-heavy design still serves all non-Trivia games, Championship, Memory Book, and the old TV dashboard until a later phase integrates them — per the checkpoint instruction, visual expansion STOPS here.
- F5 full-day playlist (`scripts/check-f5.mjs`) ALL PASSED 30/30 after the checkpoint: 11/11 games finished in one room, 11/11 ledger finish events, TV projection all finished, championship + Memory Book export good. Its TV/Memory sections were updated for the Mchezo stage (see design note below): after any finished Trivia game, the TV view is the Mchezo Trivia stage, not the old dashboard — so F5 now asserts the stage's Trivia leaderboard and returns via 'Back to phone view' before Memory Book.
- Design note (unresolved, not an app bug): the TV branch picks the latest playing/finished Trivia game as its subject even when a newer non-Trivia game finished later, so once trivia has been played, the old TV dashboard's 'Recent games' list is unreachable in that room. A later phase may need a TV subject picker or a recent-games strip on the stage; Phase 2 scope stops here.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (now including the Mchezo screens on a real iPhone), family-member acceptance test, WebKit, npm audit, Cloudflare, real-phone QR/LAN test.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~13:45 EST (local-dev-christmas-30m — COMPLETED with commits)
- Tree was clean at start (HEAD 15d226d); worked the remaining nonvisual backlog item "deadline/timeout behaviour". M6.4 restyle stayed ON HOLD per L31 — the only UI addition is functional (host skip button + note, existing Mchezo styles, no palette/layout/theme change).
- Two real gaps found and FIXED (tests-first for the engine one):
  1. Math Mayhem checked only its own 5-minute clock from `startedAt`, not the game's `deadlineAt`, so a past deadline with a recent start did not stop Math answers while every social game stopped. Fixed in `src/server/room.ts`: Math now uses `deadlineAt` when present, falling back to the 5-minute `startedAt` window only for legacy games without a deadline. New `tests/deadline-timeout.test.ts` (5 tests) failed 1/5 before the fix (math-after-deadline accepted) and passes 5/5 after; it also covers the legacy fallback, skip-unblocks-next-game, and past-deadline-blocks-new-game.
  2. The Mchezo Trivia waiting view had no host skip button (only the old ShowWaiting banner did), so a stalled Trivia game could not be skipped from the UI that plays it. Fixed in `apps/web/src/components/mchezo/MchezoTrivia.tsx` (+ `isHostOrCohost` prop wired in `apps/web/src/App.tsx`): all three waiting states (sat-out, locked, all-answered) now show the host-only "Skip timed-out game (no scores invented)" button once past deadline, and a note for guests. Decision L36 in `docs/DECISIONS.md`.
- Driver bug found and FIXED in this run — NOT an app bug: E2E smoke first ran 2/3 because its views check assumed a Trivia game had been played and waited for the Mchezo TV stage, but smoke plays only math + closest, so the app correctly falls through to the old TV Dashboard. `scripts/e2e-browser.mjs` now accepts either TV view in the views check (stage + "Back to phone view", or dashboard + "Lobby & Games"). Smoke re-ran 3/3 after the fix.
- Commit note, recorded honestly: when this run went to commit, the core deadline files (`src/server/room.ts`, `apps/web/src/components/mchezo/MchezoTrivia.tsx`, `apps/web/src/App.tsx`, `tests/deadline-timeout.test.ts`) were already committed as 96554ea (Nomai, 13:51 EST, "Deadline/timeout: one deadline governs all games + host skip on stalled Trivia") — this run did NOT make that commit and did not re-commit those files. This run's commit covers only the E2E driver fix plus this PROGRESS entry and decision L36.
- Evidence: `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 25 files / 255 passed (was 250, +5 deadline tests), `npm run build:web` exit 0, E2E smoke Chromium 3/3 (room KGN5SX), `scripts/check-mchezo.mjs` ALL PASSED. Test server data/ removed, port 3457 confirmed closed.
- Untracked file left untouched (not this run's): `scripts/check-tv-spectator.mjs` was already untracked at run start; it was not reviewed, committed, or deleted here.
- Remaining (unchanged, need real devices / a family member, NOT doable from this VM): manual real-device checklist (now including the Mchezo screens on a real iPhone), family-member acceptance test. Remaining nonvisual backlog: none identified in this run beyond the known product gaps in the Mchezo checkpoint (TV subject picker, TV button mid-game, full 11-game picker prominence). M6.4 restyle ON HOLD pending owner visual references/design system.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Mchezo Phase 2.1 checkpoint (2026-11-04, local only, owner assignment 13:49 EST)
- Scope per assignment: no visual-system redesign, no restyle expansion to the other ten games, no permission/catalog/scoring/deadline/order changes, no client-only reveal, no push/merge/deploy/publish/spend. All seven items addressed; decisions L37–L39 in `docs/DECISIONS.md`.
- §1 TV spectator — INVESTIGATED, no app change needed. The Phase 2 TV leaderboard "TV" row (120 points) was test data: `scripts/screenshot-mchezo.mjs` joins a fifth player literally named TV and answers Trivia for that page — TV scored by playing, not by viewing. Verified in `scripts/check-tv-spectator.mjs` 15/15: an unjoined page sees landing only (no TV button, creates nobody); joining adds exactly one participant; opening/closing the TV stage adds/removes nobody (pure client view switch); a TV-view player who never answers scores 0; identical answers give identical scores (deterministic — per-game seeds vary, first-option answers can score 0); refresh restores the same slot via the session token, no duplicate; close + reopen without the token cannot retake the name (refused — slot still exists), a new name is a new slot and the old slot shows Away. Server facts: `join` rejects duplicate names and caps 10 players; `activePlayers` = connected players (fallback all if none connected), so a connected TV-viewer who hasn't answered DOES block auto-finish (game stayed `playing`), a disconnected one does not, and host skip after `deadlineAt` or abstention unblocks. GAP (not fixed): there is still no true spectator mode — watching TV today requires occupying a player slot (capacity + completion-blocking while connected). Recommendation, not implemented: a server spectator role (TV projection only, no game membership, no score, never blocks); do not fake it client-side.
- §2 Lobby simplification — DONE. The 11-game × 3-button list is replaced by: the Circle's Up next display, one prominent Start (host/cohost only; guests see only "Waiting for the host to start"), one Official/Practice segmented control (host/cohost only), and one "Choose a different game" button opening a compact selector (one button per game: title + players + duration, no tutorials, no per-game start buttons; current up-next marked `aria-current`). Selecting sets up-next and closes. Ordinary players see no setup card at all. Permissions and the game catalog unchanged; Start test id follows game + mode (`start-<mode>-<id>`). Files: `apps/web/src/App.tsx` (gameMode/chooserOpen state, setup card), `apps/web/src/ui/mchezo/components/phone/screens.tsx` (LobbyScreen `startTestId` prop). All drivers updated for chooser starts (non-trivia: chooser → `select-game-<id>` → `start-<mode>-<id>`).
- §3 Question vs game results — DONE. Root cause: PhoneRevealScreen accepted points but MchezoTriviaResults never passed them, so "Not this time" sat beside "1st" with no separation. Server now computes `questionPoints` for finished Trivia only (exact scorer call; web code deliberately does NOT import the trivia question bank, which would leak correctIndex to clients) and projects it beside `answerCounts`; type added to `PublicGame`. Results now read: "This question: you answered X — correct, +N points / not correct, +0 points / you didn't answer"; "Your game total: M points · Game rank: 1st, tied with K others. The rank is for the whole game, not this question."; footnote "Standings below are whole-game totals, ranked with shared ranks for ties — not this question's points." New unit test: finished Trivia exposes `questionPoints` for all 10 questions and each rawScore equals the sum over questions answered with the correct option. Scoring fact confirmed: each correct answer = 120 (100 + 20 speed bonus at the fixed 3000ms reference).
- §4 Leaderboard scenarios — DONE. Unit: `tests/standings.test.ts` 4/4 (middle ties 1,2,2,4; all tied all rank 1; pair ties 1,1,3,3; rank movement +1/−1/0). Live: `scripts/check-leaderboard.mjs` 10/10, phone + TV compared against server rawScores — all tied (rank 1 all), pair ties (1,1,3,3 on both screens), rank changes across 3 games (Ada>Bea → Bea>Ada), disconnected player (row preserved with her partial result; TV included her with the server score). Findings: (a) phone results standings are truncated by design (top 2 + you; TV shows all rows) — every visible row matched the server exactly; (b) results rows carry no Away/offline marker (lobby does); (c) TV movement indicators are degenerate as wired — MchezoTv passes `delta = score`, so before-ranking is all-tied at rank 1, movement can only show down-moves and "Biggest climb" can never fire; the phase animation itself works. Recommendation: pass genuine previous totals if cross-game TV movement is wanted.
- §5 TV stage lifecycle — FIXED. Root cause: the TV branch picked the latest playing/finished Trivia anywhere in history, so finished Trivia permanently hijacked the TV. Rule now: TV subject = latest game overall; Mchezo stage only while Trivia is the latest game (playing/finished), otherwise the old TV Dashboard (Now playing + Recent games + Family Cup standings) — a legitimate lobby/show view. Stage keyed by game id so director state resets per game; host start/finish actions drive every TV viewer through server state alone. Verified `scripts/check-tv-lifecycle.mjs` 7/7: lobby → dashboard ("No game in progress"); trivia starts → stage; trivia finishes → leaderboard; host starts Math → dashboard naming Math Mayhem; Math finishes → dashboard with Math in Recent games; trivia restarts → fresh question stage (not the old leaderboard). This also resolves the Phase 2 design note (Trivia hijacking Recent games) — no separate TV picker was needed. check-f5's TV section reverted to dashboard expectations accordingly.
- §6 Trivia reveal gap — REPORTED, not built (see `docs/TRIVIA_REVEAL_GAP.md`). Supported today: 10 questions at start, any-order answers, one-per-question lock, 5-minute deadline with late rejection, finish on all-answered-or-abstained or post-deadline host skip (no early finish), fixed 120/correct scoring at finish, post-finish key/counts/points only, counts-only waiting, TV director replaying finished data. Missing: per-question phase state, per-question timer, live TV reveal, host reveal control. Feasibility: a display-only staged reveal (reveal a question's key + aggregate counts once all connected players answered it, or on host manual reveal) changes NO rule — scoring, deadline, any-order answering, ties all untouched — because revealing Q1 cannot help Q5. Gated progression and per-question timers WOULD be rule changes and are not proposed. Recommendation: implement display-only staged reveal as Phase 2.2 (server `revealed` set + projection, phone revealed state, TV live reveal stage, host reveal control, secrecy + sync tests); defer gated progression/timers pending owner decision.
- §7 Landing cleanup + mobile/a11y — DONE. Landing footer trimmed from a 4-clause explanation to one line ("No account needed — just the 6-character code from the host."); primary actions unchanged and obvious (Host a game / Join the game). Re-verified: check-mobile 32/32 (320/360/390 layouts, ≥44px targets at rest), contrast 64/64 (see L39 fix below), reduced-motion gate in check-mchezo.
- Contrast fix (L39, found in gates, not in the assignment): the Phase 2 "transient coral pair, noted not chased" reproduced (3 of 4 runs) and was root-caused to the Start Keycap's 200ms disabled→enabled background-color transition passing through failing mid-transition colours (rgb(193,86,69) 4.14:1, rgb(166,77,67) 3.32:1, text "Start Trivia Showdown"). Keycaps no longer transition background-color (press feedback is transform + box-shadow, unchanged). Contrast 64/64 in 3 consecutive runs after the fix. Correction to the Phase 2 note: a transient failing state is a real failure, not flake.
- Evidence (final tree): typecheck exit 0, lint exit 0, `npm test` 26 files / 260 passed (was 255: +4 standings, +1 questionPoints), build:web exit 0; drivers check-mchezo ALL PASSED, check-tv-spectator 15/15, check-leaderboard 10/10, check-tv-lifecycle 7/7, e2e Chromium 12/12, check-m6 10/10, check-ws-reconnect 4/4, check-abstain 5/5, check-f4 11/11, check-multiplayer 12/12, check-mobile 32/32, check-contrast 64/64 (×3), check-f5 30/30. New package scripts: check-tv-spectator, check-leaderboard, check-tv-lifecycle. Fresh screenshots `docs/mchezo-screenshots/` 01–08 (landing with the one-line footer; lobby with the compact Game setup card; results with the clarified question/total/rank copy; TV leaderboard all-tied). Note: the screenshot driver still joins a fifth player named TV who answers — its seats/rows are test players, consistent with §1's finding.
- Remaining gaps (unchanged + new): no true spectator mode (§1); TV movement indicators degenerate (§4c); no per-question reveal (§6, proposed Phase 2.2); results rows lack an Away marker (§4b); TV stage still reachable from the lobby only, not mid-game; non-Trivia games, Championship, Memory Book, and the old TV dashboard still carry the old design (visual expansion stops here per assignment); the old index.css reduced-motion contradiction left as a cleanup item; real-device checklist, family acceptance, WebKit, npm audit, Cloudflare, real-phone QR/LAN still outstanding.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~15:15 EST (local-dev-christmas-30m — COMPLETED with commit)
- Tree was clean at run start (HEAD 7dd7a25); worked the Phase 2.1 §4b gap "results rows lack an Away marker" — the smallest remaining gap that closes end-to-end without a new feature or any restyle (M6.4 stays ON HOLD per L31; no palette/layout/theme change — the marker is text + the existing offline badge).
- Change (functional only): phone results (`StandingsList` in `apps/web/src/ui/mchezo/components/Results.tsx`) and TV leaderboard (`TVLeaderboard` in `apps/web/src/ui/mchezo/components/tv/tv.tsx`) now show a disconnected player with the offline token badge plus a separate "Away" span beside the name. The marker is its own element, NOT inside the name span, so existing score readers (phone/TV row parsers) are unaffected. No server change needed: the public projection already carries `connected` per player, and the adapter already maps it to `connection`.
- Driver: `scripts/check-leaderboard.mjs` gains a closing scenario (after the existing Dee-disconnect section): Cal answers all 10 Trivia questions, closes the page, host/Bea/TV abstain, game finishes; Cal is the only scorer (rank 1), so his row is visible on truncated phone standings as well as the full TV board. New checks (4): Cal disconnected with a positive score, Cal rank 1, phone results mark Cal Away, TV leaderboard marks Cal Away. One driver fix inside the scenario: TV is returned from the stage to the phone view first, or it has no abstain button.
- Concurrency notes, NOT app bugs (read before assuming this run's tree): (1) a second session worked in this same tree during the run — it committed 6f48f8f "Milestone A" on master mid-run and holds uncommitted changes to App.tsx, MchezoTv.tsx, types.ts, screens.tsx, http.ts, room.ts, package.json, DECISIONS.md plus untracked spectator files (check-spectator/screenshot-spectator/spectator.test.ts, screenshot 09). This run's commit stages ONLY its own files (Results.tsx, tv.tsx, check-leaderboard.mjs, this PROGRESS entry); the other session's files are untouched, and no DECISIONS.md entry was added here because that file is concurrently edited (decision rationale lives in this entry instead). (2) The first driver attempt failed for harness reasons: the backgrounded test server was SIGTERMed (exit 143) mid-run, so game 1 never finished — not an app failure. Verification was redone in an isolated worktree (HEAD + only this run's 3 files, own node_modules symlink, own port 3471, own data dir) so the concurrent session's server (port 3461) and edits could not contaminate it; the worktree was removed after. (3) `data/` in the main tree was deliberately NOT deleted this run — it is git-ignored and shared with the concurrent server.
- Evidence (isolated worktree, HEAD 6f48f8f + this run's files): `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm run build:web` exit 0, `scripts/check-leaderboard.mjs` 14/14 (was 10/10 + 4 new Away checks), E2E smoke Chromium 3/3 (room A6PPAP). Main-tree gates before the worktree run: typecheck exit 0, lint exit 0, `npm test` 26 files / 260 passed, build:web exit 0. Worktree server on 3471 confirmed stopped after the runs.
- Remaining gaps (updated): §4b Away marker DONE. Still open: no true spectator mode (§1 — a concurrent session appears to be working on it; do not duplicate), TV movement indicators degenerate (§4c), no per-question reveal (§6, proposed Phase 2.2 — the next candidate nonvisual task), TV stage reachable from lobby only, old design on non-Trivia games/Championship/Memory Book/old TV dashboard, index.css reduced-motion contradiction, real-device checklist, family acceptance, WebKit, npm audit, Cloudflare, real-phone QR/LAN.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.


## Autonomous assignment — Milestone C: TV presentation + results (2026-11-04 evening, local only, commit PENDING on environment)

- Scope: C.1 realistic TV leaderboard scenarios, C.2 real rank movement, C.3 Away indicators, C.4 phone results organization, C.5 TV entry during an active game. Decision L41 in `docs/DECISIONS.md`.
- C.2 design: movement is measured against the previous finished game of the same type in the room (`previousGameScores`, pure function in `apps/web/src/ui/mchezo/lib/standings.ts`). No such game means no movement at all — no arrows, no gain chips, no movement note. Same-type only; newly-entered players get no gain chip. Gains are sign-aware on both surfaces (`+N` / `−N`; the old `+{delta}` rendering would have printed "+-120" for a drop). The helper lives in standings.ts, not adapters.ts: adapters imports the `.tsx` component index for types, which breaks the root `tsc --noEmit` (no jsx) when a test imports it.
- C.1: check-leaderboard gained a seeded distinct-scores game (seed 1 → options 0/1/2/3 score 600/360/0/240, ranks 1/2/3/4, zero-point player included) and a movement game (same seed, Ada/Bea options swapped → Bea ▲1 +240, Ada ▼1 −240, phone gain chips +240/−240, movement note present; first game asserts no note). Screenshots `docs/mchezo-screenshots/10-tv-quality.png` (distinct scores + real movement + Away row) and `11-phone-results.png` (question/game separation + gain chips + TV stage button + collapsed "About these standings" disclosure) via new `scripts/screenshot-tv-quality.mjs`. All fixture data.
- C.3: needed no new code — both surfaces already render Away markers from `player.connection === "disconnected"` and the Phase 2.1 driver already asserted them; coverage kept green.
- C.4: "This question:" and "Your game total:" lines stay visible; the standings footnote + picker guidance moved into an "About these standings" `<details>`.
- C.5: new `scripts/check-tv-entry.mjs` (all passed): question screen → TV stage → back returns to the question screen with progress intact, game finishes with both players scored, results screen → TV stage → back returns to results. Entry is a pure client view switch; no game state touched, no restart possible.
- Evidence: typecheck exit 0, lint exit 0, build exit 0, 271 unit tests (27 files; +4 `previousGameScores` tests). Drivers green after the C changes: check-mchezo, check-spectator, check-tv-spectator, check-tv-lifecycle, check-m6, check-leaderboard (all passed, incl. all new C scenarios), check-tv-entry (all passed).
- ENVIRONMENT BLOCKER (not a code failure): after the check-m6 pass the exec session was interrupted, and since then no browser engine launches here — Chromium headless shell dies SIGTRAP (exit 133) on any headless run with `mmap() failed: Operation not permitted` and a CFI abort in single-process mode; full Chrome binary same; Firefox SIGSEGVs at startup under Playwright. Child-process file writes also fail intermittently with EPERM (git object writes, python/node writes, vitest workers), while shell-builtin redirects and file-tool writes still work. Consequence: the following regression drivers did NOT re-run after the C changes (all were green at Milestone B) — check-ws-reconnect, check-abstain, check-f4, check-multiplayer, check-mobile, check-contrast, e2e, check-f5 — and the Milestone C commit itself is BLOCKED (git object writes fail with EPERM). The complete C change sits uncommitted in the working tree; the tree is intact and verified by `git status` / `git diff --stat` (11 tracked files, +274/−45, plus 4 new files). RE-RUN the outstanding drivers AND commit as soon as the sandbox recovers; do not treat Milestone C as fully regression-clean until then.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Autonomous assignment — Milestone E: identity + persistence audit (2026-11-04 evening, docs only, local only, uncommitted)

- Deliverables: `docs/IDENTITY_AND_PERSISTENCE_AUDIT.md` (all 15 audit questions answered from the code) and `docs/PLAYER_HISTORY_ARCHITECTURE.md` (target schema + adoption plan). No code changed, no scoring rule changed, no password auth, no destructive migration, no parallel system.
- Headline: Mchezo has no player identity — only room-scoped slots (`player-N`) addressed by a bearer recovery token living in one tab's sessionStorage. All history is derived at projection time from one room's games. Lost token / cleared storage / new device = lost player, orphaned slot, permanently reserved name. Missing entirely: persistent player entity, cross-room identity, accounts, teams entity, event entity, stored per-player history, frozen achievements, attendance records, room expiry/deletion.
- Top risks: lost-token player loss, torn snapshot on crash (non-atomic writes; corrupt room file silently dropped at load), no snapshot tamper evidence, derived achievements rewriting history on rule changes, unbounded room accumulation, room-bound championships.
- Already good: token hygiene (hashes only, never in URLs, actor derived server-side), projection discipline, dedupe + ledger + audited overrides, careful snapshot migration defaults.
- Target architecture highlights: global player id (`pl-<uuid>`) separate from room slot ids; guest credential = today's recovery token (hashed); per-device revocable sessions (the multi-device fix); optional AccountLink deferred to a separately-reviewed Phase 3 (no passwords, no assumed provider); events spanning multiple rooms with frozen per-event config; frozen earned achievements; append-only corrections with reversal; deletion that anonymizes rather than rewriting others' totals; 5-phase additive adoption (atomic snapshots first, then players/sessions, events, accounts, lifecycle).
- Verification status: docs only, by design. Uncommitted: git object writes still blocked by the environment (EPERM), same blocker as Milestone C. Re-check the blocker first; if cleared, commit C + E, re-run outstanding drivers, then Milestone D.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~17:45 EST (local-dev-christmas-30m — MILESTONE C + E COMMITTED, environment blocker cleared)
- Tree was DIRTY at run start (Milestone C + E uncommitted, HEAD 5a80284): 12 modified + 6 untracked files, exactly the C/E change described in the two sections above. Per the task's dirty-tree rule, no file in that dirty list was edited before commit, and no uncommitted work was overwritten.
- Blocker re-check FIRST (per the Milestone E note): a throwaway git repo in /tmp committed cleanly, and a Playwright Chromium launch from this project returned CHROMIUM_OK — the earlier SIGTRAP/mmap EPERM + git-write EPERM blocker has cleared in this session. Firefox was not re-tested (not needed for these drivers).
- Re-verification on the uncommitted tree, BEFORE committing (all green): `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 27 files / 271 passed, `npm run build:web` exit 0, then the full outstanding-driver list from Milestone C against a test server on port 3457: check-ws-reconnect 4/4, check-abstain 5/5, check-f4 11/11, check-multiplayer 12/12, check-mobile 32/32, check-contrast 64/64 (64 unique pairs, 0 failed, 3 disabled-info), E2E smoke Chromium 3/3 (room 9D82TR), check-f5 30/30. Milestone C is therefore now fully regression-clean; the earlier "NOT re-run" caveat no longer applies to these 8 drivers.
- Commit: the C+E change was committed AS-IS (no content edits to the dirty files) as 01388dd "Milestone C: TV presentation + results; Milestone E: identity + persistence audit" (18 files, +1305/−45), local only. One housekeeping exception, NOT prior-session work: this run's check-mobile driver overwrote 8 tracked `docs/mobile-screenshots/*.png` files (they were clean at run start); those were restored to HEAD with `git checkout -- docs/mobile-screenshots/` before staging, so the commit contains only C+E files — the mobile screenshots were not part of C+E and were not committed as changed.
- Test server stopped (port 3457 confirmed closed); `data/` left untouched (git-ignored test-room files, not part of the commit).
- EXACT NEXT TASK: Milestone D — safe staged Trivia reveal (display-only: server `revealed` set + projection, phone revealed state, TV live reveal stage, host reveal control, secrecy + sync tests; NO rule changes — scoring, deadline, any-order answering, and ties untouched; gated progression and per-question timers remain deferred pending owner decision). Milestone D was NOT started in this run: the C+E verification + commit filled the run, so this run stops at the clean committed checkpoint above.
- Remaining (unchanged): manual real-device checklist (iPhone Safari, Android, desktop Safari, TV), family-member acceptance test, WebKit host libs, npm audit proxy 403, Cloudflare unprovisioned, real-phone QR/LAN test, TV stage reachable from lobby only, old design on non-Trivia games/Championship/Memory Book/old TV dashboard, index.css reduced-motion contradiction.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Milestone D — safe staged Trivia reveal (2026-11-04 evening, local only)

- SUPERSESSION NOTE: the "EXACT NEXT TASK" preview from the 17:45 cron run described D with a server `revealed` set + live reveal stage + host reveal control. That plan was superseded BEFORE implementation by the integrity ruling (decision L42): live per-question reveals are unsafe (disconnected-player reconnect + relay), so D shipped post-completion only with NO server change. The preview text above is stale; this section is authoritative for what D is.
- Implemented: pure `revealSteps` module (`apps/web/src/ui/mchezo/lib/reveal.ts`, exported from the mchezo index) — question/reveal pairs per question then a standings finale; empty for unfinished games; steps carry kind + index only, never answer data. Phone results rewritten (`MchezoTriviaResults` in `apps/web/src/components/mchezo/MchezoTrivia.tsx`): question phase (prompt + options + own locked answer via AnswerGrid, which cannot mark correctness; "This question:" line; whole-game total/rank line), reveal phase (ResultCard + AnswerDistribution + per-question points), standings finale (limit-2 StandingsList, same phone contract as before), Next/Previous, auto-play (6s/step, memoised steps so polls don't reset the timer, stops at finale), question jumps with ✓/✗/no-answer markers, persistent Back to lobby on non-finale steps. TV (`MchezoTv.tsx`): auto-director walks question (4s) → reveal (5s) per question then leaderboard on finished games; manual DirectorBar jumps and question chips switch auto off. No server, scoring, deadline, ordering, or tie change.
- Drivers updated for the new results UI (same assertions, new navigation): check-leaderboard (TV Leaderboard tab jump before row reads; phone Standings jump before row/gain reads), check-abstain (Standings jump before Bea row read), check-mchezo (text checks on the question phase, then Standings jump for the standings check), check-tv-lifecycle (Leaderboard tab jump before the finished-TV standings assertion). New driver `scripts/check-reveal.mjs` (package.json `check-reveal`): sequence order, answer hidden on question phases, auto-play advance + pause, TV walk question→reveal→next question + manual leaderboard jump.
- Gates: typecheck exit 0 (server + web), lint exit 0, vitest 28 files / 281 tests (10 new reveal tests), build:web exit 0, dist verified to contain the new UI. Full driver batch (16 drivers + E2E) all green: ws-reconnect, abstain, f4 11/11, multiplayer 12/12, mobile 32/32, contrast 64/64, f5 30/30, mchezo, leaderboard, tv-entry, tv-lifecycle (after the tab-jump driver fix; the single failure was the changed TV default, not an app bug), tv-spectator, spectator, m6, reveal, E2E. Housekeeping: the batch's check-mobile run regenerated 7 mobile screenshots; restored to HEAD before staging (not D content).
- Limitations (honest): full reload-to-results round-trip not driver-verified (sequence rebuilds from the finished projection on mount; replay-from-first-question by construction). Reduced-motion: walk timers are content progression, not animation; the reveal animation itself follows existing reduced-motion CSS.
- EXACT NEXT TASK: Milestone F — typed Game Manifest system for all 11 games + docs/GAME_MANIFEST.md (no gameplay change; validate all 11 games; tests for invalid/incomplete/contradictory manifests).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Milestone F — typed Game Manifest system (2026-11-04 evening, local only)

- Added `src/games/manifest.ts`: Zod schema + one manifest per game (11 total) + validation. Fields: id, title, description, categories (editorial discovery labels), min/max players, playStyle, competition, duration `{ minutes, source: "design-default", measured: false }`, inputs, devices `["phone"]`, tv (`dedicated` Trivia only, `dashboard` others), intensity `unknown` for all + note, scoring `{ per-player-points, teamDerived }` (Charades only), features `{ practice, official, abstention }` (per-phase Impostor, per-round Caption, per-question Closest, none Charades, whole-game the other seven), tournament structural facts `{ usesPerPlayerScores, supportsTeams }` (no format verdicts — Milestone I's job), details.
- Validation (`validateManifest` / `getManifest` / `validateAllManifests`): shape via Zod, then registry agreement (title, counts, duration, play style vs modes, implemented status), room rules (min ≤ max, max ≤ 10), architecture facts (Trivia dedicated TV, Charades no abstention), internal consistency (team support + team-derived scores track play style). `getManifest` throws on unknown ids and invalid data.
- Honesty decisions (L43): registry wins over manifests; durations are design defaults, never presented as measured; intensity unknown everywhere; categories editorial; tournament verdicts deferred; deadline-vs-duration tension (5-minute room deadline vs up to 15-minute design durations) flagged as an open question for J/K, not resolved here. No formal accessibility audit claimed.
- No gameplay, registry, server, or UI change: F is additive-only (one new module + tests + docs). No driver changes needed and none made; the change has no runtime callers yet — G, H, and I consume it.
- Gates: typecheck exit 0 (server + web), lint exit 0 (all), vitest 29 files / 303 tests (22 new manifest tests), build exit 0. Tree shows only the two new F files plus docs.
- EXACT NEXT TASK: Milestone G — Game Library + discovery UI integrated with the lobby chooser (search, category/player-count/duration/team filters, sorting, empty states; browsing ≠ selecting ≠ starting; host/cohost permissions preserved).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Cron run 2026-11-04 ~19:15 EST (local-dev-christmas-30m — Milestone F correction, COMPLETED with commit)
- Tree was dirty at run start with the concurrent session's uncommitted Milestone D work, then clean at f94b8c4 (D committed by that session), then dirty again with its uncommitted Milestone F work. No file in either dirty list was edited or overwritten: D and F were left for their author to commit (F committed as 0c77d70 during this run). This run's own work is only the correction below, on the now-clean F tree.
- Bug found and FIXED (manifest misdescribed the engine, not a gameplay bug): Closest Wins shipped in `src/games/manifest.ts` with `features.abstention: "whole-game"`, while its own `details` line, the F PROGRESS summary, decision L33, and the engine (`submitAbstain` → `abstainClosest`, per-question state in `src/games/closest.ts`) all say per-question — a player who sits out one Closest question can still play the later ones. The shipped manifest tests did not catch it because no test pinned abstention per game. Fixed: manifest field changed to `"per-question"` and the `docs/GAME_MANIFEST.md` table row corrected to match; no engine, registry, or UI change.
- Regression test first: new test "abstention matches the engine per game (decision L33)" in `tests/manifest.test.ts` pins all 11 values (per-phase Impostor, per-round Caption, per-question Closest, none Charades, whole-game the other seven). It failed 1/23 before the fix (closest-wins: expected "per-question", got "whole-game") and passes after.
- Evidence: `npm run typecheck` exit 0 (server + web), `npm run lint` exit 0, `npm test` 29 files / 304 passed (was 303, +1), `npm run build:web` exit 0. No browser driver re-run: the change has no runtime callers yet (F is additive-only) and changes no UI, server, or game behaviour, so no driver assertion could differ; F's own gates already passed.
- Concurrency note: an untracked `apps/web/src/ui/mchezo/lib/library.ts` appeared during this run — Milestone G work by the concurrent session. It was not reviewed, edited, committed, or deleted here; this run's commit stages ONLY its own 4 files (manifest, doc table, test, this entry).
- EXACT NEXT TASK: Milestone G — Game Library + discovery UI (concurrent session has started it; do not duplicate it from this cron — verify its commit when it lands, then take the next unstarted task).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Milestone G — Game Library + discovery UI (2026-11-04 evening, local only)

- Added `apps/web/src/ui/mchezo/lib/library.ts`: pure filter/sort over manifests (search across title/description/categories, category OR, player-count range, max duration, solo/team, name/duration sort with title tie-break) + `DEFAULT_FILTERS` + `hasActiveFilters` + `allCategories`. No registry import, no duplicated capability facts.
- Added `apps/web/src/components/mchezo/MchezoLibrary.tsx`: Circle-styled phone screen with search input, filter chip rows (categories, players Any/2/4/6/8/10, duration Any/5/8/10/15, type, sort), one Reset button (disabled when inactive), game cards (title, description, player range, ~minutes, category/team/TV-stage tags), host-only "Set as up next" per card, guest note, empty state, durations footnote. One new CSS class (`.mz-lib-tag`); everything else reuses kit classes.
- App integration: new `library` view; "Browse games" button in the lobby's shared nav row (visible to all players); host/cohost select sets up-next and returns to lobby; the compact chooser is unchanged. Verified the web bundle is safe: manifest → registry is pure data (no imports), so no question bank or server code reaches clients.
- Tests: `tests/library.test.ts` (14 tests: search, facets, combined filters, sorting, helpers, no-mutation). Driver `scripts/check-library.mjs` (17 checks, npm script `check-library`): full catalog, search, team/duration/player-count filters, reset, empty state, no-start guarantee, host select → lobby with Charades up next and nothing started, guest read-only browsing + back.
- Gates: typecheck exit 0 (server + web), lint exit 0 (all), vitest 30 files / 318 tests, build exit 0. Full driver batch 16 + E2E green (log `~/workspace/gates-g-batch.log`, zero FAIL lines; mobile 32/32, contrast 64/64, E2E 12/12). Mobile screenshots regenerated by check-mobile were restored to HEAD before staging (regenerable artifacts, not milestone content).
- Recovery note: a runtime restart mid-batch killed the port-3461 server and the first batch run (4 drivers green, killed during check-leaderboard). Server restarted and verified (HTTP 200, G bundle served); the batch was re-run in full, tee'd to `gates-g-batch.log` so results survive a restart.
- Also in this commit: corrected `docs/GAME_MANIFEST.md` header test count 22 → 23 (stale since the 7e85d5e fix commit, which updated the table row but not the header).
- EXACT NEXT TASK: Milestone H — Smart Shuffle / Smart Director engine (pure, seeded, explainable; hard constraints first, never overridden by scores; restrained UI; host keeps start control).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Milestone H — Smart Shuffle / Smart Director engine + restrained UI (2026-11-04 evening, local only)

- Added `src/games/shuffle.ts`: pure engine, no runtime AI, no I/O, no node imports (web-safe). Modes: random (uniform), smart (recency + play-style-variety weights), tournament (sequential distinct picks, recency + category-variety weights). Hard constraints never overridden by scores: player-count range, excludeIds, incompatibleIds (enforced, empty until Milestone I formats exist), optional playStyle filter. Empty pool returns `{ ok: false, reason: "no-eligible-games" }`; over-requesting returns all eligible with `partial: true`. Every pick carries structured reason codes + a deterministic explanation; a singleton pool reports `only-eligible-game` alone. Same request + seed → same result via shared mulberry32.
- Added `src/shared/rng.ts`: mulberry32 extracted verbatim from `src/shared/protocol.ts`, which now re-exports it — required because protocol's node:crypto import would break the web bundle, and the engine must run client-side (up-next is client state; no new server endpoint). Existing seeded callers untouched; request validation is by hand, not Zod, so the web bundle stays lean (rules unit-tested).
- UI (App.tsx, host-only Game setup card): "Surprise me" (random) + "Smart shuffle" (smart) buttons + a result line ("Title: explanation"). playerCount = connected players (the population startGame enforces); recentIds = room game history, most-recent-first; seed = Date.now() per click. Manual selection and successful start clear the result line. Library and chooser untouched. Tournament mode has no UI in H — Milestone I wires it.
- Tests: `tests/shuffle.test.ts` (19 tests: eligibility, empty/partial, determinism, reasons incl. singleton/random/recency/weighted-fallback, statistical weight bias over 200 seeds, validation throws, pinned-seed goldens for variety + random + category-variety). Driver `scripts/check-shuffle.mjs` (7 checks, npm script `check-shuffle`): guest sees no buttons, both buttons pick real games with explanations, no game started, manual select clears the line.
- Gates: typecheck exit 0 (server + web), lint exit 0 (all), vitest 31 files / 337 tests, build exit 0. Full driver batch 17 + E2E: 16 drivers + shuffle + E2E green on first run; check-leaderboard failed 1 check on the first run, then passed clean (23 PASS, 0 FAIL) on two consecutive re-runs with no code change — treated as transient (suspected poll-rerender click-loss flake, documented as pre-existing; not proven, failing check unidentified because the batch keeps only tail -3). H's changes cannot affect leaderboard correctness (setup-card buttons, shuffle state, result-line clearing; the engine is pure and the driver never clicks shuffle), and the failure was not reproducible on identical code. Logs: `~/workspace/gates-h-batch.log`, `~/workspace/gates-h-check-leaderboard-rerun.log`, `~/workspace/gates-h-check-leaderboard-rerun2.log`, `~/workspace/gates-h-check-shuffle.log`. Mobile screenshots restored to HEAD before staging.
- EXACT NEXT TASK: Milestone I — Tournament Studio scheduling prototype (pure engine, presets, local preview) + `docs/TOURNAMENT_STUDIO_ARCHITECTURE.md`. Do NOT modify Family Cup rules; do NOT activate a new authoritative tournament-scoring system without architecture review.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## ChatGPT Milestone I architecture review — checkpoint (2026-11-04 night, local only, UNCOMMITTED)

- Hold honored: Milestone I was NOT committed and Milestone J was NOT started, before, during, or after this review. The working tree holds I plus the review work below; HEAD remains `f6c6765` (Milestone H). The scheduled local-dev run at 22:45 correctly skipped (dirty tree + owner hold, per its conflict-avoidance rule).
- Review deliverables (all new, all uncommitted): `docs/TOURNAMENT_IDENTITY_REVIEW.md` (§1: 8 identity questions verified against current code, guarantees-vs-intent table, smallest privacy-conscious person-record proposal with recovery/impersonation/device-loss tradeoffs, 6 unresolved decisions, migration feasibility); `docs/TOURNAMENT_FORMAT_AND_LIFECYCLE_REVIEW.md` (§2 six-format feasibility matrix with Team Clash as preview-only and Chaos≈Gauntlet / Long≈Chaos-by-length overlaps documented, §3 Draft→Ready→Active→Paused→Completed→Archived lifecycle proposal with Family Cup boundary via separate rooms, §4 shuffle-integration verification, §5 UX review, 6 architectural contradictions).
- Tests added (review §4): 4 differentiation tests in `tests/tournament.test.ts` (chaos/gauntlet pigeonhole, points-league-never-Charades across 20 seeds, long-vs-chaos length-only difference, repeat-path reason fidelity). Suite now 32 files / 356 tests (was 352).
- Narrow prototype correction (preview-only, under the owner's autonomous-corrections authorization): the Studio preview now shows "Scheduled for N players." above the schedule, making its connected-count assumption visible. Web typecheck + lint clean, rebuilt, check-studio 9/9 (8 original + new player-count assertion).
- Verification (§6): browser health first — minimal launch check OK after the 22:18 runtime restart (Chromium had died with SIGTRAP exit 133 on every launch at 22:13, including the full Chromium build; the restart cleared it). Full regression batch then ran green: 18 drivers + E2E, 0 FAIL lines in `~/workspace/gates-i-batch2.log` (leaderboard, tv-lifecycle, reveal, library, shuffle, studio all ALL PASSED; mobile 32/32; contrast 64/64; E2E 12/12). Mobile screenshots restored to HEAD after the batch. Viewports measured after the batch: 320/360/390px all pass, no horizontal overflow, note + 5-round schedule visible at each width. Server on 3461 restarted after the runtime restart (log `serve-3461-e.log`) and verified HTTP 200.
- Last verified passing state: everything above (356 tests, lint, build, 18 drivers + E2E, viewports, studio 9/9). Limitations: browser drivers were unverifiable during the 22:13–22:18 environment outage (documented, not classified as passing); the batch's drivers ran against the pre-correction bundle, with check-studio re-run after the correction (9/9) covering the changed UI; no real-device (iPhone Safari) verification exists for the Studio (Chromium emulation only, as throughout).
- EXACT NEXT TASK (superseded — owner approved the checkpoint 2026-11-04 night): Milestone I local commit (see the Milestone I section below); then Milestone J under decisions A–F. No GitHub publish, no merge/deploy/spend.
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Milestone I — Tournament Studio scheduling prototype (2026-11-04 evening, local only)

- Added `src/games/tournament.ts`: pure scheduling engine + 6 format presets (Points League, Team Clash, The Gauntlet, Chaos Night, The Think Tank, The Long Game). Hard filters never overridden by scores (player-count range, exclusions, play style, category OR-match); explicit `no-eligible-games` / `not-enough-games` results; distinct schedules from one H tournament-mode shuffle call, repeat-allowed schedules from one H smart-mode pick per slot (seed + slot index, scheduled games as recency); picks carry H reason codes + explanations unchanged. Knockout brackets fail validation (no scoring/advancement model exists). Hand validation (no Zod in the web bundle, as in H); input arrays readonly-typed (manifest categories made readonly at the Zod schema level so deep-frozen inputs typecheck).
- Preview UI (`apps/web/src/components/mchezo/MchezoStudio.tsx`, host-only lobby entry "Studio (preview)"): format chips, rounds input (1–20), Regenerate, schedule list with per-game reasons, explicit infeasible messages, "Scheduled for N players." line, and two fencing lines (not scored/saved/sent; Family Cup unchanged). No start, score, save, or resume control anywhere in the view. No server change: no route, no projection field, no ledger entry, no championship touch.
- Tests: `tests/tournament.test.ts` (19 tests: presets, validation incl. bracket rejection, per-format shapes, infeasibility, chunking, determinism, input immutability via deep-frozen configs, 4 review-driven differentiation tests). Driver `scripts/check-studio.mjs` (9 checks incl. player-count line, guest invisibility, infeasible rendering, no start buttons).
- Docs: `docs/TOURNAMENT_STUDIO_ARCHITECTURE.md` (design record), decision L46, plus the ChatGPT review checkpoint docs `docs/TOURNAMENT_IDENTITY_REVIEW.md` and `docs/TOURNAMENT_FORMAT_AND_LIFECYCLE_REVIEW.md` (see the review checkpoint section below).
- Gates: typecheck (root + web) exit 0, lint exit 0, vitest 32 files / 356 tests, build exit 0. Full driver batch 18 + E2E green (0 FAIL lines in `~/workspace/gates-i-batch2.log`; mobile 32/32, contrast 64/64, E2E 12/12). Viewports 320/360/390px pass with no horizontal overflow. Environment note: Chromium died with SIGTRAP on every launch 22:13–22:18 (environment failure, not the app); the 22:18 runtime restart cleared it, confirmed by a minimal launch check before the batch. Mobile screenshots restored to HEAD after the batch.
- EXACT NEXT TASK (superseded by owner approval 2026-11-04 night): Milestone I approved for local commit including implementation, both review documents, differentiation tests, and preview correction; then Milestone J under decisions A–F (see the owner's message that night). No GitHub publish, no merge/deploy/spend.

## Milestone J kickoff (2026-11-04 night, local only)

- Milestone I committed as `89c9dfc` (14 files, +1512/−6, tree clean) under the owner's approval, including implementation, both review documents, differentiation tests, and preview correction.
- J's actual definition inspected before planning (per the owner's instruction): dev log "Shared gameplay infrastructure + one incremental game modernization" + the assignment's inspection list (lifecycle, host/cohost, transitions, errors, reconnection, projections, accessibility, mobile, TV, test isolation) + one-game-at-a-time modernization + the deadline-vs-duration open question. Roadmap files (MILESTONES.md, FRONTEND_MILESTONES.md) carry no fuller J definition; the plan does not invent one.
- Plan written: `docs/MILESTONE_J_PLAN.md` — J.1 infrastructure inspection, J.2 contracts only (recovery-code threat model, host-assisted recovery safeguards, supersede semantics, persistence contract, lifecycle notes), J.3 first slice closest-wins (single self-contained GamePanel branch; GamePanel serves the other nine meanwhile), J.4 deadline-vs-duration decision input with no gameplay change. Chaos differentiation proposed (per-slot uniform random vs Gauntlet distinct + variety-weighted), not implemented pending approval. Team Clash stays preview-only. Forbidden list restated (no DB, no deploy/publish/push/merge, no global identity, no Cup changes, no persistent-tournament activation, no elimination/team-scoring/award rules).
- EXACT NEXT TASK: Milestone J.1 — shared-infrastructure inspection (10 areas) → `docs/J_INFRASTRUCTURE_INSPECTION.md` + narrow fixes. No GitHub publish, no merge/deploy/spend.

## Milestone J.1 — Shared infrastructure inspection + narrow fixes (2026-11-04 night, local only)

- Inspection report: `docs/J_INFRASTRUCTURE_INSPECTION.md` — all 10 areas (lifecycle, host/cohost, transitions, errors, reconnection, projections, accessibility, mobile, TV, test isolation) verified against current code with file/line evidence.
- Findings: host predicate consistent across all 5 privileged engine methods; WS close marks disconnected only when no socket remains (reload-safe); projections leak nothing (host/cohost get no keys/tokens pre-reveal either); intent rejections are structured 200s by design (dedupe replays); snapshot restore marks everyone disconnected (no phantoms); test isolation holds (drivers use independent rooms; `data/` holds 525 files but is git-ignored and cannot affect tests).
- Fix 1 — kit reduced-motion OS floor: `apps/web/src/ui/mchezo/lib/motion.ts` (`resolveReducedMotion`: OS preference is a floor — OS-reduced ⇒ kit reduces even when the in-app setting is `full`) + `App.tsx` line 355. The SettingsBar claim ("Reduced motion in your device settings also reduces animations here") was true for the old UI (CSS media query) and false for every Mchezo screen; it is true on both surfaces after this fix. Behavior changes only for OS-reduced-motion users. Unit tests `tests/motion.test.ts` (4) + driver `scripts/check-reduced-motion.mjs` (control arm animates, reduced arm never animates — non-vacuous).
- Fix 2 — `index.css` redundant reduced-motion block deleted (lines 60–62): zero behavior change, proven by shorthand analysis (`animation: none` sets name none, `transition: none` sets property none; later duration rules cannot resurrect either). The `.anim-reduced`/`.anim-off` user-setting classes are untouched.
- Fix 3 — dead game statuses removed: `"lobby"`/`"revealed"` were never assigned anywhere (games are created `playing`, only `finished` is assigned; the staged reveal is client-side). Server union + web `GameStatus` narrowed to `"playing" | "finished"`; two projection conditions simplified to `finished`. Behavior-preserving by proof (no assignments, no tests reference the values, `fromJSON` restores verbatim).
- Deliberately not fixed in J.1: concurrent-session supersede (J.2 contract), host-assisted/room-owner recovery (J.2 proposals), no bypass for operator-less rooms (decision A3), `data/` hygiene (deleting a live server's snapshot dir is out of scope), deadline/duration (J.4), all-games restyle (J.3 is one game).
- Gates: typecheck (root + web), lint, vitest 33 files / 360 tests, build, full batch 19 drivers + E2E green (log `~/workspace/gates-j1-batch.log`, 0 FAIL lines). Mobile screenshots restored before staging.
- Note: the J plan doc's Chaos paragraph ("proposal only, not implemented pending approval") was superseded by owner approval 2026-11-04 night — Chaos uniform-random is implemented as a preview-only slice in the next commit, not as a proposal. The plan doc stands as the kickoff record.
- EXACT NEXT TASK: Chaos uniform-random slice commit (code + tests + architecture doc already written; rebuild + extended check-studio + commit), then J.2 contract commits. No GitHub publish, no merge/deploy/spend.

## Chaos uniform-random slice (2026-11-04 night, local only, approved preview-only)

- Approved by the owner 2026-11-04 night: Chaos Night's uniform-random eligible-game selection is implemented in the Tournament Studio preview engine as a small, independently tested slice after J.1. It changes what the preview shows; it does NOT activate executable tournaments, change scoring, or touch Family Cup rules.
- Engine (`src/games/tournament.ts`): presets gain optional `repeatSelection` (`"variety-weighted"` default, `"uniform-random"`); Chaos Night is the only uniform preset. The repeat path branches on it: uniform uses H random-mode picks (proven uniform in `shuffle.ts` — `remaining[floor(rng()*n)]`, no weights, reasons `["random-pick"]`) that deliberately ignore history, so repeats cluster naturally; weighted uses the existing smart-mode path with recency history. Hard eligibility is identical in both (picks come only from the filtered pool — player-count range, exclusions, play style, categories). `uniform-random` with `distinctOnly` throws instead of being silently ignored; unknown strategies throw. Distinct schedules are unaffected (always tournament-mode).
- No forced repeats: each slot is an independent uniform draw with replacement — repeats are possible, never required. (The existing pigeonhole test's "chaos must repeat" is a 6-slots-from-2-games mathematical consequence, not a rule.)
- Description updated (preset + `docs/TOURNAMENT_STUDIO_ARCHITECTURE.md` scheduling section) so the distinction is visible in the Studio UI, not just behavioral. The format/lifecycle review doc stands as the dated checkpoint; this entry supersedes its Chaos≈Gauntlet observation going forward.
- Tests: 6 new tournament tests (preset/config carry the strategy; chaos picks are exactly `["random-pick"]` / "Picked at random." across seeds 0–9; gauntlet picks never carry `random-pick`; 2-player pool + exclusions honored on the uniform path; uniform+distinct throws; determinism). Driver: `scripts/check-studio.mjs` extended 9 → 13 checks (chaos 6 rounds, description names uniform-random, all picks uniform, no weighted reasons).
- Gates + blast-radius note: `tournament.ts` is imported only by `MchezoStudio.tsx` and its tests (the server never imports it), so the change reaches only the Studio preview bundle. Verified: typecheck (root + web), lint, vitest 33 files / 366 tests, build, extended check-studio 13/13 (log `~/workspace/gates-chaos-check-studio.log`). A full 19-driver batch was not re-run for this slice because the J.1 batch (19 drivers + E2E, 0 FAIL) verified the identical bundle except this Studio-only module, and the extended Studio driver covers the changed surface; the next full batch (before the J.3 commit) re-verifies everything.
- EXACT NEXT TASK: J.2 contract commits (recovery + persistence docs already drafted — stage only those two files, no code), then J.3 closest-wins (before screenshots first). No GitHub publish, no merge/deploy/spend.

## Milestone J.2 — Recovery and persistence contracts (2026-11-04 night, local only, docs only)

- `docs/RECOVERY_CONTRACT.md`: room-session recovery vs person identity (A1); recovery-code threat model + storage requirements (A2) with a proposed format (20 chars, 32-char unambiguous alphabet, ~100 bits, grouped 5-5-5-5, case-insensitive entry, SHA-256 hash storage, single-use with fresh-code issuance, lost-response fallback to host-assisted recovery); host-assisted recovery safeguard contract (A3: exact-slot selection, never name-match, audit event, mandatory room notification, social-trust limitation documented); supersede semantics (A4: rotation + connection invalidation + audit in one atomic unit, per-slot serialization, first-writer-wins); room-owner recovery as a separately reviewable proposal only (A3); display-only linking (A6) and storage default (A5) notes.
- `docs/PERSISTENCE_CONTRACT.md`: current state grounded (toJSON fields, no version/checksum, single writeFileSync, SCHEMA_VERSION is intent-schema version — a naming trap); snapshot versioning (new `snapshotVersion`, 2 = atomic format, 1 = legacy, unknown versions refuse to load); atomic writes (temp + fsync + rename + dir fsync, shared helper for room/book/claim); one-generation previous-good backup; SHA-256 checksums (corruption detection, not tamper evidence); crash-recovery load order (final → backup → explicit refusal, never a synthesized empty room); replay/reconciliation rules (ledger is the audit trail, disagreement is corruption, never silently repaired); lifecycle notes (C: Cancelled terminal state, separate rooms Phase 1, ownership separate from room host with audited transfer).
- Status: contracts for review. No implementation is authorized by either document. Persistent-tournament activation needs its own review after these contracts; recovery implementation needs its own review too.
- Gates: none applicable (prose docs, no code, no tests). Both docs were written from code-grounded facts verified by grep (toJSON shape, persist paths, token-hash pattern, ledger/dedupe).
- EXACT NEXT TASK: J.3 closest-wins modernization — before screenshots of the old panel FIRST, then reusable-primitive design, then extraction (rules preserved). No GitHub publish, no merge/deploy/spend.

## Milestone J.3 — batch compromised by Chromium SIGTRAP (environment, 2026-11-05 ~00:50 EST; NOT an app failure)

- The J.3 full batch (vitest + 20 drivers + e2e) started clean: unit suite 366 tests, lint OK, and drivers 1–9 all green with log evidence (`~/workspace/gates-j3-batch.log`, partial — mchezo, spectator, tv-spectator, tv-lifecycle, leaderboard, tv-entry, m6, ws-reconnect, abstain). The standalone check-closest run (16/16) also stands (`~/workspace/gates-j3-check-closest.log`).
- From ~00:50 every Chromium launch died at startup (SIGTRAP — the same failure as the Milestone I incident on 2026-11-04 night, which a runtime restart fixed). The remaining drivers (f4 onward) and e2e never ran the app: e2e's "FAILED: 1 item" is the browser-launch crash, not a test failure. A minimal Playwright launch check at 00:53 reproduces it ("Target page, context or browser has been closed"). The batch log itself is truncated because tee hit a transient EPERM mid-write (workspace is writable again now).
- Per the approved verification rules: a browser launch failure is NOT an application test result, and the full batch is NOT re-run while the environment is demonstrably unhealthy. J.3's commit is HELD — the gate (full batch green) is unmet because the batch could not run, not because the app failed. No code was changed in response; no failure was hidden.
- EXACT NEXT TASK: when Chromium launches again (a runtime restart cleared this last time), re-run the remaining drivers (f4, f5, mobile, contrast, multiplayer, reveal, library, shuffle, studio, reduced-motion, closest, e2e) as batch2, then restore mobile screenshots, append the J.3 entry, and commit. No GitHub publish, no merge/deploy/spend.

## Milestone J.3 — Closest Wins modernization (2026-11-05 night, local only)

- Extraction, not a rewrite: the old GamePanel closest branch (line 31) is now `apps/web/src/components/mchezo/MchezoClosest.tsx`, rendered from a new App branch (gameplay/waiting, kit provider) mirroring the Trivia play branch. Intro (ShowIntro) and finished results (ShowResults) are untouched. Intents unchanged ("closest-guess" with a numeric value, "abstain"), scoring unchanged, per-question abstention unchanged, deadline + host skip unchanged (same endpoint, host-only after deadline), reconnect/session flow untouched. GamePanel's closest branch is now dead (App routes closest here first), left in place like Trivia's dead quiz branch.
- Reusable primitives (requirement #2 — the middle path, no forced generic):
  - `NumericGuess` (`ui/mchezo/components/NumericGuess.tsx`): dial + number field + two submit buttons, props for range/initial/labels/hint. Serves Closest Wins today (dial 0–1000, initial 50) and Guess the Year next (timeline 1900–2025) — the two games share the input shape. Text/tile/choice/performance games never use it.
  - `AbstainControl` (`ui/mchezo/components/AbstainControl.tsx`): the shared sit-out button + abstained note, verbatim. Every non-Charades game shows the same button/note, so it serves all of them as they migrate; Charades never uses it.
  - `MchezoWaiting` moved from MchezoTrivia.tsx to `ui/mchezo/components/Waiting.tsx` (exported from the kit index): it was already game-agnostic (label-driven, counts-only ring, host skip when stalled). New optional `footNote` prop defaults to the Trivia reveal line, so Trivia is behavior-identical; Closest passes the shared waiting sentence ("When everyone is done, results appear automatically.").
- Disclosed behavior notes (UI, not rules): (1) the number field is now component-local instead of App-shared across games — it starts empty per mount; an empty number field still submits 0, as the old panel did. (2) The post-guess "Sit out" button is omitted in the waiting view — the server always rejects post-guess abstention (ALREADY_GUESSED in abstainClosest), so the old button could only error. (3) Abstained viewers now see the same waiting ring + host skip as guessed viewers (the old panel showed them no counts/skip); counts are public and skip still requires host + deadline + playing status, server-enforced. (4) The dial persists across questions within a game (component stays mounted), as before.
- Driver `scripts/check-closest.mjs` (16 checks): guests see no setup/start controls; host + guests all see the kit panel; no horizontal overflow at 320/360/390; number guess confirms ("Your guess: 42") + waiting ring; reload restores the guessed state; abstain shows "Abstained on this question." + sat-out note + no guess controls; dial value follows the slider; dial guess accepted (game advances — the last finisher's confirmation is transient because the guess + advancement are one server mutation). Two driver fixes during development: the guest-start check was ambiguous (fixed), and the host dial assertion was rewritten for advancement (the first version expected a confirmation that never renders for the last finisher).
- Screenshots (test-fixture data): `docs/mchezo-screenshots/12-closest-before.png` (old green panel) and `13-closest-after.png` (kit panel). Both show the same Eiffel Tower question, so the comparison is direct.
- Verification: typecheck (root + web), lint, vitest 33 files / 366 tests, build. Full driver coverage across two batches + reruns: first batch drivers 1–9 green (mchezo, spectator, tv-spectator, tv-lifecycle, leaderboard, tv-entry, m6, ws-reconnect, abstain); batch2 (remaining drivers) 11/12 green — f5 30/30, mobile, contrast, multiplayer 12/12, reveal, library, shuffle, studio, reduced-motion, closest 16/16, e2e 12/12; F4 solo re-run 11/11 (see incidents). Logs: `~/workspace/gates-j3-check-closest.log`, `gates-j3-batch.log` (partial), `gates-j3-batch2.log`, `gates-j3-check-f4-rerun.log`, `gates-j3-rerun.log` (cron worker's f5 run).
- Incidents (all documented, none hidden): (a) Chromium SIGTRAP environment failure ~00:50 (same as the Milestone I night): the first J.3 batch died at f4 — every launch crashed at startup, e2e's "FAILED: 1 item" was the launch crash, and tee hit a transient EPERM truncating the log. No app failure; the batch was NOT re-run while unhealthy. Chromium recovered after a runtime restart (launch check OK at 02:04); the restart also killed the 3461 server, which was restarted with PORT=3461 and verified 200. (b) A scheduled local-dev run overlapped batch2 and edited `scripts/check-f5.mjs` + `scripts/e2e-browser.mjs` — legitimate J.3-compatibility fixes (both drivers played closest via the old GamePanel selectors, which no longer exist; the fixes use mz-num-input/mz-num-dial and "Your guess: N", keeping the same coverage). Those fixes are KEPT and included in this commit; the worker's own run timed out mid-e2e, but its check-f5 run stands at 30/30 as second evidence. (c) Batch2 F4 failed 1/9 (Approve-button wait in the math-mayhem highlight flow) while the parallel run was active; the solo re-run passed 11/11 with no code change — attributed to parallel-run interference, not an app bug. J.3 touched no math code (GamePanel quiz branch and server untouched).
- EXACT NEXT TASK: J.4 deadline-vs-duration investigation doc (no timing change), then Milestone K. No GitHub publish, no merge/deploy/spend.

## Milestone J.4 — Deadline-vs-duration investigation (2026-11-05 night, local only, docs only)

- `docs/DEADLINE_VS_DURATION.md`: the 5-minute deadline vs the 8–15-minute design durations, investigated from code (no timing change).
- Current behavior, verified: every game gets `deadlineAt = startedAt + 5 min` (`room.ts:295`). It is a hard submission cutoff, not a timer — `submitSocialIntent` (388), `submitAbstain` (586), and `submitMathAnswer` (860) all reject late intents with `PHASE_CLOSED`; there are no server timers, so nothing auto-finishes. The only exit for an unfinished game is host/cohost skip (`skipTimedOutGame`, 833–841, requires the deadline to have passed); a stuck game blocks both the next game and `advanceDay`. Skipped games keep partial raw scores but are excluded from Cup standings everywhere (719/755/775/807).
- Design durations (manifest, all `measured: false`): impostor 10, caption 10, trivia 10, connections 8, whosaid 10, year 8, closest 8, sprint 10, charades 15, geography 12, math 5. Only Math fits the deadline. Worked budgets: trivia 10 questions → 30 s/question; closest 8 questions → ~37 s/question; charades full rotation → 75 s/turn (4 players) or 30 s/turn (10 players).
- What players see: Trivia alone shows a live countdown (the ring is the 300 s deadline); waiting views show the stalled state + host skip; other games show no timer — players discover the deadline through rejected submissions.
- The tension is real but unproven: drivers finish every game inside 5 minutes (instant answers), while the design durations imply slower human pace — and no human play time has ever been recorded. The cost of skips is undercounting, not punishment (the Cup stays fair, just thinner). Real durations are measurable without new instrumentation: ledger events carry `createdAt` and games record `startedAt`, so `game-finished.createdAt − startedAt` gives the actual duration after any real session.
- Options A–E documented (keep 5 min; per-game deadlines from design durations; per-question deadlines; soft guidance; universal 10 min), each with what it changes, pros/cons, and its code touchpoints. All change gameplay rules → owner decision checkpoint, none autonomous. Tournament rounds inherit the same deadline (I-review contradiction #4).
- Recommendation: measure first (next real session's ledger), then decide between per-game deadlines from *measured* durations (B) and a universal extension (E). C (too much machinery, unmeasured problem) and D (removes the stall bound) not recommended. Four questions for the owner are listed in the doc (§9).
- Gates: none applicable (prose doc, no code, no tests). All claims verified by grep against `room.ts`, `manifest.ts`, the game modules, and the web app before writing.
- EXACT NEXT TASK: Milestone K (reliability, accessibility, security hardening), then the final handoff. No GitHub publish, no merge/deploy/spend.

## Work Package A — Game duration and deadline review (2026-11-05, local only, docs only)

- `docs/GAME_DURATION_AND_DEADLINE_REVIEW.md`: the per-game companion to the J.4 doc (DEADLINE_VS_DURATION.md, 8f2e696). Answers the ten questions from code for all eleven games + a per-game table (deadline behavior, design duration, rounds/questions, completion conditions, contradiction, recommended solution, rule-change needed).
- Verified facts: the deadline is set once at startGame (one deadlineAt, whole game, no per-phase timers); every game can conclude early (all active players done); host skip only after the deadline (and the only exit for an unfinished game); abstentions count as done (whole-game for trivia/whosaid/geography/year/connections/sprint/math, per-question for closest, per-phase for impostor/caption, none for charades); disconnected players do not block (activePlayers = connected, falling back to all if none connected); a reconnected player can submit before the deadline (token-verified, prior answers stand); expiry = PHASE_CLOSED for all intents + abstentions, game stays playing until the host skips; design durations are unmeasured defaults (measured: false on all eleven).
- Question counts verified from the game modules: trivia 10, math 10, closest 8, whosaid 8, geography 8, year 8, caption 3 rounds, sprint 3 rounds, charades 1 rotation, connections 1 grid (4 groups), impostor 3 phases.
- Tournament warning: the scheduler must budget the 5-minute deadline per round (the only guaranteed bound), never the design duration (8–15 min, longer than the server allows).
- No timing change. No metadata correction needed (measured: false is honest). Two UI gaps noted: Guess the Year and Closest Wins show no countdown (Trivia does) — the modernized panels should surface it.
- EXACT NEXT TASK: Work Package B (Closest Wins UX audit + component inventory); the two-button simplification is a planned code fix that must wait for the in-flight K batch to land before the bundle is rebuilt.

## Work Package B — Closest Wins UX audit + component inventory (2026-11-05, local only, docs only)

- `docs/GAMEPLAY_COMPONENT_INVENTORY.md`: the J.3 close-out audit.
- Two-button finding: NumericGuess holds two independent values (dial 50 initial, number field empty) that are not synchronized; "Submit guess" sends the field (0 when empty) and "Submit dial guess {v}" sends the dial. Not genuinely different semantics — both submit one number via closest-guess — so a single primary Submit is possible by unifying the inputs into one value (dial sets it, field edits it, the button is labelled with the value). The empty-submits-0 quirk disappears with the unification (disclosed, not silent). Planned as a separately tested correction after the K batch lands (it changes web code + the check-closest and F5/e2e drivers).
- Page cohesion: the Closest play view is kit, but the flow crosses surfaces — kit lobby → old ShowIntro → kit play → old ShowResults → kit lobby. Migrating ShowIntro/ShowResults to the kit touches all eleven games, so it is a separate visual-review item, not a B fix. Game views show no Family Cup indicator (the lobby does).
- Inventory: truly reusable — MchezoWaiting (Trivia + Closest), AbstainControl (Closest; Trivia pending), NumericGuess (Closest; Year next), PhoneScreen, Keycap/PlayerToken, host controls. Reusable with adaptation — staged reveal (Trivia-only data), results (two systems). Game-specific — the answer interaction, scoring display, hidden-role/team mechanics. A social-deduction game must not be forced into a numerical-estimation interface.
- EXACT NEXT TASK: Work Package C (realistic game-night simulation) after the two-button fix lands; then Work Package D (Guess the Year modernization).

## Work Package H — Next architecture decisions (2026-11-05, local only, docs only)

- `docs/NEXT_ARCHITECTURE_DECISIONS.md`: the decision-ready synthesis of the recovery contract, persistence contract, identity/tournament reviews, and the K audit — nothing in it is authorized for implementation.
- Covers: what persists today (per-room JSON snapshots, non-atomic; no person record, no cross-room history, no tournament state) and what does not; slot recovery without accounts (single-use codes, supersede, host-assisted, room-owner proposal); why person identity is a separate concern (recovery restores a slot; linking spans rooms; never merge scores); what atomic storage requires (versioning, temp+fsync+rename, previous-good backup, checksums, load order, replay); how Cup results are preserved (additive slot→person mapping, no cross-room merging, the ledger as the source of truth, deletion anonymizes); what persistent tournament membership needs (events spanning rooms, frozen standings as appended events, roster-based scheduling, independent ownership, the full lifecycle incl. Cancelled, the deadline inheritance); the seven decisions requiring explicit approval; the prerequisites implementable independently (atomic snapshots first; host-claimed event + replay shape already done in K; measurement needs no code); the recommended staged sequence (0 atomic snapshots → 1 slot recovery → 2 display-only linking → 3 events/tournaments → 4 accounts, deferred); and the risks (corruption, lost tokens, impersonation, duplicated scores, host abuse, unbounded accumulation) plus the six future modes and what each needs.
- EXACT NEXT TASK: run the Package C simulation driver once the K batch lands (it cannot run concurrently with the batch — the batch owns the browser and the server).

## Work Package C — Game-night simulation (COMPLETE, 2026-11-05, local only)

- `scripts/check-game-night.mjs` (npm script `check-game-night`): a full evening in one driver — a 6-player room (host Ada + cohost Bea granted via the lobby UI + Cal/Dee/Eli/Fay + spectator/TV + Gus, a 7th who joins between games and disconnects mid-Closest) playing Trivia, Closest Wins, and Math Mayhem (cohost starts the last), plus a 10-player maximum-capacity room playing Trivia. Review doc: `docs/GAME_NIGHT_END_TO_END_REVIEW.md`. Screenshots (test-fixture data): 14-game-night-lobby, 15-game-night-tv-results, 16-game-night-closest, 17-game-night-max-room.
- **Run 4 (green): `node scripts/check-game-night.mjs http://localhost:3461` — GAME NIGHT ALL PASSED (28 checks), exit 0, ~4 min** (log `~/workspace/gates-c-game-night4.log`). Cohost via the UI; spectator takes no player slot; no answers or controls leak to the spectator; Trivia finishes with an abstention; scores agree across TV/server/phone; ties share rank + score (Cal = Dee, rank 3, 120); no double-count; waiting ring honest (2/7); Gus marked Away in the projection and listed on the TV; per-question abstention scope; Closest finishes without the disconnected player; cohost starts; guest skip rejected (HTTP 400); Eli reloads mid-Math with answers preserved and scores; TV follows the active game; no stale panel; championship lists all 7; max room holds 10 + spectator, TV leaderboard shows all 10.
- **Correctness defects found: none.** UX gaps (in the review doc): (1) a late joiner lands on the finished game's Trivia reveal with no context — suggested: a line when the viewer did not play, or route a fresh joiner straight to the lobby; (2) the old TV dashboard has no Away marker (kit surfaces do) — the host cannot tell who dropped out for nine of the eleven games; (3) a failed join shows no error on the landing (the kit landing does not render `App.err`).
- **Driver bugs fixed on the way (not app defects):** runs 1–2 waited only for the lobby heading after a join, but a joiner arriving after a finished game lands on the reveal walk — the driver now waits for the lobby heading, the results' "Back to lobby", the reveal step, or a game indicator, and walks the reveal to the lobby. Run 3 returned only the host to the lobby between games, so the cohost's page had no chooser — now every connected player returns (`backToLobbyAll`).
- EXACT NEXT TASK: Work Package D — modernize Guess the Year (baseline screenshots, kit extraction, driver, commit).

## Work Package D — Guess the Year modernization (COMPLETE, 2026-11-05, local only)

- `apps/web/src/components/mchezo/MchezoYear.tsx` + `yearPlaying` branch in `App.tsx` (after the Closest branch) + driver `scripts/check-year.mjs` (npm script `check-year`). Before/after screenshots (test-fixture data): 18-year-before.png (old green panel, all 8 events at once) / 19-year-after.png (kit panel, one event at a time). The old GamePanel year branch is now dead, left in place like Trivia's and Closest's dead branches.
- **What changed (component/UX extraction, not a gameplay rewrite):** one event at a time with free navigation — jump chips per event (like the Trivia reveal's `mz-reveal-q{i}`, ✓ for guessed events) + a progress line ("Event N of 8"). Any-order answering is preserved (the engine has no current-event pointer; guesses are per event id in `myGuesses`). The unified NumericGuess (Work Package B: one value, one Submit) per event, keyed by event id so each event starts at 2000 (the old slider's initial). **Range correction: 1896–2025, not the old slider's 1900–2025** — one event's answer is 1896 (the first modern Olympics), which the old dial alone could never reach (best 60 on that event). The engine accepts any integer, so the range is a UI correction, not a rule change. Out-of-range input is clamped visibly (the field snaps to the clamped value). A guessed event is locked (confirmation instead of controls). Whole-game abstention via AbstainControl; an abstained player sees the same waiting ring + host skip as a finished player (the old panel showed abstained players no counts and no skip). The waiting ring appears only when the player has guessed all eight or abstained (the server's submittedCount for Year is per-game, not per-event). Intro (ShowIntro) and results (ShowResults) stay old; no projection change (the event context/source is not shown post-finish — a future reveal enhancement would need the finished projection to carry year/context, on the Trivia precedent).
- **Verification: `node scripts/check-year.mjs http://localhost:3461` — YEAR ALL PASSED (29 checks), exit 0** (log `~/workspace/gates-d-check-year3.log`; runs 1–2 found two driver bugs, not app defects — the finishing guess advances the game to the results in the same mutation, so the confirmation never renders; and the results render standings rows ("Ada: 110 points"), not the GamePanel's "Your score:" text). The exact end-to-end scores were verified: the host's 110 (Olympics exact 100 + Web 10) beats Bea's 40, and an abstained player scores 0. Covered: authorization, the 1896 + 2025 boundaries, visible clamping (1800 → 1896), locked guessed events, any-order answering, whole-game abstention, reconnect (a reload keeps the abstained state), the waiting ring, final results, no horizontal overflow at 320/360/390, no skip button before the deadline.
- **Full regression batch (the D gate): 25 drivers + E2E, ALL GREEN after two targeted re-runs** (log `~/workspace/gates-d-batch.log` + `~/workspace/gates-d-rerun.log` + `~/workspace/gates-d-rerun2.log`). The batch itself landed 22/25: F5, game-night, and e2e failed — all three were driver fallout from the Year extraction, not app regressions. F5 and e2e still used the old GamePanel year selectors (fixed with an `actYear` kit helper in both) and their runners still waited for the old "Now playing:" heading (fixed: wait for `mz-year-progress`); the e2e's first failure was my batch error (it defaults to port 3457 — it must be run with the 3461 URL). The game-night failure was its leader check missing the host's "You" row label (fixed). Re-runs: game-night 28/28, F5 30/30, e2e 12/12. The mobile screenshots regenerated by check-mobile were restored before staging (they are regenerable test artifacts, not D content), as were the game-night screenshots regenerated by the re-runs.
- EXACT NEXT TASK: when the D batch lands green, restore the mobile screenshots (check-mobile regenerates them) and commit D; then Work Package E (Geography Challenge).

## Work Package E — Geography Challenge modernization (COMPLETE, 2026-11-05, local only)

- **Choice (from the inspection):** Geography Challenge — the safest next slice: a choice-question game (8 questions, whole-game abstention, `quizAllDone` completion — the same shape as Trivia), so its kit play reuses Trivia's `AnswerGrid` + `MchezoWaiting` with no new input primitive and no new engine work. Its finished projection does NOT carry `correctIndex` (only Trivia's does), so the kit extraction covers play + waiting only and keeps the old `ShowResults` for results — exactly the Closest pattern, no server change. It has no phases, no hidden roles, no teams, and no per-question timers.
- **Built:** `apps/web/src/components/mchezo/MchezoGeography.tsx` (mirrors `MchezoTriviaPlay` minus onTv and minus the reveal: abstained → `MchezoWaiting` "You sat this one out"; locked view — lockcard + `MchezoWaiting` + "Next question" / "Waiting for the game to finish"; all-answered → `MchezoWaiting` "All your answers are in"; otherwise the kit `QuestionScreen` with `accentIndex: 1` (Trivia uses 3), `secondsLeft` from `deadlineAt`, totalSeconds 300, extra = the "Sit this game out" chip button (intent `abstain`)). Intent: `geography-answer` with `{ questionId, chosenIndex }`. **Mode is NOT shown as a label** — the projection for geography carries only {id, prompt, options}; the prompts are self-describing. Adding `mode` to the projection would be a small safe server change — recorded as a possible follow-up, deliberately NOT done so E stays server-free. App wired: import + `geographyPlaying` flag + early-return branch after the year branch. GamePanel's quiz branch still serves Math + Who Said That; only Geography's path is now dead.
- **Verification:** `scripts/check-geography.mjs` (npm script `check-geography`) — **GEOGRAPHY ALL PASSED (24 checks)**, exit 0 (log `~/workspace/gates-e-check-geography6.log`). Exact end-to-end scores verified: host 800 (all eight correct — 8 × 100, `scoreGeography` is binary 100/0; correct indices [0,2,2,2,1,1,0,0]), Bea 0 (all eight wrong), an abstained player 0. Checks cover: guest sees no setup/start; first question is the French flag 🇫🇷; "Question 1 of 8"; 4 `.mz-slab` options; no TV stage chip; no overflow at 320/360/390px; locked view; next question 🇯🇵; waiting ring after all 8; abstention (sat-out ring, no skip before the deadline, reload keeps the abstained state, game finishes without the abstained player).
- **Driver bugs on the way (never app defects):** the waiting ring's label is a `.mz-kicker` (UPPERCASE via CSS — `innerText` returns the uppercase text; compare case-insensitively); the 5s LOCKED IN waits were too short (the answer lands only on the next 2s projection poll — 10s waits + retry); the last finisher's confirmation never renders (the finishing submission advances the game to results in the same mutation — the same server-semantics fact as Year; the driver races LOCKED IN vs the results' "Back to lobby" button). Also: the 3461 server had died (runtime restart) — restarted and verified HTTP 200 before the passing run.
- **Driver fallout fixed ahead of the E gate:** F5 and e2e still used the old GamePanel geography selectors (fixed: geography now shares the `actTrivia` kit helper in both) and their runners still waited for the old "Now playing:" heading (fixed: wait for `.mz-question`, which the geography QuestionScreen also renders).
- **Runner-up / next candidate:** Math Mayhem (choice game, 10 questions, whole-game abstention, but its scoring is speed-based via `elapsedMs` — a kit version should show elapsed time, a small extra design decision). **Not next:** Impostor (hidden roles + phases), Caption Clash (multi-phase text + voting), Charades (team + performance), Word Connections (tile grid — a new input primitive), Category Sprint (free-text answers + rounds). Each needs its own design brief before extraction.
- **Screenshots:** `docs/mchezo-screenshots/20-geography-before.png` / `21-geography-after.png` (test-fixture data).
- **E gate (full regression batch):** 26 drivers + E2E. The batch landed 24/26 + e2e 12/12. The two failures were both driver-side, not app regressions: (1) ws-reconnect 1/4 — solo re-run **ALL PASSED 4/4** (flake, log `~/workspace/gates-e-rerun-ws.log`); (2) F5 5/25 — geography did not finish in 180s. Root cause (driver performance, not the app): F5's `panelFinished` for non-trivia games falls through to a `panelText` lookup that burns its full 2s timeout when there is no game-panel, so each loop iteration cost ~2.5s per page × 5 checks ≈ 13s, and geography needs ~16 iterations (2 actions per question × 8 questions × 4 players) ≈ 216s > 180s. A focused probe (`scripts/probe-geography-f5.mjs`, deleted after use) proved the game itself finishes in ~89s with the exact F5 act pattern. Fix (driver only): geography joins trivia's fast path in `panelFinished` — the "Back to lobby" button appears only on the results screen, never in play. **F5 re-run: ALL PASSED (30/30)**, exit 0 (log `~/workspace/gates-e-rerun-f5b.log`). Year and Closest share the slow `panelFinished` path but pass with margin (~110s of the 180s budget); noted, not changed. Typecheck clean, vitest 369/369, build clean. Mobile + game-night screenshots regenerated by the batch were restored before staging.
- EXACT NEXT TASK: commit E; then Work Package F (error mapping).

## Work Package G — Browser runtime incidents + isolation analysis (2026-11-05, local only, docs only)

- `docs/BROWSER_RUNTIME_INCIDENTS.md`: the evidence log for the SIGTRAP outages — Incident 1 (2026-11-04 night, Milestone I: every Chromium launch died SIGTRAP/exit 133, both browser builds; recovered by a runtime restart ~22:18 EST; no app code changed), Incident 2 (2026-11-05 ~00:50 EST, J.3: same signature, batch held per decision E, recovered 02:04 EST after a restart), Incident 3 (parallel-run interference 01:45 EST: the 30-minute cron timed out after 1800s while batch2 ran against the same server; batch2's F4 failure was the same interference, solo re-run 11/11). No root cause is asserted — no resource measurements were taken during either outage, and the disk was 148G free at the 02:44 baseline. Also records the healthy-runtime shape (fresh temp profile per launch, shared 3461 server, tracked mobile screenshots) and the isolation analysis: rooms are per-driver (no collision), profiles are fresh per launch, the shared port is only a problem *between* concurrent jobs, and the one tracked-directory exception is the mobile screenshots (restore before staging). The protocol (decision E) is restated: minimal launch first, no repeated full suites against a broken runtime, preserve the tree, never claim an unexecuted test passed.
- The K batch is healthy so far (started ~02:40 EST, four drivers green, the fifth — check-leaderboard — running with its headless-shell process alive at 02:50 EST).
- EXACT NEXT TASK: the K batch's remaining drivers; when it lands, the K commit, then the two-button fix, then the C simulation run.

## Milestone K — reliability, accessibility, security hardening (2026-11-05, local only)

- Audit: `docs/K_HARDENING_AUDIT.md` — reliability (duplicate joins/submissions, stale sessions, host-action races, reconnect races as a known limitation, spectator/player confusion, server restarts, room expiration = none, attribution), accessibility (viewports, reduced motion, contrast, targets/focus, real iPhone outstanding), security (role authorization, hidden-answer leakage, spectator boundaries, token exposure, rate limits, replayed actions). Known limitations recorded: no room expiry (decision needed; K does not implement deletion), no supersede (J.2 contract only), `seenIntents` unbounded, snapshot writes still non-atomic (J.2 contract unimplemented by design), real-device verification outstanding.
- Fixes (all demonstrated by new tests before the fix, not asserted):
  1. **Intent replay returned a re-wrapped copy** — the dedupe branch returned `{accepted, result}` rebuilt from the stored entry, so a replayed rejection had `reason: undefined` at top level and the client showed "Not accepted: unknown". Fixed in `room.ts`: the replay returns the stored result byte-for-byte (`return seen.result`). The cast is safe (submitIntent is the only writer of seenIntents; the snapshot format is unchanged). Tests strengthened to `expect(second).toEqual(first)` for both accepted and rejected replays.
  2. **Host-claim attribution** — joining as host logged only `player-joined`; the claim itself had no ledger event. `room.join` now also logs `host-claimed` {playerId} whenever a join establishes the host. LedgerEvent.type is a free string; no schema change.
  3. **Start double-submit guard** — `App.startGame` gained an in-flight guard (`startingRef`); a second call while one is in flight returns immediately (the server already rejected the second start correctly; this is a client UX fix, no rule change).
- Tests: `tests/security.test.ts` — the old test renamed (it claimed to test replay but did not) + a new "Milestone K: intent replay (dedupe pinning)" describe (2 tests: accepted replay returns the original without re-applying (score applied once), rejected replay returns the same rejection `UNKNOWN_QUESTION`); `tests/room.test.ts` — a new "Milestone K: host-claim attribution" describe (1 test: host join logs exactly one host-claimed event with the host's id; guest join logs none). Full suite: **33 files / 369 tests, all passing**.
- New drivers (all green standalone): `scripts/check-restart.mjs` 15/15 (create room → start practice closest → guess → kill the server (SIGTERM) → respawn → projection 200, game still playing, both players disconnected, the guess survived → reconnect 200 → bad token 400; deletes only its own room files), `scripts/check-double-start.mjs` 3/3 (exactly 1 start POST, exactly 1 game in projection — the double-click is one `evaluate` dispatching two bubbling clicks in the same JS task, because sequential locator clicks cannot work once the first click unmounts the button), `scripts/check-viewports.mjs` 16/16 (no horizontal overflow at 320/360/390/768/1024 for the lobby, Trivia play, and Closest play; TV stage at 1280×720 + 1920×1080; TV dashboard at 1920×1080).
- **Full regression batch (the K gate): 23 drivers + E2E, ALL GREEN, 0 FAIL lines** (log `~/workspace/gates-k-batch.log`, ~43 min, exit 0): mchezo, spectator, tv-spectator, tv-lifecycle, leaderboard, tv-entry, m6, ws-reconnect, abstain, f4 11/11, f5 30/30, mobile OK, contrast OK, multiplayer 12/12, reveal, library, shuffle, studio, reduced-motion, closest, restart, viewports, double-start, e2e. No SIGTRAP in this batch; the runtime stayed healthy throughout.
- EXACT NEXT TASK: Work Package B fix (unify NumericGuess to one value + one Submit; update check-closest + F5/e2e actClosest; re-run the affected drivers), then the Package C simulation run.

## Work Package F — error-message mapping (COMPLETE, 2026-11-05, local only)

- **Built:** `apps/web/src/ui/mchezo/lib/errors.ts` — pure `humanError(raw)` (web-safe, no imports) + `tests/errors.test.ts` (7 tests, 376 total). Every entry is grounded in an actual string in `src/server/room.ts`, `src/server/http.ts`, or `src/games/*.ts`. Rules: strip a leading "Not accepted: " prefix; empty/"unknown" → generic ("Something went wrong — try again."); exact matches for the intent codes (PHASE_CLOSED, ALREADY_ANSWERED/SUBMITTED/GUESSED, ALREADY_ABSTAINED, NOT_IN_GAME, INVALID_PAYLOAD/INTENT, UNKNOWN_QUESTION/EVENT/ACTION, WRONG_ROOM, NOT_APPLICABLE) and the server sentences ("A game is already in progress", "Game has not timed out yet", "Display name already taken", "Unknown player slot" / "Recovery token does not match"); prefix rules for the "Only host/cohost can …" family (7 sites) and the "Need at least N connected players" template (room.ts:283); any other bare code → generic; already-human sentences pass through unchanged ("Spectator session expired — …", "Request failed").
- **Wired into App.tsx:** a `reportError` helper (console.warn the raw reason, set the mapped sentence) + `fail(e)`; all seven catch sites that forwarded a raw thrown message now use `fail(e)`; the intent rejection site uses `reportError`. The spectator-401 sentence was already human and is left as-is. No server change.
- **Lobby render (the real fix):** the lobby DID render `err` via `lobbyExtra`, but at the very bottom of that section (after Game setup, QR, Cohost, nav, SettingsBar) — below the fold on a phone, so a start error was effectively swallowed. `err` is now a dedicated `error` prop on LobbyScreen, rendered at the top under the "You're in" heading (`data-testid="mz-error"`, role="alert"); the duplicate in `lobbyExtra` was removed. The landing's error paragraph gained the same testid/role.
- **Verification:** `scripts/check-errors.mjs` (npm script `check-errors`) — **ERRORS ALL PASSED (5 checks)**, exit 0 (log `~/workspace/gates-f-check-errors.log`). Live checks: duplicate display name → "That name is taken in this room — pick another." on the landing, raw sentence absent; bad recovery token + Reconnect → "We could not bring you back into your seat — rejoin with the room code." at the top of the lobby, raw reasons absent; restoring the token + Reconnect clears the error. Driver lesson: `reconnect()` sends the token from React state (read from sessionStorage only at mount), so corrupting sessionStorage alone changes only the header — the driver reloads after corrupting/restoring so the mounted state holds the intended token.
- **F gate (full regression batch):** 27 drivers + E2E. Batch 1 was killed by a runtime restart after 5 drivers (server restarted, Chromium verified OK before continuing); batch 2 landed **26/27 + E2E 12/12** (log `~/workspace/gates-f-batch2.log`). The one failure was check-leaderboard's rank-changes check — a driver bug, not an app regression: with random seeds the first game ties ~1-in-5 and a tied first game poisoned the loop (orderA locked to "tied", so the orderB condition could never be satisfied). Fixed driver-only in the same pattern as the pairs game: the rank-changes games now use seed 1 (600/360 split, deterministic flip in 2 games) and orderA no longer locks on a tie. **Leaderboard re-run: ALL PASSED** (log `~/workspace/gates-f-rerun-leaderboard2.log`). One more driver fallout from F, also fixed at the gate: check-tv-spectator asserted the raw "already taken" text — now asserts the human name-taken sentence; re-run ALL PASSED. Typecheck clean, vitest 376/376, build clean, lint clean. Mobile + game-night screenshots regenerated by the batch were restored before staging.
- **Committed `d42fd96`** (10 files, +346/−33), local only. Tree clean after commit.

## §11 Math Mayhem modernization (IN PROGRESS, 2026-11-05, local only)

- **Choice:** Math Mayhem — the recorded candidate after Geography: a choice-question game (10 questions, whole-game abstention, `quizAllDone` completion — the same shape as Trivia/Geography), so its kit play reuses `QuestionScreen` + `MchezoWaiting` with no new input primitive. Its finished projection carries no `correctIndex`, so the kit extraction covers play + waiting only and keeps the old `ShowResults` for results — exactly the Closest/Geography pattern, no server change. The one extra design decision vs Geography: Math scoring is speed-based (`scoreMathAnswer` = 100 + a bonus from the game start: +20 ≤5s, +10 ≤10s, else +0 — unit-tested in tests/room.test.ts), so the kit locked view shows the player's own elapsed time from the game start.
- **Built:** `apps/web/src/components/mchezo/MchezoMath.tsx` (mirrors `MchezoGeography`: QuestionScreen with `accentIndex: 2`, locked view, `MchezoWaiting` for abstained / all-answered, "Sit this game out" chip (intent `abstain`)). Intent: `submit-math-answer` with `{ questionId, chosenIndex }` — the server computes the bonus from its own clock; the client never sends elapsedMs. The locked view shows the elapsed captured at tap (`mz-math-elapsed`, "Answered in Ns — the speed bonus counts from the start of the game (up to +20 in the first 5 seconds)"), labelled as the time taken, never claimed to be the scored value. No TV stage, no reveal; intro and results stay old. App wired: import + `mathPlaying` flag + early-return branch after the geography branch. GamePanel's quiz branch now serves only Who Said That; only Math's path is dead.
- **Projection shape (unlike Trivia/Geography):** Math questions live on the top-level PlayerGame (`game.questions`, {id, prompt, options}) and the player's answers on `game.myAnswers` — the server projects Math's generated questions only into the player projection while playing (room.ts player branch), not into `state.questions`.
- **Verification:** `scripts/check-math.mjs` (npm script `check-math`) — **MATH ALL PASSED (25 checks)**, exit 0 (log `~/workspace/gates-math-check1.log`). Exact scores verified on a seeded game (seed 1, correct indices [0,2,2,1,1,1,2,3,0,1]): host 1000 (all ten correct, every answer past the 10s bonus bracket so the bonus is +0), Bea 0, abstained player 0. Elapsed display verified live ("Answered in 12s"). Checks cover: guest sees no setup/start; first question "16 ÷ 2 = ?"; "Question 1 of 10"; 4 `.mz-slab` options; no TV stage chip; no overflow at 320/360/390px; locked view (chosen answer "8" + elapsed ≥10s); next question "7 × 4 = ?"; waiting ring after all 10; abstention (sat-out ring, no skip before the deadline, reload keeps the abstained state, game finishes without the abstained player).
- **Driver fallout fixed ahead of the Math gate:** F5 and e2e now route math through the shared `actTrivia` kit helper, wait for `.mz-question`, and use the "Back to lobby" fast path in `panelFinished` (math needs ~20 loop iterations — the 2s panelText timeout per check would have blown the 180s budget, as geography did before its fast path; the e2e's panelFinished was reordered so the kit fast path comes before panelText).
- **Screenshots:** `docs/mchezo-screenshots/22-math-before.png` / `23-math-after.png` (test-fixture data).
- EXACT NEXT TASK (updated 2026-11-05 ~12:00 EST, owner-directed priority change): NO full regression runs until the environment is demonstrably healthy. The scheduled job `local-dev-christmas-30m` is on a TEMPORARY HOLD — no browser drivers at all (pre-hold body preserved at `workspace/goals/christmas-game-night-github-coordination/hidden_files/cron-local-dev-pre-hold-body-2026-11-05.md`; restore verbatim via `cron.update` to lift, owner direction only). The Math gate is HELD: trustworthy passes so far are mchezo, tv-lifecycle, f5 (30/30), contrast, spectator, tv-spectator; check-mobile found the real chip defect (fixed in source: `.mz-chip-btn` 44px → 46px; check-mobile now samples touch targets through the entry animation); everything else failed on Chromium SIGTRAP (environment). When the filesystem recovers: (1) retry the tarball + WIP recovery commit (both blocked on EPERM; the work is preserved on disk + in `~/workspace/backups/mchezo-math-wip-2026-11-05-MANIFEST.txt` + file copies of the four new files); (2) run `scripts/test-run-gate.sh` (runner v3 controlled tests — contention, lock release, TERM orphan cleanup, timeout budget); (3) rebuild with the chip fix, run the targeted tests first (check-math, check-mobile, check-f5, check-contrast), then ONE locked full gate against the exact final source state (never combine results across revisions); (4) restore mobile screenshots, commit Math, then the final §13 handoff. Do not start any gate while the hold is in place.

## Work Package B fix — HELD at the e2e gate by a runtime outage (2026-11-05, local only, uncommitted)

- The fix is implemented and verified except for the e2e: `NumericGuess` now holds one shared value with one primary Submit button labelled with that value (the dial sets it, the field edits it, out-of-range input is clamped visibly, the field's text is a draft while typing and resets on blur, the empty-field-submits-0 quirk is gone). `MchezoClosest` drops the `dialSubmitLabel` prop. `check-closest.mjs` is extended to 21 checks (field moves the dial, the button is labelled with the value, clearing the field keeps the value, exactly one submit button, the dial moves the field, the button follows the dial, plus the original 16). Typecheck clean, vitest 33 files / 369 tests, build clean.
- Verification so far: `check-closest` **21/21 PASSED**, `check-f5` **30/30 PASSED** (both while the runtime was healthy). The e2e reported `E2E FAILED: 4 item(s)`, but its detail was lost to a transient `tee` EPERM on the batch log — and the runtime's Chromium then died at launch with SIGTRAP (see `docs/BROWSER_RUNTIME_INCIDENTS.md` Incident 3, first observed ~03:44 EST, confirmed by a minimal launch test). The 4-item failure is therefore **inconclusive**, not evidence of a regression: the outage may have begun mid-run.
- Per decision E, the commit is HELD and no further browser runs are attempted while the runtime is unhealthy. The tree is preserved (the fix is uncommitted in the working tree). A companion filesystem degradation in the same window blocks git object writes to this repo intermittently (`unable to write loose object file`, flapping — plain file writes work, a throwaway /tmp repo commits fine, disk 148G free); the docs commit recording Incident 3 has failed five times and retries when the writes stop flapping. Do not run git maintenance while the repo is degraded.
- EXACT NEXT TASK: when a minimal Chromium launch returns LAUNCH OK, re-run the e2e once with `>` (not `tee`, to avoid the EPERM) and commit the B fix if it is green; if the same items fail on a healthy runtime, investigate them as a real regression before committing.

## Cron run 2026-11-05 ~04:15 EST (local-dev-christmas-30m — Work Package B fix COMMITTED)
- Tree was DIRTY at run start with the held Package B fix (6 modified files + untracked `scripts/check-game-night.mjs`), exactly the change described in the HELD section above. Per the dirty-tree rule, no file in that dirty list was edited before commit and no uncommitted work was overwritten; the untracked Package C driver was left untouched (not part of the B fix, still not run, still not committed).
- Health checks FIRST (per decision E): minimal Chromium launch returned CHROMIUM_OK; throwaway /tmp repo commit returned GIT_WRITE_OK — both the SIGTRAP outage and the git-write EPERM flapping have cleared in this session.
- Re-verification on the uncommitted tree, BEFORE committing: `npm run typecheck` exit 0 (server + web), `npm test` 33 files / 369 passed, `npm run build:web` exit 0. Then the e2e, run once with `>` (not `tee`, per the HELD section): `node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium --games=all > ~/workspace/gates-b-e2e.log 2>&1` — exit 0, **12/12 passed** (room YZVSAX, all 11 games + views). The earlier "E2E FAILED: 4 item(s)" is therefore confirmed as the runtime outage, not a regression.
- Commit: the B fix was committed AS-IS as `1575fda` "Work Package B fix: unify NumericGuess to one value + one Submit" (6 files, +149/−33), local only. The committed PROGRESS.md still contains the HELD section above; this entry supersedes it — the hold is released.
- Lint gate, found failing on the committed tree (NOT the B fix): `npm run lint` reported 1 error in `scripts/check-double-start.mjs:49` — `startBtn` assigned but never used (a leftover from Milestone K; the clicks go through `host.evaluate` with a querySelector). It is not in the B-fix change and no B-fix file is affected. Fixed in a separate commit in this run: the dead line was deleted (not renamed — it served no purpose), `npm run lint` now exit 0, `npm run typecheck` exit 0, and the driver re-run against a test server passed (`DOUBLE-START ALL PASSED`, 3/3). This commit is `1575fda`'s follow-up; see git log.
- Test server stopped (port 3457 confirmed closed). `data/` left untouched (git-ignored test-room files).
- EXACT NEXT TASK: Work Package C — run the game-night simulation driver (`scripts/check-game-night.mjs`, untracked, not yet run) once, fix what it finds (only low-risk defects within the approved rules), write the review doc, commit. Then Work Package D (Guess the Year modernization, range 1896–2025).
- No GitHub publish, no merge/deploy/spend, no dealer contact. GitHub coordination cron left disabled and untouched.

## Sprint 3 — game lifecycle, competitive fairness, championship integrity (2026-11-06, branch `claude/sprint-3-game-lifecycle`, from 3119f17)
Milestone: Sprint 3 CP1–CP6 implemented; owner decisions of 2026-11-06 applied (D-S3-02, D-S3-09, D-S3-12 approved; qualification option B NOT approved → option E proposed, rule A stays active). Verdict of the full regression on the final commit is recorded in the Sprint 3 report, not here (a result belongs to one run on one revision).

Completed features (files):
- Lifecycle engine: `src/server/lifecycle.ts` (policy table P1/P2/P8/P9), `RoomEngine.tick/syncPhase/expirePhase/finalize/voidGame` in `src/server/room.ts`, server-wide sweep + tick-before-request in `src/server/http.ts`.
- Six independent games end at their deadline with partial results (P3) and participation (P5); lock-step phase deadlines + backstop (Closest, Caption, Sprint); Impostor/Charades practice-only, Charades turn limit.
- Stale-phase guard (`phaseKey`); no routine host Skip (endpoint idempotent, never voids).
- Individual Family Cup (`src/scoring/format.ts`, immutable per room; legacy rooms combined 75/25); qualification options A–E (`src/scoring/qualification.ts`, A active).
- Math per-question server timing (`math-open`), outdated-client detection and refresh banner (`src/shared/clientProtocol.ts`, `apps/web/src/components/RefreshBanner.tsx`).
- UI: server-time countdowns, outcome/participation lines, practice-only lobby labels, Cup label (`apps/web/src/ui/mchezo/components/Lifecycle.tsx`, `lib/lifecycle.ts`).
- Test-only time scale `MCHEZO_LIFECYCLE_SCALE` (refused in production); own-server browser driver `scripts/check-lifecycle.mjs`; failure diagnosis `scripts/lib/diagnose.mjs`.
- Docs: DECISIONS D-S3-01..13, `SPRINT_3_QUALIFICATION_OPTIONS.md`, `SPRINT_3_GAME_DESIGN_REVIEW.md`, `SPRINT_3_RECLASSIFICATION_DESIGN.md`, TESTING.md.

Tests added: lifecycle (27), phased (14), cup-integrity (20, incl. a 4-day Cup generated on 3119f17), math-timing (13), lifecycle-display (7), lifecycle-scale (4), privacy-sprint3 (3), diagnose (1). Sprint 1/2 tests that encoded superseded behaviour were rewritten to the approved rules, not deleted.

Failures found and fixed during the sprint: Math next-question clock started under the locked view (caught by check-answer-race on the full gate); refresh banner covered answer buttons (caught by check-lifecycle); drivers assuming the old disconnect/skip/official-Impostor rules (check-f5, check-game-night, check-leaderboard, check-math).

External blockers: none. Not done (needs people/devices): real-device acceptance, real-family timing playtest.
Next task: owner decisions on qualification option E and measured durations; Sprint 4 only when authorised (recommendation in `docs/SPRINT_3_GAME_DESIGN_REVIEW.md`).
Risk: content is thin for a 7-day Cup (repeats); P2 durations are unmeasured; network delay counts against Math speed.

## Sprint 4 — content depth, competitive fairness, game experience (2026-11-06, branch `claude/sprint-4-game-experience`, from 5e05a8a)
The verdict of the full regression on the final commit is in the Sprint 4 report, not here.

Completed (files):
- CP1 qualification: a saved, validated, immutable Cup record (`src/server/cup.ts`). New Cups use meaningful participation (≥50% of opportunities and ≥2 genuine actions in a counted game); older Cups keep their rule. Invalid records pause standings. `tests/qualification.test.ts` (30).
- CP2 content system: `src/content/{schema,registry,lint,cli}.ts`, `content/packs/*.json`, `content/approvals.json` (bound to item hashes), `npm run content:check|review|approve`. `tests/content.test.ts` (14).
- CP3 selection: `src/content/{select,materialize}.ts`, per-Cup usage history in the room snapshot, practice retirement, 409 CONTENT_EXHAUSTED. About 690 items authored; all provisional (practice-only) except 21 computed Closest items. Fixed: Connections tiles were sent in answer order. `tests/content-selection.test.ts` (13).
- CP4 Word Connections UI (`MchezoConnections.tsx`, `games.css`, `GameKit.tsx`), per-player server view, engine guess-validation fixes. `scripts/check-connections.mjs`, `tests/connections-view.test.ts` (4).
- CP5 Caption Clash UI (`MchezoCaption.tsx`). Fixed: voting wasn't anonymous (caption id = author id). `scripts/check-caption.mjs`, `tests/caption-view.test.ts` (5).
- Docs: DECISIONS D-S4-01..09, `docs/SPRINT_4_DESIGN_SYSTEM_NOTES.md` (incl. Charades investigation), TESTING.md (content oracle, test content mode).
- Test infrastructure: `MCHEZO_CONTENT_TEST_MODE` (test-only), `scripts/lib/content-oracle.mjs`, injectable content library.

Unit tests: 57 files / 648 tests. External blockers: none. Not done: Charades prototype (design only), real-device and Safari checks (no WebKit here), human review of the new content.
Next: owner editorial approval of content (`npm run content:review`); Sprint 5 only when authorised.
Risk: official games stay content-starved until content is approved (Trivia: one official game per Cup; Category Sprint: none).

## Content Quality 2.0 — editorial standard, audit, pilot (2026-11-07, branch `claude/content-quality-2`, from 212376f)
Milestone: all seven deliverables drafted for owner review (`docs/content-quality-2/README.md`). No status changes, approvals, engine, scoring or selection changes.

Completed (files):
- Standard: `docs/content-quality-2/EDITORIAL_STANDARD.md` (7 gates, 5-dimension rubric with an 18/25 bar, difficulty bands, per-game guidance for all 11 games, variety rules, verification levels).
- Audit: `LIBRARY_AUDIT.md`, plus `audit-verdicts.json` (a verdict for every one of the 571 items) and the generated `LIBRARY_AUDIT_TABLE.md`. Result: 305 KEEP / 126 REVISE / 40 REPLACE / 100 REJECT.
- Pilot: `content/pilot/pilot-cq2.json` (60 items, 10 games; rendered as `PILOT_ITEMS.md`); `TRANSFORMATIONS.md`, `DISTRIBUTION.md`, `WORKFLOW.md`, `ENGINE_CHANGES.md`.
- Tools: `scripts/content-quality/{pilot-lib,check-pilot,render-pilot,audit}.ts`; npm `content:pilot`, `content:pilot:render`, `content:audit`; `tests/content-pilot.test.ts` (5).

Findings needing the owner:
- E1: client input clamps make 14 official-eligible Closest items unanswerable (everyone ties).
- E3: item explanations are never shown on any screen.
- E2: Category Sprint lists reject valid answers (peer-challenge proposal; a scoring change).

Failures: none outstanding. External blockers: none.
Not done (needs people): human fact-check and editor re-score of the pilot.
Next task: owner review of the pilot and decisions 1–5 in the README; then the first reviewed batch (at most 30 items).
Risk: the pilot's facts are self-checked by Claude only, and every item lists its required human check. Rubric scores are self-assessed.

## Content Quality 2.0 — integrity fixes (2026-11-07, branch `claude/cq2-integrity-fixes`, from 88995ae)
Milestone: owner-approved E1 and E3 implemented; E2 v2 design, a blind 20-item pilot review batch and audit batch A prepared. No scoring rule changed, no content status changed, no approvals recorded, nothing merged or deployed.

Completed (files):
- E1:
  - `src/shared/numericInput.ts`, `src/content/select.ts` (`answerEnterable`), `src/content/lint.ts`;
  - `src/server/room.ts` (INVALID_GUESS, CLIENT_OUTDATED), `src/server/http.ts`, `src/shared/clientProtocol.ts` (protocol 4);
  - `apps/web/src/ui/mchezo/components/NumericGuess.tsx`, `MchezoClosest.tsx`, `MchezoYear.tsx`.
- E3:
  - `src/server/room.ts` (`quizQuestionsView`, `yearEventsView`), `src/games/closest.ts` (`closedQuestions`), `src/content/schema.ts` (Who Said explanation);
  - `apps/web/src/components/mchezo/AnswerReview.tsx`, `ShowMode.tsx`, `MchezoTrivia.tsx`, `App.tsx` (TV dashboards).
- Tests:
  - `tests/numeric-input.test.ts` (12), `tests/reveal-e3.test.ts` (6; all six fail if reveals are made unconditional);
  - drivers `check-closest`, `check-year` (emulated phone), new `check-answer-reveal`; `scripts/lib/protocol.mjs` for the API drivers.
- Docs:
  - `docs/content-quality-2/E2_CATEGORY_SPRINT_V2.md`;
  - `review-batch-01/` (blind sheet, scores CSV, author key), `audit-batches/BATCH_A_FACTUAL_AND_MECHANICAL.md`, `screenshots/e3-*.png`;
  - tool `npm run content:review-batch`.

External blockers: none.
Not done:
- real-device check on iPhone Safari and Android Chrome (only emulated phones in Chromium here; no WebKit);
- human review of the pilot batch and audit batch A.

Next: the owner reviews review-batch-01 and batch A, and decides on E2 v2. No new content generation until then.
Risk:
- Old tabs must refresh before they can submit numeric guesses (by design).
- The official Closest pool briefly dropped to 15 items under the interim rule; it is back to 29 with the wider input.

Verification (code at c70f16b; this note is a docs-only commit on top):
- `npm run gate:full` on c70f16b in a fresh clone: **PASSED (exit 0)**, run `20261107-035306-c70f16b0-167`. 44 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid.
- Two earlier full runs were killed by container restarts; their partial results were discarded, not combined.

## Content Quality 2.0 — owner review applied (2026-11-07, branch `claude/cq2-editorial-revision`, from 44b0022)
Milestone: revision after the owner's review of the E1/E3 checkpoint, review batch 01, E2 v2 and Audit Batch A, plus the new audience and personality direction. The E1/E3 checkpoint and its recorded gate (c70f16b, run 20261107-035306-c70f16b0-167) are untouched on `claude/cq2-integrity-fixes`.

Completed (files):
- Pilot revision:
  - `content/pilot/pilot-cq2.json`: 60 → 69 items, all provisional. Owner-priority fixes; qualifiers on measurement-dependent claims; 9 new modern, nostalgic and playful items; tone, playlist and mechanic tags.
  - Edit script: `scripts/content-quality/revisions/rev01_owner_feedback.py`.
- Review batch 02 (21 items, blind): `content/pilot/review-batch-02.json` and `docs/content-quality-2/review-batch-02/`, including BEFORE_AFTER.md (`npm run content:pilot-diff`).
- Round-variety rule (E10 proposal): `roundVarietyProblems` in `scripts/content-quality/pilot-lib.ts`.
- E2 v3 design: `docs/content-quality-2/E2_CATEGORY_SPRINT_V3.md`. The simulation is `scripts/content-quality/sprint-sim.ts` and `sprint-sim-report.ts` (`npm run content:sprint-sim`), with output in `E2_SET_SIZE_SIMULATION.md`.
- Audit Batch A applied:
  - 7 packs in `content/packs/` (14 retired as rejected, 4 boards fixed, 1 distractor fixed, 2 practice lists extended);
  - `scripts/content-quality/revisions/batch_a_apply.py`;
  - `docs/content-quality-2/audit-batches/BATCH_A_APPLIED.md`.
- Standard §5a (audience and personality). Report: `docs/content-quality-2/REVISION_REPORT.md`. Decisions D-CQ2-12..16.
- Tests: `tests/sprint-sim.test.ts` (5), `tests/audit-batch-a.test.ts` (9), and 6 more in `tests/content-pilot.test.ts`.

Failures found and fixed:
- `npm run content:pilot` crashed on `review-batch-01.json` (since c70f16b). It now skips non-pilot files.
- My first A1 test claimed the solver rejects a "Winter words" rename. It doesn't (counting forces one solution), so the test and the rationale were corrected: the rejection is editorial.

External blockers: none.

Not done:
- human fact-checks and reviews;
- the real-device check of E1/E3 (still outstanding);
- E2/E9/E10 implementation (awaiting approval).

Next: stop for owner review. No library expansion and no further content batches until review batch 02 is reviewed.

Risk:
- A1 edits the only official Connections board; it needs owner sign-off at merge.
- Batch A retires 14 provisional items, which shrinks the practice pools slightly.

Gate verdict (one run, one revision): `node scripts/gate.mjs full` on `e06fe92`, in a fresh clean clone: **PASSED (exit 0)**, run `20261107-114948-e06fe92c-3602`. 44 passed, 0 failed, 0 timed out. Unit tests: 691 passed (62 files). This verdict covers `e06fe92` only. The commit that records it changes docs only.

## E2 implementation and owner corrections (2026-11-07, branch `claude/cq2-e2-sprint-v3`, from 9e3796d)

Milestone: the owner's second Content Quality 2.0 review is carried out. Nothing is merged or deployed, no approvals are recorded, and there is no spending.

**Completed:**
- **E2 v3 Category Sprint implemented with the owner's corrections:**
  - `src/games/sprint.ts`: matcher v2, with v1 unchanged.
  - `src/content/closedSet.ts`: membership verification and the size policy.
  - `src/content/select.ts`: player-count filter, with no fallback (`NO_SUITABLE_CATEGORY`).
  - `src/content/registry.ts`: reference lists; a real approval is refused without a source check.
  - `src/server/cup.ts`: `categorySprint` on new Cups.
  - `src/server/room.ts`: rules frozen per game; results show each player only their own verdicts.
  - Web: definition and results.
  - Content: 7 provisional closed sets in `content/packs/category-sprint-closed.json` and `content/reference/sprint/`; 14 open categories moved to practice.
- **Batch A follow-up:**
  - semantic overlap review (`docs/content-quality-2/audit-batches/batch-a-semantic-review.json`);
  - old- and new-board history tests.
- **`cls-cq2-05`:** the wording is fixed and the scoring convention is stated.
- **Review batch 02:** the five checks are written up (`review-batch-02/EDITORIAL_CHECKS.md`) and four wording fixes applied.
- **E10:** the v2 rule and a bounded variety step, simulated (`scripts/content-quality/variety.ts`, `npm run content:variety-sim`, `docs/content-quality-2/E10_ROUND_VARIETY*.md`). Not wired in.
- **`scripts/clickthrough-api.mjs`:** retired as a tombstone that always exits 2. `tests/script-inventory.test.ts` added and `docs/TESTING.md` updated.

**Tests:** 760 unit tests passed (66 files). New: `tests/sprint-e2v3.test.ts` (48), `tests/batch-a-compat.test.ts` (7), `tests/variety.test.ts` (10), `tests/script-inventory.test.ts` (4). Typecheck, lint, `content:check`, `content:audit` and `content:pilot` are all OK.

**Failures found and fixed:**
- The first E10 rule flagged 93–100% of realistic rounds; it was recalibrated to v2.
- The clickthrough driver was stale and was retired.

**External blockers:**
- The closed-set source pages (census.gov, europa.eu, un.org, iupac.org, iau.org, wikipedia.org) are blocked by this session's network, so the membership lists have no source check.
- E1/E3 real-device verification is still outstanding.

Gate verdict (one run, one revision): `node scripts/gate.mjs full` on `a95e211`, in a fresh clean clone: **PASSED (exit 0)**, run `20261107-145405-a95e2112-7784`. 44 passed, 0 failed, 0 timed out. Unit tests: 760 passed (66 files). This verdict covers `a95e211` only. The commit that records it changes docs only.

**Next:** stop for owner review. See `docs/content-quality-2/STATUS_2026-11-07_E2_IMPLEMENTATION.md`.

**Risks:**
- Category Sprint official matching changes for new Cups; old Cups are unaffected.
- A Cup can play only one official Sprint game until more closed sets exist.
- Membership lists need a human source check before any approval.

## E2 checkpoint follow-up (2026-11-07, branch `claude/cq2-e10-meta-sprint-sources`, from 999a3f1)

**Milestone:** the owner's follow-up review of the E2 checkpoint (E10 partial approval, Sprint source checks, `con-s4-02`, a small draft batch). The `a95e211` checkpoint is kept intact. Report: `docs/content-quality-2/STATUS_2026-11-07_E2_FOLLOWUP.md`.

**Done:**
- **Sprint source comparison:** `scripts/content-quality/sprint-sources.ts`, `sprint-source-compare.ts`, `docs/content-quality-2/SPRINT_SOURCE_CHECK.md`, snapshots in `docs/content-quality-2/sprint-sources/`.
  - Six lists match their sources; the Chinese zodiac is blocked (Britannica bot challenge).
  - No `sourceCheck` recorded.
- **Draft batch 1:** Asia (47), the 2026 World Cup (48) and NFL (32), all practice and provisional. File: `content/packs/category-sprint-closed-drafts.json`.
- **`con-s4-02` redesign:** Herbs → Gemstones (`rev05_con_s4_02.py`).
- **E10 metadata:** `mechanic` and `negativeStem` on 235 quiz items (`rev06_quiz_mechanics.py`), with `content:check` warnings `format-untagged` and `content-mix`. The selector is unchanged.
- **Docs:** decisions D-CQ2-22..26.

**Tests:**
- `tests/sprint-sources.test.ts` (18), `tests/quiz-format.test.ts` (8), and `tests/batch-a-compat.test.ts` +2.
- 788 unit tests passed (68 files).
- typecheck, lint, `content:check`, `content:audit` and `content:pilot` all OK.

**Failures found and fixed:**
- The first negative-stem pass flagged words inside quotes; it now checks question stems only.
- The semantic review file's layout was briefly reflowed by a generator; it was restored.

**External blockers:**
- www.britannica.com and www.pokemon.com refuse automated access.
- olympics.com fails with an HTTP/2 protocol error.
- The White House presidents list names no 46th president.
- E1/E3 real-device verification is still outstanding.

Gate verdict (one run, one revision): `node scripts/gate.mjs full` on `5bae6de`, in a fresh clean clone with `MCHEZO_CHROMIUM_PATH` set to the machine's headless shell (build 1243): **PASSED (exit 0)**, run `20261107-165621-5bae6de8-15851`. 44 passed, 0 failed, 0 timed out. Unit tests: 788 passed (68 files). This verdict covers `5bae6de` only. The commit that records it changes docs only. An earlier run on the same commit (`20261107-165517-5bae6de8-14010`) stopped with INFRASTRUCTURE ERROR (exit 2): the browser preflight failed because the variable was not set. That run is not a verdict.

**Next:** stop for owner review. The owner's next priority is real-device testing of Mchezo.

**Risks:**
- Machine-matched lists still need a human source check.
- Rooms of 9–10 players still get one official Sprint game.
- Canonical answers display in normalised form.

## 2026-11-07: final content checkpoint + real-device testing handoff (branch `claude/real-device-acceptance`, from `65d5aca`)

The owner accepted `5bae6de`. This session handled the owner's final content rulings and prepared real-device acceptance. It was not a content sprint.

**Done:**
- **Chinese zodiac:** compared with the owner-named UN publication ("The Chinese Zodiac: In Praise of the Jade Rabbit"). All 12 match. `npm run content:sprint-sources -- --only <id>` refetches one source. No `sourceCheck` or approval was recorded.
- **Congo ruling:** in new Cups (`categorySprint.answerRules: 2`), a bare "Congo" is a near-miss: it scores 0 and results explain the two Congos. Every unambiguous Republic or DRC form scores.
  - Earlier Cups keep scoring a bare "Congo" as the Republic, from a frozen `answerRules1` copy on `spr-cs-africa`. Started games keep their own copy.
  - The World Cup draft also explains a bare "Congo"; it still scores 0 there.
  - Files: `src/server/cup.ts`, `src/content/{schema,materialize,closedSet}.ts`, `src/server/room.ts`, `scripts/content-quality/revisions/rev07_congo_zodiac.py`. Tests: `tests/congo-ruling.test.ts` (29).
- **Stable answer IDs and display names:** a proposal only, in `docs/content-quality-2/E2_ANSWER_IDENTITY_PROPOSAL.md`. Nothing is implemented, and the NFL draft stays practice-only.
- **Real-device testing:** `docs/REAL_DEVICE_TESTING.md` (setup, checklist A–H, a feel survey) and `docs/device-testing/RESULTS_TEMPLATE.md` (device table, checklist, issue log).
  - `npm run serve:device-test` uses test-mode content and `./data-device-test`, and is refused in production. `serve` now prints the Wi-Fi addresses phones should use. Test: `tests/serve-device-test.test.ts`.
- **Decisions:** D-CQ2-27, D-CQ2-28 and D-DEV-01.

**Unchanged:**
- E10 window-three selection stays off.
- No scoring formula changed.
- Nothing merged, deployed or approved, and no spending.

**Found while preparing:**
- Inside this cloud sandbox, browser WebSockets to non-localhost addresses get a 403 from the sandbox's egress proxy (through the proxy environment variables), so a LAN-style origin shows "Reconnecting…" forever.
- The server itself answers the upgrade on the same address (101 via curl). With the proxy variables removed, a non-localhost hostname connects and stays connected.
- This is not an app defect, and a home network is not affected.

**Next:** the owner runs the real-device session, then sends the results file, the server log and a zip of `data-device-test`. Blockers get a failing test first, then a fix.

**Risks:**
- Real WebKit (iOS) has never run this app.
- Router or client isolation on some home networks. The guide has the free hotspot fallback; anything else needs owner approval.

## 2026-11-07: Codespaces phone-preview investigation (branch `claude/codespaces-preview`, from `09bc6c6`)

The owner has no laptop for about 10 hours, so this session checked whether GitHub Codespaces can serve Mchezo to iPhone Safari. **Verdict: feasible for a one-person private test, not for a family session** (that needs a public port and owner approval).

**Added:**
- `.devcontainer/devcontainer.json`: Node 22, 2-core, forwards port 3000 privately, runs `npm ci && npm run build:web`, and starts `serve:device-test` on every start through `.devcontainer/start-preview.sh`, which never starts a second copy.
- `serve.ts` prints the private `https://<codespace>-3000.app.github.dev/` address when `CODESPACE_NAME` is set.
- `docs/CODESPACES_PREVIEW.md`: phone steps, costs and limits.
- Tests: `tests/codespaces-preview.test.ts` (port never public, smallest machine, no prebuilds or secrets, test-mode server) and one more case in `tests/serve-device-test.test.ts`.

**Verified here, not in a real codespace:**
- An HTTPS reverse proxy on another origin that, like a private port, refuses requests without an auth cookie:
  - the anonymous page is refused;
  - the app connects over `wss://` with its session subprotocol intact;
  - there's no localhost QR warning;
  - a second tab joins through the QR link as its own seat;
  - refresh keeps the seat, and a game starts.
- `start-preview.sh` run twice starts one server and prints the address.
- Unit tests: 826 passed (71 files); typecheck and lint OK.

**Not verified:**
- A real codespace. This session can't create one, and creating one is the owner's action on their own account.
- The real GitHub private-port cookie on a WebSocket upgrade from iOS Safari.
- The reported WebSocket drops through Codespaces (the app reconnects).

**Limits:**
- Private means only the owner's signed-in GitHub account can open it.
- The idle timeout ignores port traffic, so the guide says to raise it to 120 minutes.
- The private-port auth cookie lasts 3 hours.

## 2026-11-07: product experience audit and redesign proposal (branch `claude/ux-audit`, from `fa1514b`)

The owner tested Mchezo on a real iPhone through the Codespaces preview and asked for an independent audit and a redesign proposal, **with no UI implementation in this pass**.

**Added (docs only):**
- `docs/ux-redesign/README.md`: summary and decisions D1–D7.
- `docs/ux-redesign/AUDIT.md`: journeys and the code that owns them; findings with severity, type and code references.
- `docs/ux-redesign/PROPOSAL.md`: IA, navigation, home and lobby alternatives, the "Night Circle" design system, procedural cover art, screen specs.
- `docs/ux-redesign/PLAN.md`: staged plan, migration, QA matrix.
- Mockups (`mockups/*.png` from `mockups.html` via `render.mjs`) and evidence (`evidence/`).

**Confirmed defects, not fixed (awaiting decisions):**

| | Defect | Where |
|---|---|---|
| F1 (score integrity) | A one-player official game shows "counts toward the Cup", but standings skip it and its content is retired from the official pool | `room.ts:1359,1454,1531,612` |
| F2 | The share button has no handler | `screens.tsx:144` |
| F3 | Official and Practice selected states are identical | no `aria-pressed` style on `.mz-chip-btn` |
| F4 | No browser history | |
| F5 | Advance day is irreversible with no confirmation | |
| F6 | The 8 s client intro eats the first phase of phased games | |
| F7 | Sound does nothing | |
| V1 | Lobby title overlap | fixed-height flex screen |
| V2 | Green `body` background, no `theme-color` | |

F1 is a score-integrity issue under the AGENTS.md safety rule. Its fix changes an eligibility rule, so it waits for the owner's decision D1; a failing test is written first.

**Verification:**
- Evidence was captured in Chromium phone emulation, not WebKit.
- Unit tests 826/826 and lint OK. No code changed, so no gate run was needed for this docs-only commit.

**Next:** the owner's decisions D1–D7. Then stage 0 (stable test hooks) and stage 1 (safe defect fixes).

**Risks:**
- A copy change without stage 0 breaks 41 drivers.
- A real-WebKit-only issue (V6) is unconfirmed.

## 2026-11-07: stage 1, approved fixes (branch `claude/ux-stage1-fixes`, from `f2127c5`)

The owner accepted the audit, approved Night Circle, Home B, Lobby A and the procedural covers, and authorised a narrow first implementation. This is not the five-stage rewrite.

**Commits:**
- `8a1b699`: D1 failing test (3 of 5 fail).
- `b66b2fc`: D1 server fix.
- `517304c`: UI fixes.
- `67c2de9`: docs (stage-1 README, D3 contract v1, mockup and proposal corrections).
- `4ca59a3`: restores the setup-card sentence that `check-shuffle` reads (see Tests).
- `1cc25a4`: D3 contract v2 with the owner's rulings T1–T5 and six safeguards (docs only, not implemented).

**Done:**
- **D1:** official games with fewer than 2 competitors are refused before content selection (409 `OFFICIAL_NEEDS_TWO`). The lobby gives an explicit practice choice. Historical one-player games keep their stored record but report "not counting".
- **F2** invite sheet (native Share, Copy, fallback, honest private-preview note).
- **F3** visible and accessible Official/Practice state.
- **F5** day-advance confirmation.
- **V1/V6** lobby overlaps.
- **V2** Mchezo background, theme-color and title; legacy palette recoloured.
- **F7** no dead Sound switch.
- **F8** motion setting on every screen.

**Docs:**
- `docs/ux-redesign/stage1/README.md`: before/after and iPhone test steps.
- `docs/ux-redesign/D3_TIMING_CONTRACT.md`: decisions T1–T5.
- PROPOSAL §6.8 and §10 corrections (Results arithmetic: Trivia scores a flat 120 per correct answer, so there's no variable speed bonus; no invented statistics; dock caveats).
- `mockups/results.png` corrected.
- Decisions D-UX-01..06.

**Tests:**
- Unit: 840 passed (73 files). Typecheck and lint OK.
- Targeted gate `20261107-210923-517304c4-5008` on `517304c`: PASSED (12/12: lobby-fixes, mchezo, lifecycle, mobile, contrast, readiness, viewports, connections, double-start, tv-entry). Not a release verdict.
- **Full gate on `67c2de9`: FAILED (exit 1),** run `20261107-212035-67c2de95-6617`. 44 passed, 1 failed (`check-shuffle`, 4 checks).
  - Cause: `517304c` shortened the setup-card sentence "Up next is X. Official games count toward the Cup; practice games do not." to "Up next is X.". The driver reads the up-next title from that sentence. The targeted run hadn't included `check-shuffle`.
  - Fix (`4ca59a3`): the sentence is restored. The driver is unchanged (no weakened assertion).
  - Targeted run `20261107-223527-4ca59a30-13747` on `4ca59a3`: shuffle, library, lobby-fixes, mobile, viewports, mchezo: 8/8 PASSED.
- **Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `4ca59a3`:
  - PASSED (exit 0), run `20261107-223915-4ca59a30-14719`.
  - 45 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
  - Unit tests 840 passed (73 files); e2e-chromium 12/12.
  - Fresh clone, untracked `node_modules` symlinks only; `MCHEZO_CHROMIUM_PATH` = this machine's headless shell 1243 (153.0.8010.12).
  - This verdict covers `4ca59a3` only. `1cc25a4` and this recording commit change docs only.

**Not changed:**
- Home/Lobby migration, Championship/TV rebuild, games, D2 solo practice, D3 timing.
- No scoring formula changed. No merge or deployment.

**Next:**
1. The owner tests on an iPhone via a separate codespace on this branch.
2. D3 implementation on its own branch, once the v2 contract is approved (provisional defaults P1–P3 still open).
3. Then approval of the Lobby A / Home migration and D2.

**Risk:** the stage-1 lobby changes are verified in Chromium phone emulation only, not yet on a real iPhone.

## 2026-11-08: D3, rules and Ready before every game (branch `claude/d3-briefing`, from `a0ea4aa`)

**Approval:** the owner approved D3 with T1–T5, the six safeguards, P1 and P3, and P2 modified (Start now doesn't mark the host ready). The branch is separate and contains Stage 1 underneath it.

**Commits:**
- `b2bea94`: rulings and decisions (docs).
- `43a2de7`: failing tests (55 of 58 failing).
- `f0147c0`: server.
- `ad2fb89`: client.
- `70e7b88`, `f0db7e3`, `4906136`: drivers.
- `a24e1fe`: client helper tests and docs.
- `063f1c9`: late-joiner fix and the iPhone guide.

**Done:**
- **Timing version 2 is frozen per Cup** (`POST /rooms`). Existing Cups and stored games are untouched.
- **Start opens a briefing:**
  - content is frozen but not recorded as used, and no clock runs;
  - every audience sees the rules and readiness, never content;
  - Ready can be withdrawn until play;
  - play starts automatically when every roster player is ready and nobody is reconnecting, with the connected minimum checked again;
  - host or cohost Start now after 20 s, with a confirmation the server checks against its own state (the host is not marked ready);
  - one T_play step starts every clock, records content usage and writes `game-started`;
  - a pushed warning at 4:00, then cancellation at 5:00, leaving no game, usage or score;
  - host Cancel.
- **Briefing is an active game** for Start and Advance day.
- **Restart:** the snapshot keeps the briefing, and a restart never cancels without 60 s of visible warning. A restart that loads changed content cancels as `content-changed`.
- **Client protocol 5.**
- **Phone, TV and spectator briefing screens.** Everyone is told when a briefing is cancelled. Version-2 games have no second intro.
- **Bug found by `check-readiness` and fixed:** a player who joined after a game started saw its answer buttons. The old intro had hidden it. They now stay in the lobby with a note.

**Tests:**
- **Unit:** 905 passed (76 files), up 58 + 7 from new D3 tests. A mutation check proved that the secrecy test catches a content leak in all 11 games.
- **Existing tests on version 1** (D-UX-09):
  - existing engine tests are unchanged;
  - six HTTP test files pass `newCupTiming: 1`, with no assertion changed.
- **Drivers:** every driver that starts a game plays the briefing (D-UX-11). The new driver `check-briefing` runs with its own scaled server.
- **Targeted runs:**
  - `20261108-002122-f0147c00-30897`: batch 1, 11/11.
  - `20261108-003930-49061369-1070`: check-briefing.
  - `20261108-004229-a24e1fe0-1546`: 12/13, `check-readiness` failed; the fix followed.
  - `20261108-005648-063f1c9a-3695`: 8/8 on the fix.
  - One batch run was invalidated by the gate itself (`20261108-002815-…`), because I edited scripts during it. Gate runs were then moved to a separate clone.
- **Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `063f1c9`:
  - PASSED (exit 0), run `20261108-010213-063f1c9a-4572`.
  - 46 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
  - Unit tests 905 (76 files); e2e-chromium 12/12.
  - Fresh clone, untracked `node_modules` symlink only; `MCHEZO_CHROMIUM_PATH` = this machine's headless shell 1243.
  - This verdict covers `063f1c9` only. The recording commit is docs only (this entry and the screenshots copied from that run).

**Screens and iPhone steps:** `docs/ux-redesign/d3/README.md` (new codespace on `claude/d3-briefing`; existing previews untouched).

**Not changed:**
- Score formulas, eligibility, D1, roster rules, abstention, content approvals, existing Cups.
- The Codespaces preview branch.
- No merge, deployment or spend.

**Open:**
1. The owner tests on an iPhone.
2. D-UX-10, the forfeit and abandonment question: alternatives and worked examples to come.
3. Next, if approved: Home B and Lobby A.

**Risk:**
- Verified in Chromium emulation only, not on a real iPhone.
- Real-time behaviour (20 s, 5 min) is tested with scaled timers in drivers and fake clocks in unit tests.

## 2026-11-08: live-audit defect triage (branch `claude/audit-defect-triage`, from `claude/d3-briefing` at `0cfb50d`)

**Scope:** the independent live audit, treated as external evidence. Only defects reproduced on D3 were fixed. Reconciliation of every finding (A-01..A-23, L-01..L-07, six categories): `docs/audit-triage/RECONCILIATION.md`. Decisions: D-UX-12, D-UX-13.

**Fixed, each with a failing test first:**
- **A-01/A-02:** the legacy global `button:disabled { opacity: .5 }` overrode the kit's answer-card states, so "gone" cards showed through the chosen one. The kit now states its disabled looks, and the chosen card paints on top. The "LOCKED IN" stamp sits below a long answer, never over it.
- **A-03:** standings never split a shared rank: a three-way tie shows all three, and "you" are added below only when outside it (`standingsRows`).
- **A-05:** a player on Library, Studio, Championship or Memory Book is brought to the briefing once. The TV view offers "Back to my phone to get ready" instead (TV seats keep the TV).
- **A-06:** until the first projection arrives, the phone says "Rejoining your room…" instead of an empty lobby "You're in, friend · 0 here".
- **A-07:** someone who joined after a game finished stays in the lobby, not on its results as "Did not answer · 0".
- **Found by the full gate and fixed:**
  - **The rejoining screen hid Reconnect.** After a reload with a rejected credential (`check-errors`), its button said "Try again" with its own error line. It now offers the lobby's **Reconnect** and the shared error line.
  - **The banner covered the button.** The fixed "signed out" banner covered that button (targeted run `…-c4c17e40-14389`), so the actions now sit at the bottom.
- **Driver hardening (no assertion weakened):** the A-05 setup clicked the TV button by a loose pattern and swallowed errors, so a missed click failed for the wrong reason (targeted run `…-a90031d0-15346`). It now clicks exact names and waits for each view.

**Not changed:** server state, scoring, ranks, eligibility, readiness rules, content approvals, existing Cups.

**Tests:**
- Unit 910 (A-03 cases in `tests/audit-triage.test.ts`).
- `scripts/check-audit-fixes.mjs`: 50 checks at 375/390/430, long answers, reduced motion, ties, late joiners, the away screens, slow reloads.

**Runs:**
- **Targeted:**
  - `20261108-054451-7e66677d-6605`: PASSED, 20 steps.
  - `20261108-061936-c4c17e40-14389`: FAILED (check-errors).
  - `20261108-062422-a90031d0-15346`: FAILED (A-05 setup).
- **Full gate on `2492a0b`** (`20261108-060756-2492a0bd-10077`): FAILED at `check-errors`. It was stopped after the failure, since it could no longer pass, and does not count.
- **Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `f9dfcf2`: **PASSED (exit 0)**, run `20261108-063036-f9dfcf2f-16569`. 47 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled; unit tests 910; e2e-chromium 12/12. Fresh clone; untracked `node_modules` symlink only; `MCHEZO_CHROMIUM_PATH` = this machine's headless shell 1243. The verdict covers `f9dfcf2` only; this recording commit is docs only.

**Outstanding (from the reconciliation):**
- **Home B / Lobby A (category 2):** A-04 (host name), A-08 (truncated names), L-02 (Start below the fold). A-04 and L-02 are addressed in Stage 2.
- **Results and TV redesign (category 3):** A-09, A-10, A-12, A-19 (needs a privacy decision), A-21, A-22.
- **Cosmetic (category 4):** A-14, A-17, L-05, L-06.
- **Needs a real iPhone or a live screenshot (category 5):** A-05 (rest), A-06 (latency), A-11, A-13, A-15, A-16, A-18, A-20, L-03, L-07.
- **Older local build only (category 6):** L-01, L-04, the green theme, local timing.

**Risk:** verified in Chromium emulation only, not on a real iPhone.

## 2026-11-08: Stage 2 "Night Circle": Home B, Lobby A, the visual library, real addresses (branch `claude/stage2-night-circle`, from the Phase 1 checkpoint `f9dfcf2`; the Phase 1 record `10fa0d3` merged in)

**Owner direction:** overnight continuation directive, Phase 2. Presentation and navigation only. The handoff page with screens and iPhone steps is `docs/stage2/README.md`; decisions are D-UX-14 to D-UX-20.

**Built:**
- **Routes:**
  - Real addresses over pushState (`apps/web/src/nav.ts`, `ui/mchezo/lib/routes.ts`), with sheets in `?sheet=`.
  - Depth-aware in-app Back, and a boot redirect for seated or unseated tabs.
  - The server serves the app only for client paths (`src/shared/clientRoutes.ts`).
- **Home B:** `components/mchezo/Home.tsx`, with procedural covers for all 11 games (`lib/covers.ts`, `GameCover`), one catalog (`lib/catalog.ts`), the featured game of the day, the Join/Host dock, Rejoin and game details.
- **Join** (`/join?code=`, QR and invite links) and **Host** (`/host`, name required: A-04).
- **Lobby A:** `components/mchezo/Lobby.tsx`, with code + Invite, Cup day, ☰, an honest headline, the Circle with will-play checks, the up-next cover card, Official/Practice and readiness, and the sticky Start dock.
  - **Sheets:** Invite, Pick a game (covers, categories, Surprise me, Smart shuffle), Room menu and Game details.
  - **Sheet behaviour:** focus is trapped inside a sheet and returns on close.
- **Library:** covers first, search on screen, folded filters, removable active-filter chips, Clear filters (also in the empty state), practice-only tags, "Set as up next" for hosts in a room.

**Found and fixed on the way (D-UX-20):**
- **Connection alerts under sheets:** they now sit above sheets.
- **"Seat moved" overwritten by "Your session ended":** pre-existing; unit-tested now.
- **Your own seat faded:** the legacy disabled opacity.
- **Full rooms:** name labels in a ring of 9–10 overlapped neighbouring tokens.

**Drivers:**
- `goto(BASE)` → `/host` or `/join` where a driver hosts or joins.
- `scripts/lib/room-nav.mjs` reaches room-menu destinations like a person, with the old views' own buttons as fallback.
- Library, shuffle, lobby-fixes, mchezo, mobile, sessions, recovery and studio follow the new screens.
- No assertion was weakened. Checks that named removed things were rewritten to assert their replacement (e.g. the share link is `/join?code=`; sign-out lands on Home and says so).
- **New:** `scripts/check-stage2.mjs` (Home, A-04, QR prefill, Lobby A at 375/390/430/768/1440 with 2 and 10 players, sheets and Back, Rejoin, reloads, deep links while seated, duplicate seats, focus, labels, reduced motion, and the full journey) and `tests/connection-store.test.ts`.

**Runs:** These are local runs against Stage 2 builds on this machine: early feedback, not gate verdicts.
- **Sweeps:** every `check-*` driver was run at least once against Stage 2.
- **Failures found and fixed:**
  - `check-recovery`: the banner under the sheet, and the "seat moved" message overwritten.
  - `check-stage2`: full-room names covering seats.
  - `check-spectator`: Stop watching now returns Home; the driver was updated.
  - `check-audit-fixes`: a helper hosted and joined on the same screen.
  - `check-f5`: the Cup → TV → Lobby & Games navigation.
- **Last local runs:**
  - `check-stage2`: all passed on `929db1c`.
  - `check-f5`: 30/30.
  - The second and third sweeps: all passed.

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `f7c5265`: **PASSED (exit 0)**, run `20261108-074616-f7c5265c-5793`.
- 48 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests 940; `check-stage2` 76 checks; e2e-chromium 12/12.
- Fresh clone; untracked `node_modules` symlink only; `MCHEZO_CHROMIUM_PATH` = this machine's headless shell 1243.
- The verdict covers `f7c5265` only. The recording commit is docs only (this entry and the D-UX-14 wording).

**Not changed:**
- Server rules, scoring, eligibility, readiness, D3, content approvals, existing Cups.
- The Championship, TV, Memory Book and older results screens (reached through the menu).
- No merge, deployment or spend; the Codespaces port stays private.

**Open:**
1. Real-iPhone pass (README steps).
2. "Room found" preview on Join (needs a server endpoint).
3. Solo practice (D2).
4. The `screenshot-*.mjs` scripts outside the gate still drive the Stage 1 landing page.

**Risk:**
- Chromium emulation only: Safari's toolbar, swipe-back and keyboard need the real device.
- The sticky dock depends on `100dvh` support (iOS 15.4+).

## 2026-11-08: Stage 3 (bonus): results and celebrations (branch `claude/stage3-results`, from the verified Stage 2 record `b08ac19`)

**Owner direction:** the optional overnight bonus, started only after Phases 1 and 2 had passed their full gates. Presentation only. The handoff page with screens, the 28 lines and iPhone steps is `docs/stage3/README.md`; decisions are D-UX-21 and D-UX-22.

**Built:**
- **`ui/mchezo/lib/celebrate.ts` (pure):**
  - competition ranks over the server's per-game scores (ties share a rank; tied winners in name order);
  - the headline: winner, two-way tie, N-way tie, everyone tied, nobody scored;
  - your place, and 28 Mild lines, each behind a condition true of the result, chosen by the game's id.
- **`ResultsHero`:** cover, kicker (game · Official/Practice), headline, the tokens of everyone in first place, the shared line, and your card (place, points, personal line).
  - A 14-shape, ≤1.2 s CSS burst on a winner's phone only. It never shows under reduced motion, Less or Off.
- **Placement:**
  - At the top of Word Connections, Caption Clash and the shared results of the other eight games.
  - Above the outcome card for Trivia, so the headline is always first.

**Tests:**
- **Unit:** `tests/stage3-results.test.ts` (13: ranks and ties, order independence, two/three players, a three-way tie, everyone tied, nobody scored, a close finish with its real gap, practice vs official, dropped out vs sat out, ten long names, the same story on every phone, line limits).
- **Driver:** `scripts/check-results.mjs`, 23 checks on its own time-scaled server: a two-player win (winner and second, celebration only on the winner's phone, never takes a tap, over in time, refresh), three players (last, middle, official), a three-way tie on three phones, a player who dropped out, practice, ten long names at 375/390/430, and reduced motion.
- **Local runs** against the Stage 3 build: 16 existing results-related drivers all passed (mchezo, reveal, connections, caption, math, geography, closest, year, abstain, answer-reveal, contrast, m6, multiplayer, reduced-motion, viewports, mobile).

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `3483e0c`: **PASSED (exit 0)**, run `20261108-091845-3483e0c6-17580`.
- 49 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests 953; `check-results` 23 checks; `check-stage2` 76 checks; e2e-chromium 12/12.
- Fresh clone; untracked `node_modules` symlink only; `MCHEZO_CHROMIUM_PATH` = this machine's headless shell 1243.
- The verdict covers `3483e0c` only. The recording commit is docs only (this entry and `docs/OVERNIGHT_REPORT_2026-11-08.md`).

**Not changed:**
- Scoring, Cup rules, games, content approvals, the Championship, TV and Memory Book.
- No automatic rematches: Start is still the host's.
- No merge, deployment or spend.

**Open:**
- Per-item "what earned points" breakdowns need the server's recorded scoring details per game (later stage).
- The real-iPhone pass.

## 2026-11-08: Stage 3 live QA repair sprint (branch `claude/stage3-live-qa-fixes`, from the Stage 3 record `190c020`)

**Owner direction:** "MCHEZO — STAGE 3 LIVE QA REPAIR SPRINT", reconciling the Stage 3 audit package.
- Correctness, fairness and clear feedback first.
- No merge, deployment, exposed port, spend, content-approval, Cup-rule or scoring change.
- The reconciliation, root causes, before/after screens and iPhone checklist are in `docs/stage3-qa/README.md`. Decisions are D-QA-01..07.

**P0:**
- **S3-TV-05** (touchdown "7 marked correct"): not reproduced.
  - Both documented option orders (3,7,6,2 and 2,7,3,6) were replayed through the real selection, shuffle, answers, counts, TV and phones, and a restart.
  - On the server and in a real browser, 6 is marked correct and each count sits over its own label.
  - Hardened: out-of-range answers are refused, and the TV bars name their options for screen readers (they read as bare counts before).
- **S3-TV-01:** not reproduced. The TV's Q1–Q10 are the phones'. The quoted TV questions exist nowhere in the content. The featured question and the after-game walk are now labelled.
- **S3-MTH-01:** fixed on the phone. The server's clock was correct. The problems were in the client:
  - A hidden page opened the question (the audit played three seats from browser windows).
  - A lost open left "Getting question 1 of 10…" up for good.
  - Now a question opens only when visible, and lost opens are asked again (the server keeps the first open time).
  - No client time is trusted, and scoring is unchanged. The remaining network-stall trade-off is D-QA-02.

**P1:**
- **S3-RES-01:** complete standings (everyone up to 4 players; a preview plus "Show all N" beyond that).
- **S3-RES-04:** 7 line conditions corrected, one runner-up line added (29 lines), and an exhaustive audit test.
- **S3-RES-03:** a drop is shown neutrally.
- **S3-HOME-01:** Home and the lobby scroll above their docks; card text comes before the picture.
- **S3-LOB-01/02, S3-HOME-02:**
  - The host's plan (game and mode) is shared with the room. This also fixes guests seeing their own tab's default game.
  - The mode is on the up-next card, in the Start label and in both docks.
  - The default stays Official (an owner decision).

**P2:**
- **S3-WCN-01:** the score is explained, with your own breakdown.
- **S3-WCN-02:** "1 mistake left".
- **S3-TV-02:** the TV shows Word Connections standings.
- **S3-TV-06:** the TV dashboard has a live Math card (public facts only) and final standings.
- **S3-TRV-01:** the waiting ring says "have started".

**Tests:**
- **Unit:** `tv-trivia-reveal` (4), `stage3-qa-results` (16, including more than 80,000 audited stories), `lobby-plan` (4).
- **New drivers:** `check-tv-reveal`, `check-math-timing`, `check-lobby-mode`, `check-tv-dashboard`.
- **Extended:** `check-results` (+9).
- **Before/after:**
  - On the previous builds, `check-results` fails 5 checks with the audit's symptoms.
  - On the previous builds, `check-math-timing` fails 3 checks (7.1 s/110 points; stuck).
  - Both pass on the fixed build.
- **Updated to assert the replacement copy:** `check-stage2` (Start names its mode), `check-mchezo` and `check-m6` ("have started"). No assertion was weakened.

**Not changed:** scoring, Cup rules, content and approvals, D3 Ready/synchronized start, seats and recovery, Official/Practice separation, private-answer protections, host/guest permissions.

**Open (owner):**
- The default mode (S3-LOB-01).
- A-19 (who sees who has finished).
- Math network-stall compensation (D-QA-02).
- D2, D-UX-10.

**Deferred:** the rest of the audit's Low/Medium list (§F of the README).

**Limitation:** Chromium emulation only; no real iPhone.

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `b1dd580`: **PASSED (exit 0)**, run `20261108-200931-b1dd5804-360`.
- 53 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests 977. E2E (Chromium) 12/12.
- Drivers: `check-tv-reveal` 57 checks, `check-math-timing` 12, `check-lobby-mode` 71, `check-tv-dashboard` 10, `check-results` 32, `check-stage2` 76.
- Run from a fresh clone; the only untracked file was a `node_modules` symlink. `MCHEZO_CHROMIUM_PATH` was set to this machine's headless shell 1243.
- The verdict covers `b1dd580` only. The recording commit after it is docs only.

**Runs that do not count:**
- `bd82ce7` (run `20261108-175746-bd82ce7a-13590`): FAILED, 52 passed and 1 failed. `check-math` still asserted the old copy "from when this question appeared", which S3-MTH-01 had changed on purpose. Fixed in `ef9ea8a` to assert the replacement.
- `ef9ea8a` (run `20261108-191812-ef9…`): FAILED, then cancelled by me. `check-lobby-mode` read the Start label 1.5 s after a reload, before the page saw both seats connected. Fixed in `b1dd580`: bounded polls on the asserted state; no assertion changed.

## 2026-11-09: Stage 4, post-audit UX completion and multiplayer validation (branch `claude/stage4-experience-completion`, from the Stage 3 QA record `c307081`)

**Owner direction:** "MCHEZO — STAGE 4: POST-AUDIT UX COMPLETION & MULTIPLAYER VALIDATION".
- No merge, deployment, exposed port, spend, scoring, Cup-rule or content-approval change. Nothing provisional was approved.
- The reconciliation by audit ID, root causes, before/after screens, multiplayer and Official/Practice evidence, and the iPhone checklist are in `docs/stage4/README.md`. Decisions are D-S4-01..10; proposals are P-S4-01..05 (README §8).

**Commits (code):**
- `4fb4b36`: Library (S3-LIB-01..04), the view in the address (S3-NAV-01), Back mid-game (S3-NAV-02), the proxy-page guard (S3-LOB-03).
- `7fd52db`: Family Cup hierarchy (S3-CUP-01), Memory Book export feedback (S3-MEM-01).
- `83e3db9`: S3-TRV-02, S3-TRV-03, S3-WCN-03, S3-STU-01/02, S3-JOIN-01.
- `b7400c8`: Caption Clash counts a caption or vote only when the server has it (root cause of the audit's "Your vote ✓ but 2 of 4"); the four-player driver.
- `eb23f33`: the ten-player and Official vs Practice drivers; lobby and standings names never cut.
- `84ed7ed`: an HTTP poll overtaken by a newer push can no longer roll the screen back (found by `check-ten-players` in gate run 1; D-S4-10).

**Tests:**
- **Unit:** 1001 (977 at the Stage 3 checkpoint, +24): `stage4-http` (10), `stage4-library` (6), `stage4-memory` (2), `stage4-names` (5), `errors` (+1); `library.test.ts` now asserts that sort is not a filter.
- **New drivers,** each with its own server and no content test mode:
  - `check-library-nav`, `check-cup-memory`, `check-stage4-details`;
  - `check-caption-4p` (78 checks), `check-ten-players` (245), `check-official-practice` (29).
- **On the previous builds:**
  - `check-library-nav` fails NAV-01 and NAV-02.
  - `check-stage4-details` fails TRV-02, TRV-03, WCN-03 and STU-01.
  - `check-caption-4p` fails 4 checks (the vote ✓ and the lost caption).
  - `check-ten-players` fails 18 (cut names).
  - `check-stage4-details` fails the overtaken-poll check on `eb23f33`.
- **Moved to the new screens** (replacements asserted, none weakened): check-f4, check-f5, e2e-browser, check-lobby-fixes, check-stage2.

**Not changed:**
- Scoring, Cup rules and the 7 days, content and approvals.
- D3 Ready/synchronized start, seats and recovery tokens, Official/Practice separation, private answers, reveal timing, results/ties.
- Reduced motion, permissions, sit-out, the default mode (Official), A-19, D2, D-UX-10, Math scoring.

**Open (owner):** P-S4-01..05; D12 (override audit visibility); S3-TRV-04; S3-TV-03/04.

**Limitation:** Chromium emulation only; no real iPhone or Safari.

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `84ed7ed`: **PASSED (exit 0)**, run `20261109-035458-84ed7ed0-4459`.
- 59 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests 1001. E2E (Chromium) 12/12.
- Drivers: `check-caption-4p` 78 checks, `check-ten-players` 245, `check-official-practice` 29, `check-stage4-details` 21, `check-library-nav` 40, `check-cup-memory` 35.
- Run from a fresh clone; the only untracked file was a `node_modules` symlink. Browser: chrome-headless-shell 153.0.8010.12 via `MCHEZO_CHROMIUM_PATH`.
- The verdict covers `84ed7ed` only. The recording commit after it is docs only.

**Run that does not count:** `eb23f33` (run `20261109-023100-eb23f339-21480`): FAILED (exit 1), 58 passed and 1 failed.
- `check-ten-players` failed 3 checks on the host's phone: the Math results list was empty when read.
- Root cause: an HTTP poll overtaken by a newer push rolled the screen back. Fixed in `84ed7ed` with a unit test and a deterministic driver repro. No assertion was weakened.

**Next task (if the owner continues):** the §9 iPhone checklist on a real device; owner rulings on P-S4-01..05.
**Risk:** Safari behaviour (swipe-back, downloads, backgrounding) is untested; Chromium is not Safari.

## 2026-11-09: Stage 5, the complete game night (branch `claude/stage5-complete-game-night`, from the Stage 4 record `b706a84`)

**Owner direction:** "MCHEZO — OVERNIGHT CONTINUATION: FINISH STAGE 4, THEN STAGE 5", then "STAGE 5 — UPDATED STARTING INSTRUCTIONS".
- Stage 4 was already complete: code `84ed7ed`, gate PASSED 59/59, record `b706a84`.
- No merge, deployment, exposed port, paid service or spend.
- No change to existing scores, Cup rules, content approvals or Cup history. Nothing provisional was approved; every new game is Practice-only.
- The full account is in `docs/stage5/README.md` (15 sections), with the audit in `docs/stage5/AUDIT.md` and decisions D-S5-01..13.

**Commits (code):**
- `cd61633` S5-P: every game screen tells the truth about a send; reconnect wording.
- `23f86e6` S5-A/S5-B: the live show on the TV; the way from one game to the next.
- `70fa11b` S5-C1: Majority Rules on the common module contract (`src/games/modules/`).
- `a02588b` S5-C2: Pattern Pulse (self-paced; server-clock windows via `dueAt`/`advance`).
- `c866125` S5-C3: Draw & Guess (live strokes, bounded; private word; wrong guesses never stored).
- `6371425` S5-E/S5-F: moments from recorded facts; a still celebration; the older panel's failed-send line; the independent review's fixes R1–R6, including the intent replay cap.

**Each new game was verified before the next was started** (one revision each):
- `70fa11b`: unit tests, `check-majority-rules`, a 10-driver sweep, `check-stage2`, `check-mchezo`, `check-f5` (729 s) and e2e 13/13 all passed.
- `a02588b`: 1030 unit tests, `check-pattern-pulse` (47 checks), `check-f5`, `check-stage2` and e2e 14/14 passed. `check-mchezo` failed once under heavy parallel load, then passed alone on the same revision (below).
- `c866125`: 1046 unit tests, `check-draw-guess` (60 checks), an 8-driver sweep, `check-f5` (821 s) and e2e 15/15 passed.

**Tests:**
- **Unit:** 1055 at `6371425` (1001 at Stage 4). New: `stage5-tvfeed`, `stage5-majority`, `stage5-pulse`, `stage5-draw`, `stage5-moments`; an `errors` update. Catalogue tests now list game ids explicitly; shuffle goldens were re-pinned because the catalogue grew.
- **New drivers:** `check-send-failures`, `check-tv-show`, `check-game-night-flow`, `check-majority-rules`, `check-pattern-pulse`, `check-draw-guess`. Shared helpers: `scripts/lib/stage5-games.mjs` and `scripts/lib/contrast.mjs`.
- **Moved or updated** (replacements asserted, none weakened): check-readiness, check-audit-fixes, check-caption-4p, check-contrast, check-f4, check-f5, check-mchezo, check-multiplayer, check-stage2, check-tv-lifecycle, check-tv-spectator, check-library, check-library-nav, e2e-browser.

**Every failed attempt this stage** (all before the final gate):
- `check-send-failures` on the Stage 4 build: 11 failures. This was the expected before-evidence for S5-P.
- Catalogue unit tests failed as each game joined: 16 for Majority, 18 for Pulse, 2 for Draw. They were updated explicitly, not loosened.
- `check-stage2` (3), `check-library` (2) and `check-library-nav` (2) hard-coded the catalogue size. They now read it from `/games`.
- `check-mchezo` on `a02588b`, 1 failure: it timed out at 30 s waiting for Trivia results while five browser jobs ran at once. It passed alone on the same revision; nothing was changed.
- `check-draw-guess`: 2 failures where the driver's artificial burst used up the rate window before Clear (driver order fixed), then 3 false privacy alarms where "hat" matched inside "What is it?" (now whole-word matching).
- Earlier in S5-A/B: check-tv-dashboard (a block `<b>` split a line), check-contrast (2 translucent chips), check-tv-show and check-game-night-flow (a test id, and case in an upper-cased kicker), check-majority-rules (upper-cased label). Product fixes were made where the screen was wrong; the rest were driver fixes.
- The replay-cap unit test failed in its first version because it used non-UUID event ids.

**Independent review** of the new games: no high-severity issue. Five issues were fixed and one narrowed; see AUDIT.md R1–R6.

**Not changed:**
- Existing games' scoring, the Cup, content and approvals.
- D3 Ready/synchronized start, seats, recovery, Official/Practice separation for existing games, sit-out (L33).
- The Stage 4 improvements: the stale-projection guard, server-confirmed Caption Clash sends, ten-player standings, navigation restoration.

**Open (owner):** README §13 (Cup eligibility and scoring for the three new games, Majority's tie policy, Pulse's and Draw's parameters, Bluff Battle); the Stage 4 README §8 items.

**Limitation:** Chromium emulation only; no real iPhone, Android or TV.

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on **`8879c3f`**: **PASSED (exit 0)**, run `20261109-080851-8879c3f6-18873`.
- 65 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests 1055 (92 files). E2E (Chromium) 15/15: all 14 games played to the end, plus the room views.
- Drivers: `check-draw-guess` 61 checks, `check-pattern-pulse` 54, `check-majority-rules` 49, `check-send-failures` 43, `check-tv-show` 29, `check-game-night-flow` 14; `check-leaderboard` 1074 s.
- Run from a fresh clone; the only untracked file was a `node_modules` symlink. Browser: chrome-headless-shell 153.0.8010.12 via `MCHEZO_CHROMIUM_PATH`.
- The verdict covers `8879c3f` only. Its app code is identical to `6371425`'s: the commits between them change two drivers. Everything after it is docs only.

**Runs that do not count:**
- **Gate run 1:** `6371425`, run `20261109-072613-63714256-8119`. CANCELLED by me (exit 130) after 24 passed and 2 failed.
  - `check-answer-reveal` and `check-game-night` still expected the pre-S5-A TV: answers shown by themselves, a one-item Closest Wins list, and raw game ids in the TV text.
  - Both drivers now reach the TV as a person does, with the same assertions (`481c1f7`, `8879c3f`).
  - Neither had been in my targeted sweeps after S5-A; the full gate caught it.
- **A follow-up 20-driver sweep of TV and results drivers:** all passed except `check-game-night` (fixed). `check-leaderboard` was cut off by my sweep's 900 s cap; it normally needs about 930 s.

**Next task (if the owner continues):** the README §14 real-device session (iPhone Safari first); owner rulings on §13; backlog B-1..B-4.
**Risk:**
- Safari touch drawing, swipe-back from the canvas edge, and iOS autocorrect on guesses are untested.
- The new games' timings are design values, not measured.

## 2026-11-09: Stage 5.1, combined live audit repair sprint (branch `claude/stage5-audit-repairs`, from the Stage 5 head `fa823de`)

**Owner direction:** "MCHEZO — STAGE 5.1: COMBINED LIVE AUDIT REPAIR SPRINT".
- No merge, deployment, public port, paid service or spend.
- No change to Cup scoring or eligibility, content approvals, forfeits, sit-out, Math compensation or any game's scoring or timing.
- The three Stage 5 games are still Practice-only.
- The full account is in `docs/stage5-qa/README.md` (13 sections). Decisions are D-S51-01..14.

**Blocker (external):** the three audit packages were not available in this session (not in the repository or the container). I worked from the brief's descriptions and never saw the auditors' screenshots or manifests. README §1 says, per finding, what I reproduced myself.

**Commits (code):**
- `5230c36` S5-AUD-04/07: screens know when they're stale (poll timeout, watchdog, `alive` frames, no-store); the TV says so.
- `47bfff1` O-02 drafts per game and phase; O-06 Charades teams; O-05 Cup places; S5-AUD-02 Pulse lock hint.
- `02929a8` 2C: a lost reply that landed says so, from the server's record.
- `aed6055` O-07/S5-AUD-01: progress counts say what they count; the room revision.
- `829e1f4` 3E: "Back to lobby" reaches the lobby; the Memory Book cites the game shown.
- `a529ab4` 3D: copy matches the mechanics (nine items).
- `a3ac6bf` O-12/O-14: flags described; quiz groups; no internal ids.
- `626f150` Phase 4: persistence measured; compact room snapshots.
- `9905460` Script inventory; the screenshot tool.

**Reproduced and fixed:**
- O-02 (Sprint).
- S5-AUD-07.
- O-07 (all three cases).
- 3E Library and Memory Book.
- The 2C gap.
- The silent-stall path of S5-AUD-04.
- O-12 (in Chromium's tree only).

**Fixed from the code:** O-05, O-06, O-14, 3D.

**Not reproduced:** S5-AUD-04's exact live failure (12 faults; worst lag 821 ms); S5-AUD-02 as a timing failure (the windows are 16.5–24 s, not 12 s).

**Measured, owner decision:** the S3-MTH-01 residual, about 2 s when only polling delivers.

**Tests:**
- 1080 unit tests in 100 files (1055 at Stage 5).
- New drivers, all in the full gate: `check-draw-sync`, `check-tv-outage`, `check-input-isolation`, `check-math-network`, `check-pulse-timing`, `check-action-ack`, `check-progress`, `check-history-links`, `check-a11y-surfaces`.
- New tools: `measure-persistence.mjs` and `screenshot-stage51.mjs`.
- Before and after logs are in `docs/stage5-qa/logs/`.

**Every failed attempt:** README §11. This covers the before-evidence runs, the driver mistakes, one load-related crash of `check-draw-guess` (which passed alone), and gate run `20261109-172002-626f150d-25364` on `626f150`: FAILED on the unit step (an unclassified script, fixed in `9905460`), then cancelled by me after 13 passed, 1 failed and 1 cancelled.

**Open (owner):** README §12.
- The Math residual.
- Pulse auto-lock.
- The Charades other-team rule.
- Four session estimates above their hard limits.
- Draw & Guess network deltas.
- Legacy flag descriptions.
- The Stage 5 §13 items.

**Limitation:** Chromium only. No real iPhone, Android or TV, and no VoiceOver or TalkBack. Real-device testing is **not done**; `docs/REAL_DEVICE_TESTING.md` now checks out this branch.

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` on `0a3964f`: **PASSED (exit 0)**, run `20261110-003130-0a3964f3-11617`.
- 74 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests: 1,080 passed in 100 files. All 67 browser drivers passed. E2E (Chromium) passed 15 of 15, with all 14 games.
- Run from a fresh clone with a clean tree; the browser was `chrome-headless-shell` 153.0.8010.12. Wall time 95.4 min.
- The verdict covers `0a3964f` only. The commit that records it is docs only. The failed, cancelled and interrupted attempts below don't count.

**Failed final gate (not a verdict for the fixed code):** `node scripts/gate.mjs full` on `4acfea7`, run `20261109-173134-4acfea70-32411`: **FAILED (exit 1)**. 72 passed, 2 failed (`check-f5`, `e2e-chromium`).
- Cause: my O-06 change renamed the Charades actor's "Correct (+100 team)" button to "Correct (+100 to Team A/B)". Both drivers looked for the old exact name, so Charades ran out every turn's clock, and the games after it never started.
- Fixed in the drivers, `55ba5d8`, with no product change. Details are in `docs/stage5-qa/README.md` §11.

**Second failed final gate (not a verdict for the fixed code):** `node scripts/gate.mjs full` on `4236788`, run `20261109-193224-42367885-15460`: **FAILED (exit 1)**. 73 passed, 1 failed (`check-draw-guess`).
- Cause: a driver bug. The driver kept a page reference that turn 2 closes whenever Keku draws turn 2, about one game in four. I reproduced it deterministically with seed 5: the old driver crashed and the fixed one passed.
- The same crash on `829e1f4` had this cause too. I had first recorded it as load-related, which was wrong.
- Fixed in `f363811`, with no product change. Details are in README §11.

**Two more full runs without a verdict:**
- `f363811`, run `20261109-210933-f3638114-28586`: **interrupted** by a container restart during E2E, the last step. 73 of 74 steps had passed, and no report was written.
- `2508f9d`, run `20261109-223449-2508f9d4-198`: **FAILED** at the unit tests, then **cancelled** by me.
  - The failing test was my own Stage 5.1 Sprint privacy test. It looked for the answer "school" in the TV projection, and the randomly dealt category happened to be "Things in a school".
  - It now uses marker answers, and passed 15 of 15 runs. Details are in README §11.
- `bf6a764`, run `20261109-223744-bf6a764e-4827`: **interrupted** by a second container restart, after 31 steps had passed.
- `bf6a764`, run `20261109-231859-bf6a764e-191`: **FAILED** on `check-shuffle`, then **cancelled** by me.
  - The driver's hard-coded list of 11 games rejected a shuffle pick of Pattern Pulse, one of the three Stage 5 games.
  - The driver now reads the titles from `GET /games`, and passed 10 of 10 runs.
  - Cancelling exposed a pre-existing summary crash in the existing gate, which only affects cancelled runs; Stage 5.2 fixes it.

**Next task (if the owner continues):** the real-device session in README §13 (iPhone Safari first), and owner rulings on README §12.

**Risk:**
- Safari's handling of the new connection watchdog (background tabs, suspended timers) is untested.
- The flag description depends on each pack's accessibility note.

## Stage 5.2: parallel testing, performance and time estimates (2026-11-10)

**Branch:** `claude/stage5-parallel-testing`, built on the verified Stage 5.1 head `5a4454c` (PR #4). Nothing was merged or deployed, no port was made public, and nothing was paid for. The full report is `docs/test-optimization/README.md`.

**Milestone:** the full gate runs in parallel, with live time estimates. On this 4-CPU machine it went from **95.4 min** (the sequential gate, Stage 5.1 final) to **24m 17s** on 3 workers: 74.5% less, with the same 74 steps and the same number of checks in each.

**Features:**
- **`scripts/gate.mjs`:**
  - a bounded worker pool (`--workers=N|auto`, `--sequential`), with one gate server per worker;
  - longest-first ordering, and load and memory backpressure;
  - an explicit not-run list;
  - failure kinds, DIAG lines and machine-pressure notes for failed steps;
  - CPU, memory, browser use and rooms per step, and time-stamped step logs;
  - `--plan`, live progress with remaining-time ranges, predicted vs actual, timing history, and `timings`.
- **`scripts/lib/`:** `gate-plan.mjs` (scheduler model and estimates), `gate-sampler.mjs` (`/proc` sampling), `gate-timings.mjs` (history) and `gate-timings.json` (a baseline from 111 earlier runs and the benchmarks).
- **Driver changes, with no check removed:**
  - `check-leaderboard`: 30 s waits on optional chips replaced by a phase wait;
  - `e2e-browser` and `check-f5`: probes are checks, not waits;
  - `lib/stage5-games.mjs`: a Draw & Guess read race fixed, keeping Stage 5.1's 30 s limit for a read or tap stuck on screen (D-S52-01);
  - `lib/driver-env.mjs`: browser-use counters.
- **Self-test:** 8 parallel cases (9–16) added; 59 checks in all. **Unit tests:** `tests/gate-plan.test.ts`, 21 tests.
- **CI:** a `workers` input on the manual dispatch. **Docs:** `TESTING.md`. **npm:** `gate:full:sequential`, `gate:plan`, `gate:timings`.

**Tests:** see the verdict below.

**Failures during the sprint:** all are in the report, §12.
- The first self-test run scored 55 of 58, from three self-test design errors.
- The F2 run (2 workers on 2 CPUs) failed `check-f5` on a real race in the shared Draw & Guess helper. It's fixed and validated (V1).
- F2 was then cancelled, because a validation run on the other CPUs throttled it through the machine-wide load average.
- **Found in my own review (no gate failed):** the first race fix (`d5e175f`) let a defect confined to one Draw & Guess turn or one Majority round pass `check-f5` and E2E. Failure injection showed it: 3 single-turn/round injections PASSED on `dab1c65`. Fixed in `872add3`, where the same 3 injections FAIL within 35 s with the action named (report §12–§13).

**Gate verdict (one run, one revision):** `node scripts/gate.mjs full` (automatic worker count: 3 workers on 4 CPUs) on `3ce937a`, the cumulative Stage 5.1 + 5.2 tree with both review fixes: **PASSED (exit 0)**, run `20261110-063622-3ce937a7-2793`.
- 75 passed (the 74 before, plus `check-poll-body-stall`), 0 failed, 0 timed out, 0 not run.
- Unit tests: 1,111 in 101 files (Stage 5.1's 1,080, plus 21 gate-plan tests and 10 new liveness tests). All 68 drivers passed. E2E passed 15 of 15.
- Check lines: the 74 earlier steps made 1,992, the same in every step as the sequential Stage 5.1 run. The stall driver made 12.
- 24m 15s, from a fresh clone with a clean tree (fingerprint `d38b8718bdeb`, 394 files). The commits after it are documentation only.
- Gate self-test on `3ce937a`: **59/59**.

**Earlier, superseded:**
- `735242d` (first review fix only): PASSED, run `20261110-055944-735242dd-14712`, 75/75 in 24m 29s; self-test 59/59.
- `872add3`: PASSED, run `20261110-052100-872add3c-26825`, 74/74 in 24m 34s. The gate self-test there was 59/59.
- `dab1c65`: PASSED twice: 24m 17s on 3 workers (run `20261110-033657-dab1c658-18431`), and 38m 06s on 2 workers pinned to 2 CPUs (run `20261110-040231-dab1c658-30930`). The gate self-test there was 59/59.

**Raw evidence:** `docs/evidence/` holds the reports, summaries and logs of the cited gate runs, the failure injection and the poll-stall driver, so they can be reviewed without rerunning.

**Review loop:**
- PR #4 (Stage 5.1) is ready for review.
- The Stage 5.2 PR targets `claude/stage5-audit-repairs`. By the owner's decision this cumulative tree is the review candidate.
- The Draw & Guess helper race stays unfixed on the Stage 5.1 branch, by the owner's decision: no backport, documented on PR #4.
- The owner authorized the ChatGPT ↔ Claude GitHub handoff loop, including later milestones (D-WF-01, `AGENTS.md`). No merge, deployment, public port or extra spending.
- **ChatGPT's review of PR #4 (P2):** the poll timeout ended when the headers arrived, so a reply whose body stalled hung the poll loop.
  - Verified. Reproduced on the unchanged code: still pending after 2 s with a 100 ms timeout.
  - Fixed on the Stage 5.1 branch in `7e7ab16`: `pollFresh` and `oneAtATime`, 7 new unit tests, and the new driver `check-poll-body-stall`.
  - Merged here as `735242d`. The details are in `docs/stage5-qa/README.md` §3.
- **ChatGPT's review of PR #5 (P2):** the TV skipped error replies without reading or closing them, so a stalled error body stayed open and they piled up.
  - Verified: 3 stalled 500s and a stalled 401 left 4 replies open.
  - Fixed on the Stage 5.1 branch in `0cb5a78`: the poll aborts its request in `finally`. 3 new unit tests, plus a new driver step that FAILED before the fix and PASSED after.
  - Merged here as `3ce937a`.
- **Queued product work:** an installable Home Screen web app, for the mobile-polish milestone (`docs/MILESTONES.md`). It is not a Stage 5.1/5.2 item.

**Next task:** review repair and validation of the cumulative candidate: ChatGPT re-reviews PR #4 and PR #5 at `735242d`, and Claude repairs whatever it finds. The automatic worker cap stays at the benchmarked 3. A later product milestone starts only when a ChatGPT handoff instructs it (D-WF-01).

**Risk:**
- Backpressure uses the machine-wide 1-minute load average, which lags. Other work on the same machine also throttles the gate.
- Pattern Pulse's multi-key entry keeps 30 s auto-waits.
- `check-tv-outage` re-binds its own port.

## Stage 6.1: everyday entry and one complete solo loop (2026-11-10)

**Branch:** `claude/stage6-1-everyday-entry`, stacked on the Stage 5.2 head `8fe4f19` (PR #6, base `claude/stage5-parallel-testing`). Instructed by ChatGPT's handoff on PR #5 (comment 6764848065), with the clarification on PR #6 (comment 6764965143). Nothing was merged or deployed, no port was made public, and nothing was paid for. The spec and the full record are `docs/stage6/README.md`; the decisions are D-S61-01 … 08.

**Milestone:** Mchezo opens for everyday use. Home offers Join a room, Play solo and Host a game. Hosting is casual unless the host picks Family Cup. Play solo reaches a Math Mayhem round in two taps and loops through results, Play again and a personal best on this device. Cup rooms are unchanged and nothing casual or solo can reach a Cup.

**Features and files:**
- Server: room kinds and their refusals, the private solo room, safe restart and Leave (`src/server/room.ts`, `src/server/http.ts`); honest minimums (`src/games/registry.ts`, `manifest.ts`, `mathRules.ts`).
- Client: `Home.tsx` (three entries, Casual/Family Cup), `Lobby.tsx` and `App.tsx` (casual lobby), `Solo.tsx`, `solo/soloSession.ts`, `solo/personalBest.ts`, `uuid.ts`, `styles/stage6.css`, routes `/solo` and `/solo/<gameId>`.
- Tests: `tests/stage61-room-kinds.test.ts`, `tests/stage61-solo-client.test.ts`, `tests/client-uuid.test.ts`. Drivers: `scripts/check-solo.mjs`, `scripts/check-casual.mjs` (with `lib/lan.mjs`, `lib/math-solve.mjs`); `scripts/screenshot-stage61.mjs`. 45 existing scripts that host from the UI now choose Family Cup explicitly.

**Defects found and fixed during the stage:**
- **Pre-existing, all games:** on plain http at the host's network address (phones on the home Wi-Fi), every intent was refused, because the event-id fallback was not a UUID. Reproduced in Chromium at the machine's own address ("Getting question 1 of 10…", `INVALID_INTENT`), fixed in `uuid.ts`, covered by a unit test and by both new drivers over a real insecure origin (D-S61-07).
- **In this stage's first version, before commit:** Back to solo pushed a history entry, so Back from the solo list returned to the finished round (D-S61-08); the solo list's cover pushed Start below the fold at 320×640.
- **In `79a92a9`, development builds only:** React's StrictMode remount left the solo screen holding a disposed session, so on the Vite dev server the round never started. Reproduced there and fixed in `3db8a99`; production builds were never affected.
- **In my own checks:** a late-answer check passed for the wrong reason (its event id was invalid); it now has an in-time control answer.
- **In my own review, after the full gate started:** the seat-recovery routes still found a solo room by its code (seat list, host-assisted request). No seat could be recovered, but it broke D-S61-03; fixed in `453fda5` with a test that failed first.

**Tests (each verdict is one run on one revision):**
- fast gate on `79a92a9`: PASSED (exit 0), run `20261110-111110-79a92a9e-12770` (1,149 unit tests in 104 files);
- targeted gate on `79a92a9`: PASSED (exit 0), run `20261110-111112-79a92a9e-12814`, 18 of 18;
- `check-solo` (61 checks) and `check-casual` (30) on `3db8a99`, outside the gate;
- **full gate on `35f90c1`: PASSED (exit 0)**, run `20261110-112312-35f90c11-18967`, fresh clone, clean tree: 77 of 77 (1,149 unit tests; 70 drivers; E2E 15/15) in 25m 17s on 3 workers;
- `453fda5` (the seat-recovery fix, after the full gate started): fast gate PASSED, run `20261110-112530-453fda50-22327` (1,150 unit tests); targeted gate (`solo`, `casual`, `recovery`, `sessions`) PASSED, run `20261110-114857-453fda50-2186`, 6 of 6.
- Raw evidence: `docs/evidence/gate-runs/`.

**External blockers:** none. WebKit and real devices are not available here (not run).

**Next task:** ChatGPT reviews PR #6; Claude repairs what it finds. Stage 6.2 starts only when a handoff instructs it.

**Risk:**
- No room expiry on the server: solo rooms accumulate (one per device, more when storage is cleared). Deferred, documented (D-S61-03).
- The plain-http fix is proven in Chromium only; Safari on a real iPhone over the home network is still the real-device checklist's job.
- A casual room can't become a Cup mid-session; a host who wants a Cup picks it on the Host screen.

## Stage 6.1 review repairs (2026-11-10)

**Source:** ChatGPT's review of PR #6 (comment 6769583991): two P2 findings and two small repairs. **Repairs:** `51d01b9`, on `claude/stage6-1-everyday-entry`. Nothing was merged or deployed, no port was made public, and nothing was paid for.

**Done:**
- **Bounded solo requests:**
  - one timeout covers fetch and reply;
  - Leave, a new Start and the screen going away abort the run's requests;
  - generation checks drop late replies;
  - Start finishes within its budget, with Try again;
  - an uncertain Start or join is reconciled, not repeated.
- **Lost vs passing failures:**
  - 401/403/404 ends the round as lost, with Start a new round;
  - passing failures keep the seat and show "Reconnecting…" after 8 s;
  - no new room is made on a passing failure.
- **Personal best:** a record under other rules is ignored on write.
- **SoloHome copy** fixed.
- **Room retention** queued as a pre-deployment readiness task (`docs/MILESTONES.md`).
- D-S61-09 and D-S61-10 added; D-S61-03 and D-S61-05 amended.
- **Files:**
  - `apps/web/src/solo/soloSession.ts`, `personalBest.ts`;
  - `apps/web/src/components/mchezo/Solo.tsx`, `styles/stage6.css`;
  - `tests/stage61-solo-client.test.ts`, `scripts/check-solo.mjs`.

**Tests** (each verdict is one run on one revision; full detail in `docs/stage6/README.md` §6.6):
- Every finding was reproduced first on `96eaea5` (`docs/evidence/review-pr6/`).
- The repaired `check-solo` FAILED on the reviewed app (run `20261110-143047-96eaea57-8299`).
- Fast gate on `51d01b9`: PASSED, run `20261110-142701-51d01b9f-4372` (1,165 unit tests).
- Targeted gate on `51d01b9`: PASSED, run `20261110-142749-51d01b9f-7153`, 8 of 8.
- No full gate for these local repairs, as the review asked.

**External blockers:** none.

**Next task:** ChatGPT re-reviews PR #6. Stage 6.2 (the next solo-play slice) starts only when its handoff instructs it.

**Risk:**
- A create that gets no answer can leave one unused solo room on the server until room retention exists.
- These fault checks run in Chromium only.

## Stage 6.2: complete the solo shelf (2026-11-10)

**Branch:** `claude/stage6-2-solo-shelf`, stacked on PR #6 at `643ea03` (PR #7, base `claude/stage6-1-everyday-entry`). The instruction is ChatGPT's handoff on PR #6 (comment 6770278546). Nothing was merged or deployed, no port was made public, and nothing was paid for. The spec and record are in `docs/stage6/stage62.md`; the decisions are D-S62-01 … 06.

**Milestone:** Play solo offers Math Mayhem, Pattern Pulse and Word Connections, each on its own engine through one typed solo adapter, with per-game personal bests. The server refuses any other game in a solo room.

**Files:**
- **Server:** `src/games/registry.ts`, `manifest.ts`, `modules/pulse.ts`, `connections.ts`, `src/server/room.ts`.
- **Client:** `apps/web/src/solo/soloRules.ts`, `soloGames.tsx`, `soloSession.ts`; `apps/web/src/components/mchezo/Solo.tsx`, `MchezoPulse.tsx`, `MchezoConnections.tsx`, `MchezoMath.tsx`; `App.tsx`.
- **Tests and scripts:** `tests/stage62-solo-shelf.test.ts`, `scripts/check-solo-shelf.mjs`, `scripts/screenshot-stage62.mjs`; `check-solo` and the Stage 6.1 tests updated.

**Found while testing:** if most content were approved for official play, solo and casual rooms would repeat one practice item. Pinned by a test and raised as a proposal. ChatGPT decided to keep it unchanged and queue the fix (6771088990; D-S62-06, `docs/MILESTONES.md`).

**Clarifications applied** (ChatGPT 6770394918), recorded in spec §3.6:
- the Connections best note;
- no best from a forged abstain;
- the bounded lost-join fallback;
- privacy tested at each phase boundary.

I had missed that comment when I started the first gates on `be400fb`. Those runs stand as superseded evidence:
- fast PASSED;
- full FAILED on one check: E assumed a new board after Play again, but gate servers approve all content, so a solo room repeats one board there (D-S62-06). Check E was corrected; variety is now checked on the shipped library.

**Tests:**
- 26 unit tests for the stage, and the full suite passed (1,191);
- `check-solo-shelf` 57/57 on both a test-mode server and a shipped-library server;
- `check-solo` 80, `check-casual` 30, `check-connections` 39 and `check-pattern-pulse` 54, all passing.

**Gates on `801960b`** (fresh clone, clean tree):
- fast `20261110-160058-801960b9-5774` PASSED;
- full `20261110-160144-801960b9-8627` PASSED, 78/78.

Evidence is in `docs/evidence/gate-runs/` and `docs/evidence/stage62-local/`.

**External blockers:** none. WebKit and real devices are not available here.

**Next task:** ChatGPT reviews PR #7. The next milestone (smoother sessions / Quick Party) starts only when its handoff instructs it.

**Risk:**
- Connections boards repeat after 12 solo rounds, and leaving a round early uses up a board.
- A best can come from an easier Connections board.
- The fault and timeout checks run in Chromium only.

## Stage 7.1: Quick Party planning and first-game entry (2026-11-10)

**Branch:** `claude/stage7-1-quick-party`, stacked on PR #7 at `d39bf2e` (PR #8, base `claude/stage6-2-solo-shelf`). The instruction is ChatGPT's handoff on PR #7 (comment 6773012280). Nothing was merged or deployed, no port was made public, and nothing was paid for. The spec and record are in `docs/stage7/stage71.md`; the decisions are D-S71-01 … 08.

**Milestone:** in a casual room the host plans a Quick Party: expected group size (1–10), 15, 30 or 60 minutes, and a suggested lineup to edit. They apply it for the whole room and start the first game through the ordinary readiness and briefing flow. The lineup is server-authoritative room state with revisions, and is kept for the next slice.

**Files:**
- **Server:** `src/games/party.ts`, `src/server/room.ts`, `src/server/http.ts`.
- **Web:** `apps/web/src/components/mchezo/QuickParty.tsx`, `App.tsx`, `Lobby.tsx`, `types.ts`, `ui/mchezo/lib/routes.ts`, `ui/mchezo/styles/stage7.css`.
- **Tests and scripts:** `tests/stage71-quick-party.test.ts`, `scripts/check-quick-party.mjs`, `scripts/screenshot-stage71.mjs`.

**ChatGPT's clarification (6773171824)** is applied (D-S71-09):
- the replay is checked before "first game only";
- no hidden start of item 1;
- cancelled starts are reconciled in the saved room;
- the roster is required.

**Its interactive audit of Stage 6.1/6.2 (6773609572)** is recorded:
- four findings queued in `docs/MILESTONES.md`;
- npm audit triage in `docs/deploy/npm-audit-2026-11-10.md`;
- the private-preview steps for its Stage 7.1 audit in `docs/stage7/PREVIEW.md`.

**Tests:**
- 31 unit tests; the full suite passed (1,222);
- `check-quick-party` 51/51;
- regressions, all passing: `check-casual` 30, `check-lobby-mode` 71, `check-game-night-flow` 14, `check-briefing` 43, `check-solo` 80.

**Gates on `97684cb`** (fresh clone, clean tree):
- fast `20261110-171227-97684cbe-2368` PASSED;
- full `20261110-171316-97684cbe-5210` PASSED, 79/79.

Evidence is in `docs/evidence/gate-runs/` and `docs/evidence/stage71-local/`.

**Repair: review 6775606005** (`1a89fc6`, D-S71-10).
- **The defect:** a stale draft overwrote a cohost's newer lineup, because the planner sent the latest background revision. Reproduced on `97684cb` (evidence in `docs/evidence/review-pr8/`).
- **The fix:** drafts are bound to the revision they started from, conflicts are shown with an explicit choice, and Clear is bound too.
- **Tests:** `check-quick-party` part K, a two-client UI regression (67 checks; part K fails on `97684cb`).
- **Gates on `01fd285`** (fresh clone, clean tree):
  - fast `20261110-183513-01fd2858-4576` PASSED;
  - targeted `20261110-183603-01fd2858-7370` PASSED, 11/11: `quick-party` 67, `casual`, `lobby-mode`, `game-night-flow`, `briefing`, `solo`, `solo-shelf`, `recovery`, `sessions`.
- **Why no full gate:** the full gate on `97684cb` stands for the rest. The repair only changes the client's Quick Party planner, its lobby card, and the Apply and Clear functions in `App.tsx`.

**External blockers:** none. WebKit and real devices are not available here.

**Next task:** ChatGPT reviews PR #8; the next session-flow slice starts only when its handoff instructs it.

**Risk:**
- The time estimates are design defaults, not measured.
- The TV screens don't show the lineup yet.
- Browser checks run in Chromium only.


## Stage 7.2: casual results and explicit session continuation (2026-11-10)

**Branch:** `claude/stage7-2-session-flow`, stacked on PR #8 at `08bba4d` (PR #9).
- **Instruction:** ChatGPT's handoff on PR #8 (comment 6776351818) and its clarification on PR #9 (comment 6776484058).
- **Spec and record:** `docs/stage7/stage72.md`; decisions D-S72-01 … 10.
- Nothing was merged or deployed, no port was made public, and nothing was paid for.

**Milestone:** after a casual game, everyone sees one clear Mchezo results screen saying Casual, and the host or a cohost chooses what's next:
- the lineup's **Next game**;
- **Play again** (a rematch);
- **Take a break**, then **Resume**.

Everyone else and the TV see the same state. The server holds the progression with:
- item states;
- a session revision;
- press ids, so a retry, a lost reply, a delayed opposite command or a cancelled start never starts or changes anything twice.

**Files:**
- **Server:** `src/server/room.ts`, `src/server/http.ts`.
- **Web:**
  - `apps/web/src/App.tsx`;
  - `components/mchezo/WhatsNext.tsx` and `whatsNextState.ts` (new);
  - `Lobby.tsx`, `QuickParty.tsx`, `Briefing.tsx`, `TvShow.tsx`, `MchezoTv.tsx`;
  - the five results screens that have their own;
  - `ui/mchezo/MchezoProvider.tsx`, `ResultsHero.tsx`, `Lifecycle.tsx`, `lib/celebrate.ts`, `lib/lifecycle.ts`, `lib/tvfeed.ts`, `styles/stage7.css`;
  - `types.ts`.
- **Tests and scripts:**
  - `tests/stage72-session-flow.test.ts` and `tests/stage72-client.test.ts` (new);
  - `tests/stage71-quick-party.test.ts` and `tests/stage3-qa-results.test.ts` (updated);
  - `scripts/check-session-flow.mjs` and `scripts/screenshot-stage72.mjs` (new);
  - `scripts/check-quick-party.mjs` (updated).

**Tests:**
- **Unit and HTTP:** 27 session-flow tests and 4 client tests. Eight mutations of the safeguards are each caught.
- **`check-session-flow`:** 52/52.
- **`check-quick-party`:** 68/68.
- **Local regressions, all passing:** `check-casual`, `check-briefing`, `check-game-night-flow`, `check-lobby-mode`, `check-tv-spectator`, `check-f4`, `check-solo`, `check-solo-shelf`.

**Gates on `acab35f`** (fresh clone, clean tree):
- fast `20261110-195030-acab35f3-16696` PASSED (1,253 unit tests);
- full `20261110-195129-acab35f3-19586` PASSED, 80/80.

Evidence is in `docs/evidence/gate-runs/` and `docs/evidence/stage72-local/`. The screenshots are in `docs/stage7/screenshots-72/` (36, taken on `2e79cec`).

**External blockers:** none. WebKit and real devices are not available here (checklist I13–I16).

**Next task:** ChatGPT reviews PR #9 and does its private live-site audit. The next milestone starts only when its handoff instructs it.

**Risk:**
- Browser checks run in Chromium only.
- A server restart is covered by the HTTP tests, not by a browser journey.
- The lobby's own Start keeps an optional press id at the API for older callers (the app always sends one).

**Repair: review 6778921208** (D-S72-11, D-S72-12; spec §6.3).
- **Defect:** a game picked by hand that matched the lineup's next item was started as that item and used it up.
  - Reproduced on `acab35f` by `check-session-flow` part J (11 checks fail there).
  - Fixed with an explicit start intent from the control pressed.
- **Placement:** What's next moved right under the result heading on every casual results screen (part K).
- **Driver fix:** an Impostor-removal flake in `check-quick-party` part C, from Stage 7.1.
- **Local runs, all passing:** `check-session-flow` 70/70 and `check-quick-party` 68/68; regressions `check-casual`, `check-library`, `check-shuffle`, `check-lobby-mode`, `check-game-night-flow` and `check-briefing`.
- **Gates on `e65d80c`: both FAILED** (fast `20261110-211133-e65d80ce-5071`, full `20261110-211133-e65d80ce-5056`).
  - The cause: the seven-day Cup unit test timed out at 5.0 s while both gates ran their unit tests at once.
  - Fixed in `01cde60` with an explicit 30-second limit on that test. No verdict is claimed for these runs.
- **Gates on `01cde60`** (fresh clone, clean tree):
  - fast `20261110-214318-01cde601-21310` PASSED;
  - full `20261110-214318-01cde601-21321` PASSED, 80/80.

## Stage 7.3: hand the host role to another player (2026-11-10)

**Branch:** `claude/stage7-3-host-handover`, stacked on PR #9 at `f24934f` (PR #10).
- **Instruction:** ChatGPT's review and handoff on PR #9 (comment 6781323820). It cleared Stage 7.2 after its own live-site audit of `01cde60`.
- **Spec and record:** `docs/stage7/stage73.md`; decisions D-S73-01 … 05.
- Nothing was merged or deployed, no port was made public, and nothing was paid for.

**Milestone:** the host of a casual room can deliberately give the host role to a connected player, between games, and carry on as a player.
- The transfer is atomic, repeat-safe and persisted, with exactly one host afterwards.
- A former host's HTTP and WebSocket authority ends at once.
- Everyone and the TV see the new host.
- The room, its code, seats, scores, lineup and break don't change.

**Files:**
- **Server:** `src/server/room.ts`, `src/server/http.ts`.
- **Web:** `apps/web/src/components/mchezo/HostHandover.tsx` (new), `App.tsx`, `TvShow.tsx`, `types.ts`, `ui/mchezo/styles/stage7.css`.
- **Tests and scripts:** `tests/stage73-host-handover.test.ts`, `scripts/check-host-handover.mjs` and `scripts/screenshot-stage73.mjs` (all new).

**Tests:**
- **Unit and HTTP:** 18, with 11 mutations each caught. They include clarification 6781456175's cases: the whole command, a forgotten press then A→B→A, and open host/cohost/player sockets across a transfer to a cohost and a seat recovery.
- **`check-host-handover`:** 32/32.
- **Regressions, all passing:** `check-game-night`, `check-casual`, `check-recovery`, `check-sessions`, `check-session-flow` (70), `check-quick-party` (68), `check-tv-show`, `check-lobby-mode`.

**Gates on `371c194`** (fresh clone, clean tree, both at the same time):
- fast `20261110-231336-371c1948-12599`: **PASSED** 5/5, 1,271 unit tests;
- full `20261110-231336-371c1948-12591`: **PASSED** 81/81, including `check-host-handover` 32/32, `check-session-flow` 70 and `check-quick-party` 68.
- No failed runs. Raw evidence is in `docs/evidence/gate-runs/<run>/`.

**External blockers:** none. WebKit and real devices are not available here (checklist I17–I19).

**Next task:** ChatGPT reviews PR #10 and does its private live-site audit. The next milestone starts only when its handoff instructs it.

**Risk:**
- **Two copies of the host role:** `hostId` and the cohost set, plus each player's flags. Every path that changes one must change the other. A transfer does both in one step, and a restore normalizes them.
- **A non-host start is refused with 400** (the engine's existing generic error), not 403. This slice leaves it unchanged.
- **Emulation only:** no real phones.

## Stage 7.4: content variety in solo and casual rooms; the cancel wording (2026-11-11)

**Branch:** `claude/stage7-4-content-variety`, stacked on PR #10 at `af39c78` (PR #11).
- **Instruction:** ChatGPT's review and handoff on PR #10 (comment 6783345938). It cleared Stage 7.3 after its own review and private live-site audit of `371c194`.
- **Spec and record:** `docs/stage7/stage74.md`; decisions D-S74-01 … 08.
- Nothing was merged or deployed, no port was made public, and nothing was paid for.

**Milestone:**
- **Variety:** solo and casual rooms deal content the room hasn't used before repeating any, then the least recently used. The queued item in `docs/MILESTONES.md` is done.
- **Cup unchanged:** Family Cup selection is identical to `af39c78` (pinned in tests).
- **Cancel wording:** the briefing's cancel confirmation names where you actually go back to (results or lobby).
- **A pre-existing defect, found and fixed:** after a server restart, every solo Start was refused ("Need at least 1 connected players"); spec §7.4.

**Files:**
- **Server:** `src/content/select.ts`, `src/server/room.ts`, `src/server/serve.ts` (`MCHEZO_CONTENT_DIR`, testing only).
- **Web:** `apps/web/src/solo/soloSession.ts`, `apps/web/src/components/mchezo/Briefing.tsx`, `App.tsx`.
- **Tests and scripts:** `tests/stage74-content-variety.test.ts`, `scripts/check-content-variety.mjs`, `scripts/lib/small-pool.mjs` (all new). Also changed: the Stage 6.2 pinned tests (on purpose), `check-solo-shelf` part E (now asserted), and every other `selectContent` caller (`roomKind`).

**Tests:**
- **Unit and HTTP:** 27 new; 1,298 in all. Fourteen mutations each caught.
- **`check-content-variety`:** 54/54, including the server restart (A2) and a stale press across two tabs (A3). It fails on an `af39c78` server (one board for all 13 starts) and without the solo-restart fix.
- **Regressions, all passing:** `check-session-flow` (70), `check-quick-party` (68), `check-solo` (80), `check-solo-shelf` (58), `check-briefing` (43), `check-casual` (30), `check-host-handover` (32), `check-recovery` (20).
- **Clarification 6783492788** (solo press ids: whole command, latest-only replay, persisted monotonic revision) is built and tested (spec §4.4).

**Repair (ChatGPT's review 6786060026, P2, V3), on the same branch:**
- **The finding:** a solo Start with no answer adopted any new round of the same game, including another tab's.
- **The fix:** the app now sends the same press again and acts only on the server's answer (spec §7.5, D-S74-08). The server is unchanged.
- **Tests:**
  - 5 new real-server client tests (two tabs, injected faults) and 2 reworked Stage 6.1 client tests;
  - unit suite 1,304;
  - five client mutations, each caught;
  - `check-content-variety` A4 (57 checks);
  - `check-solo` 80, `check-solo-shelf` 58.
- **Shown failing with the reviewed client:** five of the new tests (three by adopting B's round) and A4 in the browser.
- **Gates on `8147b72`** (fresh clone, clean tree, one after the other):
  - fast `20261111-034429-8147b726-9520`: **PASSED** 5/5, 1,304 unit tests, 42 s;
  - full `20261111-034515-8147b726-12402`: **PASSED** 82/82, `check-content-variety` 57/57, in 28 min 13 s.
  - No failed gate runs.
- **A failure observed after those gates:** a focused rerun of the two solo client test files failed one Stage 6.1 test once (58 passed, 1 failed; `docs/evidence/stage74-local/repair/two-tab-and-client-tests-on-8147b72.log`).
  - **The cause:** a timed-out Start send was resent, because a timer fired a few ms early and the timeout wasn't flagged.
  - **The impact:** not a safety problem. It was the same press, answered as a replay, but it broke the stated rule.
  - **Reported** on PR #11 (comment 6788331434) while the new gates ran.
- **The fix (`ecb617c`, client only):**
  - only a quick failure is resent, and a timed-out request ends the Start;
  - 2 new Stage 6.1 tests (a lagging clock; a late failure then a hang);
  - unit suite 1,306;
  - seven client mutations, each caught (C3 had not been caught before; `…/repair/client-mutations-on-ecb617c.txt`).
- **Gates on `ecb617c`** (fresh clone, clean tree, one after the other; PR #11's tested revision):
  - fast `20261111-055510-ecb617c6-15772`: **PASSED** 5/5, 1,306 unit tests, 45 s;
  - full `20261111-055600-ecb617c6-18731`: **PASSED** 82/82, `check-content-variety` 57/57 (A4 included), `check-solo` 80, in 28 min 47 s.
  - No failed gate runs.
- **Noted for later:** two shipped Connections boards have Christmas clues; queued in `docs/MILESTONES.md` for the seasonal-content milestone.

**Gates on `5d41e5f`** (fresh clone, clean tree, one after the other):
- fast `20261111-013325-5d41e5f1-17311`: **PASSED** 5/5, 1,298 unit tests, 39 s;
- full `20261111-013409-5d41e5f1-20255`: **PASSED** 82/82, including `check-content-variety` 54/54, in 28 min 00 s.
- No failed runs. Raw evidence is in `docs/evidence/gate-runs/<run>/`.

**External blockers:** none. WebKit and real devices are not available here (checklist I20–I21).

**Cleared:** ChatGPT's review 6790743334 on PR #11 (2026-11-11) cleared Stage 7.4 on tested `ecb617c` (head `58196cb`, docs only after it), after its own focused checks (87/87; `check-content-variety` 57/57 in its Codespace) and a private live-site retest in desktop Chromium. Real iPhone Safari, Android Chrome and WebKit remain unverified. Seasonal Connections content stays queued. Cleared for development continuation, not merge or deployment.

**Next task:** Stage 8.1 (mobile usability and solo presentation), instructed by the same comment; below.

**Risk:**
- **Variety is per room:** a new solo room (another device, cleared storage) starts fresh.
- **Two solo tabs pressing Start within the same moment:** one wins and the other is told something changed, with Try again. This is by design (D-S74-04).
- **Emulation only:** no real phones.

## Stage 8.1: mobile usability and solo presentation (2026-11-11)

**Branch:** `claude/stage8-1-mobile-solo`, from `58196cb` (PR #11's cleared head), stacked on PR #11 (PR #12).
- **Instruction:** ChatGPT's review and handoff on PR #11 (comment 6790743334), under D-WF-01.
- **Spec and record:** `docs/stage8/stage81.md`; decisions D-S81-01 … 06.
- Nothing was merged or deployed, no port was made public, and nothing was paid for.

**Milestone:**
- **S1, the solo shelf:** row cards on phones (a small square cover beside the words, Start across the bottom), a grid of up to three from 600 px. On desktop all three games and their Start buttons are on the first screen (before: one column, one game above the fold).
- **S2, Pattern Pulse's game clock:** between patterns, the game's time left on the server's clock, said to keep running; a warning tone at one minute; announcements only at under a minute, under 20 s and time up, once per game; at time up, Show me the pattern gives way to a status and the results follow, or, while the server isn't answering, a plain note with Check again. Pulse draws one clock per screen (App no longer adds its own).
- **S3, touch and responsive:** the solo round fits the screen; held sideways, Pulse's Lock it in and Math's four answers are on screen; the briefing's I'm ready waits at the bottom while the rules are read.
- **Found and fixed:**
  - **F3 (pre-existing):** solo countdowns ran on the phone's own clock (the solo session never recorded the server's). Fixed; tested against a real server with a skewed clock.
  - **F5:** the briefing's I'm ready was below the fold at 320 and 390 px.
  - **F6:** a solo round's page was a bar's height taller than the screen.

**Changed:**
- **Web:** `apps/web/src/components/mchezo/pulseClock.ts` (new), `MchezoPulse.tsx`, `Solo.tsx`, `App.tsx`, `apps/web/src/solo/soloSession.ts`, `apps/web/src/ui/mchezo/styles/stage8.css` (new), `ui/mchezo/index.ts`.
- **Tests and scripts:** `tests/stage81-mobile-solo.test.ts`, `scripts/check-mobile-everyday.mjs`, `scripts/screenshot-stage81.mjs` (all new).
- **Server:** unchanged.

**Tests:**
- **Unit:** 16 new; 1,322 in all. F3's tests and the three feedback mutations (order guard, clock from every reply, history per game) each fail a test.
- **`check-mobile-everyday`:** 130/130 locally (the shelf at four sizes; Pulse's clock on a phone 10 minutes fast; time up with a short game window, also while the server isn't answering, solo and in a room; landscape, also at 130 % zoom; a casual room with the longest names, Play again included).
- **Regressions, local, on `a856fa4`:** `check-solo` 80, `check-solo-shelf` 58, `check-pattern-pulse` 54, `check-pulse-timing` 41, `check-briefing` 43, `check-session-flow` 70, `check-lifecycle` 37, `check-math` 28, `check-mobile` 50.
- **Screenshots:** before (`58196cb`) and after (`a856fa4`), 36 each, `docs/stage8/screenshots-81/`.
- **Spec feedback 6790913242** (ChatGPT, 08:23 UTC; it reached this session at 09:04, after the first build): applied in `a856fa4` (spec §3.2, §3.3, §6 choices 9–10).

**Gates:**
- **`2300bcc`** (before the feedback): fast PASSED (`20261111-090358-2300bccc-8008`); full stopped by me a minute in when the feedback arrived, self-recorded CANCELLED (`20261111-090450-2300bccc-10963`). Not a verdict on the checkpoint.
- **The checkpoint, `de913bf`** (fresh clone, clean tree, one after the other):
  - fast `20261111-092723-de913bf1-17062`: **PASSED** 5/5, 1,322 unit tests, 47 s;
  - full `20261111-092815-de913bf1-20032`: **PASSED** 83/83, `check-mobile-everyday` 130/130, in 30 min 02 s.
  - No failed gate runs. Raw evidence for all four runs is in `docs/evidence/gate-runs/<run>/`.

**External blockers:** none. WebKit and real devices are not available here (checklist I22–I24).

**Repair R81-01** (ChatGPT's review 6793171907, not cleared: its Codespace run of `check-mobile-everyday` was 129/130, a 320 px card 341 px tall):
- **Cause:** the app loads no web font; my runs measured Inter (installed here), the Codespace a wider fallback. DejaVu Sans reproduces 302/302/341 exactly.
- **Fix (`86baf14`):** on phones the cover sits beside the title and players line only; the description, best and note run full width. Worst case now 284 px (DejaVu Sans), 265 with the others.
- **The check** keeps its caps and now measures them with every installed fallback font too; against the tested stylesheet it fails here as in the Codespace.
- **Evidence:** `docs/evidence/stage81-local/r81-01/`; spec §7.5.
- **ChatGPT's live-site restart check** was blocked by the preview's GitHub sign-in after the tunnel was recreated (its audit boundary, not an app change; review 6793171907).

- **Gates on `d7bb85f`** (fresh clone, clean tree, one after the other):
  - fast `20261111-103446-d7bb85f0-2862`: **PASSED** 5/5, 1,322 unit tests, 47 s;
  - full `20261111-103537-d7bb85f0-5864`: **PASSED** 83/83, `check-mobile-everyday` 134/134 (four fonts), in 30 min 48 s.
  - No failed gate runs.

**Next task:** ChatGPT's review of the repair and the rest of its private live-site audit (the restart check).

**Risk:**
- **Emulation only:** no real phones, no WebKit; landscape on a real phone (browser bars, the notch) is unverified.
- **The briefing's sticky I'm ready** also applies to Family Cup briefings (the same screen); `check-briefing` passes.
- **The landscape answer area** applies to every quiz game using the shared question screen; portrait is unchanged.

**Cleared:** ChatGPT cleared Stage 8.1 on `d7bb85f` (comment 6795218622, 12:00 UTC), after its own run of `check-mobile-everyday` (134 passed, none failed, its four fonts) and its private live-site audit, the restart check included (Chromium emulation; real phones and WebKit unverified). The same comment is the Stage 8.2 handoff.

---
## Stage 8.2: Everyday and Christmas themes, and seasonal content kept apart (2026-11-11)

**Branch:** `claude/stage8-2-themes-seasonal`, from `0f3cc54` (PR #12's cleared head), stacked on PR #12.
- **Instruction:** ChatGPT's handoff on PR #12 (comment 6795218622), under D-WF-01.
- **Spec and inventory first:** `docs/stage8/stage82.md` (§1 what exists, §3 design, §6 choices for review, §8 the catalog audit: 45 Christmas-only items, 43 of them dealt in solo or casual play today).
- Nothing merged or deployed, no public port, nothing paid for.

**Milestone (built; spec §7, D-S82-01 … 06):**
- **Seasonal content:** 45 Christmas-only items are tagged `season: "christmas"` (outside the content hash; no item's hash changed). Everyday solo and casual sessions never deal them; Christmas sessions deal them first. Cups are unchanged.
- **The session's content:**
  - Everyday unless Christmas is chosen (solo shelf; casual host or cohost).
  - Persisted and shown before Start (up-next card, dock, briefing, What's next, TV).
  - Bound at Start: a casual mismatch is refused (CONTENT_CHANGED); a solo Start's content is part of its press; a frozen briefing re-checks its items.
  - Older rooms are Everyday.
- **The look:** per device, never sent (Settings → Look: Match the game, Everyday, Christmas). Every screen and the page itself follow it, the browser toolbar colour included. The legacy shell header says Mchezo. Token gaps are closed, and contrast is checked in both themes.

**Changed:** see spec §7.1 (server `51301ee`, web `ea2bbff`, then the browser driver and the What's next label's test id).

**Tests (local, the working tree):**
- **Unit:** 1,359 tests, 35 of them new; eight mutations each caught.
- **Browser:** `check-themes-seasonal` 125 checks, and 26 regression drivers with 0 failures (`docs/evidence/stage82-local/`).

**Spec feedback 6795825877** (ChatGPT, 12:28 UTC; it reached this session at 13:25, after the first candidate `d4e06c3`): applied (spec §3.1, §3.4, §3.5, §3.7, D-S82-07).
- **A Start without content** is a legacy Everyday press.
- **Every press's content is part of its identity** on every path.
- **The game on screen** drives Match the game and its labels ("This game" / "Next game").
- **Solo:** Play again repeats its round's content, and a pending press is resent unchanged.
- **Migration by room kind,** with restart fixtures.
- **Stored choices** fall back safely.
- **Tests:** 15 more unit tests (1,374 in all); the driver now has 139 checks (two tabs, and active versus next); 18 regression drivers rerun with 0 failures.

**Gates:**
- **`d4e06c3`** (before the feedback): fast PASSED (`20261111-132206-d4e06c34-24970`); full stopped by me about a minute in when the feedback arrived, self-recorded CANCELLED (`20261111-132514-d4e06c34-28633`). Not a verdict on the final candidate.
- **The final candidate, `c27570f`** (fresh clones, clean tree, one after the other):
  - fast `20261111-134753-c27570f7-12465`: **PASSED** 5/5, 1,374 unit tests, 49 s;
  - full `20261111-134957-c27570f7-15819`: **PASSED** 84/84, `check-themes-seasonal` 139, in 30 min 00 s.
- **Screenshots:** before (`0f3cc54`) and after (`c27570f`), 40 each, `docs/stage8/screenshots-82/`.

**External blockers:** none. Real phones and WebKit are not available here (checklist I26, I27).

**Repair R82-01** (ChatGPT's review 6799134510 on `c27570f`, not cleared):
- **The finding:** a `localStorage` write that failed undid the look or content choice at once. Listeners re-read stale or default storage.
- **The fix:** `ui/mchezo/deviceChoice.ts`. The page's choice is held in memory and is authoritative for the page, on every screen. Other tabs' saves still arrive. Failed saves are said plainly ("until you reload").
- **The check:** `check-themes-seasonal` section F, in three storage modes, for both the look and the content: the shelf → Word Connections Start reaches the server as Christmas. 19 of its checks fail on `c27570f`; all 166 pass after the repair. Five new unit tests call the setters themselves (1,379 unit tests in all). Ten regression drivers were rerun with 0 failures. Evidence: `docs/evidence/stage82-local/r82-01/`.
- **Gates on the first repair candidate, `224a2d2`:**
  - fast `20261111-150823-224a2d23-5811` PASSED (5/5, 51 s).
  - Its full gate `20261111-151310-224a2d23-9331` was stopped by me within seconds (self-recorded CANCELLED, exit 130), because the R82-01 shots had just shown the defect below. Neither run is a verdict on the final candidate.

**Found while validating the repair** (mine, not a reviewer's; stage82.md §7.5, D-S82-09):
- **The finding:** compact choices clipped their labels. At 320×640, Settings → Look read "Match | Everyday | hristmas", and the shelf's content choice also overflowed in wider fonts. It dates from the first Stage 8.2 candidate.
- **The fix** (CSS only): compact choices wrap instead of clipping, and the ✓ never changes a width.
- **The check:** new section G of `check-themes-seasonal`, covering three sizes and every installed wide font. It fails 19 checks on `224a2d2`, and all 251 pass after the fix. `check-mobile-everyday` (R81-01's first screen) passes 134/134. Ten regression drivers had 0 failures. Unit tests, lint and typecheck are clean.
- Evidence: `docs/evidence/stage82-local/choice-fit/`.

**Gates on the final repair candidate, `546a9c6`** (fresh clones, clean tree, fingerprint `9537c8d89ade`, 449 files, one after the other):
- fast `20261111-154635-546a9c6f-17994`: **PASSED** 5/5, 1,379 unit tests, 49 s.
- full `20261111-154845-546a9c6f-21442`: **PASSED** 84/84, `check-themes-seasonal` 251 (G 85), `check-mobile-everyday` 134, in 30 min 42 s.
- Screenshots retaken on `546a9c6`: `after/` (40) and `r82-01/` (5).

**Repair report:** PR #13 comment 6801151583 (tested `546a9c6`, head `4c13e2b`).

**Cleared:** ChatGPT's review 6801615731 (PR #13) cleared Stage 8.2 for development continuation and handed off Stage 8.3.
- It independently ran 115/115 focused unit tests and `check-themes-seasonal` 251/251 on `546a9c6`, plus its mandatory private interactive host/guest/TV audit, which included a restart and reconnect.
- R82-01 is resolved.
- Its non-blocking observation is for the memorable-results milestone, not this stage: a casual room's Memory Book said "Finish a game first" after completed casual rounds.
- Real iPhone, Android and WebKit are still unverified. Clearance is not merge, deployment or championship approval.

**Risk:**
- **Emulation only:** Safari's toolbar colour and Android's status bar are untested on real phones.
- **Existing casual and solo rooms turn Everyday** (intended; D-S82-05). A room that was dealing a Christmas board stops until the host chooses Christmas.
- **The audit's word net** misses a Christmas item with no Christmas word ("Decorating a tree"). Tagging stays a reviewer's job.

## Stage 8.3: Home Screen installation foundation (2026-11-11)

**Branch:** `claude/stage8-3-home-screen`, from `4c13e2b` (PR #13's reviewed head), stacked on PR #13.
- **Instruction:** ChatGPT's handoff on PR #13 (comment 6801615731), under D-WF-01.
- **Spec and inventory first:** `docs/stage8/stage83.md`.
  - §1: what exists. There is no manifest, icon or service worker, and static files are served without cache headers.
  - §2: the platform facts, with sources.
  - §3: the design: install identity, guidance, the offline and privacy boundary, the update lifecycle.
  - §6: choices for review.
- Nothing merged or deployed, no public port, nothing paid for.

**Milestone (built; spec §7, D-S83-01 … 06):**
- **Identity:** a static manifest, and icons drawn from the circle mark (regular and maskable 192 and 512 px, an opaque 180 px Apple touch icon, an SVG favicon). Nothing about a room or a person.
- **Server:** the install files with real types; `no-cache` for pages, the manifest, the icons and `sw.js`; `immutable` hashed assets; a 404 for a missing build file; `GET /health`.
- **A narrow service worker:**
  - It works from an allowlist: page loads are network first, with the cached shell only offline, plus this build's assets and the public files.
  - Every API path, non-GET request, WebSocket and other origin is untouched. Nothing is queued.
  - A new build's worker waits; old caches are deleted only when no old page is open.
- **Guidance:** a Home card and a Settings row. Chromium's prompt only when asked; "added" only on `appinstalled`. The iPhone steps, **Not now**, and hidden when installed.
- **Notices:** "Can't reach Mchezo" and "A newer version is ready" on Home, Join, Host, the solo shelf and the library, never in a room or a round.

**Tested (Chromium; spec §7.2):**
- **Unit:** 22 new tests, 1,401 in all, plus lint and typecheck.
- **`check-install`, 91 of 91:**
  - Chromium's manifest and installability verdicts are clean.
  - The cache holds 14 public shell entries and no secrets, and 28 of 28 API replies came from the network.
  - Offline, every entry screen is honest and recovers.
  - The guidance passes, as does a new build arriving mid-round.
  - A room reopened offline shows its "Rejoining" heading below the connection banner. That fix is for a pre-Stage 8.3 layout found in this stage's screenshots; O2 fails 8 of 8 on `8b8a7ef`.
- **Eight regression drivers** pass with the worker in place.
- Evidence: `docs/evidence/stage83-local/`.

**Spec feedback 6802191261 applied** (stage83.md §7.3, D-S83-07):
- **The allowlist:** an exact build list, fonts included; another build's files never enter an old cache.
- **Storing:** only validated responses, and an all-or-nothing install.
- **The update notice:** only when the server answers and the page isn't already the waiting build.
- **`/health`:** must answer `{"ok":true}`.
- **Wording:** no promise of moving seats or bests.
- **New tests:** `check-install` sections U (two tabs) and F (a partial deploy, a sign-in page, a redirect, quota denied, no static routing) and O3, 113 checks in all; 25 unit tests.
- **Platform claims** were rechecked through search; the primary sites are blocked from this environment.

**External blocker for real phones:** service workers need HTTPS. Over the plain-http LAN preview, an iPhone can still Add to Home Screen, but the offline and update checks need a private HTTPS preview (REAL_DEVICE_TESTING Part J; spec §6 point 6).

**Gates on the final candidate, `96b3970`** (fresh clones, clean tree, fingerprint `7f36233e758c`, 468 files, one after the other):
- fast `20261111-181930-96b3970e-32718`: **PASSED** 5/5, 1,404 unit tests.
- full `20261111-182118-96b3970e-3648`: **PASSED** 85/85, `check-install` 113, in 31 min 11 s.
- Earlier candidates `8b8a7ef` (rejoin fix) and `69a7dc1` (spec feedback): each passed its fast gate; I stopped each full gate (CANCELLED). Not verdicts.
- Screenshots: `docs/stage8/screenshots-83/`, 34 shots on `96b3970`.

**Completed report:** posted on PR #14 (comment 6804614713) for `96b3970`, head `afd5ae1`. ChatGPT's independent review started (6804653156).

**ChatGPT's verdict 6805055962: repair required (R83-01).** I had found the same defect after the report (correction 6805122200). The rest of the independent review passed: the private live-site audit of solo, host, guest, TV, reconnect and break, 25/25 unit tests and 113/113 `check-install` checks.

**Repair R83-01** (stage83.md §3.3 and §7.5, D-S83-08):
- **The defect:** a failed worker-only update deleted the active worker's offline shell. The version didn't cover the worker's code, and the installing worker wrote into, then deleted, the shared cache.
- **Identity:** `apps/web/swBuild.ts` hashes the worker's own code into the version. The same source gives the same worker, byte for byte.
- **Ownership:** `apps/web/src/install/swLifecycle.ts` makes an install write only into a fresh candidate cache and delete only that on failure. The live cache is replaced only on activation.
- **Tests:**
  - 12 new unit tests: identity, plus ownership against a recording fake, with a failure at every file and every write.
  - A new real-build driver, `check-install-builds` (34 checks, in the full gate). It makes four real builds (A, A again, a worker-only change, a worker-policy change) and covers the failed missing-file and storage-full installs, the old tab's play, the offline shell, waiting and activation, scoped cleanup, and the defensive same-version case.
  - On `96b3970`'s code the driver fails 11 of 34; on the repair it passes 34 of 34.
- **Superseded:** my first local fix `c74befa` (identity, and a guard on the delete) is kept in history. Its fast gate passed and its full gate was CANCELLED; neither is a verdict on the repair.

**Gates on the repair candidate `8340668`** (fresh clones, clean tree, fingerprint `feb72b0807ae`, 471 files, one after another):
- fast `20261111-193930-83406685-4884`: **PASSED** 5/5, 1,416 unit tests.
- full `20261111-194026-83406685-7879`: **FAILED**, 85/86. `unit-tests`: three solo-session tests with 300 ms timeouts failed under the start-up load. They are unrelated to the repair and pass alone. A separate hardening task has been suggested.
- full `20261111-201230-83406685-23681`: **PASSED** 86/86 in 31 min 21 s, with `check-install` 113 and `check-install-builds` 34.

**Next task:** push, then a new completed report on PR #14. After that, ChatGPT's confirmation of R83-01.

**Stage 8.3 CLEARED** by ChatGPT's review 6807907986 (PR #14), for development continuation only, not merge or deployment.
- It covered the reviewed candidate `8340668` at head `90290ef`, and found no blocking findings. R83-01 is resolved.
- **Independent checks:** 37/37 focused unit tests, the build, and `check-install-builds` 34/34, which reproduced my build versions `f550dbcd950aa120`, `993e7806d9473388` and `da1c20fff9c4c6b9`.
- **Private live-site audit:** done on Codespaces port 3457 (private). It covered the Settings install guidance, a full Word Connections round through a stop and restart of the preview (450 points), host and guest, a guest reload, the TV and break/resume.
- **Not run:** native install, WebKit and real phones.

## Stage 9.1: Jebena Rush, the first playable slice (CLEARED by ChatGPT's independent review 6811101479 on `4d91cd6`/`aaa6981`)

- **Cleared** 2026-11-11 (6811101479): no remaining blocking finding.
  - The reviewer ran 63/63 focused tests, the web build, and the browser driver (106 checks, 0 failed).
  - Its private live-site audit covered phone 320/390, host, guest and TV, answers and timeouts, replay and cancel, reload, a server interruption with catch-up, and break/resume.
  - This is development clearance, not merge, deployment or real-device certification. Real phones, WebKit and Part K are not run.
- **One nonblocking note:** terminal branches could keep the holder's last rejected try in the saved module state. Fixed in Stage 9.2's first commit (`abafb95`).

- **Brief:** ChatGPT's handoff 6807907986 on PR #14. Base `90290ef` (PR #14's head); branch `claude/stage9-1-jebena-rush`, stacked PR #15 on #14.
- **Spec:** `docs/stage9/stage91.md` (§13: as built and tested). Decisions D-S91-01 to D-S91-09 in `docs/DECISIONS.md`.
- **Built:**
  - **Engine** (`src/games/modules/jebena.ts`): a game module on the room's game-deadline model; turns are the room's phase `turn:<n>` (10 s + 500 ms grace); accept passes, rejections keep the deadline, a timeout costs one heart, starts a new category and passes; out at 0; the last player with hearts keeps the jebena; a 12-minute limit; places and points; sit-out; the standings always in the view.
  - **Bank and matcher** (`src/games/modules/packs/jebena-banks.ts`, `jebenaMatch.ts`): `jr-bank-1`, six Everyday categories, 373 canonical answers (48–97 each) with aliases and named near misses; exact, alias, plural, and typos only when unambiguous; "ambiguous" otherwise.
  - **Settings** (`src/games/settings.ts`, `room.ts`, `http.ts`): hearts 3/5/7 (default 5) validated at Start, recorded, public, reused by Play again; the lobby's hearts are room state (`POST /rooms/:id/game-settings`, host/cohost, casual, revision-checked, persisted), and a Start that shows other hearts is refused (`SETTINGS_CHANGED`). Casual rooms only (`CASUAL_ONLY`); never picked automatically (Quick Party, Smart shuffle).
  - **Screens** (`apps/web/src/components/mchezo/MchezoJebena.tsx`, `styles/stage91.css`): the lobby hearts choice and guests' label; briefing rules and hearts; the phone's turn screen (category, the jebena with steam and wobble by urgency, holder, text countdown, hearts with numbers, a focused field that sends with Enter, plain feedback for every rejection); watching and out screens; results (places, "kept the jebena", hearts, answers, timeouts, points explained); TV live view and post-game review. Reduced motion and Animations Off keep the jebena still with the same words.
- **Review 6808081378 (spec feedback, "continue implementation"):** answers to §11 accepted as given. Two real gaps found and fixed with tests:
  - plurals now collect every singular reading by canonical id across names and aliases (two ids is ambiguous), with fixtures for alias-vs-name rivals, several aliases of one answer, plural readings to different ids, short words and used answers;
  - a turn cutoff at the same instant as the match limit expired the phase first (a heart lost); the module context now carries the game deadline and the limit wins.
  - Added: inclusive-cutoff tests (1 ms before, at, after; duplicates), restart catch-up equal to a server that never stopped (2 and 20 minutes; bounded, idempotent), sockets with everyone disconnected / one connected / a real restart, the briefing's "the clock never stops" line, out players show 0 hearts, endings tested one by one (`tests/stage91-jebena-endings.test.ts`, with the words in `apps/web/src/ui/mchezo/lib/jebena.ts`), and bank privacy in shipped files (`tests/stage91-bank-privacy.test.ts`; `check-jebena-rush` I2), both shown to fail on a deliberately leaking build.
- **Tests:**
  - `tests/stage91-jebena.test.ts` (47): bank, matcher, settings, module rules, the room engine (phase clock, boundary race, spoofing, duplicates, late joiner, whole loop with Play again, the match limit with places, restart mid-turn, projections and two rooms, lobby hearts), catalogue and Quick Party.
  - `tests/stage91-jebena-sockets.test.ts` (8): a real LocalServer with every player on a WebSocket, whole matches at 2, 4 and 10 players; a holder's socket dropping; the deadline boundary; everyone disconnected; one connected; a real restart after an outage.
  - `tests/stage91-jebena-endings.test.ts` (7) and `tests/stage91-bank-privacy.test.ts` (1).
  - `scripts/check-jebena-rush.mjs` (105–107 checks depending on the seeded seat order; its own server, real 10-second turns): host 390 px Everyday, guest 320 px Christmas look, guest 390 px reduced motion, TV 1440 px, a second room, a Family Cup; screenshots in `docs/stage9/screenshots/` (provenance in its README).
  - Updated for a fifteenth game: `m3`, `manifest`, `room`, `test-batch-200`, `library`, `stage71-quick-party`, `d3-briefing`.
- **Fixed while building:** a match ended by the room's limit had no standings in its views (the module's `end` stays null), so the results list would have been empty; the standings are now always in the view, with a test.
- **Not done / limits:** desktop Chromium emulating phone sizes only; real iOS and Android keyboards are `docs/REAL_DEVICE_TESTING.md` Part K, not yet run. The bank is a curated first version (owner review welcome). Practice-only and casual-only, as the brief asks.
- **Questions for the owner** (defaults in place): spec §11.
- **Gates** (each verdict is one run on one revision; evidence in `docs/evidence/gate-runs/<run>/`):
  - `1b6b69e` (first candidate): fast `20261111-224520-1b6b69ee-21122` PASSED (exit 0, 47 s); full `20261111-224616-1b6b69ee-24197` **FAILED** (exit 1; 84 passed, 3 failed). `check-f5` and `e2e-chromium` played every game in one Family Cup room and could not start Jebena Rush there (casual-only by design); `check-quick-party` I hit a race in the driver (the room showed the new game before the lost reply reached the page and the app asked again; it had passed 16 earlier recorded runs). Fixed in `4d91cd6`: those Cup playlists leave casual-only games out (`check-jebena-rush` plays it, and its new section K checks a Cup never offers it); a Cup's picker no longer offers casual-only games; `check-mchezo`/`check-stage2` count the Cup's catalogue; the quick-party driver keeps its route until the app's retry is recorded.
  - `4d91cd6` (final candidate): targeted (`jebena-rush f5 quick-party mchezo stage2 --e2e`) `20261111-231957-4d91cd63-11612` PASSED (8/8); then, sequentially, fast `20261111-232840-4d91cd63-13143` **PASSED** (exit 0, 5/5, 47 s) and full `20261111-232938-4d91cd63-16286` **PASSED** (exit 0, 87/87, 31 min 49 s, no leftover processes).
  - Local runs of `check-jebena-rush` on a clean clone of `4d91cd6` with that full run's build: 105 and 106 checks, 0 failed (`docs/evidence/stage91/`).
- **Next:** the completed report on PR #15; then ChatGPT's review and private audit before Stage 9.2.

## Stage 9.2: Spectrum foundation: rules, privacy, a pure module (CLEARED by ChatGPT's independent review 6813167965 on `3ca8ac7`/`0765222`)

- **Cleared** 2026-11-12 (6813167965): no blocking finding for the unwired foundation or the Jebena cleanup.
  - The reviewer ran 57/57 focused tests, the web build, and the Jebena browser driver (ALL PASS, 105 PASS lines in its run).
  - Its private live audit (host, guest and spectator TV) covered real turns and timeouts, two last-standing endings with consistent scores on every role, Play again keeping 3 hearts, guest reload recovery, a rejected try seen only by its sender, and a final-turn rejected try followed by an ending. No rejected text remained in finished views or the persisted room.
  - This is development clearance, not merge, deployment, real devices or a Spectrum UI (none existed).
- **Nonblocking note, for a later copy cleanup:** in Jebena Rush, a winner with no accepted answers can see both "You won this one" and "You missed this one". Spectrum's cooperative result must avoid generic personal-result messaging.

- **Brief:** ChatGPT's handoff 6811101479 on PR #15. Base `aaa6981` (PR #15's cleared head); branch `claude/stage9-2-spectrum`, stacked PR #16 on #15.
- **Architecture answers 6811445149 (PR #16), applied:** the team result accepted for this unwired slice (`spectrumTeamResult` authoritative; `scores()` copies the total to every original roster player as a compatibility representation; a cooperative results/TV branch is required before production registration); digits allowed in clues (D-S92-03 reversed); the existing product described as **changed** by the Jebena cleanup.
- **Scope:** the spec, a pure module, a content pack and tests. The module is **not wired into the product**: no registry, manifest, policy, picker, Quick Party, Cup, solo or navigation entry. The next slice wires the phone and TV journey after review.
- **Spec:** `docs/stage9/stage92.md`.
  - Four seeded rounds: clue 60 s, guess 45 s, reveal 8 s.
  - The median team guess, scored 10/7/4/0 for a maximum of 40.
  - Sit-outs, skipped rounds and the fewer-than-two ending; disconnects change nothing.
  - Exactly once, including the module's own idempotent expiry.
  - Privacy by role and phase.
  - One shared team score (the per-player results pipeline conflict and a bounded proposal, §8).
  - An accessibility contract for the next UI slice.
- **Done so far:** `abafb95`, the Jebena terminal-feedback cleanup: an optional `GameModule.onFinish`, called once by `finalize`. It has 7 terminal-path tests; 6 of them fail without the change.
- **Built:**
  - `src/games/modules/spectrum.ts` and `packs/spectrum-pairs.ts` (`sp-pairs-1`, 30 original pairs), not registered anywhere.
  - D-S92-01..09 in `docs/DECISIONS.md`; spec §13 maps the tests.
- **Tests:**
  - `tests/stage92-spectrum.test.ts` (49, including the team result at 2, 4 and 10 players with partial endings, and clues with digits and non-ASCII text);
  - `tests/stage92-jebena-terminal.test.ts` (7);
  - `tests/stage91-bank-privacy.test.ts` now also keeps Spectrum's module out of the web app.
- **Mutation checks:** a public target leak fails 4 tests; other players' guesses in a view fail 2; half-down rounding fails 1; `scores()` leaving out sat-out players fails 8; a summed team result fails 10.
- **The existing product is changed** by the Jebena cleanup (the shared `onFinish` in `finalize`); the reviewer's private browser audit of Jebena endings and replay is needed before clearance. The Spectrum UI and real devices are NOT RUN.
- **Gates** (each verdict is one run on one revision; evidence in `docs/evidence/gate-runs/<run>/`):
  - `a6579c6`: fast `20261112-011311-a6579c6b-7434` **FAILED** (exit 1, 4/5): lint `no-useless-assignment` in the Spectrum test helper. Fixed in `adb5e75`.
  - `adb5e75`: fast `20261112-011445-adb5e758-10813` PASSED (exit 0, 5/5); then full `20261112-011539-adb5e758-13971` PASSED (exit 0, 87/87, 31 min 43 s). It ran untouched while 6811445149 was applied elsewhere.
  - `3ca8ac7` (final candidate, 6811445149 applied): fast `20261112-014738-3ca8ac75-30336` **PASSED** (exit 0, 5/5, 49 s); then full `20261112-014837-3ca8ac75-1032` **PASSED** (exit 0, 87/87, 31 min 47 s, no leftover processes). Unit tests 1,536 in 120 files; `check-jebena-rush` 106 checks, 0 failed, with the last-one-standing ending (F) and Play again (G).
- **Next:** the new completed report on PR #16; then ChatGPT's review and the private browser audit of Jebena endings and replay.

## Stage 9.3: playable Spectrum, one complete cooperative journey (CLEARED by ChatGPT's independent review 6820352096 on `9397c00`/`940df38`)

- **Cleared** 2026-11-12 (6820352096): the achievement leakage, the Spectrum timing words and the early-ending copy are resolved; no remaining blocking finding.
  - The reviewer ran 85/85 focused tests and its own targeted gate `20261112-084652-9397c002-13286` (PASS 4/4: Spectrum and TV outage); it reviewed the developer's full run `20261112-073733-9397c002-17855` as developer evidence.
  - Its private live audit covered host, guest and TV through four rounds (40/40), keyboard and button sends, a reload with an unsent guess, Play again, and a two-tap sit-out to an early ending (one reason, 0/40, no "Everyone finished").
  - Nonblocking notes: the team hero and body repeat some summary text; "You: Did not answer (0 of 1)" after another player's immediate departure could be role-aware. The old `check-tv-outage` hang's cause remains unproven.
  - This is development clearance, not merge, deployment or real-device certification. Real iPhone Safari and Android Chrome are not run.

- **Brief:** ChatGPT's handoff 6813167965 on PR #16 (with the Stage 9.2 clearance). Base `0765222` (PR #16's cleared head); branch `claude/stage9-3-spectrum-play`, a stacked PR on #16.
- **Scope:** casual-room selection, briefing, phone play, spectator/TV play, a typed cooperative result and Play again, on the cleared Stage 9.2 rules. No solo, Cup, Quick Party scheduling, new content, Memory Book saving or humour.
- **Spec:** `docs/stage9/stage93.md` (§12: as built and tested; repairs after review 6815908707). Decisions D-S93-01 to D-S93-09 in `docs/DECISIONS.md`.
- **Built:**
  - **Server:** Spectrum registered (casual-only, cooperative, 2–10, phased policy from one timing file, never in Quick Party) together with a typed cooperative result branch: `outcome.team` recorded at `finalize`, persisted and checked on restore; per-player copies never projected, logged, overridden, used for the Cup or achievements, or saved to the Memory Book.
  - **Web:** the briefing; the clue-giver's and guessers' phone screens with an accessible 0–100 scale (±1, ±10, Home/End, touch nudges, explicit Send/Enter); the reveal in words; a two-tap sit-out; the team results hero and results; TV live, final ("Team result") and review; the lobby's last-game card and "Tonight so far" keyed on `outcome.team`; a co-op library tag and an original dial cover.
- **Tests:** `tests/stage93-spectrum-room.test.ts` (22), `tests/stage93-spectrum-ui.test.ts` (14), the Stage 9.2 tests updated for registration; game-count tests for a sixteenth game. Full unit suite: 1,573 tests in 122 files (gate run `20261112-073733-9397c002-17855`).
- **Browser driver:** `scripts/check-spectrum.mjs`, 122 checks; 19 screenshots in `docs/stage9/screenshots/` (`sp-*`, from the final full run on `9397c00`; provenance in its README).
- **Gates** (each verdict is one run on one revision; evidence in `docs/evidence/gate-runs/<run>/`):
  - `893d742`: fast `20261112-034539-893d742c-11884` PASSED (5/5); full `20261112-034635-893d742c-15092` **FAILED** (exit 1, 86/88). `check-library` and `check-library-nav` still expected the Team filter to show only Charades; a cooperative game lists as a team game by design (D-S93-01). `check-spectrum` passed in that run. Fixed in `f1c5f02`: both drivers count the team games from `/games`.
  - `f1c5f02` (final candidate): targeted (`library library-nav spectrum`) `20261112-042020-f1c5f02a-30987` PASSED; then, sequentially, fast `20261112-042223-f1c5f02a-31807` **PASSED** (exit 0, 5/5, 51 s) and full `20261112-042322-f1c5f02a-2551` **PASSED** (exit 0, 88/88, 32 min 25 s, no leftover processes). Unit tests 1,567 in 122 files; `check-spectrum` 114 checks ALL PASS in 107 s.
- **Repair candidates after review 6815908707** (each verdict is one run on one revision):
  - `a25a088` (the three repairs): targeted (`spectrum briefing cup-memory`) `20261112-055905-a25a0880-4316` PASSED; fast `20261112-060247-a25a0880-5230` PASSED (5/5, 52 s); full `20261112-060355-a25a0880-8435` PASSED (88/88, 32 min 51 s).
  - `b668ee3` (+ `check-spectrum` photographs the phone's timing lines; screenshot only): targeted (`spectrum`) `20261112-064204-b668ee3c-24853` PASSED; fast `20261112-064412-b668ee3c-25367` PASSED; full `20261112-064509-b668ee3c-28530` **FAILED** (exit 1, 87/88): `check-tv-outage` timed out at 600 s with nothing logged after its third check. Not reproduced in 8 local runs; the driver waited on its own server's exit with no bound (D-S93-09).
  - `9397c00` (final candidate; + `check-tv-outage` never waits on its server without a bound): targeted (`tv-outage spectrum`) `20261112-073424-9397c002-13982` PASSED; then, sequentially, fast `20261112-073631-9397c002-14644` **PASSED** (exit 0, 5/5, 53 s) and full `20261112-073733-9397c002-17855` **PASSED** (exit 0, 88/88, 32 min 51 s, no leftover processes). `check-spectrum` 122 checks ALL PASS in 106 s; `check-tv-outage` 14 checks in 41 s.
- **Not run:** real iPhone Safari and Android Chrome (Chromium emulation only).
- **Review 6815908707 (repairs required on `f1c5f02`):** P2, an achievement ("First Game Finished") drawn from a Spectrum match through the ledger; P2, the briefing's "45 seconds for the impostor's guess"; copy, "Everyone finished." beside the early-ending reason, which also appeared twice. All three repaired with failing-first regressions (D-S93-08); the gate failure on `b668ee3` led to D-S93-09.
- **Next:** a new completed report on PR #17; then ChatGPT's verification of the repair delta and private live audit. Nothing merged or deployed.

## Stage 10.1: Jebena cini cups and truthful result feedback (CLEARED by ChatGPT's independent review 6829484451 on `0d9e4b4`/`30a56f9`)

- **Brief:** ChatGPT's handoff 6820352096 on PR #17 (with the Stage 9.3 clearance), from the owner's request: "Instead of hearts let's use cini/cup so when they miss the cup breaks." Base `940df38` (PR #17's cleared head); branch `claude/stage10-1-jebena-cups`, a stacked PR on #17.
- **Scope:** Jebena Rush's lives drawn and worded as small handleless coffee cups (cini) everywhere; a cup breaks when a life is lost; and the carried result-copy contradiction (a survival winner told "You missed this one"). No rule, score or protocol change; no humour or saving work.
- **Spec:** `docs/stage10/stage101.md` (§9: as built and tested). Decisions D-S101-01 to D-S101-07 in `docs/DECISIONS.md`.
- **Built:**
  - **The cup:** an original inline SVG cini, `CiniCups.tsx` and `stage101.css`, on every surface that showed hearts: lobby, briefing, your own row (kept once you're out), seat lists, TV, last play, out screen, refusal, results and scoring, library, settings and Start refusals.
  - **When a cup breaks:** only on a live authoritative decrement (`lib/cups.ts`). Never on a wrong try, reload, resync, repeated view or leaving; Play again starts whole. The break animates with full motion only.
  - **Truthful results:** `celebrate.ts` says "You missed this one" only with no recorded action, and never to a first-placed player in a won game.
  - **Unchanged:** server fields, rules and scores (D-S101-01/02).
- **Tests:** `tests/stage101-cups.test.ts` (22; the 4 result cases fail on the base); the results audit is extended. Full unit suite: 1,595 tests in 123 files.
- **Browser driver:** `scripts/check-jebena-rush.mjs`, 148 checks. A break log on every page, a third room for the zero-answer survivor, seven cups at 320 px. Screenshots: `docs/stage10/screenshots/` (after) and `before/` (hearts); provenance in its README.
- **Gates** (each verdict is one run on one revision; evidence in `docs/evidence/gate-runs/<run>/`):
  - `f426988`: targeted (`jebena-rush briefing`) `20261112-102253-f4269885-5996` **FAILED**. The driver's loop missed two real lost lives (one during Amina's resync, one when slow checks ran out Keku's turn), so they looked "stray".
  - `f426988`: fast `20261112-102438-f4269885-6698` **FAILED** (`stage74-content-variety` setup timed out at 250 ms under load, as in `20261111-194026-83406685-7879`). Both fixed in `f157422` (D-S101-07).
  - `f157422` (final candidate): targeted `20261112-103432-f1574229-11563` PASSED; then, one after another, fast `20261112-103623-f1574229-12269` **PASSED** (exit 0, 5/5, 52 s) and full `20261112-103723-f1574229-15489` **PASSED** (exit 0, 88/88, 33 min 24 s, no leftover processes).
- **Not run:** real iPhone Safari and Android Chrome (Chromium emulation only).
- **Review 6822605156 (ChatGPT, 6:40 a.m. ET):** two P2 findings, not cleared. Acknowledged in 6822641851. Repairs below.

### Stage 10.1 repairs (review 6822605156)
- **S101-R1, the deciding cup (D-S101-08):** the match-deciding timeout ends the match in the same snapshot, so its 1→0 break was never drawn.
  - The phone results rows and a new Jebena TV final screen (`JebenaTvFinal`) now draw everyone's cups, continuing the live screens' memory.
  - The deciding cup breaks there once on a screen that watched the match, and shows still under reduced motion. A reload, later visit or the review never replays it.
  - Server, scores, places and Play again are unchanged.
- **S101-R2, continuity (D-S101-09):** `CupMemory` now has a scope (one room and seat, or one watched room) and continuity epochs.
  - `App.tsx` rebaselines on a socket close, staleness, offline, coming back from the background, and pageshow, and marks every applied projection.
  - The 3 s window stays as a second guard only.
- **Tests:**
  - `tests/stage101-cups.test.ts` +5 (27 in all), including the reviewer's helper repro.
  - `check-jebena-rush`:
    - R1 on the actual match-deciding timeout, with no final-loss exception: the TV, the winner's phone and the runner-up's phone each break the deciding cup once, and results equal the server's scores;
    - R2 a short reconnect inside the window, and a same-tab TV switch to a room with colliding ids;
    - the out screen is checked whichever turn takes the last cup (D-S101-12).
  - The new driver fails 10 checks on `f157422`'s build (`docs/evidence/stage101-local/`).
- **Gate fixes found on the way** (none in the cups code; each reproduced on demand before fixing; evidence in `docs/evidence/stage101-local/`):
  - **D-S101-10:** two solo test harnesses that use the real server gave passing requests 250–300 ms; an event-loop stall under load timed them out. Now 2 s with faults, 5 s without.
  - **D-S101-11:** `check-tv-outage` counted the TV's connection note, then read it in a second call; the "reconnected" note can go away in between. Now one read.
  - **D-S101-12:** in the full gate on `36e222f`, the Jebena run skipped the out-screen checks (Baraka went out on his R2 short-drop turn). Now they always run, and the driver fails if they didn't.
- **Gates** (each verdict is one run on one revision; run one after another; evidence in `docs/evidence/gate-runs/<run>/`):
  - `3eb835d` (the repair): targeted `20261112-120037-3eb835d3-4427` PASSED (4/4); fast `20261112-121526-3eb835d3-186` **FAILED** (`stage62-solo-shelf`, D-S101-10).
  - `25c2814`: fast `20261112-122601-25c28143-10294` PASSED (5/5); full `20261112-122710-25c28143-13503` **FAILED** (87/88, `check-tv-outage`, D-S101-11).
  - `36e222f`: fast `20261112-130616-36e222fb-30085` PASSED (5/5); full `20261112-130723-36e222fb-785` PASSED (88/88), but its Jebena run skipped the out-screen checks (D-S101-12). Not used as the final verdict.
  - **`0516e3e` (final candidate):** targeted (`jebena-rush briefing tv-outage`) `20261112-134621-0516e3ea-17341` PASSED (5/5); full `20261112-134811-0516e3ea-18196` **PASSED** (exit 0, 88/88, 32 min 58 s, no leftover processes; 1,600 unit tests in 123 files; `check-jebena-rush` 163, `check-briefing` 44, `check-tv-outage` 15).
- **Screenshots:** `docs/stage10/screenshots/` refreshed from that final run; the ending before the repair is in `repair-before/`.
- **Not run:** real iPhone Safari and Android Chrome (Chromium emulation only).
- **Review 6828948844 (ChatGPT, 11:10 a.m. ET):** changes requested for one driver bookkeeping defect, S101-R3. No new product defect: the private live audit of `0516e3e` passed, but ChatGPT's own `check-jebena-rush` run failed one check (160 PASS, 1 FAILED). Acknowledged in 6828983499.

### Stage 10.1 repair S101-R3 (review 6828948844, test-only)
- **The defect:** the offline-resync check read Amina's whole break log. A cup she lost live before her phone dropped counted as a replay.
- **The repair (D-S101-13):**
  - Numbered break-log events, and cursors from `scripts/lib/break-log.mjs`, for E, R2, the out screen's resync form, the same-tab switch, the wrong tries and Play again.
  - The log is never erased. R2 used to erase Baraka's, hiding his earlier breaks from the integrity checks.
  - Amina's phone drops only after a live loss of hers, asserted present.
  - The driver fails if the offline resync, the reload or the short drop never ran.
- **Tests:** `tests/stage101-break-log.test.ts` (7). Locally (`docs/evidence/stage101-local/`): the old check with the new ordering fails exactly the reviewer's check (164/1); the repaired driver passes (165/0).
- **Gates** on `0d9e4b4` (app code unchanged since `0516e3e`):
  - targeted (`jebena-rush`) `20261112-161936-0d9e4b43-1259` **PASSED** (exit 0, 3/3; `check-jebena-rush` 166 PASS, 0 FAIL);
  - fast `20261112-162112-0d9e4b43-1842` **PASSED** (exit 0, 5/5; 1,607 unit tests in 124 files).
  - No unchanged full gate, as the review asked.
- **Cleared:** ChatGPT's review 6829484451 (11:30 a.m. ET) cleared Stage 10.1 on `0d9e4b4`/`30a56f9`:
  - its own `check-jebena-rush` run passed 166, ALL PASS;
  - its private live audit of the exact build found no blocking finding;
  - physical iPhone and Android remain untested.
  - The same comment hands off Stage 10.2.

## Stage 10.2: a results line for a genuine moment, Jebena Rush and Spectrum (repairs for 6831760093 completed, awaiting review)
- **Brief:** ChatGPT's handoff 6829484451 on PR #18. Base `30a56f9` (PR #18's cleared head); branch `claude/stage10-2-result-lines`, a stacked PR on #18.
- **Scope:** one short, optional line from a pure, deterministic selector over public finished facts, on the player results and the TV final. Jebena: one cup left, or every cup whole, for a sole winner. Spectrum: 40 of 40, or a round exactly on target, for a completed match. No server, score, schema or Memory Book change.
- **Spec:** `docs/stage10/stage102.md` (estimate about 4.5–5.5 h; §8 as built); decisions D-S102-01 to 05.
- **Built:**
  - `jebenaMoment` and `spectrumMoment` in `lib/moments.ts` (the Stage 5 moment layer): pure, deterministic, fixed lines, finished public facts only.
  - **Rendered:** under the result on the phone results (`results-moment`) and on the TV final views (`tv-results-moment`).
  - **Unchanged:** no server, score, projection, schema or Memory Book change.
- **Tests:**
  - `tests/stage102-moments.test.ts` (24).
  - `check-jebena-rush`:
    - room C's one-cup line on both phones (Everyday 390, Christmas 320) and a TV, after reloads;
    - a replay won by absence gets none, and none is carried over;
    - the main match is checked by the driver's own oracle.
  - `check-spectrum`: round 3 on target, so the line shows on three phones and the TV, after reloads; the early-ended match gets none.
- **Gates** on `cdb77ad` (each verdict is one run on one revision; evidence in `docs/evidence/gate-runs/<run>/`):
  - targeted (`jebena-rush spectrum`) `20261112-164638-cdb77add-1528` **PASSED** (4/4; Jebena 193, Spectrum 137);
  - fast `20261112-164851-cdb77add-2300` **PASSED** (5/5; 1,631 unit tests);
  - checkpoint full gate `20261112-165001-cdb77add-5562` **PASSED** (exit 0, 88/88, 33 min 25 s, no leftover processes).
- **Screenshots:** `docs/stage10/stage102-screenshots/`.
- **Not run:** real iPhone Safari and Android Chrome.
- **Next:** ChatGPT's independent review and private live audit of PR #19. Nothing merged or deployed.
- **Repairs (ChatGPT's verdict 6831760093; spec §9; D-S102-06, D-S102-07):**
  - **S102-R1, Memory Book freshness** (`f21f84b`):
    - `GET /rooms/:id/ledger?watermark=1` returns `{ seq, events }`; the plain array is unchanged;
    - the screen judges freshness by the watermark of the response it loaded (pure `memoryLink`: loading, syncing, none, unavailable, ready), and an older response can't roll it back;
    - Spectrum says team games aren't saved yet;
    - redaction and the stale-citation guard are unchanged.
    - Tests: `tests/stage102-memory-freshness.test.ts` (13); `check-spectrum` (the reviewer's journey); `check-jebena-rush` (a supported game ended by sit-outs).
  - **S102-R2, the short reconnect** (`6264827`, driver only):
    - room S, with three proven steps (the drop with the match on and the resync inside 3 s; a later live loss; the final loss on the results);
    - `scripts/lib/deadline.mjs` bounds every probe (`tests/stage102-deadline.test.ts`, 5);
    - the final-loss failure didn't reproduce once the scenario was valid, so no runtime change.
  - **Before and after, locally** (`docs/evidence/stage102-repair-local/`):
    - the Spectrum driver with the pre-fix web build fails exactly the new checks (exit 1, 4 FAIL, still "Checking…"); the repaired build passes (144 PASS);
    - a late-reconnect mutation of the Jebena driver fails the window checks (exit 1, 3 FAIL).
  - **The report's screenshot links** (6830866760) are now plain paths. The posting path kept wrapping the URLs in backticks.
  - **Gates on `b8e75be`:**
    - targeted `20261112-182951-b8e75be6-3265` **PASSED** (7/7; Jebena 216, Spectrum 145);
    - fast `20261112-183218-b8e75be6-4560` **PASSED** (1,649 unit tests);
    - repair checkpoint full gate `20261112-183329-b8e75be6-7881` **PASSED** (exit 0, 88/88, 33 min 31 s).
  - **Next:** ChatGPT's verification of the repairs, then Stage 10.3. Nothing merged or deployed.

