# Stage 12.16: Split Clues puzzle inventory (for review)

Generated from the loaded content library by `scripts/content-quality/split-clues-inventory.ts` on 2026-11-15. Every id, clue, accepted answer, status and hash below is what the game plays and what an approval must name. **No puzzle is approved**: all 51 are `provisional`, so they play in casual and Practice games and never in an Official Cup game.

The notes are one reader's flags for a person to decide on. Nothing here approves, edits or verifies a puzzle, and **no source was consulted**: a `check` flag means the claim needs a source before approval, not that it is wrong. Authorship, tests, this document and the review handoff are not editorial approval.

## How a puzzle becomes Official

1. A person checks every clue and the accepted answers (and fixes any in the pack first: an edit changes the hash).
2. They approve it: `npm run content:approve -- --reviewer "Name" <id>` writes `content/approvals.json` with the item's current hash. (That file does not exist yet: nothing in the library has been approved through it.) Only that record approves a Split Clues puzzle: a `review.status` label in the pack (`approved`, `legacy`, `verified-computed`) approves nothing, is reported by `npm run content:check`, and leaves the puzzle provisional (review 6895557386).
3. `npm run content:check` shows the counts. An approval whose hash no longer matches (the puzzle was edited) is reported and ignored: the puzzle is not Official until approved again. A `rejected` status is never Official and never played.
4. An Official Split Clues game needs 6 approved puzzles this Cup has not used yet, Practice included (a Practice game in the Cup uses its puzzles up too). In a Family Cup only year-round puzzles are dealt (D-S1216-02), so the 13 Christmas puzzles never count toward that six.

## Summary

| | Everyday | Christmas | All |
|---|---|---|---|
| Puzzles | 38 | 13 | 51 |
| Approved | 0 | 0 | 0 |
| Lint errors / warnings | 0 / 6 | 0 / 1 | 0 / 7 |

Puzzles carrying each flag (a puzzle can carry several):

| Flag | Meaning | Puzzles |
|---|---|---|
| giveaway | one clue alone (often the last) names or nearly names the answer, so its holder can answer without the team | 20 |
| check | a factual claim that needs a source (or softer wording) before approval | 30 |
| ambiguous | a reasonable answer the matcher refuses, or another answer that fits the clues | 23 |
| weak | a clue that adds nothing, or a puzzle that is very easy | 5 |
| local | assumes East African (or British) knowledge | 8 |
| repeat | the same clue wording appears in another puzzle | 5 |
| none | no flag | 1 |

Every puzzle's `difficulty` is a placeholder (2): the code bank had none. Official selection keeps the pool's difficulty mix and spreads categories (`src/content/select.ts`), so until a reviewer sets real difficulties that balancing does nothing for Split Clues. Every puzzle's `source` is `original-creative` (written for this app), and none has a recorded source check.

Exact clue repeats across puzzles: sc-006 clue 5 = sc-016 clue 6; sc-013 clue 1 = sc-024 clue 1.

**Lint** (`npm run content:check`): sc-102 negative-wording (warn); sc-004 negative-wording (warn); sc-007 maybe-time-sensitive (warn); sc-012 negative-wording (warn); sc-013 maybe-time-sensitive (warn); sc-015 maybe-time-sensitive (warn); sc-037 maybe-time-sensitive (warn).

**Matcher probe**: each puzzle lists plausible typed answers and whether the real matcher (`answerMatches` in `src/games/modules/teamKit.ts`: case, accents, punctuation, a leading article and a plural ignored; one typo forgiven from 7 letters) accepts them. A refusal pauses that team's answer box for 4 s and uses one of its 15 tries for the round, so a refused reasonable answer costs time (and, in the end, a try).

## Everyday puzzles (38)

### sc-001 · Kilimanjaro

- **Kind** A place · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** place
- **Accepted** "Kilimanjaro", "Mount Kilimanjaro", "Mt Kilimanjaro"
- **Approval hash** `8a4bc6b6f000d462` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) Climbers walk through rainforest on the way up. (2) It's in Tanzania. (3) There's snow at the top, close to the equator. (4) Volcanoes made it. (5) Its highest point is Uhuru Peak. (6) From far away it looks flat on top.
- **Probe** "Mount Kilimanjaro" accepted, "Kili" refused
- **Flags** `giveaway` Clue 2 ("It's in Tanzania") with kind "A place" nearly gives it away; clue 5 (Uhuru Peak) gives it away to anyone who knows the name. `check` Clue 3 (snow at the top): its glaciers are shrinking; a reviewer may want "snow and ice" with a source and a review date.

### sc-002 · Giraffe

- **Kind** An animal · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Giraffe"
- **Approval hash** `08c56b5eff35a912` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It eats leaves from thorny trees. (2) Its tongue can be dark purple. (3) It sleeps only a few minutes at a time. (4) No two have the same pattern of patches. (5) It has as many neck bones as you do. (6) It spreads its front legs wide to drink.
- **Flags** `check` Clue 3 (sleeps only a few minutes at a time) and clue 4 (no two patterns alike) are commonly said; need a source. `repeat` Clue 4 is close to Zebra's clue 5 ("No two have the same pattern").

### sc-003 · Umbrella

- **Kind** A thing · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Umbrella"
- **Approval hash** `f4b61930453a4f7f` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) You open it, then close it again. (2) It has a handle. (3) Some fold up small enough for a bag. (4) It has thin metal ribs. (5) Two people can share one. (6) Opening it indoors is said to be bad luck.
- **Probe** "Brolly" refused, "Parasol" refused
- **Flags** `giveaway` Clue 6 (bad luck indoors) gives it away for many players. `ambiguous` "Brolly" and "Parasol" are refused.

### sc-004 · Chapati

- **Kind** A food · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** food
- **Accepted** "Chapati", "Chapatti", "Chapo"
- **Approval hash** `5046e7708224cf1d` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's made from flour, water and oil. (2) It's rolled out flat and round. (3) It's cooked in a pan, not an oven. (4) People tear it by hand to scoop up stew. (5) It came to East Africa from India. (6) In Kenya it's a favourite at celebrations.
- **Lint** negative-wording: negative wording (NOT/never/except): check it reads clearly under time pressure
- **Probe** "Roti" refused, "Flatbread" refused, "Chapo" accepted
- **Flags** `check` Clue 5 (came to East Africa from India) is the usual account; needs a source. `ambiguous` "Roti" (the same flatbread in many homes) and "Flatbread" are refused. `local` Clue 6 (Kenya) and the answer assume East African players.

### sc-005 · Lighthouse

- **Kind** A building · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** building
- **Accepted** "Lighthouse"
- **Approval hash** `0ee2f33075049895` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's tall and round. (2) It stands by the sea. (3) At night its light turns or flashes. (4) It keeps ships away from rocks. (5) You climb a spiral staircase to the top. (6) Some once had a keeper living inside.
- **Flags** `check` Clue 6 (a keeper living inside): many keepers lived in a cottage beside the tower; "some" makes it fair.

### sc-006 · Piano

- **Kind** A musical instrument · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** musical instrument
- **Accepted** "Piano"
- **Approval hash** `87f4d11b511d0e08` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) Most have 88 of something. (2) Some are 'grand', some are 'upright'. (3) Inside, little hammers hit strings. (4) It has pedals for your feet. (5) It's black and white. (6) You play it sitting on a stool.
- **Probe** "Keyboard" refused, "Grand piano" refused
- **Flags** `giveaway` Clue 2 ("grand" and "upright") gives it away. `ambiguous` "Keyboard" fits clues 1, 5 and 6 and is refused; so is "Grand piano", which clue 2 invites. `repeat` Clue 5 ("It's black and white") is the same wording as Zebra's clue 6.

### sc-007 · Elephant

- **Kind** An animal · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Elephant"
- **Approval hash** `23a9e4ebea49697f` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It flaps its ears to keep cool. (2) Its babies are called calves. (3) The oldest female leads the family. (4) It can sense sounds through its feet. (5) It's the largest animal on land. (6) It uses its nose like a hand.
- **Lint** maybe-time-sensitive: wording suggests a fact that can change; add timeSensitive or rephrase
- **Flags** `giveaway` Clue 5 (largest land animal) and clue 6 (nose like a hand) each give it away. `check` Clue 4 (senses sounds through its feet): needs a source.

### sc-008 · Nile

- **Kind** A river · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** river
- **Accepted** "Nile", "River Nile", "The Nile"
- **Approval hash** `baaac04144fc6c73` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It flows north. (2) It runs through Egypt. (3) One of its sources is Lake Victoria. (4) It has a White branch and a Blue branch. (5) It ends in a delta on the Mediterranean. (6) It's one of the longest in the world.
- **Probe** "Nile River" refused, "White Nile" refused
- **Flags** `ambiguous` "Nile River" is refused while "River Nile" is accepted. `check` Clue 3 ("one of its sources is Lake Victoria") and clue 6 (one of the longest) are hedged; a reviewer may want a source.

### sc-009 · Football

- **Kind** A sport · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** sport
- **Accepted** "Football", "Soccer"
- **Approval hash** `fed2a4e6c379a9bf` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) Eleven players on each side. (2) Only one player on each side may use their hands. (3) A match has two halves. (4) The referee can show yellow and red cards. (5) Its World Cup is every four years. (6) You can't be offside in your own half.
- **Probe** "Association football" refused, "Soccer" accepted
- **Flags** `check` Clue 2 (only one player may use their hands) is not quite right: every player takes throw-ins with their hands. Suggest "Only the goalkeeper may handle the ball in play". `ambiguous` "Association football" is refused; clues 1, 3 and 5 also fit other sports (intended as decoys).

### sc-010 · Pineapple

- **Kind** A fruit · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** fruit
- **Accepted** "Pineapple"
- **Approval hash** `03019c4127ab3630` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's spiky on the outside. (2) It has a crown of leaves. (3) Its inside is yellow and juicy. (4) It can make your tongue tingle. (5) Each one takes over a year to grow. (6) Some people put it on pizza.
- **Flags** `check` Clue 5 (over a year to grow) needs a source.

### sc-011 · Bicycle

- **Kind** A thing · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Bicycle", "Bike", "Cycle", "Push bike"
- **Approval hash** `10ad25b1e37a0c95` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has a chain. (2) It has two wheels. (3) It has pedals. (4) You steer it with handlebars. (5) It needs no fuel. (6) Learners may use small extra wheels.
- **Probe** "Bike" accepted, "Cycle" accepted
- **Flags** `weak` Very easy: clues 1–4 each point straight at it. Difficulty is a placeholder (2) for every puzzle.

### sc-012 · Rainbow

- **Kind** Something in nature · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** something in nature
- **Accepted** "Rainbow"
- **Approval hash** `f7d692e7b9b6b8cc` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) You see it with the sun behind you. (2) It needs rain or spray. (3) It's shaped like an arc. (4) It has seven colours, from red to violet. (5) You can never reach its end. (6) Stories say there's gold at the end.
- **Lint** negative-wording: negative wording (NOT/never/except): check it reads clearly under time pressure
- **Flags** `check` Clue 4 (seven colours) is a convention, not a physical fact; "is usually said to have seven colours" is safer. `giveaway` Clue 6 (gold at the end) gives it away for many.

### sc-013 · Ostrich

- **Kind** A bird · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** bird
- **Accepted** "Ostrich"
- **Approval hash** `c75da58de3f080b8` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It can't fly. (2) It lays the biggest eggs of any living bird. (3) It can run at about 70 km/h. (4) It has two toes on each foot. (5) It's the tallest bird. (6) People wrongly say it buries its head in sand.
- **Lint** maybe-time-sensitive: wording suggests a fact that can change; add timeSensitive or rephrase
- **Flags** `check` Clue 3 (about 70 km/h) needs a source. `repeat` Clue 1 ("It can't fly") is the same wording as Penguin's clue 1.

### sc-014 · Coffee

- **Kind** A drink · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** drink
- **Accepted** "Coffee"
- **Approval hash** `e77d93db03a1a21f` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) Its beans are roasted. (2) Kenya and Ethiopia are famous for growing it. (3) An espresso is one way to serve it. (4) It keeps people awake. (5) Its plant has red berries called cherries. (6) In Ethiopia it's poured from a jebena.
- **Probe** "Espresso" refused, "Kahawa" refused
- **Flags** `local` Clue 6 (a jebena) assumes players know the Ethiopian pot (it is also the name of this app's Jebena Rush game). `ambiguous` "Kahawa" (Swahili) is refused, while Tea accepts "Chai": a reviewer may want one rule for Swahili answers.

### sc-015 · Mobile phone

- **Kind** A thing · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Mobile phone", "Phone", "Mobile", "Cell phone", "Cellphone", "Smartphone"
- **Approval hash** `8d4646299a374316` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It needs charging. (2) It has a SIM card. (3) M-Pesa runs on it. (4) It can take photos. (5) Most have a touch screen now. (6) You can put it on silent.
- **Lint** maybe-time-sensitive: wording suggests a fact that can change; add timeSensitive or rephrase
- **Probe** "Simu" refused, "Mobile" accepted
- **Flags** `giveaway` Clue 3 (M-Pesa) gives it away to Kenyan players; clue 2 (SIM card) to anyone. `local` M-Pesa assumes Kenyan players. `ambiguous` "Simu" (Swahili) is refused (see Coffee).

### sc-016 · Zebra

- **Kind** An animal · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Zebra"
- **Approval hash** `f7c87c84af2b6250` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It lives on the savannah. (2) It travels with wildebeest in the great migration. (3) It's related to the horse. (4) Its stripes may confuse biting flies. (5) No two have the same pattern. (6) It's black and white.
- **Flags** `giveaway` Clue 6 (black and white) with clue 1 (savannah) gives it away. `check` Clue 4 (stripes may confuse biting flies) is hedged with "may"; needs a source. `repeat` Clue 5 matches Giraffe's clue 4; clue 6 matches Piano's clue 5.

### sc-017 · Pyramid

- **Kind** A building · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** building
- **Accepted** "Pyramid", "Pyramids", "Great Pyramid"
- **Approval hash** `c511d471726498b2` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has a square base. (2) Its sides are triangles. (3) The most famous are near Cairo. (4) Some were built as tombs for kings. (5) It's made of huge stone blocks. (6) It comes to a point at the top.
- **Probe** "Pyramids of Giza" refused, "Great Pyramid" accepted
- **Flags** `ambiguous` "Pyramids of Giza" and "Sphinx" are plausible wrong tries; the accepted forms look right.

### sc-018 · Mango

- **Kind** A fruit · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** fruit
- **Accepted** "Mango"
- **Approval hash** `5443c9265fa40144` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has one big flat seed. (2) It's sweet and juicy. (3) It can be green, yellow or red. (4) It's India's national fruit. (5) Its tree can live for over a hundred years. (6) Some eat it with chilli and salt.
- **Flags** `check` Clue 4 (India's national fruit) is widely repeated but its official status has been questioned; needs a source or rewording. `check` Clue 5 (trees over a hundred years) needs a source.

### sc-019 · Moon

- **Kind** Something in the sky · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** something in the sky
- **Accepted** "Moon", "The moon"
- **Approval hash** `008b2d5d2792c3a4` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has no light of its own. (2) It pulls on the sea and makes tides. (3) People first walked on it in 1969. (4) It has craters. (5) It always shows us the same side. (6) Sometimes it's full, sometimes a crescent.
- **Probe** "Full moon" refused, "The moon" accepted
- **Flags** `giveaway` Clue 3 (1969) gives it away. `ambiguous` "Full moon" is refused.

### sc-020 · Lion

- **Kind** An animal · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Lion"
- **Approval hash** `e664b0352500754e` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It sleeps up to 20 hours a day. (2) It lives in a group called a pride. (3) The females do most of the hunting. (4) Its roar carries for kilometres. (5) The males have a mane. (6) People call it the king of the jungle.
- **Probe** "Lioness" refused, "Simba" refused
- **Flags** `giveaway` Clue 6 ("king of the jungle") gives it away. `ambiguous` "Lioness", which clue 3 invites, is refused. `check` Clue 1 (up to 20 hours) and clue 4 (heard for kilometres) need a source.

### sc-021 · Toothbrush

- **Kind** A thing · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Toothbrush"
- **Approval hash** `82236d15fa114e48` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) You use it twice a day. (2) It has bristles. (3) Dentists say to change it every three months. (4) Some are electric. (5) It goes with paste. (6) It lives in the bathroom.
- **Flags** `check` Clue 3 (change every three months): dental advice is usually "every three to four months". `weak` Easy: clues 2 and 5 together give it away.

### sc-022 · Olympics

- **Kind** An event · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** event
- **Accepted** "Olympics", "Olympic Games", "The Olympics"
- **Approval hash** `095224f8ab3a0953` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It happens every four years. (2) Its flag has five coloured rings. (3) A flame is carried a long way before it starts. (4) Kenyan runners win many medals there. (5) It began in ancient Greece. (6) Winners get gold medals.
- **Probe** "Olympic Games" accepted, "Olympic" accepted
- **Flags** `check` Clue 1 (every four years): true of the Summer and the Winter Games each; together there is a Games every two years.

### sc-023 · Tea

- **Kind** A drink · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** drink
- **Accepted** "Tea", "Chai"
- **Approval hash** `d94621590dd5dda2` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) Kenya grows a lot of it around Kericho. (2) It's made from dried leaves. (3) Many have it with milk and sugar. (4) It comes in bags. (5) It's brewed in a pot. (6) Some like it with ginger or masala spices.
- **Probe** "Chai" accepted, "Black tea" refused
- **Flags** `local` Clue 1 (Kericho) assumes Kenyan players.

### sc-024 · Penguin

- **Kind** A bird · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** bird
- **Accepted** "Penguin"
- **Approval hash** `2bc796c1855bdc85` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It can't fly. (2) It swims very well. (3) It lives in the southern half of the world. (4) Some huddle together through the winter. (5) It looks like it's wearing a suit. (6) It waddles.
- **Flags** `check` Clue 3 (southern half of the world): almost all; one species lives at the equator. "Almost all live…" is safer. `repeat` Clue 1 ("It can't fly") is the same wording as Ostrich's clue 1.

### sc-025 · Volcano

- **Kind** Something in nature · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** something in nature
- **Accepted** "Volcano"
- **Approval hash** `8888af23259a7f95` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It can be active, dormant or extinct. (2) It may smoke. (3) Mount Kenya is an old one. (4) Its melted rock is called lava. (5) It has a crater. (6) Pompeii was buried by one.
- **Probe** "Vesuvius" refused, "Volcanoes" accepted
- **Flags** `giveaway` Clue 4 (lava) gives it away. `check` Clue 3 (Mount Kenya is an old one) needs a source. `ambiguous` Clue 6 (Pompeii) invites "Vesuvius", which is refused (right: the answer is the kind of thing).

### sc-026 · Clock

- **Kind** A thing · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Clock"
- **Approval hash** `ff03f8475f9bda04` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has a face. (2) It has hands. (3) Big Ben's tower has a famous one. (4) It ticks. (5) Some have a cuckoo. (6) Some ring an alarm.
- **Probe** "Watch" refused, "Alarm clock" refused, "Cuckoo clock" refused
- **Flags** `ambiguous` "Watch" fits clues 1, 2, 4 and 6; "Alarm clock" and "Cuckoo clock" are refused.

### sc-027 · Honey

- **Kind** A food · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** food
- **Accepted** "Honey"
- **Approval hash** `2f7152a79f0fa3bc` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It doesn't go off. (2) It's sticky and sweet. (3) It's made from nectar. (4) It's stored in combs. (5) It's golden. (6) Some people stir it into tea.
- **Flags** `check` Clue 1 ("It doesn't go off") is broadly true if kept sealed and dry; it can ferment. "It keeps for a very long time" is safer.

### sc-028 · Passport

- **Kind** A thing · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Passport"
- **Approval hash** `4f004407d5559d5b` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has your photo. (2) It collects stamps. (3) You show it at airports. (4) It has an expiry date. (5) It shows your nationality. (6) It's a small booklet.
- **Flags** none

### sc-029 · Cheetah

- **Kind** An animal · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Cheetah"
- **Approval hash** `1a138b7d4eb027c5` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's a big cat. (2) It can't roar. (3) It has black 'tear lines' on its face. (4) It hunts in the daytime. (5) It's the fastest land animal. (6) It has spots.
- **Probe** "Leopard" refused
- **Flags** `giveaway` Clue 5 (fastest land animal) gives it away.

### sc-030 · Rain

- **Kind** Weather · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** weather
- **Accepted** "Rain"
- **Approval hash** `85c89494bcb780ff` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) Kenya has long ones and short ones. (2) It falls from clouds. (3) Farmers wait for it. (4) It can come with thunder. (5) It fills dams. (6) You might need an umbrella.
- **Probe** "Rains" accepted, "Rainfall" refused, "Storm" refused
- **Flags** `ambiguous` "Rainfall" and "Storm" are refused ("Rains" is accepted). `local` Clue 1 (Kenya's long and short rains) assumes Kenyan players.

### sc-031 · Library

- **Kind** A place · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** place
- **Accepted** "Library"
- **Approval hash** `8cf6fe0c40f6789b` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's quiet. (2) You need a card to borrow. (3) Things are sorted by number on shelves. (4) You bring things back by a date. (5) It's full of books. (6) You can read there for free.
- **Probe** "Bookshop" refused
- **Flags** `check` Clue 2 (you need a card to borrow) and clue 6 (free) hold for most public libraries, not all.

### sc-032 · Hospital

- **Kind** A place · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** place
- **Accepted** "Hospital"
- **Approval hash** `fab4caa64159af1d` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's open all night. (2) It has wards. (3) Ambulances arrive there. (4) Nurses work there. (5) Many babies are born there. (6) It has an emergency room.
- **Probe** "Clinic" refused
- **Flags** `ambiguous` "Clinic" fits several clues and is refused (right, but a team may be locked out on it).

### sc-033 · Matatu

- **Kind** A vehicle · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** vehicle
- **Accepted** "Matatu", "Matatus"
- **Approval hash** `540b43c255403e15` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's a minibus. (2) It often plays loud music. (3) Many are painted with bright art. (4) It carries passengers in Kenya. (5) A conductor calls out the route. (6) Its name comes from the Swahili for three.
- **Probe** "Minibus" refused, "Matatus" accepted
- **Flags** `ambiguous` Clue 1 says "It's a minibus", so a team holding it may type "Minibus", which is refused. `check` Clue 6 (the name comes from Swahili for three) is the usual explanation (an early fare of three coins); needs a source. `local` Assumes Kenyan players.

### sc-034 · Flamingo

- **Kind** A bird · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** bird
- **Accepted** "Flamingo"
- **Approval hash** `a853558162afafd0` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's pink because of what it eats. (2) It often stands on one leg. (3) Lake Nakuru is famous for it. (4) It eats with its head upside down. (5) It has a long neck. (6) It lives in large flocks.
- **Flags** `check` Clue 3 (Lake Nakuru is famous for it): flamingo numbers there have changed a lot in recent years; a reviewer may want "was famous" or Lake Bogoria, with a review date.

### sc-035 · Chess

- **Kind** A game · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** game
- **Accepted** "Chess"
- **Approval hash** `fe600ce27d689194` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's played on 64 squares. (2) Each side has 16 pieces. (3) The horse-shaped piece moves in an L. (4) A pawn can become a queen. (5) The game ends with checkmate. (6) Players often use a clock.
- **Flags** `check` Clue 2 (16 pieces) counts the pawns as pieces, which is the usual way.

### sc-036 · Baobab

- **Kind** A tree · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** tree
- **Accepted** "Baobab"
- **Approval hash** `0e52abbaa949d40b` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It can store water in its trunk. (2) It can live for over a thousand years. (3) Its fruit is dry, with a powdery inside. (4) It loses its leaves in the dry season. (5) Its trunk can be wider than a car. (6) It's sometimes called the upside-down tree.
- **Flags** `giveaway` Clue 6 (the upside-down tree) gives it away. `check` Clue 2 (over a thousand years) needs a source.

### sc-037 · Sahara

- **Kind** A place · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** place
- **Accepted** "Sahara", "Sahara Desert", "The Sahara"
- **Approval hash** `aa971047741a7e63` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It's in Africa. (2) Camels cross it. (3) It has huge sand dunes. (4) It's the largest hot desert. (5) It gets very cold at night. (6) It stretches from the Atlantic to the Red Sea.
- **Lint** maybe-time-sensitive: wording suggests a fact that can change; add timeSensitive or rephrase
- **Probe** "Desert" refused, "Sahara Desert" accepted
- **Flags** `check` Clue 6 (Atlantic to the Red Sea) is commonly said; needs a source. `ambiguous` Bare "Desert" is refused (right: the kind is "A place").

### sc-038 · Spider

- **Kind** An animal · **season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Spider"
- **Approval hash** `5c7e9eee7e4942ac` (pack `split-clues-everyday` 1.0.0) · **approval record** none
- **Clues** (1) It has eight legs. (2) It spins silk. (3) Some are venomous. (4) It isn't an insect. (5) It catches flies. (6) Anansi is a famous one in stories.
- **Probe** "Tarantula" refused, "Arachnid" refused
- **Flags** `check` Clue 3 ("Some are venomous") is not quite right: almost all spiders have venom, but few are dangerous to people. Suggest "A few are dangerous to people". `local` Clue 6 (Anansi) is a West African and Caribbean story figure; fine as a bonus clue.

## Christmas puzzles (13)

### sc-101 · Reindeer

- **Kind** An animal · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** animal
- **Accepted** "Reindeer"
- **Approval hash** `bc74aea41b1cd63a` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It pulls a sleigh. (2) It has antlers. (3) Both males and females grow antlers. (4) It lives in the far north. (5) Rudolph is one. (6) In North America it's called a caribou.
- **Probe** "Caribou" refused, "Reindeers" accepted
- **Flags** `giveaway` Clue 5 ("Rudolph is one") names a famous reindeer: whoever holds it can answer alone. `ambiguous` Clue 6 invites "Caribou", which is refused.

### sc-102 · Snowman

- **Kind** Something you make · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** something you make
- **Accepted** "Snowman", "Snow man"
- **Approval hash** `81dc081bb6e7c477` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It melts. (2) It has a carrot nose. (3) It's built, not born. (4) It may wear a scarf. (5) Its eyes can be lumps of coal. (6) Frosty is a famous one.
- **Lint** negative-wording: negative wording (NOT/never/except): check it reads clearly under time pressure
- **Probe** "Snowmen" accepted, "Snow person" refused
- **Flags** `giveaway` Clue 6 ("Frosty is a famous one") is close to the answer on its own.

### sc-103 · Stocking

- **Kind** A thing · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Stocking", "Christmas stocking", "Stockings"
- **Approval hash** `959eb98e8bfb1531` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It's hung up on Christmas Eve. (2) It's shaped like a big sock. (3) It's filled with small gifts. (4) It may have your name on it. (5) It hangs by the fireplace. (6) Some families put an orange at the bottom.
- **Probe** "Sock" refused, "Stockings" accepted
- **Flags** `giveaway` Clue 2 ("shaped like a big sock") nearly names it. `check` Clue 6 (an orange at the bottom) is a family tradition in some places, not everywhere; reads as "some families", which is fair.

### sc-104 · Christmas tree

- **Kind** A thing · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Christmas tree", "Xmas tree", "Fir tree"
- **Approval hash** `a5102ab7c991460b` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It stays green all year. (2) It gets a star or an angel on top. (3) It's covered in lights. (4) Presents go under it. (5) It drops needles. (6) It can be real or plastic.
- **Probe** "Tree" refused, "Pine tree" refused, "Fir tree" accepted
- **Flags** `ambiguous` "Fir tree" is accepted but "Pine tree" and bare "Tree" are refused, though many Christmas trees are pine or spruce. `weak` Clue 1 ("stays green all year") is true of a real evergreen but sits oddly beside clue 6 ("real or plastic").

### sc-105 · Mistletoe

- **Kind** A plant · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** plant
- **Accepted** "Mistletoe"
- **Approval hash** `a8bd8e2833ff6571` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It grows on other trees. (2) It has white berries. (3) People hang it in doorways. (4) Standing under it may get you a kiss. (5) Its berries are poisonous. (6) It's a plant used at Christmas.
- **Flags** `giveaway` Clue 4 (a kiss underneath) gives it away. `check` Clue 5 ("Its berries are poisonous"): how toxic mistletoe berries are to people is often overstated; needs a source or softer wording. `weak` Clue 6 ("It's a plant used at Christmas") repeats the kind ("A plant") and the season.

### sc-106 · Gingerbread

- **Kind** A food · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** food
- **Accepted** "Gingerbread", "Gingerbread man", "Gingerbread house"
- **Approval hash** `26cbe0ed3ae71a21` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It's spicy and sweet. (2) It's baked. (3) It can be built into a house. (4) It can be shaped like a person. (5) 'Run, run, as fast as you can' is from its story. (6) It's decorated with icing.
- **Probe** "Gingerbread man" accepted, "Ginger biscuit" refused
- **Flags** `giveaway` Clue 5 quotes the Gingerbread Man story.

### sc-107 · Carol

- **Kind** A song · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** song
- **Accepted** "Carol", "Carols", "Christmas carol", "Christmas carols"
- **Approval hash** `218e83360f8951d9` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It's sung. (2) Singers go door to door with them. (3) 'Silent Night' is one. (4) Choirs sing them in church. (5) It's a festive song. (6) Charles Dickens put one in a story's title.
- **Probe** "Hymn" refused, "Christmas song" refused, "Carols" accepted
- **Flags** `giveaway` Clue 6 points straight at "A Christmas Carol". `ambiguous` "Hymn" and "Christmas song" are reasonable tries for clues 1, 3, 4 and are refused.

### sc-108 · Santa

- **Kind** A person · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** person
- **Accepted** "Santa", "Santa Claus", "Father Christmas", "Saint Nicholas", "St Nicholas"
- **Approval hash** `9e71cfddffb72b3c` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) He has a big white beard. (2) He lives at the North Pole. (3) He checks a list twice. (4) He comes down the chimney. (5) He wears red. (6) He says 'Ho ho ho'.
- **Probe** "Father Christmas" accepted, "St. Nicholas" accepted, "Santa Clause" accepted
- **Flags** `giveaway` Clue 6 ("Ho ho ho") and clue 3 (checks a list twice) each give it away; every clue is easy in a Christmas game. `ambiguous` "Saint Nicholas" is accepted although the historical saint and Santa are not quite the same figure; a reviewer may want that.

### sc-109 · Bethlehem

- **Kind** A place · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** place
- **Accepted** "Bethlehem"
- **Approval hash** `8d4a1faadc5a438c` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It's a town. (2) It's south of Jerusalem. (3) Its name means 'house of bread'. (4) A star is said to have shone over it. (5) In the Christmas story, Jesus was born there. (6) A carol calls it a 'little town'.
- **Flags** `giveaway` Clue 5 (Jesus was born there) and clue 6 ("O Little Town of Bethlehem") each give it away. `check` Clue 3 (the name means "house of bread") is the usual Hebrew reading; other etymologies are proposed. Needs a source or "is often said to mean". `check` Clue 2 (south of Jerusalem): needs a source; wording kept neutral (no political framing), which should stay so.

### sc-110 · Cracker

- **Kind** A thing · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Cracker", "Christmas cracker", "Crackers"
- **Approval hash** `e57778b15d34ca75` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) Two people pull it. (2) It goes bang. (3) There's a paper crown inside. (4) It has a bad joke inside. (5) It's wrapped like a giant sweet. (6) It's set on the table for Christmas dinner.
- **Probe** "Bon-bon" refused, "Christmas cracker" accepted
- **Flags** `local` Christmas crackers are mainly a British and Commonwealth custom; some families will not know them. `ambiguous` "Bon-bon" (another name in some countries) is refused.

### sc-111 · Candy cane

- **Kind** A sweet · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** sweet
- **Accepted** "Candy cane", "Candycane"
- **Approval hash** `9895e818b7a0eb28` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It's shaped like a hook. (2) It's red and white. (3) It tastes of peppermint. (4) It can hang on a tree. (5) It's hard and sweet. (6) It looks like a walking stick.
- **Probe** "Candy cane" accepted, "Candy stick" refused
- **Flags** `check` Clue 3 (peppermint): the classic flavour; other flavours exist. Fine as a clue, worth a glance.

### sc-112 · Advent calendar

- **Kind** A thing · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** thing
- **Accepted** "Advent calendar", "Advent"
- **Approval hash** `55cd57e62791c73d` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It counts down. (2) It has little doors. (3) You open one each day. (4) Some have chocolates inside. (5) It starts on the first of December. (6) It ends on Christmas Eve.
- **Probe** "Calendar" refused, "Advent" accepted
- **Flags** `check` Clue 5 (starts on 1 December) and clue 6 (ends on Christmas Eve) hold for most calendars, not all (some start on the first Sunday of Advent, some have 25 doors). `ambiguous` Bare "Advent" is accepted though it names the season, not the object; "Calendar" is refused.

### sc-113 · Wreath

- **Kind** A decoration · **season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **category** decoration
- **Accepted** "Wreath"
- **Approval hash** `ddab94ad0a6d86c0` (pack `split-clues-christmas` 1.0.0) · **approval record** none
- **Clues** (1) It's round. (2) It hangs on a door. (3) It's made of evergreen branches. (4) It may have a bow. (5) It has a hole in the middle. (6) Some hold four candles for Advent.
- **Probe** "Advent wreath" refused, "Garland" refused
- **Flags** `weak` Clue 1 (round) and clue 5 (a hole in the middle) say the same thing twice. `ambiguous` "Advent wreath", which clue 6 invites, is refused.
