# Audit Batch A: corrections applied for review

**Branch:** `claude/cq2-editorial-revision` (draft, not merged).

**Source:** [BATCH_A_FACTUAL_AND_MECHANICAL.md](BATCH_A_FACTUAL_AND_MECHANICAL.md), the original rows with their evidence.

**Script:** `scripts/content-quality/revisions/batch_a_apply.py`. It is a one-shot, readable list of every edit.

**Tests:** `tests/audit-batch-a.test.ts` (9 tests).

## Scope and rules

- **Objective defects only.** Each row is something anyone can check: the answer appears in the question, an exact duplicate, an invented term, a mislabel, a missing obvious answer, or an answer that is a range rather than a value.
- **No editorial judgements.** "Too easy" retirements and difficulty relabels will come in separate, clearly labelled batches (B, C and D), as AI judgement.
- **Retire means `review.status: "rejected"` plus a dated note. Nothing is deleted.** Ids stay valid, so Cup usage history and past results are unaffected. A test shows that recorded usage of retired items is left byte-for-byte unchanged, and that they are never selected again.
- **Nothing is approved.** Provisional items stay provisional.
- **One legacy board is edited.** It keeps its `legacy` status, because it is the only official Word Connections board; making it provisional would empty official Connections. **This edit needs your sign-off before merge** (see A1).
- **Every edited Connections board was re-run through the uniqueness solver,** using the overlaps declared in `audit-verdicts.json`. Each has exactly one solution.

## Applied changes

| Row | Item | Status | Before | After | Check |
|---|---|---|---|---|---|
| A1 | `con-legacy-1` | legacy, **official** | "Winter weather": Snowfall, Frost, Blizzard, **Icicle** | Snowfall, Frost, Blizzard, **Sleet** | Solver: 1 solution. **Owner sign-off needed.** |
| A2 | `con-s4-05` | provisional | "Garden birds": Robin, Wren, **Owl, Swan** | Robin, Wren, **Sparrow, Blackbird** | Solver: 1 solution |
| A3 | `con-s4-12` | provisional | Group "Gemstones" (with Pearl and Amber) | Group "**Gems**"; red-herring note says "organic gems" | Solver: 1 solution |
| A4 | `con-s4-02` | provisional | Group "Citrus and stone fruits"; the note wrongly said Lime is not a green | Group "**Fruits**"; the note explains that counting forces Sage to green and Lime to fruit | Solver: 1 solution |
| A5 | `trv-hist-038` | provisional → **rejected** | "In which city was the Berlin Wall?" | Retired: the answer is in the question | Never selected (test) |
| A6 | `geo-s4-026` | provisional → **rejected** | "In which city is the Sydney Opera House?" | Retired: the answer is in the question | Never selected (test) |
| A7 | `trv-hist-129` | provisional → **rejected** | "The Great Wall was built mainly to protect which country?" | Retired: the everyday name gives the answer | Never selected (test) |
| A8 | `trv-scie-125` | provisional | Options include "Proton cloud" (not a physics term) | "**Electron cloud**" | Schema and lint pass |
| A9–A13 | `year-s4-006`, `-014`, `-016`, `-020`, `-042` | provisional → **rejected** | Moon landing, iPhone, Titanic, Berlin Wall, Wright brothers | Retired as duplicates of `year-legacy-1`, `-2`, `-7`, `-3`, `-5` | Never selected (test) |
| A14 | `year-s4-043` | provisional → **rejected** | Christmas card (1843), the same year as `year-s4-044` | Retired until selection can avoid pairing equal answers (E9) | Never selected (test) |
| A15 | `trv-lang-053` | provisional → **rejected** | Letters in the alphabet (26) | Retired: duplicate of `cls-legacy-6` | Never selected (test) |
| A16 | `trv-geog-028`, `geo-s4-042` | provisional → **rejected** | Italy's boot shape; the capital closest to London | Retired: duplicates of `geo-legacy-5` and `geo-legacy-8` | Never selected (test) |
| A17 | `spr-s4-011` "Birds", `spr-s4-004` "Vegetables" | provisional; eligibility official → **practice** | Missing chicken, vulture, stork, pelican, canary; eggplant, zucchini | Added. Open categories are practice-only under E2 v3. | Test |
| A18 | `cls-k-13`, `cls-k-26` | provisional → **rejected** | Giraffe "5.5 m" (range 4.5–6); hard crack "150 °C" (range 146–154) | Retired: the answer is a chosen midpoint, so close guesses rank arbitrarily | Never selected (test) |

## A1 in detail (the only official item)

- **Defect:** an icicle is ice formed from dripping water, not a weather condition.
- **Alternatives considered:**
  1. **Replace Icicle with Sleet (applied).** It keeps the precise group label, changes one tile, and the solver finds one solution.
  2. **Rename the group "Winter words".** Counting still gives one solution (a test shows this), but the label becomes a catch-all that gingerbread, tinsel and every other word on the board also fit. The solver can't judge a label, so this was rejected as an editorial weakness, not because of the solver.
- **Compatibility:**
  - Games already played keep the copy of the board they were played with (game state is materialised at start), and Cup results store points, not board text.
  - Usage history is keyed by id, so no-repeat selection still treats this board as already used in a Cup where it appeared.
- **If you prefer not to change an official board yet,** revert this one row. The script and the test name it.

## Effect on what can be selected

- **Official pools:** only A1 touches official play (one tile changes).
- **Provisional (practice) pools:** 14 items are retired. `npm run content:check` and `content:audit` still pass, and official Closest Wins and Year selection succeed (tested).

## Owner decision (2026-11-07, second review) and follow-up

**Decision:**
- A1–A18 are approved for continued development, and A1 (Icicle → Sleet) is accepted.
- Subjective retirements and difficulty relabels (Batches B–D) stay unapplied until they are reviewed.
- This approval is for development on a branch. It does not record a content approval or permit a merge.

**History preserved.** `tests/batch-a-compat.test.ts` covers each case:

| Case | What the test shows |
|---|---|
| New game | Gets the corrected board: Sleet, no Icicle. |
| Game materialised before A1 (board stored with Icicle) | After save and restore, it accepts the Icicle group and keeps its own board. |
| Pre-Sprint-4 game (no stored board) | Replays the original `CONNECTIONS_BOARD`, Icicle included. |
| Finished game | Raw scores and Cup standings are identical after reloading with the edited library. |

### Semantic overlap review

The solver only checks the overlaps someone declared. So every tile of the four edited boards was reviewed against every other group on its board, weak associations included. The review is in [batch-a-semantic-review.json](batch-a-semantic-review.json). The test re-runs the solver with every reviewed and declared overlap, and each board still has exactly one solution.

**Weak associations recorded:**
- Blizzard (a branded ice-cream dessert);
- Turtle (turtle dove);
- Rose (rose quartz);
- Tulip (tulip tree);
- Amber (tree resin);
- the seven tiles that are also girls' names on `con-s4-12`. There is no names group, and seven is more than four.

**One editorial call to confirm:**
- On `con-s4-02`, Basil was judged not a shade of green: "basil green" is only a paint or fashion name.
- If an editor disagrees, Basil and Sage could swap between herbs and greens, and the board has **two** solutions. A test shows this.
- The fix would be to replace Basil with a herb that has no colour sense, such as Dill.
- Nothing was changed; this needs a human decision.
