# Mchezo Editorial Standard 2.0

**Status:** draft for owner review (Content Quality 2.0). Claude wrote this standard. It doesn't change any item's status, approve anything, or change any scoring rule.

**The question every item must answer:** *Would this make people react, think, laugh, argue about their guesses, or learn something genuinely interesting?*

An item that only checks a fact everyone already knows fails, however correct it is. So does an item that is hard only because it is obscure.

---

## 1. Two kinds of requirements

### 1a. Mandatory gates (pass or fail, before any scoring)

An item that fails any gate isn't eligible for official play, whatever its rubric total.

| Gate | Passes when |
|---|---|
| **G1 Correct** | The answer is true, and a **named person** has checked it against the source basis stated on the item. Automated checks never satisfy this gate, except for `computed` items whose formula the test re-evaluates. |
| **G2 One answer** | Exactly one option (or one value, or one partition for Connections) is defensibly right. Known edge cases are written in `ambiguity`, and the wording excludes them. |
| **G3 Clear** | Readable on a phone in under 8 seconds (a prompt of 140 characters or fewer is a strong guide). No double negatives, and no undefined jargon. Qualifiers (date, unit, convention) are in the prompt, not only in the reveal. |
| **G4 Objective scoring** | A machine can score it, or (social games only) votes do. No host judgement in official play. |
| **G5 Enterable** | The correct answer can be entered with the game's input. Today's client caps Guess the Year at 1896–2025 and Closest Wins at 0–1000 (whole numbers): see engine change E1. |
| **G6 Dated if perishable** | Facts that can change (records, office holders, counts, populations) carry `timeSensitive` with a review date, or are phrased with a fixed time window ("between 1969 and 1972"). |
| **G7 Safe for the table** | No real private individuals, nothing that punches down, no politics or religion as the joke, nothing a child at the table shouldn't read. |

### 1b. Quality rubric (scored 1–5 on five dimensions)

| # | Dimension | 1 (fails) | 3 (acceptable) | 5 (excellent) |
|---|---|---|---|---|
| R1 | **Entertainment and memorability** | Nobody reacts | A nod: "ah, right" | Gasps, laughs, "no way!", or people repeat it afterwards |
| R2 | **Creativity and originality** | A textbook or quiz-machine question | A familiar fact asked from a fresh angle | A new angle on something familiar, or a genuinely new thing worth knowing |
| R3 | **Clarity, accuracy and fairness** | Ambiguous or arguable | Clear; needs one qualifier | Crisp, unambiguous, provable, with no trick wording |
| R4 | **Difficulty and distractors** | Joke or made-up options; label far from reality | Options plausible; label roughly right | Every option tempts somebody for a reason; the difficulty label matches the expected correct rate |
| R5 | **Social and accessibility** | Only one niche or one country can play | Most of the table can take a guess | Everyone can engage (reason, guess, laugh), and the reveal starts conversation |

**Acceptance bar:** all gates pass, **and** a total of at least **18/25**, **and** no dimension below **3**. A clarity (R3) score below 4 also means an editor must decide on the wording before review.

**Target for the library, not each item:** an average of 20 or more, and at least a quarter of every set at 22 or more (these are the "hero" items that make a night memorable).

Scoring is quick by design: score each dimension in a few seconds against the anchors above, and write one sentence for "why include it". If the sentence is hard to write, the item probably fails R1 or R2.

---

## 2. Difficulty calibration

Difficulty describes the **expected share of adult players who answer correctly**, not how the author feels about the question.

| Label | Expected correct | What it feels like |
|---|---|---|
| Easy (1) | 70–90% | Most people know it, or can work it out quickly; a confident start |
| Medium (2) | 40–70% | The table splits; good distractors do the work |
| Hard (3) | 15–40% | Few know it, but those who don't can still reason or guess sensibly |
| *(Too easy)* | above 90–95% | Not an item: nothing is tested. Use only as a deliberate warm-up, at most 1 per 20 |
| *(Too hard)* | below 15% | Usually obscure-and-uninteresting. Allowed only if the reveal is outstanding (R1 = 5) |

Rules:
- **Common knowledge is never Hard.** "Who painted the Mona Lisa?" is Easy at best, and it is labelled Hard in today's library (trv-arts-059 is Medium; trv-geog-119 "capital of Canada" is Hard). The audit found 42 miscalibrated items.
- Labels are **estimates until real data exists**. Each item records `expectedCorrect`. After launch, recalibrate from observed correct rates (engine change E7): an item is relabelled when 30 or more answers put it outside its band.
- For numeric games (Closest Wins, Guess the Year), difficulty means how widely the guesses spread, so the label is "how far off a typical player is" (Easy: most people within about 10%, or within 5 years).
- Consider **who** is at the table: a fact that is Easy in the UK may be Hard in Kenya. Add `CULTURAL-CONCENTRATION` notes (section 5) instead of pretending one label fits everyone.

---

## 3. Writing rules (all quiz-style games)

1. **Ask about the surprise, not the obvious part.** "Which planet has rings?" (95%+ correct) becomes "How many planets have rings?" (four: 25–45%).
2. **Every distractor must tempt someone for a reason**: a common misconception, a near neighbour, or the famous-but-wrong answer. Never use joke options ("A wall of ice", "Neither is a mountain") or invented terms ("Proton cloud").
3. **No tells.** The answer mustn't be the uniquely longest option more than about 1 time in 4 across a set (the pilot checker warns above 35%), mustn't follow an arithmetic pattern (106/206/306/406), and mustn't appear in the prompt ("Sydney Opera House: which city?").
4. **One fact, one game.** A fact lives in exactly one game. The audit found 32 duplicates (piano keys, bones, marathon, capitals in both Trivia and Geography).
5. **Qualifiers go in the prompt:** "botanically speaking", "counting overseas territories", "between 1969 and 1972", "in a straight line".
6. **Prefer provable answers.** If an answer depends on a convention (coastline length, number of islands), name the convention or drop the item.
7. **The reveal is part of the item.** Every item has a one-line reveal that adds something: why, the twist, or the misconception explained.
8. **Arithmetic belongs to Math Mayhem.** Trivia and Closest Wins don't ask sums.
9. **Plain international English.** Avoid UK- or US-only vocabulary in prompts, or give both ("crisps (chips)").

---

## 4. Per-game guidance

Each game has a job. Content that would be better in another game moves there.

### Trivia (4-option multiple choice)
- **Job:** "Wait, really?" moments, and knowledge you can reason towards.
- **Good shapes:** myth-busters ("never said in the film"), counter-intuitive facts ("a banana is a berry"), reasoning puzzles ("which letter is in no US state?"), a familiar topic from an unfamiliar angle.
- **Avoid:** capitals (that's Geography's job), sums (Math), dates (Year), and single-fact definitions with nothing to discover.
- **Mix per 10-question game:** about 2–3 Easy, 5 Medium and 2–3 Hard; at most 2 per category; at least 4 world regions represented.

### Closest Wins (numeric estimate, ranked by distance)
- **Job:** estimation, where nobody knows it exactly but everyone can reason.
- **Good shapes:** a quantity with a clear definition and a precise source (Burj Khalifa, 828 m), or a number a famous name anchors wrongly (the Hundred Years' War lasted 116 years).
- **Avoid:** facts everyone knows exactly (50 US states, 52 weeks), which make everyone tie; ranges presented as values ("a giraffe is about 5.5 m"); and arithmetic with an exact answer (cls-c-*), except as at most 1 in 5 large "estimate under the clock" items.
- **Needs:** units in the prompt; the answer as a whole number in the unit asked (or decimals enabled by E1); and, from E1, an input range that comfortably contains the answer without hinting at it (for example 0–10,000 for an answer of 5,570, not 5,000–6,000).

### Guess the Year
- **Job:** a sense of history across eras and cultures; "it's older (or newer) than you think".
- **Good shapes:** events people mis-date (the first Rugby World Cup in 1987; Nintendo in 1889), and events from all continents.
- **Avoid:** the same anchor events over and over (the Moon landing appears twice today), and two events with the same year in one night.
- **Scoring note:** the current scoring (100 − 10 × years off) treats a 1066 event the same as a 2007 one. For very old events, propose tolerance by era (engine change E6). Don't change it without owner approval.

### Geography
- **Job:** the mental map, and where it is wrong.
- **Good shapes:** map surprises (Reno is west of Los Angeles), "largest city isn't the capital" traps (Ankara, Rabat), comparisons with a plausible winner either way, and landmarks outside Europe.
- **Avoid:** capitals any adult knows (Berlin, London); capitals should be at most 25% of a set. Also avoid joke options in higher-or-lower questions, which need two options (engine change E4).

### Who Said That?
- **Problem today:** with the fictional cast, the answer is chosen by keyword ("sea" means the sailor) or is arbitrary (two speakers fit). It is either trivial or unfair.
- **Job (proposed):** real, verified quotations with a twist: misattributions ("Let them eat cake" was first printed by Rousseau), misquotes ("Play it again, Sam"), and lines whose speaker surprises.
- **Needs:** a source for every quote at a quotation authority (Quote Investigator, primary text, or a transcript). An unverifiable attribution isn't eligible: misattribution is the default state of famous quotes. It also needs a reveal field (engine change E5).
- The fictional cast can stay as a "family edition" practice mode.

### Word Connections
- **Job:** four "aha" moments of increasing depth.
- **Rules:**
  - Exactly one solution. List every honest overlap in `alsoFits` and run the solver (`npm run content:pilot`).
  - **No superset groups** ("Space things" swallows "Planets").
  - Group names must be precise ("Gems", not "Gemstones", for pearl and amber).
  - Level 4 is wordplay (hidden words, sounds, "___ + word"), not a harder list.
  - At least two deliberate red herrings that a counting argument resolves.
  - No four literal categories (con-s4-09 has no "aha").
- **Order clues:** the board is shuffled server-side (Sprint 4). Editors should still avoid group names that reveal the level ("Easy:") and words whose length or capitalisation marks a group.

### Caption Clash
- **Job:** easy-to-start writing, with room for many kinds of funny.
- **Good prompts** give a **format** (a 1-star review, a note, the first line of a speech, a sat-nav instruction), a **character**, and a **tension**.
- **Avoid:** prompts that already contain the joke ("an owl who can't stay awake"), 40 variations of "A [creature] does [thing]", and anything that invites mocking a real person or group.

### Category Sprint
- **Problem today:** finite answer lists reject valid answers. Creative players who give rarer valid answers (the ones the uniqueness bonus exists to reward) are the most likely to be marked wrong.
- **Rules:**
  1. **Prefer closed sets** where a definitive list exists: countries in South America, the Chinese zodiac, planets and dwarf planets, Olympic host cities, chess pieces plus card games, and so on. Every correct answer is listed, so there is no judgement call.
  2. **Rule-checkable categories** ("rhymes with cake", "starts with Z") are fine, with a peer vote for unlisted answers.
  3. **Open categories** ("Animals", "Jobs") are allowed only with the peer-challenge process (engine change E2), and their list must be at least 100 answers, with aliases.
  4. **Never subjective categories** ("Things that are cold").
  5. **Aliases are canonicalised**, so sheep, ram and goat count as one answer, never as two separate scoring answers.
  6. UK and US spellings and words are both accepted (aubergine/eggplant, courgette/zucchini).

### Impostor (practice)
- **Job:** a bluffing conversation.
- **Good words** have many features the impostor can fake from the hint alone (Passport, hint "Travel"), and no single giveaway clue.
- **Avoid:** words that the hint category itself names, and words whose one obvious clue exposes the impostor at once.

### Charades (practice)
- **Job:** physical comedy that reads from across the room.
- **Good prompts** are a verb plus a situation with a comic beat ("Opening crisps quietly in a cinema"), actable by children and grandparents.
- **Each prompt needs accepted answers** (for the guesser-confirmed scoring designed in Sprint 4) before it could ever count.

### Math Mayhem (generated, not authored)
Math is generated and verified by code, so the editorial job is the **progression**, not individual items. Proposed (engine change E8; current generation unchanged):

| Round | Content | Time |
|---|---|---|
| 1–3 | Two-digit + and −; times tables to 10 | Warm-up |
| 4–6 | Times tables to 12; ÷ with whole answers; 10/25/50% of round numbers | Standard |
| 7–8 | Two-step ("half of 84, plus 9"); doubling chains | Standard |
| 9–10 | "Estimate fast": 4 options far apart (e.g. 49 × 51 ≈ 2,500), rewarding number sense over exact calculation | Short |

Distractors should keep the current rule (near the answer), plus a classic slip (the wrong operation, or off by 10). No trick questions, and no order-of-operations traps.

---

## 5. Variety and cultural balance

For every official set of 10 or more items in a game:
- **Regions:** at least 4 of {Africa, Asia, Europe, Latin America, North America, Oceania, Middle East} represented, and none above 40%. Today's Guess the Year has 9 UK/Ireland items, 1 Africa, 1 Latin America and 0 Oceania items (keyword count).
- **Generations:** at least one item each that skews younger (games, recent films) and older (pre-1980 culture), plus several that are timeless.
- **Domains:** no domain above 25% (science, history, arts, sport, food, nature, language, pop culture, places, festive).
- **Festive share:** at most 25% Christmas items in a Christmas Cup, and 0% in a non-seasonal event. The platform is year-round, and the Christmas Cup is one event.
- **Tags:** items carry `region:*`, `era:*` and `domain:*` tags, so selection (engine change E9) can enforce the mix.

### 5a. Audience and personality (owner direction, 2026-11-07)

Mchezo is mainly for younger adults, especially Gen Z and millennials, playing together socially. It should be smart, culturally alive, funny, competitive and memorable, not just factually correct. In one night:
- one question makes someone think hard;
- another brings back a childhood memory;
- another starts an argument over a famous film;
- another makes everyone laugh.

**Mixed Party Night editorial target.** This is a guide, not a per-round quota. Tags overlap.

| Share | Content |
|---|---|
| 30% | Modern entertainment, internet culture, music and gaming |
| 20% | Nostalgia, especially the 2000s and 2010s |
| 20% | Funny, weird or absurd-but-true |
| 30% | Classic knowledge: science, geography, history, technology and reasoning |

**Tags on every item:**
- `tone`: classic, modern, nostalgia or weird (one or more).
- `playlists`:
  - Mixed Party Night;
  - Modern Culture;
  - Internet & Memes;
  - Gaming;
  - Music & Entertainment;
  - 2000s Nostalgia;
  - Weird but True;
  - Brainy & Challenging;
  - World Knowledge.
- Quiz items also carry a `mechanic`. A round should not repeat a mechanic more than twice, should hold at most one quote twist, and at most one "never/not" stem (proposal E10).

**Modern content meets the same gates as everything else.**
- Verify dates, claims, videos and attributions against credible sources. Never invent facts, quotations or lyrics.
- Date anything that can change, with `timeSensitive`. Prefer fixed history ("in 2019 it spent 19 weeks at No. 1") over live records ("the most-viewed video").
- **Avoid:**
  - slang forced into questions;
  - memes used only because they're trendy;
  - gossip;
  - subjective opinions presented as answers;
  - making every modern question easy;
  - repeating the same TikTok, YouTube or gaming reference.
- **Mixed Party Night needs broad references.** Fandom-deep items, such as naming all 151 Pokémon or deep lore, belong in themed playlists. A fandom topic can still go in Mixed Party Night when non-fans can reasonably reason or estimate their way to the answer.

---

## 6. Sources and verification levels

| Level | Meaning | Can be official? |
|---|---|---|
| `computed` | A formula or script proves it (re-evaluated in tests) | Yes, once a person checks that the *wording* matches the formula |
| `reference` | Cited to a named authority (agency, encyclopaedia, primary text) | Yes, after a named person checks the citation |
| `common-knowledge` | Widely known; a cite is optional but helpful | Yes, after a named person checks it |
| `original-creative` | No factual claim (captions, charades) | Yes, after an editorial read |

- **Never fabricate a source.** If the author couldn't check a source, the item says what must be checked ("check against the NASA transcript") rather than citing it as checked. Every pilot item follows this.
- **"Passes automated checks" never means approved.** Approval is a separate, recorded human act bound to the item's hash (`content/approvals.json`, Sprint 4). Editing an item invalidates its approval.

---

## 7. Verdict vocabulary (used in the audit)

| Verdict | Meaning |
|---|---|
| **KEEP** | Meets the bar as written (still needs normal human approval; KEEP isn't approval) |
| **REVISE** | The core is good; fix the wording, label, options, reveal or qualifier |
| **REPLACE** | The slot is worth having, but this item isn't; a better item covering the same ground is proposed or needed |
| **REJECT** | Shouldn't be used: trivial, unfair, arbitrary, disputed or duplicate |

The finding codes (OBVIOUS, MISCALIBRATED, INPUT-RANGE and others) are defined in `audit-verdicts.json`.
