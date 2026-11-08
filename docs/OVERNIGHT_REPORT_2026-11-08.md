# Overnight report, 2026-11-08

Three phases, each on its own branch, each verified by one full gate on one revision. Nothing was merged into `main` and nothing was deployed. No paid resources were used, the private Codespaces port was not exposed, and no scoring, Cup rule, content approval or game catalogue changed. Each branch builds on the one before it.

| Phase | Branch | Verified revision | Gate run | Verdict |
|---|---|---|---|---|
| 1. Audit defect triage | `claude/audit-defect-triage` | `f9dfcf2` (record `10fa0d3`) | `20261108-063036-f9dfcf2f-16569` | **PASSED** (47/47; unit 910; e2e 12/12) |
| 2. Stage 2 "Night Circle" | `claude/stage2-night-circle` | `f7c5265` (record `b08ac19`) | `20261108-074616-f7c5265c-5793` | **PASSED** (48/48; unit 940; e2e 12/12) |
| 3. Stage 3 results (bonus) | `claude/stage3-results` | `3483e0c` (record: this commit) | `20261108-091845-3483e0c6-17580` | **PASSED** (49/49; unit 953; e2e 12/12) |

Gate command: `node scripts/gate.mjs full`. Each ran from a fresh clone with only an untracked `node_modules` symlink, using this machine's Chromium headless shell. Each verdict covers its revision only; the recording commits after them are docs only.

## Phase 1: audit defect triage

**Fixed, each with a failing test first:**
- **A-01/A-02:** answer cards showed through the chosen one (a legacy disabled-opacity rule), and the LOCKED IN stamp covered long answers.
- **A-03:** standings split a shared rank.
- **A-05:** players away on Library, Studio, Championship or Memory Book missed the briefing.
- **A-06:** a slow reload showed an empty "You're in, friend · 0 here" lobby.
- **A-07:** late joiners landed on a game's results that weren't theirs.

**Found by the first full gate and fixed:**
- **The rejoining screen hid Reconnect.** After a reload with a rejected credential, it offered "Try again" instead of the lobby's Reconnect.
- **The "signed out" banner covered that button.**
- **A driver swallowed errors.** The A-05 setup ignored failed clicks; it now fails loudly.

The first full gate (on `2492a0b`) failed `check-errors` and doesn't count.

**Outstanding** (`docs/audit-triage/RECONCILIATION.md`):
- **Category 2:** A-08 (truncated names).
- **Category 3** (results and TV redesign): A-09, A-10, A-12, A-19 (needs a privacy decision), A-21, A-22.
- **Category 4** (cosmetic): A-14, A-17, L-05, L-06.
- **Category 5** (needs a live screenshot or a real iPhone): A-05 rest, A-06 latency, A-11, A-13, A-15, A-16, A-18, A-20, L-03, L-07.

## Phase 2: Stage 2 "Night Circle"

**Screens** (`docs/stage2/README.md`, 26 screenshots at 375/390/430/768/1440):
- **Home B:** covers for all 11 games, the featured game of the day, a Join/Host dock, and Rejoin only when this tab holds a seat. Nothing invented.
- **Join** (QR and invite links fill in the code) and **Host** (name first: A-04).
- **Lobby A:** code + Invite, Cup day and ☰; an honest headline; the Circle with will-play checks; the up-next cover card; Official/Practice; Start in a sticky dock above Safari's toolbar.
- **Sheets:** Invite, Pick a game, Room menu and Game details. Back closes a sheet first, focus is kept inside while open, and focus returns on close.
- **Library:** covers first, search on screen, folded filters, removable chips, Clear filters (also in the empty state), practice-only tags.
- **Real addresses:** browser Back, in-app Back and swipe-back agree, a reload keeps the screen, and Back from the lobby goes Home with Rejoin. Deep links while seated are handled, and no duplicate seats are created.

**UX decisions:** D-UX-14 to D-UX-20 in `docs/DECISIONS.md`.

**Bugs found while migrating the drivers, all fixed:**
- Connection alerts hid under sheets.
- "This seat moved to another device" was overwritten by "Your session ended". This predates Stage 2; it has a unit test now.
- Your own seat looked faded.
- Full-room names covered neighbouring seats.
- Cup → TV → "Lobby & Games" went back to the Cup.

**Tests:**
- New `scripts/check-stage2.mjs` (76 checks) and `tests/connection-store.test.ts`.
- Every driver now reaches the new screens the way a person does. No assertion was weakened: checks that named removed things now assert their replacement.

**Limitations:**
- Chromium emulation only.
- Join from a QR link doesn't yet show "Room found · 4 here" (needs a server endpoint).
- Solo practice waits for D2.
- The older Championship/TV/Memory Book screens keep their look.
- The `scripts/screenshot-*.mjs` scripts (not in the gate) still drive the Stage 1 landing page.

## Phase 3: results and celebrations (bonus)

**What it adds** (`docs/stage3/README.md`):
- **Every results screen opens with the same header:** who won or who shares first place, your place ("You came 2nd of 3" / "You tied for 1st of 4"), your points, and one of 28 original Mild lines. Each line appears only when its condition is true of the recorded result, and a line is chosen by the game's id, so every phone and every refresh says the same thing.
- **The celebration:** a ≤1.2 s burst on the winner's phone only. Never under Reduce Motion, Less or Off.
- **Source of facts:** only the server's scores and the player's own participation. Nothing is invented.
- **Unchanged:** no scoring changes; Start is still the host's.

**Tests:**
- 13 unit tests.
- `scripts/check-results.mjs` (23 checks: a two-player win, three players, a three-way tie on three phones, a dropped-out player, practice, official, ten long names at 375/390/430, refresh, reduced motion).
- 16 existing results drivers re-run.

**Limitation:** per-item score breakdowns need the server's recorded scoring details (later stage).

## Testing on your iPhone

1. *(Optional)* Stop running codespaces at github.com/codespaces (Stop, not Delete) to save free hours.
2. In Safari, open **https://codespaces.new/kekuBT/christmas-game-night-pilot/tree/claude/stage3-results**. That branch contains all three phases. Keep 2-core, then Create codespace, and wait 3–5 minutes.
3. When port 3000 is offered, tap **Open in Browser**. Keep the port private (the default).
4. Use a second Safari tab as the second player. The private address only opens for your GitHub account.

**Test first, in this order:**
1. **Home:** the dock sits above Safari's toolbar.
2. **Swipe-back** closes a game's details.
3. **Host** needs a name.
4. **Lobby:** everything is visible without scrolling, and Start is not hidden by the toolbar.
5. **Invite → swipe back.**
6. **Join** from a copied link, with the code pre-filled.
7. **Swipe back from the lobby → Rejoin**, mid-game too.
8. **Results:** the winner's header and burst; the same line on the other tab after a refresh.
9. **Reduce Motion:** no burst.

Full tables: `docs/stage2/README.md` (12 rows) and `docs/stage3/README.md` (5 rows).

**Known limits:** iOS Safari wasn't available here; Back, the dock and the toolbar are verified in Chromium emulation only.

## Needs your approval

- Merging any of the three branches. They're stacked: triage → Stage 2 → Stage 3.
- Any deployment, or exposing a port publicly.
- D2 (solo practice).
- A-19's privacy rule (who sees who has finished).
- A public room-preview endpoint for Join.
- D-UX-10 (forfeit/abandonment), still open from yesterday.
