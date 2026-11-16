# Beta R1-R, fourth round: continuing Trivia on small screens (review 6904986723, R5; B-15)

**The plan, the estimate and the record:** `docs/beta/beta-r1-repair.md`, "Fourth round". **The decision:** D-BR1R-12.

**How these ran:**
- **Where:** local runs in my container, with Chromium (chrome-headless-shell 1243) emulating the stated CSS sizes. No real phones, and no Safari or Firefox.
- **The server:** each run built the web app from the tree named and served it with that tree's dev server (`MCHEZO_CONTENT_TEST_MODE=approve-provisional`, throwaway data).
- **Formatting:** `<scratchpad>` stands for my throwaway folder. Every name and room is synthetic.

## Before the repair: the unchanged candidate
Tree `f93e9cb` (product `456cb0d`). The driver is the first version of `scripts/check-locked-answer.mjs`, kept as `check-locked-answer-v1-repro.mjs.txt`.

| File | Run | Result |
|---|---|---|
| `repro-before-run1-driver-error.log` | run 1 | **Invalid: my driver's error** (`join` declared twice). Nothing was measured. |
| `repro-before-run2-driver-error.log` | run 2 | **Invalid: my driver's error.** The join form takes at most 24 characters, and the driver typed a 32-character name. |
| `repro-before-run3.log` | run 3 | **The defect reproduced: 28 checks failed.**<br>• **Next question, 320×480:** at 705–761 px on a 480 px screen, and covered at its centre.<br>• **The order:** after the ring at every size, with "Waiting for everyone" on screen.<br>• **The lower seat's label over the paragraph under the ring:** 1,323 px² (320), 1,070 px² (390) and 949 px² (1440) on the host's screen; 303–422 px² on the guest's.<br>• **After the last answer:** an enabled "Waiting for the game to finish". |
| `before/*.png` | run 3's screenshots | The nonfinal screen (host 320×480, guest 320×480, host 390×844, host 1440×900) and the final screen (host 320×480 and 390×844). |

## After the repair: local runs on the working tree (before the commit)
| File | Run | Result |
|---|---|---|
| `after-local-run1-driver-final-label.log` | the first driver | The nonfinal checks all passed at 320×480; Next question was at 186–242 px. **Then my driver crashed:** it waited for the old "Answer locked in" label after the final answer, and the final screen is now labelled "All your answers are in" by design. |
| `after-local-run2-driver-tv-room.log` | the full driver | **8 failures, all in the journey, from my driver's error.** It read the TV's projection through the spectator page's `sessionStorage`, which has no room id. So the deadline read as 0 s and the results wait was too short. Sections A, C, T, Z and F all passed (128 checks). |
| `after-local-run3.log` | the full driver, fixed to read the same public `audience=tv` projection through a seated page | **PASSED, 136/136.** |

**The existing drivers the change touches,** run locally on the working tree, one after another:

Logs are in `sweep-working-tree/`.

| Driver | Result |
|---|---|
| check-answer-helper | 8/8, including the new case: a locked view without Next question fails loudly |
| check-math | 28/28 |
| check-geography | 24/24 |
| check-audit-fixes | 50/50 |
| check-mchezo | 43/43 |
| check-answer-race | 9/9 |
| check-solo | 80/80 |

## The gates, and the one that failed
Each gate ran from a fresh clone of the exact commit (`scripts/gate.mjs`, three workers). Their summaries, reports and logs are in `docs/evidence/gate-runs/<run id>/`.

| Run | Commit | Verdict |
|---|---|---|
| targeted `20261116-022947-5525dedb-4704` | `5525ded` (the repair) | **FAILED (exit 1), 11/12.** One check in the new driver: "320x480 T the LOCKED IN stamp stays clear of the long answer — 61px²". Every other check of all 12 steps passed, check-locked-answer's other checks included. |
| targeted `20261116-024127-34996cf4-7748` | `34996cf` (driver fix only; product identical to `5525ded`) | **PASSED (exit 0), 12/12:** check-locked-answer, answer-helper, math, geography, audit-fixes, mchezo, answer-race, solo, session-flow and tv-lifecycle, plus the build and the browser preflight. |
| full `20261116-024847-34996cf4-10213` | `34996cf` | **CANCELLED (exit 130), by me, after 1 min 59 s:** 6 passed, 3 cancelled, 102 not run. The scope answer 6905044291 arrived and asked for one more Math check, which changes the candidate. The gate cancelled cleanly on SIGTERM, with no process left behind. |
| targeted `20261116-025541-c955613d-16045` | `c955613` (adds the Math open-flow checks and a unit-test pin; product identical to `5525ded`) | **PASSED (exit 0), 8/8:** check-locked-answer, math, math-timing, geography, solo and answer-helper, plus the build and the browser preflight. |
| full FULL_RUN_ID | `c955613` | FULL_VERDICT |

**Why the first targeted run failed, measured before changing anything:** `stamp-probe.mjs.txt` and `stamp-probe-after-gate-failure.out.txt`.
- **The probe:** the same build at 320×480, four locks. It sets the 80-character answer and samples the stamp and answer every 40 ms for 1.4 s.
- **What it found:** overlap only while the stamp's slam animation runs (8 of 35 samples, about 0.3 s, up to 4,291 px², the stamp 102 px tall at 1.8×). **0 px² at rest** in every lock.
- **So:** the driver measured mid-animation, while the gate loaded the machine. The existing A-01 check (check-audit-fixes) measures after the stamp lands for the same reason.
- **The fix, driver only (`34996cf`):** after each lock and after setting the long answer, wait until the stamp's animation is no longer running. The local rerun is `after-local-run4-settled-stamp.log`: 136/136, 0 px² at 320 and 390.

**Screenshots from the final candidate:** `after-c955613/`, taken by the passing targeted run `20261116-025541-c955613d-16045`'s check-locked-answer.
- the nonfinal and final screens at 320×480, 390×844 and 1440×900;
- an 80-character answer at 320 and 390;
- 150% and 200% zoom;
- Geography and Math Mayhem at 320;
- the sat-out ring;
- the journey: the TV playing (Reveal withheld), the host's final screen, the guest's results (time ran out), the TV's finished review, and the TV after Play again.

## The Math open flow (scope answer 6905044291)
`after-local-run5-math-open-flow.log` (local), then the gate runs above. The check uses the player's own projection with the current protocol, which shows a Math prompt only once its question has been opened.
- **On the locked screen:** question 2 isn't opened, nor 3.5 s later (longer than the open retry's 3 s).
- **After Next question on a page that reports itself hidden:** still not opened, the visibility guard. The page's visibility is overridden the way check-math-timing does it.
- **Once the page is shown:** question 2 opens and its prompt appears.
- **Its answer is timed from that open:** 402 ms locally and 498 ms in the gate. The 7 s on the locked and hidden screens don't count.
