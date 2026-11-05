# Milestone K — Hardening audit (reliability, accessibility, security)

**Scope: verification + narrow fixes. No gameplay rule changed.**
K is the hardening sweep for the Mchezo assignment: for each area below,
the current behavior was verified against code (and, where stated, by a
new or existing driver), a fix was made only for a demonstrated defect,
and the rest is recorded as verified, as a known limitation, or as a
decision for the owner. Emulation is not real-device verification: the
Chromium drivers below are not iPhone Safari, and real-device testing
remains outstanding (see §4).

## 1. Reliability

### Duplicate joins — verified OK
`join()` rejects a display name already in the room, case-insensitively,
and names are never freed (`src/server/room.ts:180–182`). The 10-player
cap is enforced at join. Verified in the B milestone and by the
multiplayer driver (12/12) in every batch since.

### Duplicate submissions / replay — verified, one bug found and fixed
`submitIntent` dedupes on `(roomId, actorId, clientEventId)` and stores
the outcome in `seenIntents` (`room.ts:344–390`), which is persisted in
the snapshot, so a replay after a restart also returns the original.
**Bug found by K's test:** the replay branch returned
`{ accepted: seen.accepted, result: seen.result }` — a re-wrapped copy.
A replayed rejection therefore carried no top-level `reason`, and the
client showed "Not accepted: unknown". Fixed in K (`room.ts:350–357`):
a replay returns the stored result directly, byte for byte.
**Test gap found:** the security test's name claimed "replay" coverage,
but its body never submitted the same `clientEventId` twice (and no test
anywhere referenced `seenIntents`). Fixed: two new tests in
`tests/security.test.ts` ("replaying the same intent returns the original
result without re-applying" — score applied once, `toEqual(first)`; and
the rejected-intent replay). The old test's name was corrected to stop
claiming replay coverage.

### Stale sessions — verified OK
`reconnect(playerId, recoveryToken)` throws "Unknown player slot" or
"Recovery token does not match" (`room.ts:203–211`); the HTTP handler
turns that into a 400, never a silent takeover. A room that no longer
exists answers 404. Session tokens live in sessionStorage and are
verified by hash on every use; there is no "remember me" that could
resurrect a stale session (decision A5, J.2 contract).

### Host-action races — verified, one fix
The engine is single-threaded and its privileged methods are
synchronous: `startGame` checks "a game is already playing" and creates
the game in the same synchronous call (`room.ts:280–288`), so two
concurrent start requests cannot both succeed — the second is rejected.
The client, however, had no guard: a double-tap on Start posted twice
and the rejection surfaced as a spurious error to the host. Fixed in K:
`App.tsx` `startGame` now ignores a second call while one is in flight
(`startingRef`), a 3-line client guard; the server stays the authority.
Verified by the new driver `scripts/check-double-start.mjs` (3/3): the
double-click sends exactly one start POST and the projection holds
exactly one game.

### Reconnect races — known limitation, no change
Two tabs holding the same token coexist (J.1 finding): a WS close marks
a player disconnected only when no socket for them remains, and either
tab can act. Supersede semantics (one session replacing another, A4)
are defined in the J.2 recovery contract and are NOT implemented.
This is a documented limitation, not a K defect: with family devices
it is a minor confusion risk, not a correctness or security hole
(either tab holds the same credential). No change in K.

### Spectator / player confusion — verified OK
Spectators live in their own map, disjoint from players (Milestone B,
decision L40): never a seat, never toward the 10-player cap, never in a
game's player list, never blocking completion, never scored, never in
standings. Token disjointness both ways (spectator token → 401 on
player endpoints; player token → 401 on spectator projection). Verified
by `tests/spectator.test.ts` (7/7) and the spectator + tv-spectator
drivers in every batch.

### Server restarts — verified (new driver)
`scripts/check-restart.mjs` (15/15) spawns a real server on a spare
port, creates a room, joins two players, starts a Closest game, has the
guest guess, kills the server, restarts it, and verifies: the projection
still answers (the token survived in the snapshot); the game is still
playing; all players are marked disconnected (snapshot restore does
this deliberately, `http.ts:143–150`, so no phantom players); the
guest's guess survived; reconnect with the original token works; a bad
recovery token is still rejected (400). The driver deletes only its own
room files afterwards. Restart survival was previously untested; it is
now a committed regression test.

### Room expiration — none exists (decision needed)
There is no room deletion, expiry, or TTL anywhere (E audit, risk #5).
The dev server's `data/` directory holds 525 room files from driver
and dev runs — git-ignored, harmless to tests, but unbounded. K does
NOT implement deletion: deleting rooms is destructive (hard gate) and
an expiry policy (how long a room lives, who is warned, what happens
to its ledger) is a product decision. Proposed for a checkpoint: a
time-based expiry (e.g. rooms untouched for 90 days) with the ledger
archived, not silently deleted. Until then, the accumulation is
documented and accepted.

### Event attribution — verified, one gap fixed
Every privileged action logs a ledger event with its actor:
`player-joined`, `player-reconnected`, `spectator-joined`,
`cohost-granted`, `game-started`, `day-advanced`, `score-override`
(with previous points), `game-timed-out`, `player-abstained`,
`game-finished`, `score-awarded` (`room.ts`, `this.log` calls).
**Gap found by K:** claiming the host role left no distinct audit
event — the join logged only `player-joined`, so the ledger could not
answer "who claimed the host role, and when?" Fixed in K: `join()`
now also logs `host-claimed` (with the player id) whenever a join
establishes the host (`room.ts:199–203`), pinned by a test in
`tests/room.test.ts` (guest joins log no second event).

## 2. Accessibility

- **Viewports (new driver):** `scripts/check-viewports.mjs` (16/16) —
  no horizontal overflow at 320/360/390/768/1024 for the lobby, Trivia
  play, and Closest play; TV stage at 1280×720 and 1920×1080; TV
  dashboard at 1920×1080. The kit is phone-first (480px max, centered);
  the larger widths check that it centers instead of overflowing.
- **Reduced motion:** fixed in J.1 (OS preference is a floor;
  `tests/motion.test.ts` + `check-reduced-motion` driver).
- **Contrast:** 64/64 in the contrast driver, three consecutive runs
  (Phase 2.1, after the L39 fix).
- **Targets and focus:** 44px+ touch targets, `:focus-visible` outlines,
  83 `aria-*` usages (J.1 inspection).
- **Outstanding:** real iPhone Safari (and desktop Safari, TV, and
  Android) verification has never been done — Chromium emulation only.
  The viewport driver narrows the gap; it does not close it.

## 3. Security

- **Role authorization — verified OK.** One predicate
  (`hostId === actorId || cohosts.has(actorId)`) at all five privileged
  sites: grant, start, advance, override, skip (J.1). Host/cohost
  projections return 403 to anyone else (`http.ts:339–345`).
- **Hidden-answer leakage — verified OK.** The public projection never
  carries answers while a game is playing: Trivia's `correctIndex` is
  added only when finished (`room.ts:956–960`); Closest's `myGuess`
  is per-actor (the public projection's actor is `""`, so no guess is
  exposed) and its answer/guesses appear only when finished; the
  public Closest state carries the prompt (public by design — everyone
  plays the same question) and no player's guess. Spectators get the
  public TV projection only.
- **Spectator boundaries — verified OK** (see §1).
- **Token exposure — verified OK.** Tokens travel in WS subprotocol
  headers (`cgn-session-<token>`), never in URLs (J.1); snapshots
  store only hashes; projections carry no tokens; the recovery token
  is returned once at join.
- **Rate limits — verified OK.** Join attempts are rate-limited
  (`checkJoinRate`, 429 "Too many join attempts"); nudges are
  rate-limited (429); the intent dedupe bounds replay damage.
- **Replayed actions — verified OK** (see §1; the one shape bug fixed).

## 4. Known limitations and decisions needed

1. **Room expiry policy** — none exists (§1). Needs an owner decision
   before any implementation (destructive).
2. **Concurrent-session supersede** — defined in the J.2 recovery
   contract (A4), not implemented. Decide whether to implement it
   (it changes reconnect behavior) or accept coexistence.
3. **Real-device verification** — iPhone Safari, desktop Safari, TV,
   Android: never done. The viewport driver is emulation; a family
   acceptance test on real phones is still the open item from F6.
4. **`seenIntents` is unbounded** — every intent's outcome is kept for
   the room's life (needed for replay-after-restart). No pruning exists;
   for family-sized rooms this is negligible, but it is a growth vector
   if rooms ever get long-lived or high-volume.
5. **Snapshot writes are non-atomic** — the persistence contract (J.2)
   defines atomic writes + checksums + a previous-good backup, but
   none of it is implemented. A crash mid-write can still tear a
   snapshot. That contract is the prerequisite for executable
   persistent tournaments (A7) and remains unimplemented by design.

## 5. What K changed

- `src/server/room.ts` — replay returns the stored result directly
  (dedupe shape fix); `join()` logs `host-claimed`.
- `apps/web/src/App.tsx` — `startGame` in-flight guard.
- `tests/security.test.ts` — two replay tests; old test name corrected.
- `tests/room.test.ts` — host-claimed attribution test.
- `scripts/check-restart.mjs`, `scripts/check-viewports.mjs`,
  `scripts/check-double-start.mjs` (+ `package.json` scripts).
- This document.

## 6. Verification at the K gate

- Unit suite: **33 files / 369 tests, all passing** (was 366; +2 replay,
  +1 host-claimed).
- Typecheck (root + web) and lint: clean. Build: clean.
- New drivers: check-restart 15/15, check-double-start 3/3,
  check-viewports 16/16.
- Full driver batch (22 drivers + E2E): result recorded in
  `docs/PROGRESS.md` at the K commit (the gate for this milestone).
