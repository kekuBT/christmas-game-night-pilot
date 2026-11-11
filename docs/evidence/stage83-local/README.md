# Stage 8.3: local evidence (before the gates)

Every check here ran in **Chromium** (Playwright's headless shell) on this machine, against a local server serving the build under test. It is labelled by kind:
- **Engine:** Chromium itself did it. Its manifest parser, its installability verdict, a real service worker, real Cache Storage and real offline.
- **Emulated:** a platform signal was faked. That covers an iPhone user agent, Chromium's install prompt event, and standalone display mode, done by script because headless Chromium's own `display-mode` emulation didn't take.
- **Not done here:** real phones, real WebKit, and a real install. Those are `docs/REAL_DEVICE_TESTING.md` Part J.

| File | What |
|---|---|
| `check-install.log` | `scripts/check-install.mjs` on `96b3970`, 113 of 113 checks. The sections are M (identity), W (the worker's boundary, inspected), O (offline), O3 (reachability as evidence, no gate, no polling), O2 (the room's offline heading clear of the banner), I (guidance), S (storage unavailable), N (deep links), U (two tabs and a next build, spec feedback §1) and F (a partial deploy, a sign-in page, a redirect, quota denied, and privacy without static routing). |
| `check-install-O2-on-8b8a7ef.log` | The same driver on the first candidate `8b8a7ef`: section O2 fails 8 of 8 (the "Rejoining your room" heading under the banner); everything else passes. |
| `regression-drivers.txt` | Twelve existing drivers, rerun on the final code: 0 failures. |
| `check-install-builds-on-96b3970.log` | **Repair R83-01** (stage83.md §7.5): the new real-build driver `scripts/check-install-builds.mjs`, run on `96b3970`'s code. It fails 11 of 34: a worker-only change (W) and a worker-policy change (P) keep A's version `77f9ad4250045e33`; a failed install empties A's live cache; offline there is no shell; and a waiting same-version worker writes into the live cache. |
| `check-install-builds.log` | The same driver on the repair: 34 of 34. Four real builds; failed installs (a missing file, storage full) leave the live cache exactly as it was, the old tab plays on, the offline shell stays whole; then waiting, activation, scoped cleanup, and the defensive same-version case. |
| `check-install-after-R83-01.log` | `check-install` on the repair's staged install: 113 of 113. |

**How the privacy boundary was shown,** by real contents, not mocks:
- **The cache:** check-install section W lists every Cache Storage entry after a solo round, a casual room joined by a guest in a second tab, and that room's session, ledger, Memory Book and projection reads (each 200 with the seat's token).
  - There is exactly one cache, `mchezo-shell-<build>`, holding 14 entries: `/index.html`, this build's `/assets` JS and CSS, the manifest, the favicon and the icons.
  - No text body in it contains the room's id, its code, or either seat's token.
- **The replies:** every API reply's `fromServiceWorker()` is false.
- **Without static routing:** section F runs the same flow with a worker built without Chromium's static routing. Every entry is still one of this build's files, and no API reply came from the worker, so privacy doesn't depend on a Chromium-only feature.
- **What may be stored at all:** only a direct, same-origin `200` of the expected type, never a redirect or a sign-in page (unit tests on `cacheable()`). Section F shows that a sign-in page or a redirect in place of a file installs nothing.
- **The raw inventory:** `docs/stage8/screenshots-83/cache-inventory.json` (`scripts/screenshot-stage83.mjs`) records the entries, their types and sizes, and every API reply with its source.

**How the update lifecycle was shown** (section U): the driver serves a copy of the build from its own server. While a solo round is in play, it puts a real next build in place: a new version, a renamed main file, and the old main file deleted from the server. Then it checks the following.
- **The round in play:** it is not reloaded and still plays, and its old main file is still served from its cache.
- **The next worker:** it waits.
- **The notice:** it appears only on calm screens. **Later** hides it; **Reload** reloads only its own tab.
- **Activation:** once no old page is open, the next worker is active and only its cache remains.
- **What is kept:** the look, the solo content, the solo seat and a room seat.
