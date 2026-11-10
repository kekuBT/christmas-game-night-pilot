# Stage 6.1: everyday entry and one complete solo loop

Branch `claude/stage6-1-everyday-entry`, stacked on PR #5. It starts from PR #5's head `8fe4f19`, which was reviewed and not moved. The instruction is ChatGPT's development handoff on PR #5 (comment 6764848065, 2026-11-10), under the owner's standing authorization (D-WF-01). Nothing is merged or deployed, no port is made public, and nothing is paid for.

This spec was written **before** implementation. Section 6 records what was actually built and tested.

## 1. Goal

Make Mchezo usable on an ordinary day:
- one person can start a solo Math Mayhem round in two taps;
- a group can host a casual game night with no Cup administration.

The Family Cup stays as a deliberate, optional event with its data and scoring untouched.

## 2. Acceptance criteria

**Entry**
- **A1.** Home offers three clear entries: **Play solo**, **Host a game** and **Join a room**.
- **A2.** **Host a game** creates a **casual** room by default. A casual room has no Cup registration, day or attendance prerequisites. Its games never count toward a Cup.
- **A3.** The **Family Cup** is a deliberate, discoverable choice on the Host screen. Cup rooms work exactly as before: Official and Practice, Cup days, standings, qualification and corrections. Rooms saved before this change load as Cup rooms, so their data and scoring are preserved.

**Solo**
- **A4.** **Play solo** shows only the games that support solo play. In this slice that is Math Mayhem alone. A fresh visitor starts a round with **Play solo → Start**: no room code, name, team, Cup or lobby step.
- **A5.** The solo round reuses the existing Math Mayhem engine and scoring. It keeps arithmetic, four answer choices per question, a finite round (10 questions inside the existing time window), understandable feedback and a final score. There is no second game implementation.
- **A6.** Solo results offer **Play again** and **Back to solo** (plus Home). A replay resets all run state. Several consecutive replays work, with no duplicate scores, no stale timers and no stale answers.
- **A7.** A **personal best** is kept on this device (local storage), labelled "personal best on this device".
  - It compares only rounds played under the same rules, difficulty and scoring version.
  - Missing, malformed or unavailable storage never breaks play; the screen says when a best could not be saved.
  - Nothing implies account sync or offline play.

**Honest requirements**
- **A8.** Player counts distinguish a **hard minimum** (the game cannot start with fewer) from a **recommendation** (it is better with more).
- **A9.** Social games are never silently run alone. Solo entry lists only supported solo games.

**Theme and identity**
- **A10.** The theme stays independent of casual or Cup selection. The circle-and-dots identity and all existing games are kept.

**Robustness**
- **A11.** Casual and solo results can never enter a Cup's official ledger or standings. This is enforced by the server, not only by the UI.
- **A12.** Solo answer submission is idempotent under rapid double taps. Late answers follow the existing rules. Completing or replaying a round cleans up timers and subscriptions.
- **A13.** Reload, leaving mid-round and returning home have defined behaviour, with no trapped loading screen and no phantom active session. A safe restart is acceptable.
- **A14.** Two clients can play a casual room: one hosts, a second joins, they play a suitable existing game and reach results, all without Cup setup.
- **A15.** The layout works at 320 px and at typical iPhone and Android sizes, and stays coherent on desktop. Keyboard use, focus and labels work.
- **A16.** Server inputs are validated (Zod), private projections are kept, and no paid service or new dependency is added.

**Out of scope** (later milestones): full theme modernization, Home Screen install, Quick Party, new games, Memory Book changes, and solo Pattern Pulse and Word Connections (the next slice).

## 3. Design

### 3.1 Room kinds (server)
- **Every room gets a kind:** `cup`, `casual` or `solo`.
  - `POST /rooms` takes an optional `kind`, validated with Zod. A missing `kind` means `cup`, so existing clients and drivers are unchanged.
  - The kind is saved in the snapshot. Snapshots without it restore as `cup` (A3).
  - Every projection carries `roomKind`, which is not secret.
- **Casual and solo rooms refuse official games.**
  - `startGame({ official: true })` throws a refusal (`NOT_A_CUP_ROOM`).
  - The lobby plan endpoint refuses an official plan.
  - Cup administration (advancing the day, corrections) is refused there.
  - The ledger therefore never holds an official game from such a room, and its Cup standings stay empty (A11). Each room has its own Cup record, so casual results can't reach any other room's Cup either.
- **Solo rooms are private and single-seat.**
  - Joining by code, spectating, or a second seat are refused.
  - They have no briefing: a solo game starts playing at once.
  - Starting a game when one is still active (an interrupted round) cancels the old one first, with no scores. This is the defined "safe restart" (A13).
- **No room is created per round.** A device keeps one solo room and reuses it, because the server never deletes rooms. If it is gone (for example, the server data was reset), a new one is created.

### 3.2 Hard minimum and recommendation
- Math Mayhem works with one player, so its hard minimum becomes **1** in the registry and the manifest.
- A new optional `recommendedPlayers` (2 for Math Mayhem) is shown as "best with 2+".
- Official games still need 2 competitors (D1, unchanged), so a lone player can only play Math as practice, casual or solo.
- No other game's minimum changes.

### 3.3 Solo session (client)
- **A self-contained solo flow,** separate from the multiplayer seat, so the Home "Rejoin" card never shows a solo room (A13).
- **Routes:** `/solo` lists the solo games, each with its personal best and Start. `/solo/math-mayhem` is the round, then its results.
- **Session:**
  - the solo seat is kept in `localStorage` (`mchezo.solo.v1`);
  - the projection is polled through the hardened `pollFresh` and `oneAtATime`;
  - answers use the same intents and `intentId`s as multiplayer;
  - the existing `MchezoMath` component renders the round.
- **Lifecycle:**
  - on leaving (Back, Home, or route change), every interval and in-flight poll is cleared or aborted;
  - leaving mid-round asks first, then cancels the round on the server;
  - a reload during a round lands on the solo screen and says the round was interrupted, and Start begins a fresh one.
- **Personal best:**
  - stored in `localStorage` key `mchezo.pb.v1`, keyed by game and rules version;
  - `MATH_RULES_VERSION` is defined next to the Math engine and changes whenever questions, difficulty or scoring change;
  - every read and write sits in `try`/`catch`, and malformed data is ignored.

### 3.4 Home, Host and lobby (client)
- **Home dock:** **Join a room** (primary), with **Play solo** and **Host a game** beside it. All three fit at 320 px.
- **Host screen:**
  - a choice between **Casual game night** (default) and **Family Cup** (a deliberate choice, explained);
  - the theme is not affected by either.
- **Casual lobby:**
  - no Cup chip, no Official/Practice chooser and no Cup menu entry;
  - Start says "Casual · no Cup points".
- **Cup lobby:** unchanged.

## 4. Test plan
- **Unit:**
  - room kinds: create, validate, persist and restore, the legacy default, and the projection field;
  - official refusals in casual and solo rooms, including the plan endpoint and Cup administration;
  - solo privacy (join, spectate and a second seat refused);
  - no briefing in solo;
  - restart cancels an active round with no scores;
  - double-tap and late answers;
  - the personal-best store: higher, lower, other version, malformed data and unavailable storage.
- **Browser drivers:**
  - **solo:** a full round, three consecutive replays, personal best lower and higher, storage failure, a double-tap, leaving mid-round, reload, and no phantom Rejoin;
  - **casual:** two clients host, join, play and reach results with no Cup UI;
  - **Cup isolation:** casual and solo leave the Cup standings empty, and Cup creation and official play still work;
  - **screenshots:** home, solo play, solo results and casual entry, at 320, 390 and 1440 px.
- **Gates:** the fast gate, targeted runs for the new and affected drivers, then **one** parallel full gate on the final tested commit.
- **Reporting:** browser checks run in Chromium (headless shell) only. WebKit is not installed here, and no real iPhone or Android is used. Each is reported as not run.

## 5. Concerns raised with ChatGPT
1. **Math Mayhem's hard minimum goes from 2 to 1 in every room.** That is the honest requirement, and it means a lone host can start Math as practice anywhere. Official play still needs 2.
2. **A casual room can't be turned into a Cup mid-session** in this slice. A host who wants a Cup picks Family Cup on the Host screen.
3. **Solo rooms are saved on the server,** one per device, and reused. The server has no room expiry at all, so cleaning up old rooms is a separate future item.
4. **Casual rooms keep the pre-game briefing** (everyone taps I'm ready). It is a fairness step for several players, not Cup administration. Solo skips it.

## 6. What was built and tested

*(Filled in at the checkpoint.)*
