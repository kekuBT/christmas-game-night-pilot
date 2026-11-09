# Stage 4: post-audit UX completion and multiplayer validation

**Branch:** `claude/stage4-experience-completion`. It starts from the verified Stage 3 QA record `c307081`, whose code checkpoint is `b1dd580`.
**Input:**
- The Stage 3 audit package (ISSUES, STATUS, TEST-MATRIX, evidence).
- `docs/stage3-qa/README.md`, which lists what was already fixed and is not repeated here.
- `docs/DECISIONS.md` and `docs/PROGRESS.md`.

**Scope rules:**
- No merge, deployment, port exposed or spend.
- No change to scoring, Cup rules or content approvals; nothing provisional was approved.

**Decisions:** D-S4-01 to D-S4-10 in `docs/DECISIONS.md`. Proposals awaiting the owner are listed in §8.

**What "tested" means here:** Chromium (chrome-headless-shell 153, Playwright build 1243) with emulated phone sizes, at 375×667, 390×844, 430×932, 768 and 1440.
- Chromium is **not** Safari. Swipe-back, downloads, the toolbar and backgrounding behave differently on iOS.
- **No real iPhone was used.** §9 is the checklist for one.

## 1. Summary of improvements

- **Library**
  - Inside a room, each game says whether it fits the people there ("Fits your 2 players", "Needs 2 more players (4–10 players)").
  - "Practice only" explains itself: fun, never counts toward the Cup, and why.
  - Filters have clear labels ("Group size", "Your room (N)"). Sort is separate from filters. There are Done, Clear all and reversible chips.
  - Search, filters and sort live in the address, so Back, Forward, refresh and game details keep them.
- **Back during a game:** lands on Home with Rejoin, not the Library. The server clock, the seat and the score are untouched, and Forward, refresh and Rejoin return to the game.
- **Unreachable server or proxy page:** the room stays on screen with the usual "Can't reach the game server" notice. It no longer blanks to "You're in, friend." with 0 players.
- **Family Cup,** in this order:
  1. The day ("Day N of 7").
  2. The server's standings, or an honest empty state.
  3. The official games so far.
  4. What's next.
  5. The rules, folded.
  6. Host tools, separate and host/cohost only.
- **Memory Book:**
  - Exports say "Preparing…", "Download started: christmas-memory-book-CODE-date.pdf" or "Couldn't prepare…"; never "saved".
  - Downloads are off, with the reason, until an entry is approved.
  - Guests see no approval buttons.
- **Names:**
  - Similar names stay distinguishable: the shortest unambiguous form of the player's own name, with the full name as the tooltip.
  - Lobby and standings names are never cut; a name may take two lines.
- **Trivia reveal:** "Replay from Q1" replaces the greyed-out Play at the end.
- **Word Connections:** one type size per board, so tiles are uniform and nothing is clipped at 375/390/430.
- **Studio:**
  - Team Clash says what it needs.
  - "No games fit" lists the format's games with their player ranges.
  - Studio is reachable from the Library for the host and cohost; guests see a host-tool note and no actions.
- **Join:** the code hint is said once.
- **Caption Clash** (found by the four-player run):
  - A caption or vote shows as counted only when the server has it ("Sending…" until then).
  - A failed send says so and keeps the words.
  - The TV says "1 vote".
- **Screens no longer jump back** (found by the ten-player run inside the first full gate): a poll overtaken by a newer push can no longer roll the screen back, for example from results to the game.

## 2. Reconciliation by audit ID

| Audit ID | Result in Stage 4 | Evidence |
|---|---|---|
| S3-LIB-01 Playable now | **Fixed.** Fit is by group size only. It never claims "playable now", because content and Cup rules are checked at Start. Visitors see plain requirements. | `tests/stage4-library.test.ts`, `check-library-nav`, `check-ten-players` (all 11 games fit 10) |
| S3-LIB-02 Practice only unexplained | **Fixed.** The card toggle explains it and gives the server's reason. Eligibility is unchanged. | `check-library-nav` |
| S3-LIB-03 "Players in the room" | **Fixed.** Now "Group size", plus "Your room (N)". | `check-library-nav` |
| S3-LIB-04 Panel and sort | **Fixed.** Sort is never a filter. Done, Clear all and chips added. | `tests/library.test.ts`, `check-library-nav` |
| S3-NAV-01 Back loses search | **Fixed** (filters live in the address). | `check-library-nav` (fails on the previous build: empty search) |
| S3-NAV-02 Back mid-game | **Fixed:** Home with Rejoin, with no trap and no confirm. | `check-library-nav` (fails on the previous build: lands on /library) |
| S3-LOB-03 Unreachable server | **Fixed (root cause).** | `tests/stage4-http.test.ts`, `check-library-nav` (blank screen on the previous build) |
| S3-CUP-01 Rules block standings | **Fixed.** New hierarchy; the server's standings in the server's order. | `check-cup-memory`, `check-official-practice`, `check-ten-players` |
| S3-MEM-01 No export feedback | **Fixed.** Real PDF and PNG downloads, the file name, and a forced failure. | `tests/stage4-memory.test.ts`, `check-cup-memory` |
| S3-TRV-02 Truncated similar names | **Fixed** in the waiting ring, the lobby circle (any size, 4–10 players) and the standings. | `tests/stage4-names.test.ts`, `check-stage4-details`, `check-ten-players` (18 failures on the previous build) |
| S3-TRV-03 Disabled Play reveal | **Fixed:** "Replay from Q1"; timing and secrecy unchanged. | `check-stage4-details` |
| S3-WCN-03 Tile type | **Fixed:** one size per board, nothing clipped at 375/390/430, words unchanged. | `check-stage4-details` |
| S3-STU-01 Team Clash copy | **Fixed** copy and the "no games fit" explanation. No new team games. | `check-stage4-details` |
| S3-STU-02 Studio discoverability | **Fixed:** from the Library for the host/cohost; a host-tool note for guests. | `check-stage4-details` |
| S3-JOIN-01 Duplicate help | **Fixed.** | `check-stage4-details` |
| Caption Clash "frozen at 2 of 4" (Game 7) | **Root cause found and fixed** (§3). With a healthy connection, the counts are right after every action on all four phones and the TV. | `check-caption-4p` (4 failures on the previous build) |
| Ten-player room (blocked in the audit) | **Tested;** two name-cutting defects fixed (§5). | `check-ten-players` |
| Screen rolled back by an overtaken poll (found in gate run 1, §7) | **Root cause found and fixed** (§3). | `tests/stage4-http.test.ts`, `check-stage4-details` (fails on `eb23f33`) |
| S3-TV-01/02/05/06, S3-MTH-01, S3-RES-01/03/04, S3-HOME-01/02, S3-LOB-01/02, S3-WCN-01/02, S3-TRV-01 | Already fixed in Stage 3 QA (`docs/stage3-qa/README.md` §A); not repeated. Their drivers ran again in the gate (§7). | gate |
| S3-LOB-01 Official default | **Unchanged** (owner decision; the default stays Official). `check-official-practice` asserts it. | — |
| S3-TRV-04 Sit-out on the briefing | **Not changed:** sit-out behaviour is an owner decision. | §8 |
| S3-TV-03, S3-TV-04 | **Deferred** (as in Stage 3 QA; TV-03's "who answered" needs A-19). | §8 |
| S3-RES-02, S3-RES-05 | **Intentional** (owner-confirmed tie treatment; brief confetti, D-UX-22). | — |

## 3. Root causes

- **S3-LOB-03, blank lobby.**
  - `get()` turned any non-JSON 200 reply (a proxy or stopped-preview page) into `{}`.
  - That `{}` became the room projection, so the lobby rendered with no players and "You're in, friend.".
  - Now replies must be JSON, and every route that receives a projection (poll, WebSocket, spectator poll) checks its shape. The last good room stays on screen.
- **S3-NAV-01, filters lost on Back.** Library state lived only in React memory; the address never carried it.
- **S3-NAV-02, Back left the game.**
  - The audit's tab opened the join link as a fresh page after visiting `/library`, so Back went to `/library`.
  - Now a room screen with nothing of ours beneath it gets Home placed beneath it once.
- **S3-TRV-02 and the ten-player names.** Names were one line with an ellipsis, so "Cousin Amani" and "Cousin Amina" both showed as "Cousin…".
  - The detail driver compared label text only. That is how the lobby case slipped through: the text differed while the pixels did not.
  - It now also fails on a visually cut label.
- **S3-WCN-03, uneven tiles.** Each tile picked its own font size from its own word's length. Size is now one class for the whole board.
- **S3-TRV-03, greyed-out Play.** At the last step, auto-play ended and Play stayed on screen, disabled.
- **S3-MEM-01, no export feedback.**
  - Exports had no status at all.
  - The share image returned silently when the canvas was unavailable.
- **Caption Clash, "Your vote ✓" while every screen said 2 of 4.**
  - The card drew "Your vote ✓" from the tap itself (`myVote ?? tapped id`).
  - The app's `intent()` never told the game screen that a send failed.
  - So a vote that never reached the server (the preview was dying) looked counted on the phone, while the server's count, correctly, did not move.
  - A failed caption was also wiped from its box.
  - Now the tick and "Caption is in" come only from the server's view, and a failure says so and keeps the words.
- **A screen rolled back by an overtaken poll.**
  - The app reads the room from WebSocket pushes and from HTTP polls (every 2 s and after each action), and it showed whichever arrived last.
  - So a poll could be made while the game was still on, the game could finish and its results be pushed and shown, and then the poll's older reply would land and put the game back on screen until the next poll.
  - Gate run 1 caught it: the host's phone, which was also sending actions, showed an empty results list for a moment.
  - Now a polled reply is dropped only when a newer projection was shown while it was in flight and its room counter (`seq`) is lower. Pushes always apply, so a restored server can't freeze the screen.
  - `check-stage4-details` reproduces it deterministically: it holds one poll, finishes the game, then releases the old reply.

## 4. Before and after (Chromium)

Before shots come from the build just before each fix:
- `b1dd580` (the Stage 3 QA checkpoint) for the Phase 1–4 items.
- `83e3db9` for Caption Clash.
- `b7400c8` for the ten-player names.

After shots come from the gate run in §7, on the final code revision.

| Item | Before | After |
|---|---|---|
| S3-LIB-01, room of 2, 390 | `before/lib-room2-390.png` | `after/lib-room2-390.png` |
| S3-LIB-02/03/04, visitor filters, 390 | `before/lib-visitor-filters-390.png` | `after/lib-visitor-390.png` |
| S3-LOB-03, proxy page | `before/lob03-html-200-390.png` (blank) | `after/lob03-proxy-page-390.png` |
| S3-CUP-01, results, guest 390 | `before/cup-results-guest-390.png` | `after/cup-results-390.png` |
| S3-CUP-01, results, host 1440 | `before/cup-results-host-1440.png` | `after/cup-results-1440.png` |
| S3-CUP-01, empty Cup | `before/cup-empty-guest-390.png` | `after/cup-empty-guest-390.png` |
| S3-MEM-01, host with entries | `before/memory-entries-host-390.png` | `after/memory-host-390.png` |
| S3-MEM-01, empty | `before/memory-empty-390.png` | `after/memory-empty-390.png` |
| S3-TRV-02, waiting ring | `before/trv02-ring-390.png` | `after/trv02-ring-390.png` |
| S3-TRV-02, lobby of 10 "Cousin …" | `before/trv02-lobby-10-375.png` | `after/trv02-lobby-10-375.png` |
| S3-TRV-03, end of the reveal | `before/trv03-standings-390.png` | `after/trv03-replay-390.png` |
| S3-WCN-03, tiles at 375 | `before/wcn03-tiles-375.png` | `after/wcn03-tiles-375.png` |
| S3-STU-01, Team Clash for 2 | `before/studio-team-clash-2p-390.png` | `after/stu01-team-clash-390.png` |
| S3-JOIN-01 | `before/join-code-390.png` | `after/join01-390.png` |
| Caption Clash, failed vote | `before/caption-06-vote-failed-390.png` (✓ shown) | `after/caption-06-vote-failed-390.png` |
| Caption Clash, failed caption | `before/caption-03-send-failed-375.png` (words gone) | `after/caption-03-send-failed-375.png` |
| Ten players, lobby 375 | `before/ten-lobby-375.png` | `after/ten-lobby-375.png` |
| Ten players, standings 375 | `before/ten-standings-showall-375.png` | `after/ten-standings-showall-375.png` |

More after shots are in `after/`:
- Caption Clash: every round, results at 390/320, TV at 1280.
- Ten players: every viewport, results, Cup and TV.
- Official vs Practice: `op-*`.

## 5. Caption Clash (4 players) and the ten-player room

**`scripts/check-caption-4p.mjs`: 78 checks.** Setup:
- Its own server; an official game.
- **No content test mode:** Caption Clash's five legacy scenes are already official-eligible.
- Four phones in separate browser contexts (390/375/430/320) and a TV at 1280.

What it covers:
- **Briefing:** every phone explains the game and says Official, and the last Ready starts play.
- **Character limit:**
  - The box keeps 140 characters; typing more adds nothing, and the counter goes to "0 left".
  - A 300-character caption sent past the box is stored as 140 by the server.
- **Counts:** after every caption, skip and vote, "N of 4" is right on every phone that shows it and on the TV, and matches the server's count.
- **Every round transition:**
  - Round 1: the fourth caption opens voting at once, well before the deadline, and the fourth vote moves everyone on.
  - Round 2: a skip counts toward the total; a player with no caption can vote for all three.
  - Round 3: one player never votes, so the 22-second vote deadline (at time scale 0.5) finishes the game. Results arrived 22 s after the third vote, with no freeze at 3 of 4.
- **Results:**
  - The server's scores are 25 per caption plus 100 per vote: Keku 175, Amina 375, Baraka 350, Wanjiru 375.
  - Every phone shows every player's score.
  - Each round's favourite is credited to its author; the TV never shows authors.
  - The tie reads "Amina and Wanjiru tie for first", and the official standings tie too.
- **Recovery:**
  - Reload mid-vote: back on the ballot, unvoted.
  - Reload after writing: the caption is still shown.
  - Offline and back: "Connection lost", then the count is still right.
  - A phone reopened from scratch returns to its seat.
- **Cup:** the official Caption Clash is listed among the Cup's official games.
- **Failures:**
  - A caption and a vote whose requests are dropped show "That didn't reach the game…". The words stay, and no ✓ appears.
  - The server and TV counts don't move. Tapping again sends it.
- **Previous build:** 74 checks pass and 4 fail, exactly those failure checks.

**`scripts/check-ten-players.mjs`: 245 checks.** Setup:
- Ten phones (375/390/430/768/1440).
- Names: "Keku", "Cousin Amani", "Cousin Amina", "Cousin Amani Wanjiru", "Auntie June", "Auntie Joan", "Grandpa Joseph Otieno-Wanjiku", "Grandma Josephine", "Bartholomew Otieno-Wanjiku", "Wanjiru Kamau-Njoroge the Third".
- No content test mode.

What it covers:
- **Lobby:**
  - Every phone greets its own player by full name.
  - Ten seats: "You" once, and nine different labels, each from that player's own name with the full name as the tooltip.
  - No label is cut, split mid-word, off-screen or touching another.
  - "10 here · room is full". The circle doesn't move while idle, or after a whole game.
- **Limits:**
  - The eleventh person is told "Room is full (10 players)", and the server still has 10.
  - They can still watch as a spectator, which takes no seat.
- **Eligibility:** the Library marks exactly the games that take 10 (all 11) as fitting.
- **Ready:**
  - "Ready · 0 of 10" with ten names on every phone; "N of 10" on the host's phone after each tap.
  - All ten agree at 9 of 10, and the tenth tap starts play for all.
- **Official Math with ties** (120 per right answer):
  - Every phone lists all ten with the server's points.
  - "You tied for / You came … of 10" is right for each player.
  - The tenth row and Back to lobby are reachable, with no sideways scrolling.
  - The Cup has all ten in the server's order, and tied players have equal official standings.
- **Practice Trivia:**
  - The preview never splits a tie at the cut, and your row is always in it.
  - "Show all 10 players" lists all ten with the server's scores and shared ranks.
  - Show fewer goes back to the preview.
  - The tenth row scrolls into view, not hidden, and nothing scrolls sideways.
  - The official standings do not move.
- **Defects found and fixed:**
  - Lobby names were cut (6 of 10 at every phone size).
  - Standings names were cut (for example "Wanjiru Kamau-Njoroge the Th…").
  - On the previous build the driver fails 18 checks, all these two.
  - A layout probe also measured rooms of 4, 6 and 8, at 320–1440: nothing cut, split, off-screen or overlapping.

## 6. Official vs Practice evidence

**`scripts/check-official-practice.mjs`: 29 checks.** Setup:
- Its own server and data, with **no content test mode**.
- Official games use Math Mayhem, whose questions are generated; nothing was approved.

| Situation | Server | Official standings |
|---|---|---|
| Lobby default for an eligible game | Start reads Official | — |
| Charades (practice-only) | Practice only; the lobby says why; an official start is refused | unchanged |
| Official start by a guest | refused ("Only host/cohost…") | unchanged |
| Official Category Sprint (no approved items) | refused (`CONTENT_EXHAUSTED`/`NO_SUITABLE_CATEGORY`) | unchanged |
| Practice Math, 4 players | finished, `countsOfficially: false`; results say practice; Cup still empty | unchanged |
| Official Math, 4 players | finished, counts | all four, in the game's order; the Cup screen shows the server's order and only the official game |
| Practice Math again, reversed scores | finished | unchanged; the Cup screen text is identical |
| Guest override; host override with no reason | refused | unchanged |
| Host correction of a *practice* score | accepted (an audited host tool) | unchanged |
| Word Connections official with 1 player | refused (`OFFICIAL_NEEDS_TWO`); the lobby offers Practice | nothing created |

## 7. Gate results

**Verdict:** `node scripts/gate.mjs full` on **`84ed7ed`**, from a fresh clone, **PASSED (exit 0)**, run `20261109-035458-84ed7ed0-4459`.
- 59 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests: 1001 in 87 files. E2E (Chromium): 12/12.
- Stage 4 drivers:
  - `check-caption-4p` 78 checks.
  - `check-ten-players` 245.
  - `check-official-practice` 29.
  - `check-stage4-details` 21.
  - `check-library-nav` 40.
  - `check-cup-memory` 35.
- Run conditions:
  - The only untracked file was a `node_modules` symlink.
  - Browser: chrome-headless-shell 153.0.8010.12 (set by `MCHEZO_CHROMIUM_PATH`).
- The verdict covers `84ed7ed` only. The recording commit after it is docs only (this README, its screenshots, DECISIONS and PROGRESS).

**A run that does not count:** `eb23f33`, run `20261109-023100-eb23f339-21480`. It FAILED (exit 1): 58 passed, 1 failed.
- `check-ten-players` failed 3 checks on the host's phone only. The Math results list was empty when read, though it was complete a moment later.
- That was the overtaken-poll defect (§3), fixed in `84ed7ed` with a deterministic repro added.
- No assertion was weakened: the ten-player driver still reads the list once, immediately.

**Targeted runs before the gate** (not a verdict):
- After Phase 4: 14 existing drivers.
- After Phase 5: 13 drivers on the lobby/standings CSS change.
- After the fix: 8 drivers, including ws-reconnect, restart, recovery and math-timing.
- All passed.

## 8. Remaining issues and owner decisions

**Kept as they are (owner decisions, not changed here):**
- The default mode, Official (S3-LOB-01).
- A-19, anonymous completion counts. It also blocks S3-TV-03's "who answered".
- D2 solo practice; D-UX-10 forfeits; Math network-stall compensation (D-QA-02, Math scoring kept).
- Sit-out behaviour (S3-TRV-04); host/cohost permissions; the brief winner celebration; reduced motion; tie treatment.
- The override audit trail stays host-only (D12).

**Proposals for the owner (not implemented):**
- **P-S4-01:** names in Memory Book exports. Exports still carry the ledger facts as before; screens now show names.
- **P-S4-02:** Caption Clash rounds with a tied favourite. The results show one of the tied captions (the first in the server's order). Showing every tied caption would be clearer, but it touches tie presentation.
- **P-S4-03:**
  - Only Caption Clash shows a failed send on its own screen. Other game screens still don't show the app's error line.
  - A failed answer there was not tested in this stage.
  - Suggest the same "didn't reach the game" line everywhere.
- **P-S4-04:** "Connection lost. Reconnecting… Your answers are saved." is true for answers the server confirmed, not for a tap made while offline. Suggest "Answers the game confirmed are saved."
- **P-S4-05:** a TV "Back to lobby view" (S3-TV-04) and a TV question timer (S3-TV-03).

**Known limits:**
- Chromium only, with emulated sizes; no real iPhone and no real Safari.
- On 320-wide screens (below the tested sizes), the lobby's lowest seats sit behind the Start dock until scrolled. This is unchanged from before.

## 9. iPhone checklist (real device, Safari)

1. **Library as a visitor:**
   - Search "trivia", open filters, pick 4 players, tap Done.
   - Open a game's details, then swipe back twice: the details close, then the search and filters are still there.
   - Swipe forward, then pull to refresh: still there.
2. **Library in a room of 2:**
   - Cards say "Fits your 2 players" or "Needs N more players".
   - Tap "Practice only": it explains, with the reason.
   - "Your room (2)" filters.
3. **Back mid-game:**
   - During a Math question, swipe back: Home with Rejoin, and the game's clock kept running.
   - Rejoin, or swipe forward: back to the same question. No dialog appears at any point.
4. **Family Cup:**
   - A new room shows "Day 1 of 7" and "No standings yet".
   - After an official game, the standings are on the first screen and the rules are folded.
   - A guest sees no host tools.
5. **Memory Book:**
   - A guest adds "from last finished game"; the host approves.
   - Download PDF reads "Download started: christmas-memory-book-CODE-date.pdf". Check Files.
   - Try the image too; note what Safari does with it.
6. **Caption Clash, 4 phones:**
   - "N of 4" matches on every phone and the TV.
   - Put one phone in Airplane mode and tap a vote: "That didn't reach the game…", no ✓. Turn it off, tap again: ✓.
7. **Names:** with "Cousin Amani" and "Cousin Amina" in the room, the lobby circle and standings show both in full; nothing reads "Cousin…".
8. **Trivia reveal:** at the end, "Replay from Q1" plays from Q1; nothing greyed out.
9. **Word Connections at your phone's size:** all 16 tiles use one type size, and "ROAST TURKEY" or "GINGERBREAD" fit.
10. **Join and Studio:**
    - A join link pre-fills the code, and the hint appears once.
    - As host, Library → Studio works.
    - As a guest, Studio shows a host-tool note and nothing to press.
