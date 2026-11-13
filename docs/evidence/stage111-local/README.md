# Stage 11.1: local runs (development)

These are **local runs from development, not gate verdicts**.
- **Setup:** each run started its own server and used desktop Chromium (chrome-headless-shell).
- **Gate verdicts:** in `docs/evidence/gate-runs/`.
- **What's listed:** every local run of `check-warm-ivory` is listed here, the failing ones included.

## The Everyday baseline (W8)
| Log | Build served | What ran | Verdict |
|---|---|---|---|
| (not saved) | `d4dc408` (base) | first `--record-everyday` attempt | **exit 1**: a driver mistake. The room had a finished game, so `/room` opened on its results and the lobby's menu button never appeared (`waiting for getByTestId('room-menu')`). Fixed: the tour takes the results, then taps Back to lobby. |
| (not saved) | `d4dc408` | second attempt | **exit 1**: a driver mistake. A spectator sees the briefing (with Stop watching) before the show starts, and the driver waited for the show (`waiting for getByTestId('tv-show')`). Fixed: it waits for either. |
| `warm-ivory-record-everyday-on-d4dc408.log` | `d4dc408` | third attempt | exit 0. It recorded `scripts/lib/everyday-style-baseline.json`: 22 screens, 2,305 element styles. No checks run in record mode. (This log's last line says "ALL WARM IVORY CHECKS PASSED"; record mode now says no checks were run.) |
| `warm-ivory-on-base-d4dc408.log` | `d4dc408` | the full driver against the base build | **exit 1, 139 PASS, 60 FAIL**, as expected. See below. |

**What the base-build run shows:**
- **W8 is deterministic:** the base build matched its own recording on all 22 Everyday screens.
- **The checks catch the old look:** on the old green Christmas look they fail where they should:
  - W0 (not a light look) on all 29 screens;
  - W3 (dark page and cards, luminance 0.01–0.02) on all 29;
  - W7 (no ivory PDF page, no ivory share image), 2 checks.
- W1 and W2 passed on the old look: it was readable, just dark.

## The candidate
| Log | Code | Verdict |
|---|---|---|
| `warm-ivory-run1.log` | the implementation `9935508` plus the first driver | **exit 1, 197 PASS, 2 FAIL**, both W7, both driver mistakes. The PDF pattern expected three decimals, but jsPDF writes a fill colour as `0.97 0.95 0.9 rg`. The share-image hook kept a pixel from an earlier canvas (jsPDF's). Fixed: exact patterns, and only the 1080×1080 canvas, reset before the click. |
| `warm-ivory-run2.log` | the same, with the fixed driver | exit 0, 199 PASS, 0 FAIL. |
| `warm-ivory-run3.log` | the driver committed as `b7ef25a` | exit 0, 199 PASS, 0 FAIL. Two checks were made stricter for this run. **W2** now compares the same Add key disabled and enabled (cream inset vs cranberry). **W7** now approves one note and revokes the other; the fresh Christmas PDF has the approved note and not the revoked one. |

**Screenshots:** this run's screenshots are in `docs/stage11/stage111-screenshots/` (the `after-…` files).
