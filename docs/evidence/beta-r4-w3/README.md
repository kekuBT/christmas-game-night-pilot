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
