import subprocess
muts = [
 ("omitted season adopts the room's (old rule)", "src/server/room.ts", "const asked = requested ?? DEFAULT_SESSION_SEASON;", "const asked = requested ?? this.contentSeason;"),
 ("a casual/rematch/next replay ignores its season", "src/server/room.ts", "if ((op.season ?? DEFAULT_SESSION_SEASON) !== (season ?? DEFAULT_SESSION_SEASON)) throw new Error(\"That request id was already used for something else.\");\n", ""),
 ("an existing rematch/lineup game returned whatever the content", "src/server/room.ts", "    if (bound !== (requested ?? DEFAULT_SESSION_SEASON)) {", "    if (false) {"),
 ("eligibility re-check also applied in a Cup", "src/server/room.ts", "if (this.kind !== \"cup\" && !seasonAllows(pc.season ?? DEFAULT_SESSION_SEASON, li.item.season)) return { problem: \"season\" };", "if (!seasonAllows(pc.season ?? DEFAULT_SESSION_SEASON, li.item.season)) return { problem: \"season\" };"),
]
for name, f, old, new in muts:
    src = open(f).read()
    n = src.count(old)
    assert n >= 1, (name, n)
    open(f, "w").write(src.replace(old, new))
    try:
        r = subprocess.run(["npx", "vitest", "run", "tests/stage82-seasonal.test.ts"], capture_output=True, text=True, timeout=300)
        fails = [l.strip() for l in (r.stdout + r.stderr).splitlines() if l.strip().startswith("×")]
        print(f"{'CAUGHT' if fails else ('ERROR' if r.returncode else 'MISSED')} {name}: {len(fails)} failing", (fails[0][:120] if fails else ""))
    finally:
        open(f, "w").write(src)
