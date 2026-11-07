"""One-off, reviewable edit of content/pilot/pilot-cq2.json for the owner's
Content Quality 2.0 feedback (2026-11-07). Run once from the repo root:
    python3 scripts/content-quality/revisions/rev01_owner_feedback.py
Every change keeps review.status 'provisional'; nothing is approved.
Facts marked 'AI web check' were compared against public sources by the
author (Claude) and still need a human fact-check."""
import json, copy

PATH = "content/pilot/pilot-cq2.json"
d = json.load(open(PATH, encoding="utf-8"))
E = d["entries"]
by = {e["item"]["id"]: e for e in E}
REVIEW = {"status": "provisional", "notes": "Content Quality 2.0 pilot draft by Claude. Not human-reviewed, not fact-checked by a person, not approved. Verification requirement is in the editorial block."}
AIW = "AI web check 2026-11-07 (not a human fact-check): "

def new(game, item, editorial):
    base = {"difficulty": 2, "language": "en", "eligibility": "official", "review": copy.deepcopy(REVIEW), "tags": ["cq2-pilot"]}
    base.update(item)
    e = {"game": game, "item": base, "editorial": editorial}
    E.append(e); by[base["id"]] = e
    return e

# ---------- 1. Owner-prioritised fixes ----------
g = by["geo-cq2-04"]["item"]
g["prompt"] = "Counting overseas territories, which country spans the most standard time zones?"
g["explanation"] = "France: 12 standard offsets across its overseas territories (13 with its Antarctic claim). Russia and the US have 11 each; the US count includes uninhabited Pacific islands."
g["ambiguity"] = "Counts standard time (not summer time) and includes overseas territories, as the prompt says. Russia's 11 are all on its own territory."
g["source"]["ref"] = "timeanddate.com 'Which country has the most time zones?'; Guinness World Records 'Country with the most time zones' (France 12, 13 with Adélie Land)"
by["geo-cq2-04"]["editorial"]["verification"] = AIW + "timeanddate.com and Guinness World Records agree: France 12 (13 with Adélie Land), Russia 11, US 11 with territories. A human should confirm all four counts, including the UK's."

t = by["trv-cq2-10"]["item"]
t["explanation"] = "The air. Wood is mostly cellulose and lignin; their carbon and most of their oxygen come from CO2 taken in by the leaves. Water supplies the hydrogen, and soil minerals are only a few per cent."
t["source"]["ref"] = "Plant physiology textbook treatment of photosynthetic carbon fixation and plant dry-mass composition (e.g. Taiz & Zeiger, Plant Physiology); van Helmont's willow experiment (1640s)"
ed = by["trv-cq2-10"]["editorial"]
ed["reveal"] = "Mostly from thin air: a tree's dry mass is mainly carbon and oxygen captured from CO2. Van Helmont's 1640s willow gained far more weight than its soil lost; he wrongly credited the water."
ed["verification"] = "Check against a plant physiology text: dry mass is mostly C, O and H; C and the O in carbohydrates come from CO2, H from water; minerals (ash) are a few per cent. Confirm the van Helmont summary (no figures are quoted)."

# Rousseau: Who Said That? cannot show a question line (E5), so the item becomes Trivia with the question in the prompt.
w = by.pop("who-cq2-02"); E.remove(w)
new("trivia", {
    "id": "trv-cq2-14", "difficulty": 3, "category": "History",
    "source": {"kind": "reference", "ref": "Jean-Jacques Rousseau, 'Confessions', Book VI (written 1765-69, published 1782); Encyclopaedia Britannica, 'Did Marie-Antoinette really say \"Let them eat cake\"?'"},
    "prompt": "'Let them eat cake' (in French, really 'brioche') was first written down by which author, about an unnamed princess?",
    "options": ["Jean-Jacques Rousseau", "Marie Antoinette", "Voltaire", "Molière"],
    "answer": "Jean-Jacques Rousseau",
    "explanation": "Rousseau, in his Confessions (Book VI, written in the 1760s), about 'a great princess'. Marie Antoinette was a child in Austria then, and there is no record that she ever said it.",
}, {
    "expectedCorrect": "15–35%",
    "reveal": "Rousseau — the line was pinned on Marie Antoinette later, by people who wanted her to look heartless.",
    "verification": AIW + "Britannica confirms the Book VI 'great princess' anecdote, the brioche wording, and no evidence Marie Antoinette said it. A human should check the Confessions text and dating.",
    "whyInclude": "A famous misattribution with a satisfying reveal. Rewritten from who-cq2-02 so the question ('first written down by') is on screen without engine change E5.",
    "rubric": {"entertainment": 5, "creativity": 4, "clarity": 4, "distractors": 4, "social": 4},
    "replaces": ["who-cq2-02"],
})

c = by["cls-cq2-05"]["item"]
c["prompt"] = "What is the great-circle (shortest flight path) distance from London Heathrow to New York JFK airport, in km?"
c["answer"] = 5555
c["explanation"] = "About 5,555 km between the two airports on the standard WGS 84 Earth model. Real flights are usually longer because of winds and air routes."
c["source"]["ref"] = "Geodesic (Vincenty, WGS 84) distance between airport reference points LHR 51.4700 N 0.4543 W and JFK 40.6413 N 73.7781 W = 5,554.9 km (spherical haversine gives 5,540 km)"
ed = by["cls-cq2-05"]["editorial"]
ed["reveal"] = "About 5,555 km airport to airport."
ed["verification"] = "Computed: Vincenty geodesic on WGS 84 = 5,554.9 km. Convention fixed: airport reference points, ellipsoidal Earth. A human should confirm against a published great-circle calculator (e.g. Great Circle Mapper)."

# ---------- 2. Qualify disputed or measurement-dependent claims ----------
g = by["geo-cq2-02"]["item"]
g["prompt"] = "By the CIA World Factbook's measure, which country has the longest coastline?"
g["explanation"] = "Canada: about 202,000 km by the Factbook's measure, thanks to tens of thousands of Arctic islands. Coastline length depends on how finely you measure it."
c = by["cls-cq2-01"]["item"]
c["prompt"] = "How tall is the Burj Khalifa in Dubai, to its architectural top, in metres?"
c["explanation"] = "828 m to the architectural top (CTBUH) — more than twice the height of the Eiffel Tower, which is 330 m including its antennas."
by["cls-cq2-01"]["editorial"]["reveal"] = "828 m."
c = by["cls-cq2-06"]["item"]
c["explanation"] = "35. Born January 1756, died December 1791, two months short of his 36th birthday. The Köchel catalogue of his works runs to K. 626, the unfinished Requiem."
by["cls-cq2-06"]["editorial"]["verification"] = "Check birth and death dates against a music reference (e.g. Grove); check that K. 626 is the Requiem's Köchel number."
t = by["trv-cq2-05"]["item"]
t["prompt"] = "In Arthur Conan Doyle's 60 Sherlock Holmes stories, how often does Holmes say 'Elementary, my dear Watson'?"
t["explanation"] = "Never. Holmes says 'Elementary' once ('The Crooked Man') and 'my dear Watson' often, but never together. The full phrase was popularised later, notably by films."
y = by["year-cq2-01"]["item"]
y["event"] = "'Raja Harishchandra', widely regarded as India's first full-length feature film, was released"

# ---------- 3. Category Sprint: E2 v3 (no peer vote; sizes from simulation) ----------
V3 = "Unchanged scoring (20 per valid distinct answer, +20 if nobody else gave it). Proposed matching: E2 v3 (closed sets, category-scoped aliases, no peer vote) — not implemented, needs owner approval."
for sid in ("spr-cq2-01", "spr-cq2-02", "spr-cq2-03", "spr-cq2-04"):
    by[sid]["editorial"]["scoring"] = V3
pf = by["spr-cq2-01"]["editorial"]["proposedFields"]
pf.update({"closedSet": True, "setSize": 12, "recallProfile": "famous-first", "definition": "UN member states in South America"})
by["spr-cq2-01"]["item"]["eligibility"] = "practice"
by["spr-cq2-01"]["editorial"]["whyInclude"] = "A clean closed set, but only 12 members: the E2 v3 simulation shows about one valid answer in five earns the bonus even with 4 players, so it is practice-only."
by["spr-cq2-03"]["item"]["eligibility"] = "practice"
by["spr-cq2-03"]["editorial"]["proposedFields"].update({"closedSet": True, "setSize": 13, "recallProfile": "dominant", "definition": "The 8 planets and the 5 IAU-recognised dwarf planets"})
by["spr-cq2-03"]["editorial"]["whyInclude"] = "Fun in practice; players recite the planets in order, so the E2 v3 'dominant' profile makes it unsuitable for official play."
z = by["spr-cq2-02"]
z["item"]["eligibility"] = "practice"
z["editorial"]["proposedFields"] = {
    "closedSet": True, "setSize": 12, "recallProfile": "dominant",
    "definition": "The 12 animals of the Chinese zodiac",
    "aliases": {
        "sheep": {"to": "goat", "reason": "The sign 羊 (yáng) is translated Goat, Sheep or Ram in standard references"},
        "ram": {"to": "goat", "reason": "As above: a standard translation of 羊"},
        "rooster": None,
        "chicken": {"to": "rooster", "reason": "The sign 鸡 (jī) literally means chicken; Rooster is the conventional English name"},
        "cockerel": {"to": "rooster", "reason": "British English for rooster"},
        "boar": {"to": "pig", "reason": "The sign 猪 (zhū) is sometimes translated Boar"},
        "hare": {"to": "rabbit", "reason": "兔 (tù) is translated Rabbit or Hare"},
        "mouse": {"to": "rat", "reason": "鼠 (shǔ) covers both rat and mouse"},
    },
    "knownNotAccepted": {
        "cat": "The Cat replaces the Rabbit in the Vietnamese zodiac, not the Chinese one (owner ruling 2026-11-07)",
        "buffalo": "The Buffalo replaces the Ox in the Vietnamese zodiac, not the Chinese one",
    },
}
del z["editorial"]["proposedFields"]["aliases"]["rooster"]
z["editorial"]["verification"] = "Check the 12 animals and each alias reason against a cultural reference. No alias applies outside this category. 'cat' is not accepted (owner ruling)."
z["editorial"]["whyInclude"] = "Cultural range and a natural reveal, but players recite it in order, so it is practice-only under E2 v3. A Vietnamese-zodiac category could be added separately."
r = by["spr-cq2-04"]
r["item"]["eligibility"] = "practice"
r["editorial"]["proposedFields"] = {"closedSet": False}
r["editorial"]["verification"] = "Every listed word rhymes with 'cake' in standard British and American pronunciation; an editor should read the list aloud once. Open set: practice only; unlisted rhymes show as 'Not on our list'."
r["editorial"]["whyInclude"] = "Anyone can play, from seven to seventy. Open set, so practice only."

US = ["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming"]
assert len(US) == 50
new("category-sprint", {
    "id": "spr-cq2-05", "difficulty": 1, "category": "Closed set",
    "source": {"kind": "reference", "ref": "The 50 states of the United States"},
    "name": "US states", "answers": US,
}, {
    "expectedCorrect": "closed set",
    "reveal": "All 50 on screen, with the states only one player found highlighted.",
    "verification": "Computed list of the 50 state names (same list as trv-cq2-12's letter check). A human should spot-check spelling.",
    "whyInclude": "The E2 v3 example of an official-ready closed set: 50 members, famous-first recall, suitable for 4-10 players by the simulation (min 40 at 10 players).",
    "rubric": {"entertainment": 4, "creativity": 3, "clarity": 5, "distractors": 4, "social": 4},
    "scoring": V3,
    "proposedFields": {"closedSet": True, "setSize": 50, "recallProfile": "famous-first", "definition": "The 50 US states (not DC or territories)",
        "knownNotAccepted": {"district of columbia": "A federal district, not a state", "washington dc": "A federal district, not a state", "puerto rico": "A US territory, not a state", "guam": "A US territory, not a state"}},
})

# ---------- 4. New modern / nostalgic / playful items (tone rebalance) ----------
new("trivia", {
    "id": "trv-cq2-21", "category": "Gaming",
    "source": {"kind": "reference", "ref": "'Minecraft: The Story of Mojang' (2012 documentary); Wikipedia 'Creeper (Minecraft)'"},
    "prompt": "Minecraft's Creeper was a happy accident. What was Notch trying to make when he mixed up the model's length and height?",
    "options": ["A pig", "A zombie", "A tree", "A sheep"],
    "answer": "A pig",
    "explanation": "A pig. Markus 'Notch' Persson swapped the dimensions, got a tall, thin, four-legged mob instead, and kept it as a monster.",
}, {
    "expectedCorrect": "25–45%",
    "reveal": "A pig! Gaming's most famous villain started as a bacon bug.",
    "verification": AIW + "Wikipedia's Creeper article and reporting on the 2012 documentary agree (pig model, length and height swapped). A human should confirm against the documentary or Notch's own statement.",
    "whyInclude": "Gaming culture with a funny origin story; non-gamers can still guess, and Minecraft players get to explain it.",
    "rubric": {"entertainment": 5, "creativity": 4, "clarity": 5, "distractors": 4, "social": 5},
})
new("trivia", {
    "id": "trv-cq2-22", "difficulty": 2, "category": "Internet",
    "source": {"kind": "reference", "ref": "'Me at the zoo', uploaded 23 April 2005 by Jawed Karim (Wikipedia; NBC News 20th-anniversary report)"},
    "prompt": "The first video ever uploaded to YouTube (2005) shows co-founder Jawed Karim at a zoo. What does he talk about?",
    "options": ["Elephants' long trunks", "A sleeping lion", "Penguins at feeding time", "A giraffe stealing his hat"],
    "answer": "Elephants' long trunks",
    "explanation": "'Me at the zoo': 19 seconds at San Diego Zoo, where Karim notes the elephants have 'really, really, really long trunks'. That's the whole video.",
}, {
    "expectedCorrect": "35–55%",
    "reveal": "Elephants. Internet history began with 19 seconds of trunk appreciation.",
    "verification": AIW + "Wikipedia and NBC confirm the date, uploader, San Diego Zoo and elephants; length is reported as 18 or 19 seconds. A human should watch the video to confirm the quoted line.",
    "whyInclude": "Internet history everyone uses but few know; the reveal is gloriously mundane.",
    "rubric": {"entertainment": 5, "creativity": 4, "clarity": 5, "distractors": 4, "social": 4},
})
new("trivia", {
    "id": "trv-cq2-23", "difficulty": 1, "category": "Film & anime",
    "source": {"kind": "reference", "ref": "Studio Ghibli, 'Spirited Away' (2001); Academy Awards database (Best Animated Feature, 2003 ceremony)"},
    "prompt": "In which Studio Ghibli film do a girl's parents turn into pigs after eating food meant for spirits?",
    "options": ["Spirited Away", "My Neighbor Totoro", "Howl's Moving Castle", "Princess Mononoke"],
    "answer": "Spirited Away",
    "explanation": "Spirited Away (2001). Chihiro works in a bathhouse for spirits to save her parents; the film won the Oscar for Best Animated Feature.",
}, {
    "expectedCorrect": "55–75%",
    "reveal": "Spirited Away — and every option is a Ghibli classic worth a watch.",
    "verification": "Check the plot point and the Oscar (75th Academy Awards, 2003) against the Academy database.",
    "whyInclude": "Anime that crosses over to non-fans; an accessible opener with real distractors.",
    "rubric": {"entertainment": 4, "creativity": 3, "clarity": 5, "distractors": 4, "social": 4},
})
new("closest-wins", {
    "id": "cls-cq2-21", "category": "Music",
    "source": {"kind": "reference", "ref": "Billboard Hot 100 chart history: 'Old Town Road' No. 1 from the chart dated 13 April to 17 August 2019"},
    "prompt": "In 2019, 'Old Town Road' by Lil Nas X set a record for consecutive weeks at No. 1 on the US Billboard Hot 100. How many weeks?",
    "unit": "weeks", "answer": 19,
    "explanation": "19 weeks in a row, beating the 16 of 'Despacito' and 'One Sweet Day'. Shaboozey's 'A Bar Song (Tipsy)' matched 19 weeks at No. 1 in 2024, but not in a row.",
}, {
    "expectedCorrect": "estimate",
    "reveal": "19 weeks — most of summer 2019.",
    "verification": AIW + "Billboard-based reports (Stereogum, CBC) confirm 19 weeks and the previous 16-week record; reports from Nov 2024 confirm Shaboozey's non-consecutive 19. The answer itself is fixed history; the comparison line should be re-checked if a song passes 19.",
    "whyInclude": "Music history young adults lived through; guesses spread from 5 to 30, so ranking is meaningful.",
    "rubric": {"entertainment": 4, "creativity": 4, "clarity": 4, "distractors": 4, "social": 4},
    "scoring": "Rank-based Closest Wins scoring (closest 100, then 70/50/25); no change.",
})
new("closest-wins", {
    "id": "cls-cq2-22", "difficulty": 1, "category": "Gaming",
    "source": {"kind": "reference", "ref": "Pokémon Red and Blue (Game Freak / Nintendo, 1996 Japan as Red and Green; 1998 US): Kanto Pokédex of 151"},
    "prompt": "How many Pokémon could you register in the Pokédex of the original Pokémon Red and Blue, counting Mew?",
    "unit": "Pokémon", "answer": 151,
    "explanation": "151 — the original 'Gotta catch 'em all' target. Mew, number 151, couldn't be caught in normal play; most players got it at official events.",
}, {
    "expectedCorrect": "fans exact; others estimate",
    "reveal": "151. Somewhere in the room, a 90s kid is very smug.",
    "verification": "Check the Kanto Pokédex count and Mew's event distribution against The Pokémon Company or Bulbapedia.",
    "whyInclude": "Pure nostalgia: fans nail it, everyone else can estimate, and the reveal starts stories.",
    "rubric": {"entertainment": 5, "creativity": 3, "clarity": 5, "distractors": 3, "social": 5},
    "scoring": "Rank-based Closest Wins scoring (closest 100, then 70/50/25); exact guesses tie for the top award; no change.",
})
new("guess-the-year", {
    "id": "year-cq2-21", "difficulty": 1, "category": "Gaming",
    "source": {"kind": "reference", "ref": "Nintendo Wii launch: 19 Nov 2006 (North America), 2 Dec 2006 (Japan), 8 Dec 2006 (Europe)"},
    "event": "The Nintendo Wii went on sale", "year": 2006,
    "context": "November 2006 in North America, December 2006 in Japan and Europe. Wii Sports bowling turned living rooms (and grandparents) into gamers.",
}, {
    "expectedCorrect": "40–60% within 2 years",
    "reveal": "2006.",
    "verification": AIW + "Mario Wiki and Wikipedia's Wii launch article agree on 19 Nov 2006 (NA) and 2 Dec 2006 (JP). A human should confirm the Europe date against Nintendo.",
    "whyInclude": "2000s nostalgia most players have a personal memory of.",
    "rubric": {"entertainment": 4, "creativity": 3, "clarity": 5, "distractors": 4, "social": 5},
    "scoring": "Guess the Year scoring unchanged: max(0, 100 − 10 × |guess − year|).",
})
new("guess-the-year", {
    "id": "year-cq2-22", "difficulty": 2, "category": "Internet",
    "source": {"kind": "reference", "ref": "Ice Bucket Challenge, viral July–August 2014 (Wikipedia; Nature, 2017, 'Was it worth it?')"},
    "event": "The Ice Bucket Challenge went viral, raising money for ALS research", "year": 2014,
    "context": "Summer 2014. Millions filmed themselves under ice water; ALS charities raised more than $100 million in a few weeks.",
}, {
    "expectedCorrect": "40–60% within 2 years",
    "reveal": "2014.",
    "verification": AIW + "Wikipedia and a Nature feature date it to July–August 2014; reported totals vary ($100M–$220M) so the context says 'more than $100 million'. A human should confirm against the ALS Association.",
    "whyInclude": "A viral moment with a feel-good ending; most players remember their feed that summer.",
    "rubric": {"entertainment": 4, "creativity": 3, "clarity": 5, "distractors": 4, "social": 5},
    "scoring": "Guess the Year scoring unchanged: max(0, 100 − 10 × |guess − year|).",
})
new("impostor", {
    "id": "imp-cq2-21", "difficulty": 1, "category": "Modern life", "eligibility": "practice",
    "source": {"kind": "original-creative"},
    "word": "Group chat", "hintCategory": "On your phone",
}, {
    "expectedCorrect": "n/a (social)",
    "reveal": "The impostor is revealed at the end of the vote.",
    "verification": "Editorial read-through only.",
    "whyInclude": "Everyone has strong feelings about a group chat, so clues are funny ('muted', 'forty unread') while the impostor bluffs with 'apps' and 'notifications'.",
    "rubric": {"entertainment": 5, "creativity": 4, "clarity": 5, "distractors": 4, "social": 5},
    "scoring": "Practice-only game; no Cup points.",
})

# ---------- 5. Tone, playlists and question mechanics for every entry ----------
TONE = {  # classic | modern | nostalgia | weird (can overlap)
 "trv-cq2-01":["classic"],"trv-cq2-02":["modern","nostalgia"],"trv-cq2-03":["classic"],"trv-cq2-04":["classic"],"trv-cq2-05":["classic"],
 "trv-cq2-06":["classic"],"trv-cq2-07":["weird"],"trv-cq2-08":["weird","modern"],"trv-cq2-09":["weird"],"trv-cq2-10":["classic"],
 "trv-cq2-11":["weird"],"trv-cq2-12":["classic"],"trv-cq2-13":["weird"],"trv-cq2-14":["classic","weird"],
 "trv-cq2-21":["modern","weird"],"trv-cq2-22":["modern","nostalgia","weird"],"trv-cq2-23":["modern","nostalgia"],
 "cls-cq2-01":["classic"],"cls-cq2-02":["classic"],"cls-cq2-03":["classic","weird"],"cls-cq2-04":["classic"],"cls-cq2-05":["classic"],
 "cls-cq2-06":["classic"],"cls-cq2-07":["classic","weird"],"cls-cq2-08":["classic"],"cls-cq2-21":["modern","nostalgia"],"cls-cq2-22":["nostalgia","modern"],
 "year-cq2-01":["classic"],"year-cq2-02":["classic"],"year-cq2-03":["classic"],"year-cq2-04":["nostalgia","modern"],"year-cq2-05":["classic"],
 "year-cq2-06":["nostalgia"],"year-cq2-07":["weird","modern"],"year-cq2-21":["nostalgia","modern"],"year-cq2-22":["nostalgia","modern"],
 "geo-cq2-01":["classic"],"geo-cq2-02":["classic"],"geo-cq2-03":["classic"],"geo-cq2-04":["classic","weird"],"geo-cq2-05":["classic"],"geo-cq2-06":["classic","weird"],"geo-cq2-07":["classic"],
 "who-cq2-01":["classic"],"who-cq2-03":["classic"],"who-cq2-04":["classic"],
 "con-cq2-01":["classic"],"con-cq2-02":["classic"],"con-cq2-03":["classic"],
 "cap-cq2-01":["weird","modern"],"cap-cq2-02":["weird","modern"],"cap-cq2-03":["weird"],"cap-cq2-04":["weird"],"cap-cq2-05":["weird","modern"],"cap-cq2-06":["weird"],
 "spr-cq2-01":["classic"],"spr-cq2-02":["classic"],"spr-cq2-03":["classic"],"spr-cq2-04":["weird"],"spr-cq2-05":["classic"],
 "imp-cq2-01":["modern"],"imp-cq2-02":["modern"],"imp-cq2-03":["classic"],"imp-cq2-04":["modern"],"imp-cq2-21":["modern"],
 "chr-cq2-01":["modern"],"chr-cq2-02":["classic"],"chr-cq2-03":["weird"],"chr-cq2-04":["modern","weird"],
}
PLAYLIST = {"classic": "Brainy & Challenging", "modern": "Modern Culture", "nostalgia": "2000s Nostalgia", "weird": "Weird but True"}
EXTRA = {"trv-cq2-21":["Gaming"],"cls-cq2-22":["Gaming"],"year-cq2-21":["Gaming"],"year-cq2-04":["Gaming"],"year-cq2-07":["Gaming"],
 "trv-cq2-22":["Internet & Memes"],"year-cq2-22":["Internet & Memes"],"cls-cq2-21":["Music & Entertainment"],"trv-cq2-23":["Music & Entertainment"],
 "trv-cq2-02":["Music & Entertainment"],"trv-cq2-04":["Music & Entertainment"],
 "geo-cq2-01":["World Knowledge"],"geo-cq2-02":["World Knowledge"],"geo-cq2-03":["World Knowledge"],"geo-cq2-04":["World Knowledge"],"geo-cq2-05":["World Knowledge"],"geo-cq2-06":["World Knowledge"],"geo-cq2-07":["World Knowledge"],"trv-cq2-08":["World Knowledge"],"year-cq2-01":["World Knowledge"],"year-cq2-02":["World Knowledge"]}
# Question mechanic for the quiz games (used by the round-variety rule).
MECH = {"trv-cq2-01":"recall","trv-cq2-02":"recall","trv-cq2-03":"recall","trv-cq2-04":"never-said","trv-cq2-05":"never-said",
 "trv-cq2-06":"myth-buster","trv-cq2-07":"myth-buster","trv-cq2-08":"weird-but-true","trv-cq2-09":"origin-story","trv-cq2-10":"myth-buster",
 "trv-cq2-11":"definition-twist","trv-cq2-12":"deduction","trv-cq2-13":"weird-but-true","trv-cq2-14":"misattribution",
 "trv-cq2-21":"origin-story","trv-cq2-22":"recall","trv-cq2-23":"recognition",
 "geo-cq2-01":"recall","geo-cq2-02":"comparison","geo-cq2-03":"recall","geo-cq2-04":"myth-buster","geo-cq2-05":"comparison","geo-cq2-06":"comparison","geo-cq2-07":"myth-buster",
 "who-cq2-01":"misquote","who-cq2-03":"misquote","who-cq2-04":"recall"}
NEG = {"trv-cq2-04","trv-cq2-05","trv-cq2-12"}  # stems built on "never"/"not"
for e in E:
    i = e["item"]["id"]; tones = TONE[i]
    ed = e["editorial"]
    ed["tone"] = tones
    pl = ["Mixed Party Night"] + [PLAYLIST[t] for t in tones] + EXTRA.get(i, [])
    ed["playlists"] = list(dict.fromkeys(pl))
    if i in MECH: ed["mechanic"] = MECH[i]
    if i in NEG: ed["negativeStem"] = True

d["entries"] = E
json.dump(d, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(PATH, "a").write("\n")
print("entries:", len(E))
