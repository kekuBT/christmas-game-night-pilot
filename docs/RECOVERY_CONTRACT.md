# Recovery Contract — room-session recovery, host-assisted recovery, supersede

> **Implementation status (Sprint 2, branch `claude/sprint-2-player-resilience`).** §1 recovery codes, §2 host-assisted recovery and §3 supersede are implemented as specified. The code is in `src/server/room.ts` (`issueRecoveryCode`, `slotForRecoveryCode`, `rotateCredentials`), `src/server/recovery.ts` (rate limits, pending requests) and `src/server/http.ts` (routes, `recoverSeat`), and the UI in `apps/web/src/components/mchezo/Recovery.tsx`. Tests: `tests/recovery.test.ts`, `scripts/check-recovery.mjs`.
>
> **Implementation choices (within this contract):**
> - Rate limits key failed attempts by client address, because a wrong code identifies no slot: 5 per device per room, 30 per room and 20 per device in total, each per 15 minutes. Failures are audited without the guessed values.
> - Rotation and its save are one atomic snapshot write; if the save fails, the in-memory change is rolled back and the client gets a 500.
> - Host-assisted recovery binds approval to the requesting device. The device holds a secret plus a 4-digit match code shown on both screens. The operator approves the exact slot id, and the credential is minted only when that device collects it.
> - An operator cannot approve their own seat.
>
> **Social-trust limitation (§2.2), restated:** a mistaken or malicious host or cohost can approve the wrong person. The match code only makes an honest mistake less likely. The room notice and ledger event make every recovery visible, so it can be questioned. A cohost can restore the host's seat; the notice names who did it.
>
> **Contract inconsistency resolved:** §1.3 says "no L", but its listed 32-character alphabet includes L. The listed alphabet is used, because 31 symbols would bias `byte % 32`.
>
> **Still unresolved, by design:** if every host and cohost loses their credential and has no code, nobody can approve a host-assisted recovery. §4 (room-owner credential) was not authorized and is not implemented.

**Status: contract for review (Milestone J.2). No implementation is
authorized by this document.** It defines the threat model, storage
requirements, and safeguard contracts required by decisions A2–A6
before any recovery feature is built. Implementing any part needs its
own review; persistent tournaments additionally need the persistence
contract (`docs/PERSISTENCE_CONTRACT.md`) reviewed first.

## 0. The separation (decision A1)

Two distinct responsibilities, never conflated:

- **Room-session recovery** restores control of an *existing player
  slot* in *one room* (e.g., "I lost my phone; let me back into my
  seat"). It needs no person record, no cross-room identity, and no
  account.
- **Cross-room person identity** links participation across rooms or
  events ("these slots in different rooms are the same person"). It
  is a separate concern with its own design (see the identity
  review, `docs/TOURNAMENT_IDENTITY_REVIEW.md`) and is **not** part
  of this contract.

A global person record must never become mandatory merely to recover
a room slot. Every mechanism below restores a slot, never a person.

## 1. Recovery codes — threat model and storage (decision A2)

### 1.1 Purpose and non-goals

A recovery code lets a player who lost their session token (new
device, cleared storage, lost tab) regain control of their existing
slot, from any device, without host help. It does **not** create a
slot, free a display name, merge scores, link across rooms, or grant
host/cohost privileges — it restores exactly the slot's existing
privileges, nothing more.

### 1.2 Required properties (from decision A2, restated as requirements)

- Generated **server-side** with a cryptographically secure random
  source. Never derived from player names, room codes, timestamps,
  or sequential IDs.
- **Single-use**: consumed on first successful recovery. The
  recovery response issues a **fresh** code; the old code stops
  working immediately (its hash is replaced).
- Stored only as a **verifier/hash, never plaintext**. Displayed
  only at issuance. Explicit regeneration revokes the previous code.
- A code is bound to one slot in one room. It is not a room password
  and not a host credential.

### 1.3 Proposed format (the detail A2 left open)

- 20 characters from a 32-character unambiguous alphabet
  (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0`/`O`, no `1`/`I`/`L`),
  grouped `XXXXX-XXXXX-XXXXX-XXXXX` for transcription: 20 × 5 bits
  ≈ **100 bits of entropy**.
- Entry is case-insensitive; dashes and spaces are stripped before
  hashing. The format is long because recovery is rare (device loss)
  and the code must survive guessing attacks without depending on
  rate limiting alone (see §1.5).
- The code is shown once at issuance (with a "store this somewhere
  safe" prompt). It is never re-displayed, never emailed, never
  logged, and never included in any projection, snapshot export, or
  audit view. A player who loses the code uses host-assisted
  recovery (§2) or regeneration from an active session.

### 1.4 Storage

- Store `SHA-256(normalized code)` on the slot record, following the
  existing token-hash pattern (`recoveryTokenHash` today). The
  plaintext code exists only in the issuance response and the
  player's hands.
- Fast-hash storage is acceptable **because** the code has ~100 bits
  of entropy: offline brute force against a stolen snapshot is
  infeasible at that entropy. (A short code would need a slow hash
  and aggressive rate limiting instead — one more reason the format
  is long.)
- Consumption, new-code issuance, and the audit event must land in
  one atomic persistence unit (see `docs/PERSISTENCE_CONTRACT.md`).
  If the response is lost after consumption (network failure), the
  old code is gone and the new code was never received: the player
  falls back to host-assisted recovery (§2). This failure mode is
  accepted and documented rather than papered over with a
  re-delivery window, which would weaken single-use semantics.

### 1.5 Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| Code theft (screenshot, shared photo, shoulder-surf) | Single-use + supersede (§3): a stolen code used by an attacker invalidates the victim's session and triggers a room notification, so the room sees it | An attacker who uses a stolen code first gains the slot until the victim notices and recovers via host help |
| Guessing / brute force | ~100-bit entropy; rate limiting per room + per slot (proposed: 5 attempts per 15 minutes per slot, then temporary lockout); failed attempts audit-logged (never log code values) | None practical at 100 bits + rate limiting |
| Replay | Consumption on first use; the old hash is replaced immediately | None, provided consumption is atomic with issuance |
| Host abuse | Hosts cannot derive codes (hashes only, server-side generation); host-assisted recovery is a separate, audited path (§2) | A malicious host can still grant slots via §2 — that path's accountability is the audit + notification, not cryptography |
| Server snapshot theft | Hashes only; 100-bit codes are not brute-forceable offline | An attacker with snapshot write access can do worse than recover slots (they own the data) — out of scope for this contract |
| Device loss (token + code both gone) | Host-assisted recovery (§2); room-owner proposal (§4) for the all-operators-lost case | Without host help and without the code, a slot is unrecoverable by design — there is no backdoor |
| Shoulder-surfing at issuance | Display once; regeneration path for a code believed exposed | A code seen at issuance is usable until regenerated or consumed |

### 1.6 What a recovery code must never do

- Never authorize by display-name match (a matching name is not
  identity — names collide by design).
- Never restore a *different* slot, merge two slots, or change any
  score, standing, or championship record.
- Never be accepted for spectator or TV audiences (those have no
  slot to restore).

## 2. Host-assisted recovery — safeguard contract (decision A3)

Accepted as a **social-trust mechanism for private family games,
not strong identity verification**. That limitation must be
documented wherever the feature is described.

### 2.1 Required flow

1. The requester asks a host/cohost for help (the request channel —
   in-room button, out-of-band message — is future design; this
   contract covers the grant).
2. The host/cohost selects the **exact existing slot** from the room
   roster (slot id). A display-name match is **never** sufficient
   authorization, even when the name is unique in the room.
3. The server issues a new session credential for that slot and
   delivers it to the requester (delivery channel is future design;
   it must go to the requester, never broadcast to the room).
4. The old credential is invalidated (§3 supersede): hash replaced,
   live connections for that slot terminated with a
   session-replaced message.
5. A ledger event records the grant (`host-assisted-recovery`: actor,
   slot, timestamp).
6. A **visible room notification** is broadcast to all connected
   players ("Host restored <display name>'s seat"). Notification is
   mandatory, not optional — it is the accountability mechanism.

### 2.2 Explicit limits

- The grant restores the slot's existing privileges only. It does
  not promote the slot to host/cohost, free the name, merge scores,
  or touch championship records.
- The host's judgment is the verification. If a host is fooled, the
  attacker gains the slot. The audit event + notification exist so
  the room can detect and object — they do not prevent a fooled host.
- No hidden administrative bypass exists for the case where **all**
  operators lose access. That case is §4's separately reviewable
  proposal, not a silent fallback in this contract.

## 3. Supersede semantics (decision A4)

- **Rule:** a successful recovery (code-based or host-assisted)
  **supersedes** the previous controlling session. The old token
  hash is replaced; the old credential stops working immediately;
  live WebSocket connections for that slot are closed with a
  session-replaced reason, and the old client shows a clear message
  ("Your session was replaced — this seat was recovered from another
  device") and stops performing privileged or gameplay actions. The
  replaced client may switch to the public spectator view; it gets
  no automatic re-entry (its credential is dead, and rejoining with
  the same name is rejected because names are never freed).
- **Atomicity:** credential rotation, connection invalidation, the
  audit event, and the room notification must land in one atomic
  persistence unit. This is why supersede implementation is blocked
  on the persistence contract (`docs/PERSISTENCE_CONTRACT.md`).
- **Concurrency:** recovery operations for the same slot are
  serialized server-side (per-slot mutex in the single Node process);
  the first writer wins and rotates the credential, and any
  concurrent attempt after rotation fails with "already recovered"
  (it must not silently succeed against the new credential). A
  credential version counter on the slot makes the rotation
  observable for debugging.

## 4. Room-owner recovery — proposal for separate review (decision A3)

**Status: proposal only. Not approved, not implemented.**

- **Problem:** if the host and all cohosts lose their tokens, the
  room is permanently operator-less: nobody can grant recovery,
  advance days, skip stalled games, or appoint a new host.
- **Proposed mechanism:** a room-owner credential created at room
  creation (like today's host-claim token, but durable): a
  high-entropy owner code, hash-stored, shown once to the creator.
  Its **only** power is to designate a new host for the room. It
  cannot play, see answers, change scores, or grant recovery
  directly. Its use is audit-logged and room-notified, like §2.
- **Alternatives considered and rejected:** time-based
  auto-promotion (oldest player becomes host after operator absence
  — silent privilege escalation without consent, rejected);
  permanent operator-less rooms (the current default — acceptable
  for a 7-day party, painful for a long-lived room, retained as the
  fallback if this proposal is not approved).
- This proposal needs its own review before any implementation, per
  decision A3. Until then, the all-operators-lost case has no
  recovery path, by design.

## 5. Display-only linking and storage defaults (decisions A6, A5)

- **Host-attested linking** is display-only: a host may assert that
  two slots are the same person, shown in roster/history UI with
  "linked by host" language. It must **never** merge scores, rewrite
  historical results, or change Family Cup standings. UI language
  must distinguish an *asserted* link ("linked by host") from a
  *verified* recovery ("session restored") — the two must not share
  wording, icons, or badges.
- **Storage default unchanged:** sessionStorage by default. A future
  "Remember this device" option may use persistent browser storage
  only with explicit per-device opt-in, a clear explanation, and
  revocation controls (sign-out clears it). This contract does not
  change existing storage behavior and does not authorize the
  Remember option — it only states its requirements.
