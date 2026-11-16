# Beta R4 W3 preparation: local rehearsal of the reconnect check (handoff 6929226094)

**Where it ran:** this session's machine. The target was the packaged pinned image from `deploy/render` (`cgn-render:check`, a local rebuild of `7097ac2` with a test pin, as in W1 and W2), with these settings:
- production mode;
- the **throwaway** data folder `/var/data/cgn-w1`, inside the container, which is removed after each run;
- a throwaway access code generated per run;
- `MCHEZO_TRUST_PROXY=1`, authorized with `cgn-authorize`;
- behind `scripts/beta/render-like-proxy.mjs` (TLS for `localhost`).

The clients were Chromium pages (`chrome-headless-shell` 153, through `MCHEZO_CHROMIUM_PATH`): a host, one guest and a TV.

**This is a rehearsal of the app's recovery, not W3.** It isn't Render, a phone, Safari's or Chrome's own suspension of a background page, or a real network handoff. The physical checks are C1–C4 in [render-w3.md](../../beta/render-w3.md), and they stay **pending**.

## What the rehearsal does
- **The tools:**
  - `scripts/beta/w3-rehearsal.sh`: the bounded, self-cleaning harness;
  - `scripts/beta/w3-rehearsal.mjs`: the driver. It is local only, and refuses any origin but `https://localhost` and `https://127.0.0.1`.
- **The interruptions:** only the guest's network is interrupted, by the test itself, through Playwright:
  - **"told offline"** (R2): the page is told it's offline, HTTP fails, and sockets are closed and refused;
  - **"silent"** (R2b): traffic is dropped both ways while the socket stays open, and nothing tells the page, as on a Wi-Fi to mobile data switch.

| Check | What happens | Must hold |
|---|---|---|
| R1 | The guest answers question 1 | Locked in, recorded once |
| R2 | A 15 s outage the page is told about, with question 2 on screen | During the outage:<ul><li>the guest's banner reads "Connection lost. Reconnecting…";</li><li>the host shows the guest away.</li></ul>After it:<ul><li>the socket is back, the host shows the guest back, and the phone is usable on question 2;</li><li>the **same seat and the same round**, and question 1 still recorded once;</li><li>the host and the TV show the same public phase.</li></ul> |
| R2b | A 15 s **silent** outage | The app's own watchdog notices. After the path returns, the phone recovers **with no online event**: the same seat and round, and question 1 still once. |
| R3 | An **interrupted submission**: the question-2 request reaches the server, its response is lost, and an 8 s outage follows | The server accepted it. The phone says it **couldn't confirm** the answer, never that it's in. After the network returns, the phone shows it **locked in**, and it is recorded **once**. Replaying the same request (same `clientEventId`) changes nothing, and a different second answer is refused (`ALREADY_ANSWERED`). |
| R4 | Question 3's first response is lost, with the network up | The phone's own retry (same id) is answered from the dedupe: shown in, recorded once |
| R5 | The round finishes | All 10 answers recorded once. The final points equal the score of the recorded answers, from the revealed correct answers. The host and the TV both show the finished round. |

**The harness then checks** that no container, listener or process is left, and that no log or evidence file holds the code or a cookie. The driver's evidence holds no room code, token, cookie or answer choice, and the run fails if its own evidence holds a known secret.

## Every run, in order
| Run | What changed before it | Verdict | Evidence |
|---|---|---|---|
| Trial 1 | First run | **FAILED, infrastructure:** the driver couldn't find the Chromium build its helper expects (1248). This machine has 1243. Exit 3 before any page opened; cleanup and the secret scan were clean. | [dev/trial1.log](dev/trial1.log) |
| Trial 2 | `MCHEZO_CHROMIUM_PATH` set to the installed headless shell | **FAILED, 8 checks. My driver's bugs, not the app's:**<ul><li>I matched players by `name` (the field is `displayName`), so the host never "saw" the guest's state change, and the "same seat" check passed only because both sides were undefined;</li><li>my test intents' ids weren't UUIDs, so the server refused them as `INVALID_INTENT`: the second-answer check, and the host's answers, so the round never finished;</li><li>the TV page keeps no room id where I read it.</li></ul>R1, R3's interrupted submission (accepted once, "couldn't confirm" while down, then locked in, replay deduplicated) and R4 already passed. | [dev/trial2.log](dev/trial2.log) and its JSON |
| Trial 3 | Those fixed | **PASSED**, every check | [dev/trial3.log](dev/trial3.log) and its JSON |
| Trial 4 | Added R2b, the silent outage, with manual socket forwarding so traffic can stop while the socket stays open | **PASSED**, every check. The silent outage: the watchdog noticed after 8.5 s; usable 0.57 s after the path returned. | [dev/trial4.log](dev/trial4.log) and its JSON |
| Harness review, before the finals (`e89ce48`) | (no run) | **A defect in my harness: its "listeners left" check couldn't fail.** It counted the output of `ss` or `netstat`, and this machine has neither, so it always read 0. Trials 1–4 therefore didn't prove that no listener was left; their container and process checks did run.<br>**Fixed** before the finals: the harness reads `/proc/net/tcp` (and `tcp6` where present) itself. It also prints the same count while the service and proxy are up, as a positive control. Checked by hand: 0 when idle, 2 with two test listeners on the harness's ports, and an unrelated port not counted. | — |
| **Final 1** | A clean checkout of the tested commit `df4f2cf` | **PASSED (harness exit 0),** every check. Run `20261116T212125-a5d041`. Positive control: 3 listeners while running, then 0 left; no container or process left; no file holding the code or a cookie. | [final/final1.log](final/final1.log) and [its JSON](final/final1-w3-20261116T212125-a5d041.json) |
| **Final 2** | The same checkout, run again | **PASSED (harness exit 0),** every check. Run `20261116T212224-5e0187`. The same cleanup and secret results. | [final/final2.log](final/final2.log) and [its JSON](final/final2-w3-20261116T212224-5e0187.json) |
| **Final, static checks** | The same checkout | **Passed every step:**<ul><li>changes since #44's head `2e2257c` are only the W3 files and PROGRESS;</li><li>no runtime file differs from `7097ac2`;</li><li>no deploy file, and none of the shared driver helpers or W1/W2 tools, differs from `2e2257c`;</li><li>eslint and shell syntax pass;</li><li>6 links, none missing;</li><li>the secret scan finds nothing.</li></ul> | [final/static-final.log](final/static-final.log) |

## The finals' measurements
| Measure | Final 1 | Final 2 |
|---|---|---|
| R2, told offline: banner | shown during the outage | shown during the outage |
| R2: the host saw the guest away | 24 ms | 23 ms |
| R2, after the network returned: socket / host sees the guest back / phone usable | 4 / 64 / 69 ms | 3 / 65 / 70 ms |
| R2b, silent: the watchdog's banner | 8738 ms | 8735 ms |
| R2b, after the path returned: socket / host / usable | 611 / 666 / 671 ms | 597 / 833 / 838 ms |
| R3: the phone shows the interrupted answer in, after the network returned | 209 ms | 207 ms |
| R4: the phone's own retry shows the answer in | 1122 ms | 1119 ms |
| R5: points vs the score of the recorded answers | 120 = 120 | 360 = 360 |

Each run's points differ because the guest's answers are chosen at random. The rule checked is the same: the points equal the score of the recorded answers, with every answer recorded once.

## Limits
- **Not a phone, and not Render.** These are Chromium pages on one machine, against the packaged image behind a local TLS proxy.
- **The interruptions are simulated by the test,** not a real radio or network handoff, and not Safari's or Chrome's own suspension of a background or locked page. Those are the runbook's C1–C4, which stay **pending**.
- **Only the guest's network is interrupted.** The host and the TV stay connected, as in the runbook.
- **The browser** is `chrome-headless-shell` 153 (build 1243), through `MCHEZO_CHROMIUM_PATH`, because the build the pinned Playwright expects (1248) isn't installed here.
- **The host's answers** go through the API, so that the round finishes quickly. The guest's go through the UI.
