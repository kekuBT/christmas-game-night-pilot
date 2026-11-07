# Recommended distribution across games and difficulty

These are targets for the **reviewed, official** library before the next Cup, and for the year-round platform after it. They are sized from how many items a night uses and how much repeat protection selection needs, not from how much content is easy to write.

## 1. How much a night uses

From `src/content/materialize.ts`:
- Trivia uses 10 questions per game.
- Who Said That?, Geography, Guess the Year and Closest Wins use 8 each.
- Caption Clash uses 3 prompts.
- Category Sprint uses 3 categories.
- Word Connections uses 1 board.
- Impostor uses 1 word.
- Charades uses 12 prompts.
- Math Mayhem is generated.

Per-Cup selection never repeats an item within a Cup, and practice retires items (Sprint 4). A pool of **at least 6 nights' worth of items per game** covers a season of monthly events without obvious repeats. **10 or more nights** covers a year-round weekly group.

## 2. Targets per game

| Game | Per night | Minimum official pool (6 nights) | Year-round target | Easy / Medium / Hard | Today: KEEP as written |
|---|---|---|---|---|---|
| Trivia | 10 | 60 | 150 | 25% / 50% / 25% | 26 |
| Closest Wins | 8 | 50 | 120 | 30% / 50% / 20% (by spread) | 20 |
| Guess the Year | 8 | 50 | 120 | 30% / 45% / 25% | 46 (15 blocked by input range) |
| Geography | 8 | 50 | 120 | 25% / 50% / 25% | 27 |
| Who Said That? (real quotes) | 8 | 50 | 120 | 30% / 45% / 25% | 0 |
| Word Connections | 1 board | 12 | 52 | boards ramp: L1 easy … L4 wordplay; 1 in 4 boards "Hard" | 7 |
| Caption Clash | 3 prompts | 30 | 100 | n/a (creative) | 35 (mix in format prompts) |
| Category Sprint | 3 categories | 24 | 60 | 40% closed-set / 40% rule-checkable / 20% open (with E2) | 0 |
| Impostor (practice) | 1 word | 12 | 60 | n/a | 66 |
| Charades (practice) | 12 | 72 | 150 | n/a | 78 |
| Math Mayhem | generated | — | — | progression (Editorial Standard §4) | generated |

## 3. Mix rules inside one night (selection should enforce these, via engine change E9)

- **Difficulty:** start with 2 Easy items, put Medium items in the middle, and save the hardest item for the second-to-last slot. Finish on a fun reveal rather than the hardest question.
- **Category:** at most 2 items from one category per game per night, and never two items sharing an answer or fact (for example, both 1843 items).
- **Region:** at least 4 regions per quiz game per night; no region above 40%.
- **Hero items:** at least 2 items per game per night with a rubric of 22 or more.
- **Festive:** at most 25% in a Christmas event; 0% in non-seasonal events.

## 4. What to commission next (after pilot review)

Fewer, better items in batches of 20–30, reviewed before the next batch is written (see [WORKFLOW.md](WORKFLOW.md)). Priorities, by how far each game is from its minimum pool:

1. **Who Said That?:** 50 verified real quotes. This is the biggest gap, and each quote needs a citation check.
2. **Category Sprint:** about 24 categories, mostly closed sets, with alias lists.
3. **Trivia:** about 35 more to reach 60, focused on Medium and Hard surprises, with regions outside Europe and North America.
4. **Geography and Closest Wins:** about 25–30 each. For Closest, after E1, so items above 1000 can be used.
5. **Word Connections:** 5 more boards, all checked by the solver.
6. **Guess the Year:** once E1 ships, the 15 blocked events come back. Then add events from Africa, Asia, Latin America and Oceania.
