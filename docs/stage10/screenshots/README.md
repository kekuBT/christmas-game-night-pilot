# Stage 10.1 screenshots: Jebena Rush's cini cups

All screenshots are desktop Chromium (chrome-headless-shell) emulating phone and TV sizes, not real devices. The phones are:
- Keku: 390 px, Everyday look, full motion;
- Amina: 320 px, Christmas look;
- Baraka: 390 px, reduced motion.

The TV is 1440 px.

Which phone holds the jebena at a given moment follows the seeded seat order, so a picture's phone (and its file name) can change between runs.

## After: cups (`*.png` in this folder)
- **Source:** the full gate run `20261112-134811-0516e3ea-18196` on commit `0516e3e`, the repaired code (review 6822605156). Every file here comes from that one run.
- **Driver:** `check-jebena-rush`, from its screenshot folder; 163 checks, ALL PASS.
- **Not taken in that run:** `jr-tv-1440.png` (the TV during play), which the driver takes only when Keku's turn comes before Baraka's first. `jr-tv-cup-broken-1440.png` shows the TV during play.

| File | What it shows |
|---|---|
| `jr-lobby-host-390.png` | The host's choice: "3 cups / 5 cups / 7 cups", and the note with three whole cups ("Each player starts with 3 cups. Run out of time and one breaks…") |
| `jr-lobby-guest-320-christmas.png` | A guest: "Everyone starts with 3 cups." with three whole cups |
| `jr-briefing-320-christmas.png` | The briefing: "one of your cups breaks", "when all your cups are broken, you're out" |
| `jr-myturn-feedback-320-christmas.png` | Your turn after a wrong try: still three whole cups, "3/3" (Amina's phone held the jebena this time) |
| `jr-myturn-320-christmas.png`, `jr-myturn-390-reduced.png` | Your turn, both looks; reduced motion |
| `jr-tv-cup-broken-1440.png` | The TV just after a timeout: "a cup broke (2 left)", the lost cup broken in its slot |
| `jr-out-390.png` | Out: "All your cups are broken: watch the rest", your own row "0/3" (every cup broken), the seat list with "Out" |
| `jr-results-390.png`, `jr-results-320-christmas.png` | Results: every row draws the player's cups (the repair), "2 of 3 cups whole", "Out: every cup broken", "plus 10 for every cup still whole" |
| `jr-tv-final-1440.png` | The TV's Jebena final (the repair): "Keku wins", "Keku kept the jebena!", the last play "Amina is out: every cup is broken." and every row's cups |
| `jr-tv-review-1440.png` | The TV's post-game review |
| `jr-seven-cups-320-christmas.png` | Room B (7 cups) on a 320 px phone: seven cups in your own row and in the seat list, names and the countdown legible |
| `jr-results-zero-answers-winner-390.png` | A survivor with no accepted answer: "You came 1st of 2 · That was you. Enjoy it quietly. Or loudly.", never "You missed this one" |

## Before: hearts (`before/*.png`)
- **Source:** a local run (not a gate run) of the unchanged `check-jebena-rush` on `6d58728`. That commit is the Stage 9.3 head `940df38` plus docs only, so it shows the base's hearts.
- **The same screens, before:**
  - `jr-lobby-host-390`, `jr-lobby-guest-320-christmas`, `jr-briefing-320-christmas`;
  - `jr-myturn-feedback-320-christmas`, `jr-myturn-320-christmas`, `jr-myturn-390-reduced`;
  - `jr-tv-1440`, `jr-out-390`;
  - `jr-results-390`, `jr-results-320-christmas`;
  - `jr-tv-final-1440`, `jr-tv-review-1440`.
- **What changed:** "Out of hearts", ♥/♡ and "3 ♥ each" became cups, broken cups and "3 cups each".

## The ending, before and after the repair (review 6822605156, S101-R1)
- **Before** (`repair-before/*.png`): the same screens from the full gate run `20261112-103723-f1574229-15489` on `f157422`, the code ChatGPT reviewed.
  - `jr-tv-final-1440.png`: generic final standings, no cups, so the deciding cup never broke on the TV.
  - `jr-results-390.png`, `jr-results-320-christmas.png`: only your own row drew cups, so the runner-up's last cup never broke on a phone.
- **After** (this folder, the final run on `0516e3e`): `jr-tv-final-1440.png`, `jr-results-390.png`, `jr-results-320-christmas.png`.
  - The TV final and every results row draw the cups and continue the live screens' memory.
  - The driver logged the runner-up's deciding cup breaking exactly once: on the TV final (animated), on Keku's results, and on the runner-up's own results.
- **The break itself** is a 0.6 s animation, so a still picture shows its end state (the broken cup). The break log in the gate's `check-jebena-rush` output is the evidence that it played, and once.
