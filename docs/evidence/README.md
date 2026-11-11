# Raw test evidence

Raw output from the gate runs and checks that the PR handoffs cite, committed so a reviewer can read it without rerunning anything. Every file is copied unchanged from the run's `test-results/<runId>/`. Paths inside the files are those of the cloud container that ran them.

## `gate-runs/<runId>/`

| Run | Revision | What | Files |
|---|---|---|---|
| `20261111-182118-96b3970e-3648` | `96b3970` | **Stage 8.3 (final candidate):** full gate, **PASSED 85/85** in 31 min 11 s (`check-install` 113, `check-themes-seasonal` 251, `check-mobile-everyday` 134), fresh clone, clean tree, fingerprint `7f36233e758c` (468 files), run after the fast gate finished (PR #14's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-181930-96b3970e-32718` | `96b3970` | **Stage 8.3 (final candidate):** fast gate, **PASSED 5/5** in 43 s, 1,404 unit tests, fresh clone, clean tree | the same |
| `20261111-175010-69a7dc19-21132` | `69a7dc1` | **Stage 8.3, second candidate:** full gate stopped by me when ChatGPT's spec feedback 6802191261 was read; self-recorded **CANCELLED** (exit 130). Not a verdict | the same (partial) |
| `20261111-174819-69a7dc19-17727` | `69a7dc1` | **Stage 8.3, second candidate:** fast gate, PASSED 5/5; superseded by the feedback | the same |
| `20261111-174012-8b8a7ef3-14563` | `8b8a7ef` | **Stage 8.3, first candidate:** full gate stopped by me for the rejoin-screen fix (stage83.md §7.1); self-recorded **CANCELLED** (exit 130). Not a verdict | the same (partial) |
| `20261111-173824-8b8a7ef3-11175` | `8b8a7ef` | **Stage 8.3, first candidate:** fast gate, PASSED 5/5; superseded | the same |
| `20261111-154845-546a9c6f-21442` | `546a9c6` | **Stage 8.2, repair R82-01 (final candidate):** full gate, **PASSED 84/84** in 30 min 42 s (`check-themes-seasonal` 251 including section G, `check-mobile-everyday` 134, `check-content-variety` 58), fresh clone, clean tree, fingerprint `9537c8d89ade` (449 files), run after the fast gate finished (PR #13's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-154635-546a9c6f-17994` | `546a9c6` | **Stage 8.2, repair R82-01 (final candidate):** fast gate, **PASSED 5/5** in 49 s, 1,379 unit tests, fresh clone, clean tree | the same |
| `20261111-151310-224a2d23-9331` | `224a2d2` | **Stage 8.2, first R82-01 repair candidate:** full gate stopped by me within seconds, when the R82-01 screenshots showed compact choices clipping their labels (stage82.md §7.5); self-recorded **CANCELLED** (exit 130). Not a verdict | the same (partial) |
| `20261111-150823-224a2d23-5811` | `224a2d2` | **Stage 8.2, first R82-01 repair candidate:** fast gate, PASSED 5/5 in 51 s (1,379 unit tests); superseded by the final repair candidate | the same |
| `20261111-134957-c27570f7-15819` | `c27570f` | **Stage 8.2:** full gate, **PASSED 84/84** in 30 min 00 s (`check-themes-seasonal` 139, `check-mobile-everyday` 134, `check-content-variety` 58), fresh clone, clean tree, fingerprint `9e319219…` (447 files), run after the fast gate finished (PR #13's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-134753-c27570f7-12465` | `c27570f` | **Stage 8.2:** fast gate, **PASSED 5/5** in 49 s, 1,374 unit tests, fresh clone, clean tree | the same |
| `20261111-132514-d4e06c34-28633` | `d4e06c3` | **Stage 8.2, first candidate:** full gate stopped by me about a minute in, when ChatGPT's spec feedback 6795825877 arrived; self-recorded **CANCELLED** (exit 130). Not a verdict | the same (partial) |
| `20261111-132206-d4e06c34-24970` | `d4e06c3` | **Stage 8.2, first candidate:** fast gate, PASSED 5/5 in 49 s (1,359 unit tests); superseded by `c27570f` | the same |
| `20261111-103537-d7bb85f0-5864` | `d7bb85f` | **Stage 8.1, repair R81-01:** full gate, PASSED 83/83 (`check-mobile-everyday` 134 with the shelf measured in four fonts, `check-solo` 80, `check-solo-shelf` 58, `check-mobile` 50), fresh clone, clean tree, run after the fast gate finished (PR #12's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-103446-d7bb85f0-2862` | `d7bb85f` | **Stage 8.1, repair R81-01:** fast gate, PASSED 5/5 (1,322 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261111-092815-de913bf1-20032` | `de913bf` | **Stage 8.1:** full gate, PASSED 83/83 (`check-mobile-everyday` 130, `check-solo` 80, `check-solo-shelf` 58, `check-pattern-pulse` 54, `check-briefing` 43, `check-math` 28, `check-mobile` 50), fresh clone, clean tree. Superseded by `d7bb85f` after ChatGPT's run of the same driver failed 1 of 130 in its Codespace (R81-01) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-092723-de913bf1-17062` | `de913bf` | **Stage 8.1:** fast gate, PASSED 5/5 (1,322 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261111-090450-2300bccc-10963` | `2300bcc` | **Stage 8.1, an earlier candidate:** full gate **stopped by me** a minute in when spec feedback 6790913242 arrived; it recorded itself CANCELLED (exit 130: 2 passed, 3 cancelled, 78 not run). Not a verdict | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261111-090358-2300bccc-8008` | `2300bcc` | **Stage 8.1, an earlier candidate:** fast gate, PASSED 5/5 (1,316 unit tests); superseded by `de913bf` | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261111-055600-ecb617c6-18731` | `ecb617c` | **Stage 7.4 repair, timed-out resend fix:** full gate, PASSED 82/82 (`check-content-variety` 57 with A4, `check-solo` 80, `check-solo-shelf` 58, `check-session-flow` 70), fresh clone, clean tree, run after the fast gate finished (PR #11's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-055510-ecb617c6-15772` | `ecb617c` | **Stage 7.4 repair, timed-out resend fix:** fast gate, PASSED 5/5 (1,306 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261111-034515-8147b726-12402` | `8147b72` | **Stage 7.4 repair (review 6786060026):** full gate, PASSED 82/82 (`check-content-variety` 57 with A4, `check-solo` 80, `check-solo-shelf` 58, `check-session-flow` 70), fresh clone, clean tree, run after the fast gate finished. Superseded by `ecb617c` after a focused rerun failed once (`stage74-local/repair/`) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-034429-8147b726-9520` | `8147b72` | **Stage 7.4 repair:** fast gate, PASSED 5/5 (1,304 unit tests, including the two-tab client tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261111-013409-5d41e5f1-20255` | `5d41e5f` | **Stage 7.4:** full gate, PASSED 82/82 (including the new `check-content-variety`, 54 checks; `check-solo-shelf` 58, `check-solo` 80, `check-session-flow` 70, `check-quick-party` 68), fresh clone, clean tree, run after the fast gate finished (PR #11's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261111-013325-5d41e5f1-17311` | `5d41e5f` | **Stage 7.4:** fast gate, PASSED 5/5 (1,298 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-231336-371c1948-12591` | `371c194` | **Stage 7.3:** full gate, PASSED 81/81 (including the new `check-host-handover`, 32 checks; `check-session-flow` 70, `check-quick-party` 68), fresh clone, clean tree (PR #10's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-231336-371c1948-12599` | `371c194` | **Stage 7.3:** fast gate, PASSED 5/5 (1,271 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-214318-01cde601-21321` | `01cde60` | **Stage 7.2 repair (review 6778921208):** full gate, PASSED 80/80 (`check-session-flow` 70, `check-quick-party` 68), fresh clone, clean tree (PR #9's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-214318-01cde601-21310` | `01cde60` | **Stage 7.2 repair:** fast gate, PASSED 5/5 (1,253 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-211133-e65d80ce-5056` | `e65d80c` | **Stage 7.2 repair, before the test-limit fix:** full gate, **FAILED** 79/80. Every browser driver passed. The unit-test step failed: the seven-day Cup test timed out at 5,015 ms while both gates ran their unit tests at once (spec §6.3) | `report.json`, `summary.txt`, `gate-console.log`, `logs/04-unit-tests.log` |
| `20261110-211133-e65d80ce-5071` | `e65d80c` | **Stage 7.2 repair, before the test-limit fix:** fast gate, **FAILED** 4/5, the same test (5,031 ms) | `report.json`, `summary.txt`, `gate-console.log`, `logs/04-unit-tests.log` |
| `20261110-195129-acab35f3-19586` | `acab35f` | **Stage 7.2:** full gate, PASSED 80/80 (including the new `check-session-flow`, 52 checks, and `check-quick-party`, 68), fresh clone, clean tree (PR #9's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-195030-acab35f3-16696` | `acab35f` | **Stage 7.2:** fast gate, PASSED 5/5 (1,253 unit tests), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-183603-01fd2858-7370` | `01fd285` | **Stage 7.1 repair (review 6775606005):** targeted gate, PASSED 11/11 (`quick-party` 67, `casual`, `lobby-mode`, `game-night-flow`, `briefing`, `solo`, `solo-shelf`, `recovery`, `sessions`), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-183513-01fd2858-4576` | `01fd285` | **Stage 7.1 repair:** fast gate, PASSED, fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-171316-97684cbe-5210` | `97684cb` | **Stage 7.1:** full gate, PASSED 79/79, fresh clone, clean tree (PR #8's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-171227-97684cbe-2368` | `97684cb` | **Stage 7.1:** fast gate, PASSED, fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-160144-801960b9-8627` | `801960b` | **Stage 6.2:** full gate, PASSED 78/78, fresh clone, clean tree (PR #7's tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-160058-801960b9-5774` | `801960b` | **Stage 6.2:** fast gate, PASSED, fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-151634-be400fb1-19788` | `be400fb` | Stage 6.2, before ChatGPT's clarifications were applied: full gate, **FAILED** 77/78 (superseded). `check-solo-shelf` E expected a different board after Play again; gate servers approve all content, so a solo room repeats one board there (spec §3.4, §6.2) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-151543-be400fb1-16991` | `be400fb` | Stage 6.2: fast gate, PASSED (superseded) | `report.json`, `summary.txt`, `gate-console.log` |
| `20261110-142749-51d01b9f-7153` | `51d01b9` | **Stage 6.1 review repairs:** targeted gate (`solo` with the fault section, `casual`, `poll-body-stall`, `tv-outage`, `recovery`, `sessions`), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-142701-51d01b9f-4372` | `51d01b9` | Stage 6.1 review repairs: fast gate, fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log` |
| `20261110-112312-35f90c11-18967` | `35f90c1` | **Stage 6.1:** full gate, fresh clone, clean tree (PR #6's full-gate tested revision) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-114857-453fda50-2186` | `453fda5` | Stage 6.1: targeted gate after the seat-recovery fix (`solo`, `casual`, `recovery`, `sessions`), fresh clone, clean tree | `report.json`, `summary.txt`, `gate-console.log`, `logs/` |
| `20261110-112530-453fda50-22327` | `453fda5` | Stage 6.1: fast gate after the seat-recovery fix | `report.json`, `summary.txt`, `gate-console.log` |
| `20261110-111112-79a92a9e-12814` | `79a92a9` | Stage 6.1: targeted gate, first implementation (18 steps; superseded) | `report.json`, `summary.txt` |
| `20261110-111110-79a92a9e-12770` | `79a92a9` | Stage 6.1: fast gate, first implementation (superseded) | `report.json`, `summary.txt` |
| `20261110-063622-3ce937a7-2793` | `3ce937a` | Full gate on the cumulative Stage 5.1 + 5.2 tree with both review fixes (the review candidate) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-055944-735242dd-14712` | `735242d` | Full gate, the cumulative tree with the first review fix only (superseded) | `report.json`, `summary.txt`, `gate-console.log`. Its step logs are in this folder at commit `a5fdf4a`. |
| `20261110-052100-872add3c-26825` | `872add3` | Full gate, Stage 5.2 before the Stage 5.1 review fix (superseded) | `report.json`, `summary.txt`, `gate-console.log` |
| `20261110-003130-0a3964f3-11617` | `0a3964f` | Full gate, Stage 5.1, the old sequential gate (PR #4's tested revision) | `report.json`, `summary.txt` |

`report.json` records the revision, `git.dirty` (empty: a clean tree), the source fingerprint, the browser and Node versions, and every step's status, time, worker, CPU and peak memory. The server data, screenshots and built app are left out.

## `failure-injection/<label>/`

The nine runs in `docs/test-optimization/README.md` §13. Each folder holds:
- `injected.diff`: the one-line change, which was committed in a throwaway clone and never pushed;
- `gate-console.log`: the gate's output (`targeted f5`);
- `check-f5.log`: the driver's own log.

| Label | Commit | Injection |
|---|---|---|
| `dg-word`, `dg-guess`, `mr-tap` | `dab1c65` | The action always fails |
| `old-t2-word`, `old-t2-guess`, `old-r2-tap` | `dab1c65` | The action fails on Draw & Guess turn 2, or in Majority round 2, only |
| `new-t2-word`, `new-t2-guess`, `new-r2-tap` | `872add3` | The same, after the 30 s rule |

## `poll-body-stall/<label>/`

`check-poll-body-stall`, run before and after each review fix:
- **PR #4 review** (a stalled body on a 200):
  - `old-5a4454c`: the unchanged Stage 5.1 code plus only the new driver (FAILED);
  - `fixed-uncommitted`: the fix before it was committed as `7e7ab16` (PASSED).
- **PR #5 review** (a stalled body on a skipped 500):
  - `error-stall-before-5636d1f`: `5636d1f` plus only the extended driver (FAILED: the 500 replies were left open);
  - `error-stall-fixed-uncommitted`: the fix before it was committed as `0cb5a78` (PASSED).

Both committed fixes are covered by the full gate on `3ce937a` above.

## `review-pr6/`

ChatGPT's review of PR #6 (comment 6769583991), reproduced before the repair and checked after it.
- `repro.ts.txt`: the reproduction script (copy it to the repository root as a `.ts` file and run `node --import tsx` on it). It drives the real `SoloSession` and personal-best code with an injected fetch.
- `repro-before-96eaea5.txt`: its output on the reviewed head. A stalled create stays "starting" with no abort signal; 401 and 404 leave the old round "playing" with no error; a 500 on the seat check makes a new room; a best under other rules blocks the new best.
- `repro-after-51d01b9.txt`: the same script on the repair. "error" with an abort signal; "lost" for 401 and 404; no new room; the new best saved.
- `before-driver-96eaea5/`: the repaired `check-solo` (its fault section I, `driver.diff`) run as a targeted gate on the reviewed app in a throwaway clone. It is **FAILED** (run `20261110-143047-96eaea57-8299`): the SoloHome copy check fails, I1 sees Start stuck on "Starting…" for 15 s, and the driver then times out. On the repair the same driver passes in the targeted gate above (80 checks).

## `stage62-local/`

Stage 6.2 browser drivers run by hand from the development checkout, on the source later committed as `782ae4e`, against local servers. These are not gate verdicts; the gate runs above are.
- `check-solo-shelf-test-content-mode.log`: 57/57 against a server with `MCHEZO_CONTENT_TEST_MODE=approve-provisional`, as the gate runs it. Its INFO line shows the same board after Play again, which is the cause of the `be400fb` failure.
- `check-solo-shelf-shipped-library.log`: 57/57 against a server with the shipped library. A different board after Play again.
- `check-solo.log` (80), `check-casual.log` (30), `check-connections.log` (39), `check-pattern-pulse.log` (54): regressions against the test-mode server, all passing.

## `review-pr9/`

ChatGPT's review 6778921208 on PR #9: a game picked by hand that matched the lineup's next item used up that item.
- **`check-session-flow-on-acab35f.log`:** the repaired driver (parts J and K) run against the old candidate `acab35f`, built and served from a separate worktree. 11 checks fail. Among them:
  - the hand-picked start sent `party: { revision: 1, index: 0 }`;
  - the Math item completed and the lineup moved to Guess the Year;
  - What's next came after the standings and answers.

## `stage81-local/`

Stage 8.1 browser drivers run by hand against a local server with `MCHEZO_CONTENT_TEST_MODE=approve-provisional` (as the gate runs it). These are not gate verdicts; each log's first line names its source.
- `check-mobile-everyday.log`: the new driver, 130/130, on `a856fa4` (after spec feedback 6790913242).
- `check-solo.log` (80), `check-solo-shelf.log` (58), `check-pattern-pulse.log` (54), `check-pulse-timing.log` (41), `check-briefing.log` (43), `check-session-flow.log` (70), `check-lifecycle.log` (37), `check-math.log` (28) and `check-mobile.log` (50), all on `a856fa4`.
- `r81-01/` (repair R81-01, review 6793171907): `card-heights-by-font.md` (the narrow cards with Inter, Figtree, Roboto, Liberation Sans, FreeSans and DejaVu Sans forced, before and after the repair; `fontprobe.mjs` made it), `check-mobile-everyday-on-de913bf-stylesheet.log` (the new font-aware check failing on the tested stylesheet, as in the Codespace), the driver and shelf regressions on `86baf14`, and two screenshots with DejaVu Sans forced.
- `probe.mjs` and `probe-before-58196cb.json` / `probe-after-947ffae.json`: the measuring probe behind spec §1 and §7.2 (shelf and card heights, page height, sideways overflow, small controls) at 320×640, 390×844, 844×390 and 1440×900.

## `stage74-local/`

Stage 7.4 browser drivers run by hand from the development checkout against a local server with `MCHEZO_CONTENT_TEST_MODE=approve-provisional` (as the gate runs it). These are not gate verdicts.
- `check-content-variety.log`: 54/54, on the final source (clarification 6783492788 included).
- `check-content-variety-on-af39c78.log`: the same driver, with part C pointed at a server built from `af39c78`. Part C fails: one board for all 13 solo starts. Parts A and B use the driver's own server (this revision).
- `check-content-variety-without-solo-restart-fix.log`: the driver with the solo-restart fix removed from the server. A2 fails: Play again after the restart never starts a round.
- `check-content-variety-on-af39c78.log` and `check-content-variety-without-solo-restart-fix.log` were run on the source committed as `c78cb43` plus A2 (before A3 existed).
- Regressions, all passing: `check-session-flow` (70), `check-solo` (80), `check-solo-shelf` (58, part E now asserted) and `check-recovery` (20) on the final source; `check-briefing` (43), `check-casual` (30), `check-quick-party` (68) and `check-host-handover` (32) on the source committed as `c78cb43` (the clarification changed only solo starts).

## `stage74-local/repair/`

ChatGPT's review 6786060026 (solo Start recovery adopted another tab's round). These are not gate verdicts.
- `client-recovery-tests-on-5d41e5f.log`: the new client-recovery tests (real server, two tabs, injected faults) with the reviewed client from `5d41e5f` swapped in. 5 of 5 fail; three of them adopt B's round (`game-2`, `game-3`).
- `check-content-variety-with-5d41e5f-solo-client.log`: the driver with the web app built from the reviewed client. A4 fails: tab A plays B's round and never resends its press.
- `check-content-variety.log`, `check-solo.log`, `check-solo-shelf.log`: the drivers on the repaired source, 57/57, 80/80 (I1 at about 6.5 s) and 58/58.
- `two-tab-and-client-tests-on-8147b72.log`: **an observed failure.** A focused verbose run of `stage61-solo-client` and `stage74-content-variety` on `0180dfd` (source identical to `8147b72`), after both gates on `8147b72` had passed. Result: 58 passed, 1 failed. The failing test is the Stage 6.1 "Start's reply never comes…" (`phase: "playing"`, expected `"error"`): a timed-out send was resent. All five two-tab tests passed. It was fixed in `ecb617c` (spec §7.5).
- `client-mutations-on-ecb617c.txt`: the seven client mutations (script and output) on `ecb617c`'s source, run before its gates. Each is caught.

## `stage72-local/`

Stage 7.2 browser drivers run by hand from the development checkout, against a local server with `MCHEZO_CONTENT_TEST_MODE=approve-provisional` (as the gate runs it). The source is that later committed as `0bac2fd`, except that `nextState` was afterwards moved into its own file. These are not gate verdicts; the gate runs above are.
- `check-session-flow.log`: 52/52.
- `check-quick-party.log`: 68/68.
- Regressions, all passing: `check-casual.log` (30), `check-briefing.log` (43), `check-solo.log` (80), `check-solo-shelf.log` (57), `check-game-night-flow.log` (14), `check-lobby-mode.log` (71), `check-tv-spectator.log` (15), `check-f4.log` (11).

## `stage72-local/repair/`

Hand-run drivers for the review 6778921208 repair, from the development checkout, on the source committed as `9750ad7`, against a local test-mode server. These are not gate verdicts.
- `check-session-flow-r1.log` (70/70) and `check-quick-party-r2/r3` (68/68).
- Regressions, all passing: `check-casual`, `check-library`, `check-shuffle`, `check-lobby-mode`, `check-game-night-flow`, `check-briefing`.
- `check-quick-party-r1-impostor-flake.log`: the Stage 7.1 part C flake, before its fix. Part C removed Impostor, so part G could not put it first.

## `stage71-local/`

Stage 7.1 browser drivers run by hand from the development checkout, on the source later committed as `a7060ac`, against a local server with `MCHEZO_CONTENT_TEST_MODE=approve-provisional` (as the gate runs it). These are not gate verdicts; the gate runs above are.
- `check-quick-party.log`: 51/51.
- `check-casual.log` (30), `check-lobby-mode.log` (71), `check-game-night-flow.log` (14), `check-briefing.log` (43): regressions, all passing.

## `review-pr8/`

ChatGPT's review 6775606005 on PR #8: a stale Quick Party draft silently overwrote a newer lineup.
- **`repro-stale-draft.mjs.txt`:** the reproduction, run from the scratchpad against a local server: host draft, cohost save, host apply.
- **`repro-before-97684cb.txt`:** on `97684cb`, the cohost's 30-minute lineup (revision 1) was replaced by the host's 15-minute draft (revision 2), with no conflict shown.
- **`repro-after-fix.txt`:** after the fix, revision 1 is unchanged and the conflict is shown.
- **`check-quick-party-on-97684cb.log`:** the new driver (with part K) against the `97684cb` build. Part K fails: "the newer lineup is unchanged" sees revision 2, the host's draft.
- **`check-quick-party-after-fix.log`:** the driver on the fix, 67/67.

