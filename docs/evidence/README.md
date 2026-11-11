# Raw test evidence

Raw output from the gate runs and checks that the PR handoffs cite, committed so a reviewer can read it without rerunning anything. Every file is copied unchanged from the run's `test-results/<runId>/`. Paths inside the files are those of the cloud container that ran them.

## `gate-runs/<runId>/`

| Run | Revision | What | Files |
|---|---|---|---|
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

## `stage74-local/`

Stage 7.4 browser drivers run by hand from the development checkout against a local server with `MCHEZO_CONTENT_TEST_MODE=approve-provisional` (as the gate runs it). These are not gate verdicts.
- `check-content-variety.log`: 54/54, on the final source (clarification 6783492788 included).
- `check-content-variety-on-af39c78.log`: the same driver, with part C pointed at a server built from `af39c78`. Part C fails: one board for all 13 solo starts. Parts A and B use the driver's own server (this revision).
- `check-content-variety-without-solo-restart-fix.log`: the driver with the solo-restart fix removed from the server. A2 fails: Play again after the restart never starts a round.
- `check-content-variety-on-af39c78.log` and `check-content-variety-without-solo-restart-fix.log` were run on the source committed as `c78cb43` plus A2 (before A3 existed).
- Regressions, all passing: `check-session-flow` (70), `check-solo` (80), `check-solo-shelf` (58, part E now asserted) and `check-recovery` (20) on the final source; `check-briefing` (43), `check-casual` (30), `check-quick-party` (68) and `check-host-handover` (32) on the source committed as `c78cb43` (the clarification changed only solo starts).

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

