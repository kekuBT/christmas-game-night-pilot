# Mchezo product and frontend audit (2026-11-07)

**Scope:** the web client at `fa1514b` (branch `claude/codespaces-preview`), read in full where it owns a journey, plus the server code that decides what the client shows.

**Evidence:** every finding cites code. Visual findings were reproduced in Chromium emulating phone sizes (`evidence/`, reproducible with `evidence/capture.mjs` and `evidence/sizes.mjs`; numbers in `evidence/measurements.json`), then compared with your iPhone report.

**What this audit is not:** WebKit on a real iPhone was not available here. Anything only seen on your phone is marked *device-reported*.

**Severity scale:**

| Severity | Meaning |
|---|---|
| **S1** | Score integrity, privacy, or loss of a seat or data |
| **S2** | Breaks or misleads a core journey |
| **S3** | Confusing or broken, but there is a workaround |
| **S4** | Cosmetic |

**Type:**

| Type | Meaning |
|---|---|
| **Defect** | A confirmed functional defect |
| **Visual** | A visual or layout bug |
| **UX** | A confusing decision |
| **Missing** | Missing functionality |
| **Preference** | A product-design preference, not a bug |
| **Arch** | An architecture limitation |

**Fix class:**
- **P:** presentation only, safe to change.
- **R:** changes a game rule, timing, eligibility or server behaviour. Needs your approval.

## 1. Who owns each journey

The client is one React component, `App`, in `apps/web/src/App.tsx` (1,050 lines). It picks a screen with a `view` state and about 25 `if` branches, in this order:
1. recover screen;
2. landing;
3. spectator-only;
4. kit lobby;
5. per-game intro, play and results branches;
6. library;
7. studio;
8. TV;
9. finally a **legacy "Christmas Game Night" shell** (`App.tsx:1014-1049`) that renders everything not yet migrated.

There is no router and no browser history.

| # | Journey | Owner (code) | Design system in use |
|---|---|---|---|
| 1 | First visit, returning player, QR deep link | `LandingScreen` (`ui/mchezo/components/phone/screens.tsx:54`); `WelcomeBack`/`RememberChoice` (`components/mchezo/DeviceSeat.tsx`); `?code=` read at `App.tsx:172-176` | Kit (purple) |
| 2 | Game discovery and details | `MchezoLibrary` (`components/mchezo/MchezoLibrary.tsx`), reachable **only from inside a room** (`App.tsx:717,964`). No details screen. Data: `src/games/manifest.ts` | Kit |
| 3 | Hosting a room | `createRoom` (`App.tsx:291`, room name hard-coded "Christmas Game Night"); `LobbyScreen` (`screens.tsx:133`) plus the `lobbyExtra` slot (`App.tsx:650-724`) | Kit, with a legacy settings card |
| 4 | Joining by QR or code | QR from `location.origin` (`App.tsx:468-472`); invite card (`App.tsx:695-701`); `joinRoom` (`App.tsx:298`) | Kit |
| 5 | Selecting and configuring games | "Game setup" card (`App.tsx:661-684`); `upNextId`/`gameMode` state (`App.tsx:104,107`); Smart Shuffle (`App.tsx:627`); `startGame` (`App.tsx:375`) | Kit chips |
| 6 | Player readiness | `ReadinessCard` (`components/mchezo/ReadinessCard.tsx`); server `readiness` in the projection | Kit |
| 7 | Rules and gameplay | Phase: `deriveShowPhase` (`components/showPhase.ts`). Intros: `MchezoTriviaIntro` (`MchezoTrivia.tsx:45`), `GameIntro` (`ui/mchezo/components/GameKit.tsx:26`), legacy `ShowIntro` (`components/ShowMode.tsx:12`). Play: kit panels for Trivia, Connections, Caption, Closest, Year, Geography and Math (`App.tsx:769-943`); **legacy `GamePanel`** for Impostor, Who Said That?, Category Sprint and Charades (`App.tsx:1032-1033`) | Mixed |
| 8 | Results | Kit: Trivia, Connections, Caption. **Legacy `ShowResults`** (`App.tsx:1031`) for the other eight. `OutcomeSummary` (`ui/mchezo/components/Lifecycle.tsx`) | Mixed |
| 9 | Championship and standings | `ChampionshipView` (`components/ChampionshipView.tsx`), shown inside the legacy shell (`App.tsx:1034`) | **Legacy green** |
| 10 | TV and spectator | `MchezoTvStage` (Trivia only), `connectionsTvScreen` (Connections and Caption, `App.tsx:451`); **legacy "TV Dashboard"** for everything else (`App.tsx:559-575, 1036-1046`) | Mixed |
| 11 | Settings, recovery, admin | `SettingsBar` (legacy `.card`, `components/SettingsBar.tsx`); `ThisDeviceCard`, `RecoveryCodeSection`, `RecoverScreen`, `RecoveryRequestsCard` (`DeviceSeat.tsx`, `Recovery.tsx`); cohost card (`App.tsx:702`); score override (`ChampionshipView.tsx:62-69`); Studio; Memory Book (legacy) | Mixed |
| 12 | Back, refresh, reconnect | Refresh restores the seat from `session.ts`. WebSocket reconnect on visibility, online and pageshow (`App.tsx:177-276`) is solid. **Back:** no `history` use anywhere (verified: `history.length` unchanged after in-app navigation) | n/a |

**What already works well (keep it):**
- The server-authoritative design.
- Per-player projections and the tested secrecy rules.
- Seat recovery and remember-device.
- Reconnect handling.
- The Trivia reveal flow.
- The Word Connections mechanics.
- The kit's keycap buttons and answer slabs, the Circle concept and the wordmark.

## 2. Findings

### 2a. Confirmed functional defects

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| F1 | S1 | **A one-player official game says it counts toward the Cup but never scores, and it uses up official content.** Word Connections allows one player (`registry.ts:18`). The game finishes with `countsOfficially: true` (`room.ts:1359`), and results say "Counts toward the Family Cup" (`ui/mchezo/lib/lifecycle.ts:82`). Standings and day qualification skip games with fewer than 2 scores (`room.ts:1454-1455, 1530-1531`; `championship.ts:51`). Its board is recorded as used in the Cup's official pool (`room.ts:612`), so it can't be played officially again. The Championship screen contradicts itself: it lists the game as official, then "not counted (fewer than 2 players)" (`ChampionshipView.tsx:26,53`). | Code, cross-checked independently | **R**: per AGENTS.md, a failing test first. You decide the rule (D1) |
| F2 | S2 | **The share button beside the room code has no click handler.** | `screens.tsx:144`: a `<button>` with an aria-label and no `onClick`. Measured: clicking changes nothing (`measurements.json` → `shareClick`) | P |
| F3 | S2 | **Official and Practice look identical when selected.** The buttons set `aria-pressed`, but `.mz-chip-btn` has no pressed style (the only `aria-pressed` CSS is for Connections tiles and Caption cards, `games.css:53,91`). Both measure `rgb(33,26,43)` with the same border. A host can start an official game believing it is practice. That consumes official content and changes standings. | `App.tsx:667-668`; `mchezo.css:47`; `evidence/mode-practice-selected.jpg` | P |
| F4 | S2 | **The browser Back button leaves the app.** All navigation is `setView` state (`App.tsx:82`); no `pushState`/`popstate`. On iOS, swipe-back and the Back button go to the previous site, or do nothing for a QR-opened tab. Nothing is lost, because the seat survives in `sessionStorage`, but players think they've been thrown out. | `App.tsx:82, 714-718`; `history.length` measured unchanged | P |
| F5 | S2 | **"Advance to next day" is a one-tap, one-way action with no confirmation**, placed inline in a sentence. The server cannot undo it (`room.ts:1471-1478`: day += 1, no reverse). | `ChampionshipView.tsx:48` | P (add a confirmation) |
| F6 | S2 | **The rules intro auto-starts after 8 s and takes time from phased games.** The server starts every deadline when the host taps Start (`room.ts:594, 631, 660`); the intro is a client-only overlay (`GameKit.tsx:26`, `MchezoTrivia.tsx:45`, `ShowMode.tsx:15`). In phased games the first phase is already running. Closest Wins question 1 (40 s, `lifecycle.ts:51`), the Category Sprint first round (60 s) and the Caption Clash write phase (90 s) all lose up to 8 s. A player who taps "Start playing" at once gets more time than one who reads. Self-paced games lose only a little of a 4–8 minute window. Math's speed bonus is unaffected: it is timed from when each question opens (`room.ts:1605-1613`). | Code | Interim: P. Proper fix: **R** (D3) |
| F7 | S3 | **The Sound setting controls nothing.** No audio code exists (`grep`: no `Audio`/`AudioContext`; `settings.sound` is only passed to the settings bar). | `SettingsBar.tsx:6`; `App.tsx:721` | P |
| F8 | S3 | **The landing page ignores the in-app Animations setting.** Its `MchezoProvider` gets no `reducedMotion` prop (`App.tsx:496`), so only the OS setting applies there. The OS reduced-motion floor works everywhere (`lib/motion.ts`). | `App.tsx:496` vs `728` | P |
| F9 | S3 | **The TV stage opened on a phone is unusable.** It is a fixed 1920×1080 stage scaled down: the controls are cut off ("Leaderb…"), most of the screen is empty, and the green page background shows underneath. | `mchezo.css:257-258`; `evidence/tv-stage-on-phone.jpg` | P |
| F10 | S3 | **The QR code and code invite a private Codespaces address without saying so.** Others scanning it reach a GitHub sign-in wall. | `App.tsx:470, 698` (warns only for `localhost`) | P |
| F11 | S3 | **Solo practice isn't possible** for Trivia, Math, Guess the Year and Geography. One shared `minPlayers` is enforced for official and practice alike (`room.ts:588`). | `registry.ts:17-25` | **R** (D2) |

### 2b. Visual and layout bugs

| ID | Sev | Finding | Root cause and evidence | Fix |
|---|---|---|---|---|
| V1 | S3 | **The lobby title overlaps the Cup/day badge**, at every phone size tested (390×664, 393×659, 375×553, 412×780, 360×640). | `.mz-screen` is a flex column with a fixed `height: 100dvh` and its own scroller (`mchezo.css:20`). The lobby is 2,250 px tall, so flex children **shrink**, and the wrapped top bar (`.mz-topbar { flex-wrap: wrap; min-height: 44px }`, `:32`) collapses under the title. `evidence/lobby-iphone-safari-390x664.jpg` | P |
| V2 | S3 | **The old green shows through everywhere.** Specifically: Safari's toolbar tint, the overscroll area, a green band at the top of game and results screens, and the space below the TV stage. | The document background is still the Christmas green (`index.css:2`, `body { background: #102C25 }`). There is no `<meta name="theme-color">`, and the title is "Christmas Game Night" (`index.html`). Margins on `GameClock`/`OutcomeSummary` collapse through the purple surface and expose the body. `evidence/trivia-results.jpg`, `evidence/connections-375.jpg` (top edge) | P |
| V3 | S3 | **Legacy green screens:** Championship, TV Dashboard, Memory Book, the spectator dashboard, intros and results for 8 of 11 games, and gameplay for 4 games. | The `.wrap` shell and `index.css` (`App.tsx:1014-1049`). `index.css` also styles *every* `button`, `input` and `select` globally, which leaks gold buttons into kit screens. `evidence/championship-legacy.jpg`, `evidence/tv-dashboard-legacy.jpg` | P |
| V4 | S4 | **The Settings card is green inside the purple lobby**, with a native `<select>`. | `SettingsBar.tsx:22` uses the legacy `.card` (measured `rgb(36,83,68)`). `evidence/settings-legacy-card.jpg` | P |
| V5 | S3 | **Word Connections: long words fill the tile edge to edge at 375 px and overflow at 320 px.** PORRIDGE, DIAMONDS and PANCAKES touch the edges; AMETHYST and WARDROBE overflow at 320 px. | Four fixed columns, 4 px side padding, 800-weight uppercase (`games.css:40-51`). Measured over all 201 words in the packs. `evidence/connections-375.jpg`, `connections-320.jpg` | P |
| V6 | S4 | *Device-reported:* **your token overlaps the "Up next" disc.** | Not reproduced in Chromium at five sizes; WebKit text metrics or a longer game name may push it over. The geometry is fragile: the token's minimum is 42 px against a ring-to-disc gap of 15% of the circle (`mchezo.css:117,126`). | P |
| V7 | S4 | **Safe-area code never applies.** `env(safe-area-inset-*)` is used, but the viewport meta lacks `viewport-fit=cover`, so the insets are 0. Harmless in portrait today, but it blocks an edge-to-edge design and leaves landscape unhandled. | `index.html`; `mchezo.css:21,358,420` | P |
| V8 | S4 | **The Trivia results reveal briefly overlaps option labels during its slide animation** (seen in a capture mid-transition). Not confirmed as a resting-state bug. | `evidence/trivia-results.jpg` | Verify on device |

### 2c. Confusing UX decisions

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| U1 | S2 | **The host lobby is 2,250 px long, and Start is 3.2 screens down** on an iPhone in Safari (3.9 on an SE). It packs 14 cards and controls into one column, in this order: reactions, game setup, device, QR, cohost, six navigation chips, settings, and only then Start. | `sizes.mjs`: Start button top at 2,146 px of a 664 px viewport; `evidence/lobby-full-length.jpg` |
| U2 | S2 | **The game picker is a list of identical text buttons**, with no art or hierarchy. The selected game appears only as small text inside the Circle. | `App.tsx:674-682` |
| U3 | S3 | **The two modes are explained in a run-on sentence**, mixed with the time limit. | `App.tsx:664` |
| U4 | S3 | **Four overlapping TV concepts:** "TV stage", "TV Dashboard", the "Big screen" toggle (which only switches view) and "Watch as spectator". | `App.tsx:715, 742, 1020`; `screens.tsx:89` |
| U5 | S3 | **Developer and documentation voice in player copy.** Examples: "manual-code fallback", "owner-approved 2026-11-04", "Generic pack only in local builds", "Six modes, provisional", "Reconnect", "Studio (preview)". | `App.tsx:697, 718-719`; `ChampionshipView.tsx:46`; `manifest.ts:156,256` |
| U6 | S3 | **Results state facts but don't celebrate.** The first card says "Everyone finished. You: Answered 10 of 10…". There is no headline winner, no score breakdown for most games and no standings movement outside Trivia. | `Lifecycle.tsx:57-76`; `ShowMode.tsx` |
| U7 | S3 | **The Championship screen is a 2,800 px wall of rules text** ahead of the standings. Host corrections sit in the same scroll. | `ChampionshipView.tsx:44-70` |
| U8 | S3 | **An 8-second auto-advancing intro is too fast** for older players, and its countdown pressures everyone. | `GameKit.tsx:26` |
| U9 | S4 | **The home page is a join form;** discovery only exists inside a room. | `screens.tsx:54-97` |
| U10 | S4 | **"Sit this game out" is a full-width button in a solo game,** competing with gameplay controls. | `evidence/connections-375.jpg` |

### 2d. Missing functionality

| ID | Missing | Notes |
|---|---|---|
| M1 | Native share and copy for the invite | `navigator.share`, falling back to the clipboard, with a toast (F2) |
| M2 | A game details screen, and discovery before joining | Manifests already hold descriptions, player counts and categories |
| M3 | Solo practice beyond Word Connections | Server rule (D2) |
| M4 | A personality layer: witty lines, superlatives, celebrations | New copy and presentation only |
| M5 | Confirmation for one-way host actions | Advance day, score correction, make cohost |
| M6 | App identity on iOS | `theme-color`, title "Mchezo", web app manifest and icon for Add to Home Screen. Free; no service worker needed |
| M7 | An explicit "Leave room" | Today it is "Forget this device" inside the device card |

### 2e. Product-design preferences

These are not bugs:
- The home page should be discovery-first.
- Each game should have cover art.
- The tone should be funnier.
- The TV should be an actual show.

All of them are addressed in the proposal. None of them was wrong under the brief the old screens were built to.

### 2f. Architecture limitations

| ID | Limitation | Consequence |
|---|---|---|
| A1 | One 1,050-line `App` with screen selection by `view` state and `if` order | Navigation, Back and deep links can't be added cleanly; each game repeats a block |
| A2 | Two style systems loaded together. `index.css` styles bare elements globally and sets the green body; the kit is scoped to `.mz-root` | Legacy styles leak into kit screens (V2, V4); half-migrated screens |
| A3 | Kit screens are fixed-height inner scrollers (`.mz-screen { height: 100dvh; overflow-y: auto }`) | Flex children shrink (V1); Safari's toolbars never collapse; `position: sticky` docks are awkward |
| A4 | The TV stage is laid out in absolute 1920×1080 pixels | Can't adapt to a phone or a small laptop (F9) |
| A5 | No shared game shell (header, timer, progress, action dock) | Every game invents its own top area and buttons |
| A6 | Show phases (intro, results dismissal) are per tab in `sessionStorage` | Fine for presentation, but rules time can't be synchronised without a server phase (F6) |
| A7 | 41 browser drivers find elements by visible text ("Host a game", "Join the game", the placeholder "e.g. Auntie June", "Share room code") | Any copy change breaks most of the gate unless selectors move to `data-testid` first |

## 3. Your iPhone findings, checked

| Your observation | Verdict |
|---|---|
| Room title overlaps the Cup/day information | **Confirmed** (V1), with the root cause found |
| Player token overlaps the up-next name | **Not reproduced in Chromium**; plausible on WebKit (V6) |
| Share icon does nothing | **Confirmed**: no handler (F2) |
| Host screen extremely long | **Confirmed**: 2,250 px, Start 3.2 screens down (U1) |
| Game list looks like generic buttons | **Confirmed** (U2) |
| Official and Practice look identical | **Confirmed**: identical computed styles (F3) |
| No concise mode explanation | **Confirmed** (U3) |
| Too many competing tools | **Confirmed** (U1) |
| No consistent Back | **Confirmed**: no history integration (F4) |
| Championship and TV in the old green | **Confirmed**, plus the green body background (V2, V3) |
| Long Connections words crowd tiles | **Confirmed**: tight at 375 px, overflowing at 320 px (V5) |
| Shuffle, Deselect and Submit hierarchy | **Confirmed**: three same-height keycaps; when 0–3 tiles are picked, the primary reads "Pick 4 more" and looks disabled |
| Score not explained; flat results | **Confirmed** (U6) |
| Intro auto-advances too fast | **Confirmed**, and it is a fairness problem in phased games (F6) |
| Animation Full, sound Off by default | **Confirmed.** Also: sound does nothing (F7), and the landing page ignores the in-app motion setting (F8) |
| One-player Word Connections presented as counting | **Confirmed**, and worse: it uses up official content (F1) |

**Do animations work on iPhone Safari?** The kit uses plain CSS keyframes and transitions, plus container queries (`cqi`/`cqh`, Safari 16+), `color-mix` (Safari 16.2+) and `100dvh` (Safari 15.4+). So the practical floor is **iOS 16.2**. Older iPhones would mis-lay the Circle. One more thing to check on your phone: if *Settings → Accessibility → Motion → Reduce Motion* is on, the kit correctly drops to reduced motion. That can look like "no animation".
