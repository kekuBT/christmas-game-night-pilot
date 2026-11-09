# Stage 5: the complete game night

**Branch:** `claude/stage5-complete-game-night`, from the Stage 4 record `b706a84`.
**Decisions:** D-S5-01 to D-S5-13 in `docs/DECISIONS.md`. **Audit:** `docs/stage5/AUDIT.md`. **Plan:** `docs/stage5/PLAN.md`.
**Scope rules kept:**
- No merge, deployment, port exposed, paid service or spend.
- No change to existing game scores, Cup rules, content approvals or Cup history.
- Every new game is Practice-only.

**What "tested" means here:** Chromium only. That is chrome-headless-shell 153 (Playwright build 1243), with emulated phones at 320, 375, 390 and 430 wide, and TVs at 1280×720, 1440×900 and 1920×1080.
- Chromium is **not** Safari.
- **No real iPhone, Android phone or TV was used**; §14 is the checklist for them.

## 1. Executive summary

Stage 4 was already complete before this stage began: its verified code was `84ed7ed`, with a full gate PASSED, 59/59. Stage 5 delivered:

- **Every game screen tells the truth about a send** (S5-P, then S5-F for the older panel). Nothing shows as in until the server has it. A failed send says so and keeps what was entered. The reconnect banner promises only what the server confirmed.
- **A live show on the TV** (S5-A).
  - One Night Circle frame for the room TV and spectators, always labelled Lobby, Getting ready, Live, Final standings or Post-game review.
  - Per-game panels come from the public projection only.
  - Director controls never touch a server clock.
- **Between games, the host leads and everyone knows what's happening** (S5-B). Who won, your place, the host's pick and whether it fits, and what's needed. Nothing starts by itself.
- **Three new, complete, Practice-only games**, each built and verified before the next was started:
  - **Majority Rules:** predict the room, then vote.
  - **Pattern Pulse:** a self-paced memory game, accessible without colour or sound.
  - **Draw & Guess:** live touch drawing on phones, with guessing.
- **Personality from recorded facts only** (S5-E): one moment line per new game, and a still celebration for Less/Off.
- **An audit of every game** (S5-F), including an independent review of the new games. It found six issues, all low or medium-low; five were fixed, and one was narrowed with the rest put in the backlog.
- **Bluff Battle was deferred** (S5-D, D-S5-11): three verified games over four.

## 2. Baseline and branch

| | |
|---|---|
| Baseline | `b706a84`: the pushed Stage 4 head (docs only), whose code `84ed7ed` passed gate run `20261109-035458-84ed7ed0-4459` |
| Branch | `claude/stage5-complete-game-night` (pushed; not merged; not deployed) |
| Checkpoints | `cd61633` S5-P · `23f86e6` S5-A/S5-B · `70fa11b` Majority Rules · `a02588b` Pattern Pulse · `c866125` Draw & Guess · `6371425` S5-E/S5-F · `481c1f7` and `8879c3f` two drivers follow the S5-A TV |
| Verified revision | **`8879c3f`**: full gate **PASSED (exit 0)**, run `20261109-080851-8879c3f6-18873` (§11). Everything after it is docs only. |

## 3. The TV (S5-A)

- **One frame, one label.**
  - The TV and spectators get the same presentation, designed at 1920×1080 and scaled.
  - The label says exactly what is on screen.
  - A finished game opens on Final standings with a winner line; the Post-game review is a separate screen that says the game is over.
  - A briefing or live game always takes over.
- **Public projection only.** `tvFeedFrom()` takes the room's public facts and nothing private (unit-tested: `me` and `myGames` never enter it).
- **Per-game panels:**
  - Lobby: big code, roster, up next with fit, Cup top three, tonight so far.
  - Live: who's in, the clock, "N of M have started".
  - Closest Wins: never a guess while open.
  - Impostor: the phase and a clue count, never a word or a clue's text.
  - Caption Clash and Word Connections.
  - **Majority Rules:** the question, "N of M locked in"; at the reveal, totals and who called it.
  - **Pattern Pulse:** the six shapes and the room's progress, never a pattern.
  - **Draw & Guess:** the drawing, live and sized to the screen, with the word's letter pattern and who got it; the word only at the reveal.
- **Director controls:** Final standings, Post-game review, Lobby view, Pause/Resume animations, Replay, Back. They are local and presentation-only: `check-tv-show` shows the server deadline unchanged and the clock still counting while paused.

## 4. The way through a game night (S5-B)

Home → Host → Invite → Lobby → Choose → Briefing → Play → Results → Lobby → Next.
- **Before the first game:** guests get one line on how the night works.
- **Fit:** the up-next card tells everyone whether the pick fits the people connected now ("Fits the 3 here" / "Needs 1 more player · 3 here"). A guest whose pick needs more players gets the code to share.
- **After a game:** every lobby has a Last game card: the game, Official or Practice, the winner line and your own place, from recorded scores only. The TV shows what's next.
- **Nothing starts by itself.** The host's next Start brings everyone to the briefing.
- A reload, Back/Forward, reconnect, seats, room identity and Cup progress are preserved (`check-game-night-flow`, `check-f5`, `check-ws-reconnect`).

## 5. The new games

All three are Practice-only (§6), run on the common module contract (D-S5-05), and have:
- rules in the briefing;
- phone controls at 320–430;
- server-side timing and scoring;
- results with ties handled;
- a TV panel and a post-game review;
- reconnect and failed-send handling;
- an original cover;
- unit tests and a dedicated browser driver.

### Majority Rules (3–10 players, about 6 minutes)
- Five original either/or questions.
- **Step 1, predict** which answer most of the room will pick; **step 2, vote**. Both are private until the reveal.
- The reveal shows the totals, the majority and who called it. Votes stay anonymous for good.
- **Tie policy:** a split room gives every prediction 50 and names nobody. No votes means no majority.
- Driver: `check-majority-rules` (4 phones and a TV). It covers:
  - a clear majority, a 2–2 split, a skip, a reload between the steps;
  - a round nobody plays (the deadline reveals "Nobody voted");
  - a failed prediction;
  - a tie for first;
  - contrast;
  - privacy before and after the game.

### Pattern Pulse (1–10 players, about 5 minutes)
- Six self-paced rounds of 3 to 8 shapes.
- Tap "Show me the pattern" when ready. It shows for a few seconds, then you tap it back. Undo and clear are available.
- Everyone gets the same lengths and windows but their own server-made sequence. A pattern is in your own projection only while you memorise it; future rounds are never sent.
- Accessible: every symbol is a shape, a colour and a name, with no audio. Reduced motion and Off show a still, numbered row for the same time.
- A window nobody answers is closed by the **server clock** (0 points) with nobody acting.
- Driver: `check-pattern-pulse` (3 phones, one with reduced motion, and a TV). It covers:
  - privacy;
  - the server's deadline hiding the pattern;
  - undo and clear;
  - a failed send keeping the entry;
  - a reload never re-showing the pattern;
  - a missed window, sitting out and a late joiner;
  - the still celebration;
  - contrast.

### Draw & Guess (3–10 players, about 10 minutes)
- The server picks the order (everyone draws once with 6 or fewer) and the word, from 70 original drawable things.
- **Draw** with a finger or mouse: 8 named colours, 3 sizes, undo (the whole last stroke), clear, and one word swap before you start.
- Strokes are thinned and sent in batches about three times a second. Limits per message, per turn and per 2 s are enforced by the server. Unsent drawing is kept and retried.
- **Guess** by typing; matching ignores case, accents, punctuation, plurals and "the". A wrong guess says "Not it" and is never stored or shown.
- The turn ends when everyone has it, or at 75 s. A drawer who disconnects runs out the clock.
- A spectator who joins mid-turn sees the drawing, not the word.
- *Simpler-than-specified parts:* none of the required parts was cut. There is no stroke smoothing, no close-guess hint and no word filter (backlog B-4).
- Driver: `check-draw-guess` (4 phones and a TV, 60+ checks). It covers:
  - touch drawing (real touch events) and mouse drawing;
  - live TV;
  - undo and clear;
  - a mid-turn spectator;
  - a wrong guess that appears nowhere;
  - a failed guess keeping its text;
  - guess order and a skip;
  - a drawer disconnect and return;
  - give-up and swap;
  - server limits (a burst is rate-limited, an oversized message refused, a guesser can't draw);
  - TV fit at three sizes;
  - contrast.

## 6. Practice-only status

| Game | Official? | Why |
|---|---|---|
| Majority Rules | **No** (`officialEligible: false`) | New: practice-only until its Cup scoring is approved |
| Pattern Pulse | **No** | same |
| Draw & Guess | **No** | same |
| Impostor, Charades | No (unchanged) | existing decisions |
| The other nine | Yes (unchanged) | |

The server refuses an Official start with the reason. The lobby disables Official and shows the reason (`check-*` drivers for each new game). Nothing was approved to make a test pass.

## 7. Scoring and fairness

- Scores come only from the server's recorded actions. No client score is trusted.
- Existing games' scoring and the Cup are untouched (shuffle goldens were re-pinned only because the catalogue grew; the draw is unchanged).
- **Majority Rules:** 100 per right prediction; 50 to every prediction in a split room; your own vote counts.
- **Pattern Pulse:** 20 per shape right from the start, plus 50 for the whole sequence. The same difficulty and time for everyone; late answers score 0.
- **Draw & Guess:** guessers 100/80/60/50 in order; the drawer 50 per correct guesser; a turn nobody got scores nothing.
- A game ends exactly once, on completion, at a phase deadline, or at the game deadline/backstop. These paths and a restart give the same totals: unit-tested, and confirmed by the independent review.

## 8. Privacy and spectators

- **Public projection** (TV, spectators, late joiners): Majority counts, then totals; Pulse counts; the Draw drawing and letter pattern. Never a vote, a prediction, a pattern, the word before the reveal, or a wrong guess.
- **Your own phone:** your own prediction and vote, your own pattern (only while memorising), the word (only while you draw).
- **Who sat out stays private** (L33). That covers Majority's tie list, Draw's skip count and "passed" (review R1/R2).
- Every one of these checks runs in a unit test and in a browser driver against the live server.

## 9. Screenshot gallery (Chromium; `docs/stage5/after/`)

All images come from the passing gate run `20261109-080851-8879c3f6-18873` on `8879c3f` (Chromium, emulated sizes).
- **Look at these first:**
  - `dg-drawer-430.png`: the drawer's screen.
  - `dg-tv-live-1920.png`: the TV during a drawing.
  - `pp-memorise-reduced-375.png`: Pattern Pulse with reduced motion.
  - `mr-tie-320.png`: a split room at 320 px.
  - `flow-last-game-375.png`: the Last game card.
  - `tv-review-1440.png`: the TV's Post-game review.
  - `pp-results-still-390.png`: the still win ribbon.

**TV (S5-A):** [lobby 1920](after/tv-lobby-1920.png) · [Closest Wins live 1920](after/tv-closest-live-1920.png) · [Impostor live, no words 1920](after/tv-impostor-live-1920.png) · [Math live 1440](after/tv-math-live-1440.png) · [final standings 1440](after/tv-final-1440.png) · [post-game review 1440](after/tv-review-1440.png)

**Between games (S5-B):** [Last game card 375](after/flow-last-game-375.png) · [needs more players 375](after/flow-needs-more-375.png)

**A failed send says so (S5-P, S5-F):** [Trivia](after/send-fail-trivia-390.png) · [Math](after/send-fail-math-mayhem-390.png) · [Geography](after/send-fail-geography-390.png) · [Guess the Year](after/send-fail-guess-the-year-390.png) · [Closest Wins](after/send-fail-closest-wins-390.png) · [Word Connections](after/send-fail-word-connections-390.png) · [Impostor, older panel](after/send-fail-impostor-390.png) · [reconnecting banner](after/reconnecting-banner-390.png)

**Majority Rules:** [briefing 375](after/mr-briefing-375.png) · [vote step 390](after/mr-vote-step-390.png) · [failed send 375](after/mr-send-failed-375.png) · [reveal 390](after/mr-reveal-390.png) · [split room 320](after/mr-tie-320.png) · [results 390](after/mr-results-390.png) · [TV reveal 1440](after/mr-tv-reveal-1440.png) · [TV review 1440](after/mr-tv-review-1440.png)

**Pattern Pulse:** [briefing 375](after/pp-briefing-375.png) · [ready 390](after/pp-ready-390.png) · [memorise 390](after/pp-memorise-390.png) · [memorise, reduced motion 375](after/pp-memorise-reduced-375.png) · [tap it back 390](after/pp-input-390.png) · [failed send 320](after/pp-send-failed-320.png) · [missed window 375](after/pp-missed-375.png) · [results 390](after/pp-results-390.png) · [results, still ribbon 390](after/pp-results-still-390.png) · [TV live 1440](after/pp-tv-live-1440.png) · [TV final 1440](after/pp-tv-final-1440.png)

**Draw & Guess:** [briefing 375](after/dg-briefing-375.png) · [drawer 430](after/dg-drawer-430.png) · [wrong guess 390](after/dg-guess-wrong-390.png) · [reveal 390](after/dg-reveal-390.png) · [results 390](after/dg-results-390.png) · [TV live 1440](after/dg-tv-live-1440.png) · [TV live 1920](after/dg-tv-live-1920.png) · [TV reveal 1440](after/dg-tv-reveal-1440.png) · [TV review 1440](after/dg-tv-review-1440.png)

## 10. Regression coverage

- **Unit tests:** 1055 in 92 files, at `8879c3f` (1001 at Stage 4). New in Stage 5:
  - `stage5-majority`, `stage5-pulse`, `stage5-draw`, `stage5-moments`, `stage5-tvfeed`;
  - an `errors` update.
- **New browser drivers:**
  - `check-send-failures`, `check-tv-show`, `check-game-night-flow`;
  - `check-majority-rules`, `check-pattern-pulse`, `check-draw-guess`.
- **Updated drivers:**
  - `check-readiness` follows the new wording.
  - The library, Stage 2 and Mchezo drivers now read the catalogue from `/games`.
  - f5 and e2e play every new game as Practice.
  - Several TV and lobby drivers follow the new TV.
- **e2e (Chromium):** every registered game, now 14, played to the end on 4 phones.

## 11. Gate run and revision

**Verdict:** `node scripts/gate.mjs full` on **`8879c3f`**, from a fresh clone, **PASSED (exit 0)**, run `20261109-080851-8879c3f6-18873`.
- 65 passed, 0 failed, 0 timed out, 0 infrastructure, 0 invalid, 0 cancelled.
- Unit tests: 1055 in 92 files. E2E (Chromium): 15/15, every one of the 14 games played to the end on 4 phones, plus the room views.
- Stage 5 drivers in this run:

  | Driver | Checks |
  |---|---|
  | `check-draw-guess` | 61 |
  | `check-pattern-pulse` | 54 |
  | `check-majority-rules` | 49 |
  | `check-send-failures` | 43 |
  | `check-tv-show` | 29 |
  | `check-game-night-flow` | 14 |

- Run conditions:
  - The only untracked file was a `node_modules` symlink.
  - Browser: chrome-headless-shell 153.0.8010.12 (set by `MCHEZO_CHROMIUM_PATH`).
- The verdict covers `8879c3f` only. The commits after it are docs only: this README's final sections, the gallery images, PROGRESS.
- `8879c3f`'s app code is identical to `6371425`. The two commits between them change only two drivers, `check-answer-reveal` and `check-game-night`.

**Runs that do not count:**
- **Gate run 1:** `6371425`, run `20261109-072613-63714256-8119`. It was CANCELLED by me (exit 130) after 24 passed and 2 failed.
  - `check-answer-reveal` and `check-game-night` still expected the pre-S5-A TV:
    - the answers shown by themselves after a game;
    - a one-item answer list during Closest Wins;
    - the raw game ids "closest-wins" and "math-mayhem" in the TV text.
  - The TV behaves as designed (D-S5-03). Both drivers now reach the TV the way a person does, with the same assertions: `481c1f7` and `8879c3f`.
  - It was cancelled because its remaining steps tested the same app code as the next run.
  - Root cause on my side: neither driver was in my targeted sweeps after S5-A.
- **Targeted runs before the gate** (not verdicts):
  - The per-checkpoint runs in PROGRESS: each game verified on its own commit, with f5 and e2e.
  - A 20-driver sweep of TV and results drivers after gate run 1. Every driver passed except `check-game-night` (fixed). `check-leaderboard` was cut by my sweep's 900 s limit; it normally needs about 930 s, and the gate allows 1800 s. It passed in run 2 (1074 s).
  - `check-mchezo` failed once on `a02588b` under five parallel browser jobs. It passed alone on the same revision, and in run 2.

## 12. Limitations

- Chromium only; **no real Safari, iPhone, Android or TV**.
- The new games' timings and scores are provisional design values, not measured playtests.
- Draw & Guess: no stroke smoothing, no close-guess hint, no word filter for drawers (honour system). Someone who has read the server-side word list could brute-force a letter pattern within the 12-guess cap (B-4).
- Unsent entries (a Pulse entry, a Draw stroke) are lost on a reload; the server's state is never wrong (B-2).
- The older game panel (Category Sprint, Who Said That?, Impostor, Charades) has no "Sending…" state (B-3).
- Bluff Battle is not built.

## 13. Unresolved decisions for the owner

- Whether, and with what scoring, each new game may count toward the Family Cup (D-S5-06).
- Majority Rules' tie policy (50 each) and prediction scoring (D-S5-07).
- Pattern Pulse's scoring, lengths and windows (D-S5-08).
- Draw & Guess's scoring, turn length, word pack, swap rule and the 12-guess cap (D-S5-09).
- Whether to build Bluff Battle, and its moderation model (D-S5-11).
- Everything listed as kept in the Stage 4 README §8 is still open.

## 14. Real-device acceptance checklist (iPhone Safari and Android Chrome)

Use the LAN setup in `REAL_DEVICE_TESTING.md` (and its failure log) with 3–4 phones and a TV or laptop as the screen. For each item note the device, OS and browser, and pass/fail.

1. **Join and lobby:** scan or type the code. Every phone shows the circle; the host picks Majority Rules. Official is greyed with the Practice-only reason, and Start practice works.
2. **Majority Rules:**
   - Predict, then vote on each phone.
   - Put one phone in Airplane mode and tap: "We couldn’t confirm that…". Turn it off and tap again.
   - At the reveal the TV shows totals only. A 2–2 split gives +50 on each phone.
3. **Pattern Pulse:**
   - On one phone turn on Reduce Motion (iOS Settings → Accessibility → Motion). The pattern is a still numbered row; on another phone the highlight sweeps.
   - Tap the shapes back; try Undo and Clear.
   - Lock the screen during a round and unlock after its time: the round shows "Time ran out" without you acting.
   - Pull to refresh mid-answer: the pattern does not come back.
4. **Draw & Guess:**
   - The drawer draws with a finger. Check the page does not scroll, iOS's swipe-back does not trigger from the canvas edge, and the TV and guessers see strokes within about a second.
   - Try every colour and size, Undo, Clear and New word.
   - A guesser types a wrong guess ("Not it"), then the word. Check autocorrect and capitalisation on iOS don't stop a right answer.
   - Lock the drawer's phone mid-turn: the turn ends by itself at 75 s.
5. **TV:** open the watch link on the TV browser. The label reads Live / Final standings / Post-game review correctly; Pause animations doesn't stop the clock; the drawing fits the screen.
6. **Between games:** after a game, every lobby shows the Last game card with your place. Nothing starts until the host taps Start.
7. **Celebration:** the winner's phone shows the short burst (or the still ribbon with Reduce Motion, or Animations Less/Off in the app's settings).
8. **Back/Forward:** swipe back mid-game lands on Home with Rejoin; Rejoin returns to the same turn.

## 15. Next steps

1. Owner review of §13. In particular, whether any new game should count toward the Cup, and with which scoring.
2. A real-device session using §14, on iPhone Safari first. Log failures in the real-device failure log.
3. Backlog from `AUDIT.md`:
   - B-1: write the room file less often.
   - B-2: keep unsent entries across a reload.
   - B-3: move the older panel's four games onto Mchezo screens.
   - B-4: Draw & Guess hints and a guess-spacing rule.
4. Bluff Battle, if wanted, with a moderation design first.
