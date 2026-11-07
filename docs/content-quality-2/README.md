# Mchezo — Content Quality 2.0

**Branch:** `claude/content-quality-2`, from the verified Sprint 4 commit `212376f`.

**Status:** draft for owner review. Nothing here is approved, merged or deployed.
- No item's review status was changed.
- No approval was recorded.
- No engine, scoring or selection behaviour was changed.
- The pilot is not loaded by the game.

| # | Deliverable | File |
|---|---|---|
| 1 | Mchezo Editorial Standard 2.0 (gates, rubric, calibration, per-game guidance, variety, sources) | [EDITORIAL_STANDARD.md](EDITORIAL_STANDARD.md) |
| 2 | Assessment of the existing library (summary, and a per-item KEEP/REVISE/REPLACE/REJECT table for all 571 items) | [LIBRARY_AUDIT.md](LIBRARY_AUDIT.md), [LIBRARY_AUDIT_TABLE.md](LIBRARY_AUDIT_TABLE.md), `audit-verdicts.json` |
| 3 | Pilot collection: 60 draft items across 10 games (Math Mayhem as a progression spec) | `content/pilot/pilot-cq2.json` (source), [PILOT_ITEMS.md](PILOT_ITEMS.md) (readable) |
| 4 | Before/after transformation examples | [TRANSFORMATIONS.md](TRANSFORMATIONS.md) |
| 5 | Recommended distribution across games and difficulty | [DISTRIBUTION.md](DISTRIBUTION.md) |
| 6 | Editorial tools and approval workflow | [WORKFLOW.md](WORKFLOW.md) |
| 7 | Engine-level changes needed | [ENGINE_CHANGES.md](ENGINE_CHANGES.md) |

## Update — owner decisions applied (branch `claude/cq2-integrity-fixes`)

- **E1 shipped.**
  - Numeric input now accepts every intended answer: Year 1000–2100; Closest 0 to a trillion with 3 decimals; no clamping.
  - The server validates guesses and refuses guesses from outdated tabs.
  - Selection skips any unenterable item.
- **E3 shipped.**
  - Answers and explanations appear only after answers are locked: at game end for independent games, and per closed question for Closest Wins. This covers the phone and the TV dashboard.
  - Server tests prove nothing is exposed earlier.
- **E2 v2:** [E2_CATEGORY_SPRINT_V2.md](E2_CATEGORY_SPRINT_V2.md). Closed sets only for official play, with no votes and no scoring change yet.
- **Pilot review:** [review-batch-01/REVIEW_SHEET.md](review-batch-01/REVIEW_SHEET.md) has 20 items, with the author's scores hidden.
- **Audit batch A:** [audit-batches/BATCH_A_FACTUAL_AND_MECHANICAL.md](audit-batches/BATCH_A_FACTUAL_AND_MECHANICAL.md). Factual and mechanical defects only, with nothing applied.
- The "14 unenterable official items" finding below is **resolved**.

## In one minute (original findings, 88995ae)

- **Quality, not quantity, is the gap.**
  - 571 items, but only 26 of 143 Trivia items meet the bar as written.
  - None of the 40 Who Said That? items do: the fictional cast is either answerable by keyword or arbitrary.
  - None of the 19 Category Sprint lists do: they reject valid answers such as *chicken* (Birds), *eggplant* (Vegetables) and *Russia* (Europe).
  - 108 items are near-100% "obvious"; 42 have the wrong difficulty label.
- **One integrity defect in official play today:** the client caps Closest Wins input at 1000 and Guess the Year at 1896–2025.
  - 14 official-eligible Closest items have answers players can't enter, so everyone ties.
  - Proposed fix: E1, with an interim selection rule, which needs owner approval.
- **Explanations are never shown.** Every quiz item carries one, but no screen renders it (E3). Fixing this is the cheapest big gain in delight.
- **The pilot shows the difference:** 60 items averaging 21.7/25 on the rubric (self-assessed), against 11.8 for the eight library items they replace in the examples.
  - Every pilot item passes the live schema.
  - Every Connections board has exactly one solution (checked by the new solver).
  - Each item names the human fact-check it still needs.
  - Three pilot items are honestly marked as blocked by engine limits.

## Verification on this branch

- `npm run content:pilot`: every draft item passes the live schema, rubric bar, enterability, formulas, aliases and the Connections uniqueness solver.
- `npm run content:audit`: every library item has a verdict; it reports 14 official unenterable items and 0 Connections boards with an alternative solution.
- `tests/content-pilot.test.ts`: the pilot stays valid and out of the library, and the solver catches a superset-category board.

## Decisions needed from the owner

1. **E1 interim rule:** skip unenterable numeric items in official selection until per-item input ranges ship.
2. **E2 Category Sprint:** a peer challenge for unlisted answers. In particular: peer-accepted answers score the base 20 points but not the uniqueness bonus; a tie rejects; the host has no override.
3. **Who Said That?:** move official play to verified real quotes, with the fictional cast as a practice "family edition".
4. **Apply the audit:** mark REJECT items as rejected, relabel difficulties, and move capitals and arithmetic to their proper games. This is a bulk status change, so it isn't done here.
5. **Pilot review:** an editor re-scores and fact-checks the 60 items (each lists its verification requirement), before any further batches are written.
