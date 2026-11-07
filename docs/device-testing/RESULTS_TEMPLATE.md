# Device test results: YYYY-MM-DD

Copy this file to `results-YYYY-MM-DD.md` and fill it in. Steps and pass criteria are in [../REAL_DEVICE_TESTING.md](../REAL_DEVICE_TESTING.md).

**Branch / commit tested:** `claude/real-device-acceptance` @ `_______` (run `git log --oneline -1`)  
**Server address used:** `http://___.___.___.___:3000`  
**Host device:** ________  **Recorder:** ________  **Players:** __

## Devices

| Label | Who | Phone model | OS + version | Browser + version | Notes |
|---|---|---|---|---|---|
| P1 | | | iOS | Safari | |
| P2 | | | Android | Chrome | |
| P3 | | | | | |
| P4 | | | | | |
| TV | | | | | |

## Checklist

Mark ✅ pass, ❌ fail (add an issue below), ⚠️ works but awkward, or – not tried.

| Row | iPhone | Android | Feel / notes |
|---|---|---|---|
| A1 Host creates room, QR shown | | | |
| A2 iPhone scans QR | | | |
| A3 Android scans QR | | | |
| A4 Join by typed code | | | |
| A5 3+ join at once | | | |
| A6 Duplicate name | | | |
| A7 Wrong code | | | |
| B1 Trivia Showdown | | | |
| B2 Math Mayhem | | | |
| B3 Word Connections | | | |
| B4 Category Sprint (+ Congo check) | | | |
| B5 Guess the Year / Closest Wins | | | |
| B6 Impostor / Caption Clash | | | |
| B7 Practice game | | | |
| C1 Switch app 30 s | | | |
| C2 Lock 2 min | | | |
| C3 Refresh | | | |
| C4 Wi-Fi off 20 s | | | |
| C5 Close tab, rejoin | | | |
| C6 Host locks 1 min | | | |
| C7 Server restart | | | |
| C8 Sit this game out | | | |
| D1 No answer leak before lock | | | |
| D2 Secret words private | | | |
| D3 TV shows no secrets | | | |
| D4 Reveal readable | | | |
| E1 Phone total = leaderboard | | | |
| E2 Ranking order / ties | | | |
| E3 Championship excludes practice | | | |
| E4 Advance to day 2 | | | |
| E5 No lost/doubled scores | | | |
| F1 Spectator join, no seat | | | |
| F2 TV readable | | | |
| F3 TV stage is view-only | | | |
| G1 Nothing cut off | | | |
| G2 Notch / home bar | | | |
| G3 Largest text | | | |
| G4 Rotate | | | |
| G5 Tap targets | | | |
| H1 Too few players message | | | |
| H2 Double taps | | | |
| H3 Recovery code | | | |
| H4 Host-assisted recovery | | | |

## Issues

Severity: **Blocker** (can't run the real night: lost score, locked out, leaked answer, game can't finish), **Major** (hurts but has a workaround), **Minor** (cosmetic or rare), **Feel** (works but not fun or confusing).

| # | Row | Device | Time | Room code | What I did | What I expected | What happened | Severity | Screenshot / video |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |

## How did it feel?

| Player | Play again | Would skip | Confusing / boring moment | Slow or unfair | Enjoyment 1–5 |
|---|---|---|---|---|---|
| | | | | | |

## Verdict

- [ ] Ready: we could run the real night like this
- [ ] Ready after fixes. Blockers: ____
- [ ] Not ready

**Send back:** this file, `device-test.log`, and a zip of `data-device-test/`.
