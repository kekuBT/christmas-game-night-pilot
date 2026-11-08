# Stage 3 live QA repair sprint

**Branch:** `claude/stage3-live-qa-fixes`, from the Stage 3 record `190c020`. Its verified code checkpoint was `3483e0c`; later commits there were docs only.
**Input:** the Stage 3 audit package (AUDIT-REPORT, ISSUES, TEST-MATRIX, HANDOFF, STATUS, evidence PDFs).
**Scope rules:** no merge, no deployment, no port exposed, no spend, no change to approved content, Cup rules or scoring.
**Decisions:** D-QA-01 to D-QA-07 in `docs/DECISIONS.md`.

**What "tested" means here:** Chromium only, using emulated phone sizes. **No real iPhone was used.**

## A. Issue reconciliation

| Issue | Severity (audit) | Result | Evidence |
|---|---|---|---|
| S3-TV-05 TV marks 7 correct for the touchdown question | Medium (owner: P0) | **Not reproduced**; hardened. Both documented option orders replayed through real selection, shuffle, answers, counts, TV and phones, and a restart: 6 is marked correct and each vote sits on its own option. Two hardenings: out-of-range answers are refused (D-QA-01), and TV bars now name their options for screen readers. | `tests/tv-trivia-reveal.test.ts`, `scripts/check-tv-reveal.mjs`, `after/tv05-*` |
| S3-TV-01 TV questions differ from the phones' | High | **Not reproduced**; intentional parts made clear. The TV's Q1–Q10 are the phones' Q1–Q10 (checked prompt by prompt). The two quoted TV questions ("What planet is known as the 'Red Planet'?" with Earth/Mars/Venus/Jupiter; "who is the White Rabbit?") exist nowhere in the code or content, so the TV can't have shown them. Intentional, now labelled: during play the TV shows one featured question (Q1), and after the finish it walks the answers. The top bar says which ("Game finished · answers, Q3 of 10"). | `check-tv-reveal.mjs` (S3-TV-01 checks) |
| S3-MTH-01 Q1's speed bonus unreachable | Low (owner: P0) | **Fixed (root cause on the phone).** The server timed correctly, from the open it received, but a page nobody could see opened the question anyway. The audit drove three seats from browser windows, so all Q1 clocks started at once. Also, a lost open left the phone stuck on "Getting question 1 of 10…". Now questions open only when visible, and lost opens are asked again. No client time is trusted and the scoring is unchanged. Remaining trade-off: D-QA-02. | `scripts/check-math-timing.mjs` (the previous client fails 3 checks: 7.1 s/110 points; stuck), `before/mth01-lost-open-stuck.png` |
| S3-RES-01 Standings omit a sitter-out | Medium (owner: P1) | **Fixed.** Up to 4 players are always listed; larger fields get a preview plus "Show all N players". | `tests/stage3-qa-results.test.ts`, `check-results.mjs` (the previous build fails with the audit's symptom), `before/after res01-*` |
| S3-RES-04 2nd of 2 "middle of the pack" | Low (owner: P1) | **Fixed.** Seven line conditions corrected. All 29 lines are audited exhaustively. | `tests/stage3-qa-results.test.ts`, `check-results.mjs`, `before/after res04-*` |
| S3-RES-03 "−480" in green | Low | **Fixed.** A drop is shown in muted text. | `Results.tsx`, `stage3.css` |
| S3-HOME-01 Home dock covers cards | Medium (owner: P1) | **Fixed.** Content scrolls above a footer dock, the two actions sit side by side, and card text comes before the picture. Checked every 24 px of scroll at 375/390/430/768/1440, with Safari's toolbar shown and hidden. | `scripts/check-lobby-mode.mjs`, `before/after home01-*` |
| S3-HOME-02 Lobby mode below the fold | Low | **Fixed.** The host's dock says the mode and what it means, with a Change button that brings the choice into view. The lobby also scrolls above its dock now. | `check-lobby-mode.mjs`, `after/lob01-*` |
| S3-LOB-01 Official is the default | Medium | **Clarity fixed; default unchanged** (owner decision). Start reads "Start … · Official", and the mode is on the up-next card for everyone. | D-QA-05, `after/lob01-*` |
| S3-LOB-02 Guests can't see the mode | Low | **Fixed** (plus a pre-existing defect: guests' "Up next" showed their own tab's default game). The host's plan is shared with the room. | `tests/lobby-plan.test.ts`, `check-lobby-mode.mjs`, `before/after lob02-*` |
| S3-WCN-01 Score not explained | Medium (P2) | **Fixed.** The rule, plus your breakdown, shown only when it equals your recorded score (the audit's 420 and 400). | `check-tv-dashboard.mjs`, unit parity test, `after/wcn01-results.png` |
| S3-TV-02 No Word Connections standings on the TV | Medium (P2) | **Fixed.** The TV ends on the standings as well as the solution. | `check-tv-dashboard.mjs`, `after/tv02-*` |
| S3-TV-06 No live Math TV view | Medium (P2) | **Fixed (bounded).** A public live card shows the game, mode, players, clock, "N of M have started" and how timing works, with no scores or answers. Final ranked standings are shown after the finish. Per-player progress waits for A-19. | `check-tv-dashboard.mjs`, `after/tv06-*` |
| S3-TRV-01 "everyone's in" wording | Medium (P2) | **Fixed (wording).** Now "have started / all have started", plus a line saying it isn't "finished". | `Waiting.tsx`; check-mchezo, check-m6 |
| S3-WCN-02 "1 mistakes left" | Low (P2) | **Fixed.** | `check-tv-dashboard.mjs` |
| S3-TV-03 TV Question tab: no timer/scores/who answered | Low | Deferred (bounded TV follow-up; who answered needs A-19). | — |
| S3-TV-04 TV stays on results after a game | Low | **Intentional**: the TV shows the latest game until the next one starts. A "Back to lobby view" is a bounded follow-up. | — |
| S3-LIB-01..04, S3-NAV-01/02, S3-CUP-01, S3-MEM-01, S3-LOB-03, S3-TRV-02/03/04, S3-WCN-03, S3-STU-01/02, S3-JOIN-01 | Medium–Low | **Deferred, not investigated in this sprint** (outside its P0–P2 scope). S3-MEM-01 and S3-LOB-03 carry over from v1 (A-14, A-10). | — |
| S3-RES-02 No celebration for a tie | Info | **Intentional** (owner-confirmed). | — |
| S3-RES-05 Confetti is brief | Low | **Intentional** (≤1.2 s by D-UX-22). | — |
| Caption Clash rounds 2–3; ten-player room | — | **Blocked in the audit** (the preview died). Ten players are covered here by `check-results.mjs` and the unit tests. | — |

## B. Root causes of the P0 issues

**S3-TV-05 (touchdown, "7 marked correct").** Not reproduced. The full path keeps one canonical option order, and both documented games were replayed in a real browser with the exact documented orders:
- the content item and the seeded shuffle (`correctIndex = options.indexOf(answer)`);
- the frozen snapshot;
- the phone and TV projections;
- answers stored as indexes into that order;
- counts per index;
- the reveal, where bars and labels are drawn in the same order.

All of the following hold, including after a restart:
- the CORRECT stamp is on 6;
- each count sits above its own label;
- only 6 stays lit.

The spectator's report can't be squared with any single ordering:
- Game 4's tallies fit "counts in the pack's order".
- Game 5's tallies don't.
- Its S3-TV-01 notes quote questions that exist nowhere in the product.

Before this sprint the bars' accessible text was a bare number ("1 0 1 0"). Anything reading the TV as text, rather than as a picture, could pair counts with the wrong labels. Each bar now names its option. Out-of-range answers are also refused now.

**S3-MTH-01 (Q1 bonus).** The server timed correctly, from the open it received to the answer it received. The phone opened a question as soon as it rendered, even in a hidden page, and sent each open only once:
- **Three seats from browser windows (the audit's setup):** every Q1 clock started at the start of play, whoever was looking.
- **On the previous client, a page hidden at the start of play:** 7.1 s and +10 instead of +20.
- **A lost open:** the phone stayed on "Getting question 1 of 10…" for good.

Both are fixed on the phone, with the server still the only clock.

## C. Regression evidence

New tests:
- `tests/tv-trivia-reveal.test.ts` (4)
- `tests/stage3-qa-results.test.ts` (16, of which 1 is the exhaustive line audit over more than 80,000 stories)
- `tests/lobby-plan.test.ts` (4)

New drivers, each starting its own server:
- `scripts/check-tv-reveal.mjs` (both touchdown games; auto walk, Q buttons, reload, 390 px; TV Q1–Q10 vs phones)
- `scripts/check-math-timing.mjs` (start of play with three phones; hidden page; lost opens; held reply; no socket)
- `scripts/check-lobby-mode.mjs` (Home at 8 sizes and every 24 px of scroll; host and guest lobby; plan follow, reload, Start)
- `scripts/check-tv-dashboard.mjs` (Math live and standings; Word Connections 420/400, breakdown, plural, TV standings)

Extended:
- `scripts/check-results.mjs` (+9 checks; on the previous build, 5 fail with the audit's symptoms)

Updated to assert the replacement wording or label (no assertion weakened):
- `check-stage2` (Start names its mode; the end-of-lobby check scrolls the new area)
- `check-mchezo`, `check-m6` ("have started")

Exact passing revision: `b1dd580` (the full gate there is §E). The recording commit after it is docs only.

## D. Before and after (Chromium)

| Issue | Before | After |
|---|---|---|
| S3-HOME-01, 375 | `before/home01-375.png` | `after/home01-375.png` |
| S3-HOME-01, 1440 | `before/home01-1440.png` | `after/home01-1440.png` |
| S3-LOB-01/HOME-02, host 375 | `before/lob01-host-375.png` | `after/lob01-host-375.png` |
| S3-LOB-02, guest 390 | `before/lob02-guest-390.png` | `after/lob02-guest-390.png` |
| S3-RES-01, the sitter-out on others' phones | `before/res01-standings-bea.png` | `after/res01-standings-bea.png` |
| S3-RES-01, 10 players | `before/res01-ten-players-375.png` | `after/res01-ten-players-375.png` |
| S3-RES-04, 2nd of 2 | `before/res04-second-of-two.png` | `after/res04-second-of-two.png` |
| S3-MTH-01, lost open | `before/mth01-lost-open-stuck.png` | `after/mth01-q1-timed.png` |
| S3-TV-05, Game 4 reveal (correct before and after) | `before/tv05-game4-reveal.png` | `after/tv05-game4-reveal.png` |
| S3-TV-05, Game 5 reveal | — | `after/tv05-game5-reveal.png` |
| S3-TV-02 | (audit PDF 26) | `after/tv02-connections-standings.png` |
| S3-TV-06 | (audit PDF 47) | `after/tv06-math-live.png`, `after/tv06-math-standings.png` |
| S3-WCN-01 | (audit PDFs 22–24) | `after/wcn01-results.png` |

## E. Full gate

`node scripts/gate.mjs full` on `b1dd580`, from a fresh clone: **PASSED (exit 0)**, run `20261108-200931-b1dd5804-360`.
- 53 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests 977. E2E (Chromium) 12/12.
- `check-tv-reveal` 57, `check-math-timing` 12, `check-lobby-mode` 71, `check-tv-dashboard` 10, `check-results` 32, `check-stage2` 76.

Two earlier runs failed and don't count; they are recorded in `docs/PROGRESS.md`:
- `bd82ce7`: a driver still asserted the old Math copy.
- `ef9ea8a`: a driver timing race after a reload.

Both were driver fixes; no assertion was weakened.

## F. Remaining issues by severity

- **Owner decisions:**
  - S3-LOB-01, the default mode (it stays Official).
  - A-19, who sees who has finished (blocks per-player live progress on the TV and S3-TV-03's "who answered").
  - Network-stall compensation for Math timing (D-QA-02).
  - D2 solo practice and D-UX-10 (carried over).
- **Medium (deferred):**
  - S3-LIB-01, playable-now on the Library grid.
  - S3-CUP-01, rules above the standings.
  - S3-MEM-01, export feedback (from v1).
- **Low (deferred):**
  - S3-TV-03, S3-TV-04 (a back-to-lobby control).
  - S3-LIB-02/03/04, S3-NAV-01/02, S3-LOB-03.
  - S3-TRV-02 (names truncate in the waiting ring), S3-TRV-03, S3-TRV-04.
  - S3-WCN-03, S3-STU-01/02, S3-JOIN-01.
- **Untested here:** real iOS Safari (toolbar, swipe-back, backgrounding while a Math question opens), and Caption Clash rounds 2–3 live.

## G. iPhone acceptance checklist (real device, Safari)

1. **Home:** scroll slowly. No game card's name or "players · minutes" line ever sits under Join/Host, with the toolbar shown or hidden.
2. **Lobby as host:**
   - Start reads "Start Trivia Showdown · Official".
   - The line under it says what Official means.
   - Change scrolls to the Official/Practice choice.
3. **Lobby as guest (second phone):**
   - Shows the host's game and "Practice · no Cup points" within seconds of the host switching.
   - Follows a new pick (e.g. Math Mayhem).
4. **Math, 3 phones:**
   - Ready on all; lock one phone before the last Ready.
   - Unlock: Q1 appears, and a quick answer shows "Answered in about 1 s" and 120.
5. **Trivia, 3 players, one sits out:** every phone's Standings step lists all three.
6. **Trivia, 2 players:** 2nd place reads "Second in a head-to-head", never "middle of the pack".
7. **TV (/watch on a laptop):**
   - The touchdown or any question's reveal stamps CORRECT on the right answer, with each count over its label.
   - The top bar says "Game finished · answers, Qn of 10".
8. **Word Connections:**
   - "1 mistake left".
   - The results say "How the score works" and your own sum.
   - The TV shows the standings.
9. **Math on the TV:** the live card shows the clock and "N of M have started" with no scores, then the final standings.
10. **Reduce Motion:** no celebration burst; screens don't slide.
