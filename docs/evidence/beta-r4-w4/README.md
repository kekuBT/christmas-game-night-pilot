# Beta R4 W4 preparation: the local restart rehearsal (handoff 6933392621)

**Where it ran:** this machine's Docker.
- **The image:** `cgn-render:check` (`sha256:7b53109a7d69`), the local `deploy/render` build of the pinned `7097ac2` used for W1–W3. Each run checked the `/health` revision.
- **The settings:** production mode, the throwaway data folder `/var/data/cgn-w1` on a **Docker volume owned by the run**, and a throwaway code. Every container and volume is removed afterwards.
- **The browsers:** Chromium pages (`chrome-headless-shell` 153) for a host, a guest and a TV.

**This is a rehearsal of the restart mechanics, not W4.** Render's manual deploy and dashboard restart, D1 and D2 in [render-w4.md](../../beta/render-w4.md), stay **pending**.

## What a run checks
The tools are:
- `scripts/beta/w4-rehearsal.sh`, the harness: W3's isolation, plus a run-owned volume and the restart actions;
- `scripts/beta/w4-rehearsal.mjs`, the driver;
- `scripts/beta/w4-selftest.sh`, which runs the rehearsal with its controls.

Labels: **rendered** is a page's own DOM; **API** is the server's record over HTTP; **harness** is the harness that did the restart.

| Step | What happens | Must hold |
|---|---|---|
| S | A first Trivia round finishes; the host saves a synthetic Memory Book note citing it | It reads back (API) |
| P | A second round; the host and guest each answer question 1 | Locked in (rendered), recorded once (API) |
| R1 | **`docker stop`** (graceful `SIGTERM`, passed on by `cgn-entrypoint`). While it is down, the guest taps question 2. Then **`docker start`** of the same container. | **While down:**<ul><li>the guest's banner says it is reconnecting;</li><li>the tap is **not** shown as in (rendered).</li></ul>**After the restart:**<ul><li>the pinned revision (harness);</li><li>the same room, seats and round (API);</li><li>the acknowledged answers kept once, and the unconfirmed tap **not** saved (API);</li><li>a new live socket on each page;</li><li>each screen showing the playing round on that live connection (rendered).</li></ul>**Then:**<ul><li>the guest re-taps question 2: locked in, recorded once;</li><li>play continues: the host answers question 2 in its own page, acknowledged.</li></ul> |
| R2 | A **fresh container** of the same image on the **same** volume, with the same environment (a local analogue of a redeploy) | The same checks as R1, both earlier answers kept once; the host answers question 3 in its own page; **the seeded Memory Book note reads back** (API) |
| L | A second `node dist/server/serve.js` **inside** the running container | Refused by the one-writer lock: exit 2, "Another server (pid N) is using this data directory" |
| G | A second container on the same volume with **another public origin** | `cgn-entrypoint` refuses before any server starts: exit 78, `REFUSED: MCHEZO_PUBLIC_ORIGIN is not the authorized origin` |
| F | The round finishes (the guest through the UI, the host through the API) | **Server record (API):** every answer once, and the guest's score equal to the score of its recorded answers.<br>**Rendered:** the host's, guest's and TV's standings equal the recorded scores. |

**After every run,** none of its containers, volumes, processes, listeners or private files is left, and no log or evidence file holds the code or a cookie. Screenshots mask the room code.

## The finding: a tap made during a restart can show `Request failed (502)`
- **What happens:**
  - While the service is down, the proxy answers 502.
  - The phone retries three times, then shows the raw text **`Request failed (502)`** (recorded verbatim in every run).
  - It doesn't show its friendly `NOT_DELIVERED` wording: "We couldn’t confirm that — check your connection. If it doesn’t show as in, try again."
- **The safety property holds:** the tap is never shown as in, the server never records it, and re-tapping after the restart counts it once.
- **The cause:** the pinned client turns a final 5xx into `Request failed (<status>)`, and `humanError` passes it through.
- **Proposed bounded repair, not made here:** map a final 502, 503 or 504 that isn't the app's own JSON to `NOT_DELIVERED`. See [render-w4.md](../../beta/render-w4.md#the-finding-from-the-rehearsal-a-tap-made-during-a-restart-can-show-request-failed-502). It is a runtime change, so it needs its own approval and a new candidate. **The pin is unchanged.**

## Every run, in order
| Run | Code | Verdict | Evidence |
|---|---|---|---|
| Dev trial 1 | the working tree | **FAILED, 1 check: my expectation, not the app.** I expected the phone to show "couldn't confirm" for the tap made while the service was down. It showed `Request failed (502)`. The tap was **not** shown as in and **not** saved: the finding above.<br>Everything else passed: both restarts, the lock, the guard, the Memory Book seed, and distinct final scores (600, 360) rendered correctly. Cleanup was clean. | [dev/trial1.log](dev/trial1.log) and its JSON |
| Dev trial 2 | the check rewritten: the safety property (not shown as in, not saved) is the pass condition, and the message is recorded verbatim as a NOTE | PASSED | [dev/trial2.log](dev/trial2.log) and its JSON |
| Control 1 (`--control empty-data`) | the same | **FAILED as intended,** with 4 failures (sockets, room, answers, the Memory Book note).<br>**But the restart-time rendered check PASSED on stale pages:** with no socket back and the room gone, the old screens still showed the round. The rendered check couldn't fail. | [dev/control1.log](dev/control1.log) and its JSON |
| Dev trial 3 | the rendered check now requires each page's **own new live socket**; "play continues" added (the host answers in its own page after each restart) | PASSED | [dev/trial3.log](dev/trial3.log) and its JSON |
| Control 2 | the same | **FAILED as intended,** exactly the **six** R2 continuity and durability checks, the rendered one included. Every R1 check passed. | [dev/control2.log](dev/control2.log) and its JSON |
| W3 mock cases on the W4 harness | `w3-harness-selftest.sh --mock-only --harness w4-rehearsal.sh`, with the mock reading any `*.owner` label (a one-line change to the W3 self-test's mock) | PASSED 36/36 | [dev/mock1-w3-mock-cases-on-w4.log](dev/mock1-w3-mock-cases-on-w4.log) |
| Self-test, dev 1 | `w4-selftest.sh`: K1–K5 with sentinels | PASSED: every case, every sentinel survived | [dev/selftest-dev1.log](dev/selftest-dev1.log) |
| Dev trial 4 | masked screenshots added | PASSED; screenshots checked by eye: the room code masked | [dev/trial4.log](dev/trial4.log), [dev/trial4-screens/](dev/trial4-screens/) |

## Limits
- **Not Render.** Not Render's build and deploy pipeline, its edge's answers during a restart, the disk's detach and attach, the 30 s `SIGKILL` deadline, or a real network. Docker's `stop`/`start` and a fresh container are local analogues only.
- **Not phones.** Chromium pages on one machine. Native C1–C4 (W3) and W8 stay pending.
- **The one-writer lock is per network namespace.** So L checks it inside the running container. Across containers, what separates writers is the order (stop before start), which the harness follows and Render's disk-backed deploys follow (`docs/beta/beta-r1-architecture.md`, `beta-r4-hosting-proposal.md`).
- **The browser** is `chrome-headless-shell` 1243, through `MCHEZO_CHROMIUM_PATH`. The harness ran on this machine's Node v22.23.4; the server ran inside the pinned image.
- **An observation, out of scope:** the TV leaderboard shows a player's negative change (e.g. `−120`) in the gain colour, where the phone's list shows it neutrally.
