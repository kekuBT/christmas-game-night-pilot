# Stage 8.1: mobile usability and solo presentation

**Status:** in progress (spec first). **Do not merge.** Merge and deployment decisions belong to the owner.

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
| F5 | Casual lobby, briefing, results and What's next | To be measured by the new driver at the same sizes with long names (24 characters, the maximum). Findings will be added here. |

No control smaller than 44 px was found on the solo journey at these sizes. The home screen's game row scrolls sideways inside its own container by design.

## 2. Goals (from the handoff)

- **S1 Solo shelf:** compact, readable phone cards and a responsive desktop grid, so all three games can be found without the artwork dominating. Keep each game's description, its personal best on this device, and Word Connections' note that its best spans boards.
- **S2 Pattern Pulse clock:** show the server-derived time left in the whole game on the between-pattern (ready) screen, and say plainly that it keeps running. If time runs out while that screen is open, change state consistently, with no new Start that would mislead. No client authority over deadlines or scoring. Low-time feedback for assistive technology never announces every second.
- **S3 Touch and responsive pass** on home → solo shelf → game/ready → results/replay, and on the casual lobby, briefing and results continuation controls, at 320, 390, landscape and desktop: overflow, clipped controls, long-name wrapping and safe areas. Actions stay reachable, tap targets adequate, focus visible, reduced motion as it is, and forms usable with the keyboard open where touched.

## 3. Design

### 3.1 Solo shelf (S1)
- **Phones (narrower than 600 px):** each card is a row: a small square cover (decorative) beside the title, description and players/time line; the personal best and any note below; **Start** full width at the bottom (at least 48 px tall). Target: at 390×844 the first two cards and the top of the third are on the first screen; at 320×640 the shelf is under half its current height.
- **Wider (600 px and up, including a phone in landscape):** a grid that fits as many columns as there is room for, each at least 260 px wide, up to three. The cover becomes a short banner. The shelf's container widens to 1,080 px (only the shelf; other screens keep their width). At 1440×900 all three games and their Start buttons are above the fold.
- **Unchanged:** the order (Math, Pulse, Connections), every text line, `data-testid`s, the "More solo games…" footer and Host a game.

### 3.2 Pattern Pulse's game clock (S2)
- **One pure helper** (`apps/web/src/components/mchezo/pulseClock.ts`): from the game's `deadlineAt` and the server-time estimate it gives the time left (`3:42`), whether it is low (one minute or less), whether it is up, and the one announcement due at a threshold, if any. Unit-tested.
- **The ready screen** shows a game-time panel: **Game time left 3:42**, and "The game clock keeps running between patterns, even now. Rounds you haven't played when it reaches 0:00 score nothing."
  - It is a `timer` with `aria-live="off"`: read when asked, never announced each second.
  - A separate polite status announces only crossings: "About a minute of game time left." at 60 s and "20 seconds of game time left." at 20 s, each once, and "The game's time is up." once.
  - At one minute or less the panel switches to the warning tone (colour plus the words, never colour alone).
- **When time runs out on the ready screen:** **Show me the pattern** is replaced by "The game's time is up. Your results are on their way." (solo) or "…the results follow." (room). This is a display state only: the server ends the game at its deadline and the screen changes when the projection says so (the solo app polls every second; rooms get a push). A press that raced the deadline is refused by the server as before.
- **Memorise and tap-back screens:** the compact game clock line, as rooms show today. To avoid two clocks on one screen, Pulse draws its own game clock on every screen, and App stops drawing `GameClock` above Pulse. Solo gains it on those screens too.
- **F3 fix:** the solo session records the server's clock from every projection it accepts, as room screens do. This corrects every solo countdown (Math, Pulse, Connections), not only Pulse's.
- **Server:** unchanged. Deadlines and scoring stay where they are.

### 3.3 Touch and responsive pass (S3)
- **Short landscape screens** (height 520 px or less, landscape): Pulse's six shapes in one row with smaller slots, and Math's four answers in one row, so the timed controls and **Lock it in** fit without scrolling; the solo round bar and the game header become compact. Only these screens; other games are not restyled.
- **Safe areas:** screens already pad for the top and bottom insets. Left and right insets are added too. Today they are zero (the page doesn't ask for `viewport-fit=cover`, so Safari keeps content out of the notch itself); they matter once the Home Screen milestone turns full-screen display on.
- **Casual lobby, briefing, results and What's next:** fix what the driver finds (F5): long names wrapping, controls clipped or pushed off screen, overflow. Nothing about who may press what changes.
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
6. **Landscape compaction** uses a height-and-orientation query and is limited to the screens named in §3.3.
