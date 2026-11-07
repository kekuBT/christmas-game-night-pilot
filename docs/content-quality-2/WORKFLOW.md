# Editorial tools and approval workflow

## 1. What exists today (Sprint 4, unchanged)

| Tool | What it does |
|---|---|
| `npm run content:check` | Schema validation, lint (duplicates, negative wording, stale facts, red-herring notes, thin Sprint lists) and an inventory by status |
| `npm run content:review -- <dir>` | Writes one review sheet per game for a human editor |
| `npm run content:approve -- --reviewer "Name" <ids>` | Records a human approval in `content/approvals.json`, bound to the item's hash. Editing the item voids the approval. |
| Selection | Only `approved`, `verified-computed` and `legacy` items are official; no repeats within a Cup |

This is the right backbone: approvals are explicit, attributed and tamper-evident. Content Quality 2.0 adds editorial judgement around it, not a new approval mechanism.

## 2. Added on this branch (tools only; no status or approval changes)

| Tool | What it does |
|---|---|
| `npm run content:pilot` | Validates draft items in `content/pilot/` against the **live** schemas. It also checks the rubric bar, input-range enterability (`blockedBy` must be declared), formulas, Category Sprint aliases (an alias can't also be a canonical answer, so it can't score twice) and the **Connections uniqueness solver** (exactly one partition, given the declared `alsoFits` overlaps). Exits 1 on any error. Covered by `tests/content-pilot.test.ts`. |
| `npm run content:pilot:render` | Writes the human-readable `PILOT_ITEMS.md` from the pilot JSON (the JSON is the single source of truth) |
| `npm run content:audit` | Merges `audit-verdicts.json` with the live library and writes `LIBRARY_AUDIT_TABLE.md`. It adds machine-checkable findings (input range, Connections alternative solutions) and fails if any item lacks a verdict. |

The pilot lives in `content/pilot/`, which the loader never reads (it reads only `content/packs/`). Nothing in it can reach a game.

## 3. Proposed workflow, from draft to official

```
 draft ──► self-check ──► editor review ──► fact check ──► approve ──► ship ──► calibrate
 (author)  (machine)      (human: rubric)   (human: G1)    (human)     (pack)    (data)
```

1. **Draft (author: a person or Claude).**
   - Write items in `content/pilot/<batch>.json` with the editorial block: expected correct, reveal, verification requirement, why include, self-scored rubric, and `alsoFits` for Connections.
   - Never cite a source you didn't check: write what must be checked instead.
2. **Self-check (machine).** `npm run content:pilot` must pass. That proves the item is well-formed, enterable and has one solution. **It proves nothing about truth or quality.**
3. **Editor review (human, the rubric).**
   - A named editor re-scores the rubric blind, before seeing the author's scores, then compares.
   - If the editor and author totals differ by 4 or more, discuss the item before going further.
   - The editor records KEEP / REVISE / REJECT for the batch.
   - Suggested pace: 20–30 items per sitting (about 1–2 minutes each).
4. **Fact check (human, gate G1).**
   - The checker follows each item's verification requirement and records what they looked at in `review.notes` (e.g. "Checked NASA AS13 transcript p. 160, 2026-11-20").
   - This must be someone other than the author, or the author on a different day with the source open.
   - For `computed` items, the checker confirms the *wording* matches the formula.
5. **Approve (human).**
   - Move the item into a pack (`content/packs/*.json`) unchanged, then `npm run content:approve -- --reviewer "Name" <ids>`.
   - Any later edit voids the approval automatically (hash binding).
6. **Ship.** Pack version bump plus the normal gate run.
7. **Calibrate (data).** After real play, compare each item's actual correct rate with its label (E7), and relabel or retire items outside their band.

**Who can approve.** The owner (Keku), or editors the owner names. Claude drafts, checks mechanically and explains, but **never records an approval** (AGENTS.md; the `content:approve` CLI requires a named reviewer).

## 4. Batch discipline (no bulk generation)

- Batches of at most 30 items. The next batch is written only after the previous one is reviewed, so feedback shapes the next batch instead of 500 items repeating one mistake.
- Every batch reports:
  - its distribution (game, difficulty, region, domain) against [DISTRIBUTION.md](DISTRIBUTION.md);
  - its average rubric;
  - how many items the editor rejected, and why. A rejection rate above 20% means the brief or the author needs fixing before the next batch.
- Retire before adding: each batch should list which REJECT or REPLACE items it supersedes (`editorial.replaces`).

## 5. Recommended next tools (small; for owner prioritisation)

1. **Review sheet v2:** add the rubric columns, expected correct rate, reveal and verification requirement to `content:review`, so editors work from one sheet.
2. **Blind re-score mode:** a review sheet that hides the author's rubric.
3. **Duplicate-concept finder across games:** today's lint finds near-duplicate prompts within one game; extend it to answers and key nouns across games (piano/88, marathon, capitals).
4. **Region, era and domain tags plus a coverage report:** feeds the mix rules (E9).
5. **Calibration report:** once play data exists, observed correct rate per item against its label (E7).
6. **Category Sprint answer log:** after each round, record unlisted answers and how the peer vote went, so the list grows from real play rather than guesswork (E2).
