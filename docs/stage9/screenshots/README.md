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
