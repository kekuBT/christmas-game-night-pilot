"""Apply the factual and mechanical corrections in Audit Batch A as a reviewable
change to content/packs (owner direction 2026-11-07). Run once from the repo root:
    python3 scripts/content-quality/revisions/batch_a_apply.py
Rules:
 - Items are never deleted: "retire" sets review.status "rejected" with a note,
   so ids stay valid for Cup usage history and past results.
 - No item is approved. Provisional items stay provisional. The one legacy
   (official) board keeps its legacy status; its correction needs owner
   sign-off at merge (see BATCH_A_APPLIED.md).
 - Every edited Connections board is re-checked by the uniqueness solver
   (tests/audit-batch-a.test.ts).
 - Only objectively demonstrated defects are here; editorial judgements are
   kept for separate batches."""
import json, glob

DATE = "2026-11-07"
packs = {}
for f in glob.glob("content/packs/*.json"):
    s = open(f, encoding="utf-8").read()
    indent = 1 if s.startswith('{\n "') else 2
    packs[f] = (json.loads(s), indent)

def find(item_id):
    for f, (d, _) in packs.items():
        for it in d["items"]:
            if it["id"] == item_id:
                return f, it
    raise KeyError(item_id)

touched = set()
def note(it, text):
    base = it["review"].get("notes", "")
    it["review"]["notes"] = (base + " " if base else "") + text
    assert len(it["review"]["notes"]) <= 500, it["id"]

def retire(item_id, why):
    f, it = find(item_id)
    assert it["review"]["status"] == "provisional", (item_id, it["review"]["status"])
    it["review"]["status"] = "rejected"
    note(it, f"Retired {DATE} (Audit Batch A, objective defect): {why}")
    touched.add(f)

def group(it, name):
    return next(g for g in it["groups"] if g["name"] == name)

# A1 — legacy official board: an icicle is not weather. Minimal fix: Icicle -> Sleet.
f, it = find("con-legacy-1")
assert it["review"]["status"] == "legacy"
g = group(it, "Winter weather"); g["words"] = ["Sleet" if w == "Icicle" else w for w in g["words"]]
note(it, f"{DATE} Audit Batch A A1: 'Icicle' replaced by 'Sleet' (an icicle is ice, not weather). Solver re-run: one solution. Owner sign-off required before this edit reaches official play.")
touched.add(f)

# A2 — swans and owls are not garden birds.
f, it = find("con-s4-05")
group(it, "Garden birds")["words"] = ["Robin", "Wren", "Sparrow", "Blackbird"]
note(it, f"{DATE} Audit Batch A A2: Owl, Swan -> Sparrow, Blackbird (not garden birds).")
touched.add(f)

# A3 — pearl and amber are organic gems, not gemstones (minerals).
f, it = find("con-s4-12")
group(it, "Gemstones")["name"] = "Gems"
it["redHerrings"] = "'Amber' and 'Pearl' are organic gems, not flowers or trees; 'Straw', 'Blue', 'Rasp' and 'Goose' come before 'berry'."
note(it, f"{DATE} Audit Batch A A3: group renamed 'Gems' (pearl and amber are organic gems, not mineral gemstones).")
touched.add(f)

# A4 — the red-herring note was wrong (lime is also a green); group name mixed two categories.
f, it = find("con-s4-02")
group(it, "Citrus and stone fruits")["name"] = "Fruits"
it["redHerrings"] = "'Sage' is a herb and a green; 'Lime' is a fruit and a green. The herb group is already full without Sage, so Sage is the green, which leaves Lime with the fruits."
note(it, f"{DATE} Audit Batch A A4: corrected red-herring note; group renamed 'Fruits'.")
touched.add(f)

# A5-A7 — the answer is in the question.
retire("trv-hist-038", "the answer (Berlin) is in the question.")
retire("geo-s4-026", "the answer (Sydney) is in the question.")
retire("trv-hist-129", "the everyday name 'Great Wall of China' gives the answer away.")

# A8 — invented distractor.
f, it = find("trv-scie-125")
it["options"] = ["Electron" if o == "Electron" else "Electron cloud" if o == "Proton cloud" else o for o in it["options"]]
note(it, f"{DATE} Audit Batch A A8: invented distractor 'Proton cloud' replaced by 'Electron cloud'.")
touched.add(f)

# A9-A13 — exact duplicates of legacy Guess the Year events.
for i, dup in [("year-s4-006", "year-legacy-1"), ("year-s4-014", "year-legacy-2"), ("year-s4-016", "year-legacy-7"), ("year-s4-020", "year-legacy-3"), ("year-s4-042", "year-legacy-5")]:
    find(dup)  # the item it duplicates must exist
    retire(i, f"duplicate of {dup} (same event).")

# A14 — two 1843 answers: retire one until an answer-key pairing rule (E9) exists.
retire("year-s4-043", "same answer year (1843) as year-s4-044; one game could pair them. Reinstate when selection never pairs equal answers (E9).")

# A15-A16 — duplicate facts.
retire("trv-lang-053", "same fact as cls-legacy-6 (26 letters).")
retire("trv-geog-028", "same fact as geo-legacy-5 (Italy's boot shape).")
retire("geo-s4-042", "same fact as geo-legacy-8 (Paris, closest capital to London).")

# A17 — verifiable omissions in practice lists (open categories stay practice-only under E2 v3).
for item_id, add in [("spr-s4-011", ["chicken", "vulture", "stork", "pelican", "canary"]), ("spr-s4-004", ["eggplant", "zucchini"])]:
    f, it = find(item_id)
    missing = [a for a in add if a not in it["answers"]]
    it["answers"] = sorted(it["answers"] + missing)
    if it["eligibility"] != "practice":
        it["eligibility"] = "practice"
    note(it, f"{DATE} Audit Batch A A17: added {', '.join(missing)}; open category, practice-only (E2 v3).")
    touched.add(f)

# A18 — the 'answer' is a midpoint of a range.
retire("cls-k-13", "the answer is a range (4.5-6 m), so close guesses rank arbitrarily.")
retire("cls-k-26", "the answer is a range (146-154 °C), so close guesses rank arbitrarily.")

for f in sorted(touched):
    d, indent = packs[f]
    open(f, "w", encoding="utf-8").write(json.dumps(d, indent=indent, ensure_ascii=False) + "\n")
print("packs written:", ", ".join(sorted(t.split('/')[-1] for t in touched)))
