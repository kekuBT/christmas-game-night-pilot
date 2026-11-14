# Stage 12.4: local runs (every run, failures included)

**What these are:** local runs during development, before the gates. They are not gate verdicts. The gates are in `docs/evidence/gate-runs/`.

**How they ran:**
- **Drivers:** `local-driver.sh` (copied here) starts a fresh server on the worktree's built web app, like the gate. Then it runs one driver.
- **Unit tests:** `npx vitest run`.

| Log | Revision (worktree state) | Result | What it showed |
|---|---|---|---|
| (no log) `tests/stage124-finish.test.ts`, first run | the server change, uncommitted | **4 pass, 1 FAIL** | **My test's mistake:** it started a game right after a restart, when nobody is connected. It now checks persistence by a snapshot round trip and the clearing before it. |
| `vitest-s124.log` | the web work, uncommitted | 1792/1792 | Lint and both typechecks were clean too. |
| `check-tv-moments-s124r1.log` | same | **21 pass, 2 FAIL** | The champion moment's fanfare check failed. |
| `check-tv-moments-s124r2.log` | + diagnostics in the driver | **22 pass, 2 FAIL** | **A real bug:** two chimes, not one. Under the champion, the view behind it switched to the last game's final standings and rang its own chime. Fixed: no game chime under a moment, and a game's chime only for a game this TV watched being played. |
| `check-tv-moments-s124r3.log` | + that fix, + new checks for a watched game's chime and the night's fanfare | **25 pass, 3 FAIL** | The game's chime wasn't counted. The driver played the game over the API in about a second, faster than the TV could see it live. |
| `check-tv-moments-s124r4.log` | + the driver waits until the TV shows the game live | **26 pass, 3 FAIL** | **A real bug:** a spectator TV shows other screens during a briefing, which remounts the TV show. It then forgot the games it watched, and its chime counter restarted. Fixed: the page keeps that memory, not the component, so a remount neither forgets a watched game nor rings a moment twice. |
| `check-tv-moments-s124r5.log` | + that fix | 29/0 | Its champion screenshot showed **two layout faults**: "Final standings" was lit under the moment, and the director's row wrapped onto two lines. |
| `check-tv-moments-s124r6.log` | + both fixed, + a driver check for each | 30/0 | The committed screenshots come from this run. |
