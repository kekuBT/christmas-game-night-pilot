# Beta R1-R, third round: zod's advisory where network input reaches it (review 6903002137)

**What these are:** local runs for the exposure assessment of zod 3.25.76's GHSA-mrhx-c7xc-m3w5. They are not gate verdicts; the gates are at the end. Scripts are saved as `.txt` so nothing here runs by accident. Paths under `/tmp` are throwaway folders.

**Isolation:**
- **No overlap:** every run below ran on its own, one after another. Nothing else ran meanwhile: no gate, test or driver.
- **Each child process had a capped heap** (`--max-old-space-size`), its own port on 127.0.0.1 and its own throwaway data folder.
- **The load was bounded:** at most 900 requests of at most 64 KiB per server run.

**The two revisions measured:**
- **`33b673d`:** the reviewed code, built in the worktree before any change. `inventory-33b673d.out.txt` was rebuilt later from a clean clone of `33b673d`.
- **`456cb0d`:** the fix. It was measured on the worktree's build made just before the commit, which is byte-for-byte identical to a clean build of `456cb0d` (`diff -r`, checked). The only differences from `33b673d`'s build are `http.js` and the new `boundedArray.js`.

## The advisory
GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404; high; CWE-770). Read at <https://github.com/advisories/GHSA-mrhx-c7xc-m3w5> on 2026-11-15.
- **The mechanism:** in its words, zod "accumulates every validation issue for each failing element with no cap or early termination".
- **The fix:** zod 4.6.6's fix (commit `a0ebf97`, "check array, set and map size bounds before parsing elements") says `.max()`, `.length()` and `.size()` "ran after every element was walked". It now checks size before parsing any element.
- **Versions:** the affected range is below 4.6.6. The fix touches only zod 4's code; zod 3's open issue colinhacks/zod#6653 says `.max()` there "doesn't stop parsing".
- **Scores:** `npm audit` reports CVSS 7.5; the advisory page shows CVSS v4 8.2.

## 1. The map: what network input reaches
`inventory.mjs.txt` walks every schema the server parses network input with. That is LocalServer's 11 static schemas for the HTTP routes, plus `IntentSchema` for intents over HTTP and WebSocket. It lists every collection.

| Schema (route) | Collection | Limit | Who can send it |
|---|---|---|---|
| `FamilyQuestionSchema` (`POST /rooms/:id/family`) | `options`: array of strings | max 8 | **any seat holder** in any room |
| `PartyBodySchema` (`POST /rooms/:id/party`), inside a `z.union` | `plan.items`: array of objects | min 1, max 8 | **any seat holder** in any room (the host check comes after the parse) |
| `GameSettingsSchema` (`POST /rooms/:id/game-settings`) | `settings`: record of unknown | none | any seat holder |
| `IntentSchema` (`POST /rooms/:id/intents`, WebSocket messages) | `payload`: record of unknown | none | any seat holder |
| the other 8 schemas | none | | |

**What is in front of each:**
- **The beta cookie:** every route but `/health`, `/beta` and `/beta/enter` needs it (B-04).
- **Size:** bodies and WebSocket messages are capped at 64 KiB (`MAX_MESSAGE_BYTES`, B-01).
- **A session:** the room routes need a session token. Anyone with the cookie can make a room and take its seat, so anyone with the beta code can reach both arrays.
- **No rate limit** on these routes. Only joins, reactions, nudges and recovery have one.

**Responses:** a failed parse answers a fixed message (`INVALID_QUESTION`, `INVALID_PLAN`; at most 106 bytes). Issues are never sent, so the cost is memory and time only.

**Not network-reachable** (checked in the code):
- `RoomSnapshotSchema`: only when loading files from disk.
- `CupRecordSchema` and `QualificationPolicySchema`: `configureCup` isn't called by any route.
- The Memory Book schemas: they check facts the server derives from a finished game. A note's `sourceEventIds` is checked by hand, not by zod.
- The content schemas: they run at start.

**The records can't build an issue per entry:** their keys are plain strings and their values `unknown`. They are walked in full, which costs about 8–12 ms and +4.5 MB of transient heap at the cap, but they produce no issues.

## 2. Isolated measurements, capped child processes
`iso-run.mjs.txt` runs each input in its own child: three times at 256 MB to measure (the median is kept), then a sweep for the smallest old-space cap at which the child still finishes, with a 1 MB semi-space.

| File | Revision | Result |
|---|---|---|
| `iso-33b673d.out.txt` | `33b673d` | **Both arrays walk every element.** At the cap, 32,747 wrong options made 32,748 issues, and 32,730 wrong items made one union issue holding 32,733.<br>• **Cost:** 44–50 ms, +13–16 MB of heap, 8 MB still held by the result.<br>• **Heap needed:** the smallest old space that finishes is **24 MB, against 12 MB** for a valid question.<br>• **Nesting is never worse:** zod stops at an element's first type mismatch, so nested and deep arrays give 1 issue per element at most, or 1 in total. |
| `iso-456cb0d.out.txt` | `456cb0d` | **Every input to the two arrays:** 1 issue (the union adds 3), 1.4–2.4 ms, ≤ 0.1 MB, and the same heap as the control within the sweep's 1 MB step.<br>• **The synthetic reference** (Beta R1's `z.array(z.string()).max(8)` on the whole body, which no route uses) still makes 32,768 issues: zod itself is unchanged.<br>• **Sweep noise:** that reference finished at 20 MB here and 24 MB on `33b673d`, with identical code, so the sweep is good to about ±4 MB. |
| `inventory-33b673d.out.txt`, `inventory-456cb0d.out.txt` | both | The map above. After the fix both arrays show "LENGTH CHECKED FIRST". |

## 3. Through the real server, capped
`srv.mjs.txt` runs the built server (`dist/server/serve.js`) in a child, with `--max-old-space-size`, `--trace-gc` and a preloaded memory sampler (`heapwatch.mjs.txt`, which changes nothing in the server).
- **Setup:** the beta gate is on. One client enters it, makes a casual room, takes its seat and adds 10 valid questions.
- **Sequential:** 100 of each of 5 worst bodies, one at a time.
- **Concurrent:** 16 clients × 25 at once, while a bystander asks `/health` every 50 ms.
- **Afterwards:** a valid question and a valid lineup, and the room's state.

| File | Revision, old space | Result |
|---|---|---|
| `srv-trial-256MB-console.txt` | `33b673d`, 256 MB | **FAILED (the driver's own error):** it added 20 questions, and a writer may add 15, so its last valid question got 409. Everything else as below. With a loose limit, V8 let garbage reach 63 MB before collecting. |
| `srv-33b673d-cap32.out.txt` | `33b673d`, 32 MB | **PASSED:** all 900 worst bodies got 400, the server stayed up, the heap went back to 11.5 MB, and valid requests worked afterwards with nothing changed.<br>• **Sequential latency:** p50 46–90 ms.<br>• **Concurrent:** 400 requests took 25 s.<br>• **The bystander:** waited **p50 553 ms, max 1.0 s** for `/health`. |
| `srv-33b673d-cap24-run1-excerpt.txt` | `33b673d`, 24 MB | **FAILED: the server died** during the first worst-case batch, at about the 19th body (an estimate from the bytes sent). That driver had no handler for a dead server, so only its crash was printed. The file was overwritten by run 2; this excerpt is the session's console. |
| `srv-33b673d-cap24-run2.out.txt` | `33b673d`, 24 MB | **FAILED: the server died** at request 115, the 103rd worst-case body: `FATAL ERROR: Reached heap limit`, SIGABRT. Its last collection found **27 MB live during a validation, against about 13 MB at rest**. |
| `srv-456cb0d-cap24.out.txt` | `456cb0d`, 24 MB | **PASSED:** all 900 got 400, the server stayed up, valid requests worked afterwards and the room was intact.<br>• **Sequential latency:** p50 2–4 ms.<br>• **Concurrent:** 400 requests took 0.68 s.<br>• **The bystander:** p50 21 ms. |
| `srv-456cb0d-cap32.out.txt` | `456cb0d`, 32 MB | **PASSED**, the same: p50 2–4 ms, 0.60 s for the 400, the bystander at p50 17 ms. |

**What a validation cost, before the fix:**
- **Memory doesn't add up:** a validation is synchronous and its issues are dropped once the 400 is sent. Requests and clients don't add up, because only one validation's issues are alive at a time. Sixteen clients peaked no higher than one: about 33 MB sampled against 35 MB.
- **What one request needs:** its own peak, about 14 MB of live heap above a server at rest. That is only fatal when the heap limit is within about that of the live set, like the 24 MB runs.
- **For scale:** this 16 GB container's default heap limit is 2,096 MB. The real host's limit isn't known; it depends on its memory.
- **The CPU cost was real:** 50–90 ms of the server's only thread per request. One family member could slow everyone else's game to about a second per action for as long as they kept sending.

## 4. Tests (`tests/beta-r1r-zod.test.ts`)
| File | Revision | Result | What it shows |
|---|---|---|---|
| `zod-tests-before-fix-run1.log` | `33b673d` + the new test file and `boundedArray.ts` (not yet used) | **6 FAIL, 1 pass** | **The four expected failures:**<br>• the guard found two arrays walked in full;<br>• 32,000 elements were read where 0 should be (×2);<br>• 32,748 issues at the cap.<br>**Two failures were bugs in the test itself:**<br>• the Family Questions generator made only 15 valid bodies, below its own threshold of 50;<br>• the HTTP test sent 8 answer options, but the room accepts at most 4 (`FAMILY_LIMITS.maxOptions`; zod's 8 is only the outer bound). |
| `zod-tests-before-fix-run2.log` | the same, with the two test bugs fixed | **4 FAIL, 3 pass** | Exactly the four that show the walk. The two compatibility tests and the HTTP test pass before and after, as they must. |
| `zod-tests-after-fix.log` | `456cb0d`'s source | **7/7** | |
| `focused-tests-after-fix.log` | the same | **6 files, 88/88** | Family Questions, Quick Party, Cup lineups, Finish, Beta R1 and the new file. |

Typecheck and lint of the changed files: no output, exit 0.

## Gates (one run on one revision each, both on `456cb0d`)
| Run | Kind | Verdict | What ran |
|---|---|---|---|
| `20261115-233420-456cb0de-5276` | targeted | **PASSED (exit 0)**, 8/8 steps, 3 m 10 s | build-web, preflight, `check-family-questions`, `check-quick-party`, `check-session-flow`, `check-release-package` (RELEASE PACKAGE PASSED), `check-beta-gate-https` (HTTPS BETA GATE PASSED), `check-beta-gate` |
| `20261115-233744-456cb0de-6799` | fast | **PASSED (exit 0)**, 1 m 15 s | typecheck, lint, the web build and every unit test: 161 files, **2046/2046** (2039 plus the 7 new) |

- **No other gate ran on `456cb0d`,** and none failed or was stopped. They ran one after the other, with nothing else running.
- **No full gate.** The production change is two request schemas. Both are proven to give the same verdict and the same parsed value as before, on 8,000 generated bodies and through the server. Every unit test ran, and so did the browser drivers that post to both routes (Family Questions, Quick Party, the session flow) and the packaged release.
- **Logs:** `docs/evidence/gate-runs/<run id>/`.
