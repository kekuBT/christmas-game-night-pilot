# Proposal: stable answer IDs and display names for Category Sprint

**Status:** proposal only (owner request, 2026-11-07). Nothing here is implemented. The matcher is unchanged, and the NFL draft stays practice-only. A further review is needed before any of it is built.

## The problem

Today one string does three jobs. The canonical answer (for example `san francisco ers`) is:
- the **identity** of a member, used for duplicates and uniqueness;
- the **match key** players' typing is compared with;
- the **text shown** in results ("All 32 accepted answers").

The v2 normalisation keeps letters and spaces only. That is right for matching typed text, but wrong for identity and display:

| Member (source) | v2 canonical | Effect |
|---|---|---|
| San Francisco 49ers | `san francisco ers` | Shown as "san francisco ers". "49ers" alone normalises to `ers`, so the NFL draft needs an `ers` alias, which is odd and would also accept a bare "ers" |
| Nidoran♀, Nidoran♂ (Pokémon #29, #32) | `nidoran`, `nidoran` | Two members collapse into one. The closed-set check refuses the list, so the category can't exist |
| Côte d'Ivoire | `cote d ivoire` | Shown without its accents and apostrophe |
| Congo vs DR Congo; New York, Los Angeles (NFL) | — | Ambiguity is handled by hand-written known non-answers, one category at a time |

## Proposal

Two independent steps. Step 1 is small and safe. Step 2 changes matching and needs your review.

### Step 1: display names only (no scoring change)

- At game start, each closed-set category also stores `display: { canonical → display name }`, taken from its reference list's `members` (for example `san francisco ers` → "San Francisco 49ers").
- Results show the display name, both for "All accepted answers" and for "counted as …" next to each answer.
- Matching, scores and canonical strings stay exactly as they are.
- **Compatibility:** games saved without `display` render as today. Nothing is re-scored.
- **Tests:**
  - results for a new game show "San Francisco 49ers" and "Côte d'Ivoire";
  - a restored old game, with no `display`, renders its canonical strings and keeps identical scores;
  - the player projection never includes another player's answers through the new field.
- **Effort:** about half a day.
- **Limits:** this fixes how answers look. It does not fix 49ers matching or the two Nidorans.

### Step 2: member IDs and matcher v3 (needs review before building)

1. **Stable member IDs.**
   - Reference entries may become `{ "name": "Nidoran♀", "id": "nidoran-f" }`. A plain string stays valid, and its ID is the slug of the name with digits kept (`san-francisco-49ers`).
   - IDs are permanent: renaming a member never changes its ID.
2. **Normalisation v3 = v2 plus digits.**
   - `0-9` survive, so "49ers" becomes `49ers` and "Area 51" becomes `area 51`. This is the only generic change.
   - Symbols such as ♀ and ♂ are never guessed. Each category lists its own keys instead, such as `nidoran female`, `nidoran f` and `female nidoran`.
3. **Keys point to IDs, not to strings.**
   - Each category builds a key table from its member names and its aliases. Each key maps to one or more member IDs.
   - **One ID:** the answer is valid.
   - **Two or more IDs:** the answer is an **ambiguous near-miss**, automatically, with a reason naming the choices ("Two members match 'nidoran': Nidoran♀ or Nidoran♂"). The Congo ruling, New York and Los Angeles then follow from the data, without hand-written entries. The scoring effect is the one you approved for Congo: an ambiguous answer scores nothing.
4. **Duplicates and uniqueness are decided on member IDs.** Points are unchanged: 20 per valid answer, +20 if unique, at most 5 answers.
5. **The game snapshot** records `matcherVersion: 3` and, per category, `members: [{ id, display }]` and its key table. Answer reviews record `memberId`.
6. **The closed-set check (v3)** requires:
   - every ID is unique;
   - every member is reachable by at least one key that maps to it alone;
   - members equal the reference exactly, as today.

**Compatibility, following the same pattern as Congo and E10:**
- The Cup records its matcher when it is created (`categorySprint.matcher`), and each game records its own.
- v1 and v2 games and Cups keep their matcher and data for life. Only Cups created after approval get v3.
- Restore tests cover a v1 Cup, a v2 Cup with `answerRules` absent, and a v2 Cup with rules 2.

**Tests to write with it:**
- "49ers", "Niners", "San Francisco 49ers" and "SF 49ers" (if listed) all count as one member, and a bare "ers" is not on the list;
- "Nidoran female" and "Nidoran male" are two members, a bare "Nidoran" is an ambiguous near-miss, and both scored by one player count twice;
- uniqueness on ID: "Niners" and "49ers" from two players are shared, not unique;
- v2 and v1 games are byte-identical before and after (scores and reviews);
- the closed-set v3 check refuses duplicate IDs and refuses a member reachable only through an ambiguous key;
- a property test: no key from one category ever matches in another.

**Effort:** about 1–2 days with the tests.

**Unchanged by either step:**
- The Pokémon source is still blocked: pokemon.com refuses automated access, so another authoritative list would be needed.
- Sizes and the capacity limit for 9–10 players.
- Provisional status: nothing becomes official without your approval.

## Recommendation

1. Real-device testing first (`docs/REAL_DEVICE_TESTING.md`).
2. Then Step 1, if the test session shows the normalised names bother players.
3. Step 2 only when a category we want needs it (NFL, Pokémon), after your review of this design.
4. **NFL stays practice-only until Step 2 is approved, built and reviewed.**
