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

## Milestone C — TV presentation + results (COMPLETE, local only)

- **C.2 design (decision L41):** movement is measured against the previous
  finished game of the same `gameId` in the room (`previousGameScores` in
  `apps/web/src/ui/mchezo/lib/standings.ts` — pure, test-covered). No such
  game means no movement at all: no arrows, no gain chips, no movement
  note. Same-type only (a Trivia score and a Math score are not
  comparable). Newly-entered players get no gain chip. Gains are
  sign-aware on both surfaces (`+N` / `−N`; the old `+{delta}` rendering
  would have printed "+-120" for a drop). The helper lives in
  standings.ts, not adapters.ts: adapters imports the `.tsx` component
  index for types, which breaks the root `tsc --noEmit` (no jsx) when a
  test imports it.
- **C.1 scenarios:** check-leaderboard gained a seeded distinct-scores
  game (seed 1, correct-answer counts [5,3,0,2] → options 0/1/2/3 score
  600/360/0/240, ranks 1/2/3/4, zero-point player included) and a movement
  game (same seed, Ada/Bea options swapped → Bea ▲1 +240, Ada ▼1 −240,
  phone gain chips +240/−240, movement note present; first game asserts
  no note). Screenshots `docs/mchezo-screenshots/10-tv-quality.png`
  (distinct scores + real movement + Away row in one frame) and
  `11-phone-results.png` (question/game separation + gain chips + TV
  stage button + collapsed "About these standings" disclosure), via new
  `scripts/screenshot-tv-quality.mjs`. All fixture data, labelled so.
- **C.3 Away indicators:** needed no new code — both surfaces already
  render them from `player.connection === "disconnected"` and the Phase
  2.1 driver already asserted them; coverage kept green.
- **C.4 phone results:** "This question:" and "Your game total:" lines
  stay visible; the standings footnote + picker guidance moved into an
  "About these standings" `<details>` (progressive disclosure).
- **C.5 TV entry:** new `scripts/check-tv-entry.mjs` (7/7): question
  screen → TV stage → back returns to the question screen with progress
  intact, game finishes with both players scored, results screen → TV
  stage → back returns to results. Entry is a pure client view switch
  (`setView("tv")`); no game state is touched, no restart possible.
- **Evidence:** typecheck exit 0, lint exit 0, build exit 0, **271 unit
  tests** (27 files; +4 `previousGameScores` tests). Drivers green after
  the C changes: check-mchezo, check-spectator, check-tv-spectator,
  check-tv-lifecycle, check-m6, check-leaderboard (all passed, incl. all
  new C scenarios), check-tv-entry (all passed).
- **BLOCKER (environment, not code):** after the check-m6 pass, the exec
  session was interrupted, and since then NO browser engine launches in
  this environment: Chromium headless shell dies SIGTRAP (exit 133) on
  any headless run with `mmap() failed: Operation not permitted` and a
  CFI abort in single-process mode; full Chrome binary same; Firefox
  SIGSEGVs at startup under Playwright. Direct binary runs, `--version`,
  and `ldd` are clean, so this is a sandbox/seccomp restriction that
  appeared with the interruption, not an app regression. The following
  regression drivers therefore did NOT re-run after the C changes
  (all were green at Milestone B): check-ws-reconnect, check-abstain,
  check-f4, check-multiplayer, check-mobile, check-contrast, e2e,
  check-f5. **Re-run them before treating Milestone C as fully
  regression-clean, as soon as browsers launch again.** The C surfaces
  they cover (results flows, mobile layout, contrast) are low-risk for
  these changes (one `<details>`, chip buttons, sign-aware gains), but
  that is an assessment, not evidence.

## Work completed

- Milestone A: baseline verified (see above). No code changes.
- Milestone B: true spectator mode (see above).
- Milestone C: TV presentation + results (see above).

## Local commits created (this assignment)

- `6f48f8f` Milestone A: verified Phase 2.1 baseline + autonomous development log.
- `5a80284` Milestone B: true server-side spectator mode.
- Milestone C: code complete and verified as far as the environment
  allowed (see the C section); local commit PENDING — `git` object
  writes fail with EPERM in the current sandbox, so the complete change
  sits uncommitted in the working tree. Commit it as soon as the
  sandbox recovers; nothing is lost, the tree is intact.

## Blockers

- **Browser engines cannot launch (environment, 2026-11-04 evening):**
  Chromium SIGTRAP / mmap EPERM / CFI abort, Firefox SIGSEGV — see the
  Milestone C blocker note. Outstanding drivers to re-run when browsers
  work again: check-ws-reconnect, check-abstain, check-f4,
  check-multiplayer, check-mobile, check-contrast, e2e, check-f5.

## Remaining authorized tasks (priority order)

1. D — Safe staged Trivia reveal (post-completion first).
2. E — Identity + persistence audit.
3. F — Game Manifest system (all 11 games).
4. G — Game Library + discovery.
5. H — Smart Shuffle / Smart Director engine.
6. I — Tournament Studio scheduling prototype.
7. J — Shared gameplay infrastructure + one incremental game modernization.
8. K — Reliability, accessibility, security hardening.

## Next recommended action

- First: re-check whether the environment blocker has cleared (git
  object writes + browser launches). If it has, commit Milestones C
  and E, re-run the outstanding drivers (ws-reconnect, abstain, f4,
  multiplayer, mobile, contrast, e2e, f5), then Milestone D.
- If still blocked, the next implementable work that needs no
  browser/git/test execution is Milestone F (Game Manifest types +
  docs); pure-engine milestones (F, H, I) can be written but not
  verified until the sandbox recovers — do not present them as
  verified until their tests actually run.

## Milestone E — Identity + persistence audit (COMPLETE as docs, local only, uncommitted)

- Deliverables: `docs/IDENTITY_AND_PERSISTENCE_AUDIT.md` (15 audit
  questions answered from the code, with file evidence) and
  `docs/PLAYER_HISTORY_ARCHITECTURE.md` (target schema, uniqueness,
  permissions, recovery, privacy, deletion, guest-to-account linking,
  incremental adoption in 5 phases).
- Headline finding: Mchezo has no player identity — only room-scoped
  slots (`player-N`) addressed by a bearer recovery token that lives
  in one tab's sessionStorage. All history (standings, championship,
  achievements) is derived at projection time from one room's games.
  Lost token / cleared storage / new device = lost player, orphaned
  slot, permanently reserved display name. No cross-room identity, no
  accounts, no teams entity, no event entity, no room expiry/deletion.
- Top risks in order: (1) lost-token player loss + name squatting,
  (2) torn snapshot on crash (non-atomic writes; corrupt room file is
  silently dropped at load), (3) no snapshot tamper evidence (plain
  JSON + self-consistent checksum), (4) derived achievements rewrite
  history on rule changes, (5) unbounded room accumulation,
  (6) championship is room-bound, (7) orphaned-slot name squatting.
- Already good, do not regress: token hygiene (hashes only, never in
  URLs, actor derived server-side), projection discipline
  (public/TV/player/host audiences, spectator disjointness), dedupe +
  ledger + audited overrides, careful snapshot migration defaults.
- Boundary compliance: no password auth proposed or implemented, no
  destructive migration, no scoring change, no parallel system
  created — the architecture doc is a proposal with an additive,
  backward-compatible adoption path; implementation needs review.
- Verification status: docs only, by design (the milestone's
  acceptance is the audit + plan). No unit tests apply to prose, but
  every factual claim cites the establishing file. NOT committed:
  git object writes are still blocked by the environment (EPERM), so
  these docs sit uncommitted in the working tree alongside Milestone C.

## Milestone D — safe staged Trivia reveal (2026-11-04 evening, local only)
- Ruling first: live per-question reveals ruled OUT (decision L42). The gap note's "all connected answered" rule plus host manual reveal would leak keys to a disconnected player who reconnects while answers are still accepted; host controls must not override the safety condition. No server change was made.
- Built: pure reveal-steps module (question/reveal pairs + standings finale; empty when unfinished; kind + index only, no answer data); phone sequence with question phases (no correct marking possible — AnswerGrid has no correctness display), reveal phases, standings finale, Next/Prev, 6s auto-play (memoised against poll re-renders), jumps, persistent Back to lobby; TV auto-director walk (4s question / 5s reveal per question, then leaderboard; manual jumps disable auto).
- Drivers: new check-reveal (all passed); leaderboard/abstain/mchezo/tv-lifecycle updated for the new results/TV defaults (same assertions, added tab/jump navigation). Full batch 16 drivers + E2E all green; typecheck/lint clean; 28 files / 281 tests.
- Limitation: reload-to-results round-trip not driver-verified; sequence rebuilds from the finished projection by construction.
- Next: Milestone F (Game Manifest system).

## Milestone F — Game Manifest system (2026-11-04 evening, local only)
- Added `src/games/manifest.ts`: Zod schema, 11 manifests, validation (shape + registry agreement + room rules + architecture facts + consistency). `getManifest` throws on unknown/invalid; `validateAllManifests` checks the whole set.
- Honesty core (L43): registry wins; durations are design defaults (measured: false); intensity unknown everywhere; TV dedicated only for Trivia; tournament verdicts deferred to I (structural facts only); deadline-vs-duration tension flagged for J/K, not hidden.
- Tests: `tests/manifest.test.ts` (22 tests). Full suite 29 files / 303 tests; typecheck/lint/build clean. Additive only — no registry, server, or UI change; no driver changes needed.
- Deliverable: `docs/GAME_MANIFEST.md` (field dictionary, at-a-glance table, honesty notes, validation rules, catalog-change procedure).
- Next: Milestone G (Game Library + discovery UI).

## Milestone G — Game Library + discovery UI (2026-11-04 evening, local only)
- Pure filter/sort module (`ui/mchezo/lib/library.ts`) + Circle-styled Library screen (`components/mchezo/MchezoLibrary.tsx`) + `library` view in App with a "Browse games" lobby button. Browse open to all; select host/cohost-only; start only from the lobby (no start button in the library); compact chooser untouched.
- Tests: `tests/library.test.ts` (14 tests). Driver `scripts/check-library.mjs` (17 checks). Full suite 30 files / 318 tests; typecheck/lint/build clean. Full batch 16 drivers + E2E green (mobile 32/32, contrast 64/64, E2E 12/12; log `~/workspace/gates-g-batch.log`).
- Recovery: runtime restart killed the 3461 server + first batch mid-run; server restarted + verified, batch re-run in full and tee'd to the log. Mobile screenshots restored before staging. GAME_MANIFEST.md header test count corrected 22 → 23.
- Next: Milestone H (Smart Shuffle / Smart Director engine).

## Milestone H — Smart Shuffle / Smart Director engine + restrained UI (2026-11-04 evening, local only)
- Pure engine (`src/games/shuffle.ts`): random/smart/tournament modes; hard filters (player count, exclusions, format incompatibility, play style) never overridden by scores; explicit no-eligible-games value; partial results; reason codes + deterministic explanations; seeded determinism via extracted `src/shared/rng.ts` (protocol re-exports it).
- Host-only UI: Surprise me + Smart shuffle buttons + result line in the Game setup card; connected-player count; room history as recency; Date.now() seed per click; result cleared on manual select/start. No new server endpoint.
- Tests: `tests/shuffle.test.ts` (19 tests incl. goldens). Driver `scripts/check-shuffle.mjs` (7 checks). Full suite 31 files / 337 tests; typecheck/lint/build clean. Batch 17 + E2E: all green except leaderboard's 1 transient fail on first run, clean on two consecutive re-runs (23/23) with no code change.
- Next: Milestone I (Tournament Studio prototype + architecture doc).

## ChatGPT Milestone I architecture review — checkpoint (2026-11-04 night, local only, uncommitted)
- Hold honored: I uncommitted, J not started. Deliverables: identity review doc (§1), format + lifecycle review doc (§2–§5), 4 differentiation tests (suite 356), one narrow preview correction (player-count line, studio 9/9).
- Verification: browser recovered after the 22:18 runtime restart (had SIGTRAP'd at 22:13); full batch 18 + E2E green, 0 FAIL; viewports 320/360/390 pass.
- Next: owner review of the 9-item checkpoint report; no commit, no J until approved.

## Milestone I — Tournament Studio scheduling prototype (2026-11-04 evening, local only)
- Pure engine + 6 presets reusing the H shuffle engine; host-only preview UI (no start/score/save); architecture doc + decision L46.
- Tests: 19 tournament tests (incl. 4 review-driven differentiation tests); driver check-studio 9 checks. Full suite 32 files / 356 tests; batch 18 + E2E green; viewports 320/360/390 pass.
- Approved for local commit 2026-11-04 night with both review docs, tests, and the player-count correction. Next: Milestone J under decisions A–F.

## Milestone J — catch-up (2026-11-04 night – 2026-11-05 night, local only)

The dev log was not updated during J; this entry consolidates it from
`docs/PROGRESS.md` and the commit chain.
- J.1 (`7864779`): shared-infrastructure inspection
  (`docs/J_INFRASTRUCTURE_INSPECTION.md`, 10 areas) + narrow fixes:
  OS reduced-motion floor for the kit (`lib/motion.ts`, driver
  check-reduced-motion), redundant `index.css` block deleted, dead
  statuses `"lobby"`/`"revealed"` removed. Full batch 19 + E2E green.
- Chaos slice (`4360775`): Chaos Night uniform-random scheduling
  distinction (approved; Gauntlet stays variety-weighted); preview
  only, no executable tournaments. Studio driver 13/13.
- J.2 (`a8b1fa0`): recovery + persistence contracts (docs only).
- J.3 (`44ddef3`): Closest Wins modernization — kit extraction +
  NumericGuess / AbstainControl / MchezoWaiting primitives +
  check-closest 16/16 + before/after screenshots. Batch2 11/12 with
  F4 solo re-run 11/11 (transient parallel-run failure). Chromium
  SIGTRAP recurred ~00:50 EST (environment, not the app); the batch
  was held per decision E until the runtime recovered.
- J.4 (`8f2e696`): deadline-vs-duration investigation (docs only) —
  the 5-minute hard submission cutoff vs 8–15-minute design durations;
  recommendation: measure first from the next real session's ledger,
  then decide between per-game measured deadlines and a universal
  extension.

## Milestone K — reliability, accessibility, security hardening (2026-11-05 night, local only, in progress)

- Audit doc `docs/K_HARDENING_AUDIT.md` (reliability, accessibility,
  security; known limitations incl. no room expiry, no supersede,
  no real-device verification, non-atomic snapshots).
- Fixes (uncommitted, awaiting the full-batch gate): replay returns
  the stored result byte-for-byte (the re-wrap dropped the rejection
  reason — found by the new test); `App.startGame` in-flight guard
  against double-tap; `host-claimed` ledger event for attribution.
- Tests: 2 replay tests + 1 host-claimed test (suite 369/369, 33 files).
- New drivers, all green standalone: check-restart 15/15,
  check-double-start 3/3, check-viewports 16/16.
- Full batch (23 drivers + E2E) running as the K gate; the K commit
  lands when it returns green. Do not rebuild the web bundle or edit
  web code while the batch is in flight.

## Overnight assignment — Work Package A: game duration and deadline review (2026-11-05, local only, docs only)

- `docs/GAME_DURATION_AND_DEADLINE_REVIEW.md`: the ten questions
  answered from code for all eleven games + a per-game table
  (deadline behavior, design duration, rounds/questions, completion,
  contradiction, recommended solution, rule-change needed).
- Question counts verified: trivia 10, math 10, closest 8, whosaid 8,
  geography 8, year 8, caption 3 rounds, sprint 3 rounds, charades 1
  rotation, connections 1 grid (4 groups), impostor 3 phases.
- Tournament warning: budget the 5-minute deadline per round, never
  the design duration. No timing change.

## Overnight assignment — Work Package B: Closest Wins UX audit + component inventory (2026-11-05, local only, docs only)

- `docs/GAMEPLAY_COMPONENT_INVENTORY.md`: two-button finding (the
  dial and the field hold independent values; unification into one
  value + one Submit labelled with the value is possible and planned),
  page cohesion (kit play + old intro/results; no Cup indicator in
  game views — ShowIntro/ShowResults migration is a separate visual
  review), and the reusable-vs-game-specific inventory.
- The two-button unification is a planned code fix: it waits for the
  K batch to land and the K commit to complete before the bundle is
  rebuilt (it changes `NumericGuess`, the check-closest driver, and
  the F5/e2e `actClosest` helper).
- Next: Work Package C (realistic game-night simulation), then the
  two-button fix, then Work Package D (Guess the Year modernization).
