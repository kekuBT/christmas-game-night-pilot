import subprocess, sys
muts = [
 ("Everyday filter removed", "src/content/select.ts", "const eligible = usable.filter((li) => seasonAllows(season, li.item.season));", "const eligible = usable;"),
 ("Christmas-first ordering removed", "src/content/select.ts", 'return season === "christmas" && ua < 0 ? Number(seasonal(b)) - Number(seasonal(a)) : 0;', "return 0;"),
 ("CONTENT_CHANGED check removed", "src/server/room.ts", "if (requested !== undefined && requested !== this.contentSeason) {", "if (false) {"),
 ("briefing re-check by season removed", "src/server/room.ts", 'if (this.kind !== "cup" && !seasonAllows(pc.season ?? DEFAULT_SESSION_SEASON, li.item.season)) return null;', ""),
 ("contentSeason not restored", "src/server/room.ts", 'engine.contentSeason = isSessionSeason(data["contentSeason"]) ? data["contentSeason"] : DEFAULT_SESSION_SEASON;', ""),
 ("solo replay ignores season", "src/server/room.ts", 'if (op.season !== undefined && (season ?? DEFAULT_SESSION_SEASON) !== op.season) throw new Error("That request id was already used for something else.");', ""),
 ("season inside the hash", "src/content/registry.ts", "const { review: _review, season: _season, ...rest }", "const { review: _review, ...rest }"),
 ("Draw prompts unfiltered", "src/games/modules/draw.ts", "const allowed = DRAW_PROMPTS.filter((p) => seasonAllows(season, p.season));", "const allowed = [...DRAW_PROMPTS];"),
]
for name, f, old, new in muts:
    src = open(f).read()
    assert src.count(old) == 1, (name, src.count(old))
    open(f, "w").write(src.replace(old, new, 1))
    try:
        r = subprocess.run(["npx", "vitest", "run", "tests/stage82-seasonal.test.ts"], capture_output=True, text=True, timeout=300)
        out = r.stdout + r.stderr
        fails = [l.strip() for l in out.splitlines() if l.strip().startswith("×")]
        print(f"{'CAUGHT' if r.returncode else 'MISSED'} {name}: {len(fails)} failing", (fails[0][:110] if fails else ""))
    finally:
        open(f, "w").write(src)
