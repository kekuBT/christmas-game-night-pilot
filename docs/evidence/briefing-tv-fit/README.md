# The TV briefing on a phone: evidence (handoff 7046501193, D-BF-01)

- **The handoff:** [7046501193](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7046501193), acknowledged in [7046515024](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7046515024). The decision is D-BF-01 in `docs/DECISIONS.md`.
- **Draft PR:** #59, stacked on #58 (exact base `5d5eead85c0b35010f621a13b63374376e04c030`).
- **The fix commit, and the tested SHA:** `6d884195e5e09dfc85fad3aee8589ac8b000c7b4`. This folder was added afterwards, in a docs-only commit.
- **Synthetic local data only.** Chromium emulation (a 320×568 phone with touch, a 1280×800 desktop), not real phones.

## The defect on `5d5eead`
- **The cause:** the TV briefing's grid asked for a 320 px minimum track (`minmax(320px, 1fr)`) inside about 290 px of content.
- **The effect at 320 px:** every grid card (How to play, Ready, Played as teams) ran from x=15 to **x=335**, past the content edge at 305. It happened for the invited player and the spectator, in both looks.
- **The right side was clipped,** although the page reported no sideways scroll.

## The fix
The track minimums are capped at the grid's own width: `minmax(min(320px, 100%), 1fr)` for the grid and `minmax(min(220px, 100%), 1fr)` for the TV people list.
- **On a phone:** each card takes the full width.
- **On a desktop:** nothing changes. At 1280×800 there are three cards side by side, 376 px each, as before.

## The regression: `scripts/check-briefing-tv-fit.mjs` (186 checks)
**Cases:**
- **K:** Know Your Rivals with the night's teams. It has long rules and six players with long names (one a single 32-character word), plus the longest team name allowed (20 characters, one word).
- **S:** Spectrum, the longest rules.

**Views:** an invited player (on the TV view when the host starts) and a spectator, in Everyday and Christmas, at 320×568 and 1280×800.

**Checks:**
- Every card lies inside the briefing's content box and the screen, and nothing inside a card spills past its edges.
- Long names are shown in full.
- The desktop keeps its side-by-side cards.
- The spectator's only control is Stop watching.
- An ordinary tap or click on the way back leaves the briefing TV.
- Everyone ready still starts play.

| Run | Result | Log |
|---|---|---|
| `5d5eead` (base) | **20 FAIL**, 166 PASS: every grid card at 320 px, in both games, both views and both looks, ends at x=335 against a content edge of 305 | `before-5d5eead-check-briefing-tv-fit.log` |
| `6d88419`, development build | 186/186 PASS | `after-dev-6d88419-check-briefing-tv-fit.log` |

The desktop measurements (card widths and rows at 1280×800) are identical in both runs.

## The gates on `6d88419`
Each verdict belongs to its own run. All three full runs were on the same tree, `6d88419`.

| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `briefing-tv-fit`, `briefing`, `audit-fixes`, `warm-ivory`, `tv-return`, `tv-spectator`, `know-your-rivals`, `spectrum`, `teams`, `one-path`, `tv-show` | **`PASSED (exit 0)`**, 13/13 | `20261120-174946-6d884195-26796` | `gate-6d88419-targeted.txt`, `after-gate-6d88419-targeted-check-briefing-tv-fit.log` |
| Full, run 1 | **`FAILED (exit 1)`**, 118 passed, 1 failed: `check-install-builds` E1 ("no candidate is left"); `check-briefing-tv-fit` passed | `20261120-175449-6d884195-29338` | `gate-6d88419-full-run1-FAILED.txt`, `gate-6d88419-full-run1-check-install-builds-FAILED.log` |
| Full, run 2 | **no verdict**: the session's worker process was restarted at 6/119 steps, which stopped the run | `20261120-185358-6d884195-24239` | `gate-6d88419-full-run2-NO-VERDICT.txt` |
| **Full, run 3** | **`PASSED (exit 0)`, 119/119** (`check-briefing-tv-fit` 186 checks in 21.9 s; `check-install-builds` passed) | `20261120-200340-6d884195-204` | `gate-6d88419-full-run3-PASSED.txt`, `after-gate-6d88419-full-run3-check-briefing-tv-fit.log` |

### The `check-install-builds` failure in run 1 (an existing driver, not this change)
**What failed:**
- E1 found a service-worker candidate cache (`mchezo-stage-<W>-…`) at the moment it checked that a failed install left none.
- This change touches no worker code. The candidate's name carries its creation time, which matches the moment of the check.

**What the investigation found** (`install-builds-investigation/`):
- **The driver races update checks it does not start.** The app calls `reg.update()` whenever the network comes back, which every offline step in the driver sets off. The browser can also run a deferred update check after a navigation.
- **The leftover was a second, in-flight install** of the same deployed build. It was not the failed install's own candidate (`installCandidate` awaits that candidate's deletion before it rethrows).
- **The delayed-read experiment:** a driver variant that waited for installs to settle before reading the cache names found, deterministically (8 of 8 runs), a *later, successful* install of W after E2's storage-full failure. So a second install that the driver did not start does take place.
- **The experiment was reverted.** The driver stays as it was, because waiting alone changes what E2 can observe.
- **Rates:**
  - The unmodified driver failed 1 of 4 standalone runs on `6d88419` and passed 6 of 6 on `5d5eead`. These samples are too small to show a difference either way.
  - It passed in all five earlier full gates today and in run 3.
- **Not claimed:** that the failure predates this change. It is claimed only that its mechanism does not involve it.
- **Proposed follow-up (separate):** make `check-install-builds` own every update check in section E (or assert only on the failed install's own candidate). It is not done in this slice.

## Screenshots (`before/` on `5d5eead`, `after/` on `6d88419`, 320×568 unless noted)
- **`kyr-player-everyday-320x568.png`:** the invited player's first screen.
- **`kyr-player-christmas-320x568-rules.png`, `kyr-spectator-everyday-320x568-rules.png`:** How to play. Before, its right border and padding are cut off.
- **`kyr-player-christmas-320x568-ready.png`:** Ready, with the long names.
- **`kyr-spectator-everyday-320x568-teams.png`, `kyr-spectator-christmas-320x568-teams.png`:** Played as teams, with the longest team name.
- **`spectrum-spectator-christmas-320x568.png`:** Spectrum's briefing as a spectator.
- **`kyr-spectator-everyday-1280x800.png`:** the desktop, unchanged.

## Limitations
- `check-install-builds` can fail intermittently in section E: a driver race with update checks it does not start (see above). The fix is proposed separately.
- Chromium emulation with synthetic data only; real phones are a separate check.
- **The teams card on a phone:** it keeps the TV's large team text (24 px), so a long one-word name wraps mid-word. It fits; a phone-specific type scale belongs to the broader redesign, which needs owner-selected options.
- Draw & Guess native confirmation and the private Codespace audits remain open.
