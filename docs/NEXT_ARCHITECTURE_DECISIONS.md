# Next Architecture Decisions (Work Package H)

**Status: decision document. Nothing in it is authorized for
implementation.** It synthesizes the contracts and reviews already
written (`docs/RECOVERY_CONTRACT.md`, `docs/PERSISTENCE_CONTRACT.md`,
`docs/IDENTITY_AND_PERSISTENCE_AUDIT.md`,
`docs/PLAYER_HISTORY_ARCHITECTURE.md`,
`docs/TOURNAMENT_IDENTITY_REVIEW.md`,
`docs/TOURNAMENT_FORMAT_AND_LIFECYCLE_REVIEW.md`,
`docs/TOURNAMENT_STUDIO_ARCHITECTURE.md`,
`docs/K_HARDENING_AUDIT.md`) into the questions the owner must answer
before any persistent identity or storage system is built.

## 1. What currently persists and what does not

**Persists (per room, as JSON snapshots in `data/`):**
- The room itself: id, join code, name, host id, cohosts, championship
  day, players (slot id, display name, avatar, host/cohost flags,
  connected flag, *recovery-token hash only*), spectators (hash only),
  games (status, players, questions, answers, answer times, raw scores,
  startedAt, deadlineAt, day, seed, engine state), the ledger
  (append-only, sequenced, timestamped), `seenIntents` (the dedupe map),
  and the next-id counters.
- The Memory Book (`<roomId>.book.json`) and the host-claim token
  (`<roomId>.claim.json`).
- Writes are synchronous full-snapshot `writeFileSync` after every
  mutation — **non-atomic** (a crash mid-write can tear a snapshot).
  There is no snapshot version, no checksum, no backup generation, and
  no deletion, expiry, or TTL anywhere.

**Does not persist:**
- No person record of any kind. A player is a room-scoped slot
  (`player-N`) addressed by a bearer token in one tab's sessionStorage.
- No cross-room history, no account, no password, no profile, no
  saved preferences beyond two localStorage settings (sound, animation)
  on the player's own device.
- No tournament state (the Studio is a preview that computes a
  schedule in memory and never saves it), no frozen standings, no
  event record spanning rooms.
- No derived history beyond what the ledger and the games in one room
  imply (achievements and the championship are computed at projection
  time from that room's games).

## 2. How room-slot recovery could work without accounts

The recovery contract (`docs/RECOVERY_CONTRACT.md`) defines it; none
of it is implemented. The pieces, in order:

- **Today's credential:** the recovery token (32 random bytes, hex),
  returned once at join, stored only as a SHA-256 hash. It is the
  only credential a slot has. Losing it means losing the slot
  (the name stays squatted — names are never freed within a room's life).
- **Recovery codes (proposed):** a second, single-use credential
  (20 chars from a 32-char unambiguous alphabet, ~100 bits entropy),
  generated server-side with a CSPRNG, stored as a hash, shown once,
  regenerating revokes the previous one. Consumption, issuance, and
  the audit event must be one atomic unit — which is why this is
  blocked on the persistence contract (§4).
- **Supersede (proposed):** a successful recovery invalidates the old
  credential and the old live connection (with a clear
  "session replaced" message); the replaced client may watch as a
  spectator but gets no automatic re-entry.
- **Host-assisted recovery (proposed):** the host/cohost selects the
  exact existing slot (a display-name match is never sufficient
  authorization), a new credential is delivered to the requester only,
  the old credential is invalidated, and a ledger event + a visible
  room notification record it. This is an accepted social-trust
  mechanism for private family games, not strong identity
  verification — the document must say so.
- **Room-owner recovery (proposal, separately reviewable):** a durable
  owner code issued at room creation, hash-stored, shown once, whose
  only power is to designate a new host (it cannot play, see answers,
  or change scores). It exists because today, if all operators lose
  their tokens, a room is permanently operator-less — and there is
  deliberately no hidden administrative bypass.

None of this needs an account. Recovery restores control of an
existing slot; it does not create a person.

## 3. Why cross-room person identity is a separate concern

Recovery and person identity answer different questions:

- **Recovery:** "Can this device prove it controls *this slot in this
  room*?" The answer is a credential (a token or a code) and an audit
  event. It needs no memory of any other room.
- **Person identity:** "Is the player in room A the same person as
  the player in room B?" The answer is a *link* between slots, and it
  changes what history means: a person's record spans rooms, events,
  and Cups. That needs a person record (`pl-<uuid>`), per-device
  sessions, a linking ceremony, and a rule for what happens when
  links are wrong.

Conflating them is the main design risk in this area. Making a global
person record mandatory merely to recover a room slot would force
every casual player into a persistent identity they never asked for —
the opposite of the guest-first direction. The owner decisions (A1,
A6) already separate them: recovery restores a slot; linking is
display-only and host-attested; **never merge scores, rewrite
historical results, or change Family Cup standings through identity
linking**. The proposed smallest model (identity review §1) keeps
scores keyed by slot id and derives history *through* links, so a
link can be wrong without falsifying a score — but a link that is
asserted by a host must be labelled "linked by host", never
"verified", because the two have different evidentiary weight.

## 4. What atomic storage would require

The persistence contract (`docs/PERSISTENCE_CONTRACT.md`) defines it;
none of it is implemented. In short:

- **Versioning:** a `snapshotVersion` field (version 2 = the first
  versioned, atomic format; no field = version 1, legacy, loads as
  today; unknown future versions refuse with an explicit error;
  migration is load-time only).
- **Atomic writes:** temp file in the same directory → fsync temp →
  rename → fsync directory; one shared helper for the room, book, and
  claim files; orphan temps ignored on load and deleted at startup.
- **Previous-good backup:** rotate the previous final snapshot to
  `<roomId>.prev.json` before renaming (one generation, read-only,
  for recovery).
- **Checksums:** `snapshotChecksum` = SHA-256 over the canonical JSON
  excluding the checksum field. A mismatch means corrupt — detection
  only, not tamper evidence (the checksum is recomputed, not signed).
- **Load order:** final missing → the room does not exist; parse +
  checksum OK → load; fail → try the backup (load it, log a warning,
  add a ledger event noting the fallback); backup also fails → refuse
  with an explicit error, never synthesize an empty room.
- **Replay / reconciliation:** the ledger is the audit trail and the
  games hold the scores; cheap consistency checks on load (sequence
  monotonic, references valid); inconsistencies are logged and
  surfaced, never silently repaired; scores are never recomputed from
  the ledger into different values.

Atomic persistence is a **prerequisite** for executable persistent
tournaments (owner decision A7) and for single-use recovery codes
(consumption must be atomic). It is the correct first implementation
step precisely because it changes no product behavior: it only makes
the storage the product already depends on durable.

## 5. How existing Family Cup results could be preserved

The Cup is per-room: seven `advanceDay` advances of one room, results
keyed by slot id + day, attendance derived from the games in that
room. A migration to person identity must preserve that exactly:

- **Additive mapping only:** a slot→person link is an added record;
  the slot, its scores, and its day results are never rewritten.
  The Cup's standings are computed from slot-keyed data, then
  *displayed* through links — so a person's Cup history is the union
  of their linked slots' histories, and unlinking a slot removes it
  from the display without touching the underlying results.
- **No cross-room merging:** scores are never summed across slots
  (two slots are two participations, even if they are the same
  person). A person who played the Cup in two rooms has two Cup
  records, not one merged record. Merging would fabricate history.
- **The ledger is the source of truth:** every Cup-relevant event
  (game started/finished, score override with previous points, day
  advanced, game timed out) is already ledger-logged with its actor
  and timestamp. Any future history view reads the ledger; it does
  not invent a second record.
- **Deletion anonymizes, never erases history:** if a person record is
  ever deleted, the link is anonymized and the slot's scores remain
  (the Cup's integrity depends on the scores, not on the name
  attached to them).

## 6. What changes would be needed for persistent tournament membership

Today a tournament is a preview: a schedule computed in memory from
a preset, never saved, never scored, never sent to the server
(Milestone I). Making it persistent and executable needs, at minimum:

- **Events spanning rooms:** a tournament is an event record (id,
  format, frozen config, roster) that exists independently of any
  one room. Today there is no event record at all; the Phase 1
  decision is separate rooms for tournaments and the Cup (because the
  Cup counts *all* official games in its room, so co-hosting would
  silently double-count).
- **Frozen standings as appended events:** today's standings are
  derived at projection time from the current games. A tournament's
  standings must be *stored* as appended events and frozen at
  completion, so a later game cannot rewrite an earlier round —
  coexisting with, never contaminating, the derived Cup standings.
- **Roster vs connected players:** the scheduler must schedule for
  the roster size before activation, not the connected count (today's
  preview schedules for the connected count and displays it).
- **Ownership separate from the room host:** tournament ownership is
  its own field, transferable only by an explicit, auditable owner
  action (the room's `hostId` never transfers).
- **Lifecycle:** Draft → Ready → Active → Paused → Completed →
  Archived, plus Cancelled (cancellation preserves completed results,
  marks unfinished rounds, and is distinct from Completed everywhere).
  Zero of these states exist today for generic tournaments.
- **The deadline question:** tournament rounds are room games, so each
  round inherits the five-minute deadline (see the J.4 review). A
  tournament schedule must budget five minutes per round until the
  deadline is decided — a six-round tournament is thirty minutes
  minimum at the deadline, hours at the design durations.

## 7. Decisions that require explicit approval

- Implementing recovery codes, host-assisted recovery, or the
  room-owner recovery proposal (each is a credential system).
- Implementing atomic persistence (it changes the storage format,
  even though it changes no product behavior — it is the one
  prerequisite the owner should approve first).
- Creating any person record, any account, or any cross-room link
  that is not host-attested and display-only.
- Activating executable tournaments or persistent tournament scoring.
- Any room expiry or deletion policy (destructive).
- Any change to Family Cup scoring, eligibility, attendance, or
  historical records.
- Any new durable score storage (a second source of truth for scores).

## 8. Technical prerequisites that can be implemented independently

These change no product rule and need no identity decision:

- **Atomic snapshots** (the persistence contract §4) — the
  prerequisite for everything else. No product behavior changes.
- **The `host-claimed` ledger event** — done in Milestone K.
- **The replay response shape** (a replay returns the original result
  byte-for-byte) — done in Milestone K, pinned by tests.
- **Measurement** — the next real session's ledger already records
  actual game durations (`game-finished.createdAt − startedAt`);
  reading them needs no code.
- **The per-game deadline review** — done (Work Package A); it is the
  decision input for the deadline, not a change.

## 9. Recommended staged sequence

1. **Atomic snapshots** (persistence contract). No product change;
   unblocks recovery codes and persistent tournaments.
2. **Slot recovery without accounts** (recovery contract §1–§3):
   single-use codes + host-assisted recovery + supersede. No person
   record. This fixes the real, present pain (a lost token loses a
   slot forever) without creating an identity system.
3. **Display-only linking** (host-attested, "linked by host" labelling;
   never merges scores). This gives recurring groups a shared history
   view without a verified identity.
4. **Events and persistent tournaments** (separate rooms first;
   preview → executable only after a dedicated activation review).
   Frozen standings, roster-based scheduling, independent ownership,
   the full lifecycle including Cancelled.
5. **Accounts (deferred, separately reviewed Phase 3).** No passwords
   in the current plan; the provider, the recovery story, and the
   migration from guest slots would each need their own review. Do
   not start this stage until stages 1–3 are proven in real sessions.

## 10. Risks

- **Corruption:** snapshot writes are non-atomic today; a crash
  mid-write can tear a room's only copy. Mitigation: stage 1
  (atomic writes + previous-good backup + checksums) before any
  feature that depends on the snapshot being durable.
- **Lost tokens:** a lost recovery token loses the slot permanently,
  and the display name stays squatted for the room's life. Mitigation:
  stage 2 (recovery codes + host-assisted recovery). Until then, the
  only remedy is a new slot with a new name.
- **Impersonation:** a bearer token is the only credential; anyone
  holding it *is* the slot (there is no second factor, no device
  binding). A leaked token (a screenshot, a shared link, a borrowed
  phone) is a takeover. Mitigation: single-use recovery codes,
  supersede on recovery, and never putting tokens in URLs (already
  the case — WS subprotocol headers only). Host-assisted recovery
  must not become a social-engineering shortcut: the host must select
  the exact slot, and the action must be audited and announced.
- **Duplicated scores:** merging two slots' scores (to "fix" a
  reconnect, or to unify a person's history) fabricates results and
  corrupts the Cup. Mitigation: the no-merge rule (§3, §5) as a hard
  invariant, enforced by keeping scores keyed by slot id.
- **Host abuse:** host-assisted recovery is social trust, not
  verification. A hostile or mistaken host could hand a slot to the
  wrong person. Mitigation: the audit event + the room notification
  (everyone sees it happened), the old credential's invalidation, and
  the documented limitation that this is not strong identity.
- **Unbounded accumulation:** no room expiry exists; the dev server
  already holds 525 room files from testing. Mitigation: an expiry
  policy decided by the owner (stage 1 or 2), with the ledger
  archived rather than silently deleted.

## 11. Which future modes the system should support

| Mode | Today | Needs |
|---|---|---|
| One-time casual games | Yes (the core loop) | Nothing |
| Ongoing Family Cups | Yes (per-room, 7 days) | Nothing (rules are authoritative) |
| Custom single-day tournaments | Preview only (Studio) | Stage 4 (events, frozen standings, lifecycle) |
| Multi-day tournaments | No | Stage 4 + the deadline decision (rounds inherit the 5-min deadline) |
| Saved player profiles | No | Stage 5 (accounts, separately reviewed) |
| Recurring group history | No (per-room only) | Stage 3 (display-only linking) |

The staging above supports all six without forcing casual players
into accounts: the first three stages add durability and recovery to
the guest-first game the family already plays, and only the last
stage introduces a persistent identity — after the earlier stages
have proven themselves in real sessions.
