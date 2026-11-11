# Stage 8.1: mobile usability and solo presentation

**Status:** built and tested (§7); repaired after review 6793171907 (§7.5); gates in §7.3. **Do not merge.** Merge and deployment decisions belong to the owner.

- **Instruction:** ChatGPT's review and handoff on PR #11 (comment 6790743334), under the owner's standing authorization (`docs/DECISIONS.md` D-WF-01). It cleared Stage 7.4 (tested `ecb617c`, head `58196cb`) and set this bounded milestone.
- **Branch:** `claude/stage8-1-mobile-solo`, from `58196cb938e6d859d2e20895f71ba2eefde05f0c`, stacked on PR #11 (`claude/stage7-4-content-variety`). PRs #4–#11 stay unmerged.
- **Scope:** layout polish and clock clarity on the everyday journey. No new visual identity (typography, palette and logo stay), no new gameplay, no change to how starts, retries, lineups, host permissions or the TV work.

## 1. What I found on `58196cb` (before)

Measured with a probe in Chromium headless (Playwright) at 320×640, 390×844, 844×390 (a phone in landscape) and 1440×900. Emulation only; no real devices.

| # | Where | Found |
|---|---|---|
| F1 | Solo shelf | Each card is 421–481 px tall, mostly artwork. At 320×640 only Math Mayhem is on the first screen; the shelf is 1,609 px tall. On desktop it is one 440 px column, 1,623 px tall, with one game above the fold. (Also noted by ChatGPT's audit 6773609572; `docs/MILESTONES.md`.) |
| F2 | Pattern Pulse, between patterns | The ready screen says "the game's own clock keeps running" but shows no time. In a solo round no overall game time is shown anywhere. In a room, App's `GameClock` line sits above the game. |
| F3 | Every solo round (pre-existing defect) | The solo app never records the server's clock (`noteServerTime` is called only by room screens). So solo countdowns — Pulse's "Hides in", "Ns to answer" and when its keys lock, Math's timer — run on the phone's own clock. A phone whose clock is off by 30 s shows the wrong time, and one that is ahead locks the keys early. The server still enforces every deadline, so scores are never wrong, but the screen can be. |
| F4 | Phone in landscape (844×390) | Pattern Pulse's tap-back screen: the second row of shapes and **Lock it in** are below the fold during a timed answer (514 px of content in 390). Math Mayhem: the second row of answers is below the fold. |
| F5 | Casual lobby, briefing, results and What's next | Measured by the new driver with the longest names (24 characters, one with no space to break at), host at 390×844 and guest at 320×640. The briefing's **I'm ready** was below the fold for both: the rules card comes first and runs past the first screen. Lobby, results and What's next: no overflow, names wrap, no control under 44 px, What's next and Play again on the first screen. |
| F6 | Every solo round | The round's bar sits above a game screen that is itself one viewport tall, so the page was always a bar's height (about 46 px) taller than the screen and the bar scrolled away; in landscape that pushed timed controls further down. |

No control smaller than 44 px was found on the solo journey at these sizes. The home screen's game row scrolls sideways inside its own container by design.

## 2. Goals (from the handoff)

- **S1 Solo shelf:** compact, readable phone cards and a responsive desktop grid, so all three games can be found without the artwork dominating. Keep each game's description, its personal best on this device, and Word Connections' note that its best spans boards.
- **S2 Pattern Pulse clock:** show the server-derived time left in the whole game on the between-pattern (ready) screen, and say plainly that it keeps running. If time runs out while that screen is open, change state consistently, with no new Start that would mislead. No client authority over deadlines or scoring. Low-time feedback for assistive technology never announces every second.
- **S3 Touch and responsive pass** on home → solo shelf → game/ready → results/replay, and on the casual lobby, briefing and results continuation controls, at 320, 390, landscape and desktop: overflow, clipped controls, long-name wrapping and safe areas. Actions stay reachable, tap targets adequate, focus visible, reduced motion as it is, and forms usable with the keyboard open where touched.

## 3. Design

### 3.1 Solo shelf (S1)
- **Phones (narrower than 600 px):** a small square cover (decorative, 56 px) beside the title and the players/time line only; the description, the personal best and any note run the card's full width below; **Start** full width at the bottom (52 px). (Revised for R81-01, §7.5: the first version put every line beside a 76 px cover, which a wide fallback font made too tall.) Target: at 390×844 the first two cards and the top of the third are on the first screen. (At 320×640 I first aimed for under half the shelf's height; the descriptions wrap more at that width and it came to 1,192 of 1,609 px, with each card 283–303 px. Shortening it further would mean cutting words, which the handoff keeps.)
- **Wider (600 px and up, including a phone in landscape):** a grid that fits as many columns as there is room for, each at least 260 px wide, up to three. The cover becomes a short banner. The shelf's container widens to 1,080 px (only the shelf; other screens keep their width). At 1440×900 all three games and their Start buttons are above the fold.
- **Unchanged:** the order (Math, Pulse, Connections), every text line, `data-testid`s, the "More solo games…" footer and Host a game.

### 3.2 Pattern Pulse's game clock (S2)
- **One pure helper** (`apps/web/src/components/mchezo/pulseClock.ts`): from the game's `deadlineAt` and the server-time estimate it gives the time left (`3:42`), whether it is low (one minute or less), whether it is up, and the one announcement due at a threshold, if any. Unit-tested.
- **The ready screen** shows a game-time panel: **Game time left 3:42**, and "The game clock keeps running between patterns, even now. Rounds you haven't played when it reaches 0:00 score nothing."
  - It is a `timer` with `aria-live="off"`: read when asked, never announced each second.
  - A separate polite status announces only crossings: "Under a minute of game time left.", "Under 20 seconds of game time left." and "The game's time is up.", each once.
  - **The history belongs to the game instance** (ChatGPT's spec feedback 6790913242): moving between the ready, memorise and tap-back screens never repeats a warning, and a new game (Play again, a rematch) starts with a clean history. A clock correction that skips a band says only where it lands; one that goes back and then forward says nothing it already said.
  - At one minute or less the panel switches to the warning tone (colour plus the words, never colour alone).
- **When time runs out on the ready screen:** **Show me the pattern** is replaced by "The game's time is up. Your results are on their way." (solo) or "…the results follow." (room). This is a display state only: the server ends the game at its deadline and the screen changes when the projection says so (the solo app polls every second; rooms get a push). A press that raced the deadline is refused by the server as before.
- **…while the server isn't answering** (feedback 6790913242): the status says so instead of promising results ("The game's time is up, but the game server isn't answering right now, so your results can't show yet. They will as soon as it answers.") and offers **Check again** (solo: read the room now; a room: the connection's retry, beside its reconnecting banner). In solo, the reconnecting note and **Leave round** stay. Solo counts as not answering once nothing has come back for 8 s (the existing stale rule); a room, while its socket is reconnecting.
- **Memorise and tap-back screens:** the compact game clock line, as rooms show today. To avoid two clocks on one screen, Pulse draws its own game clock on every screen, and App stops drawing `GameClock` above Pulse. Solo gains it on those screens too.
- **F3 fix:** the solo session records the server's clock from every projection it **accepts**, as room screens do: the first one after Start, each poll, and the first after an outage. Never from a refused or failed reply, and never from an older read that answers after a newer one: reads are numbered when sent, and a reply is taken only if no later-sent read has been taken (that also keeps the round shown from going back). This corrects every solo countdown (Math, Pulse, Connections), not only Pulse's.
- **Server:** unchanged. Deadlines and scoring stay where they are.

### 3.3 Touch and responsive pass (S3)
- **Short landscape screens** (height 520 px or less, landscape): Pattern Pulse's ready and tap-back screens in two columns (what's next or what to tap | the clock, the shapes and the buttons), so **Lock it in** and **Show me the pattern** fit without scrolling; **Math Mayhem's** answer area may shrink below its portrait minimum (260 px, never under 140 px: each answer at least 64 px) so both rows fit; the solo bar is slimmer. Only Math's (short numbers): the other quiz games keep theirs, as longer answers would clip (feedback 6790913242). Touch targets stay at least 44 px and labels readable; with larger text the screens scroll rather than clip (checked at 130 % zoom).
- **Safe areas:** screens already pad for the top and bottom insets, and the new docks do too. Left and right insets are **left to the Home Screen milestone**: today they are zero (the page doesn't ask for `viewport-fit=cover`, so Safari keeps content out of the notch itself), and adding them to every screen's padding would collide with screens that set their own (`.mz-screen--game`). That milestone turns full-screen display on and should add them with it.
- **Casual lobby, briefing, results and What's next:** fix what the driver finds (F5). It found one thing: the briefing's **I'm ready** below the fold. I'm ready (with its help line) is now a sticky dock at the bottom of the screen while the rules are read, in the lobby dock's existing style, and settles into place at the end; slimmer on a short landscape screen. The host's Start now and Cancel follow it as before (checked: not covered). The briefing is shared with Family Cups, so they get the same dock; nothing about who may press what changes.
- **The solo round fits the screen (F6):** the round is one viewport tall, the bar takes its height and the game screen the rest (scrolling inside itself when it must).
- **Forms with the keyboard open:** only if a form on this journey is touched; checked by shrinking the viewport's height (an emulation, not a real keyboard).

## 4. Must stay as it is
- Start identity: solo presses, duplicate, refused and timeout recovery (Stage 7.4, D-S74-04 and 08); casual press ids.
- Lineup intent (manual, lineup, rematch), What's next, cancel destinations.
- Host permissions and host handover.
- The TV: public state only.
- Reduced motion and Animations Off behaviour.

## 5. Validation plan
- **Unit:** the clock helper (time left, low, up, each announcement once, never per second, a clock that jumps); the solo session recording server time from projections, with a skewed local clock.
- **Browser driver** (new): at 320×640, 390×844, 844×390 and 1440×900:
  - the shelf: every card's Start reachable, cards' heights, no sideways overflow, no control under 44 px;
  - Pattern Pulse: the game-time panel matches the server's deadline; with a short test game window (`MCHEZO_LIFECYCLE_SCALE`), time runs out on the ready screen: no Show me the pattern, the time-up status, then the results; a solo journey with replay;
  - landscape: Pulse's Lock it in and Math's answers in view without scrolling;
  - casual: a host and a guest with long names: lobby → start → briefing → play → results → Play again → results, with the continuation controls in view and no overflow.
- **Screenshots** from the real app at 320, 390, landscape and desktop, before (`58196cb`) and after, with the revision recorded.
- **Gates:** focused checks while building; fast then full gate at the checkpoint, one after the other, with an estimate from recorded timings (fast about 45 s, full about 29 min).

## 6. Choices (for review)
1. **Pulse owns its game clock** on every screen (ready: the panel; memorise and tap-back: the compact line), and App stops drawing `GameClock` above Pulse. One clock per screen, and solo gets it too. *Alternative:* keep App's line and add the panel only on the ready screen; rooms would show two clocks there.
2. **Low time:** the warning tone at one minute; announcements only at 60 s, 20 s and time up, each once. *Alternative:* a single announcement at one minute.
3. **Time up on the ready screen** replaces Show me the pattern with a status rather than disabling it, so nothing looks pressable. The server stays the authority.
4. **F3** (solo countdowns on the phone's clock) is fixed here, as a pre-existing defect in the clock this milestone touches.
5. **Breakpoints:** a list under 600 px; an auto-fit grid (columns at least 260 px, up to three) from 600 px, with the shelf container widened to 1,080 px.
6. **Landscape compaction** uses a height-and-orientation query and is limited to the screens named in §3.3: the shorter answer area is Math's only (feedback 6790913242).
7. **The briefing's I'm ready is a sticky dock** (F5), shared with Family Cup briefings. *Alternative:* moving I'm ready above the rules; rejected because the rules should be read first.
8. **Left and right safe areas** are left to the Home Screen milestone (§3.3).
9. **Time up while the server isn't answering** offers Check again rather than only waiting (feedback 6790913242).
10. **Replies are numbered:** an older reply never replaces a newer one in the solo session (feedback 6790913242).

## 7. What was built and tested

### 7.1 Built
- **S1 the solo shelf** (`apps/web/src/ui/mchezo/styles/stage8.css`, `Solo.tsx`): row cards on phones (a 76 px square cover beside the words, Start across the bottom, at least 48 px tall); an auto-fit grid from 600 px (columns at least 260 px, three at most) in a 1,080 px shelf, with Start aligned along the bottom. Every line of text, best and note kept.
- **S2 Pattern Pulse's game clock** (`apps/web/src/components/mchezo/pulseClock.ts`, `MchezoPulse.tsx`, `App.tsx`): as designed in §3.2. The ready screen's explanation now says the round's own timer starts at Show me the pattern; the panel says the game clock keeps running.
- **F3** (`apps/web/src/solo/soloSession.ts`): the solo session notes `serverNow` from every projection it reads.
- **S3** (`stage8.css`, `MchezoPulse.tsx`, `MchezoMath.tsx`, `phone/screens.tsx`): the solo round fits the screen; landscape two-column Pulse and Math's shorter answer area; the briefing's sticky I'm ready.
- **Feedback 6790913242** (`pulseClock.ts` `nextAnnouncement`, `MchezoPulse.tsx`, `soloSession.ts`, `soloGames.tsx`, `Solo.tsx`, `App.tsx` `RoomPulse`): the announcement history per game; replies numbered and the clock taken only from accepted ones; time up while the server isn't answering, with Check again; the landscape answer area Math's only.
- **Server:** unchanged.

### 7.2 Tested
- **Unit** (`tests/stage81-mobile-solo.test.ts`, 16):
  - the clock helper: m:ss from the server's deadline and time, never negative; low at one minute, urgent at 20 s, up at the deadline; a second-by-second countdown announces exactly three times; a clock jumping back and forth across a threshold announces once; arriving already low or up announces that state once;
  - a real solo room's projection carries the deadline and the server's time (5:00 at the start, 1:00 and low after four minutes);
  - time up between patterns: the server refuses a late Show me the pattern and ends the game itself, once; with nobody pressing, the server's clock alone ends it;
  - **F3:** against a real server with the phone's clock 90 s behind and 120 s ahead of the server's, the solo session's countdown equals the server's own numbers. Both fail with the fix removed.
  - **Feedback 6790913242:** the history across screens (no repeat), across games (a new game says its warnings again), a correction that skips a band, one back and forward; recovery after an outage (the clock taken again from the first reply after it; a failed read changes nothing); an older read answering after a newer one changes neither the round shown nor the clock.
  - **Mutations,** each failing a test: no order guard; the clock noted from every reply; the history not kept per game.
- **Unit suite:** 1,322 (1,306 before Stage 8.1).
- **Browser driver** `scripts/check-mobile-everyday.mjs` (new, 130 checks; Chromium emulation): A the shelf at four sizes; B solo Pulse on a phone clock 10 minutes fast (the panel within 3 s of the server's numbers, one clock per screen, keeps-running words, timer not live) and a complete Math journey with Play again; C time up on the ready screen with its own server and a 30 s game (warning tone; announcements exactly under a minute, under 20 s, time up; Show me never on screen with time up; with the server's replies held from 3 s before the deadline: first "results are on their way", then, once nothing has come back, "isn't answering" with Check again, the reconnecting note and Leave round; released, Check again brings the results; the server ended it with no round played); C2 the same in a casual room with the guest offline: Check again beside the room's reconnecting banner, then the results once back online; D landscape (Pulse's ready and tap-back, Math's answers, the solo bar, all on screen without scrolling); D2 landscape at 130 % zoom (650×300 CSS px): every shape key and answer at least 44 px, names readable and not clipped, every control reachable by scrolling; E a casual room with the longest names (lobby, briefing, Pulse in a room with one clock, results with What's next, Play again, results again; nothing covered, nothing clipped, no overflow).
- **Regressions, local, on `a856fa4`** (`docs/evidence/stage81-local/`, not gate verdicts): `check-solo` 80, `check-solo-shelf` 58, `check-pattern-pulse` 54, `check-pulse-timing` 41, `check-briefing` 43, `check-session-flow` 70, `check-lifecycle` 37, `check-math` 28, `check-mobile` 50.
- **Measured** with the same probe before and after (`docs/evidence/stage81-local/probe-*.json`):

| Size | Shelf height, before → after | Cards |
|---|---|---|
| 320×640 | 1,609 → 1,192 px | 421–439 → 283–303 px tall |
| 390×844 | 1,741 → 1,131 px | 463–481 → 266–268 px; two Start buttons on the first screen |
| 844×390 | 1,311 → 908 px | one column → two side by side |
| 1440×900 | 1,623 → 900 px (no scrolling) | one column → three side by side, every Start on the first screen |

  In a solo round the page is now exactly one screen tall at every size (it was a bar's height taller). The probe also found no control under 44 px and no sideways overflow on the solo journey, before or after.
- **Screenshots:** `docs/stage8/screenshots-81/before/` (`58196cb`) and `after/` (`a856fa4`), 36 each, at 320×640, 390×844, 844×390 and 1440×900, both from clean trees (`manifest.json`), by `scripts/screenshot-stage81.mjs`.

### 7.5 Repair R81-01 (review 6793171907): the narrow cards and the fonts phones really render
- **The finding:** ChatGPT's independent run of `check-mobile-everyday` on `de913bf`, in its Codespace, was 129/130. At 320×640 the Word Connections card was 341 px against the 320 px cap (Math and Pulse 302 px).
- **Reproduced here, and why my runs passed:**
  - The app names Figtree and Inter but loads no web font, so each machine renders whatever of those it has, else its own fallback.
  - This container has **Inter** installed, so every earlier measurement (283–303 px) was Inter's.
  - The Codespace had neither, like most phones (iPhones have SF, Android phones Roboto) and many Linux machines.
  - With **DejaVu Sans** forced (the wide Linux default), the cards here are 302/302/341 px, exactly the Codespace's numbers. Figtree, Roboto, Liberation Sans (Arial metrics) and FreeSans (Helvetica metrics) all give at most 283 px.
  - Table: `docs/evidence/stage81-local/r81-01/card-heights-by-font.md`.
- **The fix** (`stage8.css`, horizontal space, no text removed or shrunk):
  - on phones, the cover (now 56 px) sits beside the title and the players line only;
  - the description, the personal best and the note run the card's full width below;
  - the reading order of the words is unchanged (only their placement), and the desktop grid looks the same.
- **After,** the tallest card at 320×640: **284 px** with DejaVu Sans (was 341), 265 px with Inter, Figtree, Roboto, Liberation Sans and FreeSans. At 390×844: at most 265 px with any of them. The first Start and the second game's title are on the first 320×640 screen, and two Start buttons on the first 390×844 screen, with every font.
- **The acceptance criterion is kept, and now measured honestly:**
  - The caps stay (320 px at 320×640, 300 px at 390×844). They express the original goal: compact cards, with games found without scrolling past artwork.
  - What changed is that `check-mobile-everyday` now measures them with the page's own font stack **and** with every fallback installed on the machine (DejaVu Sans, Liberation Sans, FreeSans), each forced in turn, and logs which were measured.
  - It checks the first-screen starts with each font too.
  - Run against a build with the tested stylesheet, it fails here exactly as in the Codespace (`…/r81-01/check-mobile-everyday-on-de913bf-stylesheet.log`).
  - Start's check is now its real 52 px (it said 48).
- **Focused checks on `86baf14`** (local, not gate verdicts): `check-mobile-everyday` 134/134, `check-solo-shelf` 58, `check-solo` 80, `check-mobile` 50.
- **Screenshots:** `after/` re-taken at `86baf14` (clean tree); `before/` is unchanged (`58196cb`).

### 7.3 Gates
- **An earlier candidate, `2300bcc`** (before the spec feedback was applied): fast **PASSED** (`20261111-090358-2300bccc-8008`, 5/5); the full gate was **stopped by me** a minute in, when the spec feedback arrived, and recorded its own verdict **CANCELLED** (exit 130, `20261111-090450-2300bccc-10963`: 2 passed, 3 cancelled, 78 not run). Neither is a verdict on the checkpoint.
- **The checkpoint, `de913bf15ade107ea89eadc428478cf02d90421c`:** one after the other (the full gate started when the fast one had finished), each in its own fresh clone with a clean tree (`dirty: []`), the same source fingerprint (`ea63d49a…`, 437 files).

| Run | Gate | Verdict | Measured |
|---|---|---|---|
| `20261111-092723-de913bf1-17062` | fast | **PASSED**, exit 0, 5/5: typecheck ×2, lint, 1,322 unit tests, build | wall 47 s |
| `20261111-092815-de913bf1-20032` | full | **PASSED**, exit 0, 83/83, 3 workers: `check-mobile-everyday` 130, `check-solo` 80, `check-solo-shelf` 58, `check-pattern-pulse` 54, `check-pulse-timing` 41, `check-briefing` 43, `check-session-flow` 70, `check-lifecycle` 37, `check-math` 28, `check-mobile` 50 | wall 30 min 02 s |

- **The estimate posted before the runs** (PR #12's description): about 1 minute, then 29–35 minutes. They ran from 09:27:22 to 09:58:20 UTC.
- **No failed gate runs** on this checkpoint. Raw evidence for all four runs (these two and the two on `2300bcc`): `docs/evidence/gate-runs/<run>/`.

