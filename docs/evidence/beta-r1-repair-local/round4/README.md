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
