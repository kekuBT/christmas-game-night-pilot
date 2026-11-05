# Tournament Identity Review (ChatGPT Milestone I review, §1)

Architecture checkpoint only. Nothing in this document is implemented.
It verifies the current implementation against the code (not against
Milestone E's audit from memory), answers the review's eight identity
questions, and proposes the smallest privacy-conscious identity step
appropriate for a private, no-mandatory-account family platform. It
builds on `docs/IDENTITY_AND_PERSISTENCE_AUDIT.md` (Milestone E) and
`docs/PLAYER_HISTORY_ARCHITECTURE.md` (E's target proposal) but
deliberately proposes less than E's full target: the smallest step
that fixes the worst failure (lost token = lost player) without
accounts, passwords, email, or a new database.

## Verified current state (code-grounded, 2026-11-04)

All claims below were re-checked against the current tree during this
review. File references are to the tree at review time.

### The one-sentence version (unchanged from E, re-verified)

Mchezo has **no player identity**. It has **room-scoped slots**
(`player-N`) addressed by a **bearer recovery token** that lives only
in one browser tab's `sessionStorage`. Standings, championship totals,
and achievements are **derived at projection time from one room's
finished games**, never stored as a player record.

### 1. How is a player identified within a room?

By a slot plus a bearer token (`src/server/room.ts`, `join()`):

- Slot id: `player-${nextPlayer++}`, a per-room counter from 1. The
  same `player-3` in two rooms is two unrelated slots.
- Display name: free text, trimmed, capped at 32 chars
  (`sanitizeText`, `src/shared/protocol.ts`). It is a label, not an
  identifier — see §5.
- Recovery token: 32 random bytes, hex-encoded
  (`createRecoveryToken`). Only its SHA-256 hash is stored
  (`hashToken`); the raw token is returned once at join and never
  stored server-side.
- Avatar is currently hardcoded `"🎄"` for every slot (join sets it
  unconditionally); it identifies nothing.
- Spectators (Milestone B, decision L40) are a separate map
  (`spectator-N`) with their own tokens, disjoint from players by
  construction: no seat, no score, no standings.

### 2. How does identity survive refreshes, disconnects, reconnects?

- **Page reload, same tab:** survives. The token lives in
  `sessionStorage` (`cgn_roomId`, `cgn_playerId`, `cgn_token` in
  `apps/web/src/App.tsx`), which survives reloads in the same tab.
- **Disconnect (tab closed, network lost):** the slot survives as
  `connected: false` (the "Away" marker). Reconnect restores it only
  with the token: `reconnect()` requires
  `hashToken(token) === player.recoveryTokenHash`, else "Recovery
  token does not match". The WebSocket auto-reconnect (decision L32)
  only helps while the tab still holds the token.
- **Server restart:** slots, games, rawScores, ledger, and token
  hashes survive via JSON snapshots (`data/<roomId>.json`); snapshot
  restore deliberately marks every player disconnected (decision
  L34), so no phantom player blocks a game. Connections themselves do
  not survive; clients reconnect with their tokens.
- **Guarantee:** the token is the *only* bridge between a browser and
  a slot. There is no second factor, no fallback, no host override,
  and no session-transfer flow.

### 3. Can a returning player be recognized across rooms, sessions, days?

- **Across sessions within one room:** yes, if and only if the token
  survives (same tab, same sessionStorage). Otherwise no.
- **Across rooms:** no. Rooms are islands (`Map<roomId, RoomEngine>`,
  `src/server/http.ts`); there is no global player registry, no
  cross-room id, no account id. A person who plays in two rooms is two
  unrelated slots, even with the same display name.
- **Across days:** only within one room's championship. The seven-day
  Family Cup is seven advances of *one room's* `championshipDay`
  (`advanceDay`, max 7, refused while a game is playing); the cup's
  results are keyed by `${slotId}:${day}` inside that room
  (`championshipResults()`). A player who loses their token mid-cup
  and rejoins as a new slot starts the cup from zero; the old slot's
  days stay behind, orphaned, still counting toward that slot's total.
- **Intent vs guarantee:** we *intend* a family to be recognizable
  across game nights; the implementation *guarantees* nothing beyond
  one room and one surviving token.

### 4. Can two people using the same display name collide?

- **Within one room:** no, by rejection. `join()` rejects a name
  matching any existing slot's name case-insensitively ("Display name
  already taken"), while storing the original casing — so "Ada" and
  "ada" collide even though they would display differently.
- **Across rooms:** yes, freely. Names are namespaced per room.
- **Collision as impersonation:** joining cannot impersonate an
  existing slot — a new joiner gets a *new* slot, never an existing
  one, and acting as a slot requires its token. The real collision
  hazard is the reverse: a name is permanently reserved by its slot,
  including orphaned slots (see §5).

### 5. What happens on device switch or cleared storage?

Exactly the same thing: the session is lost irrecoverably.

- New device, cleared storage, closed tab (sessionStorage dies with
  the tab), private-browsing exit — all destroy the only copy of the
  token. The player must join as a **new slot with a new display
  name**, because the old name is still reserved by the orphaned slot.
- The orphaned slot keeps its scores, standings, and championship
  contribution, and shows as Away forever. There is no kick, remove,
  or name-release endpoint.
- There is no mechanism to move a session between devices: no
  transfer link, no QR code for an existing slot, no account to sign
  into. A player who starts on a phone and continues on a tablet is
  two different players for every score, standing, and achievement.
- **This is the highest-consequence identity gap.** It is also the
  most common real failure (cleared storage and new devices happen
  far more often than token theft), and it bites before any other gap.

### 6. How are host/cohost permissions bound to identity?

By slot id, derived server-side from the token — never from a client
field. The binding is:

- `hostId`: the slot id of the first host join
  (`isHost = asHost && hostId === null`). It never changes: granting
  cohost never transfers host ownership, and the original host
  regains authority on reconnect.
- `cohosts`: a server-side set of slot ids plus an `isCohost` flag on
  the slot. `grantCohost` requires the actor to be host or cohost
  ("Only host/cohost can grant cohost"), and cohosts may delegate to
  further cohosts (decision L34 host recovery) — so a room whose host
  disconnects keeps an operator chain.
- Every privileged action checks the same predicate server-side:
  `hostId === actorId || cohosts.has(actorId)` (start game, advance
  day, override score, skip timed-out game, grant cohost).
- **Gaps:** (a) the host-claim token (`<roomId>.claim.json`) only
  works while `hostId === null` — once a host exists it cannot
  recover a lost host. (b) If the host *and* all cohosts lose their
  tokens, the room is permanently operator-less: no new host can be
  claimed, no game can start, no day can advance. (c) Host/cohost
  status is room-scoped like everything else; there is no "family
  organizer" that persists across rooms.

### 7. How do Family Cup results associate with a participant over seven days?

By slot id, within one room, derived from finished games:

- `championshipResults()` groups finished, official, non-timed-out
  games by `${slotId}:${day}` (day = the day the game was *started*
  on; advancing closes a day for future games, never rewrites past
  ones), then applies the approved rules (per-game midrank, solo/team
  split, daily 75/25, best three days, ≥3 qualifying days,
  participation +5/day beyond three capped +20, finale ladder).
- Attendance is derived, not recorded: a player "attended" a day if
  they appear in at least one qualifying game started that day.
  Abstainers count as participants with a zero (deliberate semantic,
  worth preserving in any redesign).
- Practice games, timed-out games, and spectators never count.
- **Consequence:** the cup's unit of association is the slot, not the
  person. Slot loss mid-cup splits one person's cup across two slots
  (old days under the orphan, new days under the new slot, neither
  eligible as a whole unless each independently qualifies).

### 8. Can existing records migrate to a durable model without losing history?

Yes for per-room history, no for cross-room unification:

- **Preservable:** every slot's history is intact in its room
  snapshot (slot fields, finished games' `rawScores` keyed by slot
  id, ledger events with `playerId`, day attributions). A migration
  can add a `personId` field to each slot and each game/ledger
  reference, mapping slot → person, without touching a single score:
  standings derive through the mapping exactly as they derive from
  slot ids today. This is additive and reversible (drop the mapping
  and the old derivation returns).
- **Not recoverable:** which slots in *different* rooms belong to the
  same person. No signal links them (names are explicitly not
  identifiers — two rooms' "Ada" slots may be different people, and
  one person's slots may carry different names). Name-based merging
  would be fabrication, not migration, and is rejected here.
- **Orphaned slots:** migration carries them as unclaimed person
  records (history preserved, no owner). They become claimable only
  through the recovery mechanisms in the proposal below — never by
  name matching, never by host assertion alone without an audit trail.
- **Precondition (from E, still open):** snapshot writes are
  synchronous non-atomic `writeFileSync` after every mutation. A
  crash mid-write can tear a room file, and a corrupt room file is
  silently dropped at load. Atomic write (temp file + rename) should
  land *before* any migration writes new fields, because a migration
  multiplies the number of writes. This is a small, independent fix
  and the cheapest high-value integrity item in the whole audit.

## Proposed smallest identity model (proposal, not implemented)

Design goal: fix lost-token = lost-player with the least new
machinery, no accounts, no passwords, no email, no new database, and
privacy by default. Everything below reuses what exists (slots,
token hashes, ledger, host/cohost predicates) and adds one entity:
a **person record**.

### The model (four additions, nothing else)

1. **Person record** (server-side, per server, not portable):
   `personId` (`pl-<uuid>`), display name (for the roster UI only —
   never a key), `createdAt`, and a list of linked slot ids (each
   entry: room id + slot id). A person record holds no scores; scores
   stay where they are (games' `rawScores` keyed by slot id) and
   derive through the link. Deleting a person record anonymizes the
   link (slots keep their scores under their slot ids; the person's
   name is removed) — history is never deleted with the person.
2. **Guest credential** (the existing recovery token, kept): the
   token remains the only credential, still stored hashed, still
   returned once. No passwords are introduced at any point.
3. **Device sessions** (per-device, revocable): today's single
   sessionStorage token becomes one of potentially several device
   sessions per person. Default storage stays `sessionStorage`
   (private by default — a shared family tablet must not leak the
   next user's session). An explicit, per-device opt-in ("Remember
   this device") stores that device's session in `localStorage`
   instead. Each session is independently revocable by the person
   (and, for lost devices, by host-assisted recovery below).
4. **Recovery code** (the one new credential): at first join, the
   person is shown a short, printable recovery code (a second random
   credential, stored hashed like the token). Entering the code on
   any device restores the person's slots in that room (it reissues a
   device session for the existing slot — it never creates a new
   slot and never frees a name). The code is shown once, like the
   token is returned once; losing both the token and the code is
   still unrecoverable by design (see tradeoffs).

### Recovery, impersonation, device-loss tradeoffs

- **Recovery paths, in order:** (a) surviving token (same tab/device)
  — automatic, as today; (b) recovery code on any device — restores
  the same slot, no new name needed; (c) host-assisted recovery —
  the host reissues a session for a slot after confirming the person
  (family-appropriate: the host already holds score-override power).
  Path (c) is the impersonation-sensitive one, so it must write a
  `session-recovered-by-host` ledger event and announce it in the
  room ("Ada's session was recovered by the host"), giving social
  accountability instead of cryptographic proof. A host who abuses
  it leaves a visible trail — the same accountability model as score
  overrides today.
- **Impersonation vectors, honestly:** the realistic vector on a
  family server is physical device access (an unlocked phone *is*
  the session), which no software identity model fixes without
  adding friction (PINs, biometrics) that this platform should not
  impose for party-game scores. Remote vectors stay narrow: tokens
  and codes are 32-byte random values, never in URLs (WS subprotocol
  headers), never displayed in UI, stored hashed. Join codes remain
  non-credentials by design — anyone with a code can join as a *new*
  player, never as an existing slot.
- **Device loss:** a lost device's session is revoked when recovery
  happens (the recovered session supersedes; the old device's token
  stops working for new actions — exact supersede-vs-revoke semantics
  are an unresolved decision below). A lost device alone never loses
  the player anymore, because the recovery code is device-independent
  — provided the player saved it. That proviso is the model's central
  weakness, and host-assisted recovery is its backstop.
- **Shared-device privacy:** default sessionStorage means a guest on
  a shared tablet leaves no session behind when the tab closes. The
  localStorage opt-in is per-device and visibly indicated ("This
  device remembers you — sign out to forget it"), with an explicit
  sign-out that clears it. No silent persistence.
- **Name squatting, deliberately not "fixed":** names are still never
  freed within a room's life, because freeing a name would break the
  audit trail (two slots, one name, in one ledger). Recovery (same
  slot, same name) is the answer, not release. At room archival (see
  the lifecycle review), names stop mattering because the room stops
  accepting joins.
- **What this model does NOT do:** no cross-device automatic sync
  (a session is per-device until the recovery code is used), no
  merging of two slots' scores (a person who already has two slots
  in one room keeps both; scores never combine — merging would
  rewrite history), no federation or portability between servers, no
  account upgrade path (that is E's deferred AccountLink, still
  deferred — a person record is not an account and must never be
  presented as one).

### Unresolved decisions (require owner approval before implementing)

1. **Recovery-code format:** length and alphabet (short enough to
   write down, long enough to resist guessing — e.g. 4×4-letter
   groups vs a numeric code). Usability vs entropy; family members
   include children and grandparents.
2. **Host-assisted recovery:** allowed at all? If yes, what
   announcement and what waiting period, if any? (Proposal: allowed,
   ledger event + room announcement, no waiting period — the host is
   already trusted with score overrides — but this is the owner's
   call because it is the one path that lets a third party seize a
   slot.)
3. **Session supersede semantics:** when a slot is recovered on a new
   device, does the old device's session stop working immediately,
   or do sessions coexist until revoked? (Proposal: coexist until
   explicitly revoked, except the recovered session marks the old one
   "superseded" in the UI — but coexistence weakens the lost-device
   story.)
4. **Opt-in persistence default:** sessionStorage default with a
   localStorage opt-in (proposal), or localStorage default with a
   private-mode opt-out? (Proposal is the former: privacy by default.)
5. **Orphaned-slot display linking:** may a host *annotate* (not
   merge) that two slots are the same person for display ("Ada (Dec)
   — previously Ada (Nov)"), with scores kept separate? (Proposal:
   yes, host-attested, reversible, display-only — it heals the social
   story without rewriting history. Needs owner approval because it
   introduces host-attested identity claims.)
6. **Atomic snapshots before migration:** agreed as a precondition?
   (Proposal: yes — temp file + rename, no behavior change, lands
   before any identity write.)

## Gaps summary (guarantees vs intent)

| Area | Guaranteed today | Intended later (not guaranteed) |
|---|---|---|
| Same-room, same-tab return | Yes (token in sessionStorage) | — |
| Same-room return after tab close / storage clear / new device | No — new slot, new name | Yes, via recovery code + host-assisted recovery |
| Cross-room recognition | No | Yes, via person records (opt-in per credential, never by name) |
| Cross-day (cup) continuity | Only within one room while the token survives | Yes, via person records + same-slot recovery |
| Host/cohost continuity | Only while an operator's token survives | Yes, via person records; host transfer still needs its own decision |
| Name uniqueness | Within a room only, forever (incl. orphans) | Same (deliberate); recovery replaces release |
| Score history preservation | Per-room, per-slot, intact | Same, plus person-linked views (never merged) |
| Impersonation resistance | Token secrecy + server-side derivation | Same, plus audited host-assisted recovery |

## Boundary compliance

No accounts, authentication, permanent identities-as-accounts, or
new database are implemented by this document. The person record is
a proposal for review. No scoring rule, Family Cup rule, or game
mechanic is changed. No migration is performed. Implementation of any
part requires the owner's explicit approval of the unresolved
decisions above.
