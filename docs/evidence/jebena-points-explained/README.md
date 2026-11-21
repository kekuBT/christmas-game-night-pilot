# Jebena Rush: the results explain each total (handoff 7059278886, D-JR-04)

- **The handoff:** [7059278886](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7059278886), acknowledged in [7059284532](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7059284532).
- **Base:** `07d113651662e0078cb3317e8cdcf045089006d8` (#61's head).
- **The tested SHA:** `2c9394db709849679652e40efd00cca36638d031`. It is four commits on `07d1136`:
  - `2a7754e`: the change (server, results, styles, tests and driver P);
  - `3ea3bb0`: the driver's room Q (the verified 120–0 in browsers) and an early exit;
  - `c30d95e`: the driver reads the rows without waiting, and checks the TV's post-game review;
  - `2c9394d`: a tie at the room's match limit, and an early exit through a room.
- This folder was added afterwards, in a docs-only commit.
- **Data:** synthetic, local only. Paths are redacted.

## What a player saw on `07d1136`
A results row showed a total next to "N answers · N timeouts", and nothing said how the total was made.
- **The verified example:** Tumaini scored 120 with 10 answers. Nia scored 0 with 9 answers.
- **The rule** (D-S91-04, unchanged): 100 points for each player you outlast, plus 10 for every cup still whole. Right answers keep you in the game; they don't add points.

So 120 = 100 for outlasting one player + 20 for two whole cups. Nia's 9 answers kept her in for 14 turns, but she outlasted nobody and finished with no whole cups: 0.

## The change (`2a7754e`)
- **Server:** `jebenaStandings` adds `outlasted` to each row: the players out before this one. It comes from the same helper (`outlastedBy`) that `jebenaPoints` uses, so the parts and the total cannot drift apart.
  - The rule, totals, places, `rawScores`, replay and the casual/practice wording are unchanged.
  - `outlasted` is a public fact, like `place`, `hearts` and `points`. It is shown to every audience.
- **Results:** one shared standings list serves the phone results, the TV's final standings and the TV's post-game review. Each row now shows:
  - the total, unchanged, on the right;
  - **how it was earned:** "Outlasted 1 player (100) + 2 whole cups (20) = 120";
  - **how the player played, apart:** "Played: 9 answers · 5 timeouts".
- **When the parts can't be trusted** (an older server sent none, or they don't add up to the total), the row shows the total and the played line only. It never shows an explanation that doesn't add up.
- **The footer** adds "Right answers keep you in the game; they don't add points." before the casual or practice label.
- **On the TV,** each row keeps two lines: name and cups on the left, points and played on the right. So the standings still fit the stage without scrolling.
- **Files:**
  - `src/games/modules/jebena.ts`;
  - `apps/web/src/ui/mchezo/lib/jebena.ts`;
  - `apps/web/src/components/mchezo/MchezoJebena.tsx`;
  - `apps/web/src/ui/mchezo/styles/stage91.css`.

## Tests
### Server and copy: `tests/jebena-points-explained.test.ts` (10 tests)
| Test | On `07d1136` | On `2c9394d` |
|---|---|---|
| The verified 120–0 in the module, move by move: rows `[winner 1st, 2 cups, 10 answers, 3 timeouts, outlasted 1, 120]` and `[loser 2nd, out, 9 answers, 5 timeouts, outlasted 0, 0]` | **FAIL** | pass |
| A tie: two players still in with 3 cups share first place, 130 each; the limit's `onFinish` and `scores()` agree | **FAIL** | pass |
| An early exit (abstain): 230, 100, and 0 for the one who left | **FAIL** | pass |
| 120 seeded matches with random play (2–6 players, 3/5/7 cups, leavers): the parts make every total at every step | **FAIL** | pass |
| **Through a real room:** the 120–0; the TV's and both seats' standings explain 120 and 0, and `rawScores` are `{120, 0}` | **FAIL** at the parts; `rawScores` already matched | pass |
| **Through a real room:** a tie at the room's match limit (`outcome.reason` `deadline`); `rawScores` 130, 130, 0 | **FAIL** at the parts; `rawScores` already matched | pass |
| **Through a real room:** an early exit (an abstain intent); `rawScores` 230, 100, 0 | **FAIL** at the parts; `rawScores` already matched | pass |
| The copy: the rule's numbers; singular and plural; an older server or a mismatch gives no explanation | **FAIL** (3 tests) | pass |

On the base, the three room tests get past their `rawScores` checks and fail only where the parts are read. The base already had these totals; the change explains them and does not alter them.

### Rendered: `apps/web/src/components/mchezo/JebenaPoints.test.tsx` (7 tests)
These render the real phone results (`MchezoJebenaResults`) and TV final standings (`JebenaTvFinal`) to markup:

| Test | On `07d1136` | On `2c9394d` |
|---|---|---|
| Phone and TV: the 120–0, row by row (points, breakdown, played) | **FAIL** | pass |
| Phone and TV: a tie and an early exit ("Left the game") | **FAIL** | pass |
| Phone and TV: an older server's standings (no parts): total and played line, no breakdown | **FAIL** | pass |
| Phone: the footer, with "Practice game: no Cup points." kept | **FAIL** | pass |

**Logs:**
- `base-07d1136-points-tests.log`: 17 of 17 fail.
- `fix-2c9394d-focused-tests.log`: 19 files, **227/227** on the clean SHA. They cover the new tests, every Jebena suite, cups, moments, bank privacy, standings, TV final and medals, and Memory Book saves.

### Browser: `scripts/check-jebena-rush.mjs`
| Section | What it checks |
|---|---|
| **P** (main room, 3 players) | Every row on all three phones, the TV's final standings and the TV's post-game review equals the server's standings: points, breakdown and played line. The parts make each total and the room's score. The footer is checked, and Keku's results at 320 px Everyday with no sideways scroll. |
| **P** (room Z's replay) | An early exit: the one who left shows "Left the game" and 0, explained. The one who stayed is explained on both phones (390 px and 320 px). |
| **Q** (a room of its own, 5 cups) | **The verified 120–0, played turn by turn.** The server's rows and `rawScores` (120 and 0) are checked, then the rows on the winner's phone (390 px Everyday), the loser's (320 px Christmas, no sideways scroll) and a TV (1440 px). |

**The same driver on both checkouts** (it is unchanged from `c30d95e` to `2c9394d`):
- **`07d1136`** (`base-07d1136-check-jebena-rush.log`): **16 FAILED, exit 1.** Exactly the P and Q checks fail; the other 231 pass.
  - Room Q played the same 120–0 there: `[["player-2",1,2,false,10,3,null,120],["player-1",2,0,true,9,5,null,0]]`, with `rawScores` `{"player-1":0,"player-2":120}`. Only `outlasted` (`null`) is missing.
- **`2c9394d`:** passes in the gates below.

## Screenshots
`before/` is from `07d1136` and `after/` from the targeted gate's run on `2c9394d`. Both were taken by the same driver.

| Screen | Before | After |
|---|---|---|
| The 120–0, the loser's phone (320 px, Christmas) | `before/jr-results-120-0-320-christmas.png` | `after/jr-results-120-0-320-christmas.png` |
| The 120–0, the winner's phone (390 px, Everyday) | `before/jr-results-120-0-390.png` | `after/jr-results-120-0-390.png` |
| The 120–0, the TV's final standings (1440 px) | `before/jr-tv-final-120-0-1440.png` | `after/jr-tv-final-120-0-1440.png` |
| An early exit, the one who stayed (320 px, Christmas) | `before/jr-results-left-early-320-christmas.png` | `after/jr-results-left-early-320-christmas.png` |
| Three players, Keku (320 px, Everyday) | `before/jr-results-320-everyday.png` | `after/jr-results-320-everyday.png` |
| Three players, the TV's post-game review (1440 px) | `before/jr-tv-review-1440.png` | `after/jr-tv-review-1440.png` |

## Gates on `2c9394d` (each verdict belongs to its own run; the tree was clean)
| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `jebena-rush`, `jebena-categories`, `briefing`, `tv-show`, `tv-spectator`, `one-path`, `f5` | **`PASSED (exit 0)`**, 9/9 | `20261121-081017-2c9394db-19670` | `gate-2c9394d-targeted.txt`, `gate-2c9394d-targeted-check-jebena-rush.log` |
| **Full:** typecheck (server, web), lint, unit tests (178 files, 2213 tests), build, every browser driver and E2E | **`PASSED (exit 0)`**, 121/121 | `20261121-081758-2c9394db-21096` | `gate-2c9394d-full.txt` |

- Both reports record head `2c9394db709849679652e40efd00cca36638d031` with an empty dirty list.
- `check-jebena-rush` printed ALL PASS in both runs: 248 passing checks in the targeted run and 247 in the full run. The difference is one section E check that depends on which timeouts the driver's loop happens to watch. Every P and Q check passed in both.

**Earlier runs, each for its own revision only:**
- `20261121-074445-2a7754e0-13556` on `2a7754e`: **INFRASTRUCTURE ERROR (exit 2)**. I left the browser path variable unset, so no browser check ran.
- `20261121-074500-2a7754e0-13666` on `2a7754e`: targeted **`PASSED (exit 0)`** 9/9. This was before the browser 120–0 was added.
- `20261121-080701-c30d95ec-17578` on `c30d95e`: targeted, **stopped by me** after 51 s to add the room-level tie and early-exit tests. Three steps were CANCELLED, so it gives no verdict.

## Limitations
- **The tie is not played in a browser.** A two-way tie needs the room's 12-minute match limit, or a test seam on the deadline. It is covered through a real room (the seam used by `stage92-jebena-terminal`) and in the rendered phone and TV markup.
- **Chromium emulation only.** Native iPhone verification stays open, and so do the deferred private Codespace audits.
- **No change to the scoring rule.** Any such change stays a separate owner decision.
- **Still open:** the broader redesign (owner-selected options) and Draw & Guess native iPhone confirmation.
