# Editorial review — review-batch-01 (20 pilot items, blind)

**Reviewer:** __________________  **Date:** __________

## How to review

1. Read each item as a player would, then as an editor.
2. **Gates (pass/fail):**
   - G1 the answer is correct (do the listed fact check, and note what you looked at);
   - G2 exactly one defensible answer;
   - G3 clear on a phone in under 8 seconds;
   - G4 objectively scorable;
   - G5 enterable;
   - G6 dated if the fact can change;
   - G7 safe for the table.
3. **Rubric (1–5 each):**
   - R1 entertainment and memorability;
   - R2 creativity and originality;
   - R3 clarity, accuracy and fairness;
   - R4 difficulty and distractors;
   - R5 social and accessibility.
   - The bar is a total of at least 18, no score below 3, and every gate passed.
4. **Decision:** KEEP / REVISE (say what) / REJECT. Then give your own difficulty estimate.
5. Fill in `SCORES.csv`, one row per item.

**Independence:**
- The author's scores and reasons are in `author-key.json`, `content/pilot/review-batch-01.json`, `content/pilot/pilot-cq2.json` and `PILOT_ITEMS.md`. Please don't open those until your scores are in.
- This batch mixes items the author rates highly with items the author has doubts about; which is which isn't shown.
- Automated checks (schema, solver, rubric arithmetic) have passed for all 20. **That is not editorial approval and not a fact check.**

The full standard is in `docs/content-quality-2/EDITORIAL_STANDARD.md`.

---

## 1. Geography · `geo-cq2-04` · labelled Hard

**Prompt:** Counting its overseas territories, which country uses the most time zones?

- Options: France · Russia · United States · United Kingdom
- Answer: **France**
- Explanation shown to players: France: 12 (13 counting its Antarctic claim), thanks to territories from the Pacific to the Indian Ocean. Russia has 11.
- Reveal moment: France!
- Known ambiguity: Depends on counting overseas territories, which the prompt states. The US also has 11 counting territories.
- Source basis (as written by the author, **not yet checked by a person**): Counts of time zones including overseas territories (France 12, or 13 with its Antarctic claim)
- **Fact check to do:** Check current counts for all four countries against a time-zone reference (e.g. the IANA database, or a summary that cites it).

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 2. Closest Wins · `cls-cq2-06` · labelled Medium

**Prompt:** How old was Mozart when he died?

- Answer: **35 years old**
- Explanation shown to players: 35. He wrote more than 600 works before then.
- Reveal moment: 35.
- Source basis (as written by the author, **not yet checked by a person**): Wolfgang Amadeus Mozart, born 27 January 1756, died 5 December 1791
- **Fact check to do:** Check the dates against a music reference; verify the '600 works' figure (the Köchel catalogue) or drop it.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 3. Who Said That? · `who-cq2-02` · labelled Hard

**Quote:** “Let them eat brioche. (The first known printed version of 'Let them eat cake'.)”

- Options: Jean-Jacques Rousseau · Marie Antoinette · Voltaire · Napoleon Bonaparte
- Answer: **Jean-Jacques Rousseau**
- Explanation shown to players: Rousseau wrote it, about an unnamed 'great princess', when Marie Antoinette was still a child in Austria.
- Reveal moment: Rousseau wrote it, about an unnamed 'great princess', when Marie Antoinette was still a child in Austria.
- **Blocked:** Who Said That shows only the quote; this item needs a one-line question ('Who first put this in print?'), see engine change E5.
- Source basis (as written by the author, **not yet checked by a person**): Jean-Jacques Rousseau, 'Confessions', Book VI (written in the 1760s, published 1782)
- **Fact check to do:** Check against the text of the Confessions and a historian's account of the attribution. The game screen must say 'first printed by'.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 4. Trivia · `trv-cq2-02` · labelled Easy

**Prompt:** What is the name of Harry Potter's owl?

- Options: Hedwig · Errol · Pigwidgeon · Crookshanks
- Answer: **Hedwig**
- Explanation shown to players: Hedwig, a snowy owl. Errol belongs to the Weasleys, Pigwidgeon to Ron, and Crookshanks is Hermione's cat.
- Reveal moment: Hedwig — and every wrong answer is another Potter pet, so fans can show off in the reveal.
- Source basis (as written by the author, **not yet checked by a person**): J. K. Rowling, 'Harry Potter and the Philosopher's Stone' (1997)
- **Fact check to do:** Check the four pet names and owners against the books.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 5. Word Connections · `con-cq2-01` · labelled Medium

**Board** (players see the 16 words shuffled):

- Level 1 · Breads: Naan, Pita, Bagel, Injera
- Level 2 · Dips and sauces: Pesto, Hummus, Guacamole, Tzatziki
- Level 3 · Dances: Salsa, Samba, Waltz, Rumba
- Level 4 · NATO phonetic alphabet: Tango, Foxtrot, Hotel, Juliett
- Intended misdirection: Salsa is a dip and a dance; Tango and Foxtrot are dances and NATO code words. Hotel and Juliett (spelled with two t's) can only be NATO, which forces the solution.
- Reveal moment: Breads, dips, dances — and the NATO alphabet hiding two of the dances.
- Source basis (as written by the author, **not yet checked by a person**): Original board; membership facts checkable in any dictionary
- **Fact check to do:** Spelling check: 'Juliett' is the official NATO/ICAO spelling. The uniqueness check passes (one solution).

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 6. Guess the Year · `year-cq2-01` · labelled Hard

**Event:** India's first full-length feature film, 'Raja Harishchandra', was released

- Answer: **1913**
- Explanation shown to players: Released in Bombay (Mumbai) in 1913, directed by Dadasaheb Phalke — the start of what became the world's largest film industry.
- Reveal moment: 1913.
- Known ambiguity: Some historians cite 'Shree Pundalik' (1912) as earlier; it is usually excluded as a filmed play. The wording 'full-length feature' follows the common convention.
- Source basis (as written by the author, **not yet checked by a person**): Dadasaheb Phalke, 'Raja Harishchandra', released 1913
- **Fact check to do:** Check against a film-history source.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 7. Category Sprint · `spr-cq2-03` · labelled Medium

**Category:** Planets and dwarf planets

- Accepted (13): ceres, earth, eris, haumea, jupiter, makemake, mars, mercury, neptune, pluto, saturn, uranus, venus
- Reveal moment: 13 bodies. The rare dwarf planets (Haumea, Makemake, Eris) are where the uniqueness bonus is won.
- Needs fields the engine doesn't support yet: `{"knownNotAccepted":{"moon":"A moon, not a planet","sun":"A star","sedna":"A dwarf-planet candidate the IAU has not formally recognised"}}`
- Source basis (as written by the author, **not yet checked by a person**): IAU: 8 planets and 5 recognised dwarf planets
- **Fact check to do:** Check against the IAU list of recognised dwarf planets; add timeSensitive if the IAU recognises more.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 8. Trivia · `trv-cq2-12` · labelled Hard

**Prompt:** Which letter of the alphabet does not appear in the name of any US state?

- Options: Q · X · Z · J
- Answer: **Q**
- Explanation shown to players: Q. X is in Texas and New Mexico, Z in Arizona, J in New Jersey.
- Reveal moment: Q. Players can work it out live — and they will, out loud.
- Source basis (as written by the author, **not yet checked by a person**): List of the 50 US state names (letter check script in docs/content-quality-2)
- **Fact check to do:** Computed: the letter check over the 50 state names was run (only 'q' is missing). Re-run if the item is edited.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 9. Charades (practice) · `chr-cq2-04` · labelled Easy

**Prompt:** Opening crisps quietly in a cinema

- Reveal moment: The prompt is shown on the TV after it is guessed or time runs out.
- Needs fields the engine doesn't support yet: `{"acceptedAnswers":["opening crisps","eating crisps in a cinema","opening a crisp packet","quiet crisps","crisps in the cinema"]}`
- Source basis (as written by the author, **not yet checked by a person**): original-creative
- **Fact check to do:** Editorial read-through only.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 10. Closest Wins · `cls-cq2-05` · labelled Hard

**Prompt:** How far is it in a straight line from London to New York, in kilometres?

- Answer: **5570 km**
- Explanation shown to players: About 5,570 km as the crow flies (city centre to city centre).
- Reveal moment: About 5,570 km.
- Source basis (as written by the author, **not yet checked by a person**): Great-circle (haversine) distance between central London (51.5074, -0.1278) and New York City (40.7128, -74.0060), Earth mean radius 6371 km
- **Fact check to do:** Computed with the haversine formula (5,570.2 km). Editors should agree the 'city centre' convention.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 11. Trivia · `trv-cq2-04` · labelled Medium

**Prompt:** Which famous 'Casablanca' line is never actually spoken in the film?

- Options: Play it again, Sam · Here's looking at you, kid · Round up the usual suspects · We'll always have Paris
- Answer: **Play it again, Sam**
- Explanation shown to players: Ilsa says 'Play it, Sam' and Rick says 'Play it!' — but nobody says 'Play it again, Sam'. The other three lines are all in the film.
- Reveal moment: Nobody says 'Play it again, Sam'. The misquote is so famous that Woody Allen used it as a film title in 1972.
- Source basis (as written by the author, **not yet checked by a person**): 'Casablanca' (1942) screenplay/film dialogue
- **Fact check to do:** Check all four lines against the film or a published screenplay; check the 1972 Woody Allen title (it is the title of his play/film).

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 12. Impostor (practice) · `imp-cq2-03` · labelled Easy

**Secret word:** Volcano · **Impostor's hint:** Nature

- Reveal moment: The impostor is revealed at the end of the vote.
- Source basis (as written by the author, **not yet checked by a person**): original-creative
- **Fact check to do:** Editorial read-through only.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 13. Geography · `geo-cq2-02` · labelled Medium

**Prompt:** Which country has the longest coastline in the world?

- Options: Canada · Russia · Australia · Indonesia
- Answer: **Canada**
- Explanation shown to players: Canada, with about 202,000 km — thanks to tens of thousands of Arctic islands.
- Reveal moment: Canada.
- Known ambiguity: Coastline length depends on measurement scale (the coastline paradox); Canada leads in the standard references.
- Source basis (as written by the author, **not yet checked by a person**): CIA World Factbook, coastline lengths (Canada 202,080 km)
- **Fact check to do:** Check against the CIA World Factbook. Coastline length depends on the measuring scale; quote the source in the reveal.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 14. Guess the Year · `year-cq2-04` · labelled Medium

**Event:** Pac-Man was first released in arcades

- Answer: **1980**
- Explanation shown to players: In Japan in May 1980; it was originally called Puck Man.
- Reveal moment: 1980.
- Source basis (as written by the author, **not yet checked by a person**): Namco: Pac-Man released in Japan, May 1980
- **Fact check to do:** Check against Namco/Bandai Namco history.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 15. Caption Clash · `cap-cq2-01` · labelled Easy

**Prompt:** The 1-star review a cat leaves for its expensive new bed

- Reveal moment: Captions are revealed anonymously, then voted on.
- Source basis (as written by the author, **not yet checked by a person**): original-creative
- **Fact check to do:** Editorial read-through only: no facts, no real people, nothing that punches down.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 16. Trivia · `trv-cq2-05` · labelled Medium

**Prompt:** How many times does Sherlock Holmes say 'Elementary, my dear Watson' in Arthur Conan Doyle's stories?

- Options: Never · Once · About ten times · More than fifty times
- Answer: **Never**
- Explanation shown to players: Never. Holmes says 'Elementary' once ('The Crooked Man') and 'my dear Watson' often, but never together. The full phrase was popularised later, especially by films.
- Reveal moment: Never! The catchphrase belongs to adaptations, not to Doyle.
- Source basis (as written by the author, **not yet checked by a person**): Arthur Conan Doyle's Sherlock Holmes canon (full text, e.g. Project Gutenberg)
- **Fact check to do:** Full-text search of all 60 Doyle stories for the exact phrase and for 'Elementary' (expected: one hit, 'The Crooked Man'). This can be scripted against a public-domain text.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 17. Category Sprint · `spr-cq2-02` · labelled Medium

**Category:** Animals of the Chinese zodiac

- Accepted (12): dog, dragon, goat, horse, monkey, ox, pig, rabbit, rat, rooster, snake, tiger
- Reveal moment: All 12 in order: Rat, Ox, Tiger, Rabbit, Dragon, Snake, Horse, Goat, Monkey, Rooster, Dog, Pig.
- Needs fields the engine doesn't support yet: `{"aliases":{"sheep":"goat","ram":"goat","chicken":"rooster","cockerel":"rooster","hen":"rooster","boar":"pig","hare":"rabbit","buffalo":"ox","cow":"ox","bull":"ox","mouse":"rat"},"needsEditorDecision":{"cat":"The Vietnamese zodiac has the Cat where the Chinese has the Rabbit. Suggest accepting it as an alias of rabbit, so Vietnamese players aren't penalised."}}`
- Source basis (as written by the author, **not yet checked by a person**): Chinese zodiac: 12 animals
- **Fact check to do:** Check the list against a cultural reference. Aliases need an editor's decision (see proposedFields).

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 18. Who Said That? · `who-cq2-01` · labelled Easy

**Quote:** “The report of my death was an exaggeration.”

- Options: Mark Twain · Oscar Wilde · Winston Churchill · Groucho Marx
- Answer: **Mark Twain**
- Explanation shown to players: Mark Twain, 1897 — usually misquoted as 'greatly exaggerated'.
- Reveal moment: Mark Twain, 1897 — usually misquoted as 'greatly exaggerated'.
- Source basis (as written by the author, **not yet checked by a person**): New York Journal, 2 June 1897 (Twain's reply to reports of his death)
- **Fact check to do:** Check against a quotation authority that cites the 1897 newspaper (e.g. Quote Investigator or the Mark Twain Project).

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 19. Trivia · `trv-cq2-10` · labelled Hard

**Prompt:** Most of a tree's dry weight (wood, leaves and roots) is built from material that came from where?

- Options: The air · The soil · Rainwater · Sunlight
- Answer: **The air**
- Explanation shown to players: The air: carbon dioxide, turned into sugars and wood by photosynthesis. In the 1640s van Helmont grew a willow for five years and the soil barely lost any weight.
- Reveal moment: From thin air — literally. A tree is mostly solidified carbon dioxide.
- Source basis (as written by the author, **not yet checked by a person**): Plant physiology: carbon fixation in photosynthesis; van Helmont's willow experiment (1640s)
- **Fact check to do:** Check against a plant physiology textbook (dry mass is mostly carbon, hydrogen and oxygen fixed from CO2 and water; carbon comes from the air). Check van Helmont's figures before adding them.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:

---

## 20. Closest Wins · `cls-cq2-01` · labelled Medium

**Prompt:** How tall is the Burj Khalifa in Dubai, in metres?

- Answer: **828 m**
- Explanation shown to players: 828 m — more than twice the height of the Eiffel Tower.
- Reveal moment: 828 m. The Eiffel Tower is 330 m.
- Source basis (as written by the author, **not yet checked by a person**): CTBUH (Council on Tall Buildings and Urban Habitat): Burj Khalifa, 828 m
- **Fact check to do:** Check against CTBUH. Add timeSensitive only if a height change is announced.

| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

Notes:
