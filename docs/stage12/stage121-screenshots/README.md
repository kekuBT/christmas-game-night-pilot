# Stage 12.1 screenshots

## Before and after (the same steps on both builds)
- **Before:** Stage 11.2's head `c2767fb`.
- **After:** Stage 12.1 `2a00734` (the web build is unchanged after it).
- **How:** a scratch script runs the same steps against each build's own server: Home, the Host screen, then a 3-player casual room and a 3-player Cup room played over the API, watched by a TV at 1920×1080.

| Screen | Before | After |
|---|---|---|
| Home (390) | `before-home-390.png`: three equal dock buttons | `after-home-390.png`: Join and Host, with "Just you? Play solo" under them |
| Host (390) | `before-host-390.png`: "Casual or Family Cup?" at the door | `after-host-390.png`: a name, and one line about making it a Family Cup later |
| TV lobby, casual (1920) | `before-tv-lobby-1920.png`: the code as text | `after-tv-lobby-1920.png`: the QR code beside the big code |
| TV final, casual (1920) | `before-tv-final-1920.png`: a winner line and a bar board | `after-tv-final-1920.png`: the podium, standings and medal table |
| TV final, Cup (1920) | `before-tv-cup-final-1920.png` | `after-tv-cup-final-1920.png`: the podium, standings and "Family Cup · after this game" |
| TV lobby, Cup (1920) | `before-tv-cup-lobby-1920.png`: three lines in a side card | `after-tv-cup-lobby-1920.png`: the QR code, Day 1 of 7, "Keku is leading Day 1", and the top five |

## The journey (`scripts/check-one-path.mjs`, local run 4 on the gate candidate)
1. `journey-home-390.png`
2. `journey-host-390.png`
3. `journey-tv-lobby-qr-1920.png`
4. `journey-tv-final-podium-1920.png`: game 1, with the podium after its 3-second rise
5. `journey-tv-final-medals-1920.png`: game 2, with the medal table at 2 games
6. `journey-tv-lobby-medals-1920.png`
7. `journey-make-cup-sheet-390.png`: the host's sheet
8. `journey-guest-cup-notice-390.png`: the guest's lobby after the upgrade, unreloaded
9. `journey-tv-lobby-cup-1920.png`: the TV followed. The two earlier games still read "Casual".
10. `journey-tv-final-cup-1920.png`: the second official game. The arrows match the server's standings before and after.
11. `journey-tv-trophy-1920.png`: the host ended Day 1. Three players tied on 50 share Day 1, as the server's ceremony named them.
12. `journey-tv-cup-view-1920.png`: the director's "Cup standings". The shared lead is shared gold.

**A note on the guest phone:** the driver answers over the API for seats whose phones are also open, so `journey-guest-cup-notice-390.png` may show "Your answer is already in" at the bottom. That's the guest's phone hearing about the driver's answer for its seat. Real play has one client per seat, so it's a test artifact, not a product state.
