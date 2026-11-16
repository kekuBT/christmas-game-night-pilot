# W3 on Render: the reconnect drill (Beta R4, handoff 6929226094)

**Status: prepared. The native checks are PENDING.** Nothing here has run on Render or on a phone.

- **What W3 is:** the proposal's W3: "phones backgrounded and foregrounded; a Wi-Fi to mobile data switch". Its pass condition is "every client back in its seat, with no lost answer".
- **Who runs it:**
  - **the operator** on the validation install, inside an owner-approved window;
  - **someone holding two physical phones:** an iPhone with Safari and an Android phone with Chrome.

  Claude doesn't operate the account, and runs no phone.
- **The local rehearsal of the same check:** `scripts/beta/w3-rehearsal.sh` ([evidence](../evidence/beta-r4-w3/README.md)). It is browser pages on one machine, with a simulated interruption. **That proves the app's recovery logic and gives the time budget below. It doesn't prove a phone or a real network.**

## Before W3
1. **W1 and W2 have passed** on this service.
2. **The owner opened a window**, and the operator turned maintenance mode **off**.
3. **The data:** the install still runs with the **throwaway** data folder `/var/data/cgn-w1` and the **throwaway** access code. Never the real ones.
4. **Devices, each on the current OS and browser:**
   - **Host:** a laptop browser. It never loses its network in this drill.
   - **TV:** a second laptop or a TV browser. It also never loses its network.
   - **Guest 1:** an iPhone with Safari.
   - **Guest 2:** an Android phone with Chrome.

   Each phone needs both **Wi-Fi** and **mobile data** available, and the operator must be able to switch Wi-Fi off.
5. **Throwaway names:** `W3 Host`, `W3 iPhone` and `W3 Android`. No real names.
6. **Before starting, write down** each phone's model, OS version and browser version.

## Start from a known room and round
1. **Admit every device.** On each one, open the service's URL, enter the throwaway code at the gate, and confirm the home screen appears.
2. **Create the room.** On the host, choose **Host a game**, enter `W3 Host`, and continue. A casual room opens, with the room code on the host's screen. **Never photograph or copy that code into evidence.**
3. **Join the phones.** On each phone, choose **Join**, type the name and the room code, and wait for "You’re in, …".
4. **Join the TV.** On the TV, choose **Join**, type the room code, and choose **Watch as spectator — no seat needed**. The TV view opens.
5. **Start Trivia.** On the host, pick **Trivia** and start it. A casual room plays it as Practice. Each phone shows the briefing; everyone taps **I’m ready**.
6. **What must now be visible:**

   | Role | What it shows |
   |---|---|
   | **Each phone** | `Question 1 of 10`, with four answers to tap |
   | **Host** | its own question 1 |
   | **TV** | `Featured question (Q1 of 10) · each phone goes at its own pace` in its top bar |
7. **Each phone answers question 1.** Each phone must show `Answer locked in` (and briefly "Saved."). That answer is **acknowledged**. Note the time. Then tap **Next question**, so each phone is on question 2, **unanswered**.

Casual Trivia is self-paced, so a phone that drops away doesn't hold anyone else up. That's what lets each check below run on one phone while the others wait.

## The checks (each phone in turn)
Run C1–C4 on the iPhone, then on the Android phone.
- **Observations:** after every check, note on the phone, the host and the TV what each showed and when.
- **"Usable" means:** the phone shows the question it was on, with its answers tappable, and no "Reconnecting…" banner.

| # | On the phone | Expected on the phone | Expected on the host and the TV |
|---|---|---|---|
| **C1** Background and foreground | On an unanswered question, leave the browser for **30 s**: iPhone swipe up to Home; Android Home button. Then open the browser again. | The same name, the same round and the same question; earlier answers still locked in. At most a short banner, `Connection lost. Reconnecting…`, then `Reconnected. Answers the game confirmed are safe.` | **During the round, presence shows only on a waiting phone.** A question screen and the TV's playing view don't say who is away; a phone that has answered everything and is waiting does, with **Reconnecting** or **Away** on the seat, then the name again. The host keeps its own screen, and the TV keeps `Featured question (Q1 of 10) · each phone goes at its own pace`. Neither shows an error. |
| **C2** Lock and unlock | On an unanswered question, lock the phone for **60 s**, then unlock it. The browser stays in front. | As C1 | As C1 |
| **C3** Wi-Fi to mobile data | On an unanswered question, with mobile data on, **switch Wi-Fi off** (or walk out of Wi-Fi range). Keep the browser in front. | The banner appears, by itself or within about 10 s: on a silent path change only the app's own watchdog notices. Then it recovers on mobile data by itself, with **no reload and no rejoin**, as C1. | As C1 |
| **C4** Interrupted submission | On an unanswered question, **turn on airplane mode**, then **tap an answer**. | The phone must **not** claim it's in. It says `We couldn’t confirm that — check your connection. If it doesn’t show as in, try again.` | (nothing changes) |
| | **Turn airplane mode off.** Wait until the banner says `Reconnected`. | **Exactly one of these:**<ul><li>the question shows `Answer locked in`: the tap did arrive;</li><li>the question is still open, because it didn't arrive. Tap the answer **once**: it must lock in.</li></ul>A second, different tap on a locked question is impossible: the server refuses it. | The ring shows that one answer, once |

Then turn Wi-Fi back on, and let every phone **finish the round** (all 10 questions).

**At the end:**
- each phone's results show its own points;
- **the points must be 120 × the number of correct answers** that phone shows (Practice Trivia: 100 points plus the 20-point speed bracket each);
- the host and the TV show the **same finished round and the same standings**:
  - **On the TV:** its top bar reads `Game finished`, and the **Leaderboard** tab under it shows every player's points.
  - **On each phone:** **Standings**, at the end of the review buttons, shows every player's points, with your own row as `You`.
  - Every screen shows the same points for each player;
- no seat is still "away".

## The observation budget
These are taken from the local rehearsal, then rounded up, with margin for a phone and a real network.

| Measure | Rehearsal (local, Chromium) | **W3 budget on a phone** |
|---|---|---|
| The banner after the network drops | about 0.01 s when the page is told it's offline; **8.5–8.7 s** on a silent drop, via the app's 8-second staleness watchdog | **within 15 s** |
| The server marks the seat away (an API reading in the rehearsal; on a phone, only its waiting screen shows it) | about 0.02 s (told offline); 8.6–8.7 s (silent) | informational: note it if a waiting phone shows it |
| Usable after the phone's network is back | 0.07 s (told it's online); 0.6–0.8 s (silent). By design at most about 10 s: the app's reconnect back-off is capped at 10 s. | **within 15 s** |
| The server marks the seat back (API, as above) | the same as usable, about 0.07–0.8 s | informational, as above |
| An interrupted submission shown in, after the network is back | 0.2 s | within 15 s |

Measure from the moment **the phone's own network** is back (Wi-Fi joined, or mobile data bars showing; airplane mode off), not from the moment the switch was flipped.

- **The time to allow:** about **30–40 min** for both phones: setup 5 min; C1–C4 on one phone about 10 min; the same on the other; finishing 5 min.

## Pass, fail and inconclusive
- **PASS** needs all of these, on both phones:
  - every check recovered within budget;
  - the same seat (the name, with no rejoin or recovery code asked for) and the same round;
  - every acknowledged answer kept;
  - every question answered once;
  - the final points equal 120 × correct;
  - the host and the TV in the same phase;
  - nothing secret in the evidence.
- **FAIL** if any of these happens:
  - an acknowledged answer is lost;
  - a question is counted twice, or the points don't match;
  - the phone lands in a different seat, or asks to rejoin or for a recovery code without being told to;
  - the phone, host and TV still disagree **60 s** after the network is back;
  - a code, a token, a cookie or a hidden answer appears in the evidence.
- **INCONCLUSIVE** in any of these cases:
  - the device didn't really change state (for example, Wi-Fi went off but the phone never left it);
  - recovery took **15–60 s**;
  - a screen couldn't be observed.

  **Repeat that check once.** A second inconclusive result is reported as such, with the notes.

## Evidence: what to record, and what never
- **Record:**
  - each device's model, OS and browser version;
  - the time of each step, and what each screen showed, **in words**;
  - the measured times, and the verdict per check.
- **Screenshots:** only a phone's question or locked screen, and a results screen.
- **Never record:**
  - the access code, the room code or its QR (on the host lobby and the TV join panel: crop them or leave them out);
  - recovery codes, URLs with tokens, or cookies;
  - real names;
  - a correct answer before the round has ended.

## If it fails
1. **Keep the evidence and stop:** W4 doesn't start.
2. **Report** which check, which phone, and what each screen showed, with the times.
3. **A runtime defect** is reported for architecture review. The release pin stays as it is.

## The local rehearsal (W3, prepared)
```
MCHEZO_CHROMIUM_PATH=<a chrome-headless-shell build> bash scripts/beta/w3-rehearsal.sh <packaged image tag> <work dir>
```
- **The harness** runs the packaged pinned image in production mode, with a throwaway folder and code, behind `scripts/beta/render-like-proxy.mjs`. It then runs `scripts/beta/w3-rehearsal.mjs`: Chromium pages for the host, the guest and the TV.
- **Isolation** (review 6930033578):
  - each run has its own id and container name, and removes only the container its own `docker run` created, after checking that container's run label. Nothing is deleted in advance;
  - it starts nothing if a port is already in use;
  - every startup step must succeed before the next: the image, the container, readiness, the pinned revision, authorization, the proxy;
  - it stops only the processes it started;
  - the code and the TLS key live in a private directory, removed on exit. The work directory and its evidence are kept.
- **The checks:** R1–R5 (the driver's header):
  - an acknowledged answer, then an outage the page is told about;
  - a **silent** outage, with traffic stopped both ways and nothing telling the page;
  - an **interrupted submission**: the request arrives but its response is lost, during an outage, and again with the network up;
  - the same seat and round, and each answer once;
  - **what each screen renders**, read from its own page: during the outage, the host's question and the TV's playing-round line, both agreeing with the server's status; at the end, the host's, the guest's and the TV's standings, each with every recorded score;
  - the server's record: the final points equal the score of the recorded answers.
- **Labels:** checks say where a value comes from: "rendered" is a screen's own page, "API" is the server's record read over HTTP. Presence (away or back) is an API reading: in the rehearsal the host stays on its question screen, which doesn't show presence.
- **Bounds:** 600 s, and the driver's own limit. Afterwards it confirms that none of its containers, processes, listeners or private files is left, and that no log or evidence file holds the code or a cookie.
- **The driver is local only:** it refuses any origin but `https://localhost` and `https://127.0.0.1`.
- **The harness's negative controls,** `scripts/beta/w3-harness-selftest.sh <image tag>`:
  - with a mock Docker: a failed `docker run`, a missing image, a container that exits before it is ready, a wrong revision, and a failed authorization;
  - with real Docker: a passing run beside a pre-existing `w3-svc` container and a look-alike process, which both survive; a port already in use; a container that never becomes ready; a wrong revision; an interrupted run; and the driver's `--control stale-host`, where a frozen host page must fail the host's rendered check.

**What the rehearsal does not cover:** a real phone's backgrounding, locking or network handoff; Safari's and Chrome's own suspension of background pages; a real mobile network; Render. Those are C1–C4 above, and they stay **pending** until run on physical devices.
