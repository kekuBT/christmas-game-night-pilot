# Mchezo — Identity and Persistence Audit (Milestone E)

Code-grounded audit of how Mchezo identifies players today and what
actually survives. Read against the tree at audit time (master plus the
uncommitted Milestone C change; C touched only web UI, the standings
library, drivers, and docs — no server identity code). Every claim below
names the file that establishes it. Nothing in this document implements
a change; the target architecture lives in
`docs/PLAYER_HISTORY_ARCHITECTURE.md`.

## The one-sentence version

Mchezo has **no player identity**. It has **room-scoped slots**
(`player-N`) addressed by a **bearer recovery token** that lives only in
one browser tab's `sessionStorage`. Everything that looks like history —
standings, championship totals, achievements — is **derived at
projection time from one room's finished games**, never stored as a
player record. A player who loses their token, clears storage, or
switches devices is gone: their slot (and its scores) stays behind,
orphaned, under a name nobody can ever reuse in that room.

## The 15 audit questions

### 1. How are player identities generated?

There is no identity generator. Joining creates a **slot**, not an
identity (`src/server/room.ts`, `join()`):

- Slot id: `player-${nextPlayer++}`, a per-room counter starting at 1.
  The same `player-3` in two rooms is two unrelated slots.
- Display name: free text, trimmed, capped at 32 chars
  (`sanitizeText` in `src/shared/protocol.ts`), no uniqueness beyond
  the room.
- Room id: `room-${Date.now().toString(36)}-${random(1e6)}` — time-based
  with a small random suffix; not a UUID, not collision-proof in theory
  (same millisecond + same 6-digit roll), fine in practice.
- Join code: 6 characters from a 32-character alphabet
  (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, `createJoinCode`), explicitly
  "not a security credential" — it only names a room.
- Recovery token: 32 random bytes, hex-encoded (`createRecoveryToken`).
  This token is the player's **only credential**.
- Host claim token: a separate `randomUUID()`, issued once at room
  creation (`src/server/http.ts`, `POST /rooms`) and persisted beside
  the snapshot in `<roomId>.claim.json`. It authorizes claiming host
  only while no host exists yet (engine: `isHost = asHost && hostId ===
  null`); it cannot steal an existing host.
- Spectator id: `spectator-${nextSpectator++}` with its own
  `createRecoveryToken()` token (Milestone B, decision L40).

### 2. Which IDs persist across room sessions?

The **slot** persists; the **session** does not:

- Slot ids, display names, host/cohost flags, and the **hash** of the
  recovery token persist in the room snapshot
  (`data/<roomId>.json`, written after every mutation by
  `LocalServer.persist()` in `src/server/http.ts`).
- The raw token is returned once at join/spectate time and never stored
  anywhere server-side. Only the SHA-256 hash is stored
  (`hashToken` in `src/shared/protocol.ts`).
- Nothing identifies a person across rooms: there is no global player
  registry, no cross-room id, no account id. `this.rooms` in http.ts is
  a `Map<roomId, RoomEngine>` — rooms are islands.

### 3. How are browser reconnection tokens stored?

In `sessionStorage` only (`apps/web/src/App.tsx`):

- `cgn_roomId`, `cgn_playerId`, `cgn_token` for players.
- `cgn_spec_roomId`, `cgn_spec_token` for spectators.
- Plus UI-only keys (`cgn_intro_dismissed`, `cgn_results_dismissed`).

`sessionStorage` survives a page reload in the same tab but **not** a
tab close, and it is never shared with another tab, window, or device.
This is the documented L10 trade-off (session token auth, no cookies,
no localStorage). Consequences are Q4/Q5 below.

### 4. What happens after clearing browser storage?

The player loses their session irrecoverably:

- Without the token, `/reconnect` cannot restore the slot
  (`room.reconnect()` requires `hashToken(token) ===
  player.recoveryTokenHash`, else "Recovery token does not match").
- There is no fallback: no email, no account, no host override, no
  "transfer session" flow, and no kick/remove endpoint that could free
  the name.
- The player must join as a **new slot** with a **new display name**,
  because the old name is still reserved by the orphaned slot (see Q6).
- The orphaned slot keeps its scores, its standings, and its
  championship contribution. It shows as Away (disconnected) forever.
- The WebSocket auto-reconnect (`wsBackoff.ts`) only helps while the
  tab still holds the token; it cannot resurrect a cleared session.

### 5. What happens on another device?

Exactly the same as clearing storage: a new device has no token, so it
gets a new slot with a new name. There is no mechanism to move a
session between devices — no session-transfer link, no QR code for an
existing slot, no account to sign into. A player who starts on their
phone and continues on a tablet is two different players as far as
every score, standing, and achievement is concerned.

### 6. Can two players share a display name?

Within one room: no. `join()` rejects a name that matches any existing
slot's name case-insensitively ("Display name already taken"), and
names are never freed because slots are never deleted. Across rooms:
yes, freely — names are namespaced per room, and nothing links them.
Edge case worth knowing: name comparison is case-insensitive but the
stored name keeps its original casing, so "Ada" and "ada" collide even
though both spellings would display differently.

### 7. Can players safely recover or link identities?

Recover: only with the recovery token (Q4). Link: no. There is no API
to merge two slots, transfer scores between slots, or attach a slot to
a later-created account. The host-claim token is unrelated — it claims
the host *role* in a hostless room, not a player identity. Any future
guest-to-account linking must be designed, not assumed
(see `docs/PLAYER_HISTORY_ARCHITECTURE.md`); it must also decide what
happens to the orphaned slot problem, because linking alone does not
fix names that are permanently reserved by lost sessions.

### 8. How are official results stored?

Official results are **not stored as results**. What is stored, per
room snapshot:

- Every `GameInstance`: `gameId`, `official` flag, `status`,
  `players[]`, `timedOut`, `day`, `answers`, `answerTimes`, `rawScores`,
  `seed`, `submittedPlayers`, `abstained`, and game-specific `extra`
  state (impostor/caption/closest/charades state, trivia questions).
- The append-only `ledger`: one event per join, reconnect, cohost
  grant, day advance, score override (with `previousPoints`, `reason`,
  and `actor`), and per-game scoring events, each with a sequence
  number (`seq`) and timestamp.
- `seenIntents` (dedupe table, Q12).

What is **derived at projection time, every time**, and stored nowhere:

- `officialStandings()`: midrank-normalized sums over finished,
  official, non-timed-out games with ≥2 scorers.
- `championshipResults()`: the Family Cup computation from
  `src/scoring/championship.ts`.
- `achievements()`: evaluated from the ledger + finished rawScores on
  every projection.
- `ceremony()`: the current day's standings, same derivation.

So "official results" means: finished official games' `rawScores`
inside the room snapshot, plus the rules that derive standings from
them. There is no results table, no per-player history row, and no
record that survives the room file being deleted.

### 9. What survives a server restart?

Almost everything room-shaped, nothing connection-shaped:

- Survives (JSON snapshot files in `data/`): rooms, slots, games,
  answers, rawScores, ledger, seenIntents, counters, championship day,
  host-claim tokens (`.claim.json`), Memory Book entries (`.book.json`).
- Does **not** survive: WebSocket connections (clients must reconnect;
  the browser auto-reconnect handles this while it holds a token),
  `connected` flags (snapshot restore deliberately marks every player
  and spectator disconnected — decision L34 — so no phantom players
  block games), reactions and nudges (in-memory only, ephemeral by
  design, never persisted, never in the ledger).
- Corruption tolerance is per-file and narrow: a corrupt claim or book
  file is skipped without losing the room; a corrupt room snapshot
  itself is not recovered (the load loop catches per-file JSON errors
  only around claim/book restores, and a room file that fails its
  shape check is simply not loaded — the room is silently absent).
- Snapshot writes are synchronous `writeFileSync` after every
  mutation, with no atomic rename and no backup: a crash mid-write can
  leave a torn snapshot. This is the single most concrete data-loss
  risk in the current design.

### 10. Can a championship span multiple rooms or restarted sessions?

Restarted sessions: yes — the championship is room state
(`championshipDay`, finished games), and room state survives restarts
via snapshots (Q9). Multiple rooms: no. `championshipResults()` reads
only `this.games` of one `RoomEngine`; there is no cross-room
aggregation, no event object, and no way to combine two rooms' games
into one championship. A "season" that outlives one room, or a family
that plays in two rooms, has no championship that covers both. The
seven-day Family Cup is a property of a room, not of a group of
people.

### 11. How are attendance and team results attributed?

There is no attendance record and no team entity:

- Attendance is **derived**: a player "attended" a championship day if
  they appear in at least one finished, official, non-timed-out game
  started that day (with ≥2 scorers). The participation bonus
  (+5 per qualifying day beyond three, capped +20) counts those days.
  Nobody stores "Ada was here on Day 3" — it is recomputed from games.
- The solo/team split in championship scoring is by **game type**, not
  by team membership: `getGame(g.gameId).modes` says `solo` or `team`
  (only Charades is `team` in the registry). A player's day score is
  75% solo-game mean + 25% team-game mean (or the configured
  single-category fallback). Charades' own within-game teams (two teams
  split alternately by join order, stored only in that game's `extra`
  state) do not persist anywhere and play no role in championship
  attribution beyond the game's rawScores.
- Spectators never count toward attendance (disjoint by construction,
  L40). Practice games and timed-out games never count. Abstainers do
  count as participants of the game they sat out (they hold a 0
  rawScore entry), which is a deliberate semantic worth keeping in any
  redesign: abstention is participation with a zero, not absence.

### 12. Can results be duplicated, replayed, or altered?

- **Duplicated intents:** no, within a room. Every intent carries a
  client-generated UUID (`clientEventId`, `IntentSchema`); the engine
  keys `seenIntents` by `roomId:actorId:clientEventId` and replays the
  stored result for a repeat instead of re-executing. The table is
  persisted in the snapshot, so dedupe survives restarts.
- **Replayed actions:** a *new* UUID re-executes the action, and only
  game rules stop double effects (e.g. answering the same question
  twice is rejected `ALREADY_ANSWERED`; voting twice is rejected by
  phase logic). Dedupe is exactly-once per envelope, not per action.
- **Altered scores:** exactly one sanctioned path — host/cohost
  `overrideScore`, which requires a reason, records `previousPoints`,
  and writes a `score-override` ledger event; standings derive from
  `rawScores`, so the override flows through automatically and visibly.
  It is refused for timed-out games and for players not in the game.
- **Unrecorded alteration:** the snapshot files are plain JSON on the
  server's disk with no signature and no hash chain. `ledgerChecksum()`
  hashes the current ledger, so it changes consistently with any edit
  — it cannot detect tampering, only accidental corruption *if* someone
  had previously recorded the checksum somewhere, which nothing does.
  Filesystem access to `data/` is therefore equivalent to full write
  access to all results. This is acceptable for a local, invitation-only
  server and unacceptable for any hosted deployment — a hosting design
  must treat snapshot integrity as a requirement, not a footnote.

### 13. What happens when a room expires?

Nothing expires. There is no room deletion endpoint, no TTL, no
cleanup job, and no archive. Rooms accumulate in memory and in `data/`
forever (one `<roomId>.json` + optional `.book.json` + `.claim.json`
per room). Consequences: unbounded disk growth in exact proportion to
rooms created; join codes remain valid indefinitely (they are not
credentials, but a code shared once works forever); and there is no
way for a host to retire a room, delete its data, or honor a "forget
this game night" request. Any retention/deletion story must be built.

### 14. Which statistics can already be derived?

From one room's snapshot, without new storage:

- Per-game rawScores, per-player totals, ranks with shared-rank ties.
- Official standings (midrank sums) and Family Cup totals
  (best-3 days + participation + finale), eligibility, qualifying days.
- Day standings and ceremony winners.
- Achievements (from ledger + finished rawScores).
- Per-question trivia aggregates post-finish (answerCounts,
  questionPoints); per-player own answers and own scores (private
  projection only).
- Win counts per game type (rank 1 in finished games), podium counts,
  participation counts — all computable from rawScores, none stored.

### 15. Which pieces are missing entirely?

- A persistent player entity (anything that outlives a room).
- Cross-room identity, accounts (optional or otherwise), and any
  guest-to-account linking or slot merging.
- A team entity (persistent teams, rosters, team history).
- An event entity (a championship/event that is not just "this room's
  games").
- Stored per-player history: game history, per-game-type performance,
  wins/ties/streaks, personal records, per-category accuracy.
- Stored achievements (they are derived, so a rule change rewrites
  history retroactively — achievements earned under old rules are not
  frozen).
- Attendance as a record (it is derived from games).
- Score-correction audit beyond the ledger (the ledger is good; there
  is no separate corrections table, no correction reversal, no
  append-only tamper evidence).
- Room lifecycle: expiry, deletion, archival, data export, data
  erasure.
- Session recovery: anything beyond the single bearer token in one
  tab's sessionStorage (no device transfer, no recovery codes, no
  host-assisted recovery, no name reclamation).

## Risks, in order of consequence

1. **Lost token = lost player, permanently.** The most common real
   failure (cleared storage, new device, closed tab) has no recovery
   path and permanently reserves the display name. This will bite
   before any other gap does.
2. **Torn snapshot on crash.** Synchronous non-atomic snapshot writes
   mean a crash mid-write can corrupt a room file, and a corrupt room
   file is silently dropped at load. Atomic write (temp file + rename)
   is the cheapest high-value fix in the whole audit.
3. **No tamper evidence on snapshots.** Plain JSON + a self-consistent
   checksum is not integrity. Fine locally; a blocker for hosting.
4. **Achievements rewrite history.** Derived achievements mean a rule
   change restates the past. Freeze earned achievements at earn time
   when persistence arrives.
5. **Unbounded room accumulation.** No expiry or deletion; disk and
   load time grow with every room ever created.
6. **Championship is room-bound.** Any multi-room or recurring-group
   story (the stated product direction) needs an event layer; the
   current model cannot express it.
7. **Name squatting by orphaned slots.** A lost session's name is
   reserved forever, with no reclaim path. Any identity design must
   include slot reclamation (expiry, host reclaim, or token rotation).

## What is already good (do not regress)

- Token hygiene is sound: only hashes stored, raw tokens returned
  once, tokens never in URLs (WS subprotocol headers), actor identity
  derived from the token server-side, never from client fields.
- Projection discipline is sound: public/TV/player/host audiences are
  distinct, private answers and pre-reveal keys never leak, spectators
  are disjoint by construction.
- Dedupe + ledger + audited overrides are a solid integrity core for
  one room. The target architecture should extend them, not replace
  them.
- Snapshot migration defaults are careful (championshipDay → 1,
  spectators → none, never phantom state).

## Boundary compliance

No password authentication is proposed or implemented here. No
destructive migration is proposed. No scoring rule is changed. No
parallel identity system is created by this document — the target
architecture in `docs/PLAYER_HISTORY_ARCHITECTURE.md` is a proposal
with an incremental, backward-compatible adoption path, and any
implementation of it needs review before it touches the live engine.
