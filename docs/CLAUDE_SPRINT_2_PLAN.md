# Sprint 2 Plan: Real-World Resilience, Guest Identity, Player Experience

Branch `claude/sprint-2-player-resilience` from `b3b2584` (Sprint 1, verified 35/35).
Contracts used: `docs/RECOVERY_CONTRACT.md` (codes §1, host-assisted §2, supersede §3), `docs/PERSISTENCE_CONTRACT.md` (atomic units).

## What the code represents today (inspected)

| Concept | Today | Problem |
|---|---|---|
| Room membership | `RoomPlayer` in `room.players`; names never freed | none (kept) |
| Browser credential | one random token per slot; its hash is stored as `recoveryTokenHash` (a legacy name: it is the *session* credential) | no rotation, no version, so it cannot be superseded |
| Game participation | `GameInstance.players`, fixed at start from players with `connected === true` | a phone asleep at Start is silently left out |
| Presence | `connected: boolean`, true while any socket is open | no "reconnecting" state, no timestamp; a half-open socket (locked iPhone) can look connected for a long time |
| Reconnect | WebSocket open sets `connected`; `/reconnect` sets it with no socket at all | phantom presence |
| Lost token | nothing | seat lost forever (name locked) |
| Restart | everyone `connected=false` | no grace after a restart |

## Design

**Presence (A).** Membership, participation and presence stay separate fields:
- `RoomPlayer` keeps `connected` (socket open: the existing completion rule reads it, unchanged) and gains `disconnectedAt`. Presence is derived, never stored: `connected` → *connected*; otherwise *reconnecting* within 45 s of `disconnectedAt`, then *away*. It is computed on read from server time, using an injectable clock, with no per-player timers.
- A single unref'd server heartbeat (ping/pong) terminates half-open sockets, so a locked phone becomes *reconnecting* within about one interval instead of after TCP's hours.
- Sockets carry the slot's `credentialVersion`. A socket whose version is stale can neither act nor keep the slot "connected". A stale close never marks a player offline while a newer socket is open (existing per-actor rule, now tested).
- Restart: restored players get `disconnectedAt = restart time`, so everyone has the 45 s grace.
- **Unchanged on purpose:** completion thresholds (`activePlayers`), rosters, abstention, deadlines, scoring.

**Readiness (B).** `readiness` is in every projection: counts plus per-player presence; the host additionally sees who would play and who would miss out. `POST /games` accepts `roster` (the roster the host saw) and `proceedWithout` (the reconnecting players they chose to leave out). The server refuses with 409 when:
- the roster changed since it was displayed (`ROSTER_CHANGED`), or
- for an official game, a player is still in the 45 s window and was not explicitly left out (`PLAYERS_RECONNECTING`).

Eligibility is unchanged: only connected players are added. Nobody is added after the start. Requests that omit `roster` keep the old behaviour, except for the reconnecting-player check on official games.

**Guest persistence (C).** One client module (`apps/web/src/session.ts`) owns every credential read and write:
- `sessionStorage` by default; `localStorage` only after "Remember this device" consent. The session is moved between them, never duplicated.
- Memory fallback when storage throws. Up to 5 remembered rooms.
- "Welcome back. Continue as Ada?" is shown only after `GET /rooms/:id/session` confirms the credential.
- An invalid credential is forgotten, with safe next steps and no duplicate seat.

**Recovery (D).** Per the contract:
- 20-character, about 100-bit codes from `randomBytes`, stored as SHA-256 hashes, shown once, single-use.
- On recovery the code is rotated, the session credential is rotated, `credentialVersion` is incremented, a `seat-recovered` ledger event is recorded and a room notice is shown.
- Old sockets are closed with 4001 SESSION_REPLACED, and old tokens get 401.
- In-memory changes are rolled back if the save fails.
- Rate limits: 5 failed attempts per client address per room per 15 min, and 30 per room.
- Host-assisted recovery:
  - the requester picks a seat and gets a request secret plus a 4-digit match code;
  - the host or a cohost approves that exact slot after comparing the match code;
  - the requester collects the new credential with the secret; rotation and save happen at collection;
  - requests expire after 10 minutes and are single-use;
  - approval is audited and announced to the room;
  - an operator cannot approve their own slot.
- No owner/admin bypass (not authorized).

**Persistence (E).** New fields are optional in the v2 snapshot (`credentialVersion`, `recoveryCodeHash`, `disconnectedAt`), and legacy rooms load with defaults. Recovery rotation is one atomic save, with rollback on failure.

**Policy (F).** `docs/GAME_LIFECYCLE_POLICY_PROPOSAL.md`: an 11-game matrix and timing models, as a proposal only.

**Tests (G, I).** Harness gains a fake clock and per-socket control. A real-server scenario suite covers the 40 listed cases. Driver answer helpers wait on observable states and fail with context instead of returning silently.

## Order

1. presence → 2. readiness + host UI → 3. sessions + resume → 4. recovery codes + host-assisted + UI → 5. drivers, policy doc, screenshots, full gate on the final commit.

## Compatibility risks

- Clients and drivers that POST `/games` without a `roster` while a player is reconnecting will get 409 on official games: the intended behaviour. Drivers will be updated.
- Snapshot readers older than this sprint ignore the new optional fields (`passthrough`). They would accept rotated credentials but not enforce recovery rate limits.
- Pending host-assisted requests live in memory: a restart drops them, and the requester simply asks again.

## Needs owner decision (not done here)

The timing models, disconnect-based completion, partial scoring, timed-out games, Charades, the Math bonus and room-owner recovery are written up in the policy proposal. They are not implemented.
