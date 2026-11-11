# Stage 8.3: local evidence (before the gates)

Every check here ran in **Chromium** (Playwright's headless shell) on this machine, against a local server serving the build under test. It is labelled by kind:
- **Engine:** Chromium itself did it. Its manifest parser, its installability verdict, a real service worker, real Cache Storage and real offline.
- **Emulated:** a platform signal was faked. That covers an iPhone user agent, Chromium's install prompt event, and standalone display mode, done by script because headless Chromium's own `display-mode` emulation didn't take.
- **Not done here:** real phones, real WebKit, and a real install. Those are `docs/REAL_DEVICE_TESTING.md` Part J.

| File | What |
|---|---|
| `check-install.log` | `scripts/check-install.mjs`, 91 of 91 checks. The sections are M (identity), W (the worker's boundary, inspected), O (offline), O2 (the room's offline heading clear of the banner), I (guidance), S (storage unavailable), N (deep links) and U (a new build while a round is in play). |
| `check-install-O2-on-8b8a7ef.log` | The same driver on the first candidate `8b8a7ef`: section O2 fails 8 of 8 (the "Rejoining your room" heading under the banner); everything else passes. |
| `regression-drivers.txt` | Eight existing drivers, rerun with the worker in place: 0 failures. |

**How the privacy boundary was shown,** by real contents, not mocks:
- **The cache:** check-install section W lists every Cache Storage entry after a solo round, a casual room joined by a guest in a second tab, and that room's session, ledger, Memory Book and projection reads (each 200 with the seat's token).
  - There is exactly one cache, `mchezo-shell-<build>`, holding 14 entries: `/index.html`, this build's `/assets` JS and CSS, the manifest, the favicon and the icons.
  - No text body in it contains the room's id, its code, or either seat's token.
- **The replies:** every API reply's `fromServiceWorker()` is false (28 of 28).
- **The raw inventory:** `docs/stage8/screenshots-83/cache-inventory.json` (`scripts/screenshot-stage83.mjs`) records the entries, their types and sizes, and every API reply with its source.

**How the update lifecycle was shown** (section U): the driver serves a copy of the build from its own server. While a solo round is in play, it puts a real next build in place: a new version, a renamed main file, and the old main file deleted from the server. Then it checks the following.
- **The round in play:** it is not reloaded and still plays, and its old main file is still served from its cache.
- **The next worker:** it waits.
- **The notice:** it appears only on calm screens. **Later** hides it; **Reload** reloads only its own tab.
- **Activation:** once no old page is open, the next worker is active and only its cache remains.
- **What is kept:** the look, the solo content, the solo seat and a room seat.
