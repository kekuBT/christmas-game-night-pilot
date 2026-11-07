"""Owner rulings of 2026-11-07 (final content checkpoint).

1. Congo. A bare "Congo" is ambiguous (two UN members) and scores nothing in Cups
   created under answer rules 2; the player must name the Republic of the Congo or
   the Democratic Republic of the Congo unambiguously. Cups created earlier keep
   the old behaviour (bare "Congo" = the Republic) through a frozen `answerRules1`
   copy on the item, which the game uses for those Cups only.
     - spr-cs-africa: canonical "congo" becomes "republic of the congo"; bare
       "congo" becomes a known non-answer with the reason shown in results.
     - un-members-africa reference: the member is displayed as "Republic of the
       Congo"; the UN's short name "Congo" maps to it in the crosswalk.
     - spr-cs-wc2026 (practice-only draft): bare "congo" becomes a known
       non-answer too. It already scored nothing there (not on the list); only
       the explanation in results changes, so no rules-1 copy is needed.
2. Chinese zodiac. The owner named the UN publication "The Chinese Zodiac: In
   Praise of the Jade Rabbit" as the source (Britannica blocks automated access).
   Reference and item source lines now name it. Machine comparison only; no
   sourceCheck is recorded.

Idempotent. Run from the repo root:
  python3 scripts/content-quality/revisions/rev07_congo_zodiac.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REF_DIR = os.path.join(ROOT, "content", "reference", "sprint")
PACK = os.path.join(ROOT, "content", "packs", "category-sprint-closed.json")
DRAFTS = os.path.join(ROOT, "content", "packs", "category-sprint-closed-drafts.json")
CROSSWALK = os.path.join(ROOT, "docs", "content-quality-2", "sprint-sources", "crosswalk.json")
DATE = "2026-11-07"

ROC = "republic of the congo"
AMBIGUOUS = ("Two countries are called Congo. Type Republic of the Congo (Congo-Brazzaville) "
             "or DR Congo (Congo-Kinshasa).")
WC_AMBIGUOUS = "Two countries are called Congo. The team at this World Cup is DR Congo."
ZODIAC_SOURCE = {
    "authority": "United Nations, 'The Chinese Zodiac: In Praise of the Jade Rabbit' (2023)",
    "url": "https://www.un.org/sites/un2.un.org/files/2023/04/the_chinese_zodiac_introduction.pdf",
}


def load(p):
    return json.load(open(p))


def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_crosswalk(cw):
    """Keep the file's hand-readable layout: one mapping per line."""
    j = lambda x: json.dumps(x, ensure_ascii=False)
    out = ["{", f'  "_comment": {j(cw["_comment"])},']
    lists = [(k, v) for k, v in cw.items() if k != "_comment"]
    for i, (k, rows) in enumerate(lists):
        out.append(f"  {j(k)}: [")
        for r, row in enumerate(rows):
            out.append("    { " + ", ".join(f"{j(a)}: {j(b)}" for a, b in row.items()) + " }" + ("," if r < len(rows) - 1 else ""))
        out.append("  ]" + ("," if i < len(lists) - 1 else ""))
    out.append("}")
    with open(CROSSWALK, "w") as f:
        f.write("\n".join(out) + "\n")


def congo():
    p = os.path.join(REF_DIR, "un-members-africa.json")
    ref = load(p)
    ref["members"] = ["Republic of the Congo" if m == "Congo" else m for m in ref["members"]]
    ref["provenance"] = (f"Machine-compared with the UN African States group on {DATE}: all 54 match; the UN's 'Congo' "
                         "is shown as 'Republic of the Congo' (crosswalk; owner ruling). See SPRINT_SOURCE_CHECK.md. "
                         "No human source check yet.")
    assert len(ref["provenance"]) <= 300
    write_json(p, ref)

    cw = load(CROSSWALK)
    entry = {"source": "Congo", "member": "Republic of the Congo",
             "reason": "The UN's short name. Shown in full because a bare 'Congo' is ambiguous (owner ruling 2026-11-07)"}
    cw.setdefault("un-members-africa", [])
    if entry not in cw["un-members-africa"]:
        cw["un-members-africa"].append(entry)
    write_crosswalk(cw)

    pack = load(PACK)
    it = next(i for i in pack["items"] if i["id"] == "spr-cs-africa")
    if "answerRules1" not in it:
        # Frozen copy of the rules every earlier Cup scored with. Never edited after this.
        it["answerRules1"] = {
            "answers": list(it["answers"]),
            "aliases": json.loads(json.dumps(it["aliases"])),
            "knownNotAccepted": dict(it["knownNotAccepted"]),
        }
    it["answers"] = sorted(ROC if a == "congo" else a for a in it["answers"])
    al = {k: v for k, v in it["aliases"].items() if k != ROC}
    al["congo brazzaville"] = {"to": ROC, "reason": "Name by capital, used to tell the two Congos apart"}
    al["republic of congo"] = {"to": ROC, "reason": "Full name without 'the'"}
    al["congo republic"] = {"to": ROC, "reason": "Common short form naming the Republic"}
    al["congo republic of"] = {"to": ROC, "reason": "Index form, as in 'Congo, Republic of'"}
    it["aliases"] = al
    it["knownNotAccepted"]["congo"] = AMBIGUOUS
    if "Congo ruling" not in it["review"]["notes"]:
        it["review"]["notes"] += (f" {DATE} Congo ruling (owner): a bare 'Congo' is ambiguous and scores nothing in new Cups; "
                                  "Cups created earlier keep scoring it as the Republic (answerRules1).")
    assert it["review"]["status"] == "provisional"
    z = next(i for i in pack["items"] if i["id"] == "spr-cs-chinese-zodiac")
    z["source"]["ref"] = f'{ZODIAC_SOURCE["authority"]}: {ZODIAC_SOURCE["url"]}'
    z["review"]["notes"] = (f"E2 v3 closed set by Claude ({DATE}). Membership machine-compared on {DATE} with the UN publication "
                            "the owner named: all 12 match. Not human-reviewed or approved; approval is refused until the "
                            "reference has a sourceCheck.")
    write_json(PACK, pack)

    drafts = load(DRAFTS)
    wc = next(i for i in drafts["items"] if i["id"] == "spr-cs-wc2026")
    wc["knownNotAccepted"]["congo"] = WC_AMBIGUOUS
    wc["knownNotAccepted"] = dict(sorted(wc["knownNotAccepted"].items()))
    write_json(DRAFTS, drafts)


def zodiac():
    p = os.path.join(REF_DIR, "chinese-zodiac.json")
    ref = load(p)
    ref["source"]["authority"] = ZODIAC_SOURCE["authority"]
    ref["source"]["url"] = ZODIAC_SOURCE["url"]
    ref["provenance"] = (f"Transcribed by the author (Claude, {DATE}); machine-compared on {DATE} with the UN publication the "
                         "owner named (Britannica blocks automated access): all 12 names match (SPRINT_SOURCE_CHECK.md). "
                         "No human source check yet.")
    assert len(ref["provenance"]) <= 300
    write_json(p, ref)


if __name__ == "__main__":
    congo()
    zodiac()
    print("rev07 applied")
