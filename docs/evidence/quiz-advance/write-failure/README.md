# A later failed write never hides the newer Stay choice: repair evidence (review 7042658020)

- **The review:** [7042658020](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7042658020), a P2 finding on `cfef39f`. Acknowledged in [7042671799](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7042671799). The fix is recorded under D-AA-01 in `docs/DECISIONS.md`.
- **Draft PR:** #57.
- **The repair commit, and the tested SHA:** `b8ba545c7e3c165c3e69bd9f6ce3c561e4ab5d56`. This folder was added afterwards, in a docs-only commit.
- **Synthetic local data only.** Chromium emulation, not real phones.

## The defect, and the fix
- **The defect:** once an earlier game's Stay record was stored, a later failing write (a full quota) put the new choice in memory, but reads still preferred the older stored record. So the next game's Stay did nothing, and the countdown ran on.
- **The fix:** `createStayStorage` in `apps/web/src/components/mchezo/stayPreference.ts`.
  - After the first failed write, the page's store latches into memory mode, and every read comes from memory, which holds the newest value.
  - The stale persistent copy is removed where possible, so a reload cannot bring back an older choice instead.
  - Later writes are still tried on storage, so when it is writable again the newest value is persisted.
  - Removing (clear, a seat or room switch) acts on both copies.
  - Seat, room and game isolation and the cleanup on sign-out or leaving a solo round are unchanged.

## The app-level regression: `check-quiz-advance` section P8
**The setup:**
- The page's own `Storage.prototype.setItem` throws `QuotaExceededError` for the Stay record while `window.__failStay` is set.
- The first game's Stay is stored normally (a precondition check).
- That game finishes, and a second game starts.
- Writes then fail: a precondition check confirms at least one failed write.

| P8 check | `cfef39f` (negative control) | `b8ba545` |
|---|---|---|
| Choosing Stay in the second game takes effect at once (stayed status, no countdown) | **FAIL** `{"paused":0,"counting":1}` | PASS |
| Q2: stayed status, no countdown | **FAIL** (`Next question in 4 s`) | PASS |
| Q2: still locked 7 s later | **FAIL** (moved itself to question 3) | PASS |
| Q3, after the TV stage and back: stayed status, no countdown | **FAIL** | PASS |
| Q3: still locked 7 s later | **FAIL** (moved itself to question 4) | PASS |
| The stale persistent record is gone, so a reload can't bring back the older choice | **FAIL** (the game-1 record still stored) | PASS |

- **Before:** `before-cfef39f-section-P.log`, from its own worktree and web build: **6 FAIL**, 31 PASS. P1–P7 pass there, as the earlier repair intended.
- **After, development build:** `after-dev-all-sections.log`. The whole driver passes 98/98 in 253 s.
- **After, in the gate:** `after-gate-b8ba545-targeted-check-quiz-advance.log`, and the full gate below.
- **Unit tests:** 6 more in `stayPreference.test.ts`, covering the reviewer's cases.
  - A first write that works, then a later failed write with the old record still readable: the next game's Stay is true at once.
  - The newer choice survives a remount (a new reader of the same page store), and the stale persistent copy is removed.
  - Clear and seat/room switches don't resurrect the fallback.
  - When storage is writable again, the newest value stays authoritative and is persisted; a fresh store over the same storage, as after a reload, reads it.
  - If even removing fails, this page still reads the newest choice.
  - Storage unavailable from the start keeps choices in memory.
- **Also in this driver edit:** section P reads the countdown text without Playwright's 30 s wait when it is absent, so section P takes about 100 s instead of about 390 s.

## The gates on `b8ba545`
Each verdict belongs to its own run.

| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `quiz-advance`, `locked-answer`, `math`, `warm-ivory`, `solo`, `solo-rules`, `answer-race`, `mchezo`, `tv-lifecycle` | **`PASSED (exit 0)`**, 11/11 | `20261120-150740-b8ba545c-31691` | `gate-b8ba545-targeted.txt` |
| **Full**: typecheck, lint, unit tests, build and every driver | **`PASSED (exit 0)`**, 117/117 (`check-quiz-advance` 98 checks in 253.6 s) | `20261120-151444-b8ba545c-1295` | `gate-b8ba545-full.txt`, `after-gate-b8ba545-full-check-quiz-advance.log` |

## Screenshots
- **`before/stay-after-write-failure-trivia-320x568.png` (`cfef39f`):** at the end of P8, the phone had moved itself on to question 4.
- **`after/stay-after-write-failure-trivia-320x568.png` (`b8ba545`):** question 3's locked view with the stayed status and no countdown.

## Limitations
- **After a failed write, a reload loses the newest choice.** The record lives in memory, and its stale persistent copy has been removed. This is the documented trade-off for storage that can't be written.
- Chromium emulation with synthetic data only. The private Codespace audit (owner-deferred), native-device and real screen-reader checks remain open.
- The 4 s reading time and 450 ms guard remain provisional defaults.
