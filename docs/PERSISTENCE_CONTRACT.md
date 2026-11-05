# Persistence Contract — snapshots, crash recovery, lifecycle notes

**Status: contract for review (Milestone J.2). No implementation is
authorized by this document.** It defines the snapshot versioning,
atomic writes, crash recovery, corruption handling, and event
replay/reconciliation required by decision A7 as a **prerequisite**
for executable persistent tournaments. It also records the lifecycle
contract notes from decision C. Reviewing this contract does not
activate persistent tournaments, change Family Cup rules, or
implement recovery — those need their own reviews.

## 0. Current state (grounded, 2026-11-04 night)

- Room snapshots are `RoomEngine.toJSON()` output: `id, joinCode,
  name, hostId, cohosts, championshipDay, players, spectators,
  games, ledger, seq, seenIntents, nextPlayer, nextSpectator,
  nextGame`. **No version field, no checksum.**
- `SCHEMA_VERSION` in `src/shared/protocol.ts` is the *intent
  schema* version, not a snapshot version — a naming trap: do not
  reuse it for snapshots.
- Persistence is a single synchronous `writeFileSync` after every
  mutation (`persist`, `persistClaim`, `persistBook` in
  `src/server/http.ts`): **non-atomic** — a crash mid-write leaves a
  torn file. No `fsync`, no temp file, no backup generation.
- The ledger is append-only with a monotonic `seq`; events include
  `player-joined`, `player-reconnected`, `cohost-granted`,
  `game-started`, `player-abstained`, `game-timed-out`, and others.
  `seenIntents` (dedupe table, keyed by room + actor + client event
  id) is persisted inside the snapshot.
- `ledgerChecksum()` is a recomputed hash, **not** tamper evidence:
  it is computed on demand, not stored, and anyone with write access
  can recompute it. This contract does not claim tamper-proofing.
- There is no room deletion, expiry, or TTL anywhere. Derived state
  (standings, achievements, ceremony) is recomputed from games +
  ledger at projection time, not stored — so a snapshot's stored
  games and ledger *are* the state.

## 1. Snapshot versioning

- New field `snapshotVersion` (integer) on every snapshot, book,
  and claim file.
- Version **2** is the first versioned format (the atomic-write
  format defined below). A snapshot with **no** version field is
  version **1** (legacy, non-atomic) and must load as today.
- Readers accept versions 1 and 2. Writers always write version 2.
- An unknown future version (3+) must **refuse to load with an
  explicit error** — never silently migrate, never guess.
- Migration 1 → 2 is load-time only: a legacy snapshot loads
  normally and is written in version 2 format on the next persist.
  No batch migration, no separate migration tool, no rewriting of
  files that were never loaded.

## 2. Atomic writes

All three file kinds (room snapshot, book, claim) use one shared
helper with this exact sequence:

1. Serialize the snapshot to a string.
2. Write it to a temp file **in the same directory** as the final
   file (`<roomId>.json.tmp-<pid>` — same directory so the rename
   stays on one filesystem).
3. `fsync` the temp file (durability, not just a userspace write).
4. `rename` the temp file over the final file (atomic on POSIX:
   observers see either the old complete file or the new complete
   file, never a torn write).
5. `fsync` the directory (so the rename itself survives a crash).

On startup, orphan temp files (`*.tmp-*`) are ignored on load and
deleted as hygiene — they are never treated as snapshots.

## 3. Previous-good backup (one generation)

- On each successful atomic write, the previous final file is
  rotated to `<roomId>.prev.json` **before** the rename (one
  generation only, not a history — bounded disk use).
- The backup is read-only for recovery: the recovery path never
  writes to it, so a bad recovery attempt cannot overwrite the only
  good copy with a bad one.
- The backup carries its own version field and checksum (same rules
  as §1 and §4); a backup that fails validation is ignored, not
  repaired.

## 4. Checksums (corruption detection, not tamper evidence)

- Each snapshot stores `snapshotChecksum`: SHA-256 over the
  canonical JSON of the payload **excluding** the checksum field
  itself. (Canonical means: the exact serialization the writer
  produced — the writer computes the checksum over the string it is
  about to write, minus the checksum field, and the reader
  recomputes the same way.)
- On load, a checksum mismatch means **corrupt** — follow the
  recovery path (§5). A matching checksum does not prove the file
  is un-tampered (an attacker with write access recomputes it); it
  proves the file was not torn or bit-rotted. This contract claims
  corruption detection only, matching the existing
  `ledgerChecksum()` limitation honestly.

## 5. Crash recovery and corruption handling (load order)

1. Read the final file. If it is missing, the room does not exist
   (current behavior, unchanged).
2. If it parses and its checksum verifies, load it.
3. If it fails to parse or its checksum mismatches, try the
   previous-good backup (§3). If the backup loads, load it, log a
   warning, and record a ledger event noting the recovery (so the
   room's history shows a snapshot fallback happened — the fallback
   itself is an auditable event, not a silent repair).
4. If the backup also fails (or is absent), **refuse to load with an
   explicit error and a log entry**. Never synthesize an empty room:
   an empty room would silently erase the room's history and let
   play continue on a blank slate, which is worse than a visible
   failure. The operator (host) sees the error and can restore from
   an external backup; the room's data is not overwritten by the
   failed load.

## 6. Event replay and reconciliation

- The ledger (append-only, sequenced) is the audit trail, not a
  second copy of the scores. Games hold the scores; the ledger
  records what happened. The two must agree, and disagreement is a
  corruption signal, not a repair opportunity:
- On load, verify internal consistency cheaply: `seq` is monotonic
  across ledger events; ledger events reference existing games and
  slots where they carry those ids; `seenIntents` entries reference
  known rooms/actors. Inconsistencies are logged and surfaced
  (following §5's refuse-or-fallback path if they indicate
  corruption); they are **never silently repaired** by rewriting
  history, because a silent repair could mask data loss.
- Scores are never recomputed from the ledger into different values:
  the ledger says "game X finished with scores Y" and the game
  record says the same; if they differ, that is corruption (§5),
  not an invitation to pick a winner.
- Future persistent tournaments (when activated, after their own
  review) must store standings as **appended events frozen at
  completion**, not as derived state recomputed at read time —
  derived standings rewrite history when inputs change, which is
  exactly what frozen tournament records must not do. That storage
  design belongs to the activation review; this contract only states
  the requirement.

## 7. Lifecycle contract notes (decision C)

- **Cancelled terminal state** (approved, alongside
  Draft → Ready → Active → Paused → Completed → Archived):
  cancellation is host/cohost-only, audit-logged, and irreversible.
  Completed rounds' results are preserved; unfinished rounds are
  marked cancelled (not scored, not counted toward standings or
  Family Cup); Cancelled is distinct from Completed in the UI, the
  API, and standings. Cancellation never deletes the tournament
  record.
- **Separate rooms for Phase 1:** tournaments live in their own
  rooms. A Family Cup room's official games *all* count toward the
  Cup, so co-hosting a tournament inside a Cup room would silently
  double-count tournament games as Cup games. Co-hosting is
  forbidden until a Family Cup rule review explicitly allows tagged
  games — no tournament implementation may silently modify Cup
  scoring, eligibility, attendance, or historical records.
- **Tournament ownership** is a field separate from the room's
  `hostId`. Transfer requires an explicit current-owner action, an
  audit event, and a room notification. The owner need not be the
  room host. Owner loss falls under the room-owner recovery proposal
  (`docs/RECOVERY_CONTRACT.md` §4) — no silent transfer, no
  auto-promotion, no time-based escalation.

## 8. What this contract unblocks — and what it does not

- **Unblocks:** the *review* for persistent-tournament activation.
  Activation still needs its own architecture review (storage
  design per §6, lifecycle implementation per §7, and the recovery
  contract's implementation review).
- **Does not:** activate tournaments, change any Family Cup rule,
  implement recovery, change existing storage behavior for rooms
  that never opt into the new format (legacy snapshots keep loading
  per §1), or authorize any deletion, expiry, or migration of
  existing rooms.
