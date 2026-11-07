#!/usr/bin/env node
// RETIRED 2026-11-07. This is a tombstone, not a check: it always exits 2.
//
// scripts/clickthrough-api.mjs was a manual API playthrough written on
// 2026-11-04 as a fallback when the browser click-through could not run. It
// was never part of the regression gate, and it stopped matching the rules
// (Impostor and Charades became practice-only, Caption Clash votes became
// anonymous, Category Sprint official play became closed-set only), so it
// failed every game after the first error. Even when it "passed", only
// "every game finished" decided its exit code; its TV, tile-leak, ledger and
// memory lines were printed, never asserted.
//
// Everything it exercised is covered by the gate (npm run gate:full):
//   every game to finished, through the real client .... e2e-chromium (--games=all), check-mchezo, per-game check-* drivers
//   TV projection and scores ........................... check-tv-spectator, check-spectator, check-tv-lifecycle
//   no group/category leak on playing Connections tiles . tests/spectator.test.ts, tests/room.test.ts
//   ledger game-finished events ........................ tests/sprint-http.test.ts, tests/m4.test.ts
//   Memory Book add/approve/export ..................... tests/m4.test.ts, tests/persistence.test.ts
//   reconnect with a recovery token .................... check-recovery, check-ws-reconnect
// See docs/TESTING.md ("Scripts that are not checks"). The last working version
// is in git history (git show 7af2285:scripts/clickthrough-api.mjs).
console.error("scripts/clickthrough-api.mjs is RETIRED and checks nothing. Run `npm run gate` or `npm run gate:full` (docs/TESTING.md).");
process.exit(2);
