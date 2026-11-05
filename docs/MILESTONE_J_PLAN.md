# Milestone J Plan — Shared gameplay infrastructure + one incremental game modernization

Kickoff: 2026-11-04 night, after Milestone I was approved for local
commit (89c9dfc) under the owner's decisions A–F. This plan does not
replace the planned milestone with an identity overhaul: J's existing
scope leads, and decisions A–F constrain how J handles identity and
lifecycle questions inside that scope.

## J's original intent (from the assignment and the dev log)

- "Shared gameplay infrastructure + one incremental game
  modernization" (dev log, remaining-tasks list).
- Inspect: shared lifecycle states, host/cohost consistency,
  transitions, error handling, reconnection, projections,
  accessibility, mobile layout, TV behavior, test isolation.
- Visual modernization of the other ten games: bounded, incremental,
  **one game at a time, independent commit each**. Never restyle all
  ten in one sweep. (Trivia is already modernized from Phase 2.)
- Open question carried into J/K: the deadline-vs-duration tension
  (5-minute room deadline vs design durations up to 15 minutes,
  notably Charades — GAME_MANIFEST.md flags it as unexamined).

## Grounding fact found at kickoff

All ten non-Trivia games render through one 64-line component,
`apps/web/src/components/GamePanel.tsx`, with one conditional branch
per game (math/whosaid/geography share a quiz branch). "One game at a
time" therefore means extracting one branch into a Mchezo-kit
component while GamePanel keeps serving the rest — not ten separate
components, and not a GamePanel rewrite.

## Work items, in order

### J.1 Shared-infrastructure inspection (first)

Inspect each area, report findings with file/line evidence, and make
only narrowly scoped, backward-compatible fixes (each independently
verified; gameplay rules unchanged):

1. Shared lifecycle states (game playing → finished / timedOut,
   room championshipDay, waiting banners, results separation).
2. Host/cohost consistency (the `hostId || cohosts` predicate across
   start/advance/override/skip/grant; delegation chains; the
   operator-less room gap from the identity review — documented,
   not fixed by a bypass).
3. Transitions (lobby → playing → waiting → results → lobby;
   intro/result dismissal; TV stage entry/exit).
4. Error handling (intent rejections, deadline expiry, host skip,
   WS close codes, driver-visible error states).
5. Reconnection (token reconnect, WS auto-reconnect, spectator
   reconnect, concurrent-recovery behavior — inspected against
   decision A4's supersede semantics as a *contract*, not an
   implementation).
6. Projections (per-player vs public vs TV vs spectator boundaries;
   no pre-reveal leakage — re-verified, not assumed).
7. Accessibility (focus order, touch targets, reduced-motion,
   contrast — building on the existing contrast checks, not
   replacing them).
8. Mobile layout (320/360/390 + the established phone-first kit).
9. TV behavior (stage entry mid-game, reveal walk, leaderboard tab,
   spectator counts).
10. Test isolation (driver independence, seed hygiene, shared-server
    interference between drivers).

Deliverable: `docs/J_INFRASTRUCTURE_INSPECTION.md` + narrow fixes,
each with its own tests/drivers where behavior changes.

### J.2 Contracts (documentation only — no implementation)

Decisions A–F explicitly permit local documentation and
architectural contracts, and explicitly forbid implementing a global
identity system or activating persistent tournaments. J therefore
*writes* these contracts and builds none of them:

- **Recovery-code threat model + storage requirements (A2):**
  server-side CSPRNG generation, no derivation from names/codes/
  timestamps/sequences, verifier-or-hash storage only, display at
  issuance only, regeneration revokes the previous code, threat
  model (token theft, code guessing, host abuse, device loss).
- **Host-assisted recovery safeguard contract (A3):** explicit
  host/cohost action selecting the exact slot, audit event, visible
  room notification, old credential invalidation, documented
  social-trust limitation (not strong verification), no hidden
  administrative bypass; a room-owner recovery mechanism as a
  *separately reviewable proposal*, not a built backdoor.
- **Supersede semantics (A4):** token rotation, reconnect behavior,
  and concurrent recovery attempts handled atomically — as contract
  requirements for the future implementation.
- **Persistence contract (A7):** snapshot versioning, atomic writes
  (temp file + rename), crash recovery, corruption handling, event
  replay/reconciliation. Activation of persistent tournaments stays
  forbidden until this contract is reviewed — J writes it, nothing
  more.
- **Display-only linking note (A6):** asserted vs verified links,
  never merged scores, never rewritten Cup standings.
- **Storage default (A5):** sessionStorage stays the default; any
  future Remember-this-device option needs its own explanation and
  revocation controls. J changes no storage behavior.
- **Lifecycle contract notes (C):** Cancelled as a terminal state
  (completed results preserved, unfinished rounds marked, clearly
  distinguished from Completed); separate rooms for Phase 1
  tournaments (no co-hosting with Family Cup); tournament ownership
  separate from room host, transfer explicitly authorized and
  auditable.

### J.3 One incremental game modernization (first slice: closest-wins)

Selection rationale, from the GamePanel code: closest-wins is a
single self-contained branch (dial + number input + submit +
per-question abstention, no phases, no shared branch, no team
mechanics, no hidden roles). Extracting it into a Mchezo-kit
component while GamePanel keeps the other nine branches is the
smallest reversible slice. Trivia stays as the reference pattern
(phone gameplay/waiting/results + TV where applicable — closest has
no dedicated TV stage, so it uses the TV dashboard like the other
non-Trivia games).

Explicitly not first: charades (team mechanics + actor turns),
impostor (hidden-role phases), caption-clash (multi-phase),
math-mayhem (shares the quiz branch — a later slice may modernize
the whole quiz branch at once, or split it deliberately).

Slice verification: unit tests for any new pure module, a driver
for the modernized game (play/wait/results/abstain), mobile +
contrast checks for the new panel, full batch before commit, one
independent commit for the slice.

### J.4 Deadline-vs-duration decision input (no gameplay change)

Document the tension (5-minute room deadline vs design durations,
notably 15-minute Charades) with options and a recommendation, but
change no deadline and no duration: changing either would change
established gameplay rules, which J may not do autonomously. If a
change is wanted, it goes to a decision checkpoint.

### Chaos Night differentiation proposal (B, proposal only)

Chaos must become meaningfully different from Gauntlet before being
advertised as a distinct playable format. Proposed scheduling-behavior
difference (no new mechanics, no marketing copy): Gauntlet stays
distinct + variety-weighted (one tournament-mode call); Chaos becomes
per-slot uniform random (one random-mode pick per slot, no recency
or style weights — "anything goes" means no variety preference, so
repeats cluster naturally and schedules are genuinely unpredictable).
Both behaviors already exist in the H engine; the proposal only
changes which strategy a preset selects. This is a proposal for
owner approval, not a J implementation: J does not change preset
behavior without that approval. Team Clash stays preview-only
throughout J (no team mechanics invented).

## What J will NOT do

- No new database or paid service. No deploy/publish. No GitHub
  push/merge. No global identity system. No Family Cup scoring,
  eligibility, attendance, or history change. No persistent
  tournament activation. No elimination, team-scoring, or
  tournament-award rules. No silent storage-behavior change. No
  all-ten-games restyle. No deadline/duration gameplay change.
- If any J item needs one of these, complete the safe portion and
  present a decision checkpoint instead of improvising.

## Verification plan (E)

Per slice: typecheck (root + web), lint, unit tests, affected
drivers, then the full batch before commit. Authorization, spectator
isolation, reconnect behavior, and mobile layouts are checked as
part of every slice that touches them. A browser launch failure is
an environment result, never an application result; no repeated
full-suite runs while the environment is demonstrably unhealthy
(last verified state is preserved and reported exactly). Real
iPhone Safari verification remains outstanding and is never
described as completed.

## Commit strategy

One independent, verified commit per slice: J.1 inspection (+ narrow
fixes), J.2 contracts, J.3 closest-wins modernization, J.4 decision
input. The J checkpoint report (per the owner's section F) follows
the last slice: original intent, actual implementation, decision
effects, remaining decisions, exact test results + limitations,
commit hashes + tree status, recommended next milestone.
