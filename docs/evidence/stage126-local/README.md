# Stage 12.6: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) typecheck, first run | the night card, uncommitted | **1 error** | The result line took a game whose `outcome` could be `null`. Now it's passed only the facts it reads. |
| (no log) `tests/stage126-night-card.test.ts`, first run | same | **6 pass, 2 FAIL** | **My test's expectations:** equal medals are ordered by name (the TV's rule), so Amina comes before Keku; and the Christmas title wraps onto two lines, which is allowed. |
| `check-night-card-n1.log` | + the web wiring, built | **21 pass, 1 FAIL** | **Driver mistake:** Amina's sheet was left open after sharing, covering the lobby's "Share the night card" button. |
| `check-night-card-n2.log` | + the driver closes it | **23 pass, 1 FAIL** | A Family Cup card left out a player on 0 points. |
| `check-night-card-n3.log` | + the driver prints the whole card text | **23 pass, 1 FAIL** | The text showed why: the card dropped zero totals. **Fixed:** the card lists everyone in the standings, as the TV does. |
| `check-night-card-n4.log` | + that fix | 24/0 | The screenshots showed a short night's card with an empty bottom half. |
| `check-night-card-n5.log` | + the body is measured first and drawn lower when the night is short; a unit test checks it starts lower and still ends above the footer | 24/0 | The committed screenshots come from this run. |
| `check-warm-ivory-n126w1.log` | same | **197 pass, 2 FAIL** | W8 flagged the new "Share the night" menu row (390 and 320). |
| `check-warm-ivory-n126w2.log` | + W8 allows `menu-night-card>` (each element must reuse a base style) | 199/0 | |
| (no log) the whole unit suite | same | 1815/1815 | Lint and both typechecks were clean too. |
| (gate, refused) targeted on `b5cba1b`, label `s126t1` | the first commit | **did not run** (exit 2, usage error) | I named a driver that doesn't exist ("memory-book"). The gate refused before building anything. Rerun with the right names (book-live, cup-memory). |
| (gate) targeted on `b5cba1b`, label `s126t2`, run `20261114-090809-b5cba1b7-27066` | the commit | **PASSED** (exit 0), 14/14 | night-card, warm-ivory, tv-moments, one-path, session-flow, family-questions, cup-party, quick-party, briefing, book-live, cup-memory, themes-seasonal. |
| (gate) fast on `b5cba1b`, run `20261114-091244-b5cba1b7-29768` | same | **PASSED** (exit 0), 5/5 | Unit suite 1815/1815. |
| (gate) **full (checkpoint)** on `b5cba1b`, run `20261114-091352-b5cba1b7-1008` | same | **PASSED** (exit 0), 96/96 | 35 min 24 s, no retries. |
