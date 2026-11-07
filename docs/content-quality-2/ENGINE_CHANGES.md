# Engine-level changes needed for content quality

**Status:** proposals only. Nothing on this branch changes engine behaviour, scoring or selection. Items marked **needs owner approval** change how points are won and must not ship without explicit sign-off.

Priority: **P0** = integrity issue in official play today; **P1** = needed for the editorial standard; **P2** = improvements.

| ID | Change | Why | Priority | Owner approval? |
|---|---|---|---|---|
| E1 | Per-item numeric input range | 14 official Closest items can't be answered correctly | **P0** | Interim selection rule: yes |
| E2 | Category Sprint adjudication: normalisation, aliases, peer challenge | Lists reject valid answers; aliases can score twice | **P1** | **Yes (scoring)** |
| E3 | Show the reveal/explanation in every quiz game | Explanations exist in the data, but no screen shows them | **P1** | No |
| E4 | Two-option "higher or lower" questions | Four options force joke distractors | P1 | No (same per-question scoring) |
| E5 | Who Said That? question line plus a verified-quote mode | Fictional cast is trivial or arbitrary | P1 | No |
| E6 | Year tolerance by era | Ancient events score as harshly as 2007 events | P2 | **Yes (scoring)** |
| E7 | Calibration telemetry (per-item correct rate) | Difficulty labels are guesses until measured | P2 | No (local data only) |
| E8 | Math Mayhem round progression | Rounds are uniformly random today | P2 | No (same scoring) |
| E9 | Mix-aware selection (difficulty arc, region, category) | Today's selection is random within the eligible pool | P2 | Changes which items appear, so yes |
| E10 | Charades accepted answers (Sprint 4 design) | Needed before Charades could ever count | P2 | Yes (would make it official) |

---

### E1 — Per-item numeric input range (P0)

**Problem.**
- `MchezoYear.tsx` clamps guesses to 1896–2025.
- `MchezoClosest.tsx` clamps to 0–1000.
- `NumericGuess` truncates to whole numbers.
- The server accepts any finite number, so the clamp is client-only.

14 official-eligible Closest items (cls-legacy-2, cls-legacy-4, and verified-computed cls-c-01–05, 10, 12, 13, 18–21) have answers above 1000. Every player is clamped to 1000; ranks tie and everyone gets the same award, so the round is wasted, though it counts. Fifteen provisional Year items fall before 1896.

**Change.**
- Add optional `input: { min, max, step }` to `ClosestItem` and `YearItem`.
- Default it from the answer with a generous, non-revealing envelope (Closest: 0 to 10^ceil(log10(answer × 4)); Year: 1000 to the current year).
- Materialise it into the question state and project it to the client.
- `NumericGuess` uses it, and allows decimals when `step < 1`. For signed values, allow `min < 0` (absolute zero).
- Lint error if the answer is outside its range, or sits at the very edge (that would hint at it).

**Interim (needs owner approval):** until E1 ships, selection skips items whose answer the client can't accept. It is one predicate in `select.ts`, with a test.

**Tests:**
- schema range validation;
- projection includes the range;
- the client accepts 5570 and 42.195 when allowed;
- a driver enters an out-of-old-range answer.

### E2 — Category Sprint adjudication (P1, **needs owner approval**)

**Problems.**
- Lists of 27–38 answers reject common valid answers, and the uniqueness bonus makes this worst for the most creative players.
- `normalizeSprintAnswer` deletes non a–z characters, so "go-kart" becomes "gokart", which isn't in the list ("go kart"), and "crème" becomes "crme".
- Two players giving *sheep* and *goat* for the same zodiac animal would each be "unique". One player could also submit both and score twice, once aliases are listed.

**Proposed handling (no host advantage).**

1. **Normalisation** (no scoring change):
   - NFKD with diacritics stripped;
   - hyphens and underscores become spaces;
   - "&" becomes "and";
   - articles dropped ("the", "a");
   - simple plurals folded (*-s*, *-es*, *-ies*→*-y*);
   - an explicit irregular-plural table (mice → mouse, geese → goose).
2. **Aliases:** `aliases: { variant: canonical }` in the schema. Validity and uniqueness are computed on the canonical form, so a player can't score the same canonical answer twice.
3. **Typo tolerance:** one edit (Damerau–Levenshtein) for answers of 6 letters or more, and only when it maps to exactly one listed answer that isn't itself a different valid answer (so *mouse*/*moose* never merge).
4. **Unlisted answers go to a peer challenge**, not to the host:
   - After the round, each unlisted answer is shown anonymously.
   - Every player except its author votes **accept** or **reject** within 15 seconds.
   - The host votes like any player, with no override.
   - It is accepted on a strict majority of votes cast; a tie, or no votes, rejects. This keeps the default conservative.
   - Peer-accepted answers score the **base** 20 points but **not** the uniqueness bonus (removes the incentive to invent obscure answers and lobby for them). This rule is the main scoring decision the owner should make.
   - It requires at least 3 players; otherwise unlisted answers are rejected.
5. **Closed-set categories** (`closedSet: true`) skip the peer challenge: the list is complete by definition.
6. **Shown rejections:** `knownNotAccepted: { answer: reason }` displays *why* (e.g. "French Guiana is part of France").
7. **Answer log** (local) feeds list growth.

**Tests:**
- normalisation table;
- an alias can't double-score;
- `mouse`/`moose` aren't merged;
- peer vote with the author excluded;
- a tie rejects;
- the host has no override;
- the closed-set path;
- exactly-once scoring after the vote, with replay and reconnect.

### E3 — Reveal for every quiz game (P1)

**Finding.**
- `TriviaItem`, `GeographyItem` and `ClosestItem` have `explanation`, and `YearItem` has `context`. `materialize.ts` carries them into the game state (Closest's as `source`).
- **No player or TV screen renders them today.** A search of `apps/web/src` finds `explanation` only in the Studio schedule, which explains games, not items.
- `WhoSaidItem` has no explanation field at all.
- The quiz question view (`quizQuestionsView` in `src/server/room.ts`) uses an allowlist. It sends the correct option only for Trivia, and only after the game finishes. That is good for privacy, but it means Geography and Who Said That? players are never shown the right answer.

So the reveal, where most of an item's value lands, is currently invisible.

**Change.**
- Add optional `explanation` to `WhoSaidItem`.
- Show the explanation or context on each question's reveal, for all quiz and numeric games, on phone and TV.
- It appears only after answers lock, so the privacy projection rules are unchanged; a test should assert that it isn't in any pre-lock projection.

### E4 — Two-option comparisons (P1)

Geography `higher-lower` requires four options, which forces joke fillers ("Neither is land"). Allow `options` of length 2 for `mode: "higher-lower"` (the schema becomes a discriminated union). The client already lays out answer slabs; it needs a two-slab layout. The scoring per question is unchanged; the expected guess rate rises to 50%, so difficulty labels should account for it.

### E5 — Who Said That? question line and verified-quote mode (P1)

Add optional `question` (e.g. "Who first put this in print?") shown above the quote. This is needed for misattribution items such as who-cq2-02.

Add `source.kind: "reference"` as a **requirement** for official Who Said items, and a lint error for `original-fiction` items marked official. This moves the fictional cast to practice without deleting it. The reclassification needs owner approval because it changes what is official; the lint rule can ship as a warning first.

### E6 — Guess the Year tolerance by era (P2, **needs owner approval**)

The score is `max(0, 100 − 10 × |guess − year|)`. For 2007 this is fair; for 1066 it rewards only exact recall. Proposal: an item-level `tolerance` (years per 10 points), defaulting by era: 1 since 1900, 2 for 1800–1899, 5 for 1500–1799, 10 before 1500. Exact answers still score 100. This is a scoring change, so it isn't implemented.

### E7 — Calibration telemetry (P2)

Record, per item and per game, `{ itemId, answeredCorrectly | distance, playerCount }`, locally in the room's data directory, with no personal data beyond what the room already stores. A `content:calibrate` report compares this with the difficulty label. No external service, so it fits the $0 target.

### E8 — Math Mayhem progression (P2)

`generateMathQuestions` picks one of 5 kinds uniformly at random. Proposed: kind and size follow the round index (Editorial Standard §4), plus a "fast estimate" kind with far-apart options for the last rounds. It stays deterministic per seed and verified by code; scoring is unchanged.

### E9 — Mix-aware selection (P2; changes which items appear)

Extend `select.ts` (deterministic per Cup, no repeats) with soft constraints: the difficulty arc, at most 2 per category, at least 4 regions, no shared answers (`answerKey` tag) and the festive share. Use seeded constrained sampling so results stay reproducible and testable. Needs owner sign-off because it changes which items a Cup gets.

### E10 — Charades accepted answers (P2)

As designed in Sprint 4 (`docs/SPRINT_4_DESIGN_SYSTEM_NOTES.md`): `acceptedAnswers` on `CharadesItem`, guesser-typed answers checked by the server, plus the "I know it!" route confirmed by the actor. The pilot's charades items include proposed `acceptedAnswers`. Charades stays practice-only until the owner approves otherwise.
