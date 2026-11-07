# Audit batch A — factual and mechanical defects (for owner decision)

**Scope:** items from the Content Quality 2.0 audit where the defect can be shown with evidence anyone can check: a wrong fact, a wrong label, the answer appearing in the question, an exact duplicate, a missing obvious answer, or an answer that is a range rather than a value.

**Not in scope:** editorial judgements ("too easy", "dull", difficulty relabels). Those are AI opinions and go to separate batches (see the end of this document).

> **Update 2026-11-07:** after owner review, these corrections were applied as a reviewable change on branch `claude/cq2-editorial-revision`; see [BATCH_A_APPLIED.md](BATCH_A_APPLIED.md). The table below is the original proposal, kept unchanged.

**Nothing has been changed.** Every item keeps its current status. The proposed action is applied only if the owner approves it.

How to use: for each row, approve the proposed action, change it, or reject it. "Retire" means setting `review.status: "rejected"` with a note. That only stops future selection; past games and results are untouched.

**Selection exposure today.** Official selection uses only `approved`, `verified-computed` and `legacy` items.
- Of the 18 rows below, only **A1 (con-legacy-1)** can be selected for an official game today.
- The other 17 are `provisional`, so they appear only in practice games, unless they are approved later.
- So no other row is urgent for official play. They matter because they would otherwise reach review looking acceptable.

**Quarantine.** The owner authorised quarantining demonstrably broken or unenterable items.
- Unenterable items are handled automatically (E1 selection guard; none remain after the input fix).
- A1 is the only official item below, and its defect (an icicle as "weather") is a labelling slip rather than an unplayable item. So I have **not** quarantined anything, and leave A1 to this decision.

| # | Item (status) | Original | Defect and evidence | Proposed action |
|---|---|---|---|---|
| A1 | `con-legacy-1` (legacy, **official**) | "Winter weather": Snowfall, Frost, Blizzard, **Icicle** | An icicle is ice formed from dripping water, not a weather condition (any dictionary). Candy cane and gingerbread are also common tree decorations; the board is unique only by counting (checked with the solver). | Revise: rename the group "Winter words", or replace Icicle with Sleet. Approval needed, because it's a legacy item. |
| A2 | `con-s4-05` (provisional) | "Garden birds": Robin, Wren, **Owl, Swan** | Swans are water birds and don't use gardens. Owls are mainly nocturnal woodland or farmland birds (RSPB, Audubon and similar field guides). | Revise: Robin, Wren, Sparrow, Blackbird. |
| A3 | `con-s4-12` (provisional) | "Gemstones": Ruby, **Pearl, Amber**, Opal | Pearl and amber are organic gems, not minerals (standard gemmology definitions, e.g. GIA). "Gemstones" is wrong for two of the four. | Revise: rename the group to "Gems". |
| A4 | `con-s4-02` (provisional) | Red-herring note: "'Lime' is a fruit, not a green, on this board." | Lime is also a shade of green; the board is unique only because the green group already has four words (solver: exactly one solution with Lime → green declared). The note is wrong; the board is fine. The group name "Citrus and stone fruits" also combines two categories. | Revise the note and the group name ("Fruits"). |
| A5 | `trv-hist-038` (provisional) | "In which city was the **Berlin** Wall?" → Berlin | The answer is in the question. | Retire. |
| A6 | `geo-s4-026` (provisional) | "In which city is the **Sydney** Opera House?" → Sydney | The answer is in the question. | Retire. |
| A7 | `trv-hist-129` (provisional) | "The Great Wall was built mainly to protect which country?" → China | The everyday name ("Great Wall of China") contains the answer. | Retire. |
| A8 | `trv-scie-125` (provisional) | Options include "**Proton cloud**" | Not a term used in physics (the established terms are electron cloud and orbital). An invented distractor is unfair: it can be eliminated by vocabulary, not knowledge. | Revise: replace it with "Electron cloud". |
| A9 | `year-s4-006` (provisional) | Apollo 11 Moon landing, 1969 | Exact duplicate of `year-legacy-1` (same event). | Retire. |
| A10 | `year-s4-014` (provisional) | First iPhone, 2007 | Duplicate of `year-legacy-2`. | Retire. |
| A11 | `year-s4-016` (provisional) | Titanic sank, 1912 | Duplicate of `year-legacy-7`. | Retire. |
| A12 | `year-s4-020` (provisional) | Berlin Wall fell, 1989 | Duplicate of `year-legacy-3`. | Retire. |
| A13 | `year-s4-042` (provisional) | Wright brothers' first flight, 1903 | Duplicate of `year-legacy-5`. | Retire. |
| A14 | `year-s4-043` + `year-s4-044` (provisional) | Christmas card (1843); A Christmas Carol (1843) | Same answer: if both appear in one game, the second is a free point. | Keep both, and add an `answerKey` tag so selection never pairs them (needs the E9 rule). Until then, retire `year-s4-043`. |
| A15 | `trv-lang-053` (provisional) | Letters in the English alphabet (26) | Same fact as `cls-legacy-6`. | Retire. |
| A16 | `trv-geog-028` + `geo-s4-042` (provisional) | Italy's boot shape; the city closest to London | Same facts as `geo-legacy-5` and `geo-legacy-8` (Paris–London). | Retire both. |
| A17 | `spr-s4-011` "Birds", `spr-s4-004` "Vegetables" (provisional) | Accepted lists of 30 answers | "Birds" rejects **chicken** (also vulture, stork, pelican, canary). "Vegetables" accepts *aubergine* and *courgette* but rejects **eggplant** and **zucchini**. These are verifiable omissions. | Keep practice-only (E2 v2: open categories aren't official). Add the omissions now. |
| A18 | `cls-k-13`, `cls-k-26` (provisional) | Giraffe height "5.5 m"; sugar hard-crack "150 °C" | Each explanation gives a range (4.5–6 m; 146–154 °C), so the "answer" is a midpoint the author chose, and close guesses rank arbitrarily. | Retire, or reword to a defined value. |

**Resolved by the E1 fix (no action needed):**
- `cls-k-03` ("decimals allowed", 42.195), `cls-k-23` (273.15) and `cls-k-29` (8.3) can now be entered exactly.
- The 14 official Closest items above 1000 are enterable again.
- The 15 Year events before 1896 are enterable again.

## Next batches (editorial judgement, kept separate)

Each batch will hold about 20 items and use the same layout (original, evidence or rationale, proposed action). Each will be labelled clearly as **AI editorial judgement**, not as a defect:
- **B: obvious, near-100% items** proposed for retirement (the strongest cases first, e.g. "What do we call frozen water?").
- **C: difficulty relabels**, with the expected correct rate and the reasoning for each. These remain estimates until real play data exists (E7).
- **D: Who Said That? fictional quotes** where two listed speakers fit (judgement about character voice).

I'll prepare B only after this batch and the 20-item pilot review are back, so their feedback shapes it.
