# Christmas Game Night — local development

Local-only build. No deployment, no paid services, no GitHub publishing in this mode.

## Run

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev:demo
```

- `npm test` runs Vitest unit/integration tests for protocol, scoring, Math Mayhem, room engine, and projection leak checks.
- `npm run dev:demo` runs a synthetic 10-player Math Mayhem room through the room engine in-process, printing raw scores, normalised scores, and projection checks. This is a local engine demo, not a browser game and not a Cloudflare test.
- `apps/web/index.html` is the M0 static design shell only. It is not gameplay.

## What is actually built in M0

- `src/shared/protocol.ts` — Zod-validated intent/event schemas, sanitisation, join codes, recovery-token hashing.
- `src/scoring/championship.ts` — PROVISIONAL (not owner-approved) midrank normalisation, day score, best-five, tie-breaks, finale ladder (disabled by default).
- `src/games/` — game registry for all 11 launch games, plus a fully implemented Math Mayhem generator/scorer. Other games are registered with status `not-implemented` and are not claimed as playable.
- `src/server/room.ts` — authoritative in-process room engine: create/join, host/cohost, intents, deduplication, server deadlines, reconnect, per-player and TV projections, audit ledger.
- `tests/` — Vitest tests, including canary secret-leak checks.

## What is NOT tested yet

- Cloudflare Workers / Durable Objects / D1 behaviour: UNTESTED-CLOUD. The local engine is an adapter with the same event/projection semantics, not a Cloudflare proof.
- Real iPhone Safari, Android Chrome, desktop, and TV browsers: NOT RUN.
- React/Vite web app: NOT BUILT in M0. See `docs/PROGRESS.md` for the exact resume step.
