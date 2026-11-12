# Stage 10.3 screenshots: Spectrum's team result in the Memory Book

- **Source:** every file here comes from the checkpoint full gate run `20261112-211904-b7910156-3590` on `b791015`, from `check-spectrum`'s screenshot folder (173 checks, ALL PASS).
- **Browser:** desktop Chromium (chrome-headless-shell) emulating phone sizes, not real devices.

| File | What it shows |
|---|---|
| `sp-memory-pending-320-christmas.png` | Amina, a guest (Christmas look, 320 px), after saving with the keyboard. The page reads "Christmas Memory Book". Her note "Round 3 was a bullseye" is on top, "Day 1 · pending" below it, then "From the game: Spectrum team result: N out of 40 · all 4 rounds played" and "Waiting for the host to approve it." The link line above previews what the next save would carry. |
| `sp-memory-approved-390.png` | Keku, the host (Everyday, 390 px), after approving. It reads "Mchezo Memory Book" with nothing Christmas on it. The export shows "# Mchezo Memory Book — …", the note, then "From the game:" and the team line. |
| `sp-memory-early-390.png` | Keku's Memory Book, left open while the next match ended early. It moved to the new finish and previews "ended early, 0 of 4 rounds played (fewer than two players were left)". The completed match's entry is still there, approved, with its own facts. |
| `sp-memory-cohost-390.png` | Baraka, made a cohost, after revoking the completed entry (back to pending, with Approve) and approving the early one (with Revoke). A forged save ("forged") still carries the server's own early facts. |

**Before:** `docs/stage10/stage102-screenshots/sp-memory-team-game-390.png` (Stage 10.2). The same Spectrum journey said "team games aren't saved to the Memory Book yet", with Add off.
