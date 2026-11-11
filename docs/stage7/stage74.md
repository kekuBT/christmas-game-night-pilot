# Stage 7.4: content variety in solo and casual rooms, and the rematch-cancel wording

- **Branch:** `claude/stage7-4-content-variety`, stacked on PR #10 at `af39c78`.
- **Instruction:** ChatGPT's review and handoff on PR #10 (comment 6783345938, 2026-11-11), under the owner's standing authorization (D-WF-01).
  - It cleared Stage 7.3 after its own review and private live-site audit of `371c194`.
  - It asked for the queued "practice content variety" item (`docs/MILESTONES.md`) plus one nonblocking wording repair.
- **Not done here:**
  - mobile and visual polish;
  - the Home Screen web app;
  - new content or approvals;
  - Family Cup selection changes;
  - a gate redesign.

  Nothing is merged or deployed, no port is made public, and nothing is paid for.
- **Order of work:** this spec was written **before** implementation. §7 records what was built and tested.

## 1. Goal

**Solo and casual rooms:**
- deal content the room hasn't used yet before repeating any;
- once every eligible item has been used, deal the least recently used.

**Family Cup rooms** keep their selection exactly as it is.

**The wording repair:** cancelling a briefing names the screen people actually go back to.

## 2. Acceptance criteria (from the handoff)

| # | Criterion |
|---|---|
| V1 | **Unused first, then least recently used.** Solo and casual rooms pick unused eligible practice-usable content first, then the least recently used, with deterministic tie-breaking. The checks of game, type, availability, approval and safety stay intact. |
| V2 | **Room kind is explicit.** Family Cup practice/official selection, reservations, eligibility and usage behave as before. Casual and solo use never touches Cup availability or history. |
| V3 | **Persistence and retries.** Selection is tracked through the existing persistence path. A duplicate or retried start neither consumes content twice nor changes the chosen content. Reconnects, reloads, a cancelled briefing and a server restart have documented semantics, using today's consumption rules unless a correction is needed. |
| V4 | **Tests.** The Stage 6.2 pinned repetition test is updated deliberately. Tests cover: unused practice-only and official-approved-but-practice-usable items in a casual or solo room; exhaustion and LRU order; one and zero eligible items; persistence; start retries; Cup behaviour unchanged. |
| V5 | **Browser checks.** Repeated Connections replay is checked in solo and in a casual room with a controlled small pool, then a shipped-library smoke test. They check the actual board identities, content and eligibility. Also checked: the rematch-cancel destination and wording, and that manual, lineup and rematch progression stay correct. |
| V6 | **Report.** Tested SHA, gate verdicts and run ids, clean-tree evidence, screenshots where useful, and browser and device limits stated separately. |
| C1 | **Cancel wording.** Cancelling a rematch promised "back to the lobby" but restored the previous results. The wording must describe the actual destination, or the app must route there. Lineup progress doesn't change, and a delayed cancelled start can't revive. |

**Gates:** the fast and full gates run one after the other, never with their unit phases overlapping. Each run's evidence is kept as it is.

## 3. What exists today (inspected at `af39c78`)

### 3.1 Selection (`src/content/select.ts`)
`selectContent` is deterministic. Its seed comes from the room's Cup record id, the game and a per-room sequence number (`contentSeq`).
- **Official games** take approved items that this room has never used, or the game is refused.
- **Practice games** rank items in this order:
  1. practice-only items and items already used in this room, least recently used first;
  2. fresh official items, which a practice use retires from that room's official play.

  This protects a Cup's official content.

**Shared checks, in every mode:**
- an item whose answer the game's input can't accept is never selected;
- a practice game uses only `practiceUsable` items (anything not rejected).

### 3.2 Who calls it (`RoomEngine.startGame`)
- **Rooms:** every room created since Sprint 4 has its own Cup record (`origin: "created"`), its own `contentUsage` and its own `contentSeq`. That includes solo and casual rooms. Both are saved with the room through the normal persistence path.
- **No sharing:** a casual or solo room's history is its own. No room reads or writes another room's history.
- **Official games:** casual and solo rooms can't start one (`NOT_A_CUP_ROOM`, Stage 6.1), so their selection is always practice.

**When content counts as used today:**

| Event | Today |
|---|---|
| Solo start (no briefing) | Chosen and recorded as used in the same step as the start. |
| Solo round left or replaced by a new Start | Stays used (the board was shown). |
| Casual start (briefing) | Chosen and frozen at the start, never sent to a screen, recorded as used when play begins. |
| Casual briefing cancelled (host, expiry, content changed) | Nothing recorded. The sequence doesn't move, so the next start of that game deals the same frozen choice again. |
| Reload or reconnect | No new selection. The game keeps its content. |
| Server restart | Usage and sequence are restored. A briefing's frozen items are rechecked when play begins (`content-changed` cancels). |

**Retries:**
- **Casual rooms (Stage 7.2):** every start carries a press id. A repeat returns the same game; a repeat of a cancelled start gets `ATTEMPT_ENDED`. Neither selects again.
- **Solo rooms:** a start has no id. The app never re-sends a Start. A lost reply is settled by reading the room and adopting the round it made (Stage 6.1). A duplicated request would still be a second Start: it would replace the round and use up a second item.

### 3.3 Why repeats happen (the queued item)
- **The cause:** practice prefers practice-only and already-used items. Once most of a game's library is approved for official play, a room that never plays official games keeps dealing the same item.
- **Today's library:**
  - **Normal mode:** 13 Connections boards (12 provisional, one approved legacy board). A solo room deals the 12 in turn and never the legacy one.
  - **The gate's test mode** (provisional counts as approved): every board is official, so a solo room deals **the same board every time**.
- **Pinned test:** the Stage 6.2 test (`tests/stage62-solo-shelf.test.ts`, "CURRENT BEHAVIOUR") records exactly this.

### 3.4 The cancel wording
- **The text:** the briefing's cancel confirmation (`Briefing.tsx`) says "Nothing is scored and no questions are used up. Everyone goes back to the lobby."
- **What actually happens:** after a cancel, each phone shows what `deriveShowPhase` gives with no game on:
  - the last finished game's results, if that phone hasn't dismissed them;
  - otherwise the lobby.
- **So:** a rematch or Next game started from the results goes back to the results, and a game started after *Back to lobby* goes back to the lobby.
- **Unchanged:** the lineup and the cancelled attempt are handled correctly already (Stage 7.2: the lineup isn't moved, and a retry gets `ATTEMPT_ENDED`).

## 4. Design

### 4.1 Room kind is explicit (V2)
- **The field:** `SelectionRequest` gets a required `roomKind: "cup" | "casual" | "solo"`.
- **The caller:** the room passes its own kind.
- **Cup rooms:** `"cup"` runs today's official and practice rules unchanged, including retiring a fresh official item used in practice.
- **Casual and solo rooms:** `"casual"` and `"solo"` use the variety rule (§4.2), for practice only. An official request from a non-Cup room is refused by the room before selection, as today. The selector refuses it too, as a second guard.

### 4.2 The variety rule (V1)
1. **The pool:** the game's items that are practice-usable (not rejected) and whose answer the game's input accepts. The same checks as today.
2. **The order:** a seeded shuffle (the existing seed) for tie-breaking, then sorted by last use in this room.
   - Never used comes first.
   - Then the oldest use.
   - Practice-only and official-approved items are treated the same: casual and solo rooms never play official, and their history belongs to no Cup.
3. **Taking items:** the first `count` items. Only when the pool is smaller than one game's count do items repeat within a game, as today ("small pool: items repeat").
4. **No eligible items:** refused as today ("No practice content is available for this game yet.").
5. **One eligible item:** it is dealt every time.

**Effect on today's library in normal mode:** no Connections board was official-eligible except the legacy one. So the order of the 12 provisional boards is unchanged (same seed, same shuffle), and the legacy board joins as the 13th.

### 4.3 Persistence and consumption (V3)
**Unchanged path:** `contentUsage` and `contentSeq` are written in the same synchronous step as the start (or, with a briefing, as the start of play) and saved with the room.

**The semantics in §3.2 are kept, now written down:**
- **Shown, so used:** a solo round left or replaced. Its content was shown.
- **Not shown, so not used:** a cancelled briefing's content. Its next start deals that choice again.
- **No effect:** reloads and reconnects.
- **Restored:** everything, after a restart.

**No rollback** is introduced.

### 4.4 Retries (V3)
- **Casual rooms:** unchanged (Stage 7.2 press ids).
- **Solo rooms:** gain the same press id.
  - The start may carry `attempt: { id, sessionRevision }`. A solo room has no session revision to check, so it ignores that field.
  - A repeat of the same id returns the round it started, as a replay. It starts nothing, abandons nothing and selects nothing.
  - The same id for another game is refused.
  - The ids are remembered in the room's bounded, persisted session records (the newest 64), as in casual rooms, and never projected.
  - The solo app sends a new id with every press: Start, Play again, Try again.
  - Its lost-reply handling is unchanged: it reads the room and adopts the round.

### 4.5 The cancel wording (C1)
- **The text** names the actual destination. It is worked out from the same state that decides it (`deriveShowPhase` with no game on), for the person cancelling:
  - **Back to results:** "You'll go back to the Word Connections results. Nothing is scored or used up, and everyone else goes back to what they had open."
  - **Back to the lobby:** "You'll go back to the lobby. Nothing is scored or used up, and everyone else goes back to what they had open."
- **Unchanged:** routing, the lineup, and cancelled-attempt handling. A retry of the cancelled start still gets `ATTEMPT_ENDED`.

### 4.6 A controlled content pool for browser checks
- **The setting:** `MCHEZO_CONTENT_DIR`, **testing only**. It points the server at another content directory. Like the existing test settings, it is refused when `NODE_ENV=production`.
- **Who uses it:** the new driver starts its own server with a small pool, as `check-lifecycle` does, using the gate's build. Nothing else uses it.

## 5. Test plan
- **Selection unit tests:**
  - **Casual and solo:**
    - unused practice-only and official-approved items both come before any repeat;
    - exhaustion, then LRU order;
    - one and zero eligible items;
    - rejected and unenterable items never appear;
    - determinism.
  - **Cup:** the same requests with `roomKind: "cup"` give exactly today's results, including retirement. Existing Cup tests are unchanged apart from naming the room kind.
- **Engine and HTTP tests:**
  - solo and casual rooms over the shipped library in normal and test modes;
  - persistence across a restart (the next deal continues the order);
  - a casual start replayed, a cancelled briefing (not used; the same choice next) and its replay (`ATTEMPT_ENDED`);
  - a solo start replayed with the same press id (one round, one use) and a new press (a new round);
  - a Cup room's practice and official selection unchanged, with its usage untouched by other rooms.
- **The pinned Stage 6.2 test:** updated deliberately, with the old expectation named in the commit and decision.
- **`check-content-variety` (new browser driver):**
  - **A (small pool, own server):** solo Connections played 4 times: three distinct boards, then the least recently used. The rejected board never appears.
  - **B (small pool, own server):** a casual room with a host, a guest and the TV.
    - a hand-picked Connections game, then Play again, then the lineup's Next: distinct boards, then LRU;
    - lineup progress is checked at each step;
    - the rematch-cancel wording and its destination (results), then a lobby start's cancel wording and its destination (lobby);
    - a retry of the cancelled start starts nothing.
  - **C (gate's server, shipped library):** solo Connections smoke. Every board dealt is a shipped, practice-usable board, and none repeats before all of them have been dealt.
- **Regressions:** `check-solo-shelf`, `check-session-flow`, `check-quick-party`, `check-casual`, the Cup selection tests.
- **Gates:** the fast gate, then the full gate, one after the other on a clean final revision. Failed runs are kept, never counted.

## 6. Choices for ChatGPT's attention
1. **`roomKind` is required** in the selection request. Every caller names it, including the Cup tests (a mechanical change; no expectation changes).
2. **No preference** between practice-only and official-approved items in casual and solo rooms. Both are just "unused".
3. **A cancelled briefing doesn't use its content**, as today. The next start of that game deals the same frozen choice, which nobody saw.
4. **A solo round that is left or replaced counts as used**, as today. Its content was shown.
5. **Solo starts get a press id** (§4.4). It is optional at the API and always sent by the app.
6. **`MCHEZO_CONTENT_DIR`** is a testing-only setting for the controlled pool.
7. **Wording over routing for C1:** the cancel text names where you actually go. Navigation stays as Stage 7.2 audited it.

## 7. What was built and tested
*(Recorded after implementation.)*
