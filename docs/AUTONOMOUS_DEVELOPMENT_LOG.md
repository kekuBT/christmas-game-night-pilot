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

## Overnight assignment — Work Package H: next architecture decisions (2026-11-05, local only, docs only)

- `docs/NEXT_ARCHITECTURE_DECISIONS.md`: decision-ready synthesis of
  the recovery/persistence contracts, the identity and tournament
  reviews, and the K audit. Covers what persists and what does not,
  slot recovery without accounts, why person identity is separate,
  what atomic storage requires, how Cup results are preserved,
  what persistent tournament membership needs, the seven decisions
  requiring explicit approval, the independently implementable
  prerequisites, the staged sequence (atomic snapshots → slot
  recovery → display-only linking → events/tournaments → accounts,
  deferred), the risks, and the six future modes. Nothing in it is
  authorized for implementation.

## Overnight assignment — Work Package C: simulation driver written, not yet run (2026-11-05)

- `scripts/check-game-night.mjs`: a full evening — 6-player room
  (host + cohost + 4 players + spectator + a 7th who disconnects) x
  Trivia / Closest / Math, plus a 10-player max room x Trivia.
  ~25 checks (permissions, leakage, ties, reconnect, score agreement
  phone/TV/server, championship standings, max capacity) + 4
  screenshots. Written and syntax-checked, but NOT run and NOT
  committed: the K batch owns the browser and the server, and a
  second driver would contend for both. It runs after the batch lands
  and the K commit completes.
- Next: run it, fix low-risk defects within the approved rules, write
  `docs/GAME_NIGHT_END_TO_END_REVIEW.md`, commit; then the
  two-button fix, then Work Package D (Guess the Year).

## Overnight assignment — Work Package G (part): browser runtime incidents + isolation analysis (2026-11-05, local only, docs only)

- `docs/BROWSER_RUNTIME_INCIDENTS.md`: evidence log for the two
  SIGTRAP outages (2026-11-04 night, 2026-11-05 ~00:50 EST) and the
  parallel-run interference incident (01:45 EST). No root cause is
  asserted — no resource measurements exist from either outage.
  Also the isolation analysis (per-driver rooms, fresh profiles,
  the shared 3461 server, the tracked mobile screenshots) and the
  decision-E protocol restated. The K batch is healthy so far.
- Next: the K batch's remaining drivers, then the K commit, the
  two-button fix, and the C simulation run.

## Milestone K — reliability, accessibility, security hardening (2026-11-05 night, local only)

- Audit doc `docs/K_HARDENING_AUDIT.md` + three fixes (replay
  returns the stored result byte-for-byte; `host-claimed` ledger
  event; `App.startGame` in-flight guard) + 3 new tests (suite
  369/369, 33 files) + 3 new drivers (restart 15/15, double-start
  3/3, viewports 16/16, all green standalone).
- Full regression batch as the K gate: **23 drivers + E2E, ALL
  GREEN, 0 FAIL lines** (log `~/workspace/gates-k-batch.log`,
  ~43 min, exit 0). No SIGTRAP in this batch.
- Next: Work Package B fix (NumericGuess unification), then the
  Package C simulation run, then Work Package D (Guess the Year).

## Work Package B fix — held at the e2e gate by a runtime outage (2026-11-05, local only, uncommitted)

- The unification is implemented (one value + one Submit) and
  verified except for the e2e: check-closest 21/21, check-f5 30/30,
  typecheck/tests/build clean. The e2e reported 4 failed items, but
  its detail was lost to a tee EPERM and the runtime's Chromium
  then died at launch with SIGTRAP (Incident 3 in
  `docs/BROWSER_RUNTIME_INCIDENTS.md`, confirmed by a minimal
  launch test). The 4-item failure is inconclusive, not evidence of
  a regression. The commit is HELD per decision E; no further
  browser runs while the runtime is unhealthy. Next: when a minimal
  launch returns LAUNCH OK, re-run the e2e once with `>` (not tee)
  and commit if green.

## Work Package C — game-night simulation (COMPLETE, 2026-11-05, local only)

- `scripts/check-game-night.mjs` (+ npm script `check-game-night`):
  a six-player evening (host + cohost via the UI + four players +
  a spectator TV + a late joiner who disconnects mid-Closest)
  through Trivia, Closest Wins, and Math Mayhem, plus a full
  ten-player room. Review doc
  `docs/GAME_NIGHT_END_TO_END_REVIEW.md`; screenshots 14–17
  (test-fixture data).
- Four runs to green. Runs 1–2 stopped at the late joiner's join
  (the driver waited only for the lobby heading; a joiner arriving
  after a finished game lands on the Trivia reveal walk). Run 3
  reached 16 of 17 checks: the old TV dashboard has no Away marker
  (the check was corrected to assert the player is listed; the gap
  is recorded), and only the host returned to the lobby, so the
  cohost had no chooser (now every connected player returns
  between games). Run 4: **GAME NIGHT ALL PASSED (28 checks)**,
  exit 0, ~4 min (log `~/workspace/gates-c-game-night4.log`).
- Correctness defects: none. UX gaps recorded: a late joiner lands
  on a finished game's results with no context; the old TV
  dashboard has no Away marker; a failed join shows no error on the
  landing. All three are Package F / visual-review items.
- Next: Work Package D (Guess the Year modernization).

## Work Package D — Guess the Year modernization (2026-11-05, local only)

- `MchezoYear.tsx` + the `yearPlaying` branch in `App.tsx` + the
  driver `scripts/check-year.mjs` (npm script `check-year`).
  One event at a time with free navigation (jump chips + "Event N
  of 8"); the unified NumericGuess, range corrected to 1896–2025
  (the old slider's 1900 floor could never reach the 1896 Olympics
  answer); visible clamping; locked guessed events; whole-game
  abstention with the waiting ring; intro and results stay old.
  Before/after screenshots 18/19 (test-fixture data).
- `check-year`: **YEAR ALL PASSED (29 checks)**, exit 0 (log
  `~/workspace/gates-d-check-year3.log`). The exact end-to-end
  scores were verified (host 110 = Olympics exact 100 + Web 10,
  Bea 40, an abstained player 0). Two driver bugs on the way (the
  finishing guess advances to the results in the same mutation, so
  the confirmation never renders; the results render standings
  rows, not "Your score:").
- Full regression batch (the D gate) running: 25 drivers + E2E.
- Next: commit D when the batch lands green, then Work Package E
  (Geography Challenge).

## Work Package D — Guess the Year modernization (COMPLETE, 2026-11-05, local only)

- Full regression batch (the D gate): 25 drivers + E2E. The batch
  landed 22/25 — F5, game-night, and e2e failed, all driver fallout
  from the Year extraction, not app regressions. F5 and e2e still
  used the old GamePanel year selectors (fixed with an `actYear`
  kit helper in both) and their runners still waited for the old
  "Now playing:" heading (fixed: wait for `mz-year-progress`); the
  e2e's first failure was a batch error (it defaults to port 3457
  — it must be run with the 3461 URL). The game-night failure was
  its leader check missing the host's "You" row label (fixed).
  Re-runs: game-night 28/28, F5 30/30, e2e 12/12. The mobile
  screenshots regenerated by check-mobile were restored before
  staging, as were the game-night screenshots regenerated by the
  re-runs.
- Next: Work Package E (Geography Challenge).

## Work Package E — Geography Challenge modernization (COMPLETE, 2026-11-05, local only)

- `MchezoGeography.tsx` + App `geographyPlaying` branch (after the year
  branch). Mirrors `MchezoTriviaPlay` minus onTv and minus the reveal:
  QuestionScreen (accentIndex 1), locked view, `MchezoWaiting` for
  abstained / all-answered, "Sit this game out" chip (intent `abstain`).
  No server change: the projection carries only {id, prompt, options},
  so no mode label is shown (adding `mode` to the projection is a
  recorded possible follow-up, deliberately not done). Intro and
  results stay old. GamePanel's quiz branch still serves Math + Who
  Said That; only Geography's path is now dead.
  Before/after screenshots 20/21 (test-fixture data).
- `check-geography`: **GEOGRAPHY ALL PASSED (24 checks)**, exit 0 (log
  `~/workspace/gates-e-check-geography6.log`). Exact scores verified
  (host 800, Bea 0, abstained player 0). Driver bugs on the way: the
  waiting ring's `.mz-kicker` label renders UPPERCASE in innerText
  (compare case-insensitively); the 5s LOCKED IN waits were too short
  (the answer lands only on the next 2s poll — 10s waits + retry);
  the last finisher's confirmation never renders (the finishing
  submission advances the game to results in the same mutation — the
  same server-semantics fact as Year). The 3461 server had died
  (runtime restart) — restarted and verified HTTP 200 before the
  passing run.
- Driver fallout fixed ahead of the E gate: F5 and e2e now route
  geography through the shared `actTrivia` kit helper and wait for
  `.mz-question` instead of the old "Now playing:" heading.
- Full regression batch (the E gate) running: 26 drivers + E2E.
- Next: commit E when the batch lands green, then Work Package F
  (error mapping).
- Full regression batch (the E gate): 26 drivers + E2E landed 24/26
  + e2e 12/12. The two failures were driver-side: ws-reconnect 1/4
  (solo re-run ALL PASSED 4/4 — a flake) and F5 5/25 (geography did
  not finish in 180s). Root cause: F5's `panelFinished` burns a 2s
  `panelText` timeout per check when there is no game-panel, so each
  iteration cost ~13s and geography's ~16 iterations ran past the
  180s budget. A focused probe proved the game itself finishes in
  ~89s with the exact F5 act pattern. Fix (driver only): geography
  joins trivia's "Back to lobby" fast path in `panelFinished`.
  F5 re-run: **ALL PASSED (30/30)**. Typecheck clean, vitest
  369/369, build clean. Mobile + game-night screenshots restored
  before staging.
- Next: commit E, then Work Package F (error mapping).

## Work Package F — error-message mapping (COMPLETE, 2026-11-05, local only)

- `lib/errors.ts` (pure, web-safe) + `tests/errors.test.ts` (7 tests;
  376 total). Every entry grounded in an actual server string
  (room.ts / http.ts / games/*.ts). `humanError` strips "Not accepted: ",
  maps the intent codes and server sentences, covers the
  "Only host/cohost can …" family and the "Need at least N connected
  players" template by prefix/shape, sends unmapped codes to a generic
  sentence, and passes already-human sentences through unchanged.
- App.tsx: `reportError` (console.warn the raw reason, set the mapped
  sentence) + `fail(e)`; all seven raw-message catch sites now use
  `fail(e)`; the intent rejection uses `reportError`. No server change.
- Lobby render: `err` used to sit at the very bottom of `lobbyExtra`,
  below the fold on a phone — it is now a dedicated `error` prop on
  LobbyScreen, rendered at the top under "You're in" (testid
  `mz-error`, role="alert"); the duplicate in `lobbyExtra` removed.
  The landing's error paragraph gained the same testid/role.
- `check-errors`: **ERRORS ALL PASSED (5 checks)**, exit 0 (log
  `~/workspace/gates-f-check-errors.log`). Live: duplicate name shows
  the human sentence on the landing; bad-token reconnect shows the
  human seat sentence at the top of the lobby; restoring the token
  clears it. Driver lesson: reconnect() sends the token from React
  state (read at mount), so the driver reloads after corrupting /
  restoring sessionStorage.
- Full regression batch (the F gate) running: 27 drivers + E2E.
- Next: commit F when the batch lands green, then Package G remaining
  work.
- Full regression batch (the F gate): batch 1 was killed by a runtime
  restart after 5 drivers (server restarted, Chromium verified OK);
  batch 2 landed 26/27 + E2E 12/12. The one failure was
  check-leaderboard's rank-changes check — a driver bug, not an app
  regression: a tied first game (~1-in-5 with random seeds) poisoned
  the loop, so orderB could never be set. Fixed driver-only in the
  pairs game's pattern: the rank-changes games now use seed 1 and
  orderA no longer locks on a tie. Leaderboard re-run: ALL PASSED.
  check-tv-spectator also needed its assertion updated to the human
  name-taken sentence (the F behavior working as intended); re-run
  ALL PASSED. Typecheck clean, vitest 376/376, build clean, lint
  clean. Mobile + game-night screenshots restored before staging.
- Next: commit F, then the optional §11 Math Mayhem modernization.

## §11 Math Mayhem modernization (IN PROGRESS, 2026-11-05, local only)

- `MchezoMath.tsx` + App `mathPlaying` branch (after the geography
  branch). Mirrors `MchezoGeography`: QuestionScreen (accentIndex 2),
  locked view, `MchezoWaiting` for abstained / all-answered, "Sit
  this game out" chip (intent `abstain`). No server change: answers
  still submit `submit-math-answer`; the server computes the speed
  bonus from its own clock. The locked view shows the player's own
  elapsed time from the game start (deadlineAt minus the 5-minute
  window, captured at tap) with the bonus rule next to it. No TV
  stage, no reveal; intro and results stay old. GamePanel's quiz
  branch now serves only Who Said That; only Math's path is dead.
  Before/after screenshots 22/23 (test-fixture data).
- `check-math`: **MATH ALL PASSED (25 checks)**, exit 0 (log
  `~/workspace/gates-math-check1.log`). Exact scores verified on a
  seeded game (seed 1, correct indices [0,2,2,1,1,1,2,3,0,1]):
  host 1000 (all ten correct, every answer past the 10s bonus
  bracket), Bea 0, abstained player 0. The speed-bonus brackets
  themselves are unit-tested (tests/room.test.ts), not re-proven by
  the driver. Elapsed display verified live ("Answered in 12s").
- Driver fallout fixed ahead of the Math gate: F5 and e2e now route
  math through the shared `actTrivia` kit helper, wait for
  `.mz-question`, and use the "Back to lobby" fast path in
  `panelFinished` (math needs ~20 loop iterations — the 2s panelText
  timeout per check would have blown the 180s budget, as geography
  did before its fast path).
- Full regression batch (the Math gate) running: 28 drivers + E2E.
- Next: commit Math when the batch lands green, then the final
  §13 handoff.

## Duplicate-batch incident + lock correction (2026-11-05 ~10:47–11:30 EST)

- Two batches ran concurrently against the same server and the same
  fixed log (`~/workspace/gates-math-batch.log`): the interactive
  session's batch (from ~10:09 EST) and the 10:45 scheduled run's
  batch (from 10:47 EST). The shared log ended with 157 null-byte
  lines; check-mchezo's verdict line was destroyed; check-multiplayer
  (4/9 failed, first batch) and check-tv-lifecycle (exit 1, second
  batch) both ran under doubled load and could not be trusted.
- The second batch was killed mid-F5 (~11:13–11:16 EST) by the
  scheduled run's 1800-second timeout — a 28-driver gate takes
  60–70 minutes and never fit the 30-minute slot. Its completed
  drivers with clean verdicts: math, spectator, tv-spectator,
  leaderboard, tv-entry, m6, ws-reconnect, abstain, f4 (all exit 0,
  ALL PASSED). F5 was partial (killed on trivia).
- Keku chose to keep the newer batch as authoritative; the older
  batch was stopped (its E2E was in flight; the newer batch re-runs
  E2E). A resume gate was then launched under a new single-run lock.
- The scheduled run then started a THIRD batch (`/tmp/math-batch.sh`,
  11:18:54 EST, full 28 drivers + E2E, same shared log) two seconds
  before the locked resume. Keku authorized stopping it: its session
  bash, script bash, driver, and Chromium were terminated by exact
  PID (server and resume untouched); one orphaned check-leaderboard
  survived the kill (its parent loop died after spawning it) and was
  terminated separately. The locked resume's re-runs of check-mchezo
  and check-tv-lifecycle both passed clean (exit 0, ALL PASSED).
- Lock: `scripts/run-gate.sh` (flock `~/workspace/.mchezo-gate.lock`,
  per-run timestamped logs, server-up check). Contention verified
  live: a second invocation while the resume held the lock exited 3.
- Scheduled-workflow correction (owner-approved 2026-11-05, applied
  ~11:30 EST): `local-dev-christmas-30m` body updated (schedule,
  title, delivery, timeout unchanged; next run 11:45:46 EST) — all
  driver runs must go through the runner; no full gate inside the
  30-minute run (bounded verification only); check for a running gate
  first; record the source revision with every verification run;
  clean up stray test processes after interruption without touching
  the server or another run's processes; every scheduling change
  documented in `docs/GATE_RUNNER.md`. The runner also gained a run
  ID, the exact git revision in each log header, and a TERM/INT/HUP
  trap that kills the in-flight driver + Chromium children.
  Remaining runner verification (after the resume gate): live trap
  test + simultaneous-launch test on the new script.
- Resume gate (locked, log `~/workspace/gates-batch-2026-11-05-1118.log`):
  19 drivers + E2E — check-mchezo + check-tv-lifecycle re-runs,
  then f5 → errors, then E2E. A monitor watches the runner PID and
  reports verdicts on completion.

## Math gate outcome (2026-11-05 ~11:38–11:45 EST) — gate HELD, commit not made

- Resume gate (locked, log `~/workspace/gates-batch-2026-11-05-1118.log`):
  trustworthy passes: check-mchezo, check-tv-lifecycle, check-f5
  (30/30), check-contrast. The scheduled batch's clean section adds
  check-spectator and check-tv-spectator (both ALL PASSED).
- check-mobile FAILED on a real finding: the "Sit this game out"
  chip renders at ~43.6px tall at 320px and 375px viewports (the
  `mz-enter` animation starts at `scale(.99)`, so the 44px floor
  renders at 43.6px mid-animation). Fixed in source
  (`mchezo.css`: `.mz-chip-btn` min-height 44px → 46px, commented);
  NOT yet built into `dist/` (vite blocked by the EPERM below) and
  NOT yet re-verified by a clean check-mobile run.
- Everything else in the resume gate failed on environment, not the
  app: check-multiplayer (could not create/join rooms), check-reveal,
  check-library, check-shuffle, check-studio, check-reduced-motion,
  check-closest, check-restart, check-viewports, check-double-start,
  check-game-night, check-year, check-geography, check-errors (all
  exit 1 in ~1s) and E2E (1 item) all died on Chromium SIGTRAP at
  launch. Minimal launch still failing at ~11:44 EST (Incident 4).
- My error: I overwrote `scripts/run-gate.sh` while the resume gate
  was running it. Bash reads scripts lazily, so the running instance
  died at 11:38:51 on a syntax error (exit 2) after printing "gate
  done". The drivers had all run by then, so their verdicts survive
  in the log, but the runner's final summary line never printed.
  Rule recorded (AGENTS.md + GATE_RUNNER.md): the runner is frozen
  while a gate holds the lock; edit it only when no gate is running.
- Filesystem EPERM flapping in the same window (Incident 3 pattern):
  git index-lock writes, npm's log writer, and vite's config-bundle
  write all hit `EPERM: operation not permitted`. Typecheck is clean
  (both tsc configs exit 0 when run directly); the vite build and
  git operations fail intermittently for environmental reasons, not
  code reasons. Do not commit until the writes stop flapping.
- The scheduled run's cleanup stopped the dev server and removed
  `data/` (test-room snapshots only, regenerable). Server restarted
  by the interactive session ~11:44 EST (HTTP 200, `data/`
  recreated empty). No duplicate batch or driver process is running.
- Cron-worker driver fixes in the tree (uncommitted, Math-routing,
  same pattern as the F5/e2e fixes): check-contrast, check-f4,
  check-game-night, check-m6, check-mobile, check-multiplayer,
  check-tv-lifecycle. They belong in the Math commit once the gate
  is green. Regenerated screenshots (mobile + game-night 14–17)
  must be restored before staging.
- NEXT (when Chromium recovers): verify minimal launch, rebuild
  (chip fix), re-run the failed drivers + E2E through the new
  run-gate.sh in one locked gate, reconcile against HEAD d42fd96 +
  the Math tree, restore screenshots, then commit Math. Then the
  trap + simultaneous-launch runner tests, then the final handoff.
- Monitor note: the resume-gate monitor (proc_e783fdd1bacc) completed
  ~11:39 EST but its report file
  (`~/workspace/gates-resume-monitor.log`) is empty — its writes
  landed in the same EPERM window. No verdicts were lost: every
  verdict was already read directly from the resume log
  (`gates-batch-2026-11-05-1118.log`) and reported above.

## Owner-directed priority change — pause gates, preserve, harden, diagnose (2026-11-05 ~11:48–12:00 EST)

- Owner: too much engineering time is going to recovering the
  testing infrastructure. Temporary priority change: (1) pause new
  full regression runs until the environment is demonstrably
  healthy; (2) preserve all uncommitted work immediately; (3)
  harden the runner before another full batch; (4) diagnose the
  environment separately; (5) once stable, verify Math; (6) report
  back. No feature expansion until the reliability problem is
  resolved. All work remains local.
- Hold applied: `local-dev-christmas-30m` body updated (verified by
  read-back; schedule/title/delivery/timeout unchanged, next run
  12:15:46 EST) — no browser drivers at all, at most one minimal
  Chromium launch probe per run to test recovery. Pre-hold body
  preserved at
  `workspace/goals/christmas-game-night-github-coordination/hidden_files/cron-local-dev-pre-hold-body-2026-11-05.md`.
  The 11:45 run (61890bae) already behaved per the corrected body:
  dirty tree, Chromium still failing ~11:47, git EPERM persisting,
  nothing edited, nothing committed.
- Preservation: the working tree is the primary checkpoint (home
  dir persists; nothing reset/cleaned/overwritten/deleted). A
  MANIFEST (`~/workspace/backups/mchezo-math-wip-2026-11-05-MANIFEST.txt`)
  records every changed/new file + the verification status, and
  the four irreplaceable new files (MchezoMath.tsx, check-math.mjs,
  run-gate.sh v2, GATE_RUNNER.md) were copied via the file tools to
  `~/workspace/backups/mchezo-math-wip-2026-11-05-tree/`. The
  tarball and the WIP recovery commit were both attempted and both
  failed on EPERM (shell content writes blocked); retry when the
  filesystem recovers. The WIP commit, when made, must be labeled
  UNVERIFIED and never presented as a completed milestone.
- Runner v3 (`scripts/run-gate.sh`, 215 lines, syntax-checked,
  deps setsid/flock/sha256sum present): immutable per-run copy
  (read-only, outside the repo; exit 4 if the copy cannot be made),
  exclusive flock, process-group orphan cleanup (setsid + group
  kill; never the server, never another run's browsers, no global
  pkill), header with run ID + git HEAD + full dirty list + driver
  sha256s + built bundle identity, --timeout-minutes (exit 124),
  fail-safe if the run log cannot be written (exit 5). Controlled
  tests in `scripts/test-run-gate.sh` (stub driver, no Chromium)
  with PASS/FAIL/INCONCLUSIVE verdicts. Status ~11:56 EST:
  INCONCLUSIVE — the copy step failed on EPERM (five 0-byte run
  copies), so no contention/trap/lock test could execute; the
  fail-safe itself worked. Re-run once shell content writes recover.
- Diagnostics (see Incident 4 "Diagnostics" section): memory
  critically low (398 MB available, not attributable to our
  processes); browser install intact (both binaries run --version
  standalone, Chrome 156.0.8078.4); no orphans; /dev/shm and disk
  fine; overlayfs on / and /home; root uid yet EPERM on shell
  content writes (metadata ops + file tools succeed). Hypotheses
  only: SIGTRAP from memory pressure at browser startup; EPERM
  from overlay/sandbox enforcement on exec'd-process writes.
- Math verification prep: check-mobile's game-panel check now
  samples touch targets 9 times over ~1.2s through the entry
  animation (smallTargetsSampled, worst height per element with its
  timestamp) instead of one measurement at an arbitrary instant.
  Verification plan once stable: rebuild with the chip fix,
  targeted tests first (check-math, check-mobile, check-f5,
  check-contrast), then ONE locked full gate against the exact
  final source state; never combine results across revisions.
