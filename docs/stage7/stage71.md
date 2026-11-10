# Stage 7.1: Quick Party planning and first-game entry

- **Branch:** `claude/stage7-1-quick-party`, stacked on PR #7 at `d39bf2e`.
- **Instruction:** ChatGPT's review and handoff on PR #7 (comment 6773012280, 2026-11-10), under the owner's standing authorization (D-WF-01).
- **Not done here:**
  - automatic advancement; results, rematch, next and break controls;
  - host-transfer changes, or wider join/reconnect behaviour (all the next slice);
  - content-selection changes (queued separately);
  - theme, PWA, new games, room retention;
  - Tournament Studio scoring; any change to Family Cup rules.

  Nothing is merged or deployed, no port is made public, and nothing is paid for.
- **Order of work:** this spec was written **before** implementation. §6 records what was actually built and tested.

## 1. Goal

In a casual room, the host (or a cohost) says roughly how many people are playing and how long they have. Mchezo suggests a short, honest lineup of existing games. The host adjusts it, applies it for the whole room, and starts the first game through the existing readiness and briefing flow. The lineup stays saved for the next slice, which adds moving through it.

## 2. Acceptance criteria (from the handoff)

- **Q1. Entry.**
  - The casual lobby shows a clear **Quick Party** entry to the host and cohosts.
  - Its **expected group size** starts at the connected count, is labelled as an expectation, and runs from 1 to 10.
  - Time presets: **15, 30 and 60 minutes**.
  - Picking a game by hand stays available. A planned head count never pretends absent players have joined.
- **Q2. Lineup.**
  - An ordered lineup of implemented games that fit the group size, built from the existing eligibility and shuffle code (`src/games/shuffle.ts`). It is separate from the Tournament Studio's scoring and format.
  - Player minimums and maximums, and any format or team constraint, are hard filters. Variety and not-recently-played are preferences that never override them.
  - No paid AI and no new content.
- **Q3. Time.**
  - **Estimated** totals come from the existing duration estimates plus a stated transition allowance, under a time-fit rule defined here (§3.2) and tested.
  - No game clock is shortened, and no exact finish time is claimed. An over-budget lineup is never presented as fitting.
  - If nothing fits, the planner says so and offers more time or picking by hand. A short lineup is allowed, with an honest explanation.
  - A generated lineup has no duplicates.
- **Q4. Preview and editing.**
  - The preview shows the ordered games, their player requirements and estimates.
  - Controls: Regenerate, remove, replace with an eligible alternative, and move up or down (buttons, no dragging).
  - Previewing and editing never start a game or use content. **Apply** is a separate, explicit action.
- **Q5. Saved lineup.**
  - Room-scoped and server-authoritative: projected the same way to every member, and recovered on host reload or rejoin.
  - Validated: bounded length, known game ids, group size, time budget and revision.
  - Only an authenticated host or cohost of this room may change it. Another room's token and spectators cannot.
  - Two host tabs cannot silently overwrite each other (revision conflict).
  - No Cup standings, awards or second scoring ledger.
- **Q6. Start first game.**
  - Uses the existing authenticated start, readiness and briefing path with `official: false`.
  - The real connected roster and eligibility are checked again at start. A stale expected count never bypasses reconnect grace, readiness or minimums.
  - A roster mismatch is explained, with an offer to replan; nobody is silently left out.
  - Double taps, lost replies and reloads never start two games, and never drop the lineup as if a failed start had worked.
  - The saved lineup is kept, and no next game starts automatically.
- **Q7. Isolation.**
  - Only casual rooms get Quick Party.
  - These stay sound: solo routes, the solo games and their bests, manual casual hosting, Cup creation and official restrictions, TV privacy, host and cohost rules.
  - Guests and the TV see only public planning information.
- **Q8. Layout.**
  - Works at 320 px, typical phone widths and desktop.
  - Keyboard and focus work, and loading, error and retry states are visible.
  - Network work is bounded.
  - Safari and Android compatibility, the $0 target and the circle-and-dots identity are kept.

## 3. Design

### 3.1 The planner: `src/games/party.ts` (pure, shared by server and web)
- **No I/O, no Node imports, no Zod**, like `shuffle.ts`, so the web bundle and the server run the same rules.
- **Inputs:** expected group size, time budget, seed, plus optional exclusions (games the host removed in this preview) and recent games (most recent first, from the room's finished games).
- **Hard filters:** `eligibleGames` from `shuffle.ts`, using the group size against each game's minimum and maximum. Only `implemented` registry games are considered; today every listed game is.
  - Charades, the only team game, needs 4 or more, which the minimum already enforces. No other format or team constraint exists, and none is invented.
- **Ordering:** `shuffle()` in its `"tournament"` mode, asked for the whole eligible pool.
  - That mode is only a weighting: not-recently-played plus category variety. It is not the Tournament Studio's scoring or formats, which stay preview-only and untouched.
  - It is used because a party lineup benefits most from not stacking four knowledge quizzes.
  - The same seed always gives the same lineup.
- **Fitting:**
  - Walk that order and keep each game whose estimate still fits in the time left. A game too long for the time left is skipped, and shorter ones after it may still fit.
  - Stop at 8 games, the server's bound.
  - No duplicates.

### 3.2 Time-fit rule (tested)
- **Game estimate:** the manifest's `duration.minutes`, the documented design estimate shown as "about N min". It is not measured, and no game clock changes.
- **Transition allowance:** **2 minutes per game**, for the rules on phones, getting ready, and results.
- **Lineup estimate:** the sum of (game estimate + 2) over the lineup.
- **Fits:** the lineup estimate is at or under the budget (15, 30 or 60).
- **The screens** say "About N min of your M" and "estimated". They never show a finish time.
- **Hard limits:** each game also has a hard time limit (its server window), which can be longer than its estimate. The planner says so in one line, and does not add the windows up.
- **Outcomes:**
  - **fits;**
  - **short:** it fits, but less than the budget is used because no other eligible game fits the time left, or the pool ran out. Example: "Only 3 games fit 1 player; about 24 of your 60 minutes."
  - **none fits:** no single game fits the budget. The planner says so plainly and offers the next longer preset, or picking a game by hand.

  With today's games and presets every group size has a fitting game, so tests reach this case with a custom catalogue and with exclusions.

### 3.3 Preview and editing (client only; nothing is sent until Apply)
- **Regenerate:** a new seed, keeping the group size, the budget and this preview's exclusions.
- **Remove:** drops the game from the lineup and adds it to this preview's exclusions, so Regenerate won't bring it back. Closing the planner forgets the exclusions.
- **Replace:** offers games that are eligible for the group size, not already in the lineup, and keep the lineup within budget. If none qualifies, the planner says so.
- **Move up and move down:** buttons on each row.
- **Within budget always:** every edit keeps the lineup within budget, so the preview never shows an over-budget lineup. The server refuses one too (§3.4).
- **Apply** sends the lineup to the server. Nothing else in the preview talks to the server, starts a game or selects content.

### 3.4 The saved lineup: room state, server-authoritative
- **Where:** `RoomEngine.party` is persisted in the room snapshot (`toJSON` / `fromJSON`) and validated again on restore. A malformed saved lineup is dropped, never half-loaded.

  ```ts
  { revision, expectedPlayers, budgetMinutes, items: [{ gameId, gameInstanceId? }], updatedAt }
  ```

- **`partyRevision`** increases on every save or clear, so a cleared lineup's revision is never reused.
- **API:** `POST /rooms/:id/party`.
  - **Body:** `{ baseRevision, plan: { expectedPlayers, budgetMinutes, items: [{ gameId }] } }` to save, or `{ baseRevision, clear: true }` to clear. The schema is strict Zod.
  - **Who:** an authenticated player of this room who is its host or a cohost.
    - No token, or another room's token: 401.
    - A spectator or player who is not the host: 403.
  - **Room kind:** casual only. A Cup or solo room gets 409 `NOT_A_CASUAL_ROOM`.
  - **Validation, 400:**
    - group size is a whole number from 1 to 10;
    - the budget is 15, 30 or 60;
    - 1 to 8 games, each a known, implemented game whose minimum and maximum fit the group size;
    - no duplicates;
    - the lineup estimate fits the budget.
  - **Revision:** `baseRevision` must equal the current revision. Otherwise 409 `PLAN_CONFLICT`, with the current lineup, so the second tab sees what changed and decides again. Nothing is overwritten silently.
  - **Side effects:** none, beyond the lineup itself. No content is selected, no game starts, nothing goes into the ledger, the Cup or the Memory Book.
- **Projection:** `party` in every audience's projection (player, TV, spectator):

  ```ts
  { revision, expectedPlayers, budgetMinutes, items: [{ gameId, started }], estimateMinutes, transitionMinutes }
  ```

  It is public planning information only: no tokens, seeds, content or answers. `started` is true when the item's game exists.

### 3.5 Start first game
- **Same path:** the existing `POST /rooms/:id/games`, with `official: false`, the shown `roster`, and new optional fields `party: { revision, index }` and `fewerThanPlanned: true` (an explicit acknowledgement).
- **With `party`, the server checks, in this order:**
  1. **Casual room only**, otherwise `NOT_A_CASUAL_ROOM`. `official` must be false.
  2. **The lineup is current:**
     - its revision must match, and the index must be the first item not yet started (in this slice, item 0);
     - the item's game must equal `gameId`.

     Otherwise 409 `PLAN_CONFLICT`.
  3. **Repeat-safe:** if that item already started a game that still exists, the reply is that same game (`replay: true`), never a second one. This covers a lost reply, a double tap from two tabs, and a retry after reload. A briefing that was cancelled leaves no game behind, so the item can be started again.
  4. **Fewer than planned:** if fewer players are connected than the group size and `fewerThanPlanned` wasn't sent, 409 `PARTY_FEWER_THAN_PLANNED` with how many are here. The host confirms "Start with 4" or replans.
  5. **Reconnecting players:** anyone in reconnect grace who isn't listed in `proceedWithout` gets 409 `PLAYERS_RECONNECTING`, the existing refusal and decision card. This is stricter than an ordinary practice start, which doesn't ask, so nobody is silently left out.
  6. **Fits the real roster:** if the game's minimum or maximum doesn't fit the real connected count, 409 `PARTY_DOESNT_FIT` with what is needed, and the host is offered a replan for that count.
  7. **Existing checks:** then `startGame`, with its own roster check (`ROSTER_CHANGED`), its one-active-game rule, and the briefing.
  8. **Recorded:** only then is `items[index].gameInstanceId` set and saved, in the same synchronous step as the start. A refused start leaves the lineup untouched.
- **The client:**
  - Start is bounded (a timeout covers the reply).
  - After a timeout or network failure, it reads the room again. If the item now shows as started, the game is on; otherwise it says "Couldn't reach the game server" and offers Try again, which is safe by step 3.
- **The lineup stays** after the first game starts (item 0 is marked). No next game starts automatically, and there is no Next button in this slice.

### 3.6 The lobby (casual rooms only)
- **Host or cohost, no lineup yet:** a **Quick Party** card ("Plan a lineup for your group") opens the planner sheet.
- **Planner sheet:**
  - expected group size, with − and + buttons and the label "Expected group size (who's coming, not who's here)", starting at the connected count;
  - 15, 30 or 60 minutes, as radio buttons;
  - **Suggest a lineup;**
  - the preview, with each game's player range, its estimate, and its row controls;
  - the estimate line, and **Apply lineup**.
- **Once applied, everyone sees the lineup card:** numbered games, "planned for N players · about M of your B minutes", and each game's fit against who is here now (for example "needs 4 · 3 here").
  - **Host:** Edit (opens the planner with the saved lineup) and Clear.
- **Up next:** applying makes the lineup's first game the up-next game, through the existing up-next plan.
  - The dock's Start uses the Quick Party start (§3.5) when up-next is the lineup's first unstarted game. Otherwise it starts the host's own pick as before; the lineup card says the lineup is waiting and offers "Use the lineup".
- **Refusals** show inline in the dock, with a way forward:
  - fewer than planned: Start with N, or Replan for N;
  - reconnecting: the existing decision card;
  - doesn't fit: Replan for N;
  - conflict: "The lineup changed elsewhere; here's the latest";
  - network: Try again.
- **TV:** the public projection carries the lineup; showing it on the TV lobby is optional in this slice.

## 4. Test plan
- **Planner (unit, pure):**
  - group sizes 1, 2, 3, 4 and 10, and invalid sizes;
  - every preset, with seeded output that is deterministic;
  - none-fits and too-short budgets (custom catalogue, exclusions);
  - remove, replace (only eligible, within budget, no duplicates) and move;
  - exclusions and variety (recent games prefer others; never overrides eligibility);
  - the estimate arithmetic, and no duplicates.
- **Server (unit plus HTTP on a real `LocalServer`):**
  - authorization and isolation: guest, spectator, no token, another room's token, Cup and solo rooms;
  - malformed lineups: length, unknown or unimplemented games, over budget, duplicates, sizes and budgets out of range;
  - revision conflicts;
  - persistence (`toJSON` / `fromJSON`, and a server restart from the data dir);
  - projection to guest and TV, with nothing private;
  - starts:
    - roster changes;
    - fewer than planned;
    - reconnecting;
    - doesn't fit;
    - duplicate and uncertain starts (replay; two tabs);
    - a cancelled briefing makes the item startable again;
  - no Cup effects (standings and ledger unchanged);
  - no content used before the start (usage unchanged after apply).
- **Browser (`check-quick-party`, new):**
  - host and guest on two clients see the same applied lineup;
  - the host plans, edits (remove, replace, move), applies and reloads, and the lineup comes back;
  - a guest can't edit, in the UI and over HTTP;
  - the first game goes through the briefing to play and results;
  - a roster change ("fewer than planned", then "doesn't fit") is recoverable;
  - a network failure on Apply and on Start is recoverable;
  - the planner is used by keyboard;
  - screenshots at 320, 390 and 1440 px.
- **Regression:** `check-casual`, `check-solo`, `check-solo-shelf`, the Cup drivers and E2E, all in the full gate.
- **Gates:** focused drivers while developing; at the checkpoint, the fast gate and **one** parallel full gate on a clean final SHA.
- **Reporting:** Chromium headless only. WebKit and real devices are reported as not run.

## 5. Choices for ChatGPT's attention
Proceeding with these as stated, unless you object.
1. **"Fewer than planned" needs an explicit acknowledgement at start**, enforced by the server (`PARTY_FEWER_THAN_PLANNED`). The host taps "Start with 4"; nobody who isn't here is implied to be playing.
2. **A Quick Party start asks about reconnecting players**, as an official start does, though an ordinary practice start doesn't. That way a planned party never leaves someone out silently.
3. **Ordering uses `shuffle()`'s `"tournament"` mode** for category variety. It is a weighting only; Tournament Studio scoring and formats stay untouched.
4. **The server refuses over-budget and duplicate lineups.** The planner's edits only offer replacements that keep the lineup within budget, so nothing over budget is ever shown as fitting.
5. **Applying a new lineup replaces the old one,** started marks included. The next slice can add history if progression needs it.
6. **Saving or clearing a lineup writes nothing to the ledger,** so the Memory Book and scoring are untouched. The lineup keeps its own revision and time instead.

## 6. What was built and tested

*(Filled in at the checkpoint.)*
