"""E10 (owner-approved part, 2026-11-07): tag every library quiz item with its question format.

Adds `mechanic` (and `negativeStem` where a stem hinges on NOT/never) to Trivia,
Geography and Who Said That? items in content/packs. Metadata only: the selector
does not read it, and E10's variety step is NOT activated.

Rules, by the item's own shape (each tag was read against the prompt by the author):
  recognition  identify something from a cue: a flag, an outline hint, a quote's speaker
  comparison   which of two or more is larger / higher / longer / closer
  deduction    worked out rather than remembered (arithmetic)
  recall       a direct fact (capitals, authors, counts, definitions of everyday terms)
  origin-story where something comes from or first caught on
  weird-but-true  a fact most players find surprising
No library item uses a quote twist, a myth-buster or a definition twist, and none
has a negative stem; the pilot items (content/pilot) carry their own tags.

Rejected items are tagged too, so history reads the same. Adding the field changes
each item's content hash; no human approvals exist yet, so none is voided.

Run from the repo root: python3 scripts/content-quality/revisions/rev06_quiz_mechanics.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACKS = os.path.join(ROOT, "content", "packs")
QUIZ = {"trivia", "geography", "who-said-that"}

OVERRIDES = {
    # deduction: arithmetic worked out on the spot
    "trv-legacy-01": "deduction", "trv-legacy-12": "deduction", "trv-math-088": "deduction", "trv-math-090": "deduction",
    "trv-math-092": "deduction", "trv-math-093": "deduction",
    # recognition: identify from a cue
    "geo-legacy-5": "recognition",
    # comparison phrased without 'which is'
    "geo-legacy-8": "comparison", "geo-s4-043": "comparison", "geo-s4-044": "comparison",
    # origin stories
    "trv-food-076": "origin-story", "trv-fest-107": "origin-story",
    # weird-but-true: surprising to most players
    "trv-natu-068": "weird-but-true", "trv-natu-071": "weird-but-true", "trv-geog-121": "weird-but-true",
}
NEGATIVE = re.compile(r"\b(not|never|NOT|NEVER)\b")


def mechanic(game, it):
    if it["id"] in OVERRIDES:
        return OVERRIDES[it["id"]]
    if game == "who-said-that":
        return "recognition"  # every library quote is attributed to a speaker from four
    if game == "geography":
        mode = it.get("mode")
        if mode in ("flag", "outline"):
            return "recognition"
        if mode in ("higher-lower", "distance"):
            return "comparison"
        if re.match(r"^Which (is|river is|lake is|mountain is|city is) (larger|bigger|longer|higher|taller|closest)", it["prompt"]):
            return "comparison"
        return "recall"
    p = it["prompt"]
    if re.match(r"^Which (is|river is|lake is|mountain is) (larger|bigger|longer|higher|taller)", p):
        return "comparison"
    return "recall"


def main():
    counts = {}
    for f in sorted(os.listdir(PACKS)):
        path = os.path.join(PACKS, f)
        raw = open(path).read()
        pack = json.loads(raw)
        if pack["gameId"] not in QUIZ:
            continue
        indent = 1 if raw.startswith('{\n "') else 2
        for it in pack["items"]:
            stem = it.get("prompt") or ""  # a quote is what someone said, not the question's stem
            it["mechanic"] = mechanic(pack["gameId"], it)
            if NEGATIVE.search(stem):
                it["negativeStem"] = True
            else:
                it.pop("negativeStem", None)
            key = (pack["gameId"], it["mechanic"])
            counts[key] = counts.get(key, 0) + 1
        with open(path, "w") as fh:
            json.dump(pack, fh, ensure_ascii=False, indent=indent)
            fh.write("\n")
    for k in sorted(counts):
        print(k, counts[k])


if __name__ == "__main__":
    main()
