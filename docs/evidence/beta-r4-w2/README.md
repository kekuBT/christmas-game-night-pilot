# Beta R4 W2 preparation: local evidence for the W2 workload tool (handoff 6921505856, repaired for review 6922818863)

**Where it ran:** this session's machine. The target was the packaged image from `deploy/render` (`cgn-render:check`, built in [the package evidence](../beta-r4-render-package/README.md) from a local rebuild of `7097ac2`), with these settings:
- production mode, the throwaway data folder `/var/data/cgn-w1`;
- a throwaway access code generated per run;
- `MCHEZO_TRUST_PROXY=1`, and the configuration authorized with `cgn-authorize`;
- behind `scripts/beta/render-like-proxy.mjs`: TLS for `localhost` with a per-run certificate, and an appended `X-Forwarded-For`.

No Render, no account, no real data. **This is protocol and load evidence from synthetic clients, on one machine.** It is not Render (no Render CPU or memory figures), not a browser and not a native device. W2 on Render is ChatGPT's, after W1: see [render-w2.md](../../beta/render-w2.md), which also has the gap analysis.

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

After the dev run, one more change: the socket leg of a refused handshake now reads `handshake 503` rather than `503`, and V6 asserts that exact detail. The final runs are on the committed files.

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
