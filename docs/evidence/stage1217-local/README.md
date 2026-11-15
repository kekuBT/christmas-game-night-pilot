# Stage 12.17: local runs (every run, failures included)

**What these are:** local runs while building the stage, before the gates. They are not gate verdicts; the gates are in `docs/evidence/gate-runs/` and listed at the end.

## The gap, before and after

| File | Tree | Result | What it shows |
|---|---|---|---|
| `repro-official-team-draw.mts.txt` | | | The script: a Family Cup of four on the content library loaded as shipped (no content test mode), the lobby's `officialContent`, then an Official Team Draw start. |
| `repro-before-1955c28.out.txt` | #41's head `1955c28` | **gap confirmed** | The library has no drawing prompts (0); `officialContent` has no Team Draw entry; the Official start **succeeds** (`official: true`, `briefing`) with three unreviewed prompts (`dg-010`, `dg-007`, `dg-038`) and no frozen content (`pendingContent: null`). |
| `repro-after-0c30d04.out.txt` | `0c30d04` | refused | 70 prompts in the library, none approved; `officialContent["team-draw"]` is 0 of 3 with the reason; the start is refused (`ContentShortage`, `CONTENT_EXHAUSTED`) with the same reason. |

## The move

| File | Result | What it shows |
|---|---|---|
| `gen-draw-pack.mts.txt`, `gen-draw-pack.out.txt` | 70 prompts, 3 Christmas (`dg-002`…`dg-004`), 15 with alternatives | The generator that wrote `content/packs/draw-prompts.json` from the TypeScript list (since deleted), in its order, and the list's fingerprint `165c7ad5…a0b0f0`, which `tests/stage1217-team-draw-content.test.ts` pins. |
| `content-check.txt` | CONTENT OK | `draw-prompts`: 70 items, 70 provisional, 0 official, 0 errors, 0 warnings. |

## Unit tests (before the gates)

- **The existing tests after the move:** 3 failed, all expected list changes, then fixed:
  - `tests/content.test.ts`: the content-games list gains `draw-prompts`.
  - `tests/stage82-seasonal.test.ts`: the Christmas-tagged list gains `dg-002`…`dg-004`, and the tagged count goes from 55 to 58.
- **The new file:** `tests/stage1217-team-draw-content.test.ts`, first run 31 of 33. Both failures were test set-up mistakes:
  - a casual Christmas game started without setting the room's content season first (the room refused it, as designed);
  - the HTTP start expected 200, but a successful start returns 201.
- **After the fixes:** 33/33, then 34 with a restart case, then 35 with the inventory sync test.
- **The whole suite** on the tree committed as `4e8eb2a`: 157 files, 2032/2032 (`unit-all-4e8eb2a-tree.tail.txt`). The CPU-heavy unit run never overlapped a gate.

## The browser check (`scripts/check-team-draw-content.mjs`), run locally

| File | Driver | Result | Why |
|---|---|---|---|
| `driver-local-run1.log` | an earlier draft | **1 FAIL**, 55 pass | Driver expectation wrong: it looked for the reason sentence ("Practice only: Team Draw counts only…") on a guest's lobby. That note is shown on the host's lobby only, the same as for Split Clues, and this stage changes no UI. The guest's lobby says "Practice only · no Cup points" on the Up next card and in the waiting line. |
| `driver-local-run2.log` | an earlier draft | **1 FAIL**, 55 pass | Driver expectation wrong again: the guest check now refused the word "Official" anywhere on the page, but the Family Cup notice rightly says "Official games count toward the standings". The check now reads only the Up next card and the waiting line. |
| `driver-local-run3.log` | as committed in `0c30d04` | 56/0, exit 0 | "cleanup: 2 server(s) stopped, 3 temporary dir(s) removed; still running: none; left on disk: none". |

The local runs used the web app built in the worktree (`npm run build:web`) and Chromium headless shell. Each run dealt different words (seeds are random): run 3's Practice words were hat, rocket and dog; its Official words were lighthouse, umbrella and candle, all three from the five approved in the fixture.

## Gates (one run on one revision each)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-150649-0c30d04e-18398` | `0c30d04` | targeted (team-draw-content, draw-guess, draw-sync, team-draw, cup-team-games, split-clues-content, official-practice, content-variety, themes-seasonal, lobby-mode) | PASSED (exit 0) | 12/12. Checks per driver: team-draw-content 56/0, with its cleanup line "still running: none; left on disk: none"; draw-guess 61/0; draw-sync 62/0; team-draw 45/0 | 4 min 17 s |
| `20261115-151131-0c30d04e-21316` | `0c30d04` | fast | PASSED (exit 0) | 5/5; unit 157 files, 2033/2033 | 1 min 19 s |
| `20261115-151309-0c30d04e-25404` | `0c30d04` | full | **FAILED (exit 1)** | 107/108; the one failure is `check-team-draw-content` step B, "after a reload, team A's guesser gets their team's drawing back, and still no word" (below); unit 2033/2033 | 41 min 41 s |
| `20261115-160310-0ccf93c5-14288` | `0ccf93c` (the driver fix) | targeted (team-draw-content, team-draw, draw-guess, draw-sync) | PASSED (exit 0) | 6/6. Checks per driver: team-draw-content 57/0 (the stroke settled at `3:15`, in three batches), draw-guess 61/0, draw-sync 62/0, team-draw 45/0 | 2 min 5 s |
| `20261115-160533-0ccf93c5-15517` | `0ccf93c` | full | PASSED (exit 0) | 108/108; unit 157 files, 2033/2033; team-draw-content 57/0, draw-guess 61/0, draw-sync 62/0, team-draw 45/0, split-clues-content 30/0 | 41 min 25 s |

- **The green result** is the full run `20261115-160533-0ccf93c5-15517` on `0ccf93c` alone. The earlier passes on `0c30d04` (targeted and fast) and its failed full run are separate results on a separate revision.
- **Screenshots:** `docs/stage12/stage1217-screenshots/` (16) come from `check-team-draw-content` in `20261115-160310-0ccf93c5-14288` (on `0ccf93c`). They are Chromium emulation at 320 and 390 px (phones), 1440 px (desktop) and 1920 px (TV), not real devices.

## The full gate's failure on `0c30d04`: a race in the driver, not the game (`full-gate-failure/`)

- **What failed:** one check in `check-team-draw-content`, step B: "after a reload, team A's guesser gets their team's drawing back, and still no word". It wasn't within 15 s. Every other step of the full gate passed (107/108).
- **What the screen showed:** `official-guesser-after-reload-390.png`, taken by the driver right after the failed check. The guesser's board has the drawing back, and the word ("rocket", six dashes) is not shown.
- **Root cause:**
  - The phone sends a drawing in batches every 320 ms while it is drawn; what is left when the pen lifts goes out on the next tick (`SEND_EVERY_MS` and `takeBatch` in `apps/web/src/components/mchezo/MchezoDraw.tsx`).
  - The driver recorded the server's drawing (its signature, pieces:points) as soon as the first batch landed, then compared the reloaded board with that recorded value.
  - A quick 12-step mouse stroke that straddles a tick (likelier under the full gate's load) arrives in two batches. The board rightly shows both batches, so it no longer matches the stale value.
- **Reproduced on `0c30d04`'s driver** (`repro-old-driver-two-part-stroke.mjs.txt`: that driver with only the stroke changed, plus three DEBUG lines):

  | Run | Stroke | Result |
  |---|---|---|
  | `repro-1-old-driver-slow-stroke-PASSED.log` | four slow segments, with a pause after the last | passed: every batch had landed before the driver read the server, so this didn't reproduce it |
  | `repro-2-old-driver-two-part-PASSED.log` | two halves with a pause between, the pen lifted at once | passed: by timing |
  | `repro-3-old-driver-two-part-instrumented-FAILED.log` | the same two-part stroke, instrumented | **failed** with the gate's message. It printed "recorded 1:5; board 1:5; server now 1:5" right after the pre-reload check, then "recorded 1:5; board 2:14; server now 2:14" 1.5 s later and after the reload |

  The board matched the server at every point; only the driver's recorded value was stale.
- **The fix (`0ccf93c`, driver only):**
  - **The stroke:** drawn in two halves with a pause, so it always arrives in two or more batches.
  - **Settling:** the driver waits until the server's drawing stops changing (unchanged for 1 s), and checks that it took several batches.
  - **The comparison:** the board is checked against that settled drawing, and against the server's current one, before and after the reload.
- **After the fix:** `fixed-driver-local-run.log` (57/0, settled at `3:15`), and the targeted gate `20261115-160310-0ccf93c5-14288` above.
