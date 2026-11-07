# E2 v2 — Category Sprint adjudication (revised proposal)

**Status:** proposal for owner review. Nothing here is implemented. Category Sprint scoring is unchanged.

**What changed from v1:** the peer vote is withdrawn, as the owner ruled. Competing players never decide whether another player's answer counts.

## 1. Principle

An answer counts in official play **only if a published list, fixed before the round, says it does**. That means:
- no host judgement;
- no player votes;
- no list that can be argued with during the round.

So an official category must have a **complete, objectively defined answer set**. Categories that can't (Animals, Things in a kitchen) are **practice only**.

## 2. Official category requirements

| Requirement | Rule |
|---|---|
| Closed set | `closedSet: true`. The category has a definition that decides membership by a named authority or a rule anyone can check, e.g. "UN member states in South America", "the 12 animals of the Chinese zodiac", "the 8 planets and 5 IAU-recognised dwarf planets". |
| Complete list | Every member of the set is in `answers`. The lint fails if `answers.length` differs from the declared `setSize`. |
| Definition shown | The definition is shown with the category name ("Countries in South America — UN members"), so players know the rule before they type. |
| Source | `source.ref` names the authority. `timeSensitive` is set if the set can change (EU members, recognised dwarf planets). |
| Aliases | `aliases: { variant: canonical }` covers spellings, regional names and translations (eggplant → aubergine; sheep and ram → goat; Côte d'Ivoire → Ivory Coast). |
| Known near-misses | `knownNotAccepted: { answer: reason }` (French Guiana: "part of France"), shown in the round's review so a rejection is explained, not argued. |
| Human review | The list, aliases and near-misses are approved by a named editor, like any other item. |

## 3. Normalisation (one canonical form per answer)

Applied to the player's text and to every list entry and alias, before matching:
1. Unicode NFKD, with diacritics removed ("Côte" becomes "cote", "Perú" becomes "peru").
2. Lowercase.
3. "&" becomes "and"; hyphens, underscores, slashes and apostrophes become spaces.
   - **This fixes a current defect:** today "go-kart" becomes "gokart" and doesn't match "go kart".
4. Any other non a–z character is removed; spaces are collapsed.
5. Leading articles are dropped ("the", "a", "an").
6. Plurals are folded to singular with a small rule set (-ies → -y, -es/-s → nothing), plus an explicit irregular table (mice → mouse, geese → goose, oxen → ox).
   - Folding is used only when it lands on a listed answer; "Paris" never becomes "Pari".
7. Alias lookup to the canonical answer.
8. **Typo tolerance:** one edit (Damerau–Levenshtein) for answers of 6 or more letters, and **only when exactly one canonical answer is within one edit and no other canonical answer is within two**. So "Venezuala" counts, but *mouse*/*moose* or *Iran*/*Iraq* never merge.
   - The editor can turn this off per category (`typoTolerance: false`), e.g. for element symbols.

## 4. Duplicate protection (scoring itself unchanged)

Validity and uniqueness are computed on the **canonical** answer:
- One player's answers that share a canonical form count once. Today a player could submit "sheep" and "goat" and, if both were listed, score twice.
- "Unique" means no other player gave the same **canonical** answer, so "eggplant" and "aubergine" from two players are not both unique.
- Points are as today: 20 per valid distinct answer, plus 20 if nobody else gave it. Changing the canonicalisation changes which typed answers are equivalent, not the points table. It still changes outcomes, so the owner should approve it before it ships.

## 5. Suitability for official play (set size vs players)

Each player gives up to **5** answers. A category is suitable when every player can reach 5 valid answers without the uniqueness bonus becoming either automatic or impossible.

| Players | Minimum set size | Why |
|---|---|---|
| 2–4 | 12 | Room for 5 answers each, and real choice about going for rarer ones |
| 5–8 | 20 | With 25–40 answers submitted, a 12-item set makes "unique" nearly impossible |
| 9+ | 30 | Same reasoning, scaled |

Also required:
- **Not trivially enumerable in order.** "Months of the year" (12) fails: everyone lists January to May, so the round measures nothing. Flag sets with a universal ordering unless the night wants that.
- **Every member is gettable.** A set padded with obscure members (all 118 elements) is fine. A set where most members are obscure (the IAU constellations by Latin name) is Hard and should be rare.

Selection would filter official categories by `setSize` against the roster size (an engine change that needs owner approval, like E1's interim rule).

### Examples

| Category | Size | Official? | Notes |
|---|---|---|---|
| Countries in South America (UN members) | 12 | 2–4 players | Near-misses: French Guiana, Falklands |
| Animals of the Chinese zodiac | 12 | 2–4 players | Aliases: sheep/ram → goat, rooster/chicken, ox/buffalo. **Decision needed:** whether to accept "cat" (Vietnamese zodiac) as an alias of rabbit |
| Planets and dwarf planets (IAU) | 13 | 2–4 players | Time-sensitive |
| US states | 50 | any size | |
| African UN member states | 54 | any size | Time-sensitive; aliases for French/English names |
| EU member states | 27 | up to 8 | Time-sensitive |
| Chemical elements | 118 | any size | Typo tolerance off for symbols |
| Months of the year | 12 | No | Universal order |
| Colours of the rainbow | 7 | No | Too small |
| Animals, Jobs, Things in a kitchen | open | **Practice only** | No complete list |
| Things that are cold | open | **Retire** | No definition at all |

## 6. Practice mode for open categories

Open categories stay playable in practice with today's list matching. Two changes are proposed for clarity, not for scoring:
- After the round, an unlisted answer shows as "Not on our list", not "wrong".
- Players can tap "Suggest for the list". That logs the answer for an **editor** to review between Cups. It never changes points, in practice or in official play, and players never see who suggested what.

The answer log then grows the lists from real play (WORKFLOW.md §5, item 6).

## 7. Implementation outline (after approval)

1. Schema: `closedSet`, `setSize`, `definition`, `aliases`, `knownNotAccepted`, `typoTolerance`. Lint:
   - `setSize` equals the list length;
   - aliases point to canonical answers;
   - an alias is never itself canonical;
   - no near-miss is accepted.
2. `normalizeSprintAnswer` v2 and canonical matching, with a versioned rule so **Cups already in progress keep the matcher they started with**, like the per-Cup qualification policy (Sprint 4).
3. Official selection: only `closedSet` items, filtered by roster size.
4. Results screen: the full answer list, near-miss reasons, and "Not on our list" for practice.
5. Tests:
   - a normalisation table;
   - aliases can't double-score;
   - *mouse*/*moose* and *Iran*/*Iraq* aren't merged;
   - "unique" is decided on canonical forms;
   - the suitability filter;
   - an old Cup keeps its matcher;
   - exactly-once scoring across a restart.

## 8. Decisions for the owner

1. Approve closed-set-only official Category Sprint, with open categories in practice.
2. Approve normalisation v2, including the typo-tolerance rule. It changes which typed answers count, so it changes outcomes.
3. Approve the set-size table, or set different thresholds.
4. Zodiac "cat": accept as an alias of rabbit, or not.
