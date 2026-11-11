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
- **Clarification:** ChatGPT's comment 6783492788 on PR #11 accepted choices 1–4, 6 and 7. It asked that solo press ids be bound to the whole command, replay only while still the latest, and be fresh-checked against a persisted monotonic revision (§4.4). It also asked that §4.2 promise determinism and unused-first/LRU, not the old order (done).

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

**Effect on today's library in normal mode:**
- **More boards:** the approved legacy Connections board now joins the 12 provisional ones, so a solo room deals 13 different boards before any repeat.
- **A different order:** the seeded shuffle now runs over 13 boards, not 12, so the order changes too. It is still deterministic.

### 4.3 Persistence and consumption (V3)
**Unchanged path:** `contentUsage` and `contentSeq` are written in the same synchronous step as the start (or, with a briefing, as the start of play) and saved with the room.

**The semantics in §3.2 are kept, now written down:**
- **Shown, so used:** a solo round left or replaced. Its content was shown.
- **Not shown, so not used:** a cancelled briefing's content. Its next start deals that choice again.
- **No effect:** reloads and reconnects.
- **Restored:** everything, after a restart.

**No rollback** is introduced.

### 4.4 Retries (V3), as clarified by 6783492788
- **Casual rooms:** unchanged (Stage 7.2 press ids).
- **Solo rooms:** each Start carries `attempt: { id, sessionRevision }`, checked like a casual press against the solo room's own revision.
  - **The revision:** persisted and monotonic. Every new solo round moves it on. It is projected to the solo player (`session.revision`); the remembered presses are not.
  - **A fresh press:** must be made against the current revision. One made before a newer round (another tab, or a request delayed on its way) is refused as stale: `SESSION_CONFLICT` with the current session. It starts, abandons and uses up nothing.
  - **A press seen before:** replays only as the whole original command (the same actor, game and base revision). The same id for anything else is refused.
  - **Only the latest:** a replay returns its round only while that press is still the room's latest Start (no newer round since, and its round not left). Otherwise it is `SESSION_CONFLICT`. No older round is ever handed back as current.
  - **Forgotten presses:** the newest 64 are remembered, persisted and never projected. A press forgotten after 64 newer ones is stale by its revision, so it can never become a new start.
  - **The app:** sends a new id with every press (Start, Play again, Try again), made against the revision of the room it has just read (a room made in this Start is at 0). A `SESSION_CONFLICT` is shown as "Something changed in another tab or window, so this Start didn't go ahead. Try again to start a new round."; Try again reads the room again and makes a new press.
  - **A Start with no answer** (review 6786060026, §7.5): the app sends the same press again, unchanged, and acts only on the server's answer. It never adopts a round because it appeared in the room.
    - A quick failure (the connection refused or reset) is resent at once. A request that used its whole allowance is not resent in the same Start.
    - Every send fits within the first request's own allowance, so a Start with no answer ends when it did before.
    - A press still without an answer is kept, and Try again sends it again. Any definite answer, Leave and closing the page end it.
  - **API compatibility, kept explicit:** a solo Start without `attempt` is still a plain new round, as before (tested). The app always sends one.

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
5. **Solo starts get a press id** (§4.4). It is optional at the API and always sent by the app. *Accepted with clarification 6783492788:* whole-command binding, latest-only replay, and a persisted monotonic revision.
6. **`MCHEZO_CONTENT_DIR`** is a testing-only setting for the controlled pool.
7. **Wording over routing for C1:** the cancel text names where you actually go. Navigation stays as Stage 7.2 audited it.

## 7. What was built and tested

### 7.1 Built
- **Selection** (`src/content/select.ts`): `roomKind` is required. `"cup"` keeps the official and practice rules; `"casual"` and `"solo"` use the variety rule of §4.2 (`selectForVariety`).
- **The room** (`src/server/room.ts`):
  - passes its kind to selection;
  - solo Starts are repeat-safe and fresh-checked (§4.4): every new solo round moves the room's persisted revision on; a press is checked against it (`SESSION_CONFLICT` when stale); a seen press replays only as the whole command and only while it is the latest (`resolveSoloStart`); the revision is projected to the solo player; the records survive a restart;
  - **a pre-existing defect, fixed (§7.4):** a solo Start marks its player present.
- **The solo app** (`apps/web/src/solo/soloSession.ts`): a new press id with each Start, made against the revision of the room it has just read; a conflict is shown with Try again.
- **The cancel wording** (`Briefing.tsx`, `App.tsx`): the destination comes from `deriveShowPhase` with no game on.
- **`MCHEZO_CONTENT_DIR`** (`src/server/serve.ts`), testing only, refused in production.
- **`scripts/lib/small-pool.mjs`:** the controlled pool, shared by the tests and the driver.

### 7.2 Tested
- **`tests/stage74-content-variety.test.ts`** (27):
  - **selection:** practice-only and approved items before any repeat; then LRU, again and again; a game of 10 items across three games; determinism; one and zero eligible items; rejected items never; no official selection outside a Cup;
  - **Cup unchanged:** Cup practice still repeats the practice-only board; Cup official play takes fresh approved boards and is refused when none are left; **the same plans give exactly the items recorded at `af39c78`**, for the small pool and the shipped library in both modes; a casual room's plays leave a Cup room's usage untouched;
  - **in a room:** solo order across a restart; a casual briefing (chosen at start, used only when play begins, a cancel uses nothing and the next start deals the same board, a repeat before and after play, a rematch deals an unused board);
  - **solo presses (clarification 6783492788):**
    - an identical duplicate (the same round, nothing more used, also after a restart);
    - a mismatched command with a known id (another game, another revision: refused);
    - A, then B, then A replayed (`SESSION_CONFLICT`; B keeps playing, nothing abandoned or used, A never handed back; the same once B has finished and C started);
    - a press made before a newer round but never seen (stale, with the current state in the reply; a fresh press then starts);
    - a press forgotten after 64 newer ones (stale by its revision, also after a restart);
    - no press id (API compatibility: a plain new round);
    - the projection carries the revision, never the presses;
  - **HTTP:** a solo press twice (201, then 200 replay), one round and one use; across a server restart the press still replays, a new press against an old revision is refused (409 with the current session), a press against the read revision starts, and the first press replayed afterwards is refused while the new round keeps playing;
  - **the solo restart defect** (§7.4);
  - **`MCHEZO_CONTENT_DIR`:** refused in production; otherwise loads the pool and says so;
  - **the shipped library:** a casual room deals all 13 Connections boards before repeating, in normal and test mode.
- **The pinned Stage 6.2 tests** (`tests/stage62-solo-shelf.test.ts`) changed on purpose (D-S74-01): 13 boards, then LRU, in both modes. Before: 12 then repeats in normal mode, and one board every time in test mode.
- **Every other `selectContent` caller** names `roomKind: "cup"` (the TV-reveal ones name the engine's kind). No expectation changed.
- **Fourteen mutations** each make the tests fail:
  - selection: casual/solo using the Cup rule; a Cup using the variety rule; the room always saying "cup"; no LRU sort; rejected items allowed;
  - solo presses: the freshness check skipped; a replay not limited to the latest; a replay not bound to the whole command; the revision not moved on; the revision lost on restore; the presses dropped on restore; the revision not projected; the replay check skipped;
  - the restart fix: a solo Start not marking presence.
- **Unit suite:** 1,298 passing (1,271 before).
- **`check-content-variety`** (new, 54): parts A, B and C of §5, plus:
  - **A2:** its own server restarts on the same port and data; Play again in the same solo tab starts a round and deals the least recently used board;
  - **A3:** a stale press in the browser: tab 1's Start is held on its way while tab 2 starts Pattern Pulse. Tab 1's press is refused ("Something changed in another tab or window…", with Try again), nothing changes (tab 2's round keeps playing), and Try again makes a new press against the current revision and starts.
  - Against a server at `af39c78` (test mode, as the gate runs it), part C fails: one board for all 13 starts (`docs/evidence/stage74-local/check-content-variety-on-af39c78.log`).
  - With the solo-restart fix removed, A2 fails: Play again never starts a round (`…/check-content-variety-without-solo-restart-fix.log`).
- **`check-solo-shelf` part E:** the board after Play again was only logged; it is now asserted to be one the room hasn't used.
- **Local regressions, all passing:** `check-session-flow` (70), `check-quick-party` (68), `check-solo` (80), `check-solo-shelf` (58), `check-briefing` (43), `check-casual` (30), `check-host-handover` (32), `check-recovery` (20). The solo ones and `check-session-flow` were run again after the clarification's changes.
- **Screenshots:** `docs/stage7/screenshots-74/` (3, manifest revision `c78cb43`, clean tree): the rematch cancel naming the results (390), the lobby start cancel naming the lobby (390), and Math's rematch cancel at 320.
- **Not run:** WebKit and real devices. Emulation is not a device.

### 7.3 Gates
On `5d41e5f1cb63bddfdb9b506318e9953dacc5a1cd`, **one after the other** (the full gate started when the fast gate had finished, so their unit phases never overlapped), each in its own fresh clone with a clean tree (`dirty: []`). Both have the same source fingerprint (`56591718…`, 432 files).

| Run | Gate | Verdict | Measured |
|---|---|---|---|
| `20261111-013325-5d41e5f1-17311` | fast | **PASSED**, exit 0, 5/5: typecheck ×2, lint, 1,298 unit tests, build | wall 39 s |
| `20261111-013409-5d41e5f1-20255` | full | **PASSED**, exit 0, 82/82, 3 workers | wall 28 min 00 s |

- **The estimate posted before the runs:** fast about 1 minute, full about 28–33 minutes. The gate's own prediction for the full gate was about 28 min 05 s.
- **The full gate includes:**
  - `check-content-variety` (54/54);
  - `check-solo-shelf` (58), `check-solo` (80), `check-session-flow` (70), `check-quick-party` (68), `check-host-handover` (32);
  - every Family Cup driver;
  - E2E Chromium.
- **No failed runs** on this checkpoint.
- **Raw evidence:** `docs/evidence/gate-runs/<run>/`.

**The repair (§7.5) on `8147b7267935e2beb7470ebe16bec908f97e19b3`:** again one after the other, each in its own fresh clone with a clean tree (`dirty: []`), with the same source fingerprint (`dee70359…`, 432 files).

| Run | Gate | Verdict | Measured |
|---|---|---|---|
| `20261111-034429-8147b726-9520` | fast | **PASSED**, exit 0, 5/5: typecheck ×2, lint, 1,304 unit tests (including the two-tab client tests), build | wall 42 s |
| `20261111-034515-8147b726-12402` | full | **PASSED**, exit 0, 82/82, 3 workers: `check-content-variety` 57 (A4 included), `check-solo` 80, `check-solo-shelf` 58, `check-session-flow` 70 | wall 28 min 13 s |

- **No failed gate runs.**
- **A note on reporting:** both finished by 04:13 UTC, but this session's worker restarted before the report, so the report came later. Nothing was rerun.
- **Superseded:** a focused rerun after these gates failed one client test once (§7.5). The fix is `ecb617c`, gated below.

**The timed-out resend fix (§7.5) on `ecb617c625e314ddef3bccaf0a2e3a928649ab62`:** one after the other, each in its own fresh clone with a clean tree (`dirty: []`), with the same source fingerprint (`4a0403e3…`, 432 files).

| Run | Gate | Verdict | Measured |
|---|---|---|---|
| `20261111-055510-ecb617c6-15772` | fast | **PASSED**, exit 0, 5/5: typecheck ×2, lint, 1,306 unit tests, build | wall 45 s |
| `20261111-055600-ecb617c6-18731` | full | **PASSED**, exit 0, 82/82, 3 workers: `check-content-variety` 57 (A4 included), `check-solo` 80 (I1 6.5 s), `check-solo-shelf` 58, `check-session-flow` 70 | wall 28 min 47 s |

- **The estimate posted before the runs** (PR #11, comment 6788331434): about 45 s, then about 28 minutes. The gate's own prediction for the full gate was about 27 min 58 s.
- **No failed gate runs.** They ran from 05:54:57 to 06:24:50 UTC.

### 7.5 Repair (review 6786060026, P2, V3): solo Start recovery is tied to its own press
- **The finding:** a solo Start that got no answer read the room once and adopted any new round of the same game that wasn't there before. Once another tab can start the same game, that is wrong. Tab A's press never reached the server; tab B, on the same seat, started Word Connections; A adopted B's round as its own, and both tabs acted on one round. ChatGPT reproduced it against the real server and client.
- **Confirmed** with the reviewed client (`5d41e5f`):
  - the new client tests fail on it, three of them by adopting B's round (`docs/evidence/stage74-local/repair/client-recovery-tests-on-5d41e5f.log`);
  - in the browser, the driver's A4 fails on it: tab A plays B's round and never resends its press (`…/repair/check-content-variety-with-5d41e5f-solo-client.log`).
- **The fix** (`apps/web/src/solo/soloSession.ts`, D-S74-08):
  - The adopt-by-reading recovery (`reconcileStart`) is gone.
  - A Start with no answer sends **the same press** again (its id, base revision and game, unchanged), and only the server's answer counts:
    - a replay of its own round, only while that round is still the latest;
    - a round started now, when it never arrived and nothing changed;
    - a stale refusal (`SESSION_CONFLICT`), when the room moved on.
  - **Timing:** only a quick failure is resent at once (up to two resends), and every send fits within the first request's own allowance and the Start's budget. A request that used its whole allowance is never resent in the same Start; it ends the Start (Try again resends the same press). So a Start with no answer ends when it did before (`check-solo` I1: about 6 s).
  - **The timeout is flagged** (`SoloRequestError.timedOut`). It rejects before it aborts, so the request reports the timeout rather than the abort's internal "stopped" error (`ecb617c`, below).
  - **Try again** sends a press still without an answer again, unchanged. Any definite answer, Leave and dispose end it.
  - **"Replaced the interrupted round"** is said only when an open round other than this press's own was there.
  - The server is unchanged: its replay and stale rules (§4.4) give the authoritative answer.
- **Tests:**
  - **Real server, the real client, two tabs on one seat** (`tests/stage74-content-variety.test.ts`, 5):
    - A's reply lost to a dropped connection after the server started it: resent at once and answered as a replay; one round, one use;
    - A's press refused by the network while B starts the same game: A is refused as stale and never adopts B's round; B is undisturbed; no extra use; Try again then starts a new press;
    - A started, but B replaced it before A resent: A is refused, never adopts B's round; B is undisturbed;
    - A's request hangs while B starts the same game: A ends within one request allowance without adopting B's round; Try again sends the same press and is refused as stale;
    - no network at all: the Start ends within its budget; Try again sends the same press, so a press that never arrived starts once and one that did arrive is a replay; Leave while a press is unanswered ends it.
  - **The Stage 6.1 client tests** (fake server): the fake now follows the server's press rules. The old "adopted" test is now two tests: a dropped connection is resent and replayed; a reply that never comes ends the Start within its allowance, and Try again replays.
  - **Two more Stage 6.1 client tests** (`ecb617c`):
    - a lagging clock, where the timer fires a moment before the clock says the allowance is over: the timed-out Start is not resent;
    - a connection that fails 300 ms in, then a resend that hangs: the Start ends at the first 400 ms allowance, not two.
  - **Seven client mutations** each make the tests fail (the figure is how many tests fail; script and output in `docs/evidence/stage74-local/repair/client-mutations-on-ecb617c.txt`):
    - C1, Try again making a new press: 3;
    - C2, no resend after a quick failure: 5;
    - C3, resends not bound to the first request's allowance: 1;
    - C4, the pending press kept after Leave: 1;
    - C5, a resend with a new press id: 4;
    - C6, a timed-out request resent: 1;
    - C7, abort before reporting the timeout: 2.
    - Until `ecb617c`'s late-failure test, C3 was not caught. C6 and C7 are new with `ecb617c`.
  - **`check-content-variety` A4** (57 checks in all): the reviewer's scenario in the browser. Tab A's Start is dropped by the network while tab B starts the same game. A is told something changed and never plays B's round, B keeps playing, and A sent the same press twice.
  - **Regressions:** `check-solo` (80, I1 at about 6.5 s), `check-solo-shelf` (58), unit suite 1,306 (1,304 at `8147b72`).
- **A failure observed after the gates on `8147b72`, and its fix (`ecb617c`):**
  - **What:** both gates on `8147b72` passed (§7.3). A focused verbose run afterwards, of `stage61-solo-client` and `stage74-content-variety` on `0180dfd` (source identical to `8147b72`), had 58 passed and 1 failed. The failing test was the Stage 6.1 test "Start's reply never comes after the server started the round…": it expected `phase: "error"` and received `"playing"`. All five two-tab tests passed in that run. Raw log: `docs/evidence/stage74-local/repair/two-tab-and-client-tests-on-8147b72.log`.
  - **Why:**
    - a timer can fire a few ms before `Date.now()` reaches the allowance, so the "time left" check let a timed-out send be resent;
    - `request()` aborted before it rejected, so the race settled with the abort's "stopped" error, which wasn't marked as a timeout.
  - **The impact:** not a safety problem. The resend was the identical press, so the server answered with a replay of the Start's own, still-latest round. No other tab's round was adopted, nothing more was used, and the extra send stayed within the first request's allowance. But it broke the rule above (a timed-out Start ends), and made that test depend on timing.
  - **The fix:** the timeout rejects first, flagged `timedOut`, then aborts; only a quick failure is resent. The two tests above cover it; the lagging-clock test fails on `8147b72`.

### 7.4 A pre-existing defect found while testing V3: solo play after a server restart
- **What:** a server restart marks every player not connected (`http.ts`, restore). A solo room has no socket, so nothing marked its one player present again, and every solo Start was refused: 400 "Need at least 1 connected players". The solo app shows a refusal as given (`soloSession.ts`, "refused"), so every Try again failed the same way: solo play was stuck in that room until its storage was cleared.
- **Reproduced** over HTTP on `af39c78` (solo room, a start: 201; restart; read the room: 200; start: 400 with that message).
- **Fixed** (D-S74-05): in a solo room, the one pressing Start is the player and is present. Casual and Cup rooms still count who is connected (tested).
- **Test:** "pre-existing defect … a solo Start after a server restart" (HTTP, a real restart); the mutation without the fix fails it.
