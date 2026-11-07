"""Redesign Word Connections con-s4-02 (owner direction 2026-11-07).

The Basil ambiguity is real ("Basil Green" is a marketed paint shade), and the same
holds for other herbs (parsley green, dill), so a Herbs group next to a Shades of
green group can never be made safe by ruling a single word out. The redesign
removes the Herbs group instead and keeps deliberate, countable misdirection:

  Fruits          Cherry Plum Lemon Lime        Lime is also a green
  Card games      Snap Bridge Poker Rummy
  Gemstones       Sapphire Topaz Garnet Amethyst  (Emerald and Jade are also gemstones)
  Shades of green Emerald Jade Moss Sage

Why it is unique: Lime is the only fourth fruit, so it must be a fruit. The greens
are then Emerald, Jade, Moss and Sage (Moss and Sage fit nothing else), which
leaves the four gemstones. The gems avoid con-s4-12's (Ruby, Pearl, Amber, Opal).

The item stays provisional; the id is kept, so games that stored the old board keep
it (tests/batch-a-compat.test.ts). Also rewrites the board's entries in the semantic
review and in audit-verdicts.json connectionsOverlaps.

Run from the repo root: python3 scripts/content-quality/revisions/rev05_con_s4_02.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACK = os.path.join(ROOT, "content", "packs", "word-connections-s4.json")
DOCS = os.path.join(ROOT, "docs", "content-quality-2")
SEMANTIC = os.path.join(DOCS, "audit-batches", "batch-a-semantic-review.json")
VERDICTS = os.path.join(DOCS, "audit-verdicts.json")

GROUPS = [
    {"name": "Fruits", "words": ["Cherry", "Plum", "Lemon", "Lime"], "level": 1},
    {"name": "Card games", "words": ["Snap", "Bridge", "Poker", "Rummy"], "level": 2},
    {"name": "Gemstones", "words": ["Sapphire", "Topaz", "Garnet", "Amethyst"], "level": 3},
    {"name": "Shades of green", "words": ["Emerald", "Jade", "Moss", "Sage"], "level": 4},
]
RED_HERRINGS = ("'Emerald' and 'Jade' are gemstones and greens; 'Lime' is a fruit and a green. "
                "There are only four fruits, so Lime is a fruit; the greens are then Emerald, Jade, Moss and Sage, "
                "which leaves four gemstones.")
NOTE = (" 2026-11-07 redesign: the Herbs group is replaced by Gemstones, because herb names double as paint shades "
        "(Basil Green, parsley green), which gave a second solution. Still provisional; awaiting human review.")

TILES = {
    "Cherry": ([], "A shade of red, not green; not a gemstone."),
    "Plum": ([], "A shade of purple, not green."),
    "Lemon": ([], "A shade of yellow, not green."),
    "Lime": (["Shades of green"], "Declared. Counting forces it to the fruits: there is no other fourth fruit."),
    "Snap": ([], ""), "Bridge": ([], ""), "Poker": ([], "Also a fireplace tool; no such group."), "Rummy": ([], ""),
    "Sapphire": ([], "A shade of blue as a colour word, not green."),
    "Topaz": ([], "Yellow or blue as a colour word, not green."),
    "Garnet": ([], "As a colour word, a deep red. Some garnet varieties are green stones, but 'garnet' is not a shade of green; the editor confirms this call."),
    "Amethyst": ([], "A shade of purple, not green."),
    "Emerald": (["Gemstones"], "Declared, deliberate: a gemstone and a green."),
    "Jade": (["Gemstones"], "Declared, deliberate: an ornamental gemstone and a green."),
    "Moss": ([], "Not a gemstone ('moss agate' is, but not 'moss')."),
    "Sage": ([], "A herb, but the board no longer has a herb group."),
}


def dump(path, obj, raw):
    indent = 1 if raw.startswith('{\n "') else 2
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def write_semantic(sem):
    """Keep the file's hand-readable layout: one tile per line."""
    j = lambda x: json.dumps(x, ensure_ascii=False)
    out = ["{", f'  "about": {j(sem["about"])},', '  "boards": {']
    boards = list(sem["boards"].items())
    for bi, (bid, tiles) in enumerate(boards):
        out.append(f"    {j(bid)}: {{")
        items = list(tiles.items())
        for ti, (w, r) in enumerate(items):
            out.append(f'      {j(w)}: {{ "alsoFits": {j(r["alsoFits"])}, "note": {j(r["note"])} }}' + ("," if ti < len(items) - 1 else ""))
        out.append("    }" + ("," if bi < len(boards) - 1 else ""))
    out.append("  },")
    out.append('  "acrossBoards": {')
    ab = list(sem["acrossBoards"].items())
    for i, (k, v) in enumerate(ab):
        out.append(f"    {j(k)}: {j(v)}" + ("," if i < len(ab) - 1 else ""))
    out += ["  }", "}"]
    assert set(sem) == {"about", "boards", "acrossBoards"}
    with open(SEMANTIC, "w") as f:
        f.write("\n".join(out) + "\n")


def main():
    raw = open(PACK).read()
    pack = json.loads(raw)
    it = next(i for i in pack["items"] if i["id"] == "con-s4-02")
    if it["groups"] != GROUPS:
        it["groups"] = GROUPS
        it["redHerrings"] = RED_HERRINGS
        if "redesign" not in it["review"]["notes"]:
            it["review"]["notes"] += NOTE
        assert it["review"]["status"] == "provisional"
    dump(PACK, pack, raw)

    raw = open(SEMANTIC).read()
    sem = json.loads(raw)
    sem["boards"]["con-s4-02"] = {w: {"alsoFits": a, "note": n} for w, (a, n) in TILES.items()}
    sem["acrossBoards"]["con-s4-02"] = ("Redesigned 2026-11-07: no herb group. Its gemstones (Sapphire, Topaz, Garnet, Amethyst) "
                                        "do not repeat con-s4-12's (Ruby, Pearl, Amber, Opal). Many tiles are also colour words "
                                        "(red, purple, yellow, blue); there is no colour group other than greens.")
    write_semantic(sem)

    raw = open(VERDICTS).read()
    ver = json.loads(raw)
    ver["connectionsOverlaps"]["con-s4-02"] = {"Lime": ["Shades of green"], "Emerald": ["Gemstones"], "Jade": ["Gemstones"]}
    dump(VERDICTS, ver, raw)
    print("con-s4-02 redesigned")


if __name__ == "__main__":
    main()
