# Beta R4 W2 preparation: local evidence for the W2 workload tool (handoff 6921505856, repaired for reviews 6922818863, 6924352924 and 6927653761)

**Where it ran:** this session's machine. The target was the packaged image from `deploy/render` (`cgn-render:check`, built in [the package evidence](../beta-r4-render-package/README.md) from a local rebuild of `7097ac2`), with these settings:
- production mode, the throwaway data folder `/var/data/cgn-w1`;
- a throwaway access code generated per run;
- `MCHEZO_TRUST_PROXY=1`, and the configuration authorized with `cgn-authorize`;
- behind `scripts/beta/render-like-proxy.mjs`: TLS for `localhost` with a per-run certificate, and an appended `X-Forwarded-For`.

No Render, no account, no real data. **This is protocol and load evidence from synthetic clients, on one machine.** It is not Render (no Render CPU or memory figures), not a browser and not a native device. W2 on Render is ChatGPT's, after W1: see [render-w2.md](../../beta/render-w2.md), which also has the gap analysis.

## Repair 3 for review 6927653761: the boundary test's fixture owns its sockets
**The finding:** on the pinned Node 22.16.0, the boundary test's socket-redirect case failed with an uncaught `read ECONNRESET`. The fixture's fake target answered each socket handshake with 307 on the upgraded TLS socket, but that socket had no `error` handler. When the runner dropped the handshake and its connection was reset, the fixture raised an uncaught exception. This is a fault in the test fixture only: the runner follows no redirect, and the zero-connection assertion held.

**Why I hadn't seen it:** this machine runs Node 22.23.4. There the unchanged test passed 14/14 in 8 runs in a row and in 3 concurrent runs under CPU load. The reproduction and the validation below therefore use the **pinned Node 22.16.0** image (`node:22.16.0-bookworm@sha256:71bcbb3b…`), with no network and the checkout mounted read-only ([the wrapper](repair3/pinned-node.sh.txt)).

**The repair: `scripts/beta/w2-args-selftest.mjs` only.** No change to the runner, the proxy, the verdict or the app.
- **Every socket the fixture accepts gets its own `error` handler.** That includes the counting listeners, the fake target's raw and TLS connections, and **explicitly every upgraded socket**.
  - An expected peer reset (ECONNRESET or EPIPE) is counted.
  - Any other socket error is kept, and fails the test.
  - There is no process-wide suppressor.
- **Every listener, accepted socket and child process is tracked.** One teardown destroys the sockets, closes the listeners and stops any child left running.
- **3 new cases:**
  - **A peer reset on the upgraded socket:** a client resets the connection right after the 307. The fixture must count at least one handled reset, with no unexpected error and 0 connections to the second origin.
  - **An unexpected socket error** is kept and reported, not swallowed.
  - **Teardown:** no listener, socket or child process is left open (checked with `process.getActiveResourcesInfo()`), and no fixture saw an unexpected error.
- **The existing 14 cases and their zero-network assertions are unchanged.**

### Repair 3's runs, in order
| Run | Source | Node | Verdict | Evidence |
|---|---|---|---|---|
| Reproduction: full suite, then the isolated case | unchanged `4f08c1a` | 22.16.0 (pinned) | **Full suite FAILED 13/14; isolated case FAILED 0/1.** Both with `failureType: 'uncaughtException'`, `read ECONNRESET`, reported as asynchronous activity after the test ended. | [repair3/before/boundary-before-node-22.16.0.log](repair3/before/boundary-before-node-22.16.0.log) |
| Dev: isolated case, then full suite | working tree | 22.16.0 (pinned) | PASSED: isolated 1/1 (440 handshakes answered with 307, 50 peer resets handled by the fixture); full 17/17 | [repair3/dev/boundary-dev-node-22.16.0.log](repair3/dev/boundary-dev-node-22.16.0.log) |
| Dev | working tree | 22.23.4 (this machine) | PASSED 17/17 | (console) |
| Dev: the new peer-reset case made strict (at least 1 handled reset), repeated | working tree | 22.16.0 ×5 and 22.23.4 ×3 | PASSED every time; exactly 1 reset handled in each run | (console) |

## Repair 2 for review 6924352924: the runner stays on its one origin
**The finding:** two of the runner's self-test options could make `w2-load.mjs` act outside its fixed workload. `--self-test-probe-origin` sent the authenticated probes, carrying a host token and the gate cookie, to another origin. `--plant-leak` made the runner write an extra note. The guard against a pass came only after those requests.

**The repair:**
- **The runner has no fault options at all.**
  - Every request, HTTP and WebSocket, goes only to `--origin`.
  - Redirects are never followed: `redirect: "manual"` on every fetch, the preflight included, and `followRedirects: false` on every socket.
  - The whole option check runs before the code file is read and before any network activity. An unknown or reduced option, an `http://` or invalid origin, or a non-positive limit all exit 2.
  - The verdict, the fixed workload and the checks are unchanged.
- **The deliberate faults moved into the disposable local harness, `scripts/beta/render-like-proxy.mjs`,** off by default:
  - **`--fault-cross-room 503|reset`:** the proxy learns each session token's room from that token's first successful request for a room. It answers any later request or socket handshake carrying the token for another room with 503 (V6), or resets the connection (V7). The probes still go only to the one origin.
  - **`--plant-leak`:** the proxy itself saves one extra note in one room, carrying the other room's canary (V4).
- **A focused regression,** `scripts/beta/w2-args-selftest.mjs` (`node:test`, no Docker; the self-test's V8). Each refused option must:
  - exit 2;
  - print nothing on stdout;
  - not read the code file (which doesn't exist);
  - write no evidence;
  - cause 0 connections at the `--origin` listener and at a second listener.

  A fake target then answers authenticated HTTP requests, and then socket handshakes, with 307 to a second origin. The run must fail with 0 connections there. A control shows that the second listener does count a redirect that is followed.

**What the regression shows on the old runner** (`403b53e`, [before/args-before.log](repair2/before/args-before.log)): 4 of 14 tests fail.
- `--plant-leak` and `--self-test-probe-origin` were accepted: the run went on to read the code file.
- A zero `--max-minutes` was accepted.
- An origin that isn't a URL crashed instead of exiting 2.

The redirect tests passed there as well. The old runner already used `redirect: "manual"` for its authenticated calls, and `ws` doesn't follow redirects by default; the risk was the probe-origin option itself. Both are now explicit, and pinned by the test.

### Repair 2's runs, in order
| Run | What changed before it | Verdict | Evidence |
|---|---|---|---|
| The new regression on the old runner | Nothing in the runner (`403b53e`) | **4 of 14 failed,** as described above | [repair2/before/args-before.log](repair2/before/args-before.log) |
| The new regression on the new runner | The runner repair | PASSED, 14/14 | (rerun inside every self-test below, as V8) |
| Self-test, dev run 1 | The proxy's new faults | **FAILED, 2/12. My own bug:** rewriting the proxy's response handler dropped the line that copies the backend's status and headers, so every response went out as a bare 200. The gate's 303 lost its cookie, and every run aborted at preflight. I stopped the run after V9, restored the line, and reran. | [repair2/dev/w2-selftest-dev1-broken-proxy.log](repair2/dev/w2-selftest-dev1-broken-proxy.log) |
| Self-test, dev run 2 | The proxy's response line restored | **PASSED, 13/13:**<ul><li>V4 was caught (the proxy planted one note, HTTP 201);</li><li>V6 and V7 were inconclusive (the proxy learned 20 tokens and faulted 6 cross-room requests and handshakes: 503, then UND_ERR_SOCKET and ECONNRESET);</li><li>V8 passed, 14/14.</li></ul> | [repair2/dev/w2-selftest-dev2.log](repair2/dev/w2-selftest-dev2.log) |
| Final 1, **superseded** | A clean checkout of `8a39295` | W2 self-test PASSED 13/13, W1 self-test PASSED 18/18, static checks passed. **Superseded, by my own reading of its static log:** the secret scan flagged one line. It was the fake fixture cookie in `w2-args-selftest.mjs` (`cgn_beta=fakecookie…`), not a real secret. The fixture values are now dotted strings that the scan can't mistake for a real cookie (`bb3040d`). | [repair2/superseded-8a39295/](repair2/superseded-8a39295/) (logs only) |
| **Final 2: W2 self-test** | **A clean checkout of `bb3040d038eda8778ae0ea24efb603d1fdda94c6`** | **PASSED, 13/13.** See below. | [repair2/final/w2-selftest-final.log](repair2/final/w2-selftest-final.log), the 8 evidence files in [repair2/final/w2-evidence/](repair2/final/w2-evidence/), [V8's log](repair2/final/w2-args-selftest-V8.log), the disk-check logs, the proxy logs |
| **Final 2: W1 self-test** | The same checkout. A regression run, because the proxy's request handler changed; its new faults are off by default. | **PASSED, 18/18** | [repair2/final/w1-selftest-final.log](repair2/final/w1-selftest-final.log) |
| **Final 2: static checks** | The same checkout | **Passed every step,** with the secret scan empty:<ul><li>no runtime file differs from `7097ac2`;</li><li>the deploy files are unchanged apart from `render.yaml`'s already-reviewed comment line from `be5be26`;</li><li>eslint and shell syntax pass;</li><li>vitest collects 0 tests under `scripts/beta`;</li><li>33 links, none missing.</li></ul> | [repair2/final/static-final.log](repair2/final/static-final.log) |

**Final 2, W2 self-test, case by case:**
- **U:** 37/37.
- **V1:** PASSED, all 16 checks:
  - 200/200 answers, 96/96 stroke messages, 108/108 guesses, 10/10 notes and 40/40 Ready taps, each acknowledged and read back, with 0 malformed replies;
  - 22/22 sockets with their own room's projection, and 22/22 open at the end;
  - both directions refused by the app (401 "Session token required" twice, then close 1008).

  The disk check then PASSED item by item.
- **The negatives, each failing on its own check alone:**
  - **V2:** stroke acknowledgements.
  - **V3:** stroke read-back.
  - **V4:** passive isolation. The proxy planted one note (HTTP 201), and room B's Memory Book read showed room A's canary.
  - **V5:** stroke read-back, plus the disk check on the drawing alone.
  - **V6:** active isolation. The proxy learned 20 tokens and answered 6 cross-room requests and handshakes with 503, so every leg was inconclusive.
  - **V7:** active isolation, with the same 6 reset: UND_ERR_SOCKET on the reads and ECONNRESET on the socket.
  - **V9:** stroke acknowledgements, with malformed replies counted.
- **V8:** 14/14:
  - 11 refused-option cases, each with exit 2, no code-file read, no evidence, and 0 connections at both listeners;
  - the control;
  - HTTP and socket redirects not followed, with 0 connections at the second origin.
- **The secret scan:** no code or cookie in any log or evidence file.

## Repair for review 6922818863: the W2 checker can no longer pass on nothing
**The review's three blocking findings were all in the checker**, not in the app. All three are fixed, and each has a test that fails on the old behaviour.

| Finding | The repair | Its tests |
|---|---|---|
| **1. Transport errors counted as refusals.** A probe with 503/502/timeout or 500/503/error counted as refused, so W2 could report isolation without a single definitive denial. | A probe leg counts as refused only on **the app's own denial**: HTTP 401 with `{"error":"Session token required"}`, and the socket closed 1008 with that reason before any message. Every other outcome makes the probe inconclusive, and the run fails. A 200, or the other room's projection, fails it as access. Both directions must be probed exactly once. A probe never aborts the run, and the evidence records exactly what each leg got. | 17 unit cases (the review's synthetic responses, 404, the gate's 401, a bare 401, 403, handshake 503/401, close 1006, 1008 for a missing room, 1008 after a message, a message, 200, a missing or doubled direction). **V6:** probes to an edge in maintenance mode (503). **V7:** probes to a closed port (transport errors). |
| **2. The workload wasn't enforced.** `--rooms 1` exited 0 with `W2 PASSED`: [repro on `b38c892`](repair/dev/repro-before-rooms-1.log). | The workload is fixed, and `--rooms`, `--players`, `--notes` and unknown options are refused (exit 2) before anything is created. The verdict also checks what actually happened, per room:<ul><li>2 rooms, 10 players, a TV and 11 sockets in each;</li><li>Trivia finished with 10 questions, and Draw & Guess with 6 turns;</li><li>20 Ready taps, 100 answers, 48 stroke messages, 54 guesses and 5 notes, each sent and acknowledged;</li><li>all 22 sockets received their own room's projection.</li></ul>A malformed success response isn't an acknowledgement. Self-test options can never print `W2 PASSED`. | 9 unit cases (one room, 9 players, no TV, 9 questions, 5 turns, a missing answer, note or Ready, a socket without its projection, a socket closed at the end), plus malformed acknowledgements. **V9:** the proxy answers every 10th stroke message, and its retries, with 200 and an empty `{}` without forwarding it. The old tool read the missing `accepted` as true; now the run must fail on the stroke acknowledgements alone, with the malformed replies counted. **V8:** `--rooms 1`, `--players 4`, `--notes 1` and `--expect-revision` are each refused. |
| **3. The drawing was compared by count only.** | Each stroke message's pieces are distinct per room, turn and message. Each acknowledged message is matched against the turn's stored pieces by stroke ids, in order, and a digest of the normalized pieces (`{s, c, w, p}`, as the server stores them). A batch fails if any piece is missing, duplicated, different or out of order, and any stored piece that nobody sent fails the read-back too. The local disk check uses the same matcher, and now matches answers, guesses and notes item by item as well. | Unit cases: one coordinate changed (same count), a substituted stroke id, a repeated piece, another turn's or room's pieces, swapped order, a missing batch, and stored pieces nobody sent. **V5:** the proxy forwards every 10th stroke message with one coordinate moved, so the server accepts it and the count is right. The run's read-back and the disk check must both fail on the drawing alone. |

**The tests:**
- **`scripts/beta/w2-verdict-selftest.mjs`:** the focused tests, run with `node:test`. It is named so the repository's vitest suite doesn't collect it.
- **`scripts/beta/w2-selftest.sh`:** U (those tests), V1–V9, and the secret scan.

### The repair's runs, in order
| Run | What changed before it | Verdict | Evidence |
|---|---|---|---|
| Reproduction | Nothing: the unchanged `b38c892` tool, with `--rooms 1` | **W2 PASSED, exit 0:** the defect reproduced, with 11 sockets and both isolation checks passing on no pairs | [dev/repro-before-rooms-1.log](repair/dev/repro-before-rooms-1.log) and its evidence file |
| Trial 1 | The repaired tool, a full run | PASSED: all 16 checks; both directions refused by the app (401 "Session token required" ×2, close 1008) | [dev/trial-1.log](repair/dev/trial-1.log) and its evidence file |
| Self-test, dev run | The extended self-test | PASSED, 12/12. Each negative failed on its own check alone. | [dev/w2-selftest-dev1.log](repair/dev/w2-selftest-dev1.log) |
| Final 1, **superseded** | A clean checkout of `e312fab`. One change since the dev run: a refused handshake now reads `handshake 503`, and V6 asserts that. | W2 self-test PASSED 12/12, W1 self-test PASSED 18/18, static checks passed. **Superseded, by my own reading of its logs:** V2's dropped strokes (proxy 502s) were counted as "malformed replies 189". The verdict was right, but the figure was misleading. | [superseded-e312fab/](repair/superseded-e312fab/) (logs only) |
| **Final 2** | **A clean checkout of `889e2fe8cdcf6714cfd82c0fd58f439e09e288f5`.** "Malformed" now counts only a success status without a well-formed acknowledgement. The proxy gained `--empty-ack-every`, and the self-test gained V9. | **W2 self-test PASSED, 13/13.** See below. | [final/w2-selftest-final.log](repair/final/w2-selftest-final.log), the 8 evidence files in [final/w2-evidence/](repair/final/w2-evidence/), [final/w2-disk-check-V1.log](repair/final/w2-disk-check-V1.log), [final/w2-disk-check-V5.log](repair/final/w2-disk-check-V5.log), and the proxy logs |
| **Final 2, W1 self-test** | The same checkout. A regression run, because the proxy changed; its fault options are off by default. The log header names `--mutate-every` and the content length but omits `--empty-ack-every`, which was added after the header was written. | **PASSED, 18/18** | [final/w1-selftest-final.log](repair/final/w1-selftest-final.log) |
| **Final 2, static checks** | The same checkout | **Passed every step:**<ul><li>no runtime file differs from `7097ac2`;</li><li>no accepted deploy file differs from `46f7ff0`, except `render.yaml`'s comment-only header line from `be5be26`, which was already reviewed;</li><li>eslint and shell syntax pass;</li><li>vitest collects 0 tests under `scripts/beta`;</li><li>22 links, none missing;</li><li>the secret scan finds nothing.</li></ul> | [final/static-final.log](repair/final/static-final.log) |

**Final 2, W2 self-test, case by case:**
- **U:** 37/37 focused tests.
- **V1:** PASSED, all 16 checks:
  - 200/200 answers, 96/96 stroke messages, 108/108 guesses, 10/10 notes and 40/40 Ready taps, each acknowledged (0 malformed replies) and read back;
  - 0 isolation hits;
  - 22/22 sockets with their own room's projection, and 22/22 open at the end;
  - both directions refused by the app (401 "Session token required" twice, then close 1008 with the same reason).

  The disk check then PASSED item by item: 100/100 answers, 48/48 batches, 54/54 guessers and 5/5 notes per room.
- **The negatives, each failing on its own check alone:**
  - **V2:** stroke acknowledgements, 87/96. The 9 dropped messages were retried; malformed replies 0.
  - **V3:** stroke read-back, 87/96: exactly the 9 faked batches.
  - **V4:** passive isolation, 2 hits.
  - **V5:** stroke read-back, 87/96: exactly the 9 altered batches, with the count right. The disk check failed on the drawing alone, in both rooms ("stored pieces differ from what was sent").
  - **V6:** active isolation, with 503 on every leg (handshake 503 on the socket).
  - **V7:** active isolation, with ECONNREFUSED on every leg.
  - **V9:** stroke acknowledgements, 87/96, with 189 malformed replies counted.
- **V8:** `--rooms 1`, `--players 4`, `--notes 1` and `--expect-revision` each exited 2, before anything was created.
- **The secret scan:** no code or cookie in any file.

**One edit to the logs and evidence files:** my local scratch path is replaced with `<scratch>`. Nothing else was changed, and the files were checked for each run's code and for cookie values.

## Before the repair: the workload, the checks and the negatives
- **The tool:** `scripts/beta/w2-load.mjs`.
  - **The load:** 2 rooms × 10 players + a TV each, 22 sockets over `wss://`. Trivia, then Draw & Guess with Memory Book notes alongside.
  - **The checks:** every action acknowledged and accepted; every acknowledged action read back from the authoritative state; room isolation (passive scans and active probes); every socket open at the end.
- **The disk:** `scripts/beta/w2-disk-check.mjs` is **local only**. It matches every acknowledged action against the room and Memory Book files in the data folder.
- **The self-test:** `scripts/beta/w2-selftest.sh` runs:
  - **V1**, the full workload, then the disk check;
  - **V2**, a dropped acknowledgement: the proxy answers 502 to every 10th stroke message and all its retries;
  - **V3**, a fake acknowledgement: the proxy answers `{"accepted":true}` to every 10th stroke message without forwarding it;
  - **V4**, a planted cross-room leak: room B saves a note carrying room A's canary;
  - and a scan that no log or evidence file holds the code or a beta cookie.

  **Each negative must fail on exactly its own check.**
- **The proxy's fault options** (`--fault-action`, `--fail-intent-every`, `--fake-ack-every`) are off by default. The W1 self-test was rerun on the final commit to show W1 is unchanged.

## Before the repair: every run, in order
| Run | What changed before it | Verdict | Evidence |
|---|---|---|---|
| Trial 1 | First run | **FAILED, correctly:** preflight got `/health` 502. The local Docker daemon had stopped, so the target was down, and the tool stopped before creating anything. | [dev/trial-1-…](dev/trial-1-w2-20261116T160415-0028c7.json) |
| Trial 2 | Docker restarted | **FAILED: my read-back.** All 200 answers were acknowledged, but read back as 0/200. Trivia keeps a player's answers in its game `state.myAnswers`; I had read the generic top-level `myAnswers`. Everything else passed, including 0 isolation hits and refused cross-room probes. | [dev/trial-2-…](dev/trial-2-w2-20261116T160447-810a69.json) |
| Trial 3 | Read `state.myAnswers` | **FAILED: my read-back again,** 100/200. Player ids are per room (`player-1` …), so room B's read-back overwrote room A's. The match now includes the room. | [dev/trial-3-…](dev/trial-3-w2-20261116T160619-7439b3.json) |
| Trial 4 | The match scoped by room | PASSED | [dev/trial-4-…](dev/trial-4-w2-20261116T160753-6cd37b.json) |
| Self-test 1 | First run of the self-test | PASSED, 6/6:<ul><li>**V1:** PASSED, and the disk check PASSED;</li><li>**V2:** FAILED on "stroke: every action acknowledged" alone (87/96, 9 unacknowledged);</li><li>**V3:** FAILED on "stroke: … read back" alone (24/96);</li><li>**V4:** FAILED on isolation alone (2 hits);</li><li>no code or cookie anywhere.</li></ul> | [dev/w2-selftest-run1.log](dev/w2-selftest-run1.log), and the four `dev/selftest-run1-…` files |
| **Final, W2 self-test** | **The committed files:** a clean checkout of `b460c15c6e63ca928394b504dfeaafca6c2a2ad8`, with the image built from `deploy/render`, unchanged since `46f7ff0` | **PASSED, 6/6:**<ul><li>**V1:** PASSED (200/200 answers, 96/96 stroke messages, 108/108 guesses and 10/10 notes, each acknowledged and read back; 0 isolation hits; cross-room probes refused: 401/401/close 1008; 22/22 sockets open), and the disk check PASSED;</li><li>**V2, V3 and V4:** each FAILED on its own check alone.</li></ul> | [final/w2-selftest-final.log](final/w2-selftest-final.log), [final/w2-disk-check-V1.log](final/w2-disk-check-V1.log), the four evidence files in [final/w2-evidence/](final/w2-evidence/) |
| **Final, W1 self-test** (a regression run: the proxy gained fault options, off by default) | The same checkout | **PASSED, 18/18** | [final/w1-selftest-final.log](final/w1-selftest-final.log) |
| **Final, static checks** | The same checkout | **Passed every step:**<ul><li>no runtime file differs from `7097ac2`;</li><li>no accepted deploy file differs from `46f7ff0`;</li><li>eslint and shell syntax pass;</li><li>29 links, none missing;</li><li>the secret scan finds nothing.</li></ul> | [final/static-final.log](final/static-final.log) |

Trials 2 and 3 were my tool's faults, not the server's. Both made the run fail, which is the direction that matters: a wrong read-back can't produce a false pass.

**V3's read-back is per turn.** It compares the turn's drawing, piece by piece, with what was acknowledged. One faked message therefore marks all of that turn's messages as not read back (24/96 means 3 of the 12 turns were clean).

**One edit to the logs and evidence files:** my local scratch path is replaced with `<scratch>`. Nothing else was changed. The tool writes no token, cookie or join code; the files were checked for the run's code.

## What this does not prove
- **Anything about Render:** latency over the internet, Render's CPU and memory (the operator records those during W2), its proxy, and its disk.
- **Durability across a restart.** That is W4. Here the read-back is from the running server, and the disk check reads the files it had written.
- **Browsers, phones and real networks:** W3 and W8. The clients here are synthetic, on one machine.
- **Drawing at a human pace and size.** Each turn sends 8 messages of 3 short pieces, well inside the server's limits, to measure acknowledgement and persistence, not drawing quality.
