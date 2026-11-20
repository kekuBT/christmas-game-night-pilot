# Solo rules first: evidence (HELD slice)

- **Handoff:** [7029967180](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7029967180) and D-SR-01 in `docs/DECISIONS.md`.
- **Draft PR:** #56, stacked on #55 at exact base `3cc1c2f92f0d96a6dbb8f33a5de974d8c89fc5ac`.
- **Code commit:** `cbdb12424908a326ac4f3d533fa92ec5b665eec4`. This folder was added afterwards, in a docs-only commit.

## Status: held, not a completed slice

- **The hold:** ChatGPT's qualification [7029976608](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7029976608) held this slice until H8's private Codespace audit is done. The access result is [7029986532](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7029986532), and the coordination comment is [7030250257](https://github.com/kekuBT/christmas-game-night-pilot/pull/56#issuecomment-7030250257).
- **When the hold arrived:** after the slice had started, through delayed notification delivery.
- **What was done under the hold:** the validation already running was finished on its exact revision, and this evidence is kept, as 7030250257 asks.
- **Not run:** a full gate, and the completed handoff. The slice is not accepted.

## What the check covers: `scripts/check-solo-rules.mjs`

- **The setup:** its own server, 320×568 and 375×667 touch phones, synthetic data.
- **The steps, for Math Mayhem, Pattern Pulse and Word Connections:**
  - shelf → instructions, then waiting there;
  - Back and Forward, and re-entry;
  - a rapid double tap on Start;
  - Pattern Pulse's first pattern still waiting for its open action;
  - results, then Play again;
  - Back mid-round, then re-entry;
  - a direct URL on a fresh device, then a reload.
- **It counts** every room made, round started and projection poll.

| Run | Revision | Result | Log |
|---|---|---|---|
| Before (negative control) | `3cc1c2f` (base worktree and its own web build) | **30 FAIL**, 27 PASS. Each shelf entry made a room, a start and polls (for example `{"rooms":1,"starts":1,"polls":15}`) before the rules could be read, so D–G could not run. H (direct URL and reload) passed: the base already landed there on the instructions. | `before-3cc1c2f.log` |
| After, development build | the tree that became `cbdb124` | 88 PASS, 0 FAIL | `after-dev.log` |
| After, in the gate | `cbdb124`, built by the gate | PASS (exit 0) in the targeted run below | `after-gate-cbdb124-targeted-check-solo-rules.log` |

## The gate on `cbdb124`

| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `check-solo-rules` and every driver touching `/solo` (`solo`, `solo-shelf`, `mobile-everyday`, `install`, `install-builds`, `casual`, `themes-seasonal`, `warm-ivory`, `content-variety`, `player-copy`) | **`PASSED (exit 0)`**, 13/13 | `20261120-041617-cbdb1242-6009` | `gate-cbdb124-targeted.txt` |

- **No full gate was run on this slice** (held).

## Screenshots (320 px, right after the shelf tap)

| Game | Before (`3cc1c2f`) | After (`cbdb124`, gate run) |
|---|---|---|
| Math Mayhem | `before/instructions-math-mayhem-320.png` | `after/instructions-math-mayhem-320.png` |
| Pattern Pulse | `before/instructions-pattern-pulse-320.png` (a round already running, its game clock counting down) | `after/instructions-pattern-pulse-320.png` (the instructions, one Start) |
| Word Connections | `before/instructions-word-connections-320.png` | `after/instructions-word-connections-320.png` |

## Limits

- **Browsers:** Chromium phone emulation only, with local synthetic data; no native device and no private Codespace audit.
- **Redaction:** the scratch directory is shown as `$SCRATCH`, the repository as `$REPO`, and temporary data directories as `/tmp/mz-XXXX`; colour codes are removed.
