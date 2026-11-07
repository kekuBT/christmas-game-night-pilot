# Library audit — Content Quality 2.0

**Scope:** every item in `content/packs/` (571 items, 20 packs) on branch `claude/content-quality-2`, which was started from the verified Sprint 4 commit 212376f.

**Method:**
- Claude read every item and assigned a triage verdict against the [Editorial Standard 2.0](EDITORIAL_STANDARD.md).
- Machine-checkable facts were measured by script: input-range enterability, answer-length tells, keyword-based region counts, and the Connections solver.
- The verdicts live in `audit-verdicts.json`. `npm run content:audit` regenerates the per-item table: [LIBRARY_AUDIT_TABLE.md](LIBRARY_AUDIT_TABLE.md). The script fails if any library item lacks a verdict.

**What this audit is not:**
- It is not a human fact-check.
- It changes no item's status: every item keeps the review status it had at 212376f.
- It records no approvals.
- A KEEP verdict means "meets the bar as written", not "approved".

## 1. Headline numbers

| Game | Items | KEEP | REVISE | REPLACE | REJECT |
|---|---|---|---|---|---|
| Trivia | 143 | 26 | 49 | 19 | 49 |
| Closest Wins | 59 | 20 | 13 | 16 | 10 |
| Geography | 52 | 27 | 7 | 3 | 15 |
| Guess the Year | 53 | 46 | 2 | 0 | 5 |
| Who Said That? | 40 | 0 | 32 | 0 | 8 |
| Word Connections | 13 | 7 | 5 | 1 | 0 |
| Category Sprint | 19 | 0 | 13 | 1 | 5 |
| Caption Clash | 40 | 35 | 5 | 0 | 0 |
| Impostor (practice) | 68 | 66 | 0 | 0 | 2 |
| Charades (practice) | 84 | 78 | 0 | 0 | 6 |
| **All** | **571** | **305** | **126** | **40** | **100** |

The quiz-style games, where quality matters most for fair scoring, fare worst:
- **Trivia:** only 18% of items meet the bar as written.
- **Who Said That?:** none of the 40 items do.
- **Category Sprint:** none of the 19 lists do.

The library's size (571) hides how little of it is excellent. The pilot's purpose is to show the difference (see [TRANSFORMATIONS.md](TRANSFORMATIONS.md)).

Most frequent findings:
- OBVIOUS: 108
- MISCALIBRATED: 42
- INPUT-RANGE: 37
- SAMENESS: 35
- DUPLICATE: 32
- COMPUTABLE: 26
- WRONG-GAME: 21
- WEAK-DISTRACTORS: 17

## 2. Integrity defect: correct answers that can't be entered (urgent)

The client caps numeric input. In `apps/web/src/components/mchezo/MchezoYear.tsx`, Guess the Year accepts 1896–2025. In `MchezoClosest.tsx`, Closest Wins accepts 0–1000, and `NumericGuess` truncates to whole numbers. The server accepts any finite number, so the limit is in the client only.

- **Closest Wins:** 22 of 59 items have answers outside 0–1000 or with decimals. **14 of them are official-eligible today**:
  - cls-legacy-2 (1440) and cls-legacy-4 (3600);
  - verified-computed cls-c-01, 02, 03, 04, 05, 10, 12, 13, 18, 19, 20 and 21.
  
  Every player is clamped to 1000. Because Closest Wins ranks by distance and ties share the top award, **everyone who tries gets the same score**: the question silently stops measuring anything. It doesn't produce a wrong winner, but it is a wasted round that counts.
- **Guess the Year:** 15 of 53 items are before 1896 (all provisional, so not used officially yet), for example 1066, 1215 and 1492. Everyone would be clamped to 1896 and score 0.
- **Recommendation:** engine change **E1** (a per-item input range in the schema, passed to the client) is urgent. Until it ships, the selection service should **skip** items whose answer is outside the client range. That is a small, testable selection rule, but it changes which official items can appear, so it needs owner approval. No statuses were changed here, as instructed.

## 3. Findings by question

**Obvious questions (108).** Near-100% items labelled as a challenge, for example:
- "What do we call frozen water?" (Ice / Steam / Mist / Dew);
- "How many days are in a week?";
- "What colour is Santa's suit?";
- "Which reindeer has a red nose?" (labelled **Hard**).

**Poorly calibrated difficulty (42 relabels suggested).** In Trivia, 39 items are labelled Hard, but most are common knowledge: Ottawa, Michelangelo, Newton's laws, pH 7, a group of crows, Wellington, the bishop's diagonal move. Of the 143, only a handful would really land in the 15–40% band. The pilot's Hard items are aimed at that band with fair reasoning paths.

**Obscure but uninteresting.** This is rare: the library errs the other way. The examples are the sugar "hard crack" temperature (also a range) and some Closest items with range answers.

**Duplicate concepts (32).**
- Trivia ↔ Closest: piano keys, bones, the marathon.
- Trivia ↔ Geography: capitals (Paris, Rome, Madrid, Ottawa, Cairo), Egypt's continent, Italy's boot.
- Legacy ↔ Sprint 4 Guess the Year: the Moon landing, iPhone, Titanic, Berlin Wall and Wright brothers each appear twice.
- Charades and Impostor repeat legacy prompts.
- Two Guess the Year items share 1843.

**Weak distractors (17).**
- Joke options: "Neither is a mountain", "It depends on the season", "A wall of ice".
- Invented terms: "Proton cloud".
- Patterned numbers: 106/206/306/406.
- Across all 235 multiple-choice items, the answer is the uniquely longest option 23% of the time, so there is no systematic length tell (it's about chance). One item (Gutenberg) has a glaring one.

**Disputed answers (8).**
- Which country has the most islands (no defensible answer).
- Primary colours (RYB vs CMY).
- Who invented the telephone (Bell, Meucci and Gray).
- Giraffe height and blood volume as single values.
- Category Sprint's "Countries in Europe" accepts England, Scotland and Wales but rejects Russia and Turkey.

**Cultural concentration (keyword count by region).**

| Game | UK/Ireland | Continental Europe | USA/Canada | Asia | Africa | Latin America | Oceania |
|---|---|---|---|---|---|---|---|
| Trivia (143) | 11 | 17 | 5 | 8 | 7 | 4 | 3 |
| Geography (52) | 8 | 19 | 8 | 10 | 12 | 7 | 5 |
| Guess the Year (53) | 9 | 6 | 3 | 2 | 1 | 1 | 0 |
| Closest Wins (59) | 2 | 3 | 3 | 2 | 2 | 0 | 0 |

Geography is reasonably balanced. Guess the Year is strongly Anglo-European; most of its events are British, American or European milestones. Most Trivia items have no region at all ("generic school knowledge"), which is a different problem: they aren't about anything in particular. Vocabulary skews British (aubergine, courgette, lorry, crisps).

**Needs a date or source qualifier.**
- The Eiffel Tower's height changed with antennas (324 m → 330 m).
- Magellan "led" the first circumnavigation but died on the way.
- The origin of the Christmas tree ("generally credited").
- Everest's height (already dated, good).
- Africa's UN member count (already dated, good).

**Ambiguous wording.**
- The Gandalf item is 115 characters and "grey (later white)" also fits Saruman.
- "Opposite of ancient": both Old and Antique cause arguments.
- In Who Said That?, 6 items list two speakers who both fit the quote (the Professor and the Inventor; Granny and the Chef).

**Category Sprint lists that unfairly reject valid answers (all 16 active lists).** Every list has 27–38 answers:
- "Birds" rejects *chicken*.
- "Animals" rejects *snake*, *frog* and *shark*.
- "Vegetables" accepts *aubergine* but rejects *eggplant*.
- "Sports" rejects *table tennis*.

The scoring pays a bonus for unique valid answers, so the players most penalised by list gaps are exactly the creative ones. Normalisation is also brittle: `normalizeSprintAnswer` deletes every non a–z character, so "go-kart" becomes "gokart" (the list has "go kart") and "crème brûlée" becomes "crme brle". Two lists ("Things that are cold", "Things in a school") have no defensible boundary at all. See engine change E2.

**Word Connections.** All 13 boards were checked with the new solver, using the overlaps their red-herring notes declare plus those found in review. The overlaps are recorded in `audit-verdicts.json` under `connectionsOverlaps`, and `npm run content:audit` re-runs the solver. **Every board has exactly one solution.** The problems are labels and facts rather than alternative solutions:
- swans and owls labelled "garden birds";
- an icicle labelled as weather;
- "Citrus and stone fruits" as one group;
- pearl and amber labelled "gemstones";
- one board (countries, capitals, rivers, mountains) with no wordplay at all.

Tile order is already shuffled server-side, so it gives no answer-order clue (Sprint 4). The pilot adds `alsoFits` annotations, so future boards are checked mechanically rather than by reading the notes.

**Quantity hiding a lack of variety.**
- Caption Clash: all 35 Sprint 4 prompts follow "A [creature] does [thing]" with one category ("Funny scene").
- Charades: all 78 Sprint 4 prompts are in one category ("Actions").
- Who Said That?: 32 quotes from 8 fictional characters, each answerable by keyword.
- Closest Wins: 21 of 51 Sprint 4 items are arithmetic, which belongs to Math Mayhem.

**Computable items in Closest Wins (26).** With an exact arithmetic answer (seconds in a day, eggs in 5 dozen), careful players tie, and Closest becomes a slow Math round. Keep a few large ones as "estimate under the clock" (at most 1 in 5); move the rest to the Math pool.

## 4. What is good and worth keeping

- **Guess the Year's events are solid** (46 KEEP). They need the range fix, more regions and no duplicates, not a rewrite.
- **Geography's "largest city isn't the capital" items** are well built: Ankara, Rabat, Bern, Brasília.
- **Several real gems:**
  - "Which country shares the longest land border with China?" (Mongolia);
  - "Which planet has the shortest day?" (Jupiter);
  - "How many hearts does an octopus have?";
  - the Twelve Days of Christmas gift total (364);
  - saffron vs turmeric.
- **The Word Connections boards are structurally sound.** Their misdirection is real and resolved by counting.
- **The content system itself** (schemas, hash-bound approvals, lint, per-Cup selection) is the right foundation. Nothing in this audit needs it replaced.

## 5. Suggested order of work (after owner review)

1. Decide on E1 (the input range) and the interim rule that skips unenterable items.
2. Apply the REJECT verdicts by setting `review.status: "rejected"` with a note. That is an owner-approved bulk status change, not done here.
3. Relabel difficulties (42 suggestions in the table), and move capitals and arithmetic to their proper games.
4. Replace Who Said That's official content with verified real quotes; keep the cast as a family-edition practice mode.
5. Rebuild Category Sprint around closed sets plus E2.
6. Write new content to the standard, in reviewed batches (see [WORKFLOW.md](WORKFLOW.md)), aiming for the distribution in [DISTRIBUTION.md](DISTRIBUTION.md).
