# Stage 12.17: drawing prompt inventory (for review)

Generated from the loaded content library by `scripts/content-quality/draw-prompts-inventory.ts` on 2026-11-15. Every id, word, accepted alternative, season, status and hash below is what Team Draw and Draw & Guess play and what an approval must name. **No prompt is approved**: all 70 are `provisional`, so they play in casual and Practice games and never in an Official Team Draw game.

The flags are one reader's notes for a person to decide on. Nothing here approves or edits a prompt. Authorship, tests, this document and the review handoff are not editorial approval.

## How a prompt becomes Official

1. A person checks the word and its accepted alternatives (and fixes them in `content/packs/draw-prompts.json` first: an edit changes the hash).
2. They approve it: `npm run content:approve -- --reviewer "Name" <id>` writes `content/approvals.json` with the prompt's current hash. (That file does not exist yet: nothing in the library has been approved through it.) Only that record approves a drawing prompt: a `review.status` label in the pack (`approved`, `legacy`, `verified-computed`) approves nothing, is reported by `npm run content:check`, and leaves the prompt provisional (D-S1217-02, as D-S1216R-01).
3. `npm run content:check` shows the counts. An approval whose hash no longer matches (the prompt was edited) is reported and ignored. A `rejected` prompt is never Official and is dealt by no game at all.
4. An Official Team Draw game needs one approved prompt per round that this Cup has not dealt yet: 3 to 5 rounds, the size of the biggest team in the final roster. Every earlier drawing game in the Cup uses its prompts up, Practice and Draw & Guess included (a Draw & Guess swap uses both the word swapped out and the one swapped in). A Family Cup deals every prompt, so approved Christmas prompts count too (D-S1217-03, provisional: for the owner to confirm).
5. Draw & Guess stays Practice-only: approvals change nothing there.

## Summary

| | Year-round | Christmas | All |
|---|---|---|---|
| Prompts | 67 | 3 | 70 |
| Approved | 0 | 0 | 0 |
| With accepted alternatives | 15 | 0 | 15 |
| Lint errors / warnings | | | 0 / 0 |

Prompts carrying each flag (a prompt can carry several):

| Flag | Meaning | Prompts |
|---|---|---|
| ambiguous | a reasonable guess both matchers refuse, a generous alternative, or a guess that is another prompt | 43 |
| draw | hard to draw recognisably, or easy to draw like another prompt | 6 |
| season | winter imagery in a year-round prompt (dealt in Everyday sessions) | 5 |
| local | the word or the thing is regional | 2 |
| none | no flag | 25 |

- **Difficulty:** every prompt's `difficulty` is a placeholder (2): the list had none. Official selection keeps the pool's difficulty mix (`src/content/select.ts`), so until a reviewer sets real difficulties that balancing does nothing here.
- **Source:** every prompt is `original-creative` (the Stage 5 list, written for this app). A prompt is a single everyday word with no factual claim, so no source check applies.
- **Order:** the pack keeps the list's order. Every game deals by shuffling it with its seed, so changing the order changes which prompts a seed deals.

**Lint** (`npm run content:check`): none.

**Matcher probe**: each prompt lists plausible typed guesses and whether each game's real matcher accepts them. Both ignore case, accents, punctuation, spaces, a leading article and a final -s or -es. They differ in one way, which this stage does not change: **Team Draw** (`answerMatches` in `src/games/modules/teamKit.ts`) also forgives one typo when the accepted word has at least 7 letters; **Draw & Guess** (`guessMatches` in `src/games/modules/draw.ts`) forgives none. So "Raindeer" scores in Team Draw and not in Draw & Guess. A refused guess in Team Draw pauses that team's guessing for a moment and uses one of its tries for the round.

## Christmas prompts (3)

### dg-002 · reindeer

- **Season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "reindeer" (no alternatives)
- **Approval hash** `b5ac0e07918dc6f1` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Deer" refused, "Caribou" refused, "Rudolph" refused, "Raindeer" accepted in Team Draw, refused in Draw & Guess
- **Flags** `ambiguous` "Deer", "Caribou" and "Rudolph" are refused. `draw` Hard to tell from a deer or another antlered animal without a sleigh or a red nose.

### dg-003 · candy cane

- **Season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "candy cane" (no alternatives)
- **Approval hash** `09052891fb5912cb` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Cane" refused, "Candycane" accepted
- **Flags** `ambiguous` "Cane" and "Candy" alone are refused. `local` Candy canes are mainly a North American and European sweet.

### dg-004 · gingerbread house

- **Season** christmas · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "gingerbread house" (no alternatives)
- **Approval hash** `43e299dc6dfbacd4` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "House" refused, "Gingerbread" refused
- **Flags** `draw` Needs icing or sweets drawn on it to tell it from House (dg-052). `ambiguous` "House" (another prompt) and "Gingerbread" are refused.

## Year-round prompts (67)

### dg-001 · snowman

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "snowman", "snow man"
- **Approval hash** `75db043046629a82` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Snowmen" accepted in Team Draw, refused in Draw & Guess, "Snow man" accepted
- **Flags** `season` Winter imagery in a year-round prompt: dealt in Everyday sessions too.

### dg-005 · mitten

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "mitten", "glove"
- **Approval hash** `06e61995f8d26faf` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Mittens" accepted, "Gloves" accepted
- **Flags** `season` Winter clothing in a year-round prompt. `ambiguous` "Glove" is accepted, though a glove and a mitten are different things: generous, a reviewer's call.

### dg-006 · scarf

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "scarf" (no alternatives)
- **Approval hash** `6c5e2e35121a723d` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Scarves" refused
- **Flags** `season` Winter clothing in a year-round prompt. `ambiguous` The plural "Scarves" is refused (the matchers only drop a final -s or -es).

### dg-007 · sled

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "sled", "sledge", "toboggan"
- **Approval hash** `84da2ec3b6d9773b` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Sleigh" refused, "Sledge" accepted, "Toboggan" accepted
- **Flags** `season` Snow imagery in a year-round prompt. `ambiguous` "Sleigh", which a sled drawing in December invites, is refused.

### dg-008 · fireplace

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "fireplace" (no alternatives)
- **Approval hash** `7a9f3b6639f169fb` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Fire" refused, "Chimney" refused, "Fire place" accepted
- **Flags** `ambiguous` "Fire" is refused here but accepted for Campfire (dg-040); "Chimney" is refused. `draw` Close to Campfire (dg-040) unless the hearth and mantel are drawn.

### dg-009 · present

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "present", "gift", "parcel"
- **Approval hash** `a4c666ec1d140b24` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Box" refused, "Gift" accepted, "Parcel" accepted
- **Flags** `ambiguous` "Box", the likeliest guess for a wrapped present, is refused.

### dg-010 · bell

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "bell" (no alternatives)
- **Approval hash** `5cde1c7a01f5a1c0` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Bells" accepted, "Jingle bell" refused
- **Flags** `ambiguous` "Jingle bell" is refused.

### dg-011 · candle

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "candle" (no alternatives)
- **Approval hash** `7df87ef07c7775c5` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Candles" accepted
- **Flags** none

### dg-012 · cookie

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "cookie", "biscuit"
- **Approval hash** `3fe10d4699425322` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Biscuit" accepted, "Cookies" accepted
- **Flags** none

### dg-013 · teapot

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "teapot" (no alternatives)
- **Approval hash** `f7f4ac85bbdfa9a2` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Kettle" refused, "Tea pot" accepted
- **Flags** `ambiguous` "Kettle" is refused.

### dg-014 · umbrella

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "umbrella" (no alternatives)
- **Approval hash** `29f1b01df99a60a3` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Brolly" refused, "Parasol" refused
- **Flags** `ambiguous` "Brolly" and "Parasol" are refused.

### dg-015 · bicycle

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "bicycle", "bike"
- **Approval hash** `d482d0cd46255042` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Bike" accepted, "Cycle" refused
- **Flags** none

### dg-016 · rocket

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "rocket" (no alternatives)
- **Approval hash** `29e6552510d0cd0d` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Spaceship" refused, "Rockets" accepted
- **Flags** `ambiguous` "Spaceship" is refused.

### dg-017 · lighthouse

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "lighthouse" (no alternatives)
- **Approval hash** `4390e2e1a1a2ac8d` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Tower" refused, "Light house" accepted
- **Flags** `ambiguous` "Tower" is refused.

### dg-018 · octopus

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "octopus" (no alternatives)
- **Approval hash** `add0fbe1dca95bce` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Octopi" refused, "Octopuses" accepted, "Squid" refused
- **Flags** `ambiguous` "Squid" is refused (fair); the plural "Octopi" is refused.

### dg-019 · giraffe

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "giraffe" (no alternatives)
- **Approval hash** `25ff57ff51e95c6c` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Girafe" accepted in Team Draw, refused in Draw & Guess
- **Flags** none

### dg-020 · cactus

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "cactus" (no alternatives)
- **Approval hash** `f31b07fdeb2920d7` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Cacti" refused, "Cactuses" accepted
- **Flags** `ambiguous` The plural "Cacti" is refused.

### dg-021 · sandcastle

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "sandcastle", "sand castle"
- **Approval hash** `d7fc725883648800` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Castle" refused, "Sand castle" accepted
- **Flags** `draw` Needs a bucket, spade or beach to tell it from Castle (dg-026). `ambiguous` "Castle" (another prompt) is refused.

### dg-022 · volcano

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "volcano" (no alternatives)
- **Approval hash** `bf6e301ca31a6854` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Mountain" refused, "Volcanoes" accepted
- **Flags** `draw` Needs smoke or lava to tell it from Mountain (dg-067). `ambiguous` "Mountain" (another prompt) is refused.

### dg-023 · rainbow

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "rainbow" (no alternatives)
- **Approval hash** `43db5ac59b22ea71` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-024 · kite

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "kite" (no alternatives)
- **Approval hash** `c1d834cabf3eec44` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-025 · robot

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "robot" (no alternatives)
- **Approval hash** `fcb838377ebef66e` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-026 · castle

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "castle" (no alternatives)
- **Approval hash** `9b3ea4ff0b772abd` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Palace" refused, "Castles" accepted
- **Flags** `ambiguous` "Palace" is refused.

### dg-027 · pizza

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "pizza" (no alternatives)
- **Approval hash** `52c3616ef2fa66cf` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Pizza slice" refused, "Slice" refused
- **Flags** `ambiguous` "Pizza slice" is refused, though a slice is the usual way to draw it.

### dg-028 · banana

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "banana" (no alternatives)
- **Approval hash** `232f473157041efa` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-029 · guitar

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "guitar" (no alternatives)
- **Approval hash** `182ff4d184776706` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Violin" refused, "Ukulele" refused
- **Flags** `ambiguous` "Violin" and "Ukulele" are refused (fair: different instruments, but easy to draw alike).

### dg-030 · drum

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "drum" (no alternatives)
- **Approval hash** `349d52f87e01d863` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Drums" accepted
- **Flags** none

### dg-031 · crown

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "crown" (no alternatives)
- **Approval hash** `d4846d77b98bda62` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Tiara" refused
- **Flags** none

### dg-032 · anchor

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "anchor" (no alternatives)
- **Approval hash** `146fe5d23f5bc449` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-033 · penguin

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "penguin" (no alternatives)
- **Approval hash** `0186ffbe6e46c7dc` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-034 · owl

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "owl" (no alternatives)
- **Approval hash** `40745f05b03c3229` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-035 · snail

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "snail" (no alternatives)
- **Approval hash** `3231dcf732f6d54f` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Slug" refused
- **Flags** none

### dg-036 · butterfly

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "butterfly" (no alternatives)
- **Approval hash** `d056af313689a9d9` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Moth" refused
- **Flags** `ambiguous` "Moth" is refused (fair).

### dg-037 · spider web

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "spider web", "cobweb", "web"
- **Approval hash** `ba3c3e72a331b54a` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Spider" refused, "Web" accepted, "Spiderweb" accepted
- **Flags** `ambiguous` "Spider" is refused; "Web" is accepted.

### dg-038 · hot air balloon

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "hot air balloon", "balloon"
- **Approval hash** `31ac9ad81c6f8215` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Balloon" accepted, "Air balloon" refused
- **Flags** `ambiguous` Bare "Balloon" is accepted: generous, a reviewer's call.

### dg-039 · tent

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "tent" (no alternatives)
- **Approval hash** `1157f53383ee1f1a` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-040 · campfire

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "campfire", "fire", "bonfire"
- **Approval hash** `bde78d7578f3ced9` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Fire" accepted, "Bonfire" accepted, "Camp fire" accepted
- **Flags** `ambiguous` "Fire" is accepted here and refused for Fireplace (dg-008).

### dg-041 · igloo

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "igloo" (no alternatives)
- **Approval hash** `06173cb06aee8edd` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Igloos" accepted
- **Flags** `season` Snow and ice imagery in a year-round prompt.

### dg-042 · ice cream

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "ice cream", "ice cream cone"
- **Approval hash** `72a795aea8dee39a` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Icecream" accepted, "Cone" refused
- **Flags** `ambiguous` "Cone" is refused.

### dg-043 · cupcake

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "cupcake" (no alternatives)
- **Approval hash** `fb13fb27cf62aefc` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Cake" refused, "Muffin" refused, "Cup cake" accepted
- **Flags** `ambiguous` "Cake" and "Muffin" are refused.

### dg-044 · toothbrush

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "toothbrush" (no alternatives)
- **Approval hash** `9dcc3d2e6079a399` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Tooth brush" accepted
- **Flags** none

### dg-045 · glasses

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "glasses", "spectacles"
- **Approval hash** `b899178e0131bf43` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Sunglasses" refused, "Spectacles" accepted, "Glass" accepted
- **Flags** `ambiguous` "Sunglasses" is refused; "Glass" is accepted (as the singular).

### dg-046 · ladder

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "ladder" (no alternatives)
- **Approval hash** `f7cf2aa4f2008e1a` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-047 · key

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "key" (no alternatives)
- **Approval hash** `48f51168581dcdbb` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-048 · clock

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "clock" (no alternatives)
- **Approval hash** `75120542e22ca82b` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Watch" refused, "Alarm clock" refused
- **Flags** `ambiguous` "Watch" and "Alarm clock" are refused.

### dg-049 · moon

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "moon" (no alternatives)
- **Approval hash** `ce5b360e72e51a61` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Crescent" refused, "Full moon" refused
- **Flags** `ambiguous` "Crescent" and "Full moon" are refused.

### dg-050 · sun

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "sun" (no alternatives)
- **Approval hash** `13c8c6cc4a3d255c` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-051 · tree

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "tree" (no alternatives)
- **Approval hash** `33c1b9028acb0a69` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Christmas tree" refused, "Pine" refused, "Trees" accepted
- **Flags** `ambiguous` "Christmas tree" and "Pine" are refused: a tree drawn in a Christmas session invites them.

### dg-052 · house

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "house" (no alternatives)
- **Approval hash** `bd9e4944d06601d9` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Home" refused, "Hut" refused
- **Flags** `ambiguous` "Home" and "Hut" are refused.

### dg-053 · fish

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "fish" (no alternatives)
- **Approval hash** `62a30d6ae2335f13` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-054 · cat

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "cat" (no alternatives)
- **Approval hash** `6155aac3f2f77a18` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Kitten" refused, "Kitty" refused
- **Flags** `ambiguous` "Kitten" and "Kitty" are refused.

### dg-055 · dog

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "dog" (no alternatives)
- **Approval hash** `7b115f8aa46b634c` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Puppy" refused
- **Flags** `ambiguous` "Puppy" is refused.

### dg-056 · boat

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "boat", "ship"
- **Approval hash** `ba2622075eedd228` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Ship" accepted, "Sailboat" refused
- **Flags** `ambiguous` "Sailboat" is refused.

### dg-057 · train

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "train" (no alternatives)
- **Approval hash** `c8627ed2e92ff37f` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Locomotive" refused
- **Flags** none

### dg-058 · airplane

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "airplane", "aeroplane", "plane"
- **Approval hash** `90147b41ae22a3a9` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Plane" accepted, "Jet" refused, "Aircraft" refused
- **Flags** `ambiguous` "Jet" and "Aircraft" are refused.

### dg-059 · car

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "car" (no alternatives)
- **Approval hash** `fc5a40bacf59a218` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-060 · flower

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "flower" (no alternatives)
- **Approval hash** `3448ddefd9140bb0` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Rose" refused, "Daisy" refused
- **Flags** `ambiguous` A drawn flower invites its name: "Rose" and "Daisy" are refused.

### dg-061 · apple

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "apple" (no alternatives)
- **Approval hash** `52687550dbcc48a8` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-062 · football

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "football", "soccer ball", "ball"
- **Approval hash** `7b86a20b016ac6e0` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Soccer" refused, "Soccer ball" accepted, "Ball" accepted
- **Flags** `local` "Football" means different balls in different countries; "Ball" is accepted, so any ball drawing counts. `ambiguous` "Soccer" alone is refused.

### dg-063 · hat

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "hat" (no alternatives)
- **Approval hash** `8d5eb6f029647b7c` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Cap" refused
- **Flags** `ambiguous` "Cap" is refused.

### dg-064 · shoe

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "shoe" (no alternatives)
- **Approval hash** `99cb736adbaaa4e4` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Boot" refused, "Sneaker" refused
- **Flags** `ambiguous` "Boot" and "Sneaker" are refused.

### dg-065 · elephant

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "elephant" (no alternatives)
- **Approval hash** `a3ec0f7e29ec0f14` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-066 · lion

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "lion" (no alternatives)
- **Approval hash** `6602233f27ae0206` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Lioness" refused
- **Flags** `ambiguous` "Lioness" is refused (a lion drawn without a mane).

### dg-067 · mountain

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "mountain" (no alternatives)
- **Approval hash** `db65db40cd6ff004` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Hill" refused, "Mountains" accepted
- **Flags** `ambiguous` "Hill" and "Volcano" (another prompt) are refused.

### dg-068 · bridge

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "bridge" (no alternatives)
- **Approval hash** `7b19a3db6e48d997` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Flags** none

### dg-069 · windmill

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "windmill" (no alternatives)
- **Approval hash** `697fe008307886b6` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Wind turbine" refused
- **Flags** `ambiguous` "Wind turbine" is refused.

### dg-070 · telescope

- **Season** year-round · **status** provisional · **difficulty** 2 (placeholder) · **source** original-creative
- **Accepted** "telescope" (no alternatives)
- **Approval hash** `774cba1916b78021` (pack `draw-prompts` 1.0.0) · **approval record** none
- **Probe** "Binoculars" refused
- **Flags** `draw` Harder to draw recognisably than most: it can read as a tube or a cannon. `ambiguous` "Binoculars" is refused.
