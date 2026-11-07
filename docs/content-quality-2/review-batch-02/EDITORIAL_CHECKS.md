# Review batch 02: the five editorial checks (owner review, 2026-11-07)

**Status:** an AI editorial pass, not a human review. Every item stays `provisional`. The creative direction is approved; **individual items are not**, and need fact-checking and editorial review before official use.

The small wording changes below come from `scripts/content-quality/revisions/rev03_batch02_checks.py`. Each change restates the item's existing explanation; none adds a new fact. The review sheet and [BEFORE_AFTER.md](BEFORE_AFTER.md) are regenerated.

## Correction requested: `cls-cq2-05` (London–New York)

You were right: "great-circle" is a sphere term, and the answer, 5,555 km, is the WGS 84 ellipsoid value. Fixed by `rev02_cls05_distance.py`:

| | Before | After |
|---|---|---|
| Prompt | "What is the great-circle (shortest flight path) distance from London Heathrow to New York JFK airport, in km?" | "How far is it from London Heathrow to New York JFK by the shortest route over the Earth's surface, in km?" |
| Scoring convention | implied | Stated in the source: the answer is the WGS 84 geodesic between the airport reference points, 5,554.9 km, rounded to **5,555**. A sphere gives 5,540.0 km. |
| Explanation | "…on the standard WGS 84 Earth model…" | "About 5,555 km, measured on the standard WGS 84 model of the Earth's shape. A perfect-sphere calculation gives about 5,540 km. Real flights go further…" |

**Checks:**
- Both values were recomputed: Vincenty on WGS 84 gives 5,554.9 km; haversine with R = 6,371 km gives 5,540.0 km.
- Closest Wins scores by rank, so a player who answers 5,540 is simply 15 km away, like any other guess.
- A test checks that the item no longer uses the word "great-circle".

## 1. Will casual players understand the modern-culture questions?

| Item | Judgement | Change |
|---|---|---|
| `trv-cq2-21` Creeper | The prompt said "Notch", a name only Minecraft fans know. | Now "the game's creator". Notch stays in the explanation. |
| `trv-cq2-22` YouTube's first video | Clear without knowing the co-founder; the options are guessable. | None |
| `cls-cq2-21` "Old Town Road" | Clear. A casual player can estimate it ("a long time at No. 1"). | None |
| `year-cq2-21` Wii, `year-cq2-22` Ice Bucket Challenge | Shared memories of their era; good. | None |
| `trv-cq2-23` Spirited Away | Easy opener. All four options are Ghibli films, so a non-fan can still eliminate. | None |
| `imp-cq2-21` "Group chat" | Universal. | None |

## 2. Do fandom-specific questions belong in themed playlists?

- **`cls-cq2-22` (151 Pokémon):** stays in Mixed Party Night. It is a number most millennials half-remember, and non-fans can still estimate it. If reviewers find it too fandom-heavy, it moves to Gaming only; that changes one tag, not the item.
- **The "name the original 151" Category Sprint list:** stays a themed Gaming-pack candidate (E2 v3 §6). It is not in the library.
- **No other item in the batch needs fan knowledge** to have a fair chance.

## 3. Do the Impostor prompts create engaging bluffing?

**`imp-cq2-21`: secret word "Group chat", hint "On your phone".**
- **Good:** honest players can give clues that prove they know the word without giving it away ("muted", "drama", "left on read").
- **Risk:** the hint is broad, but "group chat" is one of the first things anyone thinks of on a phone. A sharp impostor may guess the word from the hint alone, which makes the round easy for them.

That is a hypothesis, not a finding. Before any approval, playtest it. Two signals would confirm the risk:
- the impostor guesses the word in more than half of the games;
- honest players' clues converge in the first round.

If it is confirmed, the fix is a narrower hint ("An app feature") or a less obvious word.

## 4. Do repeated internet-origin stories make a round predictable?

**There is a real risk.** Six of the 21 items are "how X started" stories: the Creeper, YouTube's first video, Nintendo's playing cards, the Ice Bucket Challenge, KFC's Christmas advert and Rousseau's "brioche".

**Fixed in the tags:** `trv-cq2-22` (YouTube) is now tagged `origin-story` like the Creeper. The round-variety rule then allows at most two origin stories in a Trivia round, never back to back. The batch's 8 Trivia items still form a valid round.

**Across games:** origin stories also appear in Guess the Year (Nintendo, Ice Bucket). A night that plays Trivia and Guess the Year back to back could still feel samey. The E10 proposal ([../E10_ROUND_VARIETY.md](../E10_ROUND_VARIETY.md)) handles variety within one game. Variety across games in the same night is noted there as future work, not built.

## 5. Are the reveals concise, accurate, entertaining and worth reading?

| Item | Before | After |
|---|---|---|
| `geo-cq2-04` | "France!" | "France, thanks to overseas territories scattered across the world's oceans." |
| `year-cq2-21` | "2006." | "2006: the year Wii Sports bowling took over living rooms." |
| `year-cq2-22` | "2014." | "2014: the summer feeds filled with buckets of ice water." |
| `trv-cq2-10` | about 200 characters, ending with van Helmont | "Mostly thin air: a tree is built mainly from carbon and oxygen pulled out of CO2." The van Helmont history stays out, as before; the full answer is in the explanation. |

**Already good, kept as they are:**
- the Creeper ("bacon bug");
- YouTube ("19 seconds of trunk appreciation");
- Rousseau;
- the US-states letter;
- Spirited Away;
- Pokémon ("a 90s kid is very smug");
- Japan's KFC.

**Caption Clash and Impostor reveals are mechanical** ("revealed anonymously, then voted on"). Their payoff is the players' own captions and the vote, so no written reveal is needed.

## Balance

The batch still has:
- **Serious:** the tree's mass, Rousseau, time zones, the missing letter and the distance.
- **Playful:** the Creeper, YouTube, the cat bed review, KFC.
- **Modern:** Old Town Road, Group chat, Spirited Away.
- **Nostalgic:** the Wii, Pokémon, the Ice Bucket Challenge.

None of the edits above changed the tone tags, so the mix described in [README.md](README.md) still holds.
