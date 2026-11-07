# Mchezo redesign: priorities, staged plan, migration and QA

## 1. Priorities: confirmed defects first, then improvements

### Fix first (confirmed defects)

| Order | ID | What | Class |
|---|---|---|---|
| 1 | F1 | A one-player official game shows as counting, never scores, and uses up official content | **R**, decision D1. A failing test is written first either way. |
| 2 | F3 | Official and Practice look identical when selected | P |
| 3 | F2 | The share button does nothing | P |
| 4 | F5 | Advance day: one tap, can't be undone | P (add a confirmation) |
| 5 | V1, V2 | Title overlap; green document background and missing theme-color | P |
| 6 | F4 | Back leaves the app | P |
| 7 | F6 | The intro takes time from phased games | P interim; **R** target (decision D3) |
| 8 | F7, F8, F10 | Sound does nothing; landing ignores the motion setting; private preview link not labelled | P |
| 9 | V5, F9, V3 | Long Connections words; TV stage on phones; legacy green screens | P |

### Then improvements (proposed, not defects)

| ID | What |
|---|---|
| U1–U4 | Lobby rebuild with sheets |
| U9, M2 | Home and discovery, game details |
| U6, M4 | Results personality |
| U7 | Championship |
| — | TV presentation |
| M3 | Solo practice (**R**, decision D2) |
| M6 | iOS app identity |

## 2. Staged plan

Each stage is one branch, gated and reviewable on its own, with no merge without your approval. Each stage's acceptance criteria include the stage-specific tests below plus a green `node scripts/gate.mjs full` on its final commit.

### Stage 0: test hooks first (about half a day; no visible change)
- **Why first:** 41 browser drivers locate elements by visible text, so the copy in stages 1–5 would otherwise break the gate.
- Add `data-testid`s to:
  - every control a driver finds by text (Host a game, Join the game, the name field, the share code button, Championship, TV, Back to lobby, Next question);
  - the five or six navigation chips.
- Move the drivers to a shared selector module (`scripts/lib/ui.mjs`).
- **Acceptance:** the full gate passes with *no* UI change; a grep shows no driver still selects these controls by text.

### Stage 1: safe defect fixes (about 1–2 days; presentation only)
- **F3:** Official/Practice becomes a `SegmentedChoice` with a filled selected state, ✓ and a one-line explanation per mode.
- **F2, F10:** the Invite sheet with `navigator.share`, a clipboard fallback, a toast, and the private-preview notice.
- **F5:** a confirmation dialog for Advance day.
- **V1, V2, V7, M6:**
  - document background set to `ground`, `theme-color`, the title "Mchezo";
  - `viewport-fit=cover`;
  - the fixed-height screen fixed (the document scrolls; children stop shrinking).
- **F7, F8:** Sound shows "Coming soon" until audio exists; the motion setting applies on the landing page.
- **V5:** Connections tiles fit their text, with three columns below 340 px.
- **Acceptance:**
  - the measurements in `evidence/measurements.json` re-run clean (no overlap; the selected mode differs in background *and* has ✓; share opens the sheet; `theme-color` is set; the body is `ground`);
  - all 201 Connections words fit at 320 px;
  - `check-mobile`, `check-viewports` and `check-contrast` pass;
  - the full gate passes.
- **Regression risk:** low. The scroll-container change (A3) touches every kit screen, so `check-mobile` and `check-viewports` and screenshots of every phone screen are compared.

### Stage 2: shell, navigation and interim intro (about 3–4 days; presentation only)
- **Shell:** AppBar, Dock, Sheet, Dialog, Toast. `App.tsx` splits into route components behind a small history hook (§2 of PROPOSAL). Game-branch logic moves unchanged into a `GameScreen` switch.
- **F4:** Back closes sheets, then returns to the lobby, then Home with Rejoin. The seat, scores and WebSocket are untouched.
- **F6, interim:**
  - Self-paced games stop auto-starting. The rules wait for "Start playing", and the screen shows the game clock honestly ("Your 6 minutes are running").
  - Phased games show the *real* first-phase countdown on the rules card, and "Start" jumps in.
- **Acceptance:**
  - new navigation tests (PROPOSAL §2);
  - existing reconnect and recovery drivers (`check-ws-reconnect`, `check-recovery`, `check-sessions`, `check-restart`) pass unchanged;
  - no projection or intent payload changes (checked by diffing request logs from one driver run before and after).
- **Regression risk:** medium. This is the screen-selection order. Mitigation: a table-driven test of "projection state → screen" written *before* the split.

### Stage 3: Home, game details, lobby and the cover system (about 4–5 days; presentation only)
- `GameCover` (procedural, 11 games, snapshot tests), `GameCard`, Home (option B), Game details, Join, Lobby (option A), the Choose-game sheet, the Room menu.
- Studio moves under "Labs"; Reconnect is removed from the lobby (it is automatic, and still in the connection banner).
- **Acceptance:**
  - On 390×664 and 375×553, the host lobby shows players, the up-next game, the mode and Start **without scrolling**.
  - The QR deep link goes straight to Join with the code confirmed.
  - Guests never see host controls.
  - Readiness and "start without them?" behave as today (`check-readiness`).

### Stage 4: Results, Championship, TV and the legacy retirement (about 4–6 days; presentation only)
- Results with breakdown, Cup movement, superlatives and the quip bank (copy reviewed like content). Celebration only if D5 is approved.
- Championship rebuilt (PROPOSAL §6.9), with Cup admin moved to Host tools and the audit trail kept.
- A responsive TV stage. A generic "Now playing" stage for games without their own. The legacy TV Dashboard and spectator dashboard replaced.
- **Legacy retired:** the `.wrap` shell, `index.css` (except what moves to tokens), `GamePanel` (after Impostor, Who Said That?, Category Sprint and Charades get kit panels), `ShowIntro`, `ShowResults`, `SettingsBar`, and `MemoryBookView` restyled.
- **Acceptance:**
  - **Secrecy:** the TV and spectator leak checks pass (`check-tv-spectator`, `check-spectator`, `check-tv-lifecycle`, `check-multiplayer` TV projection checks), plus a new check that no quip or superlative uses data before its reveal.
  - **Standings:** values identical to the server's `officialStandings` and `championship` projection (`check-leaderboard`).
- **Regression risk:** medium-high in volume (four game UIs). Each game migrates separately behind its own driver.

### Stage 5: the rule changes, only once you approve them (each about 1 day)

| Decision | Change |
|---|---|
| D1 | Refuse official one-player starts, or count them as practice |
| D2 | `practiceMinPlayers` for Trivia, Math, Year, Geography; the Play solo shelf; the content-pool rule for solo |
| D3 | A server "briefing" phase: deadlines start when everyone is ready, or after a 20 s limit. Projection, TV and all phased games updated. The lifecycle and fairness tests extended. |

Each change starts with a failing test, and any finished game keeps its recorded outcome.

## 3. Reuse versus retire

| Reuse (kit) | Rework | Retire |
|---|---|---|
| Tokens, `MchezoProvider`, `Keycap`, `Wordmark`/`CircleMark`, `PlayerToken`, `CircleLobby`, `AnswerGrid`, `RingTimer`, `Stamp`, `StandingsList`, `ResultCard`, `ConnectionBanner`, `CodeInput`, `NumericGuess`, `Waiting`, all game panels' logic, `RecoverScreen`/recovery cards, `ReadinessCard` logic, `MchezoLibrary` filters (`lib/library.ts`), `humanError` | `LobbyScreen` (into the shell), `LandingScreen` (becomes Home and Join), `GameIntro` and Trivia intro (one `RulesReady`), `MchezoTvStage` (fixed 1920 px to fluid), `ChampionshipProgress` (DayRail), `OutcomeSummary` (folded into results), `GameClock` (into the AppBar timer chip) | `App.tsx` legacy shell (`:1014-1049`), `index.css` global element styles, `GamePanel.tsx`, `ShowMode.tsx`, `SettingsBar.tsx`, `ChampionshipView.tsx`, legacy spectator dashboard (`App.tsx:559-575`), Christmas theme as the default skin (it stays available as a seasonal theme) |

## 4. Tests that will need updating

| Area | Tests |
|---|---|
| Moved to `data-testid` in stage 0 | The 41 drivers that use "Host a game", "Join the game", the "e.g. Auntie June" placeholder and "Share room code"; 21 that use "Back to lobby"; 11 that use "Championship", "TV Dashboard" and "Memory Book"; 9 that use "Reconnect" |
| Behaviour changes | The intro auto-start (`show-start-playing` stays; drivers that wait 8 s for auto-advance must tap instead); `check-reveal` / `check-tv-entry` (TV entry moves to the menu); `check-mobile` / `check-viewports` (new layouts, same 44 px and no-overflow rules); `check-contrast` (new tokens) |
| Unit tests | `tests/readiness.test.ts:143-148` changes only if D2 is approved |

## 5. Real-device QA matrix (each stage, before you review it)

**Devices:**
- iPhone with Safari: iOS 17 or 18, and one iOS 16.x if available.
- Android with Chrome.
- An iPhone SE-class small screen.
- A TV or laptop browser.

| Check | How | Pass if |
|---|---|---|
| Small phones and dynamic text | 375×667; 320×568 Android; iOS Text Size at the largest; Android font scale 1.3 | No clipped or overlapping text; primary button visible without scrolling on Lobby, Join, Rules, Results |
| Safe areas and toolbars | Scroll so the Safari toolbars collapse and expand; landscape; home-indicator devices | The dock never hides behind the toolbar or home bar; the background colour matches through overscroll |
| Long names | "Amina-Josephine Wanjiku" (24 characters); the longest game title "Geography Challenge"; the longest Connections words | Ellipsis in rows, wrap in headlines, no overflow |
| 1, 4 and 10 players | Solo host; 4 phones; 10 seats (tabs on two devices) | The Circle stays readable at 10; readiness correct; Start rules honoured |
| QR and sharing | Camera QR on iOS and Android; Share sheet; Copy on an HTTP LAN address (clipboard needs HTTPS → expect the fallback text) | Lands on Join with the code; the toast confirms; the private-preview notice on Codespaces |
| Official/Practice visibility | Toggle both ways; check in bright light | Selected is obvious without reading |
| Back and reconnect | Back and swipe-back from every screen; lock 2 min; airplane mode 20 s; reload mid-game | Never a duplicate seat; scores intact; returns to the game |
| Intro timing | Phased game with one slow reader | Matches the D3 outcome; nobody loses answer time |
| Secrecy | Compare phones and TV during questions, Impostor and Caption | No answer, prompt or role before its reveal |
| Scores and standings | Phone totals vs results vs Championship after 3 games and a day advance | Identical; the audit trail shows corrections |
| Reduced motion | iOS Reduce Motion on; in-app Less and Off | Fades only; no confetti; nothing waits on animation |

Results go in `docs/device-testing/RESULTS_TEMPLATE.md`, which already exists.

## 6. What changes rules (needs you) versus presentation (safe)

**Presentation only:** everything in stages 0–4, including navigation, layouts, copy, cover art, quips, celebration (subject to D5), and moving admin controls. None of it changes:
- a projection;
- an intent;
- a deadline;
- a score;
- eligibility;
- content selection.

**Needs your approval (stage 5):**
- D1, the one-player official rule;
- D2, solo practice eligibility and the content-pool rule;
- D3, server-timed rules and ready;
- any future solo scoring rule for Closest Wins.
