# The Stay choice lasts for the game: repair evidence (review 7040842858)

- **The review:** [7040842858](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7040842858), a P2 finding on `9f7ed98`: "Stay on this screen" silently reset on a reload. It was acknowledged in [7040856655](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7040856655). The fix is recorded under D-AA-01 in `docs/DECISIONS.md`.
- **Draft PR:** #57.
- **The repair commit, and the tested SHA:** `cfef39f8f3fa361ebf0ea19e472c9ce2a2e0a873`. This folder was added afterwards, in a docs-only commit.
- **Synthetic local data only.** Chromium emulation, not real phones or a real screen reader.

## What changed
- **One shared helper**, `apps/web/src/components/mchezo/stayPreference.ts` (`useStayPreference`), replaces the component-local state in Trivia and Math.
- **What it keeps:** one small sessionStorage record per tab, `{ v: 1, scope: "room:<id>" | "solo:<id>", seat: "<playerId>", games: { "<gameId>": savedAt } }`. It holds ids and times only.
- **What stops it leaking or lingering:**
  - another seat or room never inherits it (a read for a different scope removes the stale record);
  - it keeps at most 8 games, each for at most 12 hours;
  - signing out of a seat, or leaving a solo round, clears it.
- **Without storage:** memory keeps it for the life of the page.
- **New games:** a new game or Play again counts down as before.

## The regression: `scripts/check-quiz-advance.mjs` section P
| Check | `9f7ed98` (negative control) | `cfef39f` |
|---|---|---|
| P1 room Trivia: Stay, move on, reload, answer: stayed status, no countdown, still locked 7 s later | **FAIL** (countdown back: "Next question in 4 s"; moved itself to question 4) | PASS |
| P2 the TV stage and back (remount), answer: the same | **FAIL** (moved itself to question 5) | PASS |
| P3 a new game in the same room counts down again | PASS | PASS |
| P4 a seat in another room with colliding ids (player-1, game-1) counts down; the record names no other seat and holds no answers, names or tokens | PASS | PASS |
| P5 room Math: Stay, move on, reload, answer: the same, and question 4 is not opened | **FAIL** (moved itself to question 4, and opened it) | PASS |
| P6 solo Math: a reload lands on the instructions (its contract); the new round counts down | PASS | PASS |
| P7 sessionStorage throws: join by code; Stay holds through the TV stage and back (memory fallback) | **FAIL** (moved itself to question 4) | PASS |

- **Before:** `before-9f7ed98-section-P.log`, from its own worktree and web build: **9 FAIL**, 18 PASS.
- **After, development build:** `after-dev-all-sections.log`. The whole driver passes 88/88 (S, R and M 61, plus P 27).
- **After, in the gate on `cfef39f`:** `after-gate-cfef39f-targeted-check-quiz-advance.log`, and the full gate below.
- **Unit tests:** `apps/web/src/components/mchezo/stayPreference.test.ts`, 10 tests. They cover the record's shape, reading back, new games, isolation and stale-record removal, replacement for a new seat, bounded retention, malformed records, throwing storage and the memory fallback.

## The gates on `cfef39f`
Each verdict belongs to its own run.

| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `quiz-advance`, `locked-answer`, `math`, `warm-ivory`, `solo`, `solo-rules`, `answer-race`, `mchezo`, `tv-lifecycle` | **`PASSED (exit 0)`**, 11/11 | `20261120-135457-cfef39f8-1548` | `gate-cfef39f-targeted.txt` |
| **Full**: typecheck, lint, unit tests, build and every driver | **`PASSED (exit 0)`**, 117/117 (`check-quiz-advance` 88 checks in 404.8 s, within its 600 s limit) | `20261120-140403-cfef39f8-3608` | `gate-cfef39f-full.txt`, `after-gate-cfef39f-full-check-quiz-advance.log` |

## Screenshots
- **`before/stay-after-reload-trivia-320x568.png` (`9f7ed98`):** taken 7 s after the post-reload answer, by when the phone had moved itself on to question 4.
- **`after/stay-after-reload-trivia-320x568.png` (`cfef39f`):** question 3's locked view with "Staying on this screen: questions won't move on by themselves for the rest of this game", and no countdown.
- **Math:** the same pair as `stay-after-reload-math-320x568.png`.

## Limitations
- **Without storage, a reload can't keep the choice.** When sessionStorage is unavailable, the choice survives remounts but not a reload; without storage the app keeps no seat across a reload either. This is the existing contract in `apps/web/src/session.ts`.
- **Solo:** a reload starts a new round by design (D-SR-01), so the choice isn't carried into it.
- **A known driver inefficiency, found while reading the timings:**
  - Section P's detail line reads the countdown text with Playwright's `textContent()`. When no countdown exists, which is the expected case, that waits its default 30 s before giving up, so each P step takes about 30 s longer than needed.
  - The checks are unaffected, and the step stays within its 600 s limit.
  - The one-line fix (read it with `page.evaluate`) was not applied, so as not to change the tree under the running full gate. It is queued for the next driver change.
- The private Codespace audit (owner-deferred), native-device and real screen-reader checks remain open.
