# Beta R4 W2 preparation: local evidence for the W2 workload tool (handoff 6921505856)

**Where it ran:** this session's machine. The target was the packaged image from `deploy/render` (`cgn-render:check`, built in [the package evidence](../beta-r4-render-package/README.md) from a local rebuild of `7097ac2`), with these settings:
- production mode, the throwaway data folder `/var/data/cgn-w1`;
- a throwaway access code generated per run;
- `MCHEZO_TRUST_PROXY=1`, and the configuration authorized with `cgn-authorize`;
- behind `scripts/beta/render-like-proxy.mjs`: TLS for `localhost` with a per-run certificate, and an appended `X-Forwarded-For`.

No Render, no account, no real data. **This is protocol and load evidence from synthetic clients, on one machine.** It is not Render (no Render CPU or memory figures), not a browser and not a native device. W2 on Render is ChatGPT's, after W1: see [render-w2.md](../../beta/render-w2.md), which also has the gap analysis.

## The workload, the checks and the negatives
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

## Every run, in order
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
