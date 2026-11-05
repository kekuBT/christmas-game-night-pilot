# Milestone J.1 — Shared Infrastructure Inspection

Inspection of the shared gameplay infrastructure, code-grounded with
file references. Three narrow fixes landed with this inspection (see
§11); everything else below is a verified finding, not a change. No
gameplay rule, scoring rule, deadline, or Family Cup rule was changed.
No identity or persistent-tournament feature was implemented (those
are J.2 contracts, per decisions A–F).

## 1. Shared lifecycle states — VERIFIED, one dead-state cleanup

- Real game lifecycle: `playing` → `finished`, with a `timedOut`
  flag for host-skipped games (`src/server/room.ts`: startGame sets
  `playing`, finish paths and `skipTimedOutGame` set `finished`).
  Single active game enforced (startGame rejects while one is
  playing). Games never auto-advance (M6 rule, preserved).
- Day lifecycle: `advanceDay` closes a day for future games (never
  rewrites past ones), refuses while a game is playing, caps at 7.
- **Dead states found and removed:** the `GameInstance` status union
  allowed `"lobby"` and `"revealed"`, but no code anywhere assigned
  either (games are created `playing`; only `finished` is ever
  assigned). The projections' `finished || revealed` conditions were
  dead branches, and the staged reveal (Milestone D) is client-side,
  not a server status — the dead value invited a future builder to
  mistake it for a real stage. Fix: union narrowed to
  `"playing" | "finished"` (server + web `GameStatus`), both
  projection conditions simplified to `finished`. Behavior-preserving
  by proof (no assignments, no tests reference the values, `fromJSON`
  restores games verbatim without status validation).

## 2. Host/cohost consistency — VERIFIED, one structural gap noted

- One predicate everywhere: `hostId === actorId ||
  cohosts.has(actorId)` guards all five privileged engine methods
  (grant cohost, start game, advance day, override score, skip
  timed-out game). Delegation works (a cohost may grant further
  cohosts); `hostId` never transfers, so the original host regains
  authority on reconnect.
- **Gap (not fixed — no bypass permitted):** if the host and all
  cohosts lose their tokens, the room is permanently operator-less
  (the host-claim token only works while `hostId === null`). Per
  decision A3, no hidden administrative bypass is introduced; a
  room-owner recovery mechanism is a separately reviewable proposal
  (J.2 contracts).

## 3. Transitions — VERIFIED

- `deriveShowPhase` (pure, unit-tested in `tests/m6-showmode.test.ts`):
  playing → intro (unless dismissed for that game) → gameplay /
  waiting (via `myProgressDone`) → results (finished, unless
  dismissed) → lobby. Waiting is a banner above the panel, not a
  replacement (L26); waiting counts are counts-only, never
  per-player answered identities (L27).
- TV entry works from the lobby and mid-game (Milestone C); the TV
  stage falls through to the old dashboard for non-Trivia games
  (L37 latest-game rule). Results dismissal is per game id.
- No transition defect found.

## 4. Error handling — VERIFIED (intentional shapes, not bugs)

- Intent rejections return HTTP 200 with structured reasons
  (`PHASE_CLOSED`, `NOT_IN_GAME`, `ALREADY_ABSTAINED`,
  `INVALID_PAYLOAD`) — intentional: dedupe replays return stored
  results, and game rules reject double effects as a second layer.
  Changing these to error statuses would break replay clients.
- Thrown engine errors → HTTP 400 `{error: message}`; unknown
  routes → 404; nudge rate limit → 429. WebSocket auth failures →
  close 1008 with a reason (room / spectator token / session token /
  host role / cohost role). The client surfaces errors via `setErr`
  in five views, including a specific spectator-session-expired
  message on 401.
- No error-handling defect found.

## 5. Reconnection — VERIFIED, one contract gap noted

- Two restore paths, both token-verified: explicit `/reconnect`
  (hash match required) and fresh WebSocket open (sets
  `connected = true` on open). Close marks disconnected only when
  no socket for that player/spectator remains, so a reload (new
  socket before old close) never drops a connected player.
  Snapshot restore marks everyone disconnected (L34, no phantoms).
  WS auto-reconnect exists client-side with no double-booked
  retries. Spectator reconnect uses the spectator token, disjoint
  from player tokens.
- Storage behavior unchanged (sessionStorage default, decision A5).
- **Gap (contract, not code — J.2):** concurrent sessions coexist;
  no supersede semantics exist yet (decision A4: a future recovery
  must invalidate the old credential atomically). J.1 does not
  implement supersede; it documents the current coexistence
  honestly.

## 6. Projections — VERIFIED, no leaks found

- TV: public only. Player (+actorId): `me` + `myGames` (own answers
  only, never others' answers or pre-reveal keys). Host/cohost: NO
  answer keys or recovery tokens pre-reveal either (only a
  `hostView` flag) — the host cannot peek. Spectator: exactly the
  public TV projection. Trivia `correctIndex` and aggregate
  `answerCounts` appear only post-finish; `rawScores` only for
  finished games. Tokens travel in WS subprotocol headers, never in
  URLs; snapshots store hashes only, never raw tokens, and hashes
  are never projected.
- No projection-boundary defect found.

## 7. Accessibility — VERIFIED, one real fix + one cleanup

- Baseline is strong: 83 `aria-*` usages, `:focus-visible` outlines,
  44px+ touch targets (chip buttons, 56px answer tiles, 48px
  reaction buttons), contrast 64/64, waiting counts-only.
- **Real fix — OS reduced-motion was ignored by the kit:** the
  in-app animation setting defaults to `full` from localStorage and
  never reads the OS preference, so `mzReducedMotion` was
  setting-only — while SettingsBar claims "Reduced motion in your
  device settings also reduces animations here." That claim was true
  for the old UI (CSS media query) and false for every Mchezo
  screen. Fix: new pure `resolveReducedMotion(anim, osReduced)` —
  the OS preference is a floor (OS-reduced ⇒ kit reduces even when
  the setting is `full`; the setting can only reduce further).
  Unit-tested (`tests/motion.test.ts`, 4 tests) and driver-verified
  end-to-end (`scripts/check-reduced-motion.mjs`: control arm shows
  the arrival animation under default emulation; reduced arm shows
  it never appears under reduced emulation). Behavior changes only
  for users with OS reduced-motion enabled — the exact users the
  claim addresses. No gameplay effect (animations only).
- **Cleanup — redundant CSS block removed:** `index.css` had two
  reduced-motion rules (line 25: full disable; lines 60–62: 150ms
  duration cap). Analysis: the pair is confusing but was
  functionally safe — `animation: none` sets `animation-name: none`
  and `transition: none` sets `transition-property: none`, and the
  later duration rules cannot resurrect a name/property of none —
  so reduced-motion users already got a full disable. Deleting the
  60–62 block is therefore a zero-behavior-change clarity cleanup
  (the `.anim-reduced` / `.anim-off` user-setting classes are
  untouched). After this fix the SettingsBar claim is true on both
  surfaces.

## 8. Mobile layout — VERIFIED

- Phone-first kit (max-width 480px), 320/360/390px viewports measured
  for the Studio with no horizontal overflow, mobile driver 32/32,
  old-UI 420px breakpoint intact. No mobile-layout defect found in
  shared infrastructure (per-game panels are J.3's slice).

## 9. TV behavior — VERIFIED

- Mchezo stage for finished/playing Trivia (reveal walk 4s/5s,
  DirectorBar tabs with `role="tab"`), old dashboard fallthrough
  otherwise, spectator counts from connected spectators only, TV
  subject = latest game overall. No TV-behavior defect found.

## 10. Test isolation — VERIFIED, one hygiene note

- Drivers are independent: each creates its own room; deterministic
  fixture seeds where behavior is pinned (leaderboard / TV-quality
  seed 1); rooms never leak across drivers (codes are random
  6-character; sequential runs).
- **Hygiene note (no action):** the shared dev server's `data/`
  holds 525 room files from driver/dev runs. It is git-ignored, so
  the tree stays clean, and it cannot affect tests (rooms are
  independent). A dev-only cleanup is possible but deleting a live
  server's snapshot dir is out of scope for J.1 and risks the
  running server's restart recovery — left alone deliberately.

## 11. Fixes landed with this inspection

1. Kit reduced-motion OS floor (`apps/web/src/ui/mchezo/lib/motion.ts`
   + `App.tsx` line 355) + unit tests + reduced-motion driver.
2. `index.css` redundant reduced-motion block deleted (zero
   behavior change, proven by shorthand analysis above).
3. Dead `"lobby"` / `"revealed"` game statuses removed (server
   union, web `GameStatus`, two projection conditions;
   behavior-preserving by proof above).

## 12. Explicitly not done in J.1

- No supersede implementation (J.2 contract). No host-assisted or
  room-owner recovery (J.2 proposals). No person records, no
  accounts, no persistent tournaments, no scoring change, no
  deadline/duration change (J.4), no all-games restyle (J.3 is one
  game). No GamePanel behavior change (closest-wins extraction is
  J.3, with before/after screenshots).
