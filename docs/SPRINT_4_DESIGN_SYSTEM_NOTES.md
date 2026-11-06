# Game experience design notes (Sprint 4)

These notes come from rebuilding Word Connections and Caption Clash. They describe what the two games share, how the remaining legacy screens should move over, and where Charades could go next. They are a working reference, not a spec.

## What every game screen now does

| Need | How (shared) | Where |
|---|---|---|
| Know the goal at a glance | `GameHeader`: game name in its accent colour, plus a one-line objective that changes with state ("Find four groups of four" → "Puzzle solved!") | `ui/mchezo/components/GameKit.tsx` |
| Learn before playing | `GameIntro`: an objective plus three short steps; starts by itself after 8 s, or on tap | GameKit |
| Feedback on every action | `FeedbackLine` (polite live region): "One away…", "Voted. 3 of 4 have voted." | GameKit |
| Time | `GameClock` from server time ("Time left for this round") | `Lifecycle.tsx` (Sprint 3) |
| Waiting | `MchezoWaiting` ring with counts only, presence notes, countdown | `Waiting.tsx` |
| Ending | Results that explain the outcome: what you got, then scores with participation (`ScoreList`), then `OutcomeSummary` | GameKit, Lifecycle |

The rule of thumb: **one primary action per screen**, always the `Keycap` in the brand colour. Secondary actions are surface keycaps, and "sit out" or "skip" is a quiet chip at the bottom.

## What stays game-specific (on purpose)

- **Puzzle (Word Connections).** A dense 4-column grid of equal tiles. Difficulty levels are shown by colour **and** shape (■ ● ◆ ▲), so colour is never the only cue. Mistakes are dots. Long words shrink rather than break. Nothing else on screen competes with the grid.
- **Social (Caption Clash).** A vivid gradient prompt card ("the scene") anchors every phase. Captions are cards you read, not buttons you scan. Your own caption is dimmed and labelled "Yours". Between rounds, the previous favourite is a one-line teaser, not a ceremony.
- **Estimation (Closest Wins / Guess the Year).** Keeps its dial + number field (`NumericGuess`). When it moves over, it should get its own "how close were you" results visual, not the quiz grid.
- **Quiz (Trivia / Geography / Math / Who Said That).** Keeps the four coloured, shape-marked slabs (`AnswerGrid`) and the ring timer. These were already on the kit before Sprint 4.

## Accessibility checklist used for both games (keep using it)

- Touch targets ≥ 44 px at 320 px wide (tiles 64 px, vote cards ≥ 56 px); `check-connections` and `check-caption` measure them.
- Selection state is exposed (`aria-pressed`) and shown with a mark, not only a colour.
- No `background-color` transitions: a colour mid-animation can fail contrast (decision L39). Tiles animate only transform and shadow.
- Reduced motion: every Sprint 4 animation has a fade-only alternative under `[data-mz-motion="reduced"]` and `prefers-reduced-motion`.
- Visible focus (the theme's 3 px outline) on tiles and cards; the drivers check keyboard play (Space on a tile; Tab + Enter to submit a caption).
- Sound: the games make no sound, so sound-off is already the default.
- **Not yet verified:** screen-reader walkthroughs on a real device, and real iPhone Safari. This environment has no WebKit, and installing it is not allowed here.

## Moving the remaining legacy screens over (suggested order)

1. **Category Sprint**: the most form-like screen left (a comma-separated text box). It needs answer chips you add one at a time, a live count toward the five-answer limit, and a results view that shows which answers were unique.
2. **Who Said That?**: already on the quiz kit, but it needs character cards (name, role, one-line personality) so the fictional cast feels like a cast.
3. **Closest Wins and Guess the Year**: a reveal that shows everyone's guesses on a number line against the answer.
4. **Impostor (practice)**: a private role card you hold to reveal, a clue round, then vote cards like Caption Clash.
5. **Charades (practice)**: see below.

Each move keeps the server views untouched unless a privacy or fairness gap turns up. Both Sprint 4 games turned up one: Connections tile order, and Caption authorship.

## Charades: investigation (Workstream E; not built, stays practice-only)

How Charades works today, and why it can't count:
- The actor taps "Correct" for their own team, which is an honour system attached to points.
- Teams are fixed by join order, and turns equal the player count, so odd rosters give one team an extra turn.
- Everyone on a team gets the same score, so it has no place in an Individual Cup.

A fairer design that fits the Individual Cup:
- **Guesser-confirmed scoring.** Guessers type their guess on their phones. The server checks it against the prompt's accepted answers, so prompts gain an `answers` list in the content schema. The first correct guesser gets 100 and the actor gets 50, so both acting and guessing score and there are no teams at all.
- **Turns.** Every player acts exactly once, in a seeded order, so turns are equal by construction. An absent actor's turn is skipped at its deadline (Sprint 3 already does this) and moved to the end once.
- **Players who can't type quickly.** Each guesser gets an "I know it!" button. The actor's phone then shows that person's name and a Yes/No, so the actor confirms. The point goes to the guesser, but the actor can't award themselves anything, and the room sees who confirmed whom. This is the host-assisted adjudication route, without needing the host.
- **On the TV.** The TV shows the timer and "Ada is acting"; the prompt never appears there. Correct guesses appear as they land ("Bea got it in 0:21").
- **Before it could ever count:** accepted-answer lists need editorial review (synonyms, plural/singular), and it needs a real-family playtest to set the time limit. Until both happen it stays practice-only.

I didn't build a prototype in Sprint 4. The two flagship games, the content system and the regression run took priority, and a half-built Charades would only add surface area.
