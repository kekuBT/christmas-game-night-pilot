# Stage 9.1 screenshots: Jebena Rush

Desktop Chromium (chrome-headless-shell) emulating phone and TV sizes; not real devices.

- All but one come from the full gate run `20261111-232938-4d91cd63-16286` on commit `4d91cd6` (driver `check-jebena-rush`, its screenshot folder).
- `jr-tv-1440.png` (the TV during play) comes from a local run of the same driver on a clean clone of the same commit `4d91cd6`, with that gate run's own build (`docs/evidence/stage91/check-jebena-rush-4d91cd6-local-run2.log`, 106 checks, 0 failed). The driver takes it only when Keku answers before the reload step, which depends on the seeded seat order; the gate run's order didn't give that moment.

| File | What it shows |
|---|---|
| `jr-lobby-host-390.png` | The host's lobby: Jebena Rush up next, the hearts choice (3 chosen) |
| `jr-lobby-guest-320-christmas.png` | A guest (Christmas look, 320 px) sees "Everyone starts with 3 hearts" |
| `jr-briefing-320-christmas.png` | The briefing's rules, including "the clock never stops for anyone" |
| `jr-myturn-feedback-390.png` | Your turn: a near miss ("job") explained, the typed text selected for the next try |
| `jr-myturn-320-christmas.png` | Your turn at 320 px, Christmas look |
| `jr-myturn-390-reduced.png` | Your turn with reduced motion: a still jebena, the word and seconds |
| `jr-out-390.png` | Out of hearts: watching the rest |
| `jr-tv-1440.png` | The TV: category, holder, countdown and word, everyone's hearts, the last play |
| `jr-results-390.png`, `jr-results-320-christmas.png` | Results: places, "kept the jebena", hearts, answers, timeouts, points |
| `jr-tv-final-1440.png`, `jr-tv-review-1440.png` | The TV's final standings and its post-game review |

# Stage 9.3 screenshots: Spectrum

Desktop Chromium (chrome-headless-shell) emulating phone and TV sizes; not real devices. Every `sp-*.png` comes from the full gate run `20261112-073733-9397c002-17855` on commit `9397c00` (driver `check-spectrum`, its screenshot folder; 122 checks, ALL PASS). They replace the set from `f1c5f02` (run `20261112-042322-f1c5f02a-2551`), which showed the briefing before review 6815908707's repairs. Which player gives which round's clue follows the seeded seat order, so the phone in a picture can change between runs.

| File | What it shows |
|---|---|
| `sp-library-390.png` | The library: Spectrum's card with "Co-op: one team score" |
| `sp-lobby-host-390.png` | The host's casual lobby with Spectrum up next |
| `sp-briefing-320-christmas.png`, `sp-briefing-tv-1440.png` | The briefing on a phone (Christmas look, 320 px) and the TV: one team, rotating roles, "Give a clue, not the target number". The TV shows the timing lines: 60 seconds for the clue, 45 seconds for everyone's guesses, 8 seconds for each reveal |
| `sp-briefing-timing-390.png` | A phone's briefing scrolled to the same timing lines (review 6815908707: never "the impostor's guess") |
| `sp-giver-clue-390.png` | The clue-giver: the secret target on the scale and in words, the clue field, the rule, the clock |
| `sp-tv-clue-1440.png` | The TV while the clue is being written: the pair, who is thinking, no target |
| `sp-guess-390-reduced.png` | A guesser (reduced motion): the clue as text, the scale with its number, the nudges, Send |
| `sp-guess-locked-320-christmas.png` | A guess sent and locked in (320 px, Christmas look) |
| `sp-reveal-390.png`, `sp-tv-reveal-1440.png` | The reveal on a phone and the TV: target ◆, team guess ●, the distance and points in words |
| `sp-results-390.png`, `sp-results-320-christmas.png` | The team result: one total out of 40, every round explained; no winner or place |
| `sp-tv-final-1440.png`, `sp-tv-review-1440.png` | The TV's final view (labelled "Team result") and its post-game review |
| `sp-tv-lobby-1440.png` | The TV lobby's "Tonight so far": Spectrum's team result |
| `sp-lobby-last-game-320-christmas.png` | The lobby's last-game card: "Team result … · You played on the team." |
| `sp-sitout-confirm-320-christmas.png` | Leaving the match: the second tap that confirms |
| `sp-results-early-390.png` | An early ending (fewer than two left): the reason said once, in the team result; the points earned stand; "0 of 4 rounds played." and never "Everyone finished." |
