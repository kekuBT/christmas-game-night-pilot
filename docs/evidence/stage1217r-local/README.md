# Stage 12.17-R: local runs (every run, failures included)

**What these are:** local runs during the repair of review 6898755998 R1, before the gates. They are not gate verdicts; the gates and a process note are at the end. Scripts are saved as `.txt` so nothing here runs by accident.

| File | Revision | Result | What it shows |
|---|---|---|---|
| `repro-draw-sparse.mts.txt`, `repro-draw-sparse-68ac61a.out.txt` | `68ac61a` (the reviewed head) | **TypeError** | The reviewer's reproduction: Draw & Guess with three players and one usable Everyday prompt starts 3 turns with 1 prompt. On turn 2, `publicView` throws `TypeError: Cannot read properties of undefined (reading 'word')`. |
| `repro-draw-sparse-fixed-tree.out.txt` | `6944ea7`'s tree | refused | `init` refuses: "Draw & Guess needs 3 prompts for 3 turns; only 1 can be dealt." |
| `tests-before-fix-68ac61a.log` | `68ac61a` + the new test file | **10 FAIL**, 1 pass | `tests/stage1217r-drawing-supply.test.ts` on the unrepaired code. The one that passes is the exactly-enough positive case (a whole game with no swap reserve), which already worked. |
| `drawing-tests-repaired-tree.log` | `6944ea7`'s tree | 12 files, 208/208 | Every unit test file that starts or deals a drawing game, the new one included. |
| `check-draw-shortage-run1.log` | `6944ea7` | DRAW SHORTAGE CHECKS PASSED (15) | The browser check, run locally: the refusal at 390 and 320 px, nobody taken into a game, no game on the server, then the Christmas retry opening the briefing for all three. |

## Gates (one run on one revision each, both on `6944ea7`)

| Run | Kind | Verdict | What ran |
|---|---|---|---|
| `20261115-194623-6944ea73-5155` | targeted | **PASSED (exit 0)**, 8/8 steps, 157 s | build-web, preflight, `check-draw-guess`, `check-draw-shortage` (15 checks), `check-team-draw-content`, `check-team-draw`, `check-draw-sync`, `check-cup-team-games` |
| `20261115-194908-6944ea73-6706` | fast | **PASSED (exit 0)**, 77 s | typecheck, lint, the web build and every unit test: 158 files, 2044/2044 |

Each run's log, steps and summary are in `docs/evidence/gate-runs/<run id>/`. No other gate ran on `6944ea7`, and none of 12.17-R's gates failed or was stopped. The screenshots in `docs/stage12/stage1217r-screenshots/` come from the targeted run's `check-draw-shortage` step.

## Process note: two overlaps with Beta R1's gates

The working rule is that no tests or drivers run while a gate runs. The transcript times show two breaches:

1. **1:34–1:35 p.m. ET:** this repair's unit runs (`tests-before-fix-68ac61a.log`, `drawing-tests-repaired-tree.log` and the reproduction) ran while Beta R1's full gate `20261115-183350-83058786-32167` (on `8305878`, #43) was running.
   - **That gate:** it FAILED at `check-f5`, and I stopped it.
   - **The cause:** a defect in `8305878`'s own B-09 fix. I reproduced it afterwards with nothing else running and corrected it in `92a3722`; the evidence is on #43.
   - **These unit results:** the failures on `68ac61a` are assertion failures, not timeouts. The repaired tree's results were then confirmed alone by the fast gate above.
2. **2:03 p.m. ET:** a single `eslint` run over four of this repair's files (a few seconds) ran during Beta R1's full gate `20261115-190235-92a3722b-13639`, which PASSED.

No verdict depends on either overlap. The 12.17-R gates above ran with nothing else running.
