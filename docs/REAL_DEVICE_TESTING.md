# Real-device acceptance test: Mchezo on real phones

**Goal:** one real game session on real iPhones and Android phones, on your home Wi-Fi, that feels smooth and fun, with every problem written down so it can be fixed.

**Cost:** nothing. The app runs on your own computer and the phones reach it over your Wi-Fi. There is no deployment, tunnel, public address or external service. If home Wi-Fi turns out not to work (see "If phones can't connect"), stop and tell me: I'll present the alternatives and ask before using any of them.

**Which code to test (updated 2026-11-09, Stage 5.1):** the checkout below is the Stage 5 QA branch `claude/stage5-audit-repairs`, which carries Stage 5 and the Stage 5.1 repairs. It replaces the older `claude/real-device-acceptance` branch. Real-device testing has **not** been done yet. The Stage 5.1 items to check are in `docs/stage5-qa/README.md` §13.

**Time:** about 20 minutes to set up, then about 90 minutes of play with 4 to 6 people.

**People and devices:**
- One computer: Mac, Windows or Linux, on the same Wi-Fi as the phones.
- At least one iPhone (Safari) and at least one Android phone (Chrome). More phones are better; 4 or more players unlocks every game.
- Optional: a TV or a second laptop for the big screen.
- One person, the **recorder**, writes results in the results sheet (section 5).

---

## 1. Set up the computer (once)

1. Install **Node.js 22 or 24** from nodejs.org. Check it in a terminal: `node -v`.
2. Get the code and install it:
   ```sh
   git clone https://github.com/kekuBT/christmas-game-night-pilot.git
   cd christmas-game-night-pilot
   git checkout claude/stage5-audit-repairs
   npm ci
   npm run build:web
   ```
   You don't need Playwright or a browser download for this; those are only for the automated tests.
3. Start the test server:
   ```sh
   npm run serve:device-test
   ```
   It prints three lines. The last one is what you need:
   ```
   TEST MODE: provisional content treated as approved (not a human review)
   Christmas Game Night server on http://localhost:3000 (...)
   Phones on the same Wi-Fi: open http://192.168.1.23:3000 on the host device (not localhost), so the QR code works.
   ```
   Write down that `http://192.168.x.x:3000` address. If it lists more than one, use the one starting `192.168.` or `10.`.
4. **Allow the connection when asked.**
   - **macOS:** "Do you want the application node to accept incoming network connections?" Choose **Allow**.
   - **Windows:** the Defender Firewall prompt. Tick **Private networks** and choose **Allow**. Your Wi-Fi must be set to the Private network profile.
5. **Check it from one phone before anyone else joins.** Open the address in the phone's browser. You should see the Mchezo home screen with "Host a game" and "Join the game".

**About test mode.** `serve:device-test` treats provisional content as approved so that official games have questions. This is not a content review. Nothing from a test Cup counts as official. It keeps its data in `./data-device-test`, separate from `./data`. Stop the server with Ctrl+C. Rooms survive a restart.

**Keep a server log.** This makes failures much easier to diagnose.
- macOS/Linux: `npm run serve:device-test 2>&1 | tee device-test.log`
- Windows PowerShell: `npm run serve:device-test 2>&1 | Tee-Object device-test.log`

### If phones can't connect

| Symptom | Likely cause | Fix |
|---|---|---|
| The page never loads on the phone | The phone is on a different network (mobile data, a guest Wi-Fi, a 5 GHz/2.4 GHz split with isolation) | Put the phone on the same Wi-Fi as the computer and turn mobile data off for the test |
| It loads on the computer but not on any phone | The firewall is blocking it | Allow Node in the firewall (step 4) and set the Wi-Fi to Private on Windows |
| It still fails | The router has client/AP isolation on (common on guest and mesh networks, hotels and offices) | Turn isolation off in the router, or use the free fallback: turn on one phone's **personal hotspot** and connect the computer and the other phones to it. Local traffic doesn't use mobile data, but keep that phone plugged in |
| The page loads but shows "Connection lost. Reconnecting…" forever | Something between the phone and the computer blocks WebSockets (a VPN, a content filter, a proxy) | Turn off VPN or filter apps on the phone and computer. Record it as an issue |
| The QR code warns "This QR points to http://localhost…" | The host opened `localhost` instead of the Wi-Fi address | Open the `http://192.168.x.x:3000` address on the host device |

If none of this works, stop there and tell me. Don't set up a tunnel or a hosting service: those need your approval first.

---

## 2. Before you start (5 minutes)

- [ ] Every phone is on the same Wi-Fi, with mobile data off and VPN off.
- [ ] Phones are on normal settings: normal auto-lock, normal text size, Low Power Mode off, not a private tab. Some checks below change these on purpose.
- [ ] The recorder has the results sheet open (section 5), and fills in one row of the device table per phone.
- [ ] Decide who hosts. The host can be a phone or the computer's browser. **The host must open the `192.168.x.x` address, never `localhost`.**

---

## 3. The acceptance run

Work through the parts in order. Each row has a **Pass if** column, and the recorder marks it ✅, ❌ or ⚠️ (works, but awkward). Any ❌ gets an issue row in section 5. Don't stop to debug: write it down and move on.

### Part A: Hosting and joining (10 min)

| # | Do this | Pass if |
|---|---|---|
| A1 | The host opens the Wi-Fi address, taps **Host a game**, picks **Family Cup** (this run checks Cup scoring in Part E; hosting is Casual unless you pick it), types a name and taps **Host a game** | The lobby shows "You're in, *name*", a room code, a Cup chip, and an **Invite by QR** card with a QR code and no localhost warning |
| A2 | An **iPhone** scans the QR with the Camera app | Safari opens the join screen with the code already filled in |
| A3 | An **Android** phone scans the QR (Camera or Google Lens) | Chrome opens the join screen with the code already filled in |
| A4 | One phone types the 6-character code by hand instead (try lowercase) | It joins the same room |
| A5 | **Three or more people tap Join the game within the same few seconds** | Everyone gets in, each name appears once on the host screen, and nobody gets an error or a duplicate seat |
| A6 | Someone tries a name that is already taken | They are told plainly and can pick another |
| A7 | Someone types a wrong code | A clear message, with no crash and no stuck spinner |

### Part B: Play the games (45 to 60 min)

The host picks each game with **Choose a different game**, then **Official** and **Start**. Play at least the first four.

| # | Game | Players | Pass if |
|---|---|---|---|
| B1 | **Trivia Showdown**, official | 2+ | Questions appear on every phone at the same time; tapping an answer locks it; after the lock everyone sees the correct answer and the explanation; the game ends by itself |
| B2 | **Math Mayhem**, official | 2+ | The number keypad works on both iPhone and Android (no zoom jump, and the keyboard doesn't hide the answer); a speed bonus is shown |
| B3 | **Word Connections**, official | 1+ | Selecting 4 tiles and submitting works by touch; a wrong group costs a mistake; solved groups lock in |
| B4 | **Category Sprint**, official | 4+ | Typing answers works on both keyboards (watch autocorrect and capitalisation); the results explain every answer (accepted, shared, or not accepted and why). **Congo check:** one player types just "Congo" in an Africa round, if one comes up. It should score nothing, and the results should explain the two Congos |
| B5 | **Guess the Year** or **Closest Wins** | 2+ | Number entry works; results show who was closest |
| B6 | **Impostor** or **Caption Clash** | 4+ | Each player sees only their own word or prompt (see Part D); voting works |
| B7 | One **practice** game (any) | | It plays the same, but scores don't count toward the Cup (check in Part E) |

For each game, the recorder also notes the **feel** in a few words: "fun", "confusing start", "waited too long", "too fast to read". This matters as much as the ✅.

### Part C: Interruptions (do these *during* B1 to B4)

Try each one on at least one iPhone **and** one Android phone.

| # | Do this, in the middle of a game | Pass if |
|---|---|---|
| C1 | Switch to another app for 30 seconds, then come back | "Reconnected" shows briefly; you're on the same question; answers you already gave are still there |
| C2 | Lock the phone for 2 minutes, then unlock | Same as C1. The host saw you as reconnecting or away, then back. No duplicate seat |
| C3 | Pull to refresh, or tap reload | Same seat and same answers; you don't have to rejoin |
| C4 | Turn Wi-Fi off for 20 seconds, then back on | A "Connection lost" banner while offline; it reconnects by itself |
| C5 | Close the browser tab completely, open the address again, and rejoin with the same code | Without "Remember this device": the join screen comes back and **Lost your place? Recover your seat** works. With it ticked at join: "Welcome back · Continue as *name*" |
| C6 | **The host's** phone or computer locks for 1 minute mid-game | The game keeps going for everyone else; the host comes back in control |
| C7 | Stop the server (Ctrl+C) for 15 seconds mid-game, then start it again | Every phone shows reconnecting, then carries on with no lost answers. Note anything lost |
| C8 | A player taps **Sit this game out**, in a game that offers it (for example Math Mayhem or Word Connections) | They are not blocking the game, and they score nothing for it |

### Part D: Privacy and reveals

| # | Check | Pass if |
|---|---|---|
| D1 | While a Trivia question is open, compare two phones side by side | Neither phone shows which answer is correct, or what anyone else picked, until the lock or reveal |
| D2 | In Impostor or Caption Clash, compare phones | Each player sees only their own secret word or prompt |
| D3 | The TV or spectator screen during a question (Part F) | It never shows a correct answer that can still be played, and never a secret word |
| D4 | After the lock or reveal | Everyone sees the same correct answer, and the explanation is readable |

### Part E: Scores, rankings and Cup progression

| # | Check | Pass if |
|---|---|---|
| E1 | After each official game, each player reads out their total from their own phone | It matches that player's row on the results and leaderboard screens |
| E2 | Look at the ranking after two or three official games | The order matches the totals; ties are shown as ties |
| E3 | The host opens **Championship** | Standings include the official games and not the practice game (B7) |
| E4 | The host taps **Advance to next day**, then plays one more official game | The lobby shows "Day 2 of 7"; day 1 results are kept; the new game counts for day 2 |
| E5 | After C1 to C7 | No score went missing, doubled, or moved to the wrong person |

### Part F: Optional big screen (TV or second laptop)

| # | Do this | Pass if |
|---|---|---|
| F1 | On the TV browser, open the Wi-Fi address, tap **Watch as spectator — no seat needed**, and enter the code | It shows the room without taking a player seat (the host's player count doesn't change) |
| F2 | Watch one Trivia game on it from the sofa | Readable at a distance; shows progress and reveals; no secrets (D3) |
| F3 | A player opens **TV stage** in the lobby on their own phone, then goes back | It's only a view: their seat and game are unaffected |

### Part G: Layout and accessibility (5 min, any time)

- [ ] Nothing is cut off or overlapping on the smallest phone in the room, in portrait.
- [ ] On phones with a notch or a home bar, banners and buttons aren't hidden behind them.
- [ ] Largest text size (iOS Text Size or Android Font size): the main buttons are still usable.
- [ ] Rotating to landscape and back doesn't break anything.
- [ ] Tap targets are comfortable for the oldest and youngest players.

### Part H: Errors and recovery

| # | Do this | Pass if |
|---|---|---|
| H1 | Host tries to start a 4-player game with fewer players | A clear "needs at least N players" message |
| H2 | A player taps buttons rapidly (double-tap Join, double-tap an answer) | Only one join and one answer count |
| H3 | **Recovery code.** In "This device", get a recovery code, then use it on a second phone via **Lost your place? Recover your seat** | The second phone gets the seat; the first phone says the seat moved. **Copy code** may say to write it down: that's expected on a home-Wi-Fi address (copying needs HTTPS) |
| H4 | **Host-assisted recovery** on a third phone | Both screens show the same 4-digit number; after the host approves, the phone gets the seat |

### Part I: Play solo and casual hosting (10 min, Stage 6.1)

Do these on phones that open the **Wi-Fi address** (not localhost): plain http there is what a family phone uses, and it is exactly where a Stage 6.1 check found every answer refused before the fix (D-S61-07).

| # | Do this | Pass if |
|---|---|---|
| I1 | On an **iPhone** and an **Android** phone: Home → **Play solo** → **Start** | The first question appears after those two taps, with no code, name or lobby |
| I2 | Play the round to the end, then **Play again** twice | Every answer registers; each round has its own score; the first says "first personal best on this device", a lower one "still …", a higher one "New personal best" |
| I3 | Mid-round, tap **Leave round**, then **Keep playing**; then leave for real | Keep playing keeps the round; leaving asks first, then lands on Play solo with the best unchanged |
| I4 | Mid-round, reload the page (or close and reopen the tab) | The round's start screen, not a stuck loading screen; **Start** says the last round was interrupted and begins a fresh one |
| I5 | In a **private / incognito** tab, play a round | It plays; the screens say a personal best can't be kept or wasn't saved |
| I7 | Play solo → **Pattern Pulse** → Start; play all six rounds | Each pattern shows, hides, and can be tapped back; the results list all six rounds and a personal best |
| I8 | Play solo → **Word Connections** → Start; find two groups, then make four mistakes | Tiles are easy to tap; the results show the two found groups solid and the two missed dashed, and a short note that the best spans boards of different difficulty |
| I9 | Switch games: Math → Pulse → Connections → Math | Each starts fresh; each game keeps its own personal best |
| I10 | In a casual room with 3 phones: **Plan a Quick Party** → set 4 → 30 min → **Suggest a lineup** → move, remove, replace → **Use this lineup** | The planner fits the screen; every button is easy to tap; all 3 phones show the same lineup; nothing starts |
| I11 | Host: reload, then press Start | The lineup comes back; Start asks "You planned for 4; 3 are here" and **Start with 3** starts the first game through the rules screen |
| I12 | A guest: look for a way to edit the lineup | None; only the host (or a cohost) sees Edit and Clear |
| I13 | Casual room, 2 phones and a TV, a lineup of Math then Trivia: play Math to the end | Both phones show one results screen saying Casual (no 🎄 header, no Championship), the standings and your own answers; the host has **Next game: Trivia Showdown**; the other phone says "Keku starts it"; the TV shows the next game; nothing starts by itself |
| I14 | Host: **Next game**, play Trivia; then **Play again** | Trivia starts through the rules screen; afterwards everyone (and the TV) sees "That was the whole lineup"; Play again starts a fresh Trivia and the lineup stays complete |
| I15 | Host: **Take a break** on the results; everyone goes back to the lobby; reload a phone; then **Resume** | Every phone and the TV say "On a break"; the host's Start waits; a guest has no Resume; after a reload it's still a break; Resume clears it for everyone |
| I16 | Host: turn Wi-Fi off just after pressing **Next game**, then on again | Exactly one game starts (the rules screen appears once on every phone); no error about a second game |
| I17 | Casual room, 3 phones and a TV, between games: host → **Room menu** → **Make host** next to a player → read the question → **Cancel**, then do it again and confirm | The question names the player and says the host becomes a regular player; Cancel changes nothing; after confirming, every phone shows who did what, the old host's Start is gone, the new host has it, and the TV marks the new host |
| I18 | The new host: **Take a break**, then hand the host role back; the old host taps **Resume** | The break stays through the handover; only the current host sees Resume |
| I19 | Turn one player's Wi-Fi off, then open the host's **Room menu** | That player shows "not connected" and can't be made host |
| I20 | Solo **Word Connections** on a phone: play, then **Play again** five times | Every board is new to this phone's solo room; no board repeats before all 13 have come up |
| I21 | Casual room, on the results: **Play again**, then **Cancel game** in the rules screen; then **Back to lobby**, start a game and cancel it | The first question says you'll go back to the results, and you do; the second says the lobby, and you go there |
| I22 | **Play solo** on a small phone and on a large one, then on a laptop | Phones: compact cards, two games' Start on the first screen of a large phone; laptop: all three games side by side |
| I23 | Solo **Pattern Pulse**: play a round, then wait on the next round's screen; turn the phone's clock a few minutes wrong first if you can | "Game time left" counts down on the screen between patterns and matches the real time left; when it runs out, Show me the pattern is replaced by "The game's time is up", then the results |
| I25 | Solo **Pattern Pulse**: wait on a round's screen until the game's time is nearly up, then turn Wi-Fi off; turn it on again a little later | At 0:00 the screen says the game server isn't answering (not that results are coming) and offers **Check again** and **Leave round**; with Wi-Fi back, Check again shows the results |
| I24 | Hold the phone sideways: solo Pattern Pulse (tap a pattern back) and Math Mayhem; a casual room's rules screen | Every shape, Lock it in and all four answers are on screen without scrolling; on the rules screen, I'm ready stays at the bottom while you scroll the rules |
| I26 | **Play solo**, choose **Content: Christmas**; then a casual room where the host chooses Christmas and a guest picks **Look → Everyday** on their phone (room menu) | The phone turns pine and cranberry, the browser's top bar (iPhone Safari) or status bar (Android Chrome) included; Word Connections deals a Christmas board. In the room, the guest's look changes only that phone; every phone still says "Christmas content" |
| I27 | **Settings → Look → Christmas** on one phone, then home, a Family Cup lobby and the library | That phone shows Christmas colours everywhere; another phone on Match the game shows the Cup in everyday colours; both read easily in daylight |
| I6 | Host a game without touching the Casual/Family Cup choice; a second phone joins | No Cup chip, no Official/Practice choice; both phones say "Casual, just for fun"; a game plays to results and the lobby says "Last game · … · Casual" |

### Part J: Put Mchezo on the Home Screen (15 min, Stage 8.3)

**Read first.** Browsers run Mchezo's service worker (the offline screen, the update notice, Android's install prompt) only on **HTTPS**, or on `localhost`. Over the plain-http Wi-Fi address:
- an **iPhone** can still Add to Home Screen (J2, J3), but J5 to J8 need an HTTPS preview, such as a private Codespaces port opened on the phone;
- an **Android** phone can treat the Wi-Fi address as secure: in Chrome open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<the address>:<port>`, and relaunch.

Write down which way you reached the app for each row.

| # | Do this | Pass if |
|---|---|---|
| J1 | **Android Chrome** (HTTPS, or the flag above): Home, scroll below the games → **Install Mchezo** → the browser's Install | The browser's own dialog appears only after you press Install. The Home screen gets the circle-and-dots icon ("Mchezo"); it opens full screen, with no address bar, on Home |
| J2 | **iPhone Safari**: Home, scroll below the games → **Show me how** → follow the three steps | The steps match what you see (Share, Add to Home Screen, Add). The icon is the circle-and-dots mark, not a screenshot of the page; it opens without Safari's bars, on Home |
| J3 | Open the installed app → **Settings** | It says you're using Mchezo from your Home Screen; Home shows no install card |
| J4 | In the browser (not the app): **Not now** on the card, reload; then play a whole game | The card stays gone (Settings still explains how); no install pop-up ever appears during a game |
| J5 | Installed app (HTTPS): airplane mode on, then open it | Mchezo's own screen says "Can't reach Mchezo … Nothing has started" (not a browser error page); **Try again** keeps saying so until the connection is back, then it goes |
| J6 | In a room, airplane mode for 20 seconds, then off; also close and reopen the app while offline | "Connection lost. Reconnecting…", then the same seat in the same room. Reopened offline it says it is rejoining, then you are back |
| J7 | Join a room in the browser; note your personal best and look. Then open the installed app | **Record what the app has:** the seat, the best, the look. The steps only say it *may not* share the browser's data. If the seat isn't there, **Lost your place? Recover your seat** with a recovery code or the host's help gets it back. Joining with the code again makes a new seat, not the old one |
| J8 | **Update during play** (HTTPS; someone rebuilds and restarts the preview server while you play a solo round) | The round carries on (no reload). Back on Play solo, "A newer version of Mchezo is ready" with **Reload** and **Later**; Reload shows the new build; your look, content choice and bests are kept |
| J10 | On the private HTTPS preview, if it asks you to sign in: open the app before signing in, then sign in and reload | No sign-in page is ever kept as Mchezo's offline screen: offline afterwards, you see Mchezo's own "Can't reach Mchezo" (or nothing installed yet), never the sign-in page |
| J9 | **Settings → Look → Christmas**, then reopen the installed app | The app opens in Christmas colours (the icon stays the circle mark); the status bar matches the page |

---

## 4. Did it feel good? (5 min, at the end)

Ask everyone these four questions and write down the answers word for word:

1. Which game would you play again tonight? Which one would you skip?
2. Was there a moment where you didn't know what to do, or were waiting and bored?
3. Did anything feel slow, laggy or unfair?
4. On a scale of 1 to 5, how much did you enjoy it?

**Overall verdict (the host decides):**
- **Ready:** we could run the real night like this.
- **Ready after fixes:** list the blockers.
- **Not ready.**

---

## 5. Recording results

Copy [`device-testing/RESULTS_TEMPLATE.md`](device-testing/RESULTS_TEMPLATE.md) to `device-testing/results-YYYY-MM-DD.md` and fill it in during the run. A paper copy works too. It has:

- **A device table:** one row per phone, with model, OS version, browser and version.
- **A checklist table:** every row ID from section 3, with ✅/❌/⚠️ per platform.
- **An issue log:** one row per problem.

**Severity:**
- **Blocker:** we can't run the real night with this (a lost score, someone locked out, a leaked answer, or a game that can't finish).
- **Major:** it hurts the night but there is a workaround.
- **Minor:** cosmetic or rare.
- **Feel:** it works, but isn't fun or is confusing.

For each issue, if you can, also capture:
- a **screenshot or screen recording** from the phone;
- the **room code** and the **time** (so the server log lines can be found);
- **what you expected** versus **what happened**.

**Afterwards, send me:**
- the results file;
- `device-test.log`;
- a zip of `data-device-test/`, the room snapshots, which let me replay exactly what happened. It contains only the names people typed and their answers; nothing leaves your computer unless you send it.

**What happens next:**
- **Blockers:** I write a failing test that reproduces each one, then fix it and re-run the gate before anything is demoed again (AGENTS.md safety rule).
- **Majors and Feel items:** they come back to you as a short ranked list.

Earlier device checklists ([DEVICE_ACCEPTANCE_CHECKLIST.md](DEVICE_ACCEPTANCE_CHECKLIST.md), Sprint 2) are folded into Parts C and H above.

---

## 6. What was checked before handing this over, and what wasn't

**Checked automatically (desktop Chromium emulating a phone screen):**
- Stage 6.1: Play solo and a casual game over plain http at the machine's own network address (an insecure context, as on a family phone), in `check-solo` and `check-casual`;
- the server lists the computer's Wi-Fi address;
- a host who opens a non-localhost address gets a QR code pointing at that address, with no localhost warning;
- players join through the QR link, and the WebSocket connects and stays connected;
- the regression gate's full suite (multiplayer, reconnect, mobile layout, TV, privacy) passes on this branch. The verdict is in `docs/PROGRESS.md`.

**Not checked: this is what the real-device run is for.**
- real iOS Safari (WebKit) and Android Chrome;
- real Wi-Fi, routers and firewalls;
- the phone camera's QR scanning;
- background and lock behaviour of real mobile browsers;
- real keyboards (autocorrect, number pads);
- real TV browsers;
- whether it is fun.

*Note:* inside the cloud sandbox where this was prepared, browser WebSockets to a non-localhost address are refused by the sandbox's own network proxy. With the proxy taken out of the path they connect normally. This is a property of that sandbox, not of the app or of a home network.
