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

## Repair for review 6930033578: harness isolation, and rendered evidence
**The review's two blocking findings**, both confirmed at `d630a94`:
1. **`w3-rehearsal.sh` wasn't isolated.**
   - It used the fixed name `w3-svc`, ran `docker rm -f -v w3-svc` before `docker run`, and again in cleanup, whatever happened.
   - It carried on after failed startup steps.
2. **R2's and R5's "host and TV" checks didn't look at the host's screen.**
   - R2 compared two fresh API reads of the TV projection.
   - R5 checked the TV's text, plus another API read.

### The reproduction, before any change
**`scripts/beta/w3-harness-selftest.sh --mock-only` against the reviewed wrapper `d630a94`:** 10 checks passed and **26 failed** ([before/mock-selftest-on-d630a94.log](repair/before/mock-selftest-on-d630a94.log)).
- **The setup:** a mock `docker`, `curl` and `node` on `PATH` record every call, with a pre-existing container named `w3-svc` in the mock's state. Nothing real was started.
- **In all five cases** (a failed `docker run`, a missing image, a container exiting before ready, a wrong revision, a failed authorization), the old wrapper:
  - deleted the pre-existing `w3-svc` before `docker run`;
  - then authorized (`docker exec`);
  - started the proxy and the driver (`node`);
  - removed by the shared name twice more.
- **M1's recorded calls:**
  1. `docker rm -f -v w3-svc`, which removed the pre-existing container;
  2. `docker run` (failed);
  3. 80 health probes;
  4. `docker exec … cgn-authorize`;
  5. `node render-like-proxy.mjs`;
  6. `node w3-rehearsal.mjs`;
  7. `docker rm -f -v w3-svc`;
  8. `docker rm -f -v w3-svc`.

### What changed
- **`scripts/beta/w3-rehearsal.sh`:**
  - **Identity:** a run id, a unique container name `w3-svc-<run id>`, and the label `w3.owner=<run id>`.
  - **Removal:** only the container ID this run's `docker run` returned (or, after a failed `docker run`, one carrying this run's label), and only after reading that label back. Nothing is deleted in advance.
  - **Port preflight:** if any of 18443, 18480 or 18080 is already listening, nothing starts.
  - **Every startup step checked,** each before the next:
    1. the image;
    2. `docker run`;
    3. readiness (`/health`, with the container still running);
    4. the `/health` revision equal to the pin `7097ac2…`;
    5. `cgn-authorize`;
    6. the proxy listening;
    7. 3 listeners.

    A failure stops the run before authorization or any browser work.
  - **Owned processes:** the processes it starts carry `W3_OWNER=<run id>` in their environment, and cleanup stops only those.
  - **Private files:** the code, its env file and the TLS key live in a private `mktemp -d` (mode 700), removed on exit. The work directory, its per-run logs and the evidence are kept.
  - **Cleanup** runs on success, failure, SIGINT and SIGTERM, and runs twice: the second pass must find nothing.
- **`scripts/beta/w3-rehearsal.mjs`:**
  - **R2, rendered:** the host's phase from its own page (its question screen) and the TV's from its own page (`Featured question (Q1 of 10) · each phone goes at its own pace` in its top bar), each checked, then both against the server's status.
  - **R5, rendered:** the host's, the guest's and the TV's own pages must each show the finished round, with every player's recorded score in their standings (the phone's Standings step, the TV's Leaderboard). The server-record checks (10 answers once, and the score from the recorded answers) stay separate and are labelled API.
  - **API labels:** presence ("away", "back") is labelled an API observation. The host's API calls go through the context's request client, outside the page.
  - **`--control stale-host`:** freezes the host's page before R5; the host's rendered R5 check must then fail.
- **`scripts/beta/w3-harness-selftest.sh` (new):** M1–M5 with the mock; D1–D6 with real Docker, a sentinel `w3-svc` container and a look-alike sentinel process.
- **`docs/beta/render-w3.md`:**
  - during a round, presence shows only on a waiting phone (not on a question screen or the TV);
  - how to read the final standings on the TV (Leaderboard) and on the phones (Standings);
  - the presence rows of the budget are now informational;
  - the rehearsal section describes the isolation and the controls.

### Every run of the repair, in order
| Run | Code | Verdict | Evidence |
|---|---|---|---|
| Reproduction | the reviewed wrapper at `d630a94`, mock only | **FAILED as expected:** 10 passed, 26 failed (above) | [before/mock-selftest-on-d630a94.log](repair/before/mock-selftest-on-d630a94.log) |
| Mock self-test, dev 1 | the repaired wrapper, working tree | PASSED 36/36 | [dev/mock-selftest-dev1.log](repair/dev/mock-selftest-dev1.log) |
| Rehearsal, dev trial 1 | working tree | **FAILED, 5 checks. My driver's selectors, not the app:**<ul><li>Trivia's spectator TV is its own stage (top bar and leaderboard), not the generic TV show I first read;</li><li>a finished Trivia phone shows a step-through review whose Standings are one tap away.</li></ul>The harness side passed: its own container removed, the second cleanup a no-op, nothing left, the secret scan empty. | [dev/trial1.log](repair/dev/trial1.log) and its JSON |
| Rehearsal, dev trial 2 | working tree, the selectors fixed | PASSED, every check, the rendered R2 and R5 included. The two players tied (480–480), because both answered option 0, so I made the host answer option 1. | [dev/trial2.log](repair/dev/trial2.log) and its JSON |
| Full self-test, dev 1 | working tree | **PASSED 93/93:**<ul><li>M1–M5;</li><li>D1 a passing run beside both sentinels;</li><li>D2 a port conflict, where the unrelated listener got 0 connections;</li><li>D3 never ready;</li><li>D4 a wrong revision;</li><li>D5 a SIGTERM during the browser work: exit 143, nothing of its own left;</li><li>D6 the stale-host control: exactly one check failed, the host's rendered R5 check.</li></ul>D1 and D6 tied again (0–0 and 240–240). | [dev/selftest-dev1.log](repair/dev/selftest-dev1.log) |
| **Final: the self-test** | **a clean checkout of `71dda19`** | **PASSED 93/93 (exit 0);** containers 0 before and after. Runs:<ul><li>D1 `20261116T215646Z-bc962ff2` (passed; both sentinels survived);</li><li>D2 `…215747Z-ae309467` (failed at the port preflight, 0 connections to the unrelated listener);</li><li>D3 `…215747Z-9327f096` (failed at readiness);</li><li>D4 `…215749Z-696f5b70` (failed at the revision check);</li><li>D5 `…215751Z-9619fa30` (exit 143 after SIGTERM, 4 owned processes running just before, none left);</li><li>D6 `…215807Z-712d53eb` (the stale-host control: only `R5 the host's screen (rendered)` failed).</li></ul> | [final/selftest-final.log](repair/final/selftest-final.log), and [D6's JSON](repair/final/selftest-D6-w3-20261116T215808-3f7e42.json) |
| **Final: the W3 rehearsal** | **the same checkout** | **PASSED (exit 0),** harness run `20261116T215927Z-d23291b4`, driver run `20261116T215929-6830a4`. Every check passed, the rendered R2 and R5 included. **The scores differed** (host 360, guest 240), and each screen showed them under the right name. Cleanup: its container removed, the second pass a no-op, 0 of its containers, processes, listeners or private files left; 0 files with the code or a cookie. | [final/rehearsal-final.log](repair/final/rehearsal-final.log) and [its JSON](repair/final/rehearsal-final-w3-20261116T215929-6830a4.json) |
| **Final: the static checks** | **the same checkout** | **Passed:**<ul><li>the changes since `d630a94` are only the W3 scripts, docs and evidence;</li><li>no runtime file differs from `7097ac2`;</li><li>no deploy file, shared helper (`scripts/lib`, `render-like-proxy.mjs`) or W1/W2 tool differs from `2e2257c`;</li><li>eslint and `bash -n` pass;</li><li>17 links, none missing;</li><li>the secret scan finds nothing.</li></ul> | [final/static-final.log](repair/final/static-final.log) |

### The repair's limits
- **D1–D6 use this machine's Docker and ports.** "Never touch another run" is shown with sentinels: a pre-existing `w3-svc` container and a look-alike process. It isn't shown with another live rehearsal running beside it; that run would fail at the port preflight instead.
- **The rendered checks read what each page shows.** They don't prove a person would notice it; the native C1–C4 still need people and phones.
- **Ties:** when the two players tie on points, a swapped name-to-score attribution looks the same. The numbers still have to equal the record, and the evidence says whether the scores differed. In the final rehearsal they did (360 and 240).
- **The stale-host control freezes the page through the test's network routing.** That is a stand-in for a host screen that stopped updating; it isn't a reproduction of a real failure.
