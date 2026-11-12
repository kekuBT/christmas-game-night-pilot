# Stage 10.2 screenshots: the moment line

- **Source:** every file here comes from the checkpoint full gate run `20261112-165001-cdb77add-5562` on `cdb77ad`. They were taken from the screenshot folders of `check-jebena-rush` (193 checks) and `check-spectrum` (137 checks), both ALL PASS.
- **Browser:** desktop Chromium (chrome-headless-shell) emulating phone and TV sizes, not real devices.

| File | What it shows |
|---|---|
| `jr-results-zero-answers-winner-390.png` | Jebena room C, the winner's phone (Everyday, 390 px): "One cup left. Still enough for the win." under "You kept the jebena!". It sits after the result and What's next (Play again, Pick another game, Take a break). This winner had no accepted answer. |
| `jr-results-moment-320-christmas.png` | The same result on the other player's phone (Christmas, 320 px): the same line, no sideways scroll |
| `jr-tv-final-moment-1440.png` | A TV watching room C: the line under "Wanjiru kept the jebena!", set off by a dashed rule |
| `sp-results-390.png`, `sp-results-320-christmas.png` | Spectrum, a completed match with round 3 exactly on target: "Round 3 landed exactly on the target." under the team total (Everyday 390 px; Christmas 320 px, after a reload) |
| `sp-tv-final-1440.png` | Spectrum's TV final: the same line under the team result (after a reload) |
| `sp-results-early-390.png` | The next Spectrum match, ended early (too few players): no line. Nothing carried over. |

**Before (no line):**
- Jebena: `docs/stage10/screenshots/jr-results-zero-answers-winner-390.png` and `jr-tv-final-1440.png` (Stage 10.1).
- Spectrum: `docs/stage9/screenshots/sp-results-390.png` and `sp-tv-final-1440.png` (Stage 9.3).

**Note:** the two 390 px phone shots caught the results screen's entrance fade (a fraction of a second), so they look dimmer. The layout and the line are the same as in the others.

## Repairs (review 6831760093)
- **Source:** the repair checkpoint full gate run `20261112-183329-b8e75be6-7881` on `b8e75be` (`check-spectrum` 145 checks, `check-jebena-rush` 216, both ALL PASS). The one "before" comes from a local control run, described below.

| File | What it shows |
|---|---|
| `repair-before/sp-memory-checking-forever-390.png` | **Before (S102-R1):** the reviewer's Spectrum journey with the pre-fix web build (`d0d39e7`). The host's Memory Book says "Checking for the latest finished game…" with Add off, and stays that way. This shot comes from the local control run in `docs/evidence/stage102-repair-local/`, not a gate. |
| `sp-memory-team-game-390.png` | **After:** the same journey says plainly "The last game that finished is **Spectrum**, a team game: team games aren't saved to the Memory Book yet." Add stays off, and the hint reads "You can add a highlight after the next game that isn't a team game." |
| `jr-memory-ready-390.png` | **A supported game:** a Jebena replay ended by two sit-outs, the last of them hidden from the host. The Memory Book is ready ("Linked to Jebena Rush · Day 1"), and the highlight it adds cites exactly that replay's finish. |
| `jr-short-reconnect-results-390-reduced.png` | **S102-R2, room S:** Pendo's phone (reduced motion) after the final loss. The last cup broke once on the results, after an earlier short reconnect and a later live loss. The 10.2 line "All 3 cups still whole. Not a single crack." appears because Halima kept every cup and Pendo was knocked out. |
