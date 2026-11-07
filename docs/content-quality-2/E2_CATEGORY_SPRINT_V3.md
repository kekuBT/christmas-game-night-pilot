# E2 v3 — Category Sprint: final design for approval

**Status:** approved in principle by the owner on 2026-11-07, with corrections, and **implemented on branch `claude/cq2-e2-sprint-v3`** (not merged or deployed).
- See §9 for the owner's corrections and how each one is implemented.
- §5 Rule 4's fallback is **withdrawn**: there is no fallback.
- This file supersedes [E2_CATEGORY_SPRINT_V2.md](E2_CATEGORY_SPRINT_V2.md), which is kept for history.

## 0. Owner rulings already applied

| # | Ruling | How v3 applies it |
|---|---|---|
| 1 | Closed-set-only official competition: approved in principle | §1 |
| 2 | Normalisation and aliases: approved in principle, with precise category-specific definitions and regression tests; sheep and goat are not universal synonyms | §3. Every alias belongs to one category and carries a written reason. There is no global synonym table. |
| 3 | Set-size thresholds: revise, backed by simulation | §5, plus [E2_SET_SIZE_SIMULATION.md](E2_SET_SIZE_SIMULATION.md) |
| 4 | Chinese zodiac: *cat* is not a synonym for rabbit | §6. *cat* is a known near-miss with an explanation. The Vietnamese zodiac would be its own category. |
| — | Peer voting is not used | No player or host ever decides validity. |

## 1. Principle (unchanged from v2)

An answer counts in official play only if the category's published list, fixed before the round, says it does.

Open categories (Animals, Things in a kitchen, Words that rhyme with cake) stay **practice only**.

## 2. Official category record

| Field | Rule |
|---|---|
| `closedSet: true` | Membership is decided by a named authority or a rule anyone can check. |
| `definition` | Shown under the name before typing starts, e.g. "Countries in South America (UN members)". |
| `answers` | Every member of the set, in canonical form. The lint checks `answers.length === setSize`. |
| `recallProfile` | One of `even`, `famous-first`, `obscure-tail` or `dominant`, chosen by the editor (§5). |
| `aliases` | `{ variant: { to: canonical, reason } }`. They apply **only within this category**. |
| `knownNotAccepted` | `{ answer: reason }`. Shown in the results so a rejection is explained, not argued. |
| `typoTolerance` | Defaults to on. It can be turned off per category (e.g. element symbols). |
| `source`, `timeSensitive`, `reviewBy` | The authority, and a review date if the set can change. |

## 3. Normalisation and aliases (category-scoped)

### Generic normalisation

This is the same for every category, because it never changes meaning:
1. Unicode NFKD, then remove diacritics.
2. Lowercase.
3. Turn `&` into "and". Turn hyphens, underscores, slashes and apostrophes into spaces.
4. Remove other non-letters and collapse spaces.
5. Drop a leading "the", "a" or "an".
6. Fold the plural, **only if the folded form is a listed answer or alias**.
7. Apply typo tolerance:
   - One edit is allowed for answers of 6 or more letters.
   - It applies only when exactly one canonical answer is within one edit and no other canonical answer is within two.

### Aliases

Aliases are **not** generic. Each alias exists because of a documented fact about *that* category:
- **Zodiac:** "sheep" and "ram" map to *goat* because the zodiac sign 羊 (yáng) is translated as Goat, Sheep or Ram in standard references. The mapping is about the sign, not the animals. In "Farm animals", sheep and goat stay separate answers.
- **Lint:**
  - every alias points to a canonical answer;
  - an alias is never itself canonical;
  - every alias has a non-empty reason;
  - no near-miss is accepted.

### Regression tests required before release

1. **Normalisation table:** "go-kart" → "go kart", "Côte d'Ivoire" → "cote d ivoire", "The Netherlands" → "netherlands".
2. **No cross-category leakage:** "sheep" is accepted as *goat* in the zodiac but rejected as *goat* in a farm-animals list that contains both.
3. **Aliases can't double-score:** "goat" plus "sheep" from one player count once.
4. **Uniqueness is decided on canonical forms:** "eggplant" (player A) and "aubergine" (player B) are not unique.
5. **Typo guard:** *mouse*/*moose* and *Iran*/*Iraq* never merge. "Venezuala" matches.
6. **Pinned matcher:** a Cup in progress keeps the matcher version it started with.
7. **Exactly-once scoring** across a server restart.

## 4. Scoring (unchanged)

- 20 points per valid distinct answer, plus 20 if no other player gave the same canonical answer. Each player gives up to 5 answers.
- v3 changes which typed strings are equivalent, not the points table. Because that still changes outcomes, it needs your approval before it ships.

## 5. Set size: simulation-backed policy

**Room size.** Category Sprint allows **4–10 players** (`src/games/manifest.ts`). So v2's "2–4 players" row was partly meaningless and has been removed.

### The model

The model lives in `scripts/content-quality/sprint-sim.ts` and is tested in `tests/sprint-sim.test.ts`.
- Each player writes up to 5 answers from the members they know.
- Better-known members come to mind first.
- The model is checked against the exact formula for even recall:
  - P(an answer is unique) = (1 − 5/N)^(players − 1).
  - For N = 12 and 4 players, that is (7/12)³ ≈ **20%**. Only one valid answer in five earns the bonus, and a round where nobody earns it is common.

### What "suitable" means

The bonus must stay a real target, and nobody may be starved of answers. Concretely:
- at most 5% of players run short of 5 valid answers;
- 20–70% of valid answers earn the bonus;
- at most 10% of rounds award the bonus to nobody.

### Minimum set size by recall profile

Full tables are in [E2_SET_SIZE_SIMULATION.md](E2_SET_SIZE_SIMULATION.md).

| Recall profile | 4 | 5 | 6 | 7 | 8 | 9 | 10 players |
|---|---|---|---|---|---|---|---|
| Even | 13 | 18 | 20 | 24 | 27 | 30 | 35 |
| Famous-first (typical) | 13 | 18 | 24 | 24 | 30 | 35 | 40 |
| Obscure tail | 35 | 35 | 35 | 35 | 35 | 35 | 40 |
| Dominant few / recited in order | 18 | 18 | 24 | 35 | 50 | 70 | 118 |

### Proposed policy

**Rule 1.** Official only if `setSize ≥ max(15, 4 × players)`:

| Players | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|
| Minimum members | 16 | 20 | 24 | 28 | 32 | 36 | 40 |

A test confirms this rule meets the policy for famous-first recall at every room size.

**Rule 2. Obscure tail:** at least 35 members, and the editor confirms a typical player can name at least 10 of them.
- Otherwise players run out of answers, and the round measures trivia depth rather than recall.

**Rule 3. Dominant or recited-in-order sets** (zodiac, months, the days of the week, the planets in order): not official, unless the size meets the "dominant" row.
- In practice that means practice-only.

**Rule 4. Selection.** Official selection filters by the room's player count when the game starts. ~~If no category fits, it falls back to the largest eligible set.~~ **Withdrawn by the owner:** if no suitable category is left, the start is refused with a plain explanation and an offer of practice (§9).

### Caveat

This is a model with chosen parameters, not play data. It ranks sizes; it does not promise rates. When E7's answer logs exist, they should be used to refit the profiles.

## 6. Examples, re-checked for real room sizes

| Category | Size | Profile | Verdict |
|---|---|---|---|
| Countries in South America (UN) | 12 | famous-first | **Practice only.** 12 fails even 4 players (≈19% bonus rate). This changes v2's verdict. |
| Animals of the Chinese zodiac | 12 | dominant (recited in order) | **Practice only.** *cat* is a known near-miss: "the Cat replaces the Rabbit in the Vietnamese zodiac, not the Chinese one". |
| Vietnamese zodiac | 12 | dominant | A separate practice category if wanted. It is never merged with the Chinese one. |
| Planets and dwarf planets (IAU) | 13 | dominant | **Practice only.** Players recite the planets in order. |
| EU member states | 27 | famous-first | Official for 4–6 players. Time-sensitive; review yearly. |
| US states | 50 | famous-first | Official for 4–10 players. |
| UN member states in Africa | 54 | obscure tail | Official for 4–10 players, if editors confirm "can name 10". |
| Chemical elements | 118 | obscure tail | Official for any room. Typo tolerance off for symbols. |
| Original 151 Pokémon (themed "Gaming" pack) | 151 | obscure tail | A themed-pack candidate, any room size. It is not in Mixed Party Night (fandom depth). |
| Months, colours of the rainbow, days of the week | 7–12 | dominant | Not official. |

The pilot now carries one example in each state:
- `spr-cq2-05` US states (an official candidate);
- `spr-cq2-02` the zodiac, revised and practice only;
- `spr-cq2-01` South America and `spr-cq2-03` planets, moved to practice;
- `spr-cq2-04` rhymes (open set, practice).

## 7. Implementation plan (after approval)

1. Schema fields from §2, plus the lint rules from §3 and §5.
2. Versioned matcher v2. The Cup records its matcher version, like the Sprint 4 qualification policy.
3. Selection filter by player count.
4. Results screen: the full list, near-miss reasons, and "Not on our list" in practice.
5. Regression tests from §3.

**No step starts without your go-ahead.**

## 8. Decisions requested

1. Approve the size policy in §5: Rules 1–3, the suitability definition, and the selection filter.
2. Approve normalisation v2, with category-scoped aliases (§3), and its test list.
3. Confirm the example verdicts in §6, especially that South America, the zodiac and the planets become practice-only.

## 9. Owner corrections (2026-11-07) and how they are implemented

| Correction | Implementation | Test |
|---|---|---|
| **No fallback** to the largest category when none suits the room | `selectContent` returns `no-suitable-category`. The room refuses the start with code `NO_SUITABLE_CATEGORY` and the message "…You can play Category Sprint as practice instead." Practice still starts. | `tests/sprint-e2v3.test.ts`: "no suitable official category…", "when no suitable category is left…" |
| **Verify complete canonical membership** against the source, not a count | Each closed set has a published list in `content/reference/sprint/<id>.json`, naming the authority, its URL and its published count. When content loads, the item's answers must **equal** the canonical forms of those members: no member missing, no extra answer, and the list's length must match the published count. An item that drifts is skipped and reported. **A real approval is refused until a person records a `sourceCheck`** on the reference, having compared the list with the source page. | "the right size with a wrong member fails", "an item whose list drifts…never loads", "a real approval…is refused until…source check" |
| **Aliases scoped to one category, each with a reason** | `aliases: { variant: { to, reason } }` on the item. There is no global table. The checks: an alias points to a member, is never a member itself, and is never also a near-miss. | "sheep is the zodiac Goat, but stays sheep…", "alias rules…" |
| **Canonical duplicate protection** | Matcher v2 de-duplicates and decides uniqueness on canonical answers. | "goat + sheep…count once", "aubergine is not unique next to eggplant" |
| **Freeze eligibility and the matcher version at game start** | The Cup record carries `categorySprint: { matcher: 2, sizePolicy: 1 }`, fixed at creation. Each game stores `matcherVersion`, plus for official games `eligibility: { players, sizePolicy }` decided from the roster at start. Scoring always uses the game's own version. | "a new Cup records…", "a game saved with v2 is still scored with v2 after a restart…" |
| **Preserve historical Cup behaviour** | A Cup without `categorySprint` (created before this change, or restored from older snapshots) keeps matcher v1 and Sprint 4 selection, through any number of saves. A game without `matcherVersion` is v1. The v1 normaliser is unchanged byte for byte. | "a Cup created before E2 v3 keeps v1…", "matcher v1 is preserved…" |
| **Simulation thresholds are provisional** | Size policy v1 is versioned and recorded in every official game, so a recalibrated v2 (from E7 real-play logs) can ship for new Cups without re-ruling old ones. | "the rule is never looser than the simulation's minimum…" |
| **Example verdicts approved** | South America, Chinese zodiac, planets: practice. US states: official candidate. | "approved example verdicts hold…" |

### Content added (all provisional, nothing approved)

`content/packs/category-sprint-closed.json` holds 7 closed sets: US states, EU members, UN members in Africa, chemical elements, South America, the Chinese zodiac, and planets plus dwarf planets. The script is `scripts/content-quality/revisions/e2_closed_sets.py`.

**Open categories are now practice-only.** The 14 open Sprint 4 categories that were marked official are now practice (eligibility only; review status unchanged). A content-check error stops any open category being marked official again.

**Membership lists: not yet compared with their sources.**
- The lists were transcribed by the author. This session's network blocks census.gov, europa.eu, un.org, iupac.org, iau.org and wikipedia.org, so no member-by-member source check was possible.
- Web search confirmed the published counts only: EU 27, UN Africa 54, IAU 5 dwarf planets.
- Every reference therefore has **no `sourceCheck`**. `content:check` warns on each one, and the loader would refuse a real approval.

### What players see

- **While typing:** the category and its definition, for example "Counts: The 50 US states (not DC or territories)".
- **After the game:** each player sees only their own answers, judged as unique, shared, repeat, not accepted (with the reason, e.g. "The Cat replaces the Rabbit in the Vietnamese zodiac…"), or not on our list. Everyone, including the TV, sees the full accepted list.
- **Never:** another player's answers. No list is visible while the game is playing.
