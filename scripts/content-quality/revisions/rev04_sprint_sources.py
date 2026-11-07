"""Category Sprint source checks and the small new draft batch (owner direction 2026-11-07).

1. Records, in each existing reference's provenance, that its list was machine-compared
   with the source page (docs/content-quality-2/SPRINT_SOURCE_CHECK.md). It does NOT
   write `sourceCheck`: that is a person's signature, and approval stays refused.
   Two source URLs are corrected: the owner named the UN African regional group, and
   the old IAU page now returns 404 (NASA publishes the IAU's list).
2. Adds three candidate closed sets built from the fetched source snapshots
   (docs/content-quality-2/sprint-sources/<id>.json), not typed from memory:
   UN member states in Asia (M49), teams at the 2026 FIFA World Cup, NFL teams.
   They go in content/packs/category-sprint-closed-drafts.json as PRACTICE and
   provisional, tagged official-candidate: outside official selection until approval.

Run from the repo root after `npm run content:sprint-sources`:
  python3 scripts/content-quality/revisions/rev04_sprint_sources.py
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2_closed_sets import norm  # noqa: E402  (mirrors normalizeSprintAnswerV2)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REF_DIR = os.path.join(ROOT, "content", "reference", "sprint")
SNAP = os.path.join(ROOT, "docs", "content-quality-2", "sprint-sources")
DRAFTS = os.path.join(ROOT, "content", "packs", "category-sprint-closed-drafts.json")
DATE = "2026-11-07"

COMPARED = ("Transcribed by the author (Claude, {d}); machine-compared with the source page on {d}: {v} "
            "(docs/content-quality-2/SPRINT_SOURCE_CHECK.md). No human source check yet.")
FROM_SOURCE = ("Extracted by script from the source page on {d} (npm run content:sprint-sources; snapshot in "
               "docs/content-quality-2/sprint-sources/{id}.json). Display names per crosswalk.json. No human source check yet.")

SOURCE_FIXES = {
    "un-members-africa": dict(authority="United Nations, regional groups of Member States: African States",
                              url="https://www.un.org/dgacm/en/content/regional-groups"),
    "south-america-sovereign": dict(authority="UN Statistics Division M49 (South America), UN member states only",
                                    url="https://unstats.un.org/unsd/methodology/m49/overview/"),
    "iau-planets-dwarf-planets": dict(authority="IAU definition and recognised dwarf planets, as published by NASA Science",
                                      url="https://science.nasa.gov/solar-system/planets/"),
}
VERDICTS = {
    "us-states": "all 50 names match",
    "eu-member-states": "all 27 names match",
    "un-members-africa": "all 54 match (Tanzania via its alias)",
    "chemical-elements": "all 118 match (IUPAC prints names in lower case)",
    "iau-planets-dwarf-planets": "all 13 names match",
    "south-america-sovereign": "all 12 match (Bolivia and Venezuela by crosswalk from M49's official forms)",
}


def snapshot(i):
    return json.load(open(os.path.join(SNAP, i + ".json")))


def crosswalk():
    return {k: v for k, v in json.load(open(os.path.join(SNAP, "crosswalk.json"))).items() if not k.startswith("_")}


def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def fix_existing():
    for rid, verdict in VERDICTS.items():
        p = os.path.join(REF_DIR, rid + ".json")
        ref = json.load(open(p))
        if rid in SOURCE_FIXES:
            ref["source"].update(SOURCE_FIXES[rid])
        ref["provenance"] = COMPARED.format(d=DATE, v=verdict)
        assert len(ref["provenance"]) <= 300, rid
        write_json(p, ref)
    # Keep each closed item's source line in step with its reference.
    pk = os.path.join(ROOT, "content", "packs", "category-sprint-closed.json")
    pack = json.load(open(pk))
    for it in pack["items"]:
        ref = json.load(open(os.path.join(REF_DIR, it["membership"]["reference"] + ".json")))
        it["source"]["ref"] = f'{ref["source"]["authority"]}: {ref["source"]["url"]}'
    write_json(pk, pack)
    p = os.path.join(REF_DIR, "chinese-zodiac.json")
    ref = json.load(open(p))
    ref["provenance"] = (f"Transcribed by the author (Claude, {DATE}). NOT compared: www.britannica.com blocks automated "
                         "requests with a bot challenge. A person must compare it by hand or name another credible source.")
    write_json(p, ref)


def members_from(i, cw):
    names = snapshot(i)["published"]
    m = {x["source"]: x["member"] for x in cw.get(i, [])}
    return [m.get(n, n) for n in names]


REVIEW = {"status": "provisional", "notes": f"Draft closed set by Claude ({DATE}), built from the fetched source list. Practice-only and provisional: outside official selection until a person source-checks the list and approves it."}

NEW = [
    dict(ref=dict(id="un-members-asia", title="UN member states in Asia (M49)",
                  source=dict(authority="UN Statistics Division M49 (Asia), UN member states only", url="https://unstats.un.org/unsd/methodology/m49/overview/"),
                  timeSensitive=dict(asOf=DATE, reviewBy="2027-11-07")),
         item=dict(id="spr-cs-asia", name="Countries in Asia", difficulty=3, category="Geography",
                   definition="UN member states in Asia, as the UN's M49 regions define it (47)", recallProfile="obscure-tail", typicalRecall=15,
                   aliases={"viet nam": ("vietnam", "M49 spelling"), "burma": ("myanmar", "Former English name"),
                            "turkey": ("turkiye", "English name until 2022; the UN now uses Türkiye"),
                            "east timor": ("timor leste", "English name"), "uae": ("united arab emirates", "Standard abbreviation"),
                            "lao pdr": ("laos", "Common UN short form"), "brunei darussalam": ("brunei", "Official name"),
                            "dprk": ("north korea", "Standard abbreviation"), "republic of korea": ("south korea", "Official name"),
                            "democratic peoples republic of korea": ("north korea", "Official name"),
                            "syrian arab republic": ("syria", "Official name"), "kyrgyz republic": ("kyrgyzstan", "Official alternative name")},
                   knownNotAccepted={"korea": "There are two Koreas in Asia: say North Korea or South Korea",
                                     "taiwan": "Not a UN member state", "hong kong": "A special administrative region of China, not a UN member state",
                                     "macau": "A special administrative region of China, not a UN member state", "macao": "A special administrative region of China, not a UN member state",
                                     "palestine": "A UN non-member observer state, not a member state",
                                     "russia": "M49 places Russia in Europe", "egypt": "M49 places Egypt in Africa", "tibet": "Part of China"},
                   tags=["e2-v3", "closed-set", "draft-batch-1", "official-candidate", "geography"])),
    dict(ref=dict(id="fifa-world-cup-2026-teams", title="Teams at the 2026 FIFA World Cup",
                  source=dict(authority="FIFA, FIFA World Cup 2026 teams page (tournament completed)", url="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams")),
         item=dict(id="spr-cs-wc2026", name="2026 World Cup teams", difficulty=2, category="Sport",
                   definition="The 48 teams at the 2026 FIFA World Cup (FIFA's team list)", recallProfile="famous-first",
                   aliases={"united states": ("usa", "Full English name of the team FIFA lists as USA"), "us": ("usa", "Common abbreviation"),
                            "congo dr": ("dr congo", "FIFA's form"), "drc": ("dr congo", "Standard abbreviation"),
                            "democratic republic of the congo": ("dr congo", "Full name"), "ir iran": ("iran", "FIFA's form"),
                            "korea republic": ("south korea", "FIFA's form"), "korea": ("south korea", "Only one Korea is on the list"),
                            "turkey": ("turkiye", "English name until 2022"), "ivory coast": ("cote d ivoire", "English translation"),
                            "cote divoire": ("cote d ivoire", "Typed without the apostrophe"), "cape verde": ("cabo verde", "English name used until 2013"),
                            "czech republic": ("czechia", "Former English short name"), "bosnia": ("bosnia and herzegovina", "Common short form"),
                            "holland": ("netherlands", "Common English name")},
                   knownNotAccepted={"united kingdom": "There is no UK team: England and Scotland are separate FIFA members",
                                     "great britain": "There is no British team: England and Scotland are separate FIFA members",
                                     "italy": "Not among the 48 teams on FIFA's list", "nigeria": "Not among the 48 teams on FIFA's list",
                                     "wales": "Not among the 48 teams on FIFA's list", "denmark": "Not among the 48 teams on FIFA's list",
                                     "poland": "Not among the 48 teams on FIFA's list", "chile": "Not among the 48 teams on FIFA's list",
                                     "cameroon": "Not among the 48 teams on FIFA's list", "serbia": "Not among the 48 teams on FIFA's list"},
                   tags=["e2-v3", "closed-set", "draft-batch-1", "official-candidate", "sport"])),
    dict(ref=dict(id="nfl-teams", title="The 32 NFL teams",
                  source=dict(authority="National Football League, team list (nfl.com/teams)", url="https://www.nfl.com/teams/"),
                  timeSensitive=dict(asOf=DATE, reviewBy="2027-11-07")),
         item=dict(id="spr-cs-nfl", name="NFL teams", difficulty=2, category="Sport",
                   definition="The 32 NFL teams, by full name, nickname or unique city (nfl.com)", recallProfile="even",
                   aliases={}, knownNotAccepted={}, tags=["e2-v3", "closed-set", "draft-batch-1", "official-candidate", "sport"])),
]


def nfl_aliases(members):
    """Nickname and (where it names one team) location for every team, generated from the source list."""
    al, nk = {}, {}
    loc_count = {}
    split = {}
    for m in members:
        words = m.split(" ")
        nick = words[-1]
        loc = " ".join(words[:-1])
        split[m] = (loc, nick)
        loc_count[loc] = loc_count.get(loc, 0) + 1
    for m, (loc, nick) in split.items():
        canon = norm(m)
        n = norm(nick)
        if n and n != canon:
            al[n] = (canon, f"Team nickname ({nick})")
        if loc_count[loc] == 1:
            al[norm(loc)] = (canon, f"The only NFL team from {loc}")
        else:
            nk[norm(loc)] = f"{loc} has {loc_count[loc]} NFL teams: give the team's name"
    # 49ers: the matcher keeps letters only, so "49ers" reads as "ers"
    if "ers" in al:
        al["niners"] = (al["ers"][0], "Common nickname for the 49ers")
        al["ers"] = (al["ers"][0], "'49ers' as the matcher reads it (it keeps letters only)")
    return al, nk


def main():
    fix_existing()
    cw = crosswalk()
    items = []
    for n in NEW:
        r, it = n["ref"], n["item"]
        members = members_from(r["id"], cw)
        ref = {"schemaVersion": 1, "id": r["id"], "title": r["title"], "source": {**r["source"], "publishedCount": len(members)},
               "members": members, "provenance": FROM_SOURCE.format(d=DATE, id=r["id"])}
        assert len(ref["provenance"]) <= 300
        if "timeSensitive" in r:
            ref["timeSensitive"] = r["timeSensitive"]
        write_json(os.path.join(REF_DIR, r["id"] + ".json"), ref)
        answers = sorted(norm(m) for m in members)
        assert len(set(answers)) == len(answers), r["id"]
        if r["id"] == "nfl-teams":
            al, nk = nfl_aliases(members)
        else:
            al, nk = it["aliases"], it["knownNotAccepted"]
        aliases = {k: {"to": v[0], "reason": v[1]} for k, v in sorted(al.items())}
        for k, v in aliases.items():
            assert v["to"] in answers, (r["id"], k, v)
            assert k not in answers, (r["id"], k)
        for k in nk:
            assert k not in answers and k not in aliases, (r["id"], k)
        out = {"id": it["id"], "difficulty": it["difficulty"], "category": it["category"], "language": "en", "eligibility": "practice",
               "review": REVIEW, "source": {"kind": "reference", "ref": f'{r["source"]["authority"]}: {r["source"]["url"]}'},
               "tags": it["tags"], "name": it["name"], "answers": answers, "closedSet": True,
               "definition": it["definition"], "recallProfile": it["recallProfile"], "membership": {"reference": r["id"]}}
        if "typicalRecall" in it:
            out["typicalRecall"] = it["typicalRecall"]
        if "timeSensitive" in r:
            out["timeSensitive"] = r["timeSensitive"]
        if aliases:
            out["aliases"] = aliases
        if nk:
            out["knownNotAccepted"] = dict(sorted(nk.items()))
        items.append(out)
    pack = {"schemaVersion": 1, "packId": "category-sprint-closed-drafts", "gameId": "category-sprint", "version": "0.1.0",
            "title": "Category Sprint: closed-set drafts (batch 1, practice until approved)", "language": "en", "items": items}
    write_json(DRAFTS, pack)
    print("updated 7 references; drafts:", [(i["id"], len(i["answers"]), len(i.get("aliases", {}))) for i in items])


if __name__ == "__main__":
    main()
