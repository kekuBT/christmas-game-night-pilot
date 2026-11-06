# Real-Device Acceptance Checklist (Sprint 2 features)

Automated tests run in desktop Chromium (headless shell) with emulated phone sizes. **None of this has been tried on a physical phone or TV yet.** Run this once on the actual family devices before the first official night. It takes about 30 minutes with 3 people.

Setup: the host laptop serves the app on the home Wi-Fi (`npm run serve`, open `http://<laptop-LAN-IP>:3000`). Devices: at least one iPhone (Safari), one Android (Chrome), and the TV browser if used. Write down device, OS and browser version for each row.

## A. Connection and presence

| # | Do this | Expect | iPhone | Android |
|---|---|---|---|---|
| A1 | Join, then lock the phone for 10 s, unlock | Banner "Connection lost. Reconnecting…" may flash, then "Reconnected. Your progress is saved."; host sees you back within ~5 s | | |
| A2 | Lock the phone for 2 minutes during a Trivia game, unlock | Back on your question; earlier answers still locked in; host saw you as "Reconnecting", then "away" after ~45 s | | |
| A3 | Switch to another app for 1 minute, come back | Same as A1; no duplicate seat on the host screen | | |
| A4 | Turn Wi-Fi off for 20 s (mobile data off too), then on | Banner while offline; reconnects by itself when Wi-Fi returns | | |
| A5 | Pull-to-refresh / reload during a game | Same seat, same answers | | |

## B. Host readiness

| # | Do this | Expect |
|---|---|---|
| B1 | Everyone connected, host taps Start (official) | Starts straight away; no extra question |
| B2 | One player locks their phone; host taps Start within 45 s | Host is asked "<name> is reconnecting. Start without them?"; "Wait" starts nothing |
| B3 | Player unlocks while the question is shown | Question disappears; host just taps Start; that player is in the game |
| B4 | Host chooses "Start without <name>" | That player is not in this game, and gets no question screen when they come back |

## C. Remember this device

| # | Do this | Expect | iPhone | Android |
|---|---|---|---|---|
| C1 | Join WITHOUT "Remember this device", close the tab, open the app again | Join screen, no saved seat (privacy default) | | |
| C2 | Join WITH "Remember this device", close the tab, reopen | "Welcome back · Continue as <name>"; continuing lands in the same seat | | |
| C3 | Same as C2 but fully quit the browser app first | Same as C2 | | |
| C4 | In the lobby, "This device" → turn Remember off; close the tab; reopen | No saved seat offered | | |
| C5 | Private/Incognito tab | "Remember this device" is disabled with an explanation; you can still play | | |

## D. Recovery

| # | Do this | Expect |
|---|---|---|
| D1 | "This device" → Get a recovery code; tap Copy code | Code appears once, grouped XXXXX-XXXXX-…; copying works (or says to write it down) |
| D2 | On a second phone: "Lost your place? Recover your seat" → code | Second phone gets the seat and a NEW code; the first phone shows "This seat moved to another device" |
| D3 | Type the code with lowercase/spaces | Still works |
| D4 | On a third phone, ask the host for help | Both screens show the same 4-digit number; after the host's two taps the phone gets the seat; everyone sees "<host> restored <name>'s seat" |
| D5 | Screen reader (VoiceOver/TalkBack) on the recovery code screen | Code is read character by character; buttons are announced |

## E. Accessibility and layout

- [ ] Largest text size (iOS Dynamic Type / Android font scale): banners, readiness card and recovery screens are readable, with nothing cut off.
- [ ] Reduced motion on: the banner and notices appear without animation.
- [ ] Notch and home-indicator phones: the banner sits below the notch, and the notice sits above the home bar.
- [ ] TV browser: notices are readable from the sofa (if a TV is used).

Record failures with a screenshot and the device row. Anything in A or D failing should block the first official night.
