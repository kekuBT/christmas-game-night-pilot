# Stage 5.1: combined live audit repair sprint

Branch `claude/stage5-audit-repairs`, created from the pushed Stage 5 head `fa823de` (not `main`). Nothing was merged or deployed. No port was made public, no paid service or new infrastructure was used, and no money was spent.

**What this sprint did:** it reproduced, fixed and verified the highest-impact findings from the Stage 5 live audits on the existing fourteen games, without undoing Stage 5. It added no new games or features.

**What it did not change:**
- Cup scoring, Cup eligibility and the Official/Practice rules. The three Stage 5 games are still Practice-only.
- Content approvals.
- Forfeit, sit-out and Math compensation rules.
- Any game's scoring or timing.

**Important limitation:** I did not have the three audit packages. These are `mchezo-audit-stage5-FINAL-2026-11-09.zip`, `Mchezo_Stage_5_Live_Product_Audit(1).zip` and `Mchezo_Overall_Audit(1).zip`. They were not in the repository or in this session's container. I worked from the brief's description of each finding and never saw the auditors' screenshots, PDFs or manifests. Where I say a finding was "reproduced", I reproduced it myself, under controlled conditions described below. Where I couldn't reproduce it, I say so and say why.

Every claim here was checked in Chromium (headless, Playwright) and in unit tests. **Nothing was tested on a real iPhone, Android phone or TV.** The accessibility work was checked through Chromium's accessibility tree only, not with VoiceOver or TalkBack.

---

## 1. Reconciliation by original issue ID

### Categories

- **Confirmed defect:** reproduced here, or proven from the code path, with a failing check before the fix.
- **Strong observation:** reported live, but no capture of the failing moment was available to me, and I could not reproduce it exactly.
- **Suspected cause:** a likely explanation that is consistent with the evidence but not verified.
- **Usability concern:** the software does what it was designed to do, but people struggle with it.
- **Owner decision:** fixing it fully would change scoring, timing or rules.
- **Untested:** not exercised here.
- **Infrastructure:** a hosting or Codespaces failure, not a Mchezo defect.

### Issue register

#### S5-AUD-04 — Draw & Guess: one guesser's canvas stayed blank

- **Source and severity:** Muse. High.
- **Reported:** in a 4-player game, one guesser's canvas stayed blank for a whole 75 s turn while the others saw the drawing. The drawing appeared only at the reveal.
- **Evidence available to me:** the brief's text only.
- **Reproduction:**
  - The exact failure was **not reproduced**. Under 12 controlled faults, every guesser and the TV stayed within 821 ms of the server's drawing (§5).
  - **One path was reproduced:** when both the WebSocket and the HTTP polls stall for one guesser, the canvas stays blank and says nothing. This was a failing check before the fix (`logs/draw-sync-BEFORE-fix.log`).
- **Category:**
  - Strong observation.
  - The silent stall is a confirmed defect.
  - The live incident's root cause is only suspected: a connection that stalled without closing (§3).
- **Outcome:** **Fixed:** the silent part. A screen now detects and says when it can't reach the game, polls time out, and the server sends keep-alive frames (§3, §5).

#### O-02 — Answers carried from one question or game into the next

- **Source and severity:** Overall audit. High.
- **Reported:**
  - Category Sprint answers stayed in later rounds and in other games.
  - An Impostor clue stayed in its final-guess box.
  - Closest Wins kept a number from the previous question.
- **Evidence available to me:** the brief's text.
- **Reproduction:**
  - **Reproduced** for Sprint: rounds 2 and 3 kept round 1's words (`logs/input-isolation-BEFORE-fix.log`).
  - Confirmed in code for the others: one shared `textInput`/`numInput` in `App.tsx` fed every game's older panel.
- **Category:** Confirmed defect.
- **Outcome:** **Fixed** (§3, §6).

#### S3-MTH-01 — Math Mayhem: timing fairness

- **Source and severity:** prior Stage 3 issue, open for live revalidation.
- **Reported:** might a visible phone that is waiting for a delayed question lose speed-bonus time?
- **Evidence available to me:** controlled measurements in 7 conditions (§7).
- **Reproduction:**
  - The residual was **measured**. When only polling delivers and the open reply stalls, the question became answerable 2.0 s after the server opened it, and the server times from its own open.
  - The +20 (≤5 s) and +10 (≤10 s) thresholds behaved as designed.
  - A retry did not reset the timer.
- **Category:** Owner decision.
- **Outcome:** **Not fixed:** this needs a scoring-policy change. The alternatives are in §12.

#### S5-AUD-02 — Pattern Pulse: players couldn't lock in before time ran out

- **Source and severity:** Muse. Not stated (Phase 2).
- **Reported:** three players entered correct sequences but did not reach "Lock it in" within "the 12-second answer window".
- **Evidence available to me:** measured at 320, 375, 390 and 430 px and with Reduced Motion (`logs/pulse-timing-*.log`).
- **Reproduction:**
  - **Not reproduced** as a timing failure. The real windows are 16.5–24 s (12 s + 1.5 s per shape), not 12 s.
  - The answer screen appeared 0.33–0.56 s after memorising ended.
  - Entering 3–4 shapes at 0.7 s per tap took 2.2–3.0 s.
  - Every key and the Lock button were on screen without scrolling.
  - **Confirmed:** a complete entry that is never locked scores 0 when time runs out. This is by design.
- **Category:** Usability concern and owner decision.
- **Outcome:** **UI improved; timing and scoring are unchanged.**
  - The time left now sits above the keys.
  - A full entry gets the line "All N in. Tap Lock it in to send: it only counts once locked."
  - The Lock button is highlighted.
  - Recommendation (§12): auto-lock a complete entry at expiry. Owner decision.

#### S5-AUD-07 — The TV stayed silent during an outage

- **Source and severity:** Muse. Not stated (Phase 2).
- **Reported:** during the Codespaces outage, phones said "Connection lost" while the TV silently showed a stale lobby.
- **Evidence available to me:** code and a driver.
- **Reproduction:** **Reproduced.** When the server stopped, the TV said nothing (`logs/tv-outage-BEFORE-fix.log`). Its poll swallowed every error.
- **Category:**
  - The TV's silence is a confirmed defect.
  - The outage itself was infrastructure: by the brief's account, a stopped Codespace, not a crashed Mchezo server. I could not observe it.
- **Outcome:** **Fixed** (§3).

#### 2C — Action acknowledgement (no audit ID; the brief's recheck)

- **Source:** the brief.
- **Evidence available to me:** a driver (`check-action-ack`).
- **Reproduction:**
  - **A gap was found.** Suppose the server applied an action but the reply was lost. The phone then showed "We couldn't confirm that" next to the server-confirmed state. This happened in Trivia, Majority Rules, Pattern Pulse and Draw & Guess (`logs/action-ack-BEFORE-fix.log`).
  - No double scoring was found: retries reuse one event id, and a second tap is refused.
- **Category:** Confirmed defect (low).
- **Outcome:** **Fixed** (§3).

#### O-05 — Family Cup: decimals and shared places

- **Source and severity:** Overall audit. Medium.
- **Reported:** raw decimals and unclear ranks on the Cup.
- **Evidence available to me:** code.
- **Reproduction:** confirmed in code. The screen showed raw averages (e.g. 66.66666666666667) and never showed shared places.
- **Category:** Confirmed defect (display).
- **Outcome:** **Fixed, display only** (§3).

#### O-06 — Charades: teams unclear

- **Source and severity:** Overall audit. Medium.
- **Reported:**
  - The screens didn't name the teams, their members or their scores.
  - Instructions contradicted each other about which team guesses.
- **Evidence available to me:** code.
- **Reproduction:**
  - Confirmed in code: no team names or members on the phone or the TV.
  - The TV said "their team guesses". Scoring credits the actor's team, and nothing records who guessed.
- **Category:** Confirmed defect (display) and owner decision (§12).
- **Outcome:** **Fixed, display only; the mechanic is unchanged** (§3).

#### O-07 / S5-AUD-01 — Progress indicators

- **Source and severity:** Overall audit and Muse. Medium.
- **Reported:**
  - Closest Wins showed everyone as having guessed on a new question.
  - Who Said That showed aggregate progress while a player still had questions left.
  - Majority Rules briefly showed older round scores.
- **Evidence available to me:** a driver.
- **Reproduction:** **All three reproduced** (`logs/progress-BEFORE-fix.log`):
  - Closest Wins: "3 of 3 have guessed" on a new question nobody had answered.
  - Who Said That: "3 of 4 players have played so far" with only 2 finished.
  - Majority Rules: an older poll reply rolled the reveal back.
- **Category:** Confirmed defects.
- **Outcome:** **Fixed** (§3).

#### 3D — Instructions and results copy (no audit IDs)

- **Source and severity:** the brief. Medium.
- **Reported:** nine copy items:
  1. Pattern Pulse's game and round clocks.
  2. Impostor's TV wording.
  3. Caption Clash's writing points.
  4. Draw & Guess's six-drawer limit.
  5. Draw & Guess's "Drew or guessed" count.
  6. Draw & Guess's swap and guess limits.
  7. Partial play shown as "sat out".
  8. Featured Practice-only games.
  9. Sprint and Geography durations.
- **Evidence available to me:** code, checked against each game's constants. `tests/stage51-copy.test.ts` reads the real values.
- **Reproduction:** **Confirmed in code**, each one (§3).
- **Category:** Confirmed defects (copy).
- **Outcome:** **Fixed, copy only.** Some session estimates are left for the owner (§12).

#### 3E — Library loses its filters and its room

- **Source and severity:** the brief. Medium.
- **Reported:** a filtered in-room Library becomes an unfiltered standalone Library after Back or Lobby.
- **Evidence available to me:** a driver.
- **Reproduction:** **Reproduced** with a link opened straight onto the room's Library in a fresh tab. "Back to lobby" landed on Home (`/`), outside the room (`logs/history-links-BEFORE-fix.log`).
- **Category:** Confirmed defect.
- **Outcome:** **Fixed** (§3).

#### 3E — Memory Book cites the wrong game

- **Source and severity:** the brief. Medium.
- **Reported:** a Memory Book page left open while a game ended may link a new highlight to the previous game.
- **Evidence available to me:** a probe on the old build.
- **Reproduction:** **Reproduced.** The entry cited game 1 (`evt-11`) after game 2 (`evt-19`) had finished (`logs/memory-citation-BEFORE-fix-probe.log`).
- **Category:** Confirmed defect.
- **Outcome:** **Fixed** (§3).

#### O-12 — Accessibility of the older game screens

- **Source and severity:** Overall audit. Medium.
- **Reported:** missing semantic grouping, unhelpful answer feedback, unreadable flags.
- **Evidence available to me:** Chromium's accessibility tree.
- **Reproduction:** confirmed in that tree (`logs/a11y-surfaces-BEFORE-fix.log`):
  - The flag question's heading was the bare emoji 🇮🇹.
  - Who Said That's questions had no groups.
  - An answered question said only "Answered."
- **Category:** Confirmed in Chromium only. What a screen reader would actually speak is **untested**.
- **Outcome:** **Fixed, verified in Chromium only** (§3).

#### O-14 — Internal ids on player screens

- **Source and severity:** Overall audit. Medium.
- **Reported:** internal ids visible to players.
- **Evidence available to me:** code.
- **Reproduction:** confirmed in code:
  - About 20 places fell back to a game id, e.g. `who-said-that`.
  - Several fell back to a player id, e.g. `player-3`.
  - The older panel showed "Status: playing".
- **Category:** Confirmed defect.
- **Outcome:** **Fixed** (§3).

#### Phase 4 — Rooms rewritten on every action

- **Source:** the brief and the audit.
- **Reported:** room files are rewritten on every action.
- **Evidence available to me:** measurement (`logs/persistence-*.log`).
- **Reproduction:** confirmed, and it is by design: every accepted action is saved before it is acknowledged. The cost was measured.
- **Category:** Measurement.
- **Outcome:** **Optimised safely.** Compact snapshots write about 4× less to disk. Network cost is a documented follow-up (§3, §12).

#### Codespaces outage

- **Source:** the brief.
- **Reported:** a stopped Codespace.
- **Evidence available to me:** none.
- **Reproduction:** not reproducible here.
- **Category:** Infrastructure.
- **Outcome:** Not a Mchezo defect. The TV now says when it loses contact (S5-AUD-07).

---

## 2. Exact baseline

- **Verified Stage 5 code: `8879c3f`.**
  - Gate PASSED: run `20261109-080851-8879c3f6-18873`, 65/65 steps.
  - 1,055 unit tests, E2E 15/15.
- **Pushed Stage 5 head: `fa823de`.** It changes docs only after `8879c3f`: 47 files, all under `docs/` (`git diff --stat 8879c3f fa823de`).
- **This branch:** `claude/stage5-audit-repairs`, created from `fa823de`.
- The "before" evidence was run against the `fa823de` code, which is identical to `8879c3f` in everything except docs. Some before-runs were taken at the commit just before each fix, against the build from that commit; each log says which.
- **Environment:** a cloud container, Node v22.23.4, Chrome for Testing (headless shell) 153.0.8010.12 via `MCHEZO_CHROMIUM_PATH`.

## 3. Root causes

**Verified** means reproduced, then shown fixed by the same check. **Suspected** means consistent with the evidence but not proven.

### S5-AUD-04 — the silent stale canvas (verified for the stall path; the live incident is suspected)

**The defect:**
- Before, a phone's poll (`get()` in `App.tsx`) had no timeout.
- A socket that stopped delivering without closing (as a proxy or Codespaces tunnel can) was never noticed.
- So a guesser whose socket and polls both stalled kept an empty canvas with no message, while other phones were fine.

**The fix:**
- `apps/web/src/liveness.ts`: polls time out after 6 s (`fetchFresh`, `cache: "no-store"`). A watchdog marks the screen stale when nothing fresh has arrived for 8 s. It then shows the connection banner and closes the socket so it reconnects.
- The server sends every socket an `alive` frame every 4 s (`ALIVE_MS`), so a quiet room isn't mistaken for a dead link.
- Every API reply says `cache-control: no-store`.

**What is not proven:** that this was the auditors' cause. No other fault reproduced a blank canvas: delayed or out-of-order replies, hidden tabs, reloads, the drawer offline, a spectator joining, undo and clear, rapid bursts.

### S5-AUD-07 — the TV hid its outage (verified)

**The defect:** the spectator poll in `App.tsx` swallowed every error and had no watchdog, so the TV kept its last screen and said nothing.

**The fix:**
- The spectator path has the same liveness watchdog.
- `TvConnectionNote` (role=status) says "Connection to the game lost. This screen may be out of date. Reconnecting…", then "Reconnected. This screen is up to date."
- The last display stays on screen. Nothing private is shown.

### O-02 — answers carried over (verified)

**The defect:** the older `GamePanel` took `textInput`, `numInput` and `selectedTiles` from `App.tsx`. One shared draft outlived every round, phase and game.

**The fix:**
- The panel owns its drafts and is mounted per `draftKey`: game instance plus the server's `phaseKey`. A new round, a new phase (an Impostor clue, then the guess) or a new game gets fresh, empty inputs.
- A failed send keeps its text, because the key doesn't change.
- Closest's number input is keyed per question.
- A blank number box can't be sent as 0.
- Sprint shows "Your answers are in: …" from the server's own record (`mySubmission`, visible to that player only).

### S3-MTH-01 — the timing residual (measured; not changed)

- The server times a Math answer from its own open.
- When the phone hears of the open only through a stalled reply and polling, the question becomes answerable about 2 s late. Those 2 s count against the player.
- Every other condition was within 50 ms (§7).

### S5-AUD-02 — Pattern Pulse locking (measured; the reported cause isn't supported)

- At real timings there was always 13.6 s or more to spare after entering a 3-shape pattern.
- The likelier problem is that a full entry still needs "Lock it in", and that wasn't said. It is now. Nothing about timing changed.

### 2C — "couldn't confirm" after the server had it (verified)

**The defect:** when every reply was lost but the server had applied the action, the phone's failure line stayed beside the confirmed state.

**The fix:**
- The server keeps each player's last 16 accepted event ids in memory and shows them only in that player's own projection (`me.acceptedEventIds`). After a restart they are rebuilt from the saved replay store, so nothing new is saved.
- Once the failed send's id appears there, the line says "That went through after all: the game has it." (`SendNote`).

### O-05 — Cup display (verified in code and unit tests)

**The defect:** the Cup screen showed raw averages and ordinal places with no ties.

**The fix:**
- `fmtPoints` shows at most one decimal.
- `sharedPlaces` shares a place ("=") only when the server's own tie-breaks call it a tie: total, then day wins, then the median day, then the finale.
- A note explains the order. Display only.

### O-06 — Charades teams (verified in code)

**The defect:** the projection had team scores but no team membership, so no screen could name teams.

**The fix:**
- The projection now includes the teams and the actor's team; the prompt is still the actor's only.
- The phone and TV say who is acting for Team A or B, list both teams with their scores, and show the result.
- The Correct button says "+100 to Team X".
- The mechanic is unchanged. Whether the other team may guess is an owner decision (§12).

### O-07 — progress counts (verified)

**Closest Wins and Who Said That:**
- *Defect:* both showed `submittedCount`, which counts anyone who has acted once in the game.
- *Fix:* the server publishes `progress` (counts only, from each game's own completion rules):
  - `started`;
  - `answeredNow`: the current Closest question, or the current Majority round;
  - `finished`: Trivia, Who Said That, Geography, Guess the Year and Pattern Pulse.

  Every label says what it counts.

**Majority Rules:**
- *Defect:* the Stage 4 overtaken-reply guard compared the ledger `seq`, which doesn't move between rounds, so an older poll reply could roll the screen back.
- *Fix:* every projection now carries a room revision (`rev`) that rises on every broadcast. The guard compares it when both sides have one.

### 3D — copy (verified against the constants)

**Pattern Pulse:**
- The briefing gives the real answer window (16–24 s) and says that the game has its own clock.
- A round opened late now counts down to whichever is earlier: its own window or the game's end. The server refuses answers after the game deadline.

**Impostor:**
- The TV no longer says the impostor has "a different word". They see only the category.
- A briefing states the rules, the tie rule and scoring.

**Caption Clash:** 25 points for a caption, plus 100 per vote.

**Draw & Guess:**
- "Up to six turns; in bigger rooms six players chosen at random draw".
- One word swap, before drawing starts.
- 12 guesses per drawing, with "N guesses left" once guessing starts.
- Results say "Drew or guessed **right** in N of M turns".

**Sitting out after playing part of a game:** "You sat out the rest". The results keep the place earned, including the win celebration.

**Home:** a featured game that is Practice-only says so.

**Duration estimates:**
- Category Sprint: "about 5 min" (it was 10; the hard limit is 4).
- Geography: "about 7 min" (it was 12; the hard limit is 6).

### 3E — Library and Memory Book (verified)

**Library:**
- *Defect:* in-app Back stepped back blindly. A tab opened straight onto a room screen has Home beneath it (Stage 4, S3-NAV-02), so "Back to lobby" went Home.
- *Fix:* each history entry now records where in-app Back lands. `backTo(LOBBY)` steps back only when that is the lobby; otherwise it replaces the entry with the lobby. Browser Back still offers Home with Rejoin, and the room's Library reopens with this tab's last view.

**Memory Book:**
- *Defect:* the ledger loaded only when the screen opened.
- *Fix:* it reloads whenever the room's ledger `seq` moves. The screen shows "Linked to <game> · Day N" before adding. Adding waits while the ledger is behind and sends exactly the game shown.

### O-12 / O-14 — older screens (verified in Chromium)

**Flags:**
- The flag emoji is now a picture named "Flag: <description>". The description comes from the pack's own accessibility note, or else the explanation's text before its colon. It is never used if it names an option (`flagAlt`).
- Sighted players see the same emoji.

**Who Said That:**
- Each question is a fieldset named by its quote ("question N of M").
- An answered question says "Your answer: <option>".

**Internal ids:**
- Game titles fall back to the manifest title, then "This game".
- Missing players appear as "A player".
- The older panel says "In play", not "Status: playing".

### Phase 4 — storage (measured)

- Every accepted action is saved before it is acknowledged (durability by design).
- Snapshots were indented JSON, which put every number of a stroke on its own line: a busy drawing room was about 4.5× its data size.
- Snapshots are now compact. Saves, `.prev`, fsync and atomic rename are unchanged.

## 4. Fixed and deferred findings

### Fixed, by commit

| Finding | Commit |
|---|---|
| S5-AUD-04 (the silent stall), S5-AUD-07 | `5230c36` |
| O-02, O-06, O-05; S5-AUD-02 (UI only) | `47bfff1` |
| 2C | `02929a8` |
| O-07, S5-AUD-01 | `aed6055` |
| 3E (Library and Memory Book) | `829e1f4` |
| 3D (nine copy items) | `a529ab4` |
| O-12, O-14 | `a3ac6bf` |
| Phase 4 (compact snapshots) | `626f150` |
| The script inventory | `9905460` |

### Deferred (owner decision or follow-up, §12)

- The S3-MTH-01 residual.
- Pattern Pulse auto-lock or grace period.
- Whether the other Charades team may guess.
- Session estimates above their hard limits for Impostor, Trivia, Who Said That and Guess the Year.
- Draw & Guess network cost: each push carries the whole drawing.
- Proper alt text for the two legacy flag questions.

### Not reproduced

- S5-AUD-04's exact live failure (§5).
- S5-AUD-02 as a timing failure (§1).

## 5. Draw & Guess synchronisation evidence

**Driver:** `scripts/check-draw-sync.mjs` (62 checks).

**Setup:**
- Four players in independent browser contexts and a spectator TV, with a second TV joining mid-turn.
- Every player takes a turn.
- A sampler compares the server's confirmed drawing, read from the public projection as pieces:points (`data-sig`), with what each guesser's and each TV's canvas renders.
- It also records every projection each guesser received over the WebSocket and over HTTP. That separates "received but not rendered" from "never received".

**Faults, one guesser at a time:**
- the socket silent;
- poll replies delayed and delivered out of order;
- socket and polls both stalled;
- the page hidden and shown;
- a guesser reloading;
- the drawer reloading;
- the drawer offline and back;
- a spectator joining;
- undo, clear, and a burst of 12 rapid strokes.

**Pass condition:** no guesser may stay behind the server's drawing for more than 3.5 s while others show it. The final reveal is not counted as live delivery.

**Results:**
- **Before** (`logs/draw-sync-BEFORE-fix.log`): 61 passed and 1 failed. The failure: "turn 4: a guesser whose replies all stall is told it can't reach the game (not a silent blank)".
- **After** (`logs/draw-sync-after.log`): 62 of 62 passed.
  - Across 19 viewer-turns (Keku, Amina, Baraka, Wanjiru, TV, TV2), the worst lag behind the server was **821 ms**.
  - Zero samples of a drawing received but left unrendered.

## 6. Cross-game input isolation tests

**Driver:** `scripts/check-input-isolation.mjs` (22 checks, time scale 0.4). Four players across Category Sprint (3 rounds), Impostor (clue, then the final guess), Closest Wins (questions 1–2) and back-to-back games.

**What it checks:**
- Each new round, phase and game starts empty.
- A failed send keeps its words in the same round.
- The server's record of your own answers shows, and never another player's.
- A second send for the same round is refused.

**Results:**
- **Before** (`logs/input-isolation-BEFORE-fix.log`): Sprint rounds 2 and 3 kept round 1's words. The run then stopped, so the Impostor and Closest checks never ran on the old build. Their before-state is code-derived (§3).
- **After** (`logs/input-isolation-after.log`): 22 of 22 passed.

**Unit tests (`tests/stage51-inputs.test.ts`):**
- `draftKey` changes per game, round and phase.
- Sprint's `mySubmission` is private, and a duplicate send is refused.

## 7. Math timing measurements

**Driver:** `scripts/check-math-network.mjs` (16 checks), real timings, controlled delivery (`logs/math-network-measurement.log`).

**Columns:**
- *Answerable after open:* when the phone could first tap, relative to the server's open.
- *Tapped after open:* when the driver tapped, relative to the server's open.
- *Server measured:* the elapsed time the server scored.

| Condition | Answerable after open (ms) | Tapped after open (ms) | Server measured (ms) | Points |
|---|---|---|---|---|
| 1 page hidden at start | 44 | 1047 | 1079 | 120 |
| 2 open request delayed 3 s | 28 | 1031 | 1055 | 120 |
| 3 open accepted, reply stalls 15 s | 42 | 1044 | 1075 | 120 |
| **4 socket silent + reply stalls 15 s (polling only)** | **2027** | **3030** | **3059** | **120** |
| 5 first two opens lost, phone retries | 20 | 1023 | 1052 | 120 |
| 6 reload mid-question | 35 | 2633 | 2668 | 120 |
| 7 normal, answered at ~1 s | 37 | 1039 | 1069 | 120 |
| 7 normal, answered at ~6 s | — | — | 6083 | 110 |
| 7 normal, answered at ~11 s | — | — | 11080 | 100 |

**Findings:**
- The thresholds behave as designed: +20 up to 5 s, +10 up to 10 s.
- The server's clock is used, never the phone's.
- A retry does not reset the timer (condition 5).
- **Residual (condition 4):** about 2 s counted against a phone that hears of the open only through polling. A player who would answer at 3.5 s is measured at 5.5 s and gets +10 instead of +20.

This is **not fixed**, because fixing it changes scoring (§12). It is not reported as fixed just because normal play passes.

## 8. Before and after screenshots

**Made with:** `scripts/screenshot-stage51.mjs`.
- Each scenario is set up the same way on both revisions, through the API and selectors present in both.
- The viewport and revision of every image are in `before/manifest.json` and `after/manifest.json`.
- Phones are 390×844 (Pattern Pulse 375×667) at device scale 2; the TV is 1440×900.
- Chromium only.

**This is visual evidence only.** The checks are the drivers and unit tests. Some drivers also save screenshots while they run, under the `after/` names they print; those come from the revision the driver ran on.

| Finding | Scenario | Viewport | Before (`fa823de`) | After (`4acfea7`) | What to compare | Inspected by eye |
|---|---|---|---|---|---|---|
| O-02 | Round 2 of Category Sprint after sending round 1 | 390×844 | [before/o02-sprint-round2-390x844.png](before/o02-sprint-round2-390x844.png) | [after/o02-sprint-round2-390x844.png](after/o02-sprint-round2-390x844.png) | Before: round 1's “school, desk, chalk” still in the box (and the raw id “category-sprint”, “Status: playing”). After: empty box; “Category Sprint”, “In play”. | before and after |
| O-07 | Closest Wins on the TV as question 2 opens | 1440×900 | [before/o07-closest-tv-q2-1440x900.png](before/o07-closest-tv-q2-1440x900.png) | [after/o07-closest-tv-q2-1440x900.png](after/o07-closest-tv-q2-1440x900.png) | Before: “3 of 3 have guessed” though nobody has answered question 2. After: the count for this question. | before |
| O-07 | Who Said That waiting card, 2 of 4 finished | 390×844 | [before/o07-whosaid-waiting-390x844.png](before/o07-whosaid-waiting-390x844.png) | [after/o07-whosaid-waiting-390x844.png](after/o07-whosaid-waiting-390x844.png) | Before: “3 of 4 players have played so far”. After: finished and started counts. | no (driver-checked) |
| S5-AUD-02 | Pattern Pulse, a full entry not yet locked (375×667) | 375×667 | [before/s5aud02-pulse-full-entry-375x667.png](before/s5aud02-pulse-full-entry-375x667.png) | [after/s5aud02-pulse-full-entry-375x667.png](after/s5aud02-pulse-full-entry-375x667.png) | After: time left above the keys; “only counts once locked” line; highlighted Lock. | no (driver-checked) |
| O-06 | Charades on a guesser's phone | 390×844 | [before/o06-charades-phone-390x844.png](before/o06-charades-phone-390x844.png) | [after/o06-charades-phone-390x844.png](after/o06-charades-phone-390x844.png) | Before: no teams. After: Team A/B with members and scores, who is acting for which team, how scoring works. | after |
| O-06 | Charades on the TV | 1440×900 | [before/o06-charades-tv-1440x900.png](before/o06-charades-tv-1440x900.png) | [after/o06-charades-tv-1440x900.png](after/o06-charades-tv-1440x900.png) | After: the acting team, both teams and scores. | no (driver-checked) |
| 3D | Impostor on the TV | 1440×900 | [before/3d-impostor-tv-1440x900.png](before/3d-impostor-tv-1440x900.png) | [after/3d-impostor-tv-1440x900.png](after/3d-impostor-tv-1440x900.png) | Before: “One player has a different word”. After: the impostor sees only the category. | no (driver-checked) |
| 3D | Draw & Guess briefing | 390×844 | [before/3d-draw-briefing-390x844.png](before/3d-draw-briefing-390x844.png) | [after/3d-draw-briefing-390x844.png](after/3d-draw-briefing-390x844.png) | After: up to six turns (random six in bigger rooms), one swap, 12 guesses per drawing. | no (driver-checked) |
| 3D | Home's featured game | 390×844 | [before/3d-home-featured-390x844.png](before/3d-home-featured-390x844.png) | [after/3d-home-featured-390x844.png](after/3d-home-featured-390x844.png) | After: a Practice-only featured game says “practice only” (depends on the day's featured game). | no (driver-checked) |
| 2C | Trivia answer recorded by the server, reply lost | 390×844 | [before/2c-reply-lost-390x844.png](before/2c-reply-lost-390x844.png) | [after/2c-reply-lost-390x844.png](after/2c-reply-lost-390x844.png) | Before: “couldn't confirm” beside the locked answer. After: “That went through after all: the game has it.” | after |
| 3E | Memory Book open while game 2 (Geography) finishes | 390×844 | [before/3e-memory-link-390x844.png](before/3e-memory-link-390x844.png) | [after/3e-memory-link-390x844.png](after/3e-memory-link-390x844.png) | Before: no indication of which game a highlight cites. After: “Linked to Geography Challenge · Day 1”. | after |
| S5-AUD-07 | TV 12 s after the server stops | 1440×900 | [before/s5aud07-tv-outage-1440x900.png](before/s5aud07-tv-outage-1440x900.png) | [after/s5aud07-tv-outage-1440x900.png](after/s5aud07-tv-outage-1440x900.png) | Before: nothing; the stale screen looks live. After: “Connection to the game lost. This screen may be out of date. Reconnecting…”, last screen kept. | before and after |

- Revisions: every before image is from `fa823de`, and every after image is from `4acfea7`. Both are recorded in each folder's `manifest.json`.
- "Inspected by eye" marks the images I opened and checked myself. The others are backed by the drivers named in §9, whose assertions are the evidence.
- **Observation (not fixed, older than this sprint):** in the after image for 2C, the "You" label under the bottom seat of the waiting ring overlaps the line below it. That ring layout predates Stage 5.1.
- The TV's connection banner sits over the top line of the TV, the game title. That is acceptable for an alert, but worth a look on a real TV.

## 9. Regression coverage

### Unit tests

**Current total:** 1,080 in 100 files, against 1,055 at Stage 5.

**New tests:**

| File | What it covers |
|---|---|
| `stage51-liveness` | The watchdog, the fetch timeout, `alive` frames, no-store |
| `stage51-inputs` | `draftKey`, Sprint's own submission |
| `stage51-display` | `fmtPoints`, `sharedPlaces` against `rankStandings` |
| `stage51-ack` | Accepted event ids: own only, rebuilt on restore, bounded |
| `stage51-progress` | Closest/Who Said That counts, the revision guard, the server revision |
| `stage51-copy` | Copy against the real constants |
| `stage51-a11y` | `flagAlt` never names an option; no-id fallbacks |
| `stage51-persistence` | Compact snapshots; old indented files still load |

**Updated:**
- `library.test.ts`: duration filters and sort follow the new estimates.
- `script-inventory.test.ts`: `measure-persistence.mjs` is listed as a tool.

### New drivers

The gate discovers every `check-*.mjs`, so these are all in the full gate:

| Driver | Covers |
|---|---|
| `check-draw-sync` | 4-player draw sync under faults |
| `check-tv-outage` | WS loss, poll failure, full outage, restart, invalid spectator session |
| `check-input-isolation` | Rounds, phases and games across 3 games |
| `check-math-network` | 7 delivery conditions |
| `check-pulse-timing` | 4 phone sizes and Reduced Motion |
| `check-action-ack` | Reply lost and never arrived, in 4 games |
| `check-progress` | Closest TV, Who Said That waiting, Majority rollback |
| `check-history-links` | Library deep link, Memory Book |
| `check-a11y-surfaces` | Flags, groups, no ids; Chromium accessibility tree |

### Updated drivers

Replacements are asserted; none were weakened.
- `check-mchezo`: the waiting ring now checks both counts and both labels.
- `check-f5`, `e2e-browser`, `check-multiplayer`, `screenshot-checkpoint`: follow the new "Now playing: <title>" heading.
- `scripts/lib/answer.mjs`: recognises "You sat out the rest" as a waiting screen.

### Not a check

`scripts/measure-persistence.mjs`, a measurement tool. Its results are below.

### Persistence measurement (Phase 4)

One busy Draw & Guess turn: 120 batches of 40 points at 3 per second, about 40 s.

**Before compact snapshots** (`logs/persistence-BEFORE-optimization.log`):

| Players | Room saves | MB to disk | Room file KB (as compact JSON) | Server CPU % | RSS MB | WS KB per phone |
|---|---|---|---|---|---|---|
| 4 | 159 | 52.9 | 306 (68) | 2.0 | 87 | 7,100 |
| 6 | 185 | 64.5 | 317 (74) | 2.6 | 85 | 8,372 |
| 10 | 237 | 89.3 | 337 (85) | 4.4 | 81 | 10,930 |

**After** (`logs/persistence-after.log`):

| Players | Room saves | MB to disk | Room file KB | Server CPU % | RSS MB | WS KB per phone |
|---|---|---|---|---|---|---|
| 4 | 159 | 13.0 | 69 | 1.8 | 91 | 7,100 |
| 6 | 185 | 16.6 | 74 | 2.3 | 82 | 8,373 |
| 10 | 237 | 24.7 | 85 | 3.9 | 85 | 10,929 |

**Recovery, before and after:**
- A clean restart mid-turn brought back the whole drawing, and the drawer could carry on.
- Five SIGKILLs while saving: each time the room file was complete JSON, it loaded, and every acknowledged batch survived. Once, an unacknowledged batch had also landed, which is expected; the retry dedupe covers it.
- No temp file is ever read as a room.

**Not changed:** each push carries the whole drawing, 7–11 MB per phone per busy turn. Deltas need protocol work (§12).

## 10. Passing gate: revision and run ID

(Filled in after the final full gate: see below.)

## 11. Failed and cancelled attempts

### Expected before-evidence

These failures ran on the code before each fix, on purpose:
- `check-draw-sync`: 1 failure (the silent stall).
- `check-tv-outage`: the TV said nothing. The driver stopped after its first failure, because a follow-up element was missing.
- `check-input-isolation`: Sprint rounds 2 and 3 failed, then the run stopped (timeout).
- `check-action-ack`: 4 failures ("couldn't confirm" stayed beside a confirmed state).
- `check-progress`: 4 failures.
- `check-history-links`:
  - Library: Back went Home, then the run stopped.
  - Memory Book: the part could not run, because the old page had no link line. A separate probe showed the wrong citation.
- `check-a11y-surfaces`: 4 failures (no flag image, no groups).

### Driver mistakes, fixed in the driver (no product change)

- `check-draw-sync`: an unused variable failed lint. Then the sampler crashed when a spectator joined mid-turn, because it had no stats entry for them; it now creates one lazily.
- `check-input-isolation`:
  - At time scale 0.2, round 3 expired before the driver acted (raised to 0.4).
  - The first version expected `mySubmission` before the server sent it. The server view was added, and the check was made stricter.
- `check-math-network`: a route handler ran on a page that had just closed (`TargetClosedError`). It now has a guard and `unrouteAll` before close.
- `check-history-links`: the first Memory Book scenario started game 2 while the page was open. The briefing pulls players to the lobby, which is existing behaviour. The page is now opened while game 2 is being played.
- `measure-persistence`:
  - The first runs sent 30 batches back to back and hit the server's drawing rate limit (16 per 2 s), which is part of the saved room. The batches are now paced.
  - The first table labelled all write syscalls as "saves", which counted network sends too. Saves are now counted from the data directory, and disk bytes from block writes.
- The root typecheck failed twice because a test imported a `.tsx` file (`draftKey`, `TV_HINT`). Both moved to `.ts` modules.
- An edit overwrote `ui/mchezo/lib/names.ts`, which already existed. Typecheck caught it, and the original was restored from git before the new helpers were appended.

### A crash I first misread as load (it was a driver bug)

`check-draw-guess` on `829e1f4`, in a sweep that ran while the full unit suite was also running:
- It crashed with "Target page, context or browser has been closed" after 56 of its checks had passed, none failed, while it read the results screen.
- It passed alone on the same revision, 61 checks, with nothing changed.
- **I put this down to machine load. That was wrong.** The same crash recurred in the final gate on `4236788` with nothing else running. The real cause, the reproduction and the fix are below.

### Gate runs that do not count

- **`626f150`, run `20261109-172002-626f150d-25364`: FAILED, then CANCELLED by me (exit 130).**
  - The unit step failed because `scripts/measure-persistence.mjs` wasn't classified (`tests/script-inventory.test.ts`). Fixed in `9905460`.
  - Before I stopped it, 13 steps had passed: typecheck, lint, build, the browser preflight, and 8 drivers including `check-action-ack`, `check-a11y-surfaces`, `check-audit-fixes` and `check-briefing`. 1 had failed, and 1 (`check-caption`) was cancelled.
  - I stopped it so the final gate could run on the fixed revision without two gates competing for the machine.
- **`4acfea7`, run `20261109-173134-4acfea70-32411`: FAILED (exit 1).** 72 steps passed and 2 failed: `check-f5` and `e2e-chromium`. Nothing timed out or was cancelled, and there were no infrastructure errors.
  - **Cause:** I renamed a button for O-06 and broke two drivers. Charades never finished in either one. Both drivers find the actor's button by its exact name, "Correct (+100 team)". O-06 renamed it to "Correct (+100 to Team A)" or "… Team B", so the actor never tapped it. Every turn ran out its full clock (DIAG: `phase=turn:2`, then `turn:3`, `submitted=0/4`, `type=waiting-on-players`).
  - **Knock-on failures:** every later game in these two drivers failed because Charades was still running.
    - In E2E, Geography, Math, Majority, Pulse and Draw each waited for the host's `choose-game` control, which isn't offered during a game. E2E finished 9 of 15.
    - In `check-f5`, the day playlist finished 8 of 14 games. It then failed the ledger and TV checks for the 6 games that never ran.
    - The 8 games before Charades finished normally in both drivers.
  - **My error:** I made the O-06 change without running the two drivers that tap that button. The only other script that exercises Charades screenshots a guesser's phone.
  - **Fix (`55ba5d8`):** both drivers now match the new exact name, `/^Correct \(\+100 to Team [AB]\)$/`. That is still the actor's Correct button, naming the acting team, so the check is no weaker. There is no product change.
  - **Targeted check, not a verdict:** run `20261109-190220-55ba5d80-12638` ran only `check-f5` and E2E on `55ba5d8`: both passed (815.8 s and 970.3 s), and Charades finished in both.
- **`4236788`, run `20261109-193224-42367885-15460`: FAILED (exit 1).** This was the full gate on the fixed drivers, from a fresh clone with a clean tree. 73 steps passed and 1 failed: `check-draw-guess`. `check-f5`, E2E and every other step passed.
  - **Symptom:** `locator.innerText: Target page, context or browser has been closed` at the results checks, after 56 checks had passed. It was the same crash as on `829e1f4`.
  - **Cause, a driver bug:** the driver stored `keku = pages[0]` at the start. Turn 2 closes the drawer's page and opens a new one in `pages[d]`. The server shuffles the drawing order from a random seed, so Keku (seat 0) draws turn 2 in about one game in four. In those games `keku` pointed at the closed page. The failing run's drawers were 1,0,2,3. Every passing run in the stored logs had someone else drawing turn 2: 3,2,1,0; 2,1,0,3; 3,1,0,2.
  - **Deterministic reproduction:** I made scratch copies of the old and fixed driver that start the game with seed 5, which makes the order player-2, player-1, … The game ran against this run's build, and the drawers were 1,0,3,2 both times.
    - The old driver crashed with the same error after 56 checks.
    - The fixed driver passed all 61 checks.
    - These copies are not committed: they start the game through the API instead of the lobby button.
  - **Fix (`f363811`):** `keku` is now looked up as `pages[0]` at each use. No check changed. No other driver replaces a page in a slot it took an alias of.
  - **Not an app bug:** the app behaved correctly in both runs. The rejoined phone shows the results.
- **`f363811`, run `20261109-210933-f3638114-28586`: INTERRUPTED (no verdict).** The container restarted while E2E, the last step, was running. The gate received SIGTERM and stopped its own processes, but the container was gone before it could write `report.json`. Its log shows 73 of 74 steps passed, including `check-draw-guess`. That is not a pass, and I don't count it.
- **`2508f9d` (code identical to `f363811`, plus docs), run `20261109-223449-2508f9d4-198`: FAILED at the unit tests, then CANCELLED by me (exit 130).**
  - **Failure:** `tests/stage51-inputs.test.ts`, "Category Sprint: your own answers, from the server". The test is mine, from Stage 5.1. It sent the answers "school" and "desk", then checked that the TV projection doesn't contain "school". This time the randomly dealt category was "Things in a school", so the check failed on the category name, not on a leak. The test depended on which category was dealt, and every earlier run was lucky.
  - **Fix:** the test now sends marker answers that no category or projection text can contain. It checks the same TV privacy, and it now also checks that another player's own projection doesn't contain them. It passed 15 times in a row across randomly dealt categories.
  - **Why I cancelled:** I stopped the run after it had passed 8 steps, at `check-action-ack`. The verdict was already FAILED, and the fix needed a new revision with a full gate of its own. The cancellation left no Chromium or server processes.

### Typo

My sweep listed `check-charades-none`, a driver that doesn't exist (exit 1, 0 s). This was not a product failure.

## 12. Remaining owner decisions

1. **S3-MTH-01 residual** (about 2 s when only polling delivers). Options:
   - (a) Accept it.
   - (b) Widen the thresholds slightly (e.g. +20 up to 6 s), which changes scoring for everyone.
   - (c) Time from the phone's own report that the question is on screen. That needs safeguards, because a phone could delay it.

   Nothing has been changed.
2. **Pattern Pulse** at expiry, for a complete entry that wasn't locked. Options:
   - (a) Lock it automatically (my recommendation).
   - (b) Add a short grace period.
   - (c) Keep it as now: missed, 0 points.

   The measurements (§1, `logs/pulse-timing-after.log`) show the window itself is ample.
3. **Charades:** may the other team guess? Nothing records who guessed; Correct credits the actor's team. The display now says the actor's own team guesses, matching the scoring.
4. **Session estimates still above their hard limits:**

   | Game | Estimate (min) | Hard limit (min) |
   |---|---|---|
   | Impostor | 10 | 5 |
   | Trivia | 10 | 6 |
   | Who Said That | 10 | 6 |
   | Guess the Year | 8 | 6 |

   Sprint and Geography were corrected (§3). The details sheet calls these "design estimates of a session".
5. **Draw & Guess network cost:** the whole drawing goes with every push (7–11 MB per phone per busy turn). Fine on a home LAN; worth a delta protocol before any hosted use.
6. **Legacy flag questions** `geo-legacy-1` and `geo-legacy-2`: their screen-reader description comes from the explanation's first half. The content owner may want a proper description. No content was approved.
7. **Still open from Stage 5 §13:**
   - Cup eligibility and scoring for the three Stage 5 games, which remain Practice-only.
   - Majority Rules' tie policy.
   - Pattern Pulse's and Draw & Guess's parameters.
   - Bluff Battle.

## 13. Real-device acceptance checklist (Stage 5.1 additions)

`docs/REAL_DEVICE_TESTING.md` now checks out this branch. Real-device testing is **not done**.

Test on an iPhone in Safari, an Android phone in Chrome, and a TV browser:

1. **Draw & Guess**, 4 phones:
   - Every guesser sees the drawing live.
   - Turn one phone's Wi-Fi off for 15 s: within about 10 s it should say it can't reach the game, then catch up when the Wi-Fi is back.
2. **TV:** stop the server. Within about 10 s the TV should say "Connection to the game lost…"; restart it, and the TV should say "Reconnected".
3. **Category Sprint:**
   - Type answers but don't send them; when the round changes, the box should be empty.
   - Impostor's guess box should never show your clue.
4. **Pattern Pulse** at your phone's real size: are the time left, the keys and "Lock it in" all visible together? Does the "only counts once locked" line show?
5. **Airplane mode:** turn it on right after tapping an answer, then off. Within a few seconds you should see either the confirmed answer with "That went through after all", or a clear "couldn't confirm" you can retry.
6. **Library:** open the room's Library from a shared link in a new tab, then tap Back to lobby. You should land in the lobby, not on Home.
7. **Memory Book:** keep it open while a game finishes. The "Linked to" line should update before you add.
8. **VoiceOver (iPhone) and TalkBack (Android):**
   - A Geography flag question should read the description, not the country.
   - Who Said That's questions should read as groups.
9. **Closest Wins on the TV:** the count should reset to 0 for each new question.
