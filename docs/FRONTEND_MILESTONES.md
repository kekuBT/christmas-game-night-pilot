# Frontend, Integration, E2E, Mobile, and Release Milestones

**Revision, 2026-11-03:** M0–M5 are backend/engine checkpoints only. They are NOT evidence that the full product is finished. A milestone below is DONE only when its measurable acceptance test passes, with evidence in `docs/PROGRESS.md`.

## F1 — Browser app shell (React)
- Acceptance: A browser at `/` shows landing, create-room, join-by-code, lobby with roster, and host controls, without developer tools.
- Test: `npm run build:web` exit 0; manual browser smoke: create room, join as second player in a second tab, see both names in lobby.
- Status: DONE 2026-11-04 — Playwright E2E (`scripts/e2e-browser.mjs`) creates rooms, joins 3 players by code, and verifies the 4-player lobby roster in Chromium and Firefox, 12/12 each (see `docs/PROGRESS.md` cron run ~01:14 EST).

## F2 — All 11 games playable in browser
- Acceptance: For each of the 11 games, a player can start it from the lobby, complete a full round/match through the browser UI, and see correct raw scores at finish, via the real LocalServer API/WebSocket (no mock scores).
- Games: Impostor, Caption Clash, Trivia, Word Connections, Who Said That, Guess the Year, Closest Wins, Category Sprint, Charades, Geography, Math Mayhem.
- Test: Per-game browser flows in `apps/web` manual checklist + engine tests (already passing for all 11 at API level). Browser-level per-game test is NOT yet automated — record as such until Playwright covers it.
- Status: DONE 2026-11-04 — Playwright E2E plays all 11 games to "Status: finished" via real UI clicks in Chromium and Firefox, 12/12 each (see `docs/PROGRESS.md` cron run ~01:14 EST). WebKit remains BLOCKED on host libraries; real devices NOT RUN.

## F3 — Multiplayer, reconnect, and projections in browser
- Acceptance: 2+ browser tabs as different players can play the same game simultaneously; a tab reload with its recovery token restores the same player slot; TV view (audience=tv) shows only public state, never answer keys, roles, or prompts for other players.
- Test: Multi-tab manual test + existing HTTP/WebSocket integration tests (10 players, dedupe, restart).
- Status: DONE 2026-11-04 — `scripts/check-multiplayer.mjs` (`npm run check-multiplayer`) 12/12 in Chromium: simultaneous same-panel play on 4 pages, mid-game reload returns to the same slot with no duplicate and roster still 4, TV projection leak-free while games are playing (Math Mayhem + Impostor), plus a WS connected-tracking fix (decision L09) and a new integration test. See `docs/PROGRESS.md` cron run ~02:45 EST.

## F4 — Championship, TV Dashboard, and Memory Book in browser
- Acceptance: Championship standings computed from finished games are visible with day/game breakdown; TV Dashboard shows standings, roster, recent games, and join code; Memory Book shows approved entries only and revoked entries disappear from export.
- Test: Browser checklist + existing ledger/Memory Book unit tests.
- Status: DONE 2026-11-04 — `scripts/check-f4.mjs` (`npm run check-f4`) 11/11 in Chromium: 4-player room, Math Mayhem to finished, championship standings + per-game breakdown, TV Dashboard (code/roster/standings/recent games), Memory Book add → approve → export contains entry → revoke → fresh export no longer contains it (entry stays listed as pending). See `docs/PROGRESS.md` cron run ~03:00 EST. Note: the first two F4 runs exposed a driver pitfall, not an app bug (see PROGRESS); the E2E views check had the same pitfall and was fixed in the same run, so its approve→export assertion now genuinely proves approval.

## F5 — Integration and end-to-end
- Acceptance: A full 7-day seeded run through the API produces accurate standings and a factual Memory Book export; a full day playlist through the browser (host + 3 players) completes without a stuck game or secret leak.
- Test: Championship worked-example tests (passing) + a browser E2E script when Playwright is added. Playwright E2E is NOT RUN yet.
- Status: DONE 2026-11-04 — `scripts/check-f5.mjs` (`npm run check-f5`) 30/30 in Chromium: host + 3 players play all 11 games in registry order to finished in one room, TV projection leak-free while each game is playing, 11/11 game-finished events in the ledger, TV projection marks all 11 finished, championship standings + breakdown, TV Dashboard recent 5, Memory Book add/approve/export from the full day. The 7-day API half is covered by the passing championship/scoring unit tests. See `docs/PROGRESS.md` cron run ~03:30 EST. First run was 27/29 with two check-design flaws, not app bugs: the ledger scan looked for registry ids (ledger uses gameInstanceIds, and Math Mayhem scores per-question reasons) and the TV check expected all 11 games on a Dashboard that by design shows the recent 5.

## F6 — Mobile and accessibility
- Acceptance: Phone layout at 320px, 375px, and 390px portrait with no horizontal scroll, touch targets >=44px, visible focus, keyboard navigation for join/lobby/game selection, reduced-motion parity, and readable contrast for the Midnight Christmas palette.
- Test: Viewport checklist with screenshots. Real iPhone Safari is NOT RUN until a real device is available; WebKit is not a substitute.
- Status: PARTLY DONE 2026-11-04 — `scripts/check-mobile.mjs` 32/32 via Chromium emulation (no overflow, >=44px targets, visible focus, reduced motion); `scripts/check-contrast.mjs` 57/57 unique colour pairs pass WCAG AA (see cron run 2026-11-04 ~04:45 EST). Real-device confirmation still OPEN; F6 is NOT formally closed until a real device runs.

## F7 — Release readiness
- Acceptance: Clean install + typecheck + tests + web build all pass from a clean checkout; `docs/SECURITY_AUDIT.md` is updated with the final test matrix; every NOT RUN item is listed explicitly; no merge, deploy, spend, or publish has happened without owner approval.
- Test: `npm install && npm run typecheck && npm test && npm run build && npm run build:web` — all exit 0.
- Status: DONE 2026-11-04 — fresh-clone clean install (107 packages, Node v24.22.1) with typecheck, 8 files / 48 tests, server build, and web build (34 modules) ALL exit 0; `docs/SECURITY_AUDIT.md` updated with the final test matrix and an explicit NOT RUN list. Remaining open items are NOT part of F7's gate but block a finished-product claim: manual real-device checklist, family-member acceptance test, WebKit, npm audit, ESLint, Cloudflare (see SECURITY_AUDIT.md).

## Final acceptance criteria (owner, family-member test)
A family member, with no developer tools and no developer in the room, must be able to:
1. Open a browser, create or join a room by code/QR, and set a name.
2. Play every one of the 11 games to completion.
3. See correct results and understand why points were given.
4. Disconnect (close/reload) and reconnect to the same slot without losing results or seeing other players' secrets.
5. Navigate the whole Christmas experience: lobby, games, championship, TV Dashboard, and Memory Book.

If any step above fails in a browser, the product is NOT finished, even if all backend tests pass.
