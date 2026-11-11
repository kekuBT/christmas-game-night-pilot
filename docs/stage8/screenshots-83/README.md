# Stage 8.3 screenshots: Home Screen installation

- **How they were taken:** by `scripts/screenshot-stage83.mjs` on `69a7dc1`, the final candidate tested by both gates, with clean code. It starts its own server on a copy of the build.
- **What is real:** this is Chromium headless (Playwright). The service worker, Cache Storage and offline are the real engine's.
- **What is emulated:** an iPhone user agent, Chromium's install prompt event, and standalone mode via `navigator.standalone`. Each shot's `manifest.json` entry says which, and records the look it rendered.
- **Not covered:** real phones and WebKit.
- **Looks:** every shot is taken in both looks, Everyday and Christmas (`mz_look` pinned); all 17 Christmas shots render Christmas.
- **There is no "before" set:** before Stage 8.3 there was no install UI, no offline screen (a browser error page instead) and no update notice to compare.

| # | Screen | Sizes |
|---|---|---|
| 01 | Home on an iPhone: the install card, below the games | 320×640, 390×844 |
| 02 | Show me how: the Share → Add to Home Screen → Add steps | the same |
| 03 | Settings → Add to Home Screen (iPhone) | the same |
| 04 | Home in Chromium when it offers to install: **Install Mchezo** | 390×844 |
| 05 | After the browser's prompt is accepted: "Follow your browser…" (no success claim until the browser reports it) | 390×844 |
| 06 | Opened from the Home Screen: Settings says so, and there is no card | 390×844 |
| 07 | Home with no connection: "Can't reach Mchezo … Nothing has started", **Try again** | 320×640, 390×844 |
| 08 | An invite link (`/join?code=`) opened with no connection | the same |
| 09 | A room reloaded with no connection: "Rejoining your room… One moment" below the connection banner (fixed in this stage; it was under the banner on `8b8a7ef`) | the same |
| 10 | The solo shelf when a newer build is waiting: **Reload** or **Later** (a real next build was swapped in) | the same |

**`cache-inventory.json`** was captured after a solo round and a casual room joined by a guest in a second tab. It lists every Cache Storage entry, with its type and size: one cache, `mchezo-shell-<build>`, holding 14 entries, all public shell files. It also lists every API reply with whether the service worker answered it: 0 of 19 did.
