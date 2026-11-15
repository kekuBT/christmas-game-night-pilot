# Stage 12.16: local runs (every run, failures included)

**What these are:** local runs during the stage, before the gates. They are not gate verdicts; the gates are in `docs/evidence/gate-runs/` and listed at the end.

## Moving the puzzles

| Log | Revision (worktree state) | Result | What it shows |
|---|---|---|---|
| `gen-split-packs.mts.txt`, `gen-split-packs.out.txt` | `8798e38` + the generator (scratch) | 51 written | The two JSON packs were generated from the TypeScript bank, not typed by hand. Digest of the bank as written: `2d56e726033f48da1f99280b1374bf10c9c54f219086ca01be1534aadf2e11f8`. The fingerprint test pins the packs to it. |
| (no log) `tsx` on the generator, first try | same | **failed** | Top-level `await` in a `.ts` scratch file; renamed `.mts`. |
| `unit-suite-1-four-expected-failures.log` | + library move, schema, lint, selection, module, room | **4 FAIL** | Three tests listed the content games or the seasonal ids and needed Split Clues added. The fourth was real: `tests/stage91-bank-privacy.test.ts` caught the web app's type import of `splitClues.ts` reaching a content bank. `SplitPuzzle` moved to `src/games/modules/types.ts`. |
| (no log) the new test file, first runs | + `tests/stage1216-split-clues-content.test.ts` | passed, **for the wrong reason** in one case | **My fixture's mistake:** it hashed the raw JSON item, while the loader hashes the parsed item (the schema fills `tags: []`). No fixture approval matched, so "edited after approval" passed because nothing was ever approved. The fixture now hashes `SplitCluesItem.parse(item)`, and the exact-hash test proves an approval takes effect. |
| `unit-suite-2.log` | `8982994` | 1988/1988 | Typechecks, lint and the web build clean. |

## The browser driver (`scripts/check-split-clues-content.mjs`)

It starts two servers of its own without the content test mode: the shipped content, and a temporary copy of `content/` whose `approvals.json` approves six Everyday puzzles at the hashes the real loader computes (reviewer "TEST FIXTURE (not an editorial approval)").

| Log | Revision | Result | What it showed |
|---|---|---|---|
| `check-split-clues-content-1.log` | `8982994` + driver | **6 FAIL**, 17 pass | **Driver bugs, not the app:** it read each player's team from the game's state, where it isn't (it is on the game), so only one team answered and each round waited for the 75 s clock; and it matched "Official" case-sensitively on the TV, which shows it in capitals. |
| `check-split-clues-content-2.log` | + teams from the game | **1 FAIL**, 22 pass | The TV check looked in `tv-show`; the briefing on the TV is `tv-briefing`. |
| `check-split-clues-content-3.log` | + that | 23/0 | |
| `check-split-clues-content-4.log` | + the host's lobby at 1440 px and both results screens, for screenshots | 27/0 | |
| (no log) | + the fixture's hash check (the approvals schema takes 16 hex characters; the driver first expected 64) and "no shipped approvals file, before and after" | not run locally | Run in the gates below. |
| `check-split-clues-content-5.log` | `a1032ad`'s tree | 30/0 | + the two checks on the TV's Next up line after the last approved puzzles are used. |

## The TV's Next up line (found in the full gate's screenshots)

- **What I saw:** the TV's final screen in the full gate on `ed70992` said "Next up: Split Clues · Official. The host starts it from the lobby." The fixture's six approved puzzles were used, so an Official start would be refused and the host's lobby says Practice only.
- **Cause:** the TV shows the host's stored plan (`POST /plan`). The lobby sends a plan only when the host picks, so it stayed Official.
- **Before the fix:** `plan-before.txt`: the new unit test on the unfixed `src/server/http.ts` fails (`"official": true` received, `false` expected).
- **Fix (`a1032ad`):** every projection shows such a plan as Practice; the stored plan and the start rules are unchanged.

## The answer matcher probe

`probe-match.mts.txt` and `probe-match.out.txt`: 24 plausible typed answers run through the real `answerMatches`. The inventory (`docs/stage12/stage1216-split-clues-inventory.md`) carries the same probe per puzzle, regenerated from the code each time.

## A pre-existing failure found by the full gate: `check-warm-ivory` W8

- **What failed:** the first full gate on `e822bbf` (`20261115-104054-e822bbfd-18847`) passed 106 of 107 steps. `check-warm-ivory` failed six W8 checks (Everyday lobby, guest lobby and menu, at 390 and 320 px), each "new 1, missing 1": `last-game-kicker>span.mz-kicker` new, `last-game-card>span.mz-kicker` missing, with the **same computed style** (text `rgb(247, 241, 232)`, transparent background).
- **Cause:** not Stage 12.16. `de26509` (Stage 12.15-R round 3, D-S1215R-06) gave the lobby's "Last game" kicker its own test id. W8 keys each element by its nearest test id, so the same span's key moved. 12.15-R's rounds 3 and 4 ran targeted and fast gates only (as the review asked), and `check-warm-ivory` wasn't in them, so no gate saw it until this full run.
- **Reproduced on #40's head:** `check-warm-ivory` on `8798e38` (`20261115-112145-8798e38e-6333`) FAILED with the same six checks.
- **Fix (`ed70992`, driver only):** the rename is listed in W8's intended changes for the lobby, guest lobby and menu screens. W8 still requires the new key to reuse a style the base build had on the same screen; nothing is skipped and no colour may change.
- **After the fix:** `check-warm-ivory` on `ed70992` (`20261115-112315-ed70992d-7090`) PASSED.

## Gates (one run on one revision each, every run listed)

| Run | Revision | Level | Verdict | Steps | Wall |
|---|---|---|---|---|---|
| `20261115-103318-3b1a2ef5-11023` | `3b1a2ef` | targeted (split-clues-content, split-clues, cup-team-games, official-practice, lifecycle, teams, tv-show, results, one-path, cup-party, quick-party, content-variety, themes-seasonal, lobby-mode, library, game-night-flow) | PASSED (exit 0) | 18/18; split-clues-content 28/0 | 5 min 44 s |
| `20261115-103925-e822bbfd-14895` | `e822bbf` | fast | PASSED (exit 0) | 5/5; unit 1989/1989 | 1 min 13 s |
| `20261115-104054-e822bbfd-18847` | `e822bbf` | full | **FAILED (exit 1)** | 106/107; `check-warm-ivory` W8 (above) | 40 min 25 s |
| `20261115-112145-8798e38e-6333` | `8798e38` (#40's head) | targeted (warm-ivory) | **FAILED (exit 1)**: the reproduction | 2/3 | 1 min 15 s |
| `20261115-112315-ed70992d-7090` | `ed70992` | targeted (warm-ivory) | PASSED (exit 0) | 3/3 | 1 min 14 s |
| `20261115-112446-ed70992d-7874` | `ed70992` | full | **PASSED (exit 0)** | 107/107; unit 1989/1989; split-clues-content 28/0; warm-ivory all passed | 40 min 27 s |
| `20261115-120948-a1032ad0-28437` | `a1032ad` | targeted (split-clues-content, split-clues, official-practice, lobby-mode, tv-show, one-path, cup-party, quick-party, game-night-flow, lifecycle, cup-team-games, teams, results) | PASSED (exit 0) | 15/15; split-clues-content 30/0 | 4 min 19 s |
| `20261115-121415-a1032ad0-31064` | `a1032ad` | full | **PASSED (exit 0)** | 107/107; unit 1990/1990; split-clues-content 30/0; warm-ivory all passed | 41 min 24 s |

Raw logs: `docs/evidence/gate-runs/<run>/`.

The screenshots in `docs/stage12/stage1216-screenshots/` come from `check-split-clues-content` in the full gate `20261115-121415-a1032ad0-31064` on `a1032ad` (Chromium emulation, not real devices).
