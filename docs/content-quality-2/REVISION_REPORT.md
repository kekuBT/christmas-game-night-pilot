# Content Quality 2.0: revision report (owner feedback, 2026-11-07)

**Branch:** `claude/cq2-editorial-revision`, from `44b0022`. That commit is the gate-verified E1/E3 checkpoint `c70f16b` plus a notes-only commit; it is preserved unchanged on `claude/cq2-integrity-fixes`.

**Hard limits observed:**
- Nothing merged or deployed.
- No approvals recorded.
- No change to scoring, selection code or official competitive rules.
- No mass content generation.

## Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | Revised pilot batch with before/after differences (21 items, re-balanced for tone) | [review-batch-02/](review-batch-02/README.md), including [BEFORE_AFTER.md](review-batch-02/BEFORE_AFTER.md) |
| 2 | E2 design, final for approval, with simulated set-size policy | [E2_CATEGORY_SPRINT_V3.md](E2_CATEGORY_SPRINT_V3.md), [E2_SET_SIZE_SIMULATION.md](E2_SET_SIZE_SIMULATION.md) |
| 3 | Audit Batch A corrections as a reviewable change | [audit-batches/BATCH_A_APPLIED.md](audit-batches/BATCH_A_APPLIED.md) and the pack diffs on this branch |
| 4 | This report | — |
| — | Audience and personality rules added to the standard | [EDITORIAL_STANDARD.md §5a](EDITORIAL_STANDARD.md) |

## Verified facts, by verification level

**How strong each level is:**
- **Computed** checks are reproducible.
- **AI web checks** compared each claim with public sources on 2026-11-07. They are not human fact-checks.
- **No item has had a human fact-check.**

| Level | Items and what was confirmed |
|---|---|
| Computed | `trv-cq2-12`: only "q" is missing from the 50 state names. `cls-cq2-05`: Heathrow–JFK is 5,554.9 km (Vincenty, WGS 84) against 5,540 km on a sphere. `spr-cq2-05`: exactly 50 states. E2 simulation: matches the closed form (1 − 5/N)^(P−1) (test). |
| AI web check | `geo-cq2-04`: France 12 standard offsets (13 with Adélie Land), Russia 11, US 11 with territories (timeanddate.com, Guinness World Records). `trv-cq2-14`: Rousseau's "great princess" and *brioche*, and no evidence Marie Antoinette said it (Britannica). `trv-cq2-21`: the Creeper came from a pig model with length and height swapped (Wikipedia, citing the 2012 Mojang documentary). `trv-cq2-22`: "Me at the zoo", 23 April 2005, San Diego Zoo, elephants (Wikipedia, NBC). `cls-cq2-21`: "Old Town Road" 19 weeks in 2019, the previous record 16 (Despacito / One Sweet Day), Shaboozey's non-consecutive 19 in 2024 (Billboard-based reports). `year-cq2-21`: Wii 19 Nov 2006 NA, 2 Dec 2006 JP. `year-cq2-22`: Ice Bucket Challenge, July–August 2014. |

## Remaining fact-checks (human), batch 02

Every item's exact check is on its review-sheet card. The ones that matter most:

| Check | Items |
|---|---|
| Confirm against a primary or authoritative source | `trv-cq2-14` (Confessions text and dating), `trv-cq2-22` (watch the video for the quoted line), `trv-cq2-21` (documentary or Notch's own words), `year-cq2-21` (Europe launch date), `year-cq2-22` (ALS Association totals; the context avoids an exact figure) |
| Not yet checked by anyone | `trv-cq2-10` (plant physiology text), `trv-cq2-11` (botany), `trv-cq2-08` (KFC Japan 1974), `year-cq2-07` (Nintendo 1889), `who-cq2-01` (Twain 1897), `cls-cq2-22` (151, and Mew by events), `trv-cq2-23` (Oscar, 2003 ceremony), `con-cq2-01` (spelling "Juliett"), `spr-cq2-02` (zodiac alias reasons) |
| Editorial read only | `cap-cq2-01`, `imp-cq2-21` |

## Still blocked from official use

1. **Every pilot item (69).** They are `provisional` until a named human reviews and approves them. That approval is a separate, owner-controlled step that this work does not take.
2. **Category Sprint official play:** waits on approval of E2 v3 (§8) and its implementation. Until then:
   - `spr-cq2-05` (US states) is the only official-ready candidate;
   - South America, the zodiac, the planets and the rhymes list are practice-only.
3. **Who Said That? real quotes** (`who-cq2-01`, `-03`, `-04`): need the independent review you asked for, plus a copyright note per quote. The Rousseau item moved to Trivia, so it no longer needs engine change E5.
4. **Round-variety rule (E10)** and **the equal-answer pairing rule (E9):** proposals only. `year-s4-043` stays retired until E9 exists.
5. **A1 (`con-legacy-1`, Icicle → Sleet):** applied on the branch, but it reaches official play only if you approve the merge.

## Tests and checks on this branch

Results:
- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run content:check`: CONTENT OK.
- `npm run content:audit`: 0 unenterable official items, 0 Connections boards with an alternative solution.
- `npm run content:pilot`: OK, 69 items.
- Unit tests: 691 passed (62 files), in the gate run below.
- Full gate on `e06fe92`: **PASSED (exit 0)**, run `20261107-114948-e06fe92c-3602`, 44 of 44 steps.

New tests:
- `tests/sprint-sim.test.ts` (5);
- `tests/audit-batch-a.test.ts` (9);
- 6 more in `tests/content-pilot.test.ts`.

The gate verdict is also recorded in `docs/PROGRESS.md`.

**Fixed in passing:** `npm run content:pilot` crashed on the batch-01 review file, which sits in the same folder (introduced in `c70f16b`; the gate doesn't run that command). It now skips files that aren't pilot item files.

## Owner decisions requested

1. **E2 v3:**
   - the size policy, `setSize ≥ max(15, 4 × players)`, plus the rules for obscure-tail and recited-in-order sets;
   - normalisation v2 with category-scoped aliases;
   - the example verdicts.
2. **Batch A:** approve, change or revert each row. In particular, A1 is the only edit to an official board.
3. **Review batch 02:** an independent editor reviews it (blind sheet). Their verdict decides whether the tone mix and quality bar are right before any library expansion.
4. **E10 round-variety rule:** whether to make it a selection rule later.

I've stopped here for owner review, as instructed. There is no library expansion and no further batches until review batch 02 comes back.
