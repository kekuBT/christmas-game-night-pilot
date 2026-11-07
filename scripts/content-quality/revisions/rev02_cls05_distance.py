"""Owner review 2026-11-07 (second round): cls-cq2-05 wording.

The item called the ~5,555 km WGS 84 ellipsoidal geodesic a "great-circle"
distance. A great circle lies on a sphere; with the stated coordinates the
spherical (haversine, R = 6,371 km) value is ~5,540 km. The prompt now asks
for the shortest route over the Earth's surface in plain words, and the
scoring convention (answer = ellipsoid geodesic) is stated in the source,
explanation and editorial notes. Recomputed 2026-11-07: ellipsoid 5,554.9 km
(Vincenty, WGS 84), sphere 5,540.0 km. The item stays provisional.

Run on a clean pilot file: python3 scripts/content-quality/revisions/rev02_cls05_distance.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
P = os.path.join(ROOT, "content", "pilot", "pilot-cq2.json")
raw = open(P).read()
indent = 1 if raw.startswith('{\n "') else 2
pilot = json.loads(raw)
e = next(x for x in pilot["entries"] if x["item"]["id"] == "cls-cq2-05")
it, ed = e["item"], e["editorial"]
assert "great-circle" in it["prompt"], "already revised"
it["prompt"] = "How far is it from London Heathrow to New York JFK by the shortest route over the Earth's surface, in km?"
it["explanation"] = "About 5,555 km, measured on the standard WGS 84 model of the Earth's shape. A perfect-sphere calculation gives about 5,540 km. Real flights go further, following winds and air routes."
it["source"]["ref"] = ("Scoring convention: the answer is the shortest surface distance on the WGS 84 ellipsoid (Vincenty) between airport reference points "
                       "LHR 51.4700 N 0.4543 W and JFK 40.6413 N 73.7781 W = 5,554.9 km, rounded to 5,555. A sphere (R 6,371 km) gives 5,540.0 km.")
ed["reveal"] = "About 5,555 km over the Earth's surface. Flights cover more."
ed["verification"] = ("Computed and recomputed 2026-11-07: WGS 84 geodesic 5,554.9 km; sphere 5,540.0 km. The prompt no longer says 'great-circle' "
                      "(a sphere term). A human should confirm with a published WGS 84 geodesic calculator, such as Great Circle Mapper.")
ed["scoring"] = ("Rank-based Closest Wins scoring (closest 100, then 70/50/25); no change. The answer is the WGS 84 value, 5,555; "
                 "a guess of 5,540 (the sphere value) is simply 15 km away, like any other guess.")
with open(P, "w") as f:
    json.dump(pilot, f, ensure_ascii=False, indent=indent)
    f.write("\n")
print("cls-cq2-05 revised")
