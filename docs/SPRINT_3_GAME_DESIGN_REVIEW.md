# Sprint 3 — game design review and Sprint 4 recommendation (Workstream I)

**Status: recommendations only.** Nothing in this document is built, and none of it is approved. Sprint 4 needs the owner's go-ahead before it starts.

These findings come from building and testing the Sprint 3 lifecycle across all eleven games: running them to their deadlines, ending them partway through, replaying them after restarts, and writing the results text.

---

## 1. Content is too thin for a seven-day Cup (highest priority)

Measured on commit `7eb29de`:

| Game | Content available | Used per game | Consequence over 7 days |
|---|---|---|---|
| Trivia | **12 distinct questions** (all 200 seeds tried) | 10 | Almost every Trivia game repeats the same questions. By day 2, players who remember the answers have an advantage. |
| Closest Wins | **8 fixed questions** | all 8, same order | Every game is identical. Answers can be memorised after one play. |
| Who Said That? | 8 quotes | all | Same problem as Closest. |
| Geography | 8 items | all | Same. |
| Guess the Year | 8 events | all | Same. |
| Category Sprint | 3 categories | 3 rounds | Same three categories every time. |
| Caption Clash | 5 prompts | 3 rounds | Prompts repeat from the second game. |
| Impostor | 7 words | 1 | The secret word repeats often, and remembering it beats the deduction. |
| Charades | 6 prompts | one per turn | With 7–10 players, prompts repeat *inside one game*. |
| Math Mayhem | generated | 10 | Fine: arithmetic is generated from a seed. |
| Word Connections | **1 board** | 1 | Every game is the same puzzle. |

This is a **competition-integrity issue, not only a fun issue.** An official Cup game whose answers someone saw yesterday does not measure the same thing for everyone.

**Recommendation (Sprint 4, first):**
- Content packs large enough that no item repeats within a Cup. Rough targets for 7 days × 2 plays per game: Trivia ≥ 150 questions, Closest ≥ 60, Who Said/Geography/Year ≥ 60 each, Sprint ≥ 30 categories, Caption ≥ 40 prompts, Connections ≥ 10 boards, Charades ≥ 80 prompts, Impostor ≥ 60 words.
- Server-side "already used in this Cup" tracking, so items aren't drawn twice within a room's Cup. This is deterministic and testable. Nothing is sent to the client ahead of time.
- Content goes into versioned data files with a schema (Zod) and a lint test for duplicates, missing answers, and answers that are ambiguous.
- Writing the content: the owner or family supplies it, or it is drafted by an AI and **reviewed by a person before use** (AI_PRIVACY.md and D13 apply). The format is decided in Sprint 4, but the cost target stays at $0.

## 2. Charades: redesign before it can count (P9)

Why it is practice-only today:
- **The actor scores their own team.** The actor taps "Correct" and their team gets 100. Nothing checks that anyone actually guessed. In a family competition, that is an honour system attached to official points.
- **Teams are fixed by join order** (`i % 2`). Team size and strength are not considered.
- **Turn count equals player count.** With an odd number of players, one team gets more turns, so it can earn more points.
- **There is no individual signal.** Everyone on the team gets the same score, which is why the Individual Family Cup can't use it.
- **Sprint 3 change:** a 90 s turn limit ends a turn without a point. This fixes the endless stall when an actor is absent; the scoring is unchanged.

**Redesign options (pick one in Sprint 4):**
- **A. Guesser-confirmed:** guessers type their guess. The server checks it against the prompt (normalised, with synonyms listed) and gives points to the **guesser** and the **actor**. This produces individual scores and needs no honour system. It does need a typed answer, which is harder for small children.
- **B. Host-judged:** a host or a rotating judge (not on the actor's team) taps Correct. That person can't benefit. It's simple, but the judge doesn't get to play.
- **C. Keep it social and practice-only:** make it a warm-up with no score at all. This is the cheapest option and it's honest.

Recommendation: **A for the Cup, C as the default** until A's guess-checking has been tested with real family guesses. Equal turns per team are needed whichever option is chosen.

## 3. Impostor: practice-only is right for now (P8)

- Social deduction rewards knowing the family (who is a good liar), not playing on the night. That is fine for fun and not fair for a Cup.
- **Votes are honour-based by design.** A family can coordinate votes outside the app, and the server can't see it.
- **No votes means the impostor wins** (existing rule, kept in Sprint 3 for the vote deadline). Under deadlines, a quiet table now hands the win to the impostor. As practice that's fine, but it would be a real problem if Impostor ever counted.
- With only 7 words, repeats give the impostor away (section 1).

Recommendation: keep it **practice-only**. If the owner later wants it to count, consider making it count only for the "impostor caught" and "word guessed" events, and require a minimum number of votes before the vote resolves.

## 4. Fairness notes from the lifecycle work

- **Qualifying days (P7):** under the current rule, a player who starts a game and then does nothing still earns a qualifying day. Options and a recommendation are in `docs/SPRINT_3_QUALIFICATION_OPTIONS.md`; I recommend B.
- **A game nobody played** doesn't count (D-S3-02, provisional). The owner should confirm this.
- **Lock-step games and slow typers:** Caption's 90 s to write and Sprint's 60 s per round are design guesses (P2). Sprint 4 should **measure** them in a real family session; the timing data is already in the ledger as `phase-closed` events and per-game outcomes.
- **Math timing (P10):** the speed bonus is now measured per question on the server. It counts from when the server reveals the question, not when the player sees it, so network delay counts against the player. On a weak Wi-Fi connection that can cost a 5 s bonus bracket. If family testing shows this happening, consider widening the brackets (≤6 s / ≤12 s) rather than ever trusting the phone's clock.
- **Closest Wins scoring** gives 25 points to anyone who guesses at all. Under deadlines, a lazy guess earns points but silence doesn't. That is consistent with the rules; it's noted only because P5 makes it visible.

## 5. UI/UX findings (the visual freeze, L31, still applies)

Sprint 3 added only functional lines in the existing style. For an approved design pass:
- **One clock language.** Trivia, Geography and Math have their own ring timer. Closest, Year and the legacy panels use the new "Time left" line. A single designed timer component should replace both.
- **"Time's up" moment.** Today the screen changes when the server's projection arrives (within about 1 s of the deadline). A designed transition with a short "Time's up!" beat before the results would make the deadline feel intentional instead of abrupt.
- **Results explain more now.** Results show the ending, whether the game counts, and each player's participation. The Trivia results screen puts that box above the existing staged reveal; a designer should merge them.
- **The lobby** tells the host about time limits and practice-only status in small type. Start buttons for practice-only games could carry a visible "Practice" badge.
- **TV:** only Trivia has a dedicated TV stage. Other games show the dashboard with a time-left line. Lock-step games (Closest, Caption) would gain the most from a TV stage that shows the phase countdown.
- **Away players and deadlines:** the waiting view already names people who are reconnecting or away. Adding "the game ends at 8:42 whether or not they're back" would make P6 clear to everyone.

## 6. Recommended Sprint 4 (planning only — not started)

Suggested scope, in order:
1. **Content depth and no-repeat drawing** (section 1). This is the biggest fairness risk left for a real Cup.
2. **Owner decisions needed before a real Cup:** qualifying-day rule (P7), whether no-participation games count (D-S3-02), and the measured phase durations (P2).
3. **A real-family timing playtest** using the existing gate drivers plus one supervised session. Then replace the P2 guesses with measured values in `src/server/lifecycle.ts`.
4. **Charades option A prototype**, practice-only until it's verified.
5. **Device acceptance** (`docs/DEVICE_ACCEPTANCE_CHECKLIST.md`) on real iPhone/Android, especially countdowns after the screen locks and wakes.
6. Leave out of Sprint 4 unless approved: the visual redesign (L31), team Cups, making Impostor count, and the retroactive official/practice control (P11).

Sprint 4 risks: writing content is slow and needs human review, and real-device testing needs people and devices that a cloud session can't provide.
