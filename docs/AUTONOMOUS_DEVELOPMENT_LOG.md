# Mchezo — Autonomous Development Log

Persistent record for the post–Phase 2.1 autonomous assignment
(Stability, Spectator Mode, Trivia Presentation, Game Discovery,
Smart Director, Tournament Foundations). Updated at every meaningful
checkpoint so a later session can resume without re-deriving state.

Local only. Nothing here authorizes a push, merge, deploy, publish,
spend, or any GitHub action. Budget: $0 new spending. No runtime AI.

## Baseline — Milestone A (2026-11-04, verified in-session)

- Starting commit: `7dd7a25` ("Mchezo Phase 2.1: lobby simplification,
  results clarity, TV lifecycle, spectator + leaderboard investigation")
- Branch: `master` (local). Working tree: CLEAN at baseline.
- HEAD history: `7dd7a25` ← `9a35fa0` (cron E2E smoke + L36 docs) ←
  `96554ea` (deadline/timeout) ← `15d226d` (Phase 2 Circle checkpoint).
- Baseline gates, all executed this session on the clean tree:
  - `npm run typecheck` — exit 0 (server + web)
  - `npm run lint` — exit 0
  - `npm test` — 26 files / 260 passed
  - `npm run build:web` — exit 0
- Baseline failures: NONE. Outstanding (not run in this session, known
  from earlier checkpoints): real-device iPhone Safari check, WebKit
  Playwright (blocked on missing host libraries), `npm audit`
  (blocked by registry proxy 403), Cloudflare (untested/unprovisioned),
  real-phone QR/LAN test, Firefox E2E re-run.
- Phase 2.1 gaps carried in (from its checkpoint report):
  - No true server-side spectator role; TV viewing occupies a player seat.
  - Trivia lacks staged per-question presentation/reveals.
  - TV rank-movement indicators degenerate (delta = score wiring).
  - Results rows lack Away/offline markers.
  - TV entry primarily from the lobby.
  - Ten games still on the previous visual design.
  - Identity persistence / lifetime tracking unaudited.

## Milestone B — True spectator mode (COMPLETE, local only)

- Server role: spectators live in their own `spectators` map on
  `RoomEngine` (`src/server/room.ts`), addressed by a dedicated token
  (hash stored, raw token returned once) disjoint from player session
  tokens in both directions. Spectators never enter `players`, so seat
  cap, game membership, completion, standings, and attendance ignore
  them by construction. Presence via spectator WebSocket sockets
  (`cgn-spectator-<token>` subprotocol, empty actorId so intents are
  rejected SESSION_REQUIRED); `spectatorCount` (connected only) in
  every projection. Snapshot restore marks spectators disconnected;
  old snapshots migrate to zero spectators. Legacy unauthenticated
  `audience=tv` path unchanged (same safe projection, uncounted).
- HTTP (`src/server/http.ts`): `POST /rooms/spectate-by-code`
  (code-gated, rate-limited, no player created);
  `GET /rooms/:id/projection?audience=spectator` (spectator token
  required; player tokens rejected); spectator WS audience.
- Client: landing "Watch as spectator — no seat needed" (code only);
  spectator tabs render TV only (Mchezo stage or dashboard) with Stop
  watching, no lobby/reactions/game controls; `spectatorCount` shown
  as "N watching" on TV; a tab holding both sessions shows the player
  view. Files: `apps/web/src/App.tsx`, `.../MchezoTv.tsx`,
  `.../ui/mchezo/components/phone/screens.tsx`, `apps/web/src/types.ts`.
- Decision L40 in `docs/DECISIONS.md`.
- Evidence: `tests/spectator.test.ts` 7/7 (engine + HTTP + WS);
  `scripts/check-spectator.mjs` ALL PASSED (seat-free, full-room
  admission, mid-game join, refresh, disconnect count, second-tab
  player TV, stop watching); screenshot
  `docs/mchezo-screenshots/09-spectator-dashboard.png`.
- Driver fix during gates (not an app bug): `check-leaderboard`
  pair-ties scenario was seed-flaky — a 5/5 correct-answer split ties
  all four players. Game 2 now starts via API with seed 1 (verified
  5/3 split in `generateTrivia`), other games still start from the UI.
  After the fix: 5 consecutive sequential passes; one earlier failure
  occurred while e2e/f5 browsers ran concurrently and did not
  reproduce sequentially — recorded, not hidden.
- Full gates on this tree: typecheck exit 0, lint exit 0, 27 files /
  267 tests, build exit 0; drivers mchezo, spectator, tv-spectator,
  tv-lifecycle, m6, ws-reconnect, abstain, f4 11/11, multiplayer
  12/12, mobile 32/32, contrast 64/64, leaderboard, e2e 12/12,
  f5 30/30 — all green.

## Milestone C — TV presentation + results (IN PROGRESS)

## Work completed

- Milestone A: baseline verified (see above). No code changes.
- Milestone B: true spectator mode (see above).

## Local commits created (this assignment)

- `6f48f8f` Milestone A: verified Phase 2.1 baseline + autonomous development log.

## Blockers

- (none yet)

## Remaining authorized tasks (priority order)

1. B — Spectator mode (in progress).
2. C — TV presentation + results quality.
3. D — Safe staged Trivia reveal (post-completion first).
4. E — Identity + persistence audit.
5. F — Game Manifest system (all 11 games).
6. G — Game Library + discovery.
7. H — Smart Shuffle / Smart Director engine.
8. I — Tournament Studio scheduling prototype.
9. J — Shared gameplay infrastructure + one incremental game modernization.
10. K — Reliability, accessibility, security hardening.

## Next recommended action

- Finish Milestone C: TV leaderboard quality (realistic nonzero
  scenarios), rank-movement wiring, Away indicators on results, phone
  results organization, and TV entry during an active game — then
  commit and continue to Milestone D.
