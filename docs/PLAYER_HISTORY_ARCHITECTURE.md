# Mchezo — Player History Architecture (Milestone E proposal)

Target architecture for guest-first joining, optional permanent
accounts, and persistent player history beyond the Family Cup. This is
a **proposal**, not an implementation: no code in this document runs,
no scoring rule changes, no password authentication, no destructive
migration, and no parallel identity system. The adoption path in §7 is
designed so each step is backward-compatible with the current engine
(see `docs/IDENTITY_AND_PERSISTENCE_AUDIT.md` for the as-is state).

## Product requirement (fixed)

> Mchezo must support guest-first joining, optional permanent
> accounts, and persistent player history beyond the Family Cup. An
> account is optional. A reliable internal player identity is not.

## Design principles

1. **Identity is an id, not a name.** Display names stay room-scoped
   and non-unique globally. Nothing in history keys off a name.
2. **Guest first, account optional.** Every current flow (code +
   name, no account) keeps working unchanged. Accounts attach to an
   existing guest identity; they never replace it or gate it.
3. **Extend, don't duplicate.** The room engine, ledger, dedupe, and
   projections stay authoritative for games. The new layer only adds
   records the engine cannot express: players, sessions, events,
   frozen achievements, corrections.
4. **Derive where derivation is honest; freeze where history must not
   move.** Standings can stay derived. Earned achievements and
   published event totals must be frozen at the moment they are
   earned/published, or a later rule change rewrites the past.
5. **Deletion must not rewrite other people's history.** Removing a
   player anonymizes their link to past games; it does not delete
   other players' games or restate published totals. (Owner review
   point — see §6.)

## 1. Entities and relationships

```
Player 1───* GuestCredential (hashed recovery token; the current token, kept)
Player 1───* DeviceSession (one per browser/device; revocable)
Player 1───* AccountLink (optional, at most one verified account per player)
Player *───* RoomSlot (a player's participation in one room; the current player-N)
Player *───* EventMembership (a player's participation in one event; role: host/cohost/player/spectator)
Event 1───* Room (an event spans one or more rooms; a room belongs to at most one event)
Room 1───* GameInstance (existing engine entity, unchanged)
GameInstance 1───* GameParticipation (playerId, rawScore, rank, official, answers ref)
Player 1───* EarnedAchievement (frozen at earn time)
Player 1───* AttendanceDay (playerId, eventId, day, qualifying flag)
Correction *───1 LedgerEvent (a correction references the event it amends, never edits it)
```

### Player

```ts
interface Player {
  id: string;            // server-generated, e.g. `pl-<uuid>`; never reused, never a name
  createdAt: number;
  displayNameHint?: string; // last used name, convenience only; NOT identity, NOT unique
  deletedAt?: number;    // tombstone; see §6
}
```

Why a new id instead of reusing `player-N`: `player-N` is room-scoped
and counter-based; two rooms mint colliding ids for different people.
The player id is global and stable. Room slots keep their existing
ids; a slot gains an optional `playerId` field (nullable during
migration).

### GuestCredential

```ts
interface GuestCredential {
  playerId: string;
  tokenHash: string;     // SHA-256, exactly as today; raw token never stored
  createdAt: number;
  rotatedAt?: number;    // rotation keeps history: old hash revoked, new hash issued
  revokedAt?: number;
}
```

The current recovery token **becomes** the guest credential. No new
secret type is introduced for guests. Rotation is the recovery story:
a player who still holds any valid credential can rotate (old tokens
die, new token issued); a player who holds none cannot self-recover
(see §4).

### DeviceSession

```ts
interface DeviceSession {
  id: string;
  playerId: string;
  deviceLabel: string;   // user-supplied or UA-derived, e.g. "Ada's iPhone"
  tokenHash: string;     // per-device token, distinct from the guest credential
  createdAt: number;
  lastSeenAt: number;
  revokedAt?: number;
}
```

This is the multi-device fix: today one token lives in one tab's
`sessionStorage`. Sessions let one player hold several live devices,
revoke one without killing the others, and see where they are signed
in. A session token authorizes exactly what the guest credential does
today (play as that player, nothing more); it never grants host powers
unless the slot holds them.

### AccountLink (optional, deferred)

```ts
interface AccountLink {
  playerId: string;
  provider: string;      // e.g. "email-magic-link" | "oauth:<provider>"
  providerSubject: string; // provider's stable subject id, never an email in the clear unless needed
  verifiedAt: number;
}
```

At most one verified account per player (a second link requires
unlinking first, to prevent account-merging ambiguity). **No password
authentication is designed here.** Verification mechanism is an open
decision (§7, Phase 3): magic-link email, an OAuth provider, or
staying guest-only are all compatible with this record; choosing one
requires reviewing that provider's actual terms and privacy policy
first. Until that decision is made, AccountLink stays unimplemented
and every player is guest-only — which the rest of the design already
supports.

### RoomSlot (existing slot, extended)

```ts
interface RoomSlot {     // today's RoomPlayer, plus one nullable field
  id: string;            // player-N, unchanged
  roomId: string;
  playerId?: string;     // NEW, nullable: the persistent player behind this slot
  displayName: string;
  isHost: boolean;
  isCohost: boolean;
  connected: boolean;
  recoveryTokenHash: string; // today's field, kept; becomes the guest credential on link
  joinedAt: number;
}
```

Backward compatibility: old snapshots lack `playerId`; they load as
`undefined` (unlinked slots), exactly like today's slots. Linking a
slot sets `playerId` and copies the slot's `recoveryTokenHash` into a
GuestCredential for that player.

### Event and EventMembership

```ts
interface Event {
  id: string;
  title: string;         // e.g. "Family Cup 2026"
  template: "family-cup" | "custom"; // Family Cup is one template, not the platform
  scheduledDays: number; // 7 for Family Cup; custom events choose
  rooms: string[];       // room ids belonging to this event, in play order
  status: "draft" | "active" | "finished";
  createdAt: number;
  configSnapshot: unknown; // the scoring/eligibility config as published (frozen)
}

interface EventMembership {
  eventId: string;
  playerId: string;
  role: "host" | "cohost" | "player" | "spectator";
  joinedAt: number;
}
```

An event's standings are derived from its rooms' finished official
games using the **same** championship functions, run across rooms
instead of one room. The Family Cup's seven-day rules are unchanged;
they become the `family-cup` template's config, frozen per event at
creation so a later config change cannot restate a finished event.

### GameParticipation (derived today, stored in the target)

Today, participation is implicit in each game's `players[]` +
`rawScores`. The target stores one row per (game, player):

```ts
interface GameParticipation {
  gameId: string;        // game instance id
  roomId: string;
  eventId?: string;
  playerId: string;
  slotId: string;
  official: boolean;
  timedOut: boolean;
  rawScore: number;
  rank: number;          // shared-rank ties, as displayed
  answersRef?: string;   // pointer to the game's stored answers, not a copy
}
```

This is what makes per-player history, per-game-type performance,
wins/ties, and streaks answerable without scanning every room file.

### EarnedAchievement (frozen)

```ts
interface EarnedAchievement {
  playerId: string;
  achievementId: string;
  earnedAt: number;
  ruleVersion: number;   // the rules version that awarded it; never restated
  gameId?: string;
}
```

Today achievements are derived from the ledger on every projection,
so a rule change rewrites history. The target writes a row at earn
time and reads rows thereafter; derivation remains only for
*evaluating* new awards.

### AttendanceDay

```ts
interface AttendanceDay {
  playerId: string;
  eventId: string;
  day: number;
  qualifying: boolean;   // finished official game(s) that day, per event config
}
```

Derived today from games; stored in the target so attendance survives
game-level changes and can be queried without recomputation. A day a
player skipped entirely simply has no row (missing days are not
negative points, per the approved rules).

### Correction (append-only, reversal-capable)

```ts
interface Correction {
  id: string;
  amendsEventId: string; // the ledger event id being corrected
  gameId: string;
  playerId: string;
  previousPoints: number;
  newPoints: number;
  reason: string;
  actorId: string;
  createdAt: number;
  reversedBy?: string;   // id of a later correction that undoes this one
}
```

Corrections never edit a ledger event or a stored rawScore in place:
they append a correction row, and projections apply corrections in
order. This keeps the existing audited-override semantics and adds
reversal, which today's override lacks.

## 2. Uniqueness constraints

| Field | Constraint | Why |
|---|---|---|
| `Player.id` | globally unique, never reused | the identity itself |
| `GuestCredential.tokenHash`, `DeviceSession.tokenHash` | globally unique among non-revoked | a token must identify exactly one player/session |
| `RoomSlot.id` | unique within its room | today's invariant, kept |
| `RoomSlot.displayName` | unique within its room (case-insensitive) | today's invariant, kept; NOT global |
| `Room.joinCode` | unique among live rooms | join-by-code lookup must be unambiguous; today's code space is large but collisions are unhandled — the lookup must define collision behavior (refuse the second room's code or fail the lookup loudly) rather than silently picking the first match |
| `EventMembership (eventId, playerId)` | unique | one membership per player per event |
| `GameParticipation (gameId, playerId)` | unique | one row per player per game |
| `EarnedAchievement (playerId, achievementId, gameId?)` | unique per game where game-scoped | prevents double-award on recomputation |

Notably absent: no global display-name uniqueness. Names are
room-scoped display strings; enforcing global names would break the
guest-first model (two "Ada"s in different families are fine).

## 3. Permission boundaries

- **Player (self):** read own history, own sessions, own achievements;
  revoke own sessions; rotate own guest credential (while holding a
  valid one); request own data export; request own deletion.
- **Player (others):** nothing by default. Room-level aggregates
  (standings, leaderboards, answer distributions) stay visible to room
  members exactly as today; per-player history across rooms is never
  visible to another player unless both share an event and the event
  config says so.
- **Room host/cohost:** everything they have today (start games,
  advance days, grant cohost, skip timed-out games, audited score
  overrides) plus slot reclamation for orphaned slots (see §4). Host
  powers never extend to reading another player's tokens, sessions, or
  cross-room history.
- **Event host:** manage event membership and rooms; publish/freeze
  event config. Event host powers do not grant room-host powers in
  rooms they did not create, and vice versa.
- **Spectator:** read-only public projections, as today. Spectators
  gain no history, no sessions, and no membership by watching.
- **Server operator (filesystem access):** today equivalent to full
  write access (plain JSON snapshots). The target must add snapshot
  integrity (§5) before any hosted deployment; local single-server use
  keeps the current trust model explicitly.

## 4. Recovery, linking, and reclamation

**Guest → player linking (the core flow).** When a player wants
history to survive this room, they claim a player record from the
slot: the client presents the slot's recovery token; the server
creates (or, if the player already has one, attaches to) a Player,
writes a GuestCredential from the slot's token hash, and sets the
slot's `playerId`. From then on, every game that slot plays accrues
to that player. Linking is per-slot and explicit; nothing auto-links
two slots that merely share a display name.

**Multi-device.** A linked player creates DeviceSessions (one per
device) from any valid credential. Each device holds its own token.
Losing one device means revoking its session, not losing the player.

**Lost all credentials.** There is deliberately no self-service
recovery without any valid credential — anything else would let
anyone claim anyone else's history. The mitigations, in order of
preference: (1) credential rotation while any credential survives;
(2) an optional verified AccountLink, which restores access via the
provider (deferred to Phase 3); (3) host-assisted recovery, which
must be an explicit, logged, owner-approved action (host attests the
person, server issues a fresh credential to a new slot and links it
to the same player, with the old slot marked superseded — never
silently merged).

**Slot reclamation (fixes name squatting).** An orphaned slot's
display name is reserved forever today. The target adds: a slot with
no linked player, disconnected, and untouched for a configurable
inactivity period becomes reclaimable — a host may release its name
(the slot is tombstoned, its scores stay attributed to the anonymous
slot, its name frees). A linked slot is never auto-reclaimed; only
its player (or deletion) releases it.

## 5. Privacy and integrity

- **Private by default:** a player's cross-room history is theirs.
  Room members see what they see today (aggregates + finished scores);
  nothing new about other players leaks through history views.
- **Token hygiene stays:** hashes only, tokens never in URLs, actor
  derived from the token server-side. Sessions follow the same rules.
- **Snapshot integrity (new requirement):** atomic snapshot writes
  (write temp file + rename) immediately — this fixes the torn-write
  risk with no schema change. For hosted use, add a hash chain or
  signature over snapshots: each snapshot carries the hash of the
  previous snapshot, so a rewritten file is detectable without trusting
  the file itself. Local use documents the trust model instead of
  pretending otherwise.
- **No new private data in projections:** history endpoints return
  the requesting player's rows only; aggregate endpoints return what
  rooms already publish. Spectator projections stay exactly public.

## 6. Deletion and retention

- **Player deletion:** tombstones the Player (`deletedAt`), revokes
  all credentials and sessions, erases the display-name hint and any
  contact data, and severs the link from slots to the player. Past
  games keep their scores under an anonymous slot label ("Deleted
  player") so other players' standings and published event totals do
  not move. The player's own history rows are erased, not anonymized:
  erasure means erasure for the requester.
  *Owner review point:* whether published event totals freeze at
  publication (recommended) or recompute after a deletion. Freezing is
  recommended — recomputation would let one person's deletion rewrite
  everyone else's championship.
- **Room deletion:** host-only, explicit, irreversible. Deletes the
  room snapshot, book, and claim files, and removes the room from its
  event (event totals freeze as published; the room's games no longer
  count toward *future* derivations).
- **Room expiry:** configurable inactivity TTL (e.g. rooms untouched
  for N days are archived, not deleted, with host notice). Archival
  moves snapshots out of the live load path; restoration is a host
  action. No TTL is enabled by default until the owner picks N.
- **Data export:** a player can export their own history as JSON
  (player record, participations, achievements, attendance). Export is
  per-player and authenticated by their credential.

## 7. Incremental adoption (no big-bang rewrite)

1. **Phase 0 — safety, no schema change.** Atomic snapshot writes
   (temp + rename). Room-file load failure becomes loud (log + count)
   instead of silently dropping the room. These two changes are
   safe to make before anything else and fix the audit's top
   data-loss risks.
2. **Phase 1 — players and sessions, additive only.** Add a
   `players.json` store (or one file per player) and a `sessions`
   store beside the existing room snapshots. Slots gain nullable
   `playerId`; old snapshots load with `playerId` undefined. Add the
   link endpoint (present slot token → create/attach player) and the
   session endpoints (create/revoke/list own sessions). The engine,
   scoring, and projections are untouched; history rows are written
   from game-finish events, not recomputed from snapshots.
   Acceptance: a linked player keeps history across two rooms and
   two devices; an unlinked guest flow is byte-for-byte unchanged.
3. **Phase 2 — events and frozen achievements.** Add events,
   memberships, participations, attendance days, and earned
   achievements as new stores. Family Cup becomes the `family-cup`
   template with its config frozen per event. Championship derivation
   runs across an event's rooms using the existing functions.
   Acceptance: one event spanning two rooms produces correct totals;
   old single-room championships are unchanged.
4. **Phase 3 — optional verified accounts (deferred, needs review).**
   Pick a verification mechanism only after reviewing real provider
   terms and privacy policy. No password storage is designed at any
   phase. If no provider is approved, the system stays guest-only and
   loses nothing — Phases 1–2 are complete without it.
5. **Phase 4 — lifecycle.** Room expiry/archival, room deletion,
   player deletion, data export, slot reclamation. Each behind its own
   review, since each touches retention promises.

At every phase, the existing room engine remains the authority for
games, and the new stores are additive files the old loader ignores.
A rollback at any phase is "stop writing the new stores"; old rooms
keep working because their snapshots never depended on the new layer.

## 8. What this architecture deliberately does not do

- No password authentication, at any phase.
- No assumed free authentication service — Phase 3 names no provider.
- No global display-name registry or "username" system.
- No cross-room visibility between strangers; history is private by
  default.
- No rewriting of the scoring engine, ledger, dedupe, or projection
  rules. The Family Cup rules stay exactly as approved.
- No destructive migration: old snapshots load with defaults, and no
  step deletes or rewrites existing room data.
