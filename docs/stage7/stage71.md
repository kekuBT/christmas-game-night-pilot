# Stage 7.1: Quick Party planning and first-game entry

- **Branch:** `claude/stage7-1-quick-party`, stacked on PR #7 at `d39bf2e`.
- **Instruction:** ChatGPT's review and handoff on PR #7 (comment 6773012280, 2026-11-10), under the owner's standing authorization (D-WF-01).
- **Clarified by ChatGPT on PR #8** (comment 6773171824): the six choices in §5 are accepted, with three details made explicit. Those are applied in §3.5 and listed in §3.7.
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
    - No token, another room's token, or a spectator's token (a spectator is not a player): 401.
    - A player who is not the host or a cohost: 403.
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
- **Over HTTP, `party` also requires `roster`,** the roster the host was shown (400 without it). That ties "who plays" and any "start without them" to the room as it is now.
- **With `party`, the server checks, in this order:**
  1. **The host or a cohost**, for a repeat too. **Casual room only**, otherwise `NOT_A_CASUAL_ROOM`. `official` must be false.
  2. **The lineup is current:** its revision must match, and the item at `index` must exist and be this `gameId`. Otherwise 409 `PLAN_CONFLICT`. A start sent for a replaced lineup therefore never starts anything under the new one.
  3. **Repeat-safe:** if that item already started a game that still exists, the reply is that same game (`replay: true`), never a second one. This covers a lost reply, a double tap from two tabs, and a retry after reload or a server restart.

     This comes **before** the next check, so a retry of the first game after it started still works.
  4. **First game only:** a new start must be item 0, otherwise `PLAN_CONFLICT`. Moving on through the lineup is the next slice, and there is no hidden way to it now.
     - A briefing that was cancelled leaves no game behind. Its item's start mark is cleared in the room and in the saved file, and on restore a mark whose game wasn't saved is dropped. The item can then be started again.
  5. **Fewer than planned:** if fewer players are connected than the group size and `fewerThanPlanned` wasn't sent, 409 `PARTY_FEWER_THAN_PLANNED` with how many are here. The host confirms "Start with 4" or replans.
  6. **Reconnecting players:** anyone in reconnect grace who isn't listed in `proceedWithout` gets 409 `PLAYERS_RECONNECTING`, the existing refusal and decision card. This is stricter than an ordinary practice start, which doesn't ask, so nobody is silently left out.
  7. **Fits the real roster:** if the game's minimum or maximum doesn't fit the real connected count, 409 `PARTY_DOESNT_FIT` with what is needed, and the host is offered a replan for that count.
  8. **Existing checks:** then `startGame`, with its own roster check (`ROSTER_CHANGED`), its one-active-game rule, and the briefing.
  9. **Recorded:** only then is `items[index].gameInstanceId` set and saved, in the same synchronous step as the start. A refused start leaves the lineup untouched.
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
- **Refusals** show inline above the dock, with a way forward:
  - fewer than planned: Start with N, or Replan for N;
  - reconnecting: the existing decision card;
  - doesn't fit: Replan for N;
  - conflict: "The lineup changed elsewhere; here's the latest";
  - network: Try again.
- **A next game that doesn't fit the people here** (found while building):
  - The existing lobby already disables Start ("Waiting for players (3/4)"), so the server's `PARTY_DOESNT_FIT` is never reached from the screen.
  - The lineup card therefore says so itself ("Impostor needs at least 4; 3 are here. Wait for them, or replan for 3"), with **replan for 3**.
  - The server refusal stays as the authority, and the browser driver checks it over HTTP.
- **TV:** the public projection carries the lineup, but the TV screens don't show it yet (not in this slice).

### 3.7 Clarification 6773171824, where each item is applied
1. **Repeat before "first game only", and no hidden start of item 1:** §3.5 steps 3–4.
   - Tests: the replay is checked before the index rule; item 1 is refused before and after the first game starts; a repeat after a lost reply; a server restart, then the same game again and item 1 still refused.
2. **Replacing or clearing doesn't touch an active game; an old revision starts nothing; one active game; cancellation reconciled:** §3.4–3.5.
   - Tests: replace and clear while a game is active; a stale start after a replacement; the one-active-game rule; a cancelled briefing clears the mark in the room and the saved file, and on restore.
3. **The reconnect acknowledgement is tied to the current roster; host checks on repeats; the expected count never beats eligibility:** §3.5 steps 1, 6–8. The roster is required over HTTP.
   - Tests: no roster gets 400; a guest's repeat is refused; "fewer" acknowledged but the game doesn't fit is still refused.

### 3.8 Review 6775606005: a stale draft must never overwrite a newer lineup
- **The defect** (found by ChatGPT's live audit; reproduced on `97684cb`):
  - the host opens a 15-minute draft;
  - a cohost saves a 30-minute lineup;
  - the host applies the older draft, which silently replaced the cohost's lineup.

  The planner had sent the room's *latest* revision, which a background update had already moved on, so the server's conflict check never fired.
- **The repair** (client only; the server already refused stale revisions):
  - **A draft is bound to the saved lineup it started from.** The planner keeps the revision from when it opened, and a background update never moves it. When the saved lineup changes meanwhile, the planner says so ("The saved lineup was changed … while you were planning").
  - **Apply sends the bound revision.** On `PLAN_CONFLICT` nothing is saved, and the planner shows the lineup saved now with three explicit choices:
    - **Edit the latest:** a new draft from it, bound to its revision;
    - **Keep the latest:** the draft is dropped;
    - **Replace it with mine:** deliberate, sent against the revision just shown. If that changed too, it is another conflict.

    Nothing retries with a newer revision by itself.
  - **An uncertain Apply** (no answer) counts as saved only if the room holds exactly this draft at base + 1. If the room moved to something else, that is shown as a conflict.
  - **Clear is bound to the revision it asked about.** If the lineup changes while "Clear?" is open, it says so and asks again. A clear with no answer counts as done only if the room shows exactly that clear; the server also refuses a clear for an older revision.
  - **Unchanged:** authorization, roster, active-game and repeat-start protections are all untouched.

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

### 6.1 Built
- **`src/games/party.ts`** (pure; shared by the server and the web bundle):
  - the planner and the time-fit rule (§3.1–3.2);
  - `describeLineup`, `replacementOptions`, `moveItem`, `removeItem` and `replaceItem` for editing;
  - `validatePartyPlan`, the server's check.
- **`RoomEngine`** (`src/server/room.ts`):
  - **state:** `party` and `partyRevision`;
  - **`savePartyPlan`:** host or cohost only, casual rooms only, a revision conflict check, then the plan is validated again;
  - **`partyView`:** the public projection (casual rooms, every audience);
  - **`startPartyGame`:** the checks of §3.5, then `startGame`, and the item is marked in the same step;
  - **persistence:** saved in the room snapshot; a damaged lineup is dropped whole;
  - `StartRefused` carries `detail` (the numbers a host needs).
- **HTTP** (`src/server/http.ts`):
  - `POST /rooms/:id/party`, with a strict Zod body;
  - `POST /games` takes `party` and `fewerThanPlanned`; a replay answers 200 with the game already started.
- **Web:**
  - **`QuickParty.tsx`:** the lobby card, the planner sheet, and the start question;
  - **App:**
    - `postBounded`, for Apply, Clear and every Start; the timeout covers the reply;
    - an Apply or Start whose reply was lost is checked against the room before anything is said;
    - Applying makes the first game up next;
    - Start sends the lineup marker when up next is the lineup's next game;
    - "Start with N" is kept across the reconnecting-players question;
  - `Lobby.tsx`: a party slot and the Start label ("Start Math Mayhem · game 1 of 3");
  - a `party` sheet route; `stage7.css`.

### 6.2 Tested
- **`tests/stage71-quick-party.test.ts`, 31 tests:**
  - **Planner:**
    - group sizes 1, 2, 3, 4 and 10, with every preset and five seeds each: within budget, every game fits, no duplicates, the estimate adds up;
    - the time-fit arithmetic, including exactly at the budget and one minute over;
    - one player gets a "short" lineup (3 games, 24 minutes of 60);
    - invalid sizes, budgets and seeds;
    - deterministic seeds;
    - none fits: too short (custom catalogue) and no game for the group (exclusions);
    - exclusions are hard; a not-recently-played game leads more often, but never past eligibility;
    - editing: replacements fit, aren't in the lineup and stay within budget; move and remove;
    - the server's check (10 invalid lineups).
  - **Room:**
    - only the host or a cohost of a casual room; Cup and solo rooms refused;
    - revisions only grow; a stale one is refused and changes nothing;
    - invalid lineups refused;
    - no content, games, ledger, Cup or standings touched;
    - the same public view for a guest and the TV, with nothing private;
    - snapshots round-trip; damaged lineups are dropped; older rooms start at revision 0.
  - **Starts:**
    - the ordinary start, practice, roster as shown, the item marked, nothing else started;
    - a replay returns the same game;
    - a cancelled briefing frees the item;
    - fewer than planned needs an OK;
    - the real roster must fit;
    - reconnecting players named or waited for;
    - a stale or wrong start refused, and a changed roster;
    - casual rooms and the host only;
    - a refused start uses no content; the real start does;
    - item 1 refused before and after the first game; a start for a replaced lineup starts nothing;
    - replace and clear leave an active game alone; a repeat needs the host;
    - a cancelled briefing clears the mark, in the saved file too.
  - **HTTP:**
    - 401 for no token, another room's token or a spectator; 403 for a guest;
    - 12 malformed bodies get 400; a stale revision gets 409 with the latest; a Cup room gets 409;
    - starts: malformed, official or without the roster is 400; fewer gets 409 with the numbers; then 201, a replay 200, and a guest's repeat refused;
    - a server restart keeps the lineup, its revision and the start mark; the retried start is the same game, and item 1 is refused.
- **Mutation:** each of these makes at least one test fail:
  - no first-game-only rule;
  - the index rule before the replay;
  - no reconciling on cancel or restore;
  - roster not required;
  - no revision check;
  - no replay;
  - no "fewer" check;
  - no reconnecting check;
  - no time fit in the planner;
  - no budget check on the server;
  - no host check.
- **`scripts/check-quick-party.mjs`, 67 checks** (51, plus 16 in part K for review 6775606005):
  - **entry:** the host only; a Cup room has none;
  - **the planner by keyboard:** the size starts at who is here and is labelled as expected; 15/30/60; a lineup within budget, every game fitting;
  - **editing:** a new time clears the lineup; move, remove and replace (only fitting games); suggest again; nothing reaches the server;
  - **Apply:**
    - with no network: "isn't saved yet";
    - with the reply lost: recognised as saved;
    - the server holds it in the planner's order;
    - host and guests show the same lineup;
  - **a guest can't edit:** no controls, and 403;
  - **reload:** the lineup comes back;
  - **roster:**
    - Impostor doesn't fit 3: the card says so and offers a replan, and the server refuses it too (409);
    - the replan opens for 3;
    - fewer than planned asks first;
  - **Start with the reply lost:** the game opens, exactly one game; a replayed start answers with the same game;
  - **play:** three players play Math Mayhem through the briefing to results; the lineup is kept with game 1 started; nothing else starts; no Cup standings;
  - **TV view:** public facts only;
  - **320 px:** the card and the planner fit with no sideways scroll;
  - **Clear** asks first;
  - **K, two hosts, through the real UI:**
    - the cohost saves while the host's draft is open, and the host's planner shows the change;
    - applying the old draft leaves the cohost's lineup unchanged on the server, shows the conflict, and keeps the draft;
    - Edit the latest; after a second change, Replace it with mine (explicit); after a third, Keep the latest;
    - "Clear?" asks again after a change;
    - a clear for an older revision is refused (409).

    Part K fails on `97684cb`: the server shows revision 2 with the host's 15-minute draft (`docs/evidence/review-pr8/`).
- **Regressions run by hand against a local server in the gate's content mode:** `check-casual` 30, `check-lobby-mode` 71, `check-game-night-flow` 14, `check-briefing` 43 and `check-solo` 80, all passing.
- **Screenshots:** `docs/stage7/screenshots-71/` holds 10 screens at 320, 390 and 1440 px (30 images), including the stale-draft note and the conflict choice. Taken on `1a89fc6` with a clean tree (`manifest.json`).
- **Private preview for ChatGPT's interactive audit:** `docs/stage7/PREVIEW.md`.
- **Gates on `97684cbec350d1129fe012b372d0994608fdd889`** (fresh clone, clean tree, fingerprint `324018fc8f27`):
  - fast `20261110-171227-97684cbe-2368` PASSED;
  - full `20261110-171316-97684cbe-5210` PASSED, 79/79 in 26 m 54 s with 3 workers: unit 1,222, `check-quick-party` 51/51, every other driver, and E2E.
  - Raw evidence is in `docs/evidence/gate-runs/`.
- **Not tested:** WebKit/Safari and real phones. Browser checks ran in Chromium (headless shell) only, with phone sizes emulated.
