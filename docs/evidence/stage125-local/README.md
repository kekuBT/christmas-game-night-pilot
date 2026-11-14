# Stage 12.5: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

**How they ran:**
- **Drivers:** `local-driver.sh` (copied here) starts a fresh server on the worktree's built web app, like the gate. Then it runs one driver.
- **Unit tests:** `npx vitest run`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) `tests/stage125-family.test.ts`, first run | the server change, uncommitted | **10 pass, 2 FAIL** | **My test's mistakes:** it moved the clock 60 s, which ran through two phases, and it used a roster list where a player who stepped out had to be left out. It now runs the clock to each phase's deadline, and uses "proceed without". |
| (no log) the whole unit suite, first run | same | **1791 pass, 14 FAIL** | **Expected from adding a 17th game:** catalogue counts and lists, the cover table, a manifest value (sitting out is per question), and the practice-only wording. Also, the briefing secrecy test now writes questions first, because the game can't start without them. All were updated; 1805/1805 after. |
| `check-family-questions-r1.log` | the web work, uncommitted | **65 pass, 5 FAIL** | **Driver mistakes:** the TV styles "Right answer" in capitals, which my match didn't allow for, and the host's own played question was on his screen. The first cost the driver 30 s per question, so later questions ran out and the scores were off. The TV screenshot showed **a real layout fault:** with three answers, the last one was cut off at 1080p. Also found: a stale error in the write sheet, a ✓ that looked the same chosen or not, two similar skip buttons for the host, and the waiting ring counting the writer ("0/3" where 2 can answer). |
| `check-family-questions-r2.log` | + all of those fixed | 82/0 | The TV ring was still clipped at the bottom. |
| `check-family-questions-r3.log` | + a smaller TV ring | 82/0 | Screenshots looked right, but no check proved the fit. |
| `check-family-questions-r4.log` | + a fit check on every TV question and reveal, + the longest question (123 characters) with four answers | **88 pass, 1 FAIL** | **A real layout fault:** the long question with four answers overflowed by 14 px. |
| `check-family-questions-r5.log` | + a shorter TV hint, hidden for a long question | 89/0 | The worst case was 123 characters, not the 140 the spec claims. |
| (gate) targeted on `cbf8652`, run `20261114-074736-cbf86523-12708` | the first committed revision | **FAILED** (exit 1), 14 of 15 steps passed | **check-warm-ivory W8** (Everyday colours unchanged) flagged three things, none a colour change. React's generated cover-gradient ids shifted when the 17th cover was inserted. The new game's cards and the lobby card are elements the base build didn't have. Home's "featured today" moved to another game, because a 17th game shifts the daily rotation. Evidence is in `docs/evidence/gate-runs/`. |
| `check-warm-ivory-s125w1.log` | + W8 compares cover gradients without React's id number, + the new components allowed by test-id prefix (each element must still reuse a base style) | **189 pass, 10 FAIL** | Home's featured game had moved, and two more test ids were missing from the list. |
| `check-warm-ivory-s125w2.log` | + W8 prints every difference when it fails | **189 pass, 10 FAIL** | The full list showed home's featured game and its shelf had moved. **Product fix:** Home never features Family Questions, because a newcomer can't play it without written questions. That also keeps the other games' rotation as it was. |
| `check-warm-ivory-s125w3.log` | + that, + the two test ids | 199/0 | |
| `check-family-questions-r6.log` | + the worst case is exactly 140 characters (checked by the driver) | 90/0 | The committed screenshots come from this run. |
