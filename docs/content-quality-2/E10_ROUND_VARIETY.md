# E10 round variety: a bounded proposal (for approval)

**Status:** proposal plus simulation.
- Nothing is wired in.
- `src/content/select.ts` still makes every real selection, unchanged.
- The code is `scripts/content-quality/variety.ts`, with tests in `tests/variety.test.ts` and the numbers in [E10_ROUND_VARIETY_SIMULATION.md](E10_ROUND_VARIETY_SIMULATION.md) (`npm run content:variety-sim`).

## What you approved, and the limits you set

**Approved:** the principle that quiz rounds should avoid excessive repetition of question mechanics.

**The limits you set.** Variety must not:
- make a valid round fail;
- repeat a question;
- break the approved eligibility rules;
- use up the official pool unnecessarily.

You also asked for tests against realistic Cup-sized libraries and against low-content scenarios.

## Finding 1: the first rule was too strict

The rule I proposed in the last round capped every mechanic at two per round. Plain recall questions make up a large share of any real library. In 10-question rounds, the old rule flagged:
- **93–97%** of rounds from a typical library;
- **100%** of rounds from a recall-heavy one.

Even with the variety step, about 40–60% of typical rounds still broke it. A rule that almost every round breaks gives no useful signal.

**The revised rule (E10 v2).** Within one quiz round:
1. A **twist format** (origin story, myth-buster, weird-but-true, definition twist, quote twist) appears at most twice, and never twice in a row.
2. At most **one quote twist** in total (never-said, misquote or misattribution).
3. At most **one negative stem** (a question that hinges on NOT or never).
4. **Plain formats** (recall, recognition, comparison, deduction) are never limited. **Untagged items** are never counted as a problem.

The pilot checker and the simulation share this one definition (`roundProblems`). It still catches the batch-01 problems you found: two "never said" questions and two negative stems in one round.

## The bounded approach

The variety step is a **soft preference inside today's selection**, never a filter.

1. **Same pool as today.** It runs after eligibility and no-repeat filtering, so it can only choose items today's selector could choose.
2. **Same shape as today.** It keeps today's difficulty split (largest remainder) and the category cap exactly. The number of items per game and the difficulty mix don't change.
3. **Bounded look-ahead.** Within each difficulty level, it looks at most **3** candidates past the seeded order and takes the first one that adds no problem. If none of them is clean, it takes the least-bad one.
   - It never refuses a round.
   - It never reaches deep into the pool.
4. **Free reordering.** It then orders the round so a twist format is not back to back. This costs nothing from the pool.
5. **Logged, not hidden.** Any problems that remain are recorded in the game's selection log, which already records why items were picked. The game still starts.

**Window 0 is today's selector exactly.** That is the comparison baseline in every table.

## Results

Typical mix, 40 random libraries per row, whole Cups of 10-question games:

| Pool (official, unused) | Games per Cup | Rounds with a problem: today | With variety (window 3) | Last third of the Cup: today → variety |
|---|---|---|---|---|
| 10 (low content) | 1 | 57% | 43% | 57% → 43% |
| 12 | 1 | 55% | 23% | 55% → 23% |
| 20 | 2 | 43% | 23% | **38% → 45%** |
| 40 | 4 | 44% | 15% | 43% → 30% |
| 80 | 8 | 54% | 12% | 51% → 30% |
| 140 | 14 | 48% | 8% | 45% → 21% |

**The real pilot** (17 tagged Trivia items, one game):
- today's selector produces a problem round 100% of the time;
- variety brings that down to 45%.

The pilot is twist-heavy by design, which is itself a useful warning about content mix (see below).

**Checked by tests on every Cup:**
- the same number of games and items;
- zero repeats;
- the same difficulty split;
- the look-ahead never exceeds its window;
- a pool of exactly 10 items that all share one twist format still produces a round (problems reported, not refused);
- a pool too small for a game is refused before variety ever runs, exactly as today.

## Finding 2: the honest cost

Variety cannot create clean rounds that the pool doesn't contain. It defers the 3rd and later twist questions of one kind, and they pile up for later games.

Over a whole Cup it still cuts problems a lot. But in **small Cups the last game can be slightly worse than today**: with a 20-item pool, the second game has a problem 45% of the time, against 38% today. Every player in that game gets the same questions, so it is not a fairness problem between players. It is a quality dip late in the Cup.

**The real fix is the content mix, not selection.** If more than about 20% of a game's official pool is one twist format, no selector can keep every round to two. So the proposal adds an editor-facing check (not built yet):

- **Content mix warning:** `content:check` warns when any twist format exceeds 20% of a game's official pool, or quote twists exceed 10%.
- **Prerequisite:** library items need a `mechanic` tag first. Today only pilot items have one. Until items are tagged, the variety step changes nothing, because untagged items never count as a problem.

## What approval would mean (nothing here is done yet)

1. Library quiz items get a `mechanic` tag. This is metadata, but it changes each item's content hash. No human approvals exist yet, so none would be voided; after approvals exist, tagging would need re-approval.
2. The content-mix warning is added.
3. The bounded step goes into `selectContent` for official and practice quiz games (Trivia, Geography, Who Said That?), with window 3. It is recorded in the game's selection log, but not in the Cup record: it never changes eligibility, scoring or which games can be played, only the order of preference within the same pool.

**Out of scope:** variety across games in one night, for example Trivia followed by Guess the Year with two origin stories. That needs the night's game plan, which selection does not have today.

## Decisions requested

1. Approve the E10 v2 rule (twist formats only, as above), or adjust the caps.
2. Approve the bounded step with window 3, to be implemented after the library is tagged.
3. Approve tagging the library's quiz items with `mechanic`, and the content-mix warning.
