# Stage 8.2 screenshots: before and after

- **How they were taken:** by `scripts/screenshot-stage82.mjs`, the same script for both, each run against its own server with its own build. Chromium headless emulation, not real phones or WebKit. Each folder's `manifest.json` names the exact revision, says whether the tree was clean, and records which look each shot actually rendered.
- **`before/`:** `0f3cc54`, PR #12's cleared head, with a clean tree.
- **`after/`:** `d4e06c3`, the Stage 8.2 candidate tested by both gates, with a clean tree.

**What each shot is.** Every surface is photographed twice, with this device's look set to Everyday and then to Christmas (`localStorage` `mz_look`).
- **Before:** nothing read that setting, so all 20 "christmas" shots rendered in the everyday look. The manifest records `rendered: everyday`, which is the finding in §1.1: the Christmas theme never rendered. The content choice didn't exist yet, so those steps are listed as skipped.
- **After:** all 20 render Christmas. Where a session's content matters, the after shots also choose Christmas content: the solo shelf, a solo Word Connections round (a Christmas board), and a casual lobby (its TV, briefing and results).

| # | Screen | Sizes |
|---|---|---|
| 01 | Home | 320×640, 390×844, 844×390, 1440×900 |
| 02 | Solo shelf | the same four |
| 03 | Game library | 390×844 |
| 04, 05 | Word Connections, solo: start screen and a round | 390×844 |
| 06, 07 | Casual lobby: host, guest | 390×844, 320×640 |
| 08 | TV (spectator) between games | 1280×720 |
| 09, 10 | Briefing: host, TV | 390×844, 1280×720 |
| 11 | Word Connections in a casual room, guest | 320×640 |
| 12 | Casual results with What's next, host | 390×844 |
| 13 | An older game screen (Category Sprint, four players): the header | 390×844 |
| 14 | Family Cup lobby (stays Everyday under Match the game; Christmas when a device pins it) | 390×844 |
