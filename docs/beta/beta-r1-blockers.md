# Beta R1: launch blocker matrix

**Scope:** the readiness checks the owner's priority update asked for (6896572377 on #42): dependencies, secrets and fixtures, HTTP and WebSocket isolation, origin checks, recovery and abuse limits, data and log privacy, external requests, and the packaging and startup items. Plan and estimate: `docs/beta/beta-r1.md`.

**Base and revision:** the matrix was taken on `1955c28` (#41's head). Each fix here has a failing test or a reproduction on `1955c28` first. The exact SHA these rows are re-checked on is the one the final gates run on (listed in `docs/evidence/beta-r1-local/README.md`).

**Statuses:**
- **Fixed here:** changed in this branch, with a test.
- **In place:** it existed before, and is re-checked here.
- **Accepted risk:** a known gap, bounded, with the reason and what would remove it.
- **Operator step:** done when the beta is set up on a host, not in code.
- **Open:** not done; it blocks the launch or the claim named in the row.

The evidence files are in `docs/evidence/beta-r1-local/`.

## 1. Dependencies

| # | Finding | Status | Evidence |
|---|---|---|---|
| D-1 | **The production audit at `1955c28`:** 3 advisories (`vite` high, `esbuild` moderate, `zod` high). `vite`, its React plugin and the `@types` packages were listed under `dependencies`, so a production install would have carried the build tooling. | **Fixed here:** only `ws` and `zod` are runtime dependencies; everything else moved to `devDependencies`. No version changed: 170 lock entries gained `dev: true` and nothing else. A production install (`npm ci --omit=dev`) now installs exactly `ws` and `zod`, and the release check proves it on every run. | `npm-audit-omit-dev-1955c28.json`; `npm-audit-omit-dev-after-dependency-split.json`; release check step I |
| D-2 | **`zod` 3.25.76, high (GHSA-mrhx-c7xc-m3w5, CVE-2023-54404):** memory exhaustion while validating oversized constrained collections. It affects versions below 4.6.6, and the only fix is the zod 4 major. It is shipped and reachable: every request body and WebSocket intent is validated with zod. | **Accepted risk for the beta**, bounded by the 64 KiB cap on every HTTP body and, from this branch, on every WebSocket message (B-01). The worst case at the cap is a 65,535-byte array of 32,767 one-character strings: **+10 to 12 MB of heap and 47 to 62 ms** per request (measured). The per-address limits and the beta gate (B-04) cut the request rate further. **To remove it:** a separate zod 4 migration slice with its own full gate. It isn't done here, because it touches every schema. | `zod-worst-case.mts.txt`, `zod-worst-case.out.txt` |
| D-3 | **The development tree:** 16 advisories (2 critical, 2 high, 12 moderate) in `vitest`, `tinypool`, `vite`, `esbuild`, `eslint`, `typescript-eslint` and `minimatch`. | **Not shipped:** none of them is in the package or the production install. The risky parts (Vitest's UI server, Vite's dev server) are never run on the host. The upgrade order in `docs/deploy/npm-audit-2026-11-10.md` stands; no `npm audit fix --force` was run. | `npm-audit-all-including-dev.json` |

## 2. Secrets and test fixtures

| # | Check | Status | Evidence |
|---|---|---|---|
| S-1 | **Only what runs is shipped.** The release package is built from the checked-out revision (`scripts/release/pack.mjs`). | **Fixed here.** It holds 144 files: `dist/` (the compiled server), `apps/web/dist/` (the built app), `content/packs/` and `content/reference/`, the two package files and `release.json`. There are no tests, scripts, docs, data, `node_modules` or env files in it. | `scan-release.out.txt`; release check step P |
| S-2 | **The editorial pilot batches** (`content/pilot/`) were copied with `content/`, although nothing loads them at run time. | **Fixed here:** excluded from the package; they stay in the repository. | release check step P |
| S-3 | **Secret-shaped strings:** private keys, AWS, GitHub, OpenAI-style and Slack tokens, and long literals assigned to names like `apiKey`, `secret`, `password` or `token`. | **None** in the package, and none in the 10,692 tracked files. The pattern is checked against samples first (it matches the five secret shapes and not `const password = input.value`), and the package check runs it on every release. | `scan-release.mjs.txt`, `scan-release.out.txt` |
| S-4 | **Content approvals and the test mode.** | **In place:** there is no `content/approvals.json` in the repository, so the package ships none. The content test mode, the lifecycle scale and the content-directory override are refused in production (each exits 2). Official play therefore stays exactly as gated as in development: no approval is manufactured. | release check step R |
| S-5 | **The beta access code** (a secret, from the environment). | **Fixed here:** it is never logged (the release check searches the server's whole output for it). It is never stored in the cookie (an HMAC of it). It is compared in constant time. It must be at least 12 characters, or the start is refused. | `tests/beta-r1.test.ts` (B-04); release check step S |
| S-6 | **Backups** hold the family's names, rooms and Memory Book. | **Fixed here:** the backup folder is private (0700, files 0600) and is refused inside the data directory. `backups/` is git-ignored, and the release runbook keeps backups off the web root and out of git. | `tests/beta-r1-data.test.ts` |

## 3. HTTP and WebSocket

| # | Finding | Status | Evidence |
|---|---|---|---|
| B-06 | **One malformed WebSocket frame crashed the whole server (the most serious finding).** Any client that can open a socket (a public TV socket needs only the room id) could end every room's game night by sending invalid UTF-8, a bad opcode or an oversized frame. The library emits `error` on the server's socket, and with no listener that was an uncaught exception. | **Fixed here:** every server socket has an `error` listener. The library closes that one socket (1007, 1009 or 1002), and the server keeps serving. | reproduced on `1955c28`: `repro-ws-bad-frame.mts.txt`, `repro-ws-bad-frame-1955c28.out.txt` (uncaughtException) and `-fixed-tree.out.txt`; test before and after: `b06-before.log`, `b06-after.log` |
| B-01 | **WebSocket messages had no size cap below the library's 100 MiB default,** while HTTP bodies were capped at 64 KiB. | **Fixed here:** `maxPayload` is 64 KiB (`MAX_MESSAGE_BYTES`, shared with HTTP), so a bigger message closes the socket with 1009 before anything parses it. An interim run (the cap without B-06's listener) showed the two must ship together: the oversized message then became an uncaught exception. | `b01-before.log`, `b01-after.log`, `b01-cap-before-b06-interim.log` |
| B-03 | **No Origin check:** another website could call the API or open a socket from a family member's browser. | **Fixed here, required in production:** with `MCHEZO_PUBLIC_ORIGIN` set, a request or handshake whose `Origin` is another site gets 403 (`FOREIGN_ORIGIN`). Session tokens travel in headers and the WebSocket subprotocol, never in cookies or URLs, so this is defence in depth, and it keeps the beta cookie from being used by another site. | `tests/beta-r1.test.ts` (B-03) |
| B-04 | **No access gate:** anyone with the address could create rooms and use the server. | **Fixed here, required in production** (unless `MCHEZO_PUBLIC_ACCESS=open` is set on purpose). One shared access code, from the environment, opens the site for 30 days (an HttpOnly, SameSite=Lax cookie, Secure over HTTPS). It covers pages, the API **and WebSocket handshakes** (401 without it). Only `/health`, `/beta` and `/beta/enter` are open. Wrong codes: 10 per address per 15 minutes. The return path never leaves the site. | `tests/beta-r1.test.ts` (B-04); release check step S |
| B-05 | **Per-device limits behind a reverse proxy:** every request arrives from the proxy's address, so all family members share one budget. One person's wrong recovery codes would lock out the others, and the per-address limits would protect nothing. | **Fixed here:** `MCHEZO_TRUST_PROXY=1` takes the address the proxy itself appended to `X-Forwarded-For`. Addresses a client claims for itself are ignored. It is off by default (direct connections, as before). | `tests/beta-r1.test.ts` (B-05) |
| B-07 | **Around the proxy (found while writing the architecture):** B-05 trusts the proxy's `X-Forwarded-For` entry, but the server listened on every interface. A client reaching the Node port directly could skip HTTPS and claim a new address on every request. In the reproduction on `255a5c9`, 15 wrong access codes sent straight to the server, each claiming another address, all got 401; the 10-per-15-minutes limit never triggered. | **Fixed here:** `MCHEZO_LISTEN_HOST` sets the listen address. Production with a trusted proxy refuses to start without it (exit 2). With `127.0.0.1`, the same 15 requests are refused at the connection (`ECONNREFUSED`). The release check proves it from this machine's own network address. Development still listens on every interface, so phones on the Wi-Fi can play. | `repro-direct-around-proxy.mts.txt`, `repro-b07-255a5c9.out.txt`, `repro-b07-fixed-tree-127.0.0.1.out.txt`; release check steps S and R |
| B-02 | **No security headers.** | **Fixed here:** every response sends `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and `frame-ancestors 'none'`. | `tests/beta-r1.test.ts` (B-02) |
| C-1 | **Role isolation:** what each player, host, cohost, spectator and TV may see and do. | **In place:** per-player projections, so a TV or spectator never receives answers, hidden roles or tokens. TV and spectator sockets cannot submit intents. Forged score, actor and room intents are refused. Replayed intents return the original result. Tokens never go in URLs. | `tests/privacy.test.ts` (14), `privacy-sprint3` (3), `security` (5), `spectator` (7), `stage91-bank-privacy` (1): re-run in the full gate |
| C-2 | **Recovery and reconnect.** | **In place:** recovery codes and host-assisted recovery, wrong codes limited per device and room (5), per room (30) and per device (20) per 15 minutes; host-assisted requests limited to 5 per device per 15 minutes. B-05 makes "per device" true behind a proxy. WebSocket resume and reconnect work; a restart restores rooms from disk. | `tests/recovery.test.ts` (20), `host-recovery` (4), `ws-reconnect` (3), `persistence` (19); release check step L |
| C-3 | **Abuse limits.** | **In place, plus B-01 and B-04:** 20 joins per room per minute; reaction and nudge limits; 64 KiB on every HTTP body and WebSocket message; wrong beta codes limited. | as above |
| C-4 | **Room creation has no rate limit,** so a client with access could fill the disk with rooms. | **Accepted risk for a gated family beta:** only people with the access code can create rooms. Retention archives old rooms (section 4). A full disk fails a save cleanly and never corrupts a saved room (D-6). **To remove it:** a per-address room-creation limit before access is widened beyond the family. It isn't added here because the browser checks create many rooms from one address, so it needs a test-only switch, which is a larger change. | `tests/beta-r1-data.test.ts` (full disk) |
| C-5 | **No full Content-Security-Policy** (`default-src 'self'`). | **Accepted risk:** nothing in the shipped code makes an outbound request (section 5), so a strict CSP would be a second guard, not a missing one. **To remove it:** a CSP slice that checks every screen, because the PDF and share-image exports use `data:` and `blob:` URLs and the app sets inline styles. | `url-context.out.txt` |

## 4. Data, persistence and the release folder

| # | Check | Status | Evidence |
|---|---|---|---|
| D-4 | **The data must live outside the release.** It used to default to `./data`, inside the release directory, so a new release would start empty or overwrite it. | **Fixed here:** production refuses a missing or relative `MCHEZO_DATA_DIR`, and one inside the release folder (each exits 2, writing nothing). | release check step R |
| D-5 | **One writer per data directory.** | **Fixed here:** `server.lock` holds the owner's pid, and a second server on the same data is refused. A stale lock (a dead process, or the same pid in a container) is taken over. SIGTERM releases the lock. | `tests/beta-r1.test.ts` (DataDirLock); release check step L |
| D-6 | **A full disk.** | **Fixed here (tested, not changed):** writes are atomic, so a failed save leaves the last good snapshot. The request answers 500 with a plain reason, the server stays up, and the change is saved with the next successful save. | `tests/beta-r1-data.test.ts` |
| D-7 | **Backup and restore, into an isolated folder.** | **Fixed here:** `datatool backup` copies the data with a SHA-256 manifest and verifies it. It refuses while a server is running, unless `--allow-running`. `restore` verifies every hash and decodes every room before copying, and only into an empty folder: it never overwrites. Restored data is served by a fresh server. | `tests/beta-r1-data.test.ts`; release check step D |
| D-8 | **Rollback compatibility.** | **Passed both ways:** a room written by this branch was read and changed by `1955c28` (a third player joined), then read again by this branch. Nothing was quarantined, and every player was there. The lock file is ignored by the old release, because it only loads room file names. | `rollback-compat.mjs.txt`, `rollback-compat-wtb1-vs-1955c28.out.txt` |
| D-9 | **Bounded retention, never deleting.** | **Fixed here:** `datatool prune` lists rooms idle for at least N days (N ≥ 7) as a dry run. `--apply` moves them, only with the server stopped, into `<data>/archive/<time>/`. Deleting an archive is a person's decision, after a backup. | `tests/beta-r1-data.test.ts` |

## 5. Logs, privacy and external requests

| # | Check | Status | Evidence |
|---|---|---|---|
| P-1 | **What the server logs:** room ids, file names, error messages, the restore report and the start line. | **In place:** no tokens, codes, player names, answers or Memory Book text. The access code is checked absent on every release check. | `grep console.` over `src/server` (listed in the evidence README) |
| P-2 | **Outbound requests from the server.** | **None:** no `fetch`, `http(s).request`, `net.connect` or DNS call in the compiled server. No AI, analytics or telemetry. | `url-context.out.txt` |
| P-3 | **External URLs in the shipped web app.** | **None is requested:** each URL is a licence comment, an SVG/MathML/XHTML namespace, React's error-page link (text only), or the service worker's placeholder base (`mchezo.invalid`, never fetched). One is reachable only in theory: jsPDF's `pdfobject` CDN URL, used only by `output("pdfobjectnewwindow")`, which the app never calls (it calls `save`). Fonts are bundled. | `scan-release.out.txt`, `url-context.out.txt` |
| P-4 | **Proxy access logs:** session, spectator and recovery tokens travel in request headers. | **Operator step:** the example proxy configuration writes no access log. If one is turned on, those headers and `Cookie` must be filtered out (`docs/beta/beta-r1-architecture.md`). | — |

## 6. Packaging and startup

| Item from the brief | Status | Evidence |
|---|---|---|
| **No `tsx`** | **Fixed here:** `npm start` runs `node dist/server/serve.js`, and the package starts on plain node. | release check step S |
| **Reproducible runtime install and start** | **Fixed here:** `npm ci --omit=dev --ignore-scripts` from the package's own lock file installs `ws` and `zod`, then it starts. | release check steps I and S |
| **Shipped content and assets** | **Fixed here:** content packs, Sprint references, the built app (with its fonts, icons, manifest and service worker) and the compiled server. | release check step P |
| **Production test-mode refusal** | **In place, re-checked:** the refusals, plus the new ones for the data directory, public origin, access code and listen address. | release check step R |
| **Health and build revision** | **Fixed here:** `/health` returns `{ ok: true, revision }`, from `release.json`, then `MCHEZO_BUILD_REVISION`, then `"dev"`. Nothing else. | release check step S |
| **Graceful shutdown** | **In place, re-checked:** SIGTERM closes the server and frees the lock; after a `kill -9` the next start takes the stale lock over; the room survives both restarts. | release check step L |
| **Single writer** | **Fixed here** (D-5). | |

## 7. What still blocks a launch

These aren't code defects in this branch, but the beta must not open until each is done or explicitly waived by the owner.

1. **A host:** ChatGPT selects it and the owner approves it, within $0. The app needs one long-lived Node 22 process, a persistent disk, WebSockets and HTTPS (`docs/beta/beta-r1-architecture.md`). None is chosen or provisioned here.
2. **The owner's independent private Codespace audit** of the exact SHA to be released, as the brief requires before any release clearance.
3. **Real phones:** every browser check so far is Chromium emulation. Before the beta opens, the checklist in `docs/REAL_DEVICE_TESTING.md` needs at least one iPhone (Safari) and one Android phone (Chrome), through the real HTTPS proxy, including the access gate, a reconnect and the TV.
4. **The release steps run once on the real host:** a backup, the deploy of the reviewed package, the rollback, and a restore drill (`docs/beta/beta-r1-release.md`).

**Recommended, not blocking a gated family beta:** the zod 4 migration (D-2), a per-address room-creation limit (C-4), and a full CSP (C-5).
