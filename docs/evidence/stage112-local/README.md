# Stage 11.2: local runs (outside the gate), in order

These are every local run made while building Stage 11.2, failures included. They were made in a worktree on this branch, with the drivers run directly (`node scripts/<driver>.mjs`) against Chromium headless shell. Gate runs are separate, in `docs/evidence/gate-runs/<run id>/`. Times are New York time (EST).

**What "pass/fail" counts:** the driver's own `PASS`/`FAIL` lines.

**A local pass is not a gate verdict.** It only says what that one run on that tree did.

## Implementation, before the first commit (`f1c9683`/`9e85bd5`)
| Log | Time | Result | What it shows |
|---|---|---|---|
| `check-cup-memory-run1.log` | 6:09 a.m. | 40 pass, 0 fail | A Cup note added on Day 2 about the Day 1 game is filed under Day 1. Its badge says "Day 1 · approved". The Cup Markdown has days and names, no ids. |
| `check-book-live-run1.log` | 6:10 a.m. | 53 pass, **1 fail** (R2) | **A driver mistake:** R2 looked for `Second approved note (Math Mayhem)` in the PDF bytes, but PDF strings escape parentheses, so the bytes read `\(Math Mayhem\)`. The product was right; the match was fixed in the driver. |
| `check-book-live-run2.log` | 6:11 a.m. | 54 pass, 0 fail | R1–R3: a casual book with no "Day" on screen, in the PDF or in the Markdown; no ids; badges name the game. |
| `unit.log` | 6:13 a.m. | 1734 tests in 135 files, all passed | The whole unit suite. Typecheck and lint exit 0. |

## After targeted gate 1 (`20261113-111520-9e85bd5f-5011`, FAILED) found two problems
Gate 1 failed two checks. Both are in its own evidence folder, and both were reproduced and fixed here.
1. **check-spectrum M3:** a Spectrum team line exported as `\(fewer than two players were left\)`. The Markdown escaper also escaped `( ) !`, which the spec doesn't list. Fixed in `6cae259`, with a unit test.
2. **check-warm-ivory W8 (Everyday memory-320/390):** the badge's computed colours were byte-identical to the d4dc408 baseline. But W8 keys each element by its nearest `data-testid`, and the new `memory-entry-badge` test id renamed the key. Fixed in `6022bfa` by dropping the test id; the baseline was not re-recorded.

| Log | Time | Result | What it shows |
|---|---|---|---|
| `unit-fix.log` | 6:20 a.m. | 1735 tests, all passed; typecheck 0; lint 0 | After the escaper fix. |
| `check-spectrum-fix-run1.log` | 6:23 a.m. | 199 pass, 0 fail | M3 passes: the early-ending line exports as written. |
| `check-warm-ivory-fix-run1.log` | 6:25 a.m. | 197 pass, **2 fail** (W8) | **My mistake:** this ran against a stale web bundle. `npm run build` is `tsc` only; the web build is `npm run build:web`. The bundle still had the test id, so this run proves nothing about the fix. |
| `check-book-live-fix-run1.log`, `check-cup-memory-fix-run1.log` | 6:26 a.m. | 54 / 40 pass | The same stale bundle. Recorded for completeness. |
| `check-warm-ivory-fix-run2.log` | 6:28 a.m. | 198 pass, **1 fail** (W6) | On a fresh bundle, W8 passes. **W6 failed:** a game in progress read no question counter before or after the look switch (`["christmas",null]`). That's a race in the driver; see the next section. |
| `check-book-live-fix-run2.log`, `check-cup-memory-fix-run2.log` | 6:29 a.m. | 54 / 40 pass | The fresh bundle; the drivers read the badge by class. |

## The W6 race (fixed in `015464c`)
**The race:** W6, written in Stage 11.1, clicked "Next question" only if `isVisible({ timeout: 3000 })` saw it. Playwright 1.64's own type docs say that timeout is "deprecated… ignored": `isVisible` does not wait. So the click happened only if the server had already confirmed the answer at that instant.

**The failure:** if the confirmation landed during the following 500 ms sleep, W6 read the locked view, which has no "Question N of M".

| Log | Delay on the answer reply | Result |
|---|---|---|
| `w6-repro-old.log` (HEAD driver) | 1500 ms | 199 pass. **Not reproduced:** the reply came after the read, so the page still showed question 1 |
| `w6-repro-new.log` (fixed driver) | 1500 ms | 199 pass |
| `w6-repro250-old.log` (HEAD driver) | 250 ms, inside the 500 ms sleep | **1 fail, W6 `{"before":["christmas",null],"after":["everyday",null]}`**: exactly the earlier signature |
| `w6-repro250-new.log` (fixed driver) | 250 ms | 199 pass, "Question 2 of 10" before and after |

The delay was a temporary `page.route` on `/intents`, added to throwaway copies of the driver and then deleted. It isn't in the repository.

## Names in other scripts in the PDF (fixed in `9d19970`, D-S112-04)
**The defect:** probing jsPDF 4.2.1 directly (`pdf-chars.mjs`, `pdf-unicode.mjs`, both here) showed the following.
- Windows-1252 characters print, including curly quotes, dashes, €, Š, Œ, … and •.
- Any other character (Ł, Ş, Greek, Cyrillic, CJK, emoji) makes jsPDF write its whole line as two-byte text the built-in font can't read.

**Why it matters now:** names reach the PDF in this stage, so a player named 李雷 would have had their fact lines printed wrongly.

| Log | Build | Result |
|---|---|---|
| `unit-pdf.log` | the fix | 1739 tests, all passed |
| `check-book-live-r4-run1.log` | the fix (`9d19970` tree) | 57 pass, 0 fail. R4 (a room of 李雷, 王芳, Łukasz): no two-byte text, "??" / "?? (2)" / "?ukasz", the closing note, and full names in the Markdown |
| `check-book-live-r4-oldweb.log` | the same driver and server, with `MCHEZO_WEB_DIST` set to gate 1's web bundle (built from `9e85bd5`, old PDF code) | 55 pass, **2 fail (R4)**. The failure detail holds the raw two-byte text, so this log contains NUL bytes |

## Before/after captures
- **`capture-112.mjs`:** the script that made `docs/stage11/stage112-screenshots/` and `docs/stage11/stage112-examples/`. It runs with its working directory set to a built worktree: `node capture-112.mjs <outdir> <before|after>`.
- **`capture-after.log`:** its output for the final "after" run on the `adf6e8d` build.

## Older Cup entries take their day from the room's citation (fixed in `4c05450`/`adf6e8d`, D-S112-05)
ChatGPT's spec feedback 6851031292 on PR #24 (posted 6:06 a.m. ET, while the implementation was under way) asked for this. I read it only at about 6:50 a.m. ET, after the gates on `9d19970` had started. The full run on `9d19970` was then cancelled (`docs/evidence/gate-runs/20261113-114827-9d19970e-26589/`).

| Log | Result | What it shows |
|---|---|---|
| `legacy-rule-on-head.log` | **3 fail**, 21 pass | The new tests run against HEAD's `memoryPresent.ts` (the previous rule). The three legacy-day tests fail. The forged-presentation test passes, because that protection already held. |
| `unit-legacy.log` | 1744 tests, all passed; typecheck 0; lint 0 | The new rule. |
| `check-cup-memory-legacy-run1.log` | 40 pass, then **a crash** | **A driver mistake:** a projection named `server` in the same block shadowed the server process handle (`server.child` was undefined). Renamed it `serverProc`. |
| `check-cup-memory-legacy-run2.log` | 44 pass, 0 fail | The restored older note: stored day 2 unchanged, badge "Day 1 · approved", PDF "(Day 1)", Markdown "## Day 1". |
| `check-cup-memory-legacy-oldweb.log` | 42 pass, **2 fail** | The same driver and server, with `MCHEZO_WEB_DIST` set to gate 3's web bundle (built from `9d19970`). Badge "Day 2 · approved" and the PDF's "(Day 2)" fail. The Markdown, made by this tree's server, passes. |
| `check-book-live-legacy-run1.log` | 57 pass, 0 fail | No regression in the casual book. |
