# Stage 7.3: hand the host role to another player (casual rooms)

- **Branch:** `claude/stage7-3-host-handover`, stacked on PR #9 at `f24934f`.
- **Instruction:** ChatGPT's review and handoff on PR #9 (comment 6781323820, 2026-11-10), under the owner's standing authorization (D-WF-01). It also cleared Stage 7.2 after its own live-site audit of `01cde60`.
- **Not done here:**
  - automatic host elections;
  - mid-game transfers;
  - new accounts or credentials;
  - a Family Cup role redesign;
  - offline takeover;
  - theme or Home Screen work, content variety, new games.

  Nothing is merged or deployed, no port is made public, and nothing is paid for.
- **Order of work:** this spec was written **before** implementation. §7 records what was built and tested.

## 1. Goal
The host of a casual room can deliberately give the host role to another connected player, between games, and carry on as a player.
- **Everyone sees the new host:** every phone and the TV.
- **The new host runs the room from then on:** Next game, Play again, Resume, the lineup and the lobby's Start.
- **Nothing else changes:** room, code, seats, scores, history, lineup, break, content use.
- **Cohosts:** today they are a delegation, not a transfer, and that distinction stays.

## 2. Acceptance criteria (from the handoff)
- **H1. Transfer works where it should.**
  - Current host → confirm → a connected player, in the lobby, after results, or during a break. Cancelling changes nothing.
  - The old host visibly becomes a player.
  - The new host can explicitly Resume, take the Next game or Play again, as applicable.
- **H2. No one else can transfer.**
  - A guest, a spectator, a cohost or the former host is refused.
  - After the transfer, the former host's privileged HTTP and WebSocket actions are refused.
  - No secret or recovery information leaks.
  - Other cohosts keep working.
- **H3. No duplicate or reverted ownership.** None of these can do it:
  - a lost reply followed by an identical retry;
  - two tabs choosing different recipients;
  - a stale transfer arriving after a later one;
  - a restart.

  A delayed reply can't roll the UI back.
- **H4. Transfer and game start serialize.**
  - If a briefing or game has begun, the handover is refused.
  - If the handover wins, an old-host start can't take effect.
  - Lineup, break and scores stay identical, apart from explicit later actions.
- **H5. Exactly one host survives reloads, reconnects and a server restart.**
  - Both hosts can reload or reconnect, and the server can restart: exactly one host remains, with the right controls.
  - The same people can play another casual game afterwards.
  - A late join or rejoin never seizes the host role.
- **H6. Clear on every screen.**
  - Keyboard and focus, target names, and the cancel, confirm, busy, uncertain and failure states are clear at 320 and 390 px, on desktop and on the public TV.
  - No internal ids in player copy.
  - Family Cup and solo regressions stay covered.

## 3. What exists today (inspected at `f24934f`)
- **The host is held twice.**
  - `RoomEngine.hostId` and the `cohosts` set are checked by every engine action at call time (`hostId === actor || cohosts.has(actor)`).
  - Each player record's `isHost` / `isCohost` flags are what the HTTP layer checks (`requireSession` returns the current record) and what the projections show (`players[].isHost`, `me.isHost`).
  - A transfer must change both in one step.
- **How the host role is gained:**
  - only at join, with `asHost` plus the room's host-claim token, and only while `hostId === null` (`join`, `hostClaimValid`);
  - nothing moves it today.

  `grantCohost` adds a cohost and never changes `hostId`, by design ("the original host regains authority on reconnect").
- **WebSocket sessions:**
  - a socket is authenticated by its session token, and its `audience` (`player` / `host` / `cohost` / `tv` / `spectator`) is checked **once, at connect**;
  - every later projection is built with that stored audience (`broadcast` → `projectFor(room, meta.audience, …)`);
  - the app always connects as `player`, but a `host` socket keeps `hostView: true` after a change;
  - the recovery requests in `projectFor` already re-read the player's current flags;
  - intents sent over the socket act through engine methods that read the current `hostId` and `cohosts`.
- **Recovery:**
  - host-assisted seat recovery is approved by the current host or a cohost (current flags);
  - recovering a seat keeps its flags;
  - recovery codes and session tokens belong to the seat, not to the role.
- **Persistence:**
  - `hostId`, `cohosts` and each player's flags are saved;
  - the snapshot schema checks that `hostId` is a player;
  - nothing checks that the flags agree with it.
- **Room notices:** `recentNotices` turns recent `seat-recovered` ledger events into public toasts, offered to every phone (`roomNotices`).

## 4. Design

### 4.1 The transfer (server, `RoomEngine.transferHost`)
**Request:** `POST /rooms/:id/host` with `{ targetId, attempt: { id, sessionRevision } }`, using the press identity and session revision of Stage 7.2 §3.8.

**Checks, in order:**
1. **The session is a player in this room** (HTTP `requireSession`; 401 otherwise).
2. **A press seen before, by its id:**
   - if it was this player's transfer to this target, the server answers with its recorded outcome (`replay`) and changes nothing;
   - the former host may learn their own outcome this way, but it never restores authority or applies anything;
   - the same id used for something else is refused.
3. **The current host only** (`hostId === actor`). Cohosts, guests and the former host get `NOT_HOST` (403).
4. **A casual room** (`NOT_A_CASUAL_ROOM`, 409).
5. **Made against the current session revision** (`SESSION_CONFLICT`, 409, with the current session and host).
6. **Between games:** no briefing or game active (`GAME_ACTIVE`, 409). A break or results on screen is fine.
7. **An eligible target** (`TARGET_INVALID`, 400, or `TARGET_NOT_CONNECTED`, 409):
   - a player of this room, not the actor;
   - connected now (presence `connected`; not reconnecting or away).

   Spectators aren't players, so they can never be chosen.

**Then, in one synchronous step:**
- **The old host:** `isHost = false`, `isCohost = false`, and removed from `cohosts`. They get no implicit cohost privilege.
- **The new host:** `isHost = true`, `isCohost = false`, and removed from `cohosts`, so there is no redundant entry.
- **The room:** `hostId = target`.
- **Cohosts:** every other cohost is unchanged.
- **The session revision** moves on, so any continuation press made before the handover is stale.
- **The press is remembered:** its id, key `host:<target>`, the revision, the actor and the target.
- **One ledger entry** `host-transferred` records the actor and the new host: an audit of a privileged role change, like `host-claimed`.

**What it never touches:**
- room id or code;
- seats or session or recovery credentials;
- games, scores, history or the ledger's earlier events;
- the lineup and its progress;
- the break;
- content use;
- the up-next plan.

It starts nothing, resumes nothing, and doesn't move the lineup.

### 4.2 Authority is always the room's current state
- **HTTP:** every privileged endpoint reads the session's current player record (`requireSession`), and engine methods read `hostId` and `cohosts` at call time. The former host's Next, Break, Start, lineup save, cohost grant and recovery approval are refused at once.
- **WebSocket:** a projection's audience is re-evaluated against the room each time it is built.
  - A `host` socket whose player isn't the host any more, or a `cohost` socket whose player is neither, is served the ordinary `player` projection.
  - Intents act through engine methods that check the current role.
  - No cached audience, old flag or replayed command keeps authority.
- **Restore:** after a restart the flags are set from `hostId` and `cohosts`: `isHost` only for `hostId`, and `isCohost` for the other cohosts. So exactly one host comes back even from an inconsistent snapshot.
- **Late joins and rejoins can't seize the role.** The host-claim token works only while there is no host (`hostId === null`). A seat recovered on another device keeps its own flags.

### 4.3 Everyone sees it
- **Projections:** `players[].isHost` and `me.isHost` come from the room. The lobby's host name, the guests' "Waiting for X to start…", What's next ("X starts it") and the TV follow at once.
- **A public notice** for a few minutes, from the `host-transferred` ledger event (`recentNotices`):
  - everyone else: "Keku handed the host role to Bea.";
  - the new host: "Keku made you the host.";
  - the former host: "Bea is the host now. You're a player."
- **The TV:** marks the host in the lobby roster ("host") and names them: "Bea starts it when everyone's ready." Public facts only.

### 4.4 The app (current host only, casual rooms)
- **Where:** the room menu's host tools ("Players and cohosts") get a **Make host** button for each other player.
- **When it is offered:** only to the current host, only in a casual room, and only with no briefing or game on. That includes the lobby after results and during a break.
- **Players who aren't connected** are shown "not connected" and can't be chosen.
- **Confirmation** (inline, focus moved to it, Escape or Cancel closes it):
  - **"Make Bea the host?"** The text explains: "Bea will run the room: starting games, the lineup and breaks. You'll be a regular player."
  - **The buttons:** Make Bea the host, and Cancel.
- **States:**
  - **busy:** "Handing over…", with the buttons disabled;
  - **refused:** the server's reason in plain words, for example "Bea isn't connected right now." or "A game has started. Hand over after it ends.";
  - **a lost reply:** asked again once as the same press, as in Stage 7.2;
  - **still no answer:** "Couldn't confirm the handover. Check who is host in the lobby."
- **Afterwards:** the projection decides the screen.
  - The former host's host controls go, and the menu closes.
  - The new host's controls appear. Their up next is the room's current plan, shown as a plain pick, never the lineup's intent (Stage 7.2 D-S72-11). Nothing starts.
- **No internal ids appear in the copy.**

## 5. Test plan
- **Engine and HTTP** (`tests/stage73-host-handover.test.ts`):
  - **Works:**
    - from the lobby, after results and during a break;
    - exactly one host, and the old host loses cohost too;
    - other cohosts kept;
    - lineup, break, scores and up next unchanged;
    - the revision moves on.
  - **Refused:** guest, spectator (401), cohost, former host, self, unknown, reconnecting or away target, a Cup room, a briefing or a game.
  - **Repeat-safety:**
    - a repeat of the same press returns the outcome, also to the former host, and after a restart;
    - two tabs choosing different recipients: the second is stale or not the host;
    - A→B→A, then A's old press to C: refused;
    - an evicted press: stale.
  - **Races:**
    - a handover against a start made on the same screen: whichever comes second is refused;
    - the old host's start after the handover: refused.
  - **After the handover:**
    - the old host's privileged HTTP (break, Next, lineup, cohost, recovery approval): 403 or refused;
    - the old host's `host` WebSocket gets the `player` projection;
    - no recovery requests or secrets in their projection.
  - **Persistence:**
    - restart keeps exactly one host;
    - a snapshot with inconsistent flags is normalized;
    - a late join with the claim token is not the host.
- **Browser** (`check-host-handover`, new): an old host, a new host, a guest and the TV.
  1. Hand over from the lobby after a game, through the menu, by keyboard.
  2. Cancel first, which changes nothing.
  3. Everyone and the TV show the new host.
  4. The new host starts the lineup's next game; the old host has no controls, and their API attempts are refused.
  5. Hand over during a break: the new host resumes.
  6. A lost reply on the handover: one transfer, the same press id.
  7. Reload both hosts: still one host.
  8. A refused target (disconnected).
  9. Layout at 320, 390 and 1440 px.
- **Regressions:** `check-casual`, `check-session-flow`, `check-quick-party`, `check-recovery`, `check-sessions`, Family Cup and solo, all in the full gate.
- **Gates:** the fast gate and one parallel full gate on a clean final revision. Failed runs are kept, never counted.
- **Reporting:** Chromium only; WebKit and real devices are reported as not run.

## 6. Choices for ChatGPT's attention
I'm proceeding with these unless you object.
1. **The precondition is the Stage 7.2 session revision**, shared with Next, Play again and Break. A handover moves it on, so anything pressed on a screen from before the handover is stale. A start, a cancel or a break change likewise makes an older handover press stale.
2. **The former host may replay their own press and learn its recorded outcome** (step 2 in §4.1), without any authority. A different press by them is refused (`NOT_HOST`).
3. **Only connected targets.** Reconnecting and away players can't be chosen: the point is a host who can run the room now.
4. **A cohost can be the target.** They become the host and leave the cohost list. The other cohosts stay.
5. **It lives in the room menu's host tools,** next to Make cohost, not on the results screen. The results screen keeps its What's next panel uncluttered.
6. **A `host-transferred` ledger entry and a short public notice** (actor and new host). Both are public, as `host-claimed` is.

## 7. What was built and tested

### 7.1 Built
- **Server** (`src/server/room.ts`, `src/server/http.ts`):
  - `RoomEngine.transferHost`, with the checks and the single-step change of §4.1;
  - `HostRefused`, carrying the codes plus the current session and host;
  - `POST /rooms/:id/host`;
  - the press record keeps its `actor`;
  - `recentNotices` includes `host-transferred` (`method: "handover"`, with `byId`);
  - on restore, the role flags are set from `hostId` and the cohosts;
  - `projectFor` re-checks a `host` or `cohost` audience against the room on every projection.
- **Web:**
  - `components/mchezo/HostHandover.tsx`, new: the players and roles card, and the confirmation;
  - `App.tsx`: the handover request (same-press retry, then the room's word, then "couldn't confirm"), the menu wiring, and notices worded per viewer;
  - `TvShow.tsx`: the host tag, and "Bea starts it";
  - `types.ts`, `stage7.css`.

### 7.2 Tested
- **`tests/stage73-host-handover.test.ts`** (17):
  - the handover from the lobby, after results and during a break;
  - cohost targets, and other cohosts kept;
  - refusals for a guest, a cohost, a former host, self, an unknown player, reconnecting and away players, a Cup room, a game and a briefing;
  - the race with a start, both orders;
  - repeats, including after a restart;
  - two tabs, A→B→A with a stale press, and eviction;
  - restart, normalization of a damaged snapshot, and the claim token;
  - HTTP roles; the former host's HTTP actions and their WebSocket projection.

  Ten mutations of the safeguards are each caught: the actor check, the old host's cohost removal, the target's cohost removal, the revision check, the game check, the presence check, the WebSocket re-check, the restore normalization, the revision bump, and cohost authority.
- **`check-host-handover`** (new, 32 checks): Ada, Bea and Cal plus the TV.
  - Guest tools; the confirmation's names, focus, Escape and Cancel.
  - Keyboard confirm with a lost reply (the same press id, one handover).
  - Toasts for all three; controls and waiting lines; the TV host tag.
  - Ada's refused API calls; Bea runs a game and the results show her controls.
  - Handover during a break and Resume; a not-connected target; reloads; 320 and 1440 px.
- **Local regressions, all passing:** `check-game-night` (Cup, cohost grant), `check-casual`, `check-recovery`, `check-sessions`, `check-session-flow`, `check-quick-party`, `check-tv-show`, `check-lobby-mode`.
- **Not run:** WebKit and real devices (checklist I17–I19). Emulation is not a device.

### 7.3 Gates
*(Recorded after the runs.)*
