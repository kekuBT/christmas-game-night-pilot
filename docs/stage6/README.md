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

**ChatGPT's answer** (PR #6, comment 6764965143): all four accepted. It added for this slice: one room per device is best effort, not a server guarantee; blocked or cleared storage must not break play or make a room for every replay (keep the seat in memory); reuse must authenticate the seat, never a room code alone; and a focused two-tab/reload check that a stale answer or cancel from an earlier run can't score or cancel its replacement. All are built and tested (D-S61-03, D-S61-04, §6.3).

## 6. What was built and tested

### 6.1 Built
- **Server** (`src/server/room.ts`, `src/server/http.ts`):
  - room kinds `cup | casual | solo` (D-S61-01), Zod-validated on create, saved and restored, legacy rooms restored as Cups;
  - casual and solo rooms refuse official starts, official plans and Cup days;
  - a solo room has one seat, no briefing, no spectators and no public view: its code (to join, watch or recover a seat), its id and its TV projection and socket all answer as if there were no such room (D-S61-03);
  - solo safe restart and Leave (`abandonSoloRound`), with the stale-run guarantees of D-S61-04.
- **Honest requirements** (`src/games/registry.ts`, `manifest.ts`): Math Mayhem's hard minimum is 1, recommended 2+ ("1–10 players · best with 2+"); official still needs 2 (D-S61-02).
- **Client:**
  - **Home** offers Join a room, Play solo and Host a game (`Home.tsx`);
  - **Host a game** is Casual by default, with Family Cup a deliberate, explained choice; a casual lobby has no Cup chip, mode choice or Cup menu row, and says "Casual · just for fun" (`Home.tsx`, `Lobby.tsx`, `App.tsx`);
  - **Play solo** (`Solo.tsx`, `solo/soloSession.ts`): `/solo` lists only solo games with their personal best; `/solo/math-mayhem` is the round (the existing `MchezoMath` in solo mode), then results with Play again, Back to solo and Mchezo home, and a review of the answers;
  - **personal best on this device** (`solo/personalBest.ts`, D-S61-05);
  - **plain-http event ids** (`uuid.ts`, D-S61-07), a pre-existing defect fixed for every game.
- **Deviations from §3:**
  - The Host choice is labelled **Casual** / **Family Cup** (each with a one-line explanation), not "Casual game night".
  - A casual lobby's Start reads **"Start Math Mayhem"**, with "Casual · just for fun" on the up-next card and "Casual game: just for fun, no Cup." under Start, rather than "Casual · no Cup points" on the button.
  - A reload mid-round lands on the round's start screen; the "interrupted" message appears when Start begins the fresh round.

### 6.2 Tested
- **Unit tests** (all in the gate's `unit-tests` step):
  - `tests/stage61-room-kinds.test.ts` (24): kinds and refusals, Cup control, solo privacy and no briefing, honest minimums, the solo round (engine scoring, double tap, late answer, safe restart, leave, three replays), Cup isolation, persistence and the legacy default, and the same rules over HTTP, including the closed public view and seat recovery by a solo room's code;
  - `tests/stage61-solo-client.test.ts` (11): personal best (first, higher, lower, tie, other version, malformed, blocked, write fails), the seat format, and the solo session against a real server: one room with storage working, blocked, or read-only with a dead seat; token-only reuse; two tabs (stale answer and stale cancel can't touch the replacement); dispose;
  - `tests/client-uuid.test.ts` (4): the old fallback is refused by the server's schema; the new id passes it with and without `randomUUID` and with no Web Crypto.
  - Mutation checks: removing the page-seat fallback fails 2 client tests; removing the solo public-view refusal fails 2 tests.
- **Browser drivers** (Chromium headless shell):
  - `check-solo` (§6.3 lists what it proves);
  - `check-casual`: Casual by default; casual lobby without Cup UI (host and guest); a guest on plain http; an official start over the API refused; two players through the briefing to results and back to "Last game · Math Mayhem · Casual"; empty Cup standings; a Family Cup still a Cup with Official by default and standings after an official game; isolation both ways; a solo code joins nothing; "best with 2+" on Home; the same theme in both kinds.
  - The other 45 drivers that host from the UI now pick Family Cup explicitly, so they test exactly what they tested before.
- **Screenshots:** `docs/stage6/screenshots/` (7 screens × 320, 390 and 1440 px, with `manifest.json` naming the revision).

### 6.3 Behavioural evidence asked for in the handoff
| Asked for | Where it is shown |
| --- | --- |
| Full solo run | `check-solo` A–B: Home → Play solo → Start (two taps), 10 questions answered from the prompts, results |
| Three consecutive replays | `check-solo` B: 5 right, then all wrong (0), then all right; the server holds exactly 3 rounds with those 3 scores; nothing left playing |
| Personal best lower / higher | `check-solo` B: "still 600" after the lower round, "New personal best … previous best was 600" after the higher; the list shows it |
| Storage failure | `check-solo` F: blocked `localStorage` (list and results say so, play and Play again work, one room for the page); malformed data; a version-0 best not shown and kept |
| Duplicate input | `check-solo` B: the first answer of round 3 double-tapped, 10 answers counted; unit tests for a retried intent and a second tap |
| Late input | `check-solo` G (own server, short test clock): an in-time answer accepted, a late one refused, only the in-time one counted |
| Leave / reload | `check-solo` C–E: Leave asks first; Keep playing keeps the round; leaving, browser Back and reload each end in a defined screen with the round removed or replaced; nothing polls afterwards; no phantom Rejoin; one room across all of it |
| Two tabs (clarification) | `check-solo` E2 and the client unit test: the second tab's Start replaces the round, the first tab returns to its Start screen, its tap and leaving score nothing in the replacement |
| Two-client casual play | `check-casual` B–D (the guest on plain http) |
| Cup isolation | `check-casual` C–E and the unit tests |
| Keyboard | `check-solo` H: a whole round with Tab and Enter, focus on the score at the results, Keep playing focused in the leave question |

### 6.4 Not tested here
- **WebKit / Safari:** not installed on this machine; not run.
- **Real iPhone or Android devices:** not run. The plain-http checks use this machine's own network address in Chromium; a phone on a real home network is still the real-device checklist's job (`docs/REAL_DEVICE_TESTING.md`).
- **Screen readers:** labels and focus order are checked by the driver; no screen reader was run.

### 6.5 Gates
Each verdict is one run on one revision.
- **Fast gate** on `79a92a9`: **PASSED (exit 0)**, run `20261110-111110-79a92a9e-12770`: typecheck (server and web), lint, web build, 1,149 unit tests in 104 files.
- **Targeted gate** on `79a92a9`: **PASSED (exit 0)**, run `20261110-111112-79a92a9e-12814`: 18 of 18 (build, preflight, and `check-solo`, `check-casual`, `check-mchezo`, `check-math`, `check-stage2`, `check-spectator`, `check-library-nav`, `check-lobby-fixes`, `check-mobile`, `check-lobby-mode`, `check-sessions`, `check-recovery`, `check-viewports`, `check-history-links`, `check-library`, `check-poll-body-stall`).
- `3db8a99` then fixed the StrictMode remount (development builds only) and added the keyboard checks; `check-solo` (61 checks) and `check-casual` (30) passed on it outside the gate.
- **Full gate** on `35f90c1` (the code of `3db8a99` plus this record): **PASSED (exit 0)**, run `20261110-112312-35f90c11-18967`, fresh clone, clean tree (fingerprint `3613e339772f`, 408 files). 77 passed, 0 failed, 0 timed out, 0 not run, in 25m 17s on 3 workers; 1,149 unit tests in 104 files; all 70 drivers (the 68 before plus `check-solo` and `check-casual`) and E2E 15 of 15. `check-solo` made 61 checks and `check-casual` 30, both plain-http checks at a real insecure origin. Chromium headless shell 153.0.8010.12, Node v22.23.4.
- **After the full gate started,** my own review found seat recovery by a solo room's code still answering (D-S61-03). Fixed in `453fda5` (one lookup, one unit test that failed first). I did not interrupt the running gate; the fix has its own runs:
  - fast gate on `453fda5`: **PASSED (exit 0)**, run `20261110-112530-453fda50-22327`, 1,150 unit tests in 104 files;
  - targeted gate on `453fda5` (`solo`, `casual`, `recovery`, `sessions`), fresh clone, clean tree: **PASSED (exit 0)**, run `20261110-114857-453fda50-2186`, 6 of 6.
- Raw evidence for each run: `docs/evidence/gate-runs/`.

### 6.6 Review repairs (ChatGPT's review of PR #6, comment 6769583991)
Every finding was reproduced on the reviewed head `96eaea5` with the real `SoloSession` class before it was fixed (`docs/evidence/review-pr6/`).
- **P2, bounded requests (D-S61-09):**
  - every solo request runs fetch and reply under one timeout (6 s), and Start runs within 15 s overall;
  - Leave, a new Start and the screen going away abort the run's requests, and a generation check drops replies for an older run;
  - Start ends in the round or in an error with **Try again**;
  - a Start with no answer reads the room once and adopts the round it made, if it exists; a room whose join got no answer is joined again on Try again.
- **P2, lost seat vs passing failure (D-S61-09, D-S61-03):**
  - 401/403/404 ends the round as lost, with **Start a new round** (the only path that makes a new room);
  - a timeout, a 5xx or a dropped connection keeps the round and the seat, says "Reconnecting…" after 8 s without a good reply, and clears on the next good one;
  - a passing failure while checking the seat fails Start and makes no room.
- **Personal best (D-S61-05):** a record under other rules in a game's slot is ignored on write too.
- **SoloHome copy:** "More solo games are on the way. For now the other games are played in a room", with no invented player minimum (Word Connections and Pattern Pulse have a minimum of 1).
- **Answers to the handoff's questions:** the plain-http fix stays here (D-S61-10); room retention is queued as a pre-deployment readiness task (`docs/MILESTONES.md`).
- **Tests:**
  - `stage61-solo-client` has 26 tests: 14 new fault-injection tests at the session boundary, 1 personal-best test, and the earlier 11.
  - `check-solo` section I injects the faults in the browser: no reply to Start, a 500 outage mid-round, a 401 lost room, and a 500 on the seat check.
  - Mutation checks each fail at least one new test: removing the request timeout fails 7; retiring a seat on a passing failure fails 3; treating a lost seat as passing fails 2; no Start reconciliation fails 1; dispose not aborting fails 1; Start with none of its five generation checks fails 1. Removing any single one of those checks leaves the others to catch the late reply, so each check alone is defence in depth.
- **Gates on `51d01b9`** (fresh clone, clean tree, fingerprint `ee2d4798c106`):
  - fast gate **PASSED (exit 0)**, run `20261110-142701-51d01b9f-4372`: 1,165 unit tests in 104 files;
  - targeted gate **PASSED (exit 0)**, run `20261110-142749-51d01b9f-7153`: 8 of 8, with `check-solo` 80 checks, `check-casual` 30, `check-tv-outage` 14, `check-poll-body-stall` 12, `check-recovery` 20, `check-sessions` 23.
  - As the review asked, no full gate was run for these local repairs.
  - The last full gate is still the one on `35f90c1` (§6.5). The source changes since then are `453fda5` (seat recovery by code) and `51d01b9` (these repairs: the solo session, personal best, the solo screens and `check-solo`). No server or shared client code changed in `51d01b9`.
