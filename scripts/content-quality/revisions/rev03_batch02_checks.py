"""Owner review 2026-11-07 (second round): review-batch-02 editorial checks.

Small, reviewable wording changes from the five checks the owner asked for
(casual-player clarity, fandom placement, Impostor bluffing, repeated
origin stories, reveal quality). See
docs/content-quality-2/review-batch-02/EDITORIAL_CHECKS.md. No new facts:
every reveal below restates the item's existing, already-sourced explanation.
All items stay provisional.

Run on a clean pilot file: python3 scripts/content-quality/revisions/rev03_batch02_checks.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
P = os.path.join(ROOT, "content", "pilot", "pilot-cq2.json")
raw = open(P).read()
indent = 1 if raw.startswith('{\n "') else 2
pilot = json.loads(raw)
E = {x["item"]["id"]: x for x in pilot["entries"]}

# 1. Casual clarity: players need not know who "Notch" is.
it = E["trv-cq2-21"]["item"]
assert "Notch" in it["prompt"], "already revised"
it["prompt"] = "Minecraft's Creeper was a happy accident. What was the game's creator trying to make when he mixed up the model's height and length?"

# 2. Honest tagging: YouTube's first video is an origin story, like the Creeper.
#    With both tagged, the round-variety rule keeps them apart and caps them at two.
E["trv-cq2-22"]["editorial"]["mechanic"] = "origin-story"

# 3. Reveals: concise and worth reading (no new claims; each restates the explanation).
E["geo-cq2-04"]["editorial"]["reveal"] = "France, thanks to overseas territories scattered across the world's oceans."
E["year-cq2-21"]["editorial"]["reveal"] = "2006: the year Wii Sports bowling took over living rooms."
E["year-cq2-22"]["editorial"]["reveal"] = "2014: the summer feeds filled with buckets of ice water."
E["trv-cq2-10"]["editorial"]["reveal"] = "Mostly thin air: a tree is built mainly from carbon and oxygen pulled out of CO2."

with open(P, "w") as f:
    json.dump(pilot, f, ensure_ascii=False, indent=indent)
    f.write("\n")
print("review-batch-02 checks applied")
