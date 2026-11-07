"""E2 v3 implementation: closed-set Category Sprint categories (one-shot, readable).

Writes:
  content/reference/sprint/<id>.json   membership lists, as published by a named authority
  content/packs/category-sprint-closed.json   7 closed-set categories (all provisional)
and moves the open Sprint 4 categories to practice (owner ruling: closed-set-only
official competition, approved in principle 2026-11-07).

Membership lists were TRANSCRIBED by the author (Claude) from general knowledge of
each authority's list. They were NOT compared with the source pages: this session's
network blocks those hosts. Each reference therefore has no `sourceCheck`, and the
loader refuses any real approval of an item that uses it until a person adds one.
The counts were cross-checked by web search on 2026-11-07 (EU 27, UN Africa 54,
IAU 5 dwarf planets); that is not a member-by-member check.

Run from the repo root: python3 scripts/content-quality/revisions/e2_closed_sets.py
"""
import json, os, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REF_DIR = os.path.join(ROOT, "content", "reference", "sprint")
PACKS = os.path.join(ROOT, "content", "packs")
TRANSCRIBED = "Transcribed by the author (Claude, 2026-11-07) from the authority's list; NOT yet compared with the source page (network blocked). Count cross-checked by web search."


def norm(s):  # mirrors normalizeSprintAnswerV2 in src/games/sprint.ts
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[-_/'’`‘]", " ", s)
    s = re.sub(r"[^a-z ]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"^(the|a|an) (?=\S)", "", s)


REFS = [
    dict(id="us-states", title="The 50 states of the United States",
         source=dict(authority="U.S. Census Bureau (state codes list)", url="https://www.census.gov/library/reference/code-lists/ansi/ansi-codes-for-states.html", publishedCount=50),
         members=["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"]),
    dict(id="eu-member-states", title="Member states of the European Union",
         source=dict(authority="European Union (europa.eu, EU countries)", url="https://european-union.europa.eu/principles-countries-history/eu-countries_en", publishedCount=27),
         members=["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden"],
         timeSensitive=dict(asOf="2026-11-07", reviewBy="2027-11-07")),
    dict(id="un-members-africa", title="UN member states in Africa",
         source=dict(authority="United Nations (member states), African region", url="https://www.un.org/en/about-us/member-states", publishedCount=54),
         members=["Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros", "Congo", "Côte d'Ivoire", "Democratic Republic of the Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe"],
         timeSensitive=dict(asOf="2026-11-07", reviewBy="2027-11-07")),
    dict(id="chemical-elements", title="The 118 chemical elements (IUPAC names)",
         source=dict(authority="IUPAC Periodic Table of Elements", url="https://iupac.org/what-we-do/periodic-table-of-elements/", publishedCount=118),
         members=["Hydrogen", "Helium", "Lithium", "Beryllium", "Boron", "Carbon", "Nitrogen", "Oxygen", "Fluorine", "Neon", "Sodium", "Magnesium", "Aluminium", "Silicon", "Phosphorus", "Sulfur", "Chlorine", "Argon", "Potassium", "Calcium", "Scandium", "Titanium", "Vanadium", "Chromium", "Manganese", "Iron", "Cobalt", "Nickel", "Copper", "Zinc", "Gallium", "Germanium", "Arsenic", "Selenium", "Bromine", "Krypton", "Rubidium", "Strontium", "Yttrium", "Zirconium", "Niobium", "Molybdenum", "Technetium", "Ruthenium", "Rhodium", "Palladium", "Silver", "Cadmium", "Indium", "Tin", "Antimony", "Tellurium", "Iodine", "Xenon", "Caesium", "Barium", "Lanthanum", "Cerium", "Praseodymium", "Neodymium", "Promethium", "Samarium", "Europium", "Gadolinium", "Terbium", "Dysprosium", "Holmium", "Erbium", "Thulium", "Ytterbium", "Lutetium", "Hafnium", "Tantalum", "Tungsten", "Rhenium", "Osmium", "Iridium", "Platinum", "Gold", "Mercury", "Thallium", "Lead", "Bismuth", "Polonium", "Astatine", "Radon", "Francium", "Radium", "Actinium", "Thorium", "Protactinium", "Uranium", "Neptunium", "Plutonium", "Americium", "Curium", "Berkelium", "Californium", "Einsteinium", "Fermium", "Mendelevium", "Nobelium", "Lawrencium", "Rutherfordium", "Dubnium", "Seaborgium", "Bohrium", "Hassium", "Meitnerium", "Darmstadtium", "Roentgenium", "Copernicium", "Nihonium", "Flerovium", "Moscovium", "Livermorium", "Tennessine", "Oganesson"]),
    dict(id="south-america-sovereign", title="Sovereign states of South America",
         source=dict(authority="United Nations M49 (South America), sovereign states only", url="https://unstats.un.org/unsd/methodology/m49/", publishedCount=12),
         members=["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"]),
    dict(id="chinese-zodiac", title="The 12 animals of the Chinese zodiac",
         source=dict(authority="Encyclopaedia Britannica (Chinese zodiac)", url="https://www.britannica.com/topic/Chinese-zodiac", publishedCount=12),
         members=["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"]),
    dict(id="iau-planets-dwarf-planets", title="Planets and IAU-recognised dwarf planets",
         source=dict(authority="International Astronomical Union (2006 definition; recognised dwarf planets)", url="https://www.iau.org/public/themes/pluto/", publishedCount=13),
         members=["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Ceres", "Pluto", "Haumea", "Makemake", "Eris"]),
]

REVIEW = {"status": "provisional", "notes": "E2 v3 closed set by Claude (2026-11-07). Membership list transcribed, not yet compared with its source page; not human-reviewed or approved. Approval is refused until the reference has a sourceCheck."}

ITEMS = [
    dict(id="spr-cs-us-states", ref="us-states", name="US states", difficulty=1, eligibility="official",
         definition="The 50 US states (not DC or territories)", recallProfile="famous-first",
         aliases={"hawai i": dict(to="hawaii", reason="Hawaiʻi typed with a straight apostrophe for the ʻokina"),
                  "washington state": dict(to="washington", reason="Common way to say the state, not the city")},
         knownNotAccepted={"district of columbia": "A federal district, not a state", "washington dc": "Washington, D.C. is a federal district, not a state",
                           "puerto rico": "A US territory, not a state", "guam": "A US territory, not a state"}),
    dict(id="spr-cs-eu-members", ref="eu-member-states", name="EU member states", difficulty=2, eligibility="official",
         definition="Countries in the European Union (27 members)", recallProfile="famous-first",
         aliases={"czech republic": dict(to="czechia", reason="Former English short name; the EU now uses Czechia"),
                  "holland": dict(to="netherlands", reason="Common English name for the Netherlands (strictly two of its provinces)"),
                  "republic of ireland": dict(to="ireland", reason="Usual way to distinguish the state from the island")},
         knownNotAccepted={"united kingdom": "Left the EU on 31 January 2020", "uk": "Left the EU on 31 January 2020", "great britain": "The UK left the EU on 31 January 2020",
                           "britain": "The UK left the EU on 31 January 2020", "england": "The UK left the EU on 31 January 2020",
                           "switzerland": "Not an EU member (EFTA)", "norway": "Not an EU member (EEA through EFTA)", "iceland": "Not an EU member (EEA through EFTA)"}),
    dict(id="spr-cs-africa", ref="un-members-africa", name="Countries in Africa", difficulty=3, eligibility="official",
         definition="UN member states in Africa (54)", recallProfile="obscure-tail", typicalRecall=12,
         aliases={"republic of the congo": dict(to="congo", reason="Full name of the state the UN lists as Congo"),
                  "congo brazzaville": dict(to="congo", reason="Name by capital, used to tell the two Congos apart"),
                  "dr congo": dict(to="democratic republic of the congo", reason="Standard short form"),
                  "drc": dict(to="democratic republic of the congo", reason="Standard abbreviation"),
                  "democratic republic of congo": dict(to="democratic republic of the congo", reason="Common form without 'the'"),
                  "congo kinshasa": dict(to="democratic republic of the congo", reason="Name by capital, used to tell the two Congos apart"),
                  "ivory coast": dict(to="cote d ivoire", reason="English translation of Côte d'Ivoire"),
                  "cote divoire": dict(to="cote d ivoire", reason="Typed without the apostrophe"),
                  "cape verde": dict(to="cabo verde", reason="English name used until 2013"),
                  "swaziland": dict(to="eswatini", reason="Official name until 2018"),
                  "sao tome": dict(to="sao tome and principe", reason="Common short form"),
                  "united republic of tanzania": dict(to="tanzania", reason="Official long name")},
         knownNotAccepted={"western sahara": "A disputed territory, not a UN member state", "somaliland": "Self-declared state, not a UN member",
                           "sahrawi arab democratic republic": "An African Union member but not a UN member state",
                           "canary islands": "Part of Spain", "madeira": "Part of Portugal", "reunion": "An overseas department of France"}),
    dict(id="spr-cs-elements", ref="chemical-elements", name="Chemical elements", difficulty=2, eligibility="official",
         definition="Any of the 118 chemical elements, by name (not symbol)", recallProfile="obscure-tail", typicalRecall=15,
         aliases={"aluminum": dict(to="aluminium", reason="American spelling of the IUPAC name aluminium"),
                  "cesium": dict(to="caesium", reason="American spelling of the IUPAC name caesium"),
                  "sulphur": dict(to="sulfur", reason="British spelling; IUPAC uses sulfur")},
         knownNotAccepted={"steel": "An alloy, not an element", "brass": "An alloy, not an element", "bronze": "An alloy, not an element", "water": "A compound, not an element"}),
    dict(id="spr-cs-south-america", ref="south-america-sovereign", name="Countries in South America", difficulty=1, eligibility="practice",
         definition="Sovereign countries of South America (12)", recallProfile="famous-first",
         aliases={},
         knownNotAccepted={"french guiana": "An overseas region of France, not a country", "falkland islands": "A British Overseas Territory",
                           "panama": "In Central America", "mexico": "In North America"}),
    dict(id="spr-cs-chinese-zodiac", ref="chinese-zodiac", name="Animals of the Chinese zodiac", difficulty=2, eligibility="practice",
         definition="The 12 animals of the Chinese zodiac", recallProfile="dominant",
         aliases={"sheep": dict(to="goat", reason="The sign 羊 (yáng) is translated Goat, Sheep or Ram in standard references"),
                  "ram": dict(to="goat", reason="A standard translation of the sign 羊 (yáng)"),
                  "chicken": dict(to="rooster", reason="The sign 鸡 (jī) literally means chicken; Rooster is the conventional English name"),
                  "cockerel": dict(to="rooster", reason="British English for rooster"),
                  "boar": dict(to="pig", reason="The sign 猪 (zhū) is sometimes translated Boar"),
                  "hare": dict(to="rabbit", reason="The sign 兔 (tù) is translated Rabbit or Hare"),
                  "mouse": dict(to="rat", reason="The sign 鼠 (shǔ) covers both rat and mouse")},
         knownNotAccepted={"cat": "The Cat replaces the Rabbit in the Vietnamese zodiac, not the Chinese one",
                           "buffalo": "The Buffalo replaces the Ox in the Vietnamese zodiac, not the Chinese one"}),
    dict(id="spr-cs-planets", ref="iau-planets-dwarf-planets", name="Planets and dwarf planets", difficulty=2, eligibility="practice",
         definition="The 8 planets and 5 IAU-recognised dwarf planets", recallProfile="dominant",
         aliases={},
         knownNotAccepted={"moon": "Earth's natural satellite, not a planet", "sun": "A star"}),
]


def main():
    os.makedirs(REF_DIR, exist_ok=True)
    for r in REFS:
        ref = {"schemaVersion": 1, "id": r["id"], "title": r["title"], "source": r["source"], "members": r["members"], "provenance": TRANSCRIBED}
        if "timeSensitive" in r:
            ref["timeSensitive"] = r["timeSensitive"]
        assert len(r["members"]) == r["source"]["publishedCount"], (r["id"], len(r["members"]))
        with open(os.path.join(REF_DIR, r["id"] + ".json"), "w") as f:
            json.dump(ref, f, ensure_ascii=False, indent=2)
            f.write("\n")
    refs = {r["id"]: r for r in REFS}
    items = []
    for it in ITEMS:
        r = refs[it["ref"]]
        out = {
            "id": it["id"], "difficulty": it["difficulty"], "category": "Closed set", "language": "en", "eligibility": it["eligibility"],
            "review": REVIEW, "source": {"kind": "reference", "ref": f'{r["source"]["authority"]}: {r["source"]["url"]}'},
            "tags": ["e2-v3", "closed-set"], "name": it["name"],
            "answers": sorted(norm(m) for m in r["members"]),
            "closedSet": True, "definition": it["definition"], "recallProfile": it["recallProfile"],
            "membership": {"reference": it["ref"]},
        }
        if "typicalRecall" in it:
            out["typicalRecall"] = it["typicalRecall"]
        if "timeSensitive" in r:
            out["timeSensitive"] = r["timeSensitive"]
        if it["aliases"]:
            out["aliases"] = it["aliases"]
        if it["knownNotAccepted"]:
            out["knownNotAccepted"] = it["knownNotAccepted"]
        items.append(out)
    pack = {"schemaVersion": 1, "packId": "category-sprint-closed", "gameId": "category-sprint", "version": "1.0.0",
            "title": "Category Sprint: closed sets (E2 v3)", "language": "en", "items": items}
    with open(os.path.join(PACKS, "category-sprint-closed.json"), "w") as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
        f.write("\n")
    # Owner ruling: open categories are practice-only. Only eligibility moves; review status is untouched.
    p = os.path.join(PACKS, "category-sprint-s4.json")
    raw = open(p).read()
    indent = 1 if raw.startswith('{\n "') else 2
    s4 = json.loads(raw)
    moved = [i["id"] for i in s4["items"] if i["eligibility"] == "official"]
    for i in s4["items"]:
        i["eligibility"] = "practice"
    with open(p, "w") as f:
        json.dump(s4, f, ensure_ascii=False, indent=indent)
        f.write("\n")
    print("references:", len(REFS), "closed items:", len(items), "open categories moved to practice:", moved)


if __name__ == "__main__":
    main()
