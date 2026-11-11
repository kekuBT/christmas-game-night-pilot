# Stage 8.3: Home Screen installation foundation

**Instruction:** ChatGPT's handoff on PR #13 (comment 6801615731, which also cleared Stage 8.2), under D-WF-01.
**Branch:** `claude/stage8-3-home-screen`, from `4c13e2b` (Stage 8.2's reviewed head), stacked on PR #13.
**Scope:** making Mchezo installable to a phone's Home Screen, safely. No new games, no unrelated product work. Nothing merged or deployed, no public port, nothing paid for.

## 1. What is there today (`4c13e2b`)
- **No install identity at all.**
  - There is no manifest, app icon, Apple touch icon, favicon or service worker.
  - `apps/web/index.html` has `theme-color` `#16111D` (updated at runtime with the look, Stage 8.2), `color-scheme: dark` and the title "Mchezo".
- **Static serving** (`src/server/http.ts` `serveStatic`):
  - The server serves only `/`, `/index.html` and `/assets/*`, plus the client routes (`src/shared/clientRoutes.ts`: `/join`, `/host`, `/watch`, `/solo[/game]`, `/library[/game]`, `/room[/cup|tv|memories|studio|library[/game]]`), which get `index.html`.
  - Static files are sent with no `cache-control` at all, and only JS, CSS and HTML get a real content type.
  - API replies are `no-store` (Stage 5.1).
- **Deep links:** `/join?code=…` (QR and invite), `/solo/<game>`, `/library/<game>` and the room's addresses. A reload lands on the same screen (Stage 2).
- **What a device keeps:**
  - **A seat** lives in `sessionStorage` for this tab only (`cgn_roomId`, `cgn_playerId`, `cgn_token`), unless the player chooses "Remember this device", which moves it to `localStorage` (`mz_remembered_seats`).
  - **In `localStorage`:** the solo seat and personal bests, the look (`mz_look`), the solo content (`mz_solo_season`) and the animation setting (`cgn_anim`).
  - **When storage fails,** every one of these falls back to memory for the page (R82-01).
- **Updates today:**
  - Every request carries the page's protocol (`x-mchezo-protocol`). When the server needs a newer one, every screen shows "This game was updated. Refresh…" with **Refresh** and **Later** (`RefreshBanner`, Sprint 3).
  - Nothing ever reloads by itself.
- **Connection:**
  - A room's screens show the calm `ConnectionBanner` ("reconnecting" and similar), and the browser's `offline` event drops the socket at once.
  - Outside a room, a failed request shows a sentence from `ui/mchezo/lib/errors.ts`; "no answer" is `NOT_DELIVERED`.
- **The logo:** `CircleMark`, eight seats on a circle with a larger brand-coloured "you" dot at the top (`ui/mchezo/components/primitives.tsx`).
- **Fonts:** self-hosted through Fontsource, so they are files under `/assets`.

## 2. Platform facts this design relies on
- **Chromium (Android, desktop):**
  - Installing from the browser's menu has not needed a service worker since Chrome 108 on mobile and 112 on desktop.
  - The automatic install prompt (`beforeinstallprompt`) still needs a service worker with a fetch handler, and Chrome's offline check expects that handler to give a real response offline.
  - Sources: [Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria), [Improving PWA offline support detection](https://developer.chrome.com/blog/improved-pwa-offline-detection).
- **iPhone and iPad:**
  - There is no install API. A person adds the site from the Share menu with **Add to Home Screen**.
  - A manifest's `display: standalone` and an `apple-touch-icon` (180 px) are respected.
  - Secondary sources say iOS 26 opens such sites as web apps by default.
  - A Home Screen web app has historically kept its own storage apart from Safari's; no current primary source was found to confirm it (see the recheck below).
  - Sources: [web.dev, PWA enhancements](https://web.dev/learn/pwa/enhancements), [Apple, Configuring Web Applications (archived)](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).
- **Android Chrome:** an installed app shares the origin's `localStorage` with the browser, but `sessionStorage` is per window.

**Rechecked on 2026-11-11 against current documentation** (spec feedback 6802191261 §3). This environment's network can't open `web.dev`, `developer.chrome.com`, `developer.mozilla.org` or `webkit.org`, so the recheck used their search-indexed text. ChatGPT, whose environment can open them, can confirm.
- **[MDN, BeforeInstallPromptEvent](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent):** non-standard and not Baseline. `prompt()` works only from a user action, and once per event. It isn't on iOS. Mchezo calls it only from the Install button and treats it as feature-detected.
- **[web.dev, "What does it take to be installable?"](https://web.dev/articles/install-criteria):** HTTPS, not already installed, some engagement, and a manifest with a name, icons, `start_url` and `display`.
  - Whether Chrome's automatic prompt still needs a fetch handler is described differently by different pages. Chrome's [own post](https://developer.chrome.com/blog/update-install-criteria) said in 2023 that it did.
  - Mchezo's worker has a real fetch handler either way.
- **[MDN, service worker install event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/install_event):** available only in secure contexts (HTTPS, or `localhost`).
- **iOS 26:** "Open as Web App" is on by default in the Add to Home Screen sheet, with a toggle to keep an ordinary bookmark (Apple, WWDC 2025, as reported by [MacRumors](https://www.macrumors.com/guide/ios-26-home-screen/) and [Michael Tsai](https://mjtsai.com/blog/2025/10/03/web-apps-in-ios-26/)).
- **Not confirmed by any current primary source found:** that an iPhone Home Screen app's storage is separate from Safari's. It is now said as "may not share" (§3.5), and J7 checks it on a phone.

So a service worker is needed: for the feature-detected Chromium prompt, and for an installed app opened offline to show Mchezo's own honest screen instead of the browser's error page. It is kept as narrow as possible (§3.3).

## 3. Design

### 3.1 Install identity and assets
- **`/manifest.webmanifest`:** one static file, the same for everyone.
  - Identity and entry: `id: "/"`, `name` and `short_name` "Mchezo", a one-line description, `start_url: "/"`, `scope: "/"`, `display: "standalone"`.
  - Colours: `background_color` and `theme_color` `#16111D` (the Everyday ground).
  - `icons`, `categories: ["games"]`, `lang: "en"`.
  - It holds no room id, code, seat, token, name or anything about a person.
- **Icons:** drawn from `CircleMark`'s own geometry in the Everyday palette, generated by `scripts/make-icons.mjs` (Chromium renders the SVG; the PNGs and the SVG source are committed).
  - Regular icons at 192 and 512 px.
  - Maskable icons at 192 and 512 px, with the mark inside the safe circle.
  - An opaque 180 px `apple-touch-icon`.
  - An SVG favicon.
- **`index.html`** links the manifest, the touch icon and the favicon, and names the app for iOS (`apple-mobile-web-app-title`).
  - The status bar style stays the default, so no screen moves under the notch.
- **The server** serves exactly these public files with their real types. Unknown paths stay unknown.
  - HTML, the manifest and `sw.js` are `no-cache`, so updates are always checked.
  - `/assets/*` (content-hashed names) are `immutable`.
- **The look:** the installed icon is the Everyday mark for everyone, and the app opens in the device's own look.
  - The page's `theme-color` follows the look as today.
  - Android's splash screen uses the Everyday ground.

### 3.2 Contextual install guidance
- **Where:** a low-emphasis card on Home, below the main actions, and **Settings → Add to Home Screen**.
  - Never in a room, a game, a briefing, results, the TV or Watch.
- **Hidden when:**
  - the app already runs installed (`display-mode: standalone`, or iOS `navigator.standalone`);
  - the person pressed **Not now**. That is kept on this device (`mz_install_hint`, through `deviceChoice`, so if storage can't save it the card stays hidden for the page);
  - there is no real path. Then Settings still explains the browser's own menu, and Home shows nothing.
- **Chromium:**
  - **Capturing the prompt:** `beforeinstallprompt` is captured at startup and its automatic mini-infobar is suppressed, so nothing pops up mid-game.
  - **The button:** Home's **Install Mchezo** calls `prompt()`.
  - **The wording:** accepted → "Follow your browser to finish adding Mchezo"; only the `appinstalled` event → "Added. Open Mchezo from your Home Screen or app list"; dismissed → the button goes and the browser's menu is mentioned. There is never a success claim the browser didn't make.
- **iPhone and iPad:**
  - **Show me how** opens a sheet with three steps: Share, then **Add to Home Screen**, then **Add**.
  - The wording isn't tied to Safari, because other iOS browsers' Share menus can offer it too.
  - It says the Home Screen app *may not* share the browser's data (a seat, bests, choices), and points to **Lost your place? Recover your seat** to get a seat back. It never says a room's code recovers a seat.
- **Accessibility and looks:** proper headings, 44 px targets, and the existing `Sheet` for focus. The tokens are used, so it reads right in both looks.

### 3.3 Offline and privacy boundary (service worker; revised by spec feedback 6802191261 §2)
- **`/sw.js`** is generated at build time (a Vite plugin, `apps/web/swBuild.ts`) and its scope is `/`. It embeds this build's version and an exact list of the files the build emitted: scripts, styles, fonts, the public install files and the shell page.
- **The version** is a hash of everything the build ships: the bundle's files and contents, the public files, and **the worker's own code** (§7.5). Any change, a worker-only one included, is a new version and so a new shell cache; the same build always gives the same version and the same worker, byte for byte.
- **A positive, exact-build allowlist** (`swPolicy.ts`): the worker answers only these, and nothing else is ever stored.
  - A **page load** (navigation) of an app page is network first. The real address, query included, goes to the network. Only if the network fails does the worker return the canonical cached shell (`/index.html`). The navigation and its reply are never stored.
  - A **GET for one of this build's files,** by its exact path with no query: this build's cache first, else the network. It is kept only if it validates.
  - **Everything else is the network's:** every API route (present or future), every unknown path, any file request with a query, every non-GET request, every WebSocket, every other origin, and any file of another build. Paths under `/rooms`, `/games`, `/health` and `/sw.js` are refused a second time by name.
  - Chromium's static routing also sends API paths straight to the network without starting the worker. That is an optimisation only: privacy is tested with it switched off.
- **Validated before storing** (`cacheable()`). A response is stored only if it is:
  - a direct `200` from the same origin, not a redirect (a private preview's sign-in) and not an opaque, partial or error reply;
  - from the expected address;
  - free of `no-store` or `private`;
  - of the type its extension requires. An HTML page standing in for a script, a style, a font or an icon is refused.
- **Install is all-or-nothing:**
  - Each precached file is fetched and validated individually, and the shell must carry the worker's own build.
  - One missing, redirected or wrong file, or storage quota denied, and the new worker doesn't install. The half-filled cache it created is deleted; a cache of that name that was already there is never its to remove (§7.5).
  - The worker already in charge (if any) carries on with its own cache.
  - A failed later cache write (quota) never fails the request.
- **Nothing is queued:** no background sync, no retry by the worker. A request that can't go fails as today, and no score or game action is ever stored for later.
- **Honest offline:**
  - A new `GET /health` (`no-store`, no data) lets Home, Join, Host, the solo shelf and the library say "Can't reach Mchezo".
  - It explains that every game, solo rounds included, runs on the game server, and offers **Try again**.
  - A room keeps its `ConnectionBanner`.
  - A press that fails offline says so and never shows a started game.
- **Reachability is evidence, never a gate** (§3):
  - Only the server's own reply counts: JSON `{"ok":true}` within 4 seconds, with no redirect. A sign-in page, a gateway error or a stand-in page counts as unreachable, and so does `navigator.onLine` on its own: the browser's network events only start a check.
  - Checks run when a calm screen opens, on a network change, on a return to the page (at most every 30 seconds) and on **Try again**. There is no polling.
  - The notice is information only; every button still works.

### 3.4 Update lifecycle (revised by spec feedback 6802191261 §1)
- **A new page is not a new worker.**
  - A new build's worker installs in the background and **waits**: no `skipWaiting`, no `clients.claim`. It activates only when no page it would replace is open, then deletes the other `mchezo-shell-*` caches and nothing else: no other cache, no `localStorage`, `sessionStorage` or cookies.
  - Page loads are network first, so a reload while online gets the newest **page**, under the old worker, until the new worker activates. A reload does not activate it.
  - **The new build's files pass through the old worker without entering its cache:** they are not on its list.
  - An old page still playing keeps every file it needs from its own build's cache, even after the server has dropped them.
- **Offline, until the new worker activates,** a reload gets the old worker's shell: the old build's page and files, complete and of one build.
- **Notice between sessions:**
  - Shown only when a newer worker is waiting (or active, for a page loaded without one), its build differs from this page's (`<meta name="mchezo-build">`), **and the server answers**. Offline, Reload couldn't fetch it.
  - A page that already is the waiting build offers nothing.
  - It appears on calm screens only (Home, Join, Host, the solo shelf, the library), never in a room, a round or results. It says "A newer version of Mchezo is ready", with **Reload** and **Later**.
  - **Reload** reloads this tab only. It claims nothing about the worker, and other tabs are untouched.
  - A page loaded offline still learns about a waiting worker: the registration is read without the network, and is checked again when the network returns.
- **The protocol refresh (`RefreshBanner`)** stays the path for a truly incompatible update; it is unchanged.
- **Kept across an update:** a tab's seat (the same tab), remembered seats, the solo seat, personal bests, the look and the content choice.

### 3.5 Limits, said plainly (revised by spec feedback 6802191261 §3)
- **Nothing is promised about moving data between the browser and an installed app.**
  - The iPhone steps say a Home Screen app *may not* share the browser's data: a seat, personal bests and choices may not move to it.
  - They point to the existing **Lost your place? Recover your seat** (a recovery code or the host's help). Joining with a room's code makes a new seat; it never recovers the old one.
  - What iOS actually does is checklist row J7.
- **On Android, an installed window has its own tab session,** so a seat kept only for a tab stays in that tab.
- **Evidence is labelled by kind:**
  - Chromium emulation: an iPhone user agent, a synthetic `beforeinstallprompt`, and standalone mode by script. **A synthetic prompt is not evidence of native installability;** Chromium's own installability verdict (engine) is the closest this environment gets.
  - A real browser engine run: the same Chromium really installing the worker and using Cache Storage.
  - Real-device installation: the checklist, Part J, which can't be done here.

## 4. Must stay as it is
- Deep links and normal browser entry.
- Every game, score and seat path.
- Cups.
- Private projections.
- The protocol refresh.
- Both looks.
- Stage 8.1's first screens and Stage 8.2's content binding.
- The $0 target and private previews.

## 5. Validation plan
- **Unit:**
  - The manifest is valid and carries no personal or room fields.
  - The worker's routing decision is a pure function: API, non-GET, cross-origin and query paths are never cached, and the shell list is exact.
  - The build plugin's output.
  - The install-hint state, including platform detection.
- **`scripts/check-install.mjs`** (new; the gate runs every `check-*.mjs`):
  - **Assets:** the manifest and icons are served with the right types and sizes, and `index.html` links them.
  - **Worker:** it registers and controls the page.
  - **Cache privacy:** after solo play, a casual room with a guest and the TV, a seat recovery and a Memory Book export, every Cache Storage entry is listed and must be a shell URL. The request log shows every API reply came from the network.
  - **Offline:** with the context offline, Home, a deep link and a room each say honestly what is wrong, and recover.
  - **Install guidance:**
    - hidden in emulated standalone mode;
    - **Not now** holds, even when storage can't save it;
    - a synthetic `beforeinstallprompt` drives the button;
    - an iPhone user agent gets the steps.
  - **A new build while a game runs:** the open game carries on untouched (no reload, its assets still load), a calm screen offers the notice, **Reload** gives the new build, the old cache is removed once no old page is open, and storage is kept.
- **Gates and screenshots:**
  - Fast, then full, gates on a clean final candidate, run one after the other.
  - Screenshots of the card, the sheet, the update notice and the offline notice, at 320 and 390 px, in both looks.
- **Real devices:** `docs/REAL_DEVICE_TESTING.md` Part J: install on an iPhone and an Android phone, open offline, and update while playing.

## 6. Choices for review
1. **Install guidance on Home and in Settings only;** the browser's own mini-infobar is suppressed.
2. **One icon for everyone** (the Everyday mark); the app then opens in the device's look.
3. **The update notice is optional** (**Later**), and never shown in a room or round. Incompatible updates keep the protocol refresh.
4. **`GET /health`** is added for the offline check: it has no data, is never cached, and never reaches the worker's cache.
5. **Fonts are cached when first used,** not precached. Offline, a first-ever visit falls back to system fonts.
6. **A secure context is required.** Browsers run service workers only on HTTPS or `localhost`. A phone on the plain-http LAN preview gets no worker: no offline shell, no update notice, no Chromium prompt. The iPhone steps still work there.
   - Android Chrome can treat the LAN address as secure (`chrome://flags/#unsafely-treat-insecure-origin-as-secure`).
   - An iPhone needs a private HTTPS preview, such as the Codespaces private port.
   - Choosing how a real phone reaches an HTTPS preview is the owner's call (Part J says what each path can test).

## 7. What was built and tested

### 7.1 Built
- **Identity** (§3.1):
  - `apps/web/public/manifest.webmanifest`.
  - The icons, from `scripts/make-icons.mjs`:
    - `icon-192`, `icon-512` and their maskable versions, the opaque 180 px `apple-touch-icon`, and `favicon.svg`;
    - `mark.svg`, the mark's SVG source.
  - `index.html` links them, and carries `<meta name="mchezo-build">`.
- **Server** (`src/server/http.ts`):
  - The public install files, with real types.
  - `no-cache` for HTML, the manifest, the icons and `sw.js`; `immutable` for hashed `/assets`.
  - A 404, never a 200 stand-in page, for a file the build doesn't have.
  - `GET /health`.
- **The worker:**
  - `apps/web/src/install/swPolicy.ts`, the allowlist.
  - `sw.ts`, the worker, bundled per build by the plugin in `apps/web/vite.config.ts`, which stamps the build's version into `index.html` and `sw.js`.
  - `registerSw.ts`: registration when idle, and the update notice's state.
- **Guidance:**
  - `installState.ts`: the captured prompt, standalone detection, the path, and **Not now** as a device choice.
  - `components/mchezo/InstallUi.tsx`: the Home card, the iPhone steps sheet, the Settings row, and the calm-screen notices.
  - `styles/stage83.css`.
- **Where the notices show:**
  - "Can't reach Mchezo" and "A newer version is ready" appear on Home, Join, Host, the solo shelf and the library (outside a room).
  - Join and Host were added after the first offline probe: an invite link opened offline showed the Join form with no warning.
- **The prompt dismissed:** when the browser's prompt is dismissed, the card says "No problem, add it later from your browser's menu", because the prompt can't be shown twice. The first version showed nothing; `check-install` found it.
- **A room reopened offline:**
  - The "Rejoining your room… One moment" heading was hidden under the pinned connection banner, at 320 and 390 px (a pre-Stage 8.3 layout).
  - Stage 8.3 makes this screen what an installed app shows when reopened offline in a room, so its heading now starts below the banner's tallest form (`.mz-rejoining`).
  - Found in this stage's screenshots on `8b8a7ef`; `check-install` O2 fails 8 of 8 there (`docs/evidence/stage83-local/check-install-O2-on-8b8a7ef.log`).

### 7.2 Tested (Chromium; engine where marked)
- **Unit, `tests/stage83-install.test.ts` (25):**
  - The manifest and icons: sizes, alpha, no personal fields.
  - The exact-build allowlist: every API path, method and origin, plus future routes, unknown paths, other builds' files and queries.
  - Response validation: redirects, opaque, partial and error replies, another address, `no-store` and `private`, and HTML standing in for a file.
  - Old-cache deletion.
  - The install path.
  - The reachability probe: only `{"ok":true}` JSON counts; a sign-in page, `{}`, junk and a redirect don't.
  - The server's types, headers, 404s and `/health`.
- **`scripts/check-install.mjs` (116 checks), by section:**

| Section | What it covers |
|---|---|
| M | Chromium parses the manifest with no errors and reports **no installability errors** (engine, headless). The icons decode at their sizes, and the worker belongs to this build. |
| W | After a solo round, a casual room with a guest (two tabs) and the session, ledger, Memory Book and projection reads (all 200 with the seat's token), Cache Storage holds exactly one cache with 14 entries, each one of this build's files (engine). No page load is stored, the guest's `/join?code=` included. No cached body holds the room id, code or either token, and none of the API replies came from the worker. |
| O | Offline, Home, an invite link and the solo shelf say "Can't reach Mchezo … Nothing has started". Start shows no round. A room reloaded offline says it is rejoining; back online, it is the same seat. |
| O3 | A sign-in page answering `/health` counts as unreachable. The notice never gates play (Play solo still starts a round), and nothing polls `/health` while a screen sits there. |
| O2 | A room reopened offline: "Rejoining your room… One moment" sits below the connection banner at 320 and 390 px, with the page's font and each wide fallback (8 checks). |
| I | No card without a real path. The emulated prompt is suppressed, shown once when asked, "added" only on `appinstalled`, and "Not added" when dismissed. Nothing appears mid-round. The iPhone steps promise no data transfer and point to seat recovery, in both looks, with no overflow, 44 px targets and readable contrast. **Not now** holds after a reload (Settings keeps the steps), or only for the page when storage can't save it. Standalone mode hides the card. |
| S | With storage unavailable, the worker still registers and a round starts. |
| N | Deep links reload to the same screen, served fresh. |
| U | Two tabs and a real next build (feedback §1), as described below. |
| F | A next build missing a listed file, a sign-in page (200 HTML) or a redirect instead of a file, and storage quota denied (Chromium's own quota override): nothing half-made installs, no partial cache is left, the worker in charge (if any) carries on, and a solo round still starts. **Without static routing** (a worker built without it), every cached entry is still one of this build's files, and no API reply came from the worker. **F5** (§7.5): a new worker with this build's version fails to install, and the cache of the worker in charge stays whole; offline, it still opens its shell. |

Section U in detail:
- A plays a round on the old build throughout: never reloaded, still playing after B goes offline and comes back, with its files still served from its cache after the server drops them. No notice appears in the round.
- B reloads online: it gets the next build's page under the old worker, while the next worker waits, and offers no notice because it already is that build. None of the next build's files enter the old cache.
- B goes offline and reloads: it gets the old build's shell, whole and of one build (its HTML, scripts, styles and every asset), with "Can't reach Mchezo" and no update offer.
- Back online, B is offered the update. **Later** hides it. **Reload** on A's shelf reloads only A, and the old worker still controls: nothing claims the worker updated.
- Every old page closed: the next worker activates, the old shell cache goes, and **someone else's cache stays**. `localStorage` (look, content, solo seat) and a room seat survive.

- **Regression drivers rerun on the final code, 0 failures:**
  - `check-themes-seasonal` 251, `check-mobile-everyday` 134, `check-solo` 80, `check-solo-shelf` 58;
  - `check-casual` 30, `check-session-flow` 70, `check-lobby-mode` 71, `check-briefing` 43;
  - `check-audit-fixes` 50, `check-tv-spectator` 15, `check-errors` 5, `check-sessions` 23.
- **Pictures:** `docs/stage8/screenshots-83/` (`scripts/screenshot-stage83.mjs`). Its `cache-inventory.json` lists every Cache Storage entry and every API reply's source.

### 7.3 Spec feedback 6802191261, point by point
1. **A new page vs a newly activated worker:**
   - no `skipWaiting` or `claim`;
   - the notice is suppressed when the page already is the waiting build, and while the server can't be reached;
   - the next build's files never enter the old cache;
   - an old page keeps its files;
   - the two-tab test (U), with a complete old-build shell offline, activation only after every old page closed, and scoped cleanup.
2. **An exact-build allowlist:**
   - the build's own emitted list, fonts included;
   - no query-bearing file, non-GET, cross-origin, unknown path or API route;
   - a query-bearing navigation keeps its address, falls back to the canonical shell and is never stored;
   - responses are validated;
   - install is all-or-nothing, so the current worker stays usable;
   - the failure cases (F) cover a partial deploy, a sign-in page, a redirect and quota denied;
   - privacy is tested without static routing.
3. **Truthful degradation:**
   - `/health` counts only as `{"ok":true}` JSON within 4 seconds, with no redirect; `navigator.onLine` only starts a check;
   - nothing gates play and nothing polls;
   - **Not now** dismisses only the Home card;
   - no promise of moving seats or bests, and joining with a code is not presented as recovering a seat;
   - the synthetic prompt is labelled as not native evidence;
   - the platform claims were rechecked (§2).

### 7.4 Gates
- **The final candidate, `96b3970`** (fresh clones, clean tree, fingerprint `7f36233e758c`, 468 files; one after the other):
  - **fast** `20261111-181930-96b3970e-32718`: **PASSED** 5/5, 1,404 unit tests, 43 s;
  - **full** `20261111-182118-96b3970e-3648`: **PASSED** 85/85 in 31 min 11 s (predicted 23–55 min, about 30 min 02 s); `check-install` 113, `check-themes-seasonal` 251, `check-mobile-everyday` 134; no browsers or servers left behind.
- **Earlier candidates, superseded** (neither is a verdict on `96b3970`):
  - **`8b8a7ef`:** fast `20261111-173824-8b8a7ef3-11175` PASSED. Its full gate `…-174012-…` was stopped by me for the rejoin fix (CANCELLED).
  - **`69a7dc1`:** fast `20261111-174819-69a7dc19-17727` PASSED. Its full gate `…-175010-…` was stopped by me when spec feedback 6802191261 was read (CANCELLED).
- Raw evidence for all six runs is in `docs/evidence/gate-runs/<run>/`.
- **Screenshots:** `docs/stage8/screenshots-83/`, 34 shots on `96b3970`, and `cache-inventory.json`.

### 7.5 Found after the completed report: a worker-only change kept the build's version (D-S83-08)
- **What was wrong, on `96b3970`:**
  - The build version hashed the app bundle and the public files, but not the worker's own code.
  - So a change only to `sw.ts` or `swPolicy.ts` made a new `/sw.js` (different bytes, so the browser installs it) under the **same** version, and so the same cache name as the worker in charge.
  - If that install then failed (one file missing, a sign-in page, storage full), its clean-up deleted the cache the worker in charge relied on.
  - Offline, that worker then had no shell: a bare "Can't reach Mchezo" page instead of the app and its own notice.
  - Online play was never affected: files fall back to the network.
- **Reproduced first, in the engine:**
  - Two builds of `96b3970`'s code, differing only in the worker, gave the same version `77f9ad4250045e33` and different `sw.js` bytes.
  - With the first worker in charge (14 cached entries) and the second failing to install, Cache Storage was left empty, and an offline reload showed the bare page.
- **The fix:**
  - `apps/web/swBuild.ts` builds the worker with a stand-in version, hashes its code with everything else the build ships, then writes the version in. A worker-only change is now a new version (in the reproduction, `afad7cd5c0a233ea` became `b9dcd95654740e14`), and an unchanged build still gives the same worker, byte for byte.
  - As a second guard, an install deletes its cache only if it created it, so a same-name cache that was already there is never its to remove.
- **Tests:**
  - **Unit** (`tests/stage83-install.test.ts`, 5 new):
    - the same build gives the same version and worker;
    - a worker-only change gives a new version (this test fails when the worker's code is left out of the hash);
    - a bundle or public-file change gives a new version;
    - the worker carries its version with no stand-in left, and lists exactly the build's files;
    - the install guard.
  - **Engine** (`check-install` F5, 3 checks): a worker with the same version but different bytes fails to install. The cache of the worker in charge stays whole, and offline it still opens its shell.
    - On a build of `96b3970`'s code, two of the three fail: 14 entries before and 0 after, and no shell.
    - On the fixed code, all three pass.

