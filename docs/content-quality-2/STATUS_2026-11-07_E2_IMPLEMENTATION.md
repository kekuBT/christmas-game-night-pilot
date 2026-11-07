# Status: E2 implementation and corrections (owner review, 2026-11-07)

**Branch:** `claude/cq2-e2-sprint-v3`. It starts from `9e3796d`, the head of the gate-verified editorial revision branch.

**Hard limits observed:**
- Nothing merged or deployed.
- No human content approval recorded.
- No spending.
- No large content packs.
- Official scoring points are unchanged. Category Sprint's matching and official eligibility changed exactly as you approved.

## What was done

| # | Your instruction | Result | Where |
|---|---|---|---|
| 1 | Implement corrected E2 v3 | Done, with every correction in §9 | [E2_CATEGORY_SPRINT_V3.md §9](E2_CATEGORY_SPRINT_V3.md); `src/games/sprint.ts`, `src/content/closedSet.ts`, `select.ts`, `registry.ts`, `materialize.ts`, `src/server/cup.ts`, `room.ts`; `tests/sprint-e2v3.test.ts` (48) |
| 2 | Batch A: preserve old and new boards and Cup results, plus a semantic overlap review | Done. One editor call flagged: Basil as a green would make `con-s4-02` ambiguous. | [BATCH_A_APPLIED.md](audit-batches/BATCH_A_APPLIED.md); [batch-a-semantic-review.json](audit-batches/batch-a-semantic-review.json); `tests/batch-a-compat.test.ts` (7) |
| 3 | `cls-cq2-05` wording and scoring convention | Fixed: no "great-circle", plain wording, convention stated. Both values recomputed: 5,554.9 km and 5,540.0 km. | [review-batch-02/EDITORIAL_CHECKS.md](review-batch-02/EDITORIAL_CHECKS.md) |
| 3 | Five editorial checks on batch 02 | Written up. Four small wording fixes, all items still provisional. | same |
| 4 | E10: a bounded approach, tested on Cup-sized and low-content libraries | Rule recalibrated to v2. Bounded step simulated; proposal only. | [E10_ROUND_VARIETY.md](E10_ROUND_VARIETY.md); [simulation](E10_ROUND_VARIETY_SIMULATION.md); `tests/variety.test.ts` (10) |
| 5 | `clickthrough-api.mjs`: classify, then repair or retire | Retired as a tombstone that always exits 2. A script-inventory test was added. | [docs/TESTING.md](../TESTING.md) ("Scripts that are not checks"); `tests/script-inventory.test.ts` (4) |

## Findings you should know about

1. **The membership lists have not been compared with their sources.**
   - This session's network blocks the source sites (census.gov, europa.eu, un.org, iupac.org, iau.org and wikipedia.org).
   - The 7 lists were transcribed, and web search confirmed only their counts.
   - The code refuses a real approval of any closed set until a person records a `sourceCheck`.
   - **To unblock:** either a person compares each list with its page, or you allow those hosts for this environment and I fetch and diff them.
2. **The first E10 rule was miscalibrated.** It would have flagged nearly every real 10-question round. The v2 rule caps only twist formats.
3. **E10's honest cost.** The variety step cuts rule breaches by about four times in Cup-sized libraries. But in small Cups, the last game can be slightly worse than today, because the step defers excess twist items. The lasting fix is the content mix, so the proposal adds a mix warning.
4. **Before this change, official Category Sprint had no usable content.** All legacy categories were rejected, and the Sprint 4 ones were open and provisional. It now has four official-candidate closed sets, all provisional.
   - **Room sizes:** for 7–10 players, three are suitable (US states, Africa, elements).
   - **One official Sprint game per Cup:** each game uses 3 categories and the Cup never repeats them. Every room has 3 or 4 suitable sets, so a Cup can play only one official Sprint game until more closed sets are added.
5. **The retired driver's old "passes" were weaker than they looked.** It only ever asserted that every game finished.

## Blocked from official use (unchanged unless noted)

- **Every pilot item (69) and every new closed set (7)** is provisional until a named human reviews it.
- **Closed sets also need a source check** on their membership list.
- **E10:** awaits your decision on the v2 rule, the bounded step and library tagging.
- **E9 (equal-answer pairing):** still a proposal. `year-s4-043` stays retired.
- **E1/E3:** real-device verification is still outstanding.

## Decisions requested

1. **E10:** approve the v2 rule, the window-3 bounded step, and tagging the library's quiz items with `mechanic`, plus a mix warning ([E10_ROUND_VARIETY.md](E10_ROUND_VARIETY.md)).
2. **Category Sprint closed-set sources:** a person source-checks the 7 lists, or you allow the source hosts so I can fetch them.
3. **`con-s4-02`:** confirm Basil is not a shade of green, or swap it for a herb with no colour sense, such as Dill.
4. **More official closed sets:** whether to add more, so a Cup can play more than one official Category Sprint game. This is a small, reviewed batch, not mass generation.

## Tests and verification

**Results:**
- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run content:check`: CONTENT OK.
- `npm run content:audit`: 0 unenterable, 0 multi-solution boards.
- `npm run content:pilot`: OK.
- Unit tests: 760 passed (66 files).

**New on this branch:** 69 tests.
- `tests/sprint-e2v3.test.ts`: 48.
- `tests/batch-a-compat.test.ts`: 7.
- `tests/variety.test.ts`: 10.
- `tests/script-inventory.test.ts`: 4.
- One more assertion in `tests/content-pilot.test.ts`.

The full gate verdict for the exact commit is recorded in `docs/PROGRESS.md`.
