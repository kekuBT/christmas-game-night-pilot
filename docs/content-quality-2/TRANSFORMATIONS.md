# Before and after: what the standard changes

Each example takes a real item from today's library and shows the pilot item that replaces or revises it. The rubric is Entertainment / Creativity / Clarity / Distractors / Social, each 1–5 (the bar is 18 or more with no dimension below 3). The "before" scores are Claude's assessment; the "after" scores are the author's self-assessment, which a human editor should re-score.

---

### 1. Ask about the surprise, not the obvious part (Trivia)

| | Item | Expected correct | Rubric |
|---|---|---|---|
| Before · trv-spac-018 | Which planet is famous for its large rings? *Mars / Venus / **Saturn** / Mercury* | ~95% | 1/1/5/1/2 = **10** |
| After · trv-cq2-06 | How many planets in our Solar System have rings? *1 / 2 / **4** / 8* | 25–45% | 4/4/5/4/4 = **21** |

Same topic, but now the answer teaches something (every giant planet has rings), and the distractors map to real beliefs: "only Saturn", or "Saturn and Jupiter".

### 2. Replace a definition with a mind-changer (Trivia)

| | Item | Expected correct | Rubric |
|---|---|---|---|
| Before · trv-legacy-06 | Which gas do plants absorb from the air? ***Carbon dioxide** / Hydrogen / Oxygen / Nitrogen* | ~85% | 2/1/5/3/3 = **14** |
| After · trv-cq2-10 | Most of a tree's dry weight (wood, leaves and roots) is built from material that came from where? ***The air** / The soil / Rainwater / Sunlight* | 15–35% | 5/5/4/5/4 = **23** |

The same science, turned into a fact that changes how people see a tree. "Dry weight" removes the water objection, and "Sunlight" is a fair trap.

### 3. Turn a closed answer into a reasoning puzzle (Trivia)

| | Item | Expected correct | Rubric |
|---|---|---|---|
| Before · trv-hist-037 | Who was the first President of the United States? *Abraham Lincoln / Thomas Jefferson / **George Washington** / John Adams* (labelled Medium) | ~90% | 2/1/5/3/2 = **13** |
| After · trv-cq2-12 | Which letter of the alphabet does not appear in the name of any US state? ***Q** / X / Z / J* | 15–35% | 4/5/5/5/5 = **24** |

Players who don't know can still work it out ("Texas has an X…"), so a Hard item stays fair and gets the table talking. The answer was checked by a script over all 50 names.

### 4. Make a "myth-buster" the hero item (Trivia / Who Said That?)

| | Item | Rubric |
|---|---|---|
| Before · who-legacy-2 | "I always hide the last cookie for myself." *Mira the Baker / **Tom the Gardener** / Lena the Sailor / Omar the Teacher* (nothing in the quote points to Tom) | 2/2/1/1/2 = **8** (fails gate G2) |
| After · trv-cq2-04 | Which famous 'Casablanca' line is never actually spoken in the film? ***Play it again, Sam** / Here's looking at you, kid / Round up the usual suspects / We'll always have Paris* | 5/4/5/5/4 = **23** |
| After · who-cq2-03 | "Okay, Houston, we've had a problem here." ***Jack Swigert** / Jim Lovell / Fred Haise / Neil Armstrong* | 4/4/4/5/4 = **21** |

The fictional cast either gives the answer away by keyword or makes it arbitrary. A real quote with a twist has one provable answer and a story behind it.

### 5. Stop estimating facts everyone knows exactly (Closest Wins)

| | Item | Rubric |
|---|---|---|
| Before · cls-c-06 | How many squares are on a chessboard? **64** (everyone answers 64, so everyone ties) | 1/1/5/1/2 = **10** |
| After · cls-cq2-02 | Counting squares of every size (1×1 up to 8×8), how many squares are on a chessboard? **204** | 4/5/5/4/4 = **22** |

Players start from the 64 they know, and the ones who think further win. The answer is computed (1² + 2² + … + 8²).

### 6. Use the famous name as the trap (Closest Wins)

| | Item | Rubric |
|---|---|---|
| Before · cls-k-08 | How many planets are in our Solar System? **8** (everyone ties) | 1/1/5/1/2 = **10** |
| After · cls-cq2-03 | How many years did the Hundred Years' War actually last? **116** | 4/4/5/4/4 = **21** |

### 7. A closed set instead of a leaky list (Category Sprint)

| | Item | Problem |
|---|---|---|
| Before · spr-s4-006 | "Countries in Europe": 35 accepted answers | Accepts England, Scotland and Wales; rejects Russia, Turkey, Monaco, Moldova, North Macedonia and eight more. The players who know the most get marked wrong. |
| After · spr-cq2-01 | "Countries in South America": all 12, closed set | Every correct answer is accepted. Near-misses (French Guiana, Falklands) are rejected with a reason on screen, with no host judgement. |

### 8. Give caption writers a format (Caption Clash)

| | Prompt | Rubric |
|---|---|---|
| Before · cap-s4-023 | An owl who just can't stay awake at night | 2/2/5/3/3 = **15** (the prompt already contains the joke) |
| After · cap-cq2-01 | The 1-star review a cat leaves for its expensive new bed | 5/4/5/5/5 = **24** |

A format (a review, a note, a speech) gets hesitant writers started, and the tension (an expensive bed the cat ignores) leaves room for many kinds of funny.

### 9. Precise labels and wordplay (Word Connections)

| | Board | Problem or gain |
|---|---|---|
| Before · con-s4-09 | Countries / Capital cities / Rivers / Mountain ranges | Four literal lists: no "aha" |
| After · con-cq2-03 | Pasta / Currencies / Volcanoes / **Countries minus their first letter** (Pain, Ran, Man, Had) | Level 4 is a real "aha". The solver confirms exactly one solution. |
| Before · con-s4-05 | "Garden birds": Robin, Wren, **Owl, Swan** | A factual slip that a sharp player will challenge |

### 10. An event people mis-date, from beyond Europe (Guess the Year)

| | Item | Rubric |
|---|---|---|
| Before · year-s4-006 | Apollo 11 landed on the Moon (1969). It's also year-legacy-1. | 2/1/5/3/3 = **14** (a duplicate, and an anchor everyone knows) |
| After · year-cq2-01 | India's first full-length feature film, 'Raja Harishchandra', was released (1913) | 4/4/4/4/4 = **20** (an ambiguity note records the 1912 'Shree Pundalik' debate) |

---

## Before and after, in aggregate

| | Today's library (the 8 "before" items scored above) | Pilot (60 items) |
|---|---|---|
| Average rubric (self-assessed for the pilot) | 11.8 | 21.7 (lowest 19; 30 items at 22 or more) |
| Meets the acceptance bar | 0 of 8 | 60 of 60 (pending human verification) |
| Items with a reveal that adds something | rare | all |
| Answers outside the client's input range | 14 official | 3, each marked `blockedBy` |
| Category Sprint answers rejected unfairly | many, by design of the lists | 0 for closed sets; peer vote proposed for open ones |
