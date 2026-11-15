# Beta R1: local runs (every run, failures included)

**What these are:** local runs during the readiness work, before the gates. They are not gate verdicts; the gates are listed at the end. "Revision" is the tree the run used; `-dirty` means uncommitted changes on top of it (the work in progress). Scripts are saved as `.txt` so nothing here runs by accident.

## Dependencies (matrix §1)

| File | Revision | What it shows |
|---|---|---|
| `npm-audit-omit-dev-1955c28.json` | `1955c28` | **Before:** 3 production advisories (`vite` high, `esbuild` moderate, `zod` high), with 106 production packages. |
| `npm-audit-omit-dev-after-dependency-split.json` | this branch | **After the split:** 1 (`zod` high), with 3 production packages. |
| `npm-audit-all-including-dev.json` | this branch | The whole tree: 16 (2 critical, 2 high, 12 moderate), all in development tooling that isn't shipped. |
| `zod-worst-case.mts.txt`, `zod-worst-case.out.txt` | this branch | GHSA-mrhx-c7xc-m3w5 at the 64 KiB cap: a 65,535-byte array of 32,767 one-character strings costs +10.0 MB of heap and 62 ms (bounded schema), or +12.0 MB and 47 ms (unbounded). |

## Secrets, fixtures and external requests (§2, §5)

| File | Revision | Result | What it shows |
|---|---|---|---|
| `scan-release.mjs.txt`, `scan-release.out.txt` | `255a5c9-dirty` | 0 found | The package's 144 files by folder. The secret pattern's self-check (5 shapes match; `const password = input.value` doesn't). No secret-shaped string in the package or in the 10,692 tracked files, and no tracked file with a sensitive-looking name. Every external host in the shipped code. |
| `url-context.mjs.txt`, `url-context.out.txt` | same package | none requested | Each external URL with its surroundings: licence comments, XML namespaces, React's error-page link, the service worker's `mchezo.invalid` placeholder base, and jsPDF's `pdfobject` CDN URL (only used by an output mode the app never calls). There are no outbound request calls in the compiled server. |

## HTTP and WebSocket (§3)

| File | Revision | Result | What it shows |
|---|---|---|---|
| `repro-ws-bad-frame.mts.txt`, `repro-ws-bad-frame-1955c28.out.txt` | `1955c28` | **server crashed** | **B-06:** one invalid-UTF-8 frame on a public TV socket raised an uncaught exception that ended the server process. |
| `repro-ws-bad-frame-fixed-tree.out.txt` | `ffec293` | survives | The same frame closes that socket (1007), and the server keeps serving. |
| `b01-before.log` | before the cap | **1 FAIL**, 1 pass | **B-01:** a 100 KiB message wasn't refused (the library's 100 MiB default). |
| `b01-after.log`, `b01-cap-before-b06-interim.log` | the cap, without B-06's listener | 2/2 and 12/12 passed, but **1 unhandled error** each | The oversized message became an uncaught "Max payload size exceeded" in the server's own socket. That is B-06 seen from B-01's side, and in a real process it would have ended the server. It shows the two fixes must ship together. |
| `b06-before.log` | the test before the listener | 13/13 passed, **2 unhandled errors** | Vitest caught the crash that `repro-ws-bad-frame` shows. |
| `b06-after.log` | `ffec293` | 13/13, no errors | |
| `repro-direct-around-proxy.mts.txt`, `repro-b07-255a5c9.out.txt` | `255a5c9` | **gap** | **B-07:** with a trusted proxy and the server listening on every interface, 15 wrong access codes sent straight to the server's network address, each claiming another address, all got 401. The limit never triggered. |
| `repro-b07-fixed-tree-127.0.0.1.out.txt` | `5ee2e78`'s tree | refused | With `MCHEZO_LISTEN_HOST=127.0.0.1`, the same requests get `ECONNREFUSED`. |
| `beta-r1-tests-current.log` | `255a5c9-dirty` | 22/22, no errors | `tests/beta-r1.test.ts` and `tests/beta-r1-data.test.ts` before B-08. |

## Data (§4)

| File | Revision | Result | What it shows |
|---|---|---|---|
| `data-tests-run1.log` | `8dfe323-dirty` | 6/6 | Backup and restore round trip, refusals, tamper detection, no overwrite, retention, and a full disk. |
| `rollback-compat.mjs.txt`, `rollback-compat-wtb1-vs-1955c28.out.txt` | `8dfe323-dirty` with `1955c28` | ROLLBACK COMPAT PASSED | This branch writes a room with two players and a game. `1955c28` reads it (ignoring `server.lock`), and a third player joins. This branch reads that back. Nothing was quarantined. |
| `b08-before.log` | `5ee2e78` + the new test | **1 FAIL** | **B-08:** ENOENT on `server.lock` for a data directory that doesn't exist yet. |
| `b08-after.log` | `fe9319e`'s tree | 23/23 | The lock creates the directory (0700). |
| `release-drill.mjs.txt` | — | — | The packaged drill: pack two revisions, install them as `releases/<sha>` with a `current` link, stop, back up, switch, start, play, roll back, and restore the pre-deploy backup into a new folder. |
| `release-drill-run1.log` | PREV `8dfe323`, NEW `5ee2e78` | **FAILED** | The previous release crashed on its first start: **B-08** (the data directory didn't exist yet). |
| `release-drill-run2.log` | PREV `8dfe323`, NEW `fe9319e` | **FAILED 1** (13 passed) | **The drill's own mistake:** its "nothing quarantined" check was case-insensitive, so it matched the healthy line "0 not loaded". The rolled-back server's output shows nothing quarantined and three players. |
| `release-drill-run3.log` | same | **did not run** | **My quoting slip** while fixing that check put a newline inside a regular expression (a SyntaxError). |
| `release-drill-run4.log` | same | **RELEASE DRILL PASSED** (14/14) | Each package's revision matched a clean checkout. Both directions worked: the previous release read the new one's data. The pre-deploy backup, restored into a new folder, served the room as it was (two players), and the live data was untouched (three players). |

## The release package check, run locally (§6)

| File | Revision | Result | Notes |
|---|---|---|---|
| `release-check-local-run1.log` | `ffec293-dirty` | **FAILED 1** (25 passed) | **The check's own count:** npm leaves empty `@scope` folders behind after `--omit=dev`, and the check counted them as packages. It now counts folders with a `package.json`; the install really was `ws` and `zod`. |
| `release-check-local-run2.log` | `ffec293-dirty` | PASSED (26) | |
| `release-check-local-run3.log` | `8dfe323-dirty` | PASSED (31) | With the data-tool steps. |
| `release-check-local-run4.log` | `255a5c9-dirty` | PASSED (33) | Adds the secret scan and the no-approvals/no-pilot check. |
| `release-check-local-run5.log` | `255a5c9-dirty` | PASSED (35) | Adds the B-07 checks (refused from this machine's network address; the start refused without a listen address). |
| `release-check-local-run6.log` | `fe9319e` (clean) | PASSED (36) | Adds the fresh-host start (B-08). |

## Gates (one run on one revision each)

Listed in the completed report on #43 and added here in a docs-only commit after the runs.
