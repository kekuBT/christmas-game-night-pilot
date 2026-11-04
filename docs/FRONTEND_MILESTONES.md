# Frontend, Integration, E2E, Mobile, and Release Milestones

**Revision, 2026-11-03:** M0–M5 are backend/engine checkpoints only. They are NOT evidence that the full product is finished. A milestone below is DONE only when its measurable acceptance test passes, with evidence in `docs/PROGRESS.md`.

## F1 — Browser app shell (React)
- Acceptance: A browser at `/` shows landing, create-room, join-by-code, lobby with roster, and host controls, without developer tools.
- Test: `npm run build:web` exit 0; manual browser smoke: create room, join as second player in a second tab, see both names in lobby.
- Status: IN PROGRESS in this session.

## F2 — All 11 games playable in browser
- Acceptance: For each of the 11 games, a player can start it from the lobby, complete a full round/match through the browser UI, and see correct raw scores at finish, via the real LocalServer API/WebSocket (no mock scores).
- Games: Impostor, Caption Clash, Trivia, Word Connections, Who Said That, Guess the Year, Closest Wins, Category Sprint, Charades, Geography, Math Mayhem.
- Test: Per-game browser flows in `apps/web` manual checklist + engine tests (already passing for all 11 at API level). Browser-level per-game test is NOT yet automated — record as such until Playwright covers it.

## F3 — Multiplayer, reconnect, and projections in browser
- Acceptance: 2+ browser tabs as different players can play the same game simultaneously; a tab reload with its recovery token restores the same player slot; TV view (audience=tv) shows only public state, never answer keys, roles, or prompts for other players.
- Test: Multi-tab manual test + existing HTTP/WebSocket integration tests (10 players, dedupe, restart).

## F4 — Championship, TV Dashboard, and Memory Book in browser
- Acceptance: Championship standings computed from finished games are visible with day/game breakdown; TV Dashboard shows standings, roster, recent games, and join code; Memory Book shows approved entries only and revoked entries disappear from export.
- Test: Browser checklist + existing ledger/Memory Book unit tests.

## F5 — Integration and end-to-end
- Acceptance: A full 7-day seeded run through the API produces accurate standings and a factual Memory Book export; a full day playlist through the browser (host + 3 players) completes without a stuck game or secret leak.
- Test: Championship worked-example tests (passing) + a browser E2E script when Playwright is added. Playwright E2E is NOT RUN yet.

## F6 — Mobile and accessibility
- Acceptance: Phone layout at 320px, 375px, and 390px portrait with no horizontal scroll, touch targets >=44px, visible focus, keyboard navigation for join/lobby/game selection, reduced-motion parity, and readable contrast for the Midnight Christmas palette.
- Test: Viewport checklist with screenshots. Real iPhone Safari is NOT RUN until a real device is available; WebKit is not a substitute.

## F7 — Release readiness
- Acceptance: Clean install + typecheck + tests + web build all pass from a clean checkout; `docs/SECURITY_AUDIT.md` is updated with the final test matrix; every NOT RUN item is listed explicitly; no merge, deploy, spend, or publish has happened without owner approval.
- Test: `npm install && npm run typecheck && npm test && npm run build && npm run build:web` — all exit 0.

## Final acceptance criteria (owner, family-member test)
A family member, with no developer tools and no developer in the room, must be able to:
1. Open a browser, create or join a room by code/QR, and set a name.
2. Play every one of the 11 games to completion.
3. See correct results and understand why points were given.
4. Disconnect (close/reload) and reconnect to the same slot without losing results or seeing other players' secrets.
5. Navigate the whole Christmas experience: lobby, games, championship, TV Dashboard, and Memory Book.

If any step above fails in a browser, the product is NOT finished, even if all backend tests pass.
