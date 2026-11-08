# D3: Rules and Ready timing contract (v2)

**Status:** **approved for implementation** (owner, 2026-11-08), with P1 and P3 approved and P2 modified. It is implemented on branch `claude/d3-briefing` only.

**Implementation:** once approved, on its own branch, with a failing test first for each guarantee in §9 and a full gate. Not part of Stage 1.

**Owner rulings:**

| # | Ruling |
|---|---|
| T1 | "Start now" is available **20 s** after the host taps Start. If every roster player is ready, play starts at once, without waiting. |
| T2 | An unstarted briefing is **cancelled after 5 minutes**, with a **visible warning beforehand**. Nothing is scored or used up. |
| T3 | **Everyone** can see who is ready. |
| T4 | A player **can withdraw Ready** while the briefing lasts. Once play starts, readiness is locked. |
| T5 | **Newly created Cups only.** Existing Cups keep their timing version. Games already started or finished are never migrated. |

**Defaults, ruled on 2026-11-08:**
- **P1 (approved):** the warning shows 60 s before the five-minute cancellation.
- **P2 (modified):** Start now does **not** mark the host ready.
  - The host's own Start now is their authorization to begin, so they never have to confirm themself.
  - Their readiness stays exactly as they set it, in every record.
- **P3 (approved):** spectators see the same public readiness and connection indicators as the TV, through the spectator projection.

**Today** (`room.ts:564-675`):
- The game clock starts when the host taps Start.
- The rules are a per-phone overlay that closes itself after 8 s (`GameKit.tsx:26`, `MchezoTrivia.tsx:45`) while the clock runs.

## 1. Phases

```
host taps Start ─► BRIEFING (no game clock) ─► PLAYING (every clock starts at T_play) ─► FINISHED
 (T_create)            │
                       └─► CANCELLED (host/cohost cancels, stall guard, or content changed): leaves no game behind
```

**Terms used throughout:**
- **Roster:** the players fixed at T_create, exactly as today: the players with a live connection when Start is tapped (`readiness().wouldPlay`). Nobody is added to it later.
- **Presence:** each roster player is *connected*, *reconnecting* (inside the existing 45 s grace, `RECONNECT_GRACE_MS`) or *away*, exactly as today (`presenceOf`).
- **Required minimum:** `max(game.minPlayers, official ? 2 : 1)`, the same numbers Start checks today, including D1.

## 2. At Start (T_create)

**Every check that Start runs today runs unchanged** (`startGame`):
- host or cohost only; practice-only games can't be official;
- the shown roster must match (`ROSTER_CHANGED`);
- official games ask about reconnecting players (`PLAYERS_RECONNECTING`);
- `minPlayers`, D1 (`OFFICIAL_NEEDS_TWO`) and `maxPlayers`;
- content shortage is refused here (`CONTENT_EXHAUSTED` / `NO_SUITABLE_CATEGORY`), so nobody reads rules for a game that can't run.

**Then, in one synchronous step (new):**
1. The game record is created with `status: "briefing"`, a `briefing` record, `day` = the current day, and the seed. (`lifecycleVersion` stays 1: it describes the Sprint 3 deadline model, which is unchanged.)
2. **Content is chosen and frozen** on the server with today's selection call. That includes Category Sprint eligibility for this roster, and Impostor roles from the seed. The frozen selection stays on the game record only.
3. **Nothing is recorded as used:** no `recordUsage`, no `contentSeq` increment, no `content-selected` ledger event.
4. **No game deadline exists:** `deadlineAt` and `phaseDeadlineAt` are unset.
5. A `briefing` block is stored, all in server time:
   - `createdAt` = T_create;
   - `startNowAt` = T_create + 20 s;
   - `warnAt` = expiry − 60 s;
   - `expiresAt` = T_create + 5 min;
   - `ready` = {} (player id → time they became ready);
   - `warned` = false.

   The 20 s, 5 min and 60 s values come from the Cup's frozen timing record (§8).
6. A `game-briefing-started` ledger event, with the roster and each player's presence.

## 3. During BRIEFING

### 3.1 What each screen shows

**Phones (roster players):**
- the game's rules (cover, objective, three steps);
- the real timing from the policy table (for example "8 questions, 40 seconds each");
- an **I'm ready** / **Not ready yet** toggle;
- every roster token, with Ready ✓ (or not) **and** its presence badge (connected / reconnecting / away).

**TV and spectators:** the same rules and the same tokens with readiness and presence. No content.

**Host and cohosts, in addition:**
- **Start now**, shown disabled with a countdown until `startNowAt`;
- **Cancel**.

**After `warnAt`, every screen** shows: "This game will be cancelled in 0:59 unless it starts. Nothing will be scored."

### 3.2 Ready and withdrawing (T3, T4)

- **Intent:** `briefing-ready { ready: true | false }`, deduplicated by its `clientEventId` like every intent (`dedupeKey`, `room.ts:704`).
  - Repeating the current value is accepted with no change and no ledger entry.
  - A change is recorded (`ready-changed`).
- **Withdrawal (T4):** allowed while `status === "briefing"`.
- **After T_play:** both values are refused with `READY_LOCKED`, changing nothing. Outside a briefing, they are refused with `PHASE_CLOSED`.
- **Disconnecting doesn't change readiness.** A ready player who disconnects stays ready, and their token shows *Ready ✓ · reconnecting*. Only the player can withdraw.
- **No race with the last tap:** the engine handles intents one at a time, and the start check (§4) runs inside the same step that records a Ready. So no state exists where everyone is ready but play hasn't started. A withdrawal that arrives after that step gets `READY_LOCKED`.
- **Abuse:** repeated toggling can delay (a) but can't block it forever. The host can use Start now after 20 s, and the stall guard ends the briefing at 5 min. No extra rate limit is needed.

### 3.3 Who can join

- **A player who joins the room during the briefing** is not in the roster, as with a running game today. They see the public briefing and play the next game.
- **A roster player who reconnects** gets their seat back, and their ready state is unchanged.

## 4. When play begins (T_play)

**No timer ever starts a game.** Play begins only through (a) or (b).

### (a) Everyone is ready: starts immediately (T1)

All three must be true:
1. **Every roster player** has Ready set (connected or not).
2. **No roster player** is *reconnecting*.
3. **Safeguard 1:** at least the **required minimum** of roster players are *connected*.

This is checked:
- in the same step as every Ready intent;
- on every lifecycle sweep (every second). The sweep picks up presence changes: reconnects, drops, and grace windows running out.

**Interpretation of "every eligible participant is ready":** every roster player. An *away* player who never tapped Ready therefore blocks (a). Starting without them is the host's explicit decision under (b) (safeguard 4).

### (b) The host or a cohost taps "Start now"

1. Refused before `startNowAt` with `READ_WINDOW` ("Give everyone 20 seconds to read the rules"). This applies unless (a) is already true, in which case play has already started.
2. **Safeguard 1:** refused if fewer than the required minimum are connected:
   - an official game is refused with `OFFICIAL_NEEDS_TWO`;
   - otherwise with `NOT_ENOUGH_CONNECTED`.
3. **Safeguard 4:** the **needs-confirmation set** is every roster player who is not ready, plus every ready player who is not connected. If it isn't empty:
   - The host's request must include `confirmed: [ids]`.
   - The client builds this from a dialog that names each person with their state. For example: "Juma (not ready · connected), Mzee (ready · reconnecting), Wanjiru (not ready · away). Their clocks will start too. They keep their seats and can still play."
   - The server accepts only if its **current** set ⊆ `confirmed`.
   - Otherwise it refuses with `READINESS_CHANGED` and returns the current set. The dialog then refreshes and asks again.
   - So a player who withdraws Ready (or drops) while the dialog is open is never started without fresh consent.
4. **P2 (modified):** the player who taps Start now is left out of their own needs-confirmation set, because the tap is their authorization. Their ready state is not changed, and it is recorded as it really is.

### The one step at T_play

The same function runs for (a) and (b), synchronously:

1. **Re-check (safeguard 1)** the required minimum against connected roster players.
   - If it fails, (a) simply doesn't fire. A waiting banner says "Waiting for players: official games need 2 connected players to start."
   - (b) is refused.
   - **The game is never switched to practice.** The host can wait, or Cancel and start practice explicitly.
2. **Re-check content (safeguard 3).**
   - Every frozen item must still be in the loaded library at the same pack version, and still allowed in this mode.
   - That can only change across a restart, because the library loads at boot.
   - If not: the briefing is cancelled with reason `content-changed`. Nothing is consumed.
3. Set `status: "playing"`, `playStartedAt` = T_play, `deadlineAt` = T_play + `gameWindowMs`, and the first phase or turn deadline from T_play.
4. **Record content usage now:** `recordUsage`, `contentSeq += 1` and the `content-selected` ledger event, exactly as today's Start does.
5. Ledger `game-started` (for a timing-v2 game, written at T_play, so it still means "play began"; the T_create event is `game-briefing-started`):
   - `trigger: "all-ready" | "start-now"`;
   - the actor;
   - each roster player's ready state and presence at T_play;
   - the `confirmed` list.
6. Persist, then broadcast. That is the existing `tickRoom` / intent order: save before anyone sees it.

**Unchanged by T_play:** `startedAt` stays T_create, when the host tapped Start. Every scoring and lifecycle clock uses `playStartedAt`.

## 5. The stall guard (T2)

1. **At `warnAt`:** the sweep sets `briefing.warned = true`. That is a state change, so the room is saved and **pushed to every screen** (the server sends the warning; no phone timer is needed to show it).
2. **At `expiresAt`, if (a) and (b) haven't happened, the briefing is cancelled (§6) with reason `expired`.**
3. **Cancel by the host or a cohost** is allowed at any time during the briefing, with reason `host`.
4. **Host away:** if the host and every cohost are away, (a) and the stall guard still work.

## 6. Cancellation (any reason)

In one synchronous step:
1. The briefing game is **removed from the games list.** It never started, so no history view, standings, Memory Book or achievement can see it.
2. Ledger `briefing-cancelled`:
   - reason (`host` / `expired` / `content-changed`);
   - actor;
   - roster;
   - ready states;
   - **the number of frozen items, but not their IDs.** Those items may be chosen again later, and the player-visible ledger must not hint at them.
3. **No content usage, no `contentSeq` change, no scores, no `day` effect.**
4. Saved, then broadcast. Every screen returns to the lobby with: "The game was cancelled before it started. Nothing was scored."

## 7. Safeguards in detail

### S1. Player minimums are checked again at T_play

**At T_create:** today's checks (§2).

**At T_play:** connected roster players must still meet the required minimum (§4, step 1). This applies to official and practice games alike, using `game.minPlayers`.

**Example:** a game created with four players, three of whom then disconnect, can't start as an official one-player game.
- (a) waits.
- (b) is refused with `OFFICIAL_NEEDS_TWO`.
- The stall guard ends it after the warning if nobody comes back.

**Existing rule, unchanged by D3 (flagged for your awareness):**
- After play begins, every roster player has a score entry from the start (`room.ts:638`). A player who never returns scores 0 and still counts as a competitor.
- So a two-player official game in which one player leaves straight after T_play still counts. That is today's behaviour after Start.
- Changing it would be a scoring decision, not a timing one. I have not proposed it.

### S2. One active game at a time

**Briefing counts as active wherever "playing" does today:**
- Start (`room.ts:575`): "A game is already in progress".
- Advance day (`room.ts:1497`).
- The client's active-game panel.

**Implementation:**
- One helper, `isActive(g) = status === "briefing" || status === "playing"`, replaces the direct checks.
- Adding `"briefing"` to the `status` type makes the compiler list every other read. All 37 status comparisons in `room.ts` are reviewed, plus the client's.

**Concurrent attempts:**
- Two Start taps (host and cohost, or a double tap) are serialised by the engine. The second is refused (409), as `check-double-start` checks today.
- Content history is per room (`contentUsage` in the room snapshot), and only one game can be active in a room, so no second selection can run while one is frozen.

### S3. Selected but unused content

- **Selected at T_create, consumed at T_play.** Usage is written only in the T_play step (§4, step 4).
- **Cancellation** (§6) writes no usage. The same items stay available, and the next Start may select them again.
- **Restart:**
  - The briefing game, its frozen selection (including item IDs and pack versions, needed to record usage at T_play) and its `briefing` block are in the room snapshot, like a running game's content today.
  - The restored briefing keeps the same frozen content.
  - Step 2 at T_play cancels it, rather than playing withdrawn content, if a restart loaded a library without those items.
- **Restart before the first save:** an engine that crashes before the briefing is saved loses only the briefing. Nothing was recorded, so the Cup is unaffected.
- **Legacy Cups** (`origin: "legacy-restored"`) use built-in packs and record no usage today. They also stay on timing v1 (§8).

### S4. Starting with unready players needs explicit consent

- §4 (b) step 3: the server checks the host's `confirmed` list against its own current state.
- Unready players keep their seats and can play the running game when they return, as roster players can today.
- Their readiness and presence are shown on every screen and recorded in `game-started`.

### S5. Secrecy until play begins

During a briefing, **every** projection (player, host or cohost, TV, spectator) carries only the briefing view for that game:
- `gameId`, `official`, `status`;
- the `briefing` block (times, ready list, warned);
- `lifecycleInfo`, which is policy timing, not content.

**Withheld until T_play:**
- `state` (no `participantGameState` / `publicGameState`);
- `questions`;
- `myAnswers`, `myAnswerTimes`, `myScore`;
- `rawScores`;
- Impostor roles and secret words;
- Charades prompts;
- Connections boards;
- Sprint categories.

**Enforcement:**
- This is done in one place: the projection branches on `briefing` before any game-specific projector runs.
- A test runs it for **every game id × every audience**.
- The rules text comes from static game metadata (game registry and policy table), never from content.

**After T_play:** today's projection rules apply unchanged (answer keys only after finish; Math prompts only once opened; and so on).

### S6. Server-authoritative after reconnects and restarts

**Every briefing time is an absolute server timestamp in the room snapshot,** and so is the ready map. Phones only display them, using `serverNow`, as they do for deadlines today.

**The 1 s lifecycle sweep** (`http.ts:184`, run once at boot as well) processes `startNowAt`, `warnAt`, `expiresAt` and (a). It saves and broadcasts on any change.

**Restart:**
- Every restored player becomes *reconnecting* (`http.ts:317`), so (a) can't fire until they're back. Away players can't satisfy the minimum either, because it counts connected players only.
- Time keeps running while the server is down.
- **Warning guarantee:** a briefing is never cancelled without being visibly warned for 60 s while the server was up. If the restored briefing has less than 60 s left (or has already expired), the server sets `expiresAt` = restore time + 60 s and `warnAt` = restore time, and logs `briefing-extended`.

**Reconnecting players** (phone or tab):
- They return to their seat with their ready state.
- Refreshing during a briefing lands back on the rules.

**Outdated tabs:** `CLIENT_PROTOCOL` and `MIN_CLIENT_PROTOCOL` go from 4 to 5. A tab without briefing support is told to refresh, using the existing mechanism, and can't show a briefing wrongly.

## 8. Timing versions (T5)

**New Cups:**
- Cups created through the server (`POST /rooms`, the only way players create one) store a frozen `timing` record: `{ version: 2, readMinMs: 20000, stallMs: 300000, warnMs: 60000 }`.
- An engine built directly in code (unit tests, the console demo) stays on version 1 unless asked for 2, so the existing engine tests keep covering version 1, which existing Cups still use.
- A test checks that `POST /rooms` creates version 2, so the product path can't quietly fall back to version 1.
- `MCHEZO_LIFECYCLE_SCALE` (tests only, refused in production) scales these durations like every other game duration.
- This is the same pattern as `categorySprint` (D-CQ2-27). Later tuning can't re-rule a Cup already under way.

**Existing Cups:**
- Cups with no `timing` record, which is every Cup created before the change, legacy-restored ones included, stay on **version 1: today's behaviour exactly.** That includes the 8 s rules overlay with the clock running, for practice and official games alike.
- **Consequence:** the owner's existing test rooms (each room is one Cup) keep today's timing. To try D3, create a new room.

**Games:** a timing-v2 game keeps its `briefing` record after play begins, as the record of who was ready. A timing-v1 game has none. Running and finished games restored after the change keep their stored `startedAt`-based deadlines. No migration touches a stored game.

## 9. Tests (a failing test first for each)

**Engine and HTTP (`vitest`):**

| Area | What the test checks |
|---|---|
| Secrecy | Content, roles, answer keys and `state` are absent from every projection (player, cohost, TV, spectator) for **every game id** during briefing, and present per today's rules after T_play. |
| Clocks | No deadline exists during briefing. At T_play every deadline derives from one instant. `startedAt` stays T_create. |
| (a) | (a) waits while a roster player is reconnecting. An away player who isn't ready blocks (a). A ready player who goes away doesn't. The last Ready starts play in the same step. |
| S1 | 4 players, then 3 disconnect, official: (a) doesn't fire, and (b) returns `OFFICIAL_NEEDS_TWO`. `game.minPlayers` is rechecked for practice too. Nothing is ever converted to practice. |
| T1 | (b) is refused before 20 s with `READ_WINDOW`. Everyone ready at 3 s starts at 3 s. |
| S4 | (b) without `confirmed` is refused. A player who withdraws during the dialog makes `confirmed` stale, so `READINESS_CHANGED` comes back. A superset is accepted. Seats are kept, and the ledger records states and `confirmed`. |
| T4 | Withdrawal works during briefing. After T_play, `READY_LOCKED` changes nothing. Repeats are idempotent. |
| T2 | At `warnAt` the warning is pushed with no client action. At `expiresAt` the briefing is cancelled: no game record, no usage, no `contentSeq` change, no standings or day change. Host Cancel does the same. |
| S2 | Start during a briefing returns 409. So does advance day. Two concurrent Starts produce one briefing. |
| S3 | Cancel, then start again: the same items are available. Usage is written once, only at T_play. A restart mid-briefing keeps the frozen content and the ready map. A restart with a library missing an item cancels with `content-changed`. |
| S6 | The restart warning guarantee (`briefing-extended`). Expiry in the past at boot extends and doesn't cancel unannounced. Timers are processed by the boot sweep. |
| T5 | An old Cup keeps v1 (immediate start). A new Cup is v2. An old snapshot with a running v1 game restores with identical deadlines. |

**Browser drivers:**
- Two phones reading at different speeds get identical deadlines.
- TV and spectator secrecy during briefing.
- Reconnect and refresh during briefing.
- Withdraw Ready.
- The Start now confirmation names the right people.
- The 60 s warning appears, then the lobby returns with nothing scored.

## 10. Unchanged

- Score formulas.
- Eligibility and qualification.
- The D1 rule.
- Roster rules (fixed at Start; nobody added).
- Abstention ("Sit this game out", available once play begins).
- Content-selection rules: only the moment usage is recorded moves.
- Existing Cups, and stored games of every kind.
- Content approvals.

**Effort once approved:** about 3 days (server, client, TV, drivers), up from 2 because of T4, the warning, and the restart guarantee. Its own branch, with a full gate.

## 11. Implementation notes (branch `claude/d3-briefing`, 2026-11-08)

**Where it lives:**

| Part | Files |
|---|---|
| Cup timing record | `src/server/cup.ts` (`TIMING_V2`, `timing`) |
| Briefing engine | `src/server/room.ts`: `startGame`, `briefingReady`, `startNow`, `cancelBriefing`, `beginPlay`, `endBriefing`, `tickBriefing`, `afterRestore`, `briefingView`, `isActiveGame` |
| Routes and restore | `src/server/http.ts`: `POST /rooms/:id/games/:gid/start-now`, `…/cancel`, `newCupTiming`, `afterRestore` on boot |
| Snapshot schema | `src/server/persistence.ts` |
| Client | `apps/web/src/components/mchezo/Briefing.tsx` (phone, TV and spectator) and `apps/web/src/ui/mchezo/lib/briefing.ts` (pure helpers) |
| Protocol | `CLIENT_PROTOCOL` / `MIN_CLIENT_PROTOCOL` = 5 |

**Behaviour details:**
- **When (a) is checked:** in the same step as each Ready intent, and on every lifecycle sweep (1 s), which covers presence changes.
- **Host Start now:** answered with HTTP 409 and `{ code, needsConfirmation, startNowAt }` when refused. `CONTENT_CHANGED` (409) means the briefing was cancelled because a restart loaded different content.
- **Cancelled briefings:** every phone shows "The game was cancelled before it started…" in the lobby.

**Tests:**
- `tests/d3-briefing.test.ts`: engine, including secrecy for all 11 games × every audience, and version-2 play identical to version 1 after T_play for all 11 games.
- `tests/d3-briefing-http.test.ts`: routes, pushes, spectator projection, and a real server restart.
- `tests/d3-briefing-ui.test.ts`: client helpers.
- `scripts/check-briefing.mjs`: the browser driver.

**The existing drivers play the briefing like a family would** (`scripts/lib/briefing.mjs`):
- Each player taps I'm ready.
- A TV seat kept on the TV view can't tap Ready, so the host uses Start now with confirmation.

**Existing engine and HTTP tests stay on timing version 1** (D-UX-09). Version 1 is unchanged and is still what every existing Cup uses.

**Not done here:**
- Solo practice (D2).
- The Home and Lobby redesign.
- `scripts/screenshot-m6.mjs`: a one-off screenshot helper from M6, not a gate driver. It still expects the old intro and wasn't updated.
