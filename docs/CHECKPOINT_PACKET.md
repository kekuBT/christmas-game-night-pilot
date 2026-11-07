# PR-Ready Checkpoint Packet — Christmas Game Night (LOCAL ONLY)

> **DO NOT PUBLISH.** This packet is prepared locally so a draft PR can be
> assembled in one step when Keku explicitly asks for a GitHub review/publishing
> session. Per local-only mode (decision L02): no GitHub publish, no merge, no
> deploy, no spend, no approval requests are initiated from this packet.
> All test data below is fictional/synthetic; no real family photos or quotes.

Prepared: 2026-11-04 ~01:20 EST, local run of `local-dev-christmas-30m`.
Head commit at packet time: `2ce52cb` + this packet (see git log).

## Summary (for a future draft PR description)

A local multiplayer "Christmas Game Night / The Family Cup" app: a React
browser client (`apps/web/`, Vite 5) served by a TypeScript + Zod server
(`src/server/`) with an in-process room engine, WebSocket projections, and
JSON snapshot persistence. All 11 games are implemented and playable through
the real browser UI: Impostor, Caption Clash, Trivia Showdown, Word
Connections, Who Said That?, Guess the Year, Closest Wins, Category Sprint,
Charades, Geography Challenge (6 modes), and Math Mayhem — plus championship
standings, a public-only TV Dashboard, and an event-grounded Memory Book
(add/approve/revoke/export). Host can grant a cohost; players can reconnect
by token. Official and practice modes; one game at a time (decision L08).

## Evidence (all run locally, 2026-11-04)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Unit tests | `npm test` | 8 files, 47 passed, 0 failed |
| Web build | `npm run build:web` | exit 0 (Vite, 34 modules) |
| API playthrough (**retired 2026-11-07**; see docs/TESTING.md) | `node scripts/clickthrough-api.mjs http://localhost:3457` | ALL GAMES FINISHED, 11 game-finished events, no Connections category leak (re-run 2026-11-04) |
| Real-browser E2E | `node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium` | 12/12 passed (11 games + championship/TV/Memory Book/reconnect views), 4-player room, real UI clicks only |
| Real-browser E2E | same, `--browser=firefox` | 12/12 passed |
| Checkpoint screenshots | `node scripts/screenshot-checkpoint.mjs http://localhost:3457` | 7 PNGs in `docs/checkpoint-screenshots/` (home, lobby, game playing, game finished, championship, TV dashboard, Memory Book) |

Screenshots (fictional players Alex/Sam/Jo/Kim only):
- `01-home.png` — landing / create-or-join
- `02-lobby-4-players.png` — 4-player roster, host + cohost controls, all 11 game cards
- `03-math-mayhem-playing.png` — active game panel
- `04-math-mayhem-finished.png` — finished scores reveal
- `05-championship.png` — championship standings (provisional midrank formula)
- `06-tv-dashboard.png` — public-only TV view
- `07-memory-book.png` — Memory Book add/approve/export

## What changed most recently (commits)

- `2ce52cb` — F2: Playwright E2E (Chromium/Firefox 12/12); fixed Who Said
  That? browser bug (player projection dropped `speakers`, so no answer
  buttons rendered) and added the one-game-at-a-time guard in `startGame`.
- `ab3341c` — F1: API playthrough of all 11 games; fixed Connections tiles
  rendering as raw ids and a category leak in the tile projection.
- `b70e57a` — F1: React browser app + LocalServer static serving + Memory
  Book endpoints.

## Limitations — do not overclaim

- **WebKit BLOCKED:** Playwright WebKit binaries download, but launch fails
  on this VM (missing host libs: libgstreamer-1.0, libgtk-4, libgraphene,
  libevent, gstreamer plugins). No system-package install attempted — outside
  local-only scope. Desktop Safari and iPhone Safari are therefore NOT
  verified.
- **Real devices NOT RUN:** iPhone Safari, Android, desktop Safari, and a TV
  display have not been tested. The manual real-device checklist below is
  still open.
- **Cloud UNTESTED:** Cloudflare behaviour is UNTESTED-CLOUD by design; no
  provisioning, billing, or deployment has been done (decision L03).
- **Provisional rules:** championship formula (midrank, decision L06),
  Geography modes, Finale ladder (disabled by default), host recovery, AI,
  and photo policy remain provisional / open-owner — see `docs/DECISIONS.md`.
- **npm audit NOT RUN:** registry proxy returned 403 policy_denied earlier;
  no bypass attempted.
- **ESLint NOT CONFIGURED.**
- **No dealer contact, no GitHub publish, no merge/deploy/spend** in any
  local run. GitHub coordination cron `hourly-github-coordination-christmas-pilot`
  remains DISABLED and untouched.

## Manual real-device checklist (OPEN — needs a real device in hand)

1. iPhone Safari: create room, join by code, play one quiz game + one
   text-input game, check 44px targets, reduced-motion, reconnect after
   closing the tab.
2. Android (Chrome): same smoke pass.
3. Desktop Safari (macOS): same smoke pass, if available.
4. TV display: open the TV Dashboard URL on a large screen; confirm
   public-only projection (no roles, keys, or tokens visible).
5. Record device, browser version, and any failure verbatim in
   `docs/PROGRESS.md` before claiming F6.

## Open owner decisions (from docs/DECISIONS.md)

- Championship formula approval (L06 provisional midrank).
- Concurrent games vs one-game-at-a-time: guard is reversible; a game
  switcher UI is the deferred alternative (L08).
- Geography modes, Finale, host recovery, AI features, photo policy.
- Whether/when to open the GitHub review/publishing session this packet
  is prepared for.

## How to reproduce locally

```sh
npm run typecheck && npm test && npm run build:web
PORT=3457 npm run serve &   # stop it and `rm -rf data` afterwards
node scripts/e2e-browser.mjs http://localhost:3457 --browser=chromium
node scripts/screenshot-checkpoint.mjs http://localhost:3457
```

## Next action

Run the manual real-device checklist above (needs real devices — cannot be
done from this VM), then continue F3–F7 per `docs/FRONTEND_MILESTONES.md`.
Do NOT re-request GitHub publishing; wait for Keku to explicitly ask.
