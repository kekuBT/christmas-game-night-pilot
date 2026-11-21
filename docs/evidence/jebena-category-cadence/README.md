# Jebena Rush: categories change during streaks of accepted answers (handoff 7057753827, D-JR-01)

- **The handoff:** [7057753827](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7057753827), acknowledged in [7057757959](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7057757959). The decision is D-JR-01 in `docs/DECISIONS.md`.
- **Base:** `af79b6781f860c52081f3c8485a675f759cdac94` (#60's head).
- **The tested SHA:** `c041146e59b12c03b9016c68fbd354e19aa9f8ec`.
  - It contains the fix commit `d75c7f9`, plus one fix to the new browser check's loop bound (below).
  - This folder was added afterwards, in a docs-only commit.
- **Data:** synthetic, local only. Phones are emulated in headless Chromium. Paths are redacted.

## The report and the cause
- **The report:** Keku said categories feel stuck through successful turns.
- **The cause on `af79b67`:** the server (`src/games/modules/jebena.ts`) changed the category only on a timeout (`expirePhase`) or when a category's bank was used up. Every bank holds 40 or more answers, so sustained correct play never left the first category.
- **On the base:**
  - the new seeded test played **16 accepted answers, all in `jr-vegetables`**;
  - the browser check played **14 accepted answers, all in Fruits**, with "Category 1" on the TV (`before/`).

## The cadence (D-JR-01, rules version 2)
- **The length:** each category lasts a **seeded 5 to 8 accepted answers** (`JEBENA_STREAK`).
  - The length comes from `jebenaStreakLength(seed, categoryRound)`, using the match's server-owned seed.
  - It is set when the category starts and **saved in the state** (`streak: { accepted, changeAfter }`).
  - So every client sees the same category, and a restart resumes the same count.
- **The change:** it comes **at the turn boundary, with the pass**, as the next category in the existing seeded rotation.
  - It is logged for the turn that starts with it, so both phones say "Category · new!" for that turn.
  - A streak never ends the match: if no other category has answers left, the current one stays.
- **What counts:** only an accepted answer. A rejected try (not in the bank, empty, already used), an out-of-turn or stale send, a duplicate event and a reconnect change neither the category nor the count.
- **Unchanged:**
  - timeouts (one cup, then a new category) and used-up banks; both now restart the count;
  - used answers, cups, the turn clock (a full turn after every pass) and points;
  - the unused bank stays private, and the count and length are never shown to players.
- **Public log:** category entries now carry a reason: `start`, `streak`, `timeout` or `used-up`.
- **A match saved under rules version 1** keeps version 1, with no streak changes.
- **Copy:**
  - the briefing says "After a run of 5 to 8 right answers, a new category starts. Time runs out: one of your cups breaks, and a new category starts too.";
  - the library details say the same;
  - the stage 9.1 spec is amended.

## Tests
### Engine: `tests/jebena-category-cadence.test.ts` (11 tests)
| Test | On `af79b67` | On the fix |
|---|---|---|
| Sustained correct play changes the category within 8 accepted answers, and again | **FAIL** (16 answers, one category) | pass |
| Bounded and seeded: 5 to 8 every time; the same seed gives the same schedule; other seeds differ | **FAIL** | pass |
| Only accepted answers count (not-in-bank, empty, used, out-of-turn, stale) | **FAIL** | pass |
| A timeout still costs a cup and changes the category; the count starts again | **FAIL** | pass |
| A used-up bank changes the category (reason `used-up`); a streak never ends the match | **FAIL** | pass |
| A match saved under rules version 1 keeps version 1 | pass | pass |
| Restart mid-streak (`RoomEngine` `toJSON`/`fromJSON`): the same category, count and next change as a room that never stopped | **FAIL** | pass |
| A duplicate send and a reconnect's read change nothing; every player projection and the TV agree, before and after a change | **FAIL** | pass |
| The turn after a streak's change gets the same full turn as after any other pass | **FAIL** | pass |
| Privacy: no view carries unused answers or the count | pass | pass |
| The reported 120-0 under the existing points | pass | pass |

- **Logs:** `base-af79b67-cadence-tests.log` (8 failed, 3 passed) and `fix-c041146-cadence-tests.log` (11/11).
- **The existing Jebena tests still pass:** all 69 in `stage91-jebena`, `-endings`, `-sockets` and `stage92-jebena-terminal`.

### Browser: `scripts/check-jebena-categories.mjs` (two phones and a TV, the real UI)
**The setup:**
- Keku plays at 390 px in the Everyday look, Amina at 320 px in the Christmas look, and a TV spectator watches at 1440 px.
- The holder types a fresh answer and presses Enter. No turn runs out.

**What it checks:**
- **S1:** at every turn, both phones (by id) and the TV (by name) show the server's category.
- **S2:**
  - every change is a `streak` change, never a timeout;
  - each comes after 5 to 8 answers;
  - two changes happen.
- **S3:** "Category · new!" appears on both phones for the turn a change starts, and plain "Category" mid-streak.
  - The check reads the kicker's DOM text: CSS shows it in capitals, so a first draft of the check could not match it.
- **S4:** a rejected try and a reload of Amina's phone mid-streak change nothing.

| Run | Result | Log |
|---|---|---|
| `af79b67` (base, its own worktree and build) | **FAIL**: rules version 1, and **0 changes in 14 accepted answers** (Fruits throughout) | `base-af79b67-check-jebena-categories.log` |
| Development build of the fix, 4 runs | 4/4 pass; streak lengths [6,7], [8,7], [5,5], [7,8] | `dev-runs/` |
| `c041146` in the targeted and full gates | pass | see Gates |

**The existing `check-jebena-rush`** passed 226/226 on the development build (`dev-check-jebena-rush.log`), and in both gates below.

## The reported 120-0 (no scoring change)
**The existing rule:** 100 points for each player you outlast, plus 10 for each cup still whole while you are in. Accepted answers are counted, but earn no points.

**One concrete two-player example** (a unit test; 5 cups each, turns alternating, B first):

| Player | Accepted answers | Timeouts | Cups left | Outlasted | Points |
|---|---|---|---|---|---|
| A (winner) | 10 | 3 | 2 | B | 1 × 100 + 2 × 10 = **120** |
| B | 9 | 5 | 0 (out) | nobody | **0** |

- **The score follows the rule exactly.** In a two-player match the player who goes out always scores 0, however many answers they named. The results row shows "Out: every cup broken · 9 answers · 5 timeouts" next to 0, with the rule's one-line explanation.
- **The finding, for a separate decision:** the rule is consistent, but it ignores answers. A close match can read as a rout. Options, not implemented here:
  1. keep the rule;
  2. add points per accepted answer;
  3. show answers more prominently on the results screen.

## Gates on `c041146` (each verdict belongs to its own run)
| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted on `d75c7f9` (the first commit): `jebena-categories`, `jebena-rush`, `briefing`, `tv-show`, `tv-spectator`, `one-path` | **`FAILED (exit 1)`**, 7/8 | `20261121-052354-d75c7f95-25779` | `gate-d75c7f9-targeted-FAILED.txt`, `gate-d75c7f9-targeted-check-jebena-categories-FAILED.log` |
| Targeted on `c041146`, the same six drivers | **`PASSED (exit 0)`**, 8/8 | `20261121-052712-c041146e-27483` | `gate-c041146-targeted.txt`, `gate-c041146-targeted-check-jebena-categories.log` |
| **Full** on `c041146`: typecheck, lint, unit tests, build, every driver and E2E | **`PASSED (exit 0)`**, 121/121 | `20261121-052942-c041146e-28573` | `gate-c041146-full.txt`, `gate-c041146-full-check-jebena-categories.log` |

**Why the run on `d75c7f9` failed:** the new check stopped after 14 accepted answers. Two streaks of up to 8 answers each can need 16, and that run's first streak was 8, so the second change had no room ("changes 1, gaps [8]"). `c041146` allows 2 × 8 + 1 answers. The engine is the same in both commits.

## Screenshots
**`before/`, on `af79b67`:** 14 accepted answers, all in Fruits.
- `jrc-end-390-everyday.png`: 14 named answers under one category.
- `jrc-end-tv.png`: "Category 1 · Fruits".
- `jrc-before-change-*`: the same game earlier.

**`after/`, on the fix:**
- `jrc-before-change-390-everyday.png`, `jrc-before-change-tv.png`: mid-streak.
- `jrc-after-change-390-everyday.png`, `jrc-after-change-320-christmas.png`: the turn after a streak, showing "Category · new!" with the new category.
- `jrc-after-change-tv.png`: "Category 2 · Jobs", right after an Africa answer.

## Limitations
- **Chromium emulation only.** Native iPhone verification stays open for a device.
- **The cadence is a provisional default.** 5 to 8 accepted answers, seeded per category, is configurable in code (`JEBENA_STREAK`) and documented in D-JR-01.
- **The 120-0 scoring question** is left for a separate decision.
- **The broader redesign** stays with the owner-selected options.

## Follow-up: the last-play line after a change (review 7058749487)
The review found that, right after a change, the last-play line did not say which category the answer was named in. The repair (D-JR-02), its negative control, the gates on `72a4b8a` and the screenshots are in [`last-play-context/`](last-play-context/README.md).
