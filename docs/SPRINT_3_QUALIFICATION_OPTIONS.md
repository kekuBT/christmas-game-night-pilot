# Qualifying days — options for the owner (Sprint 3, P7)

**Status: decision needed. Nothing here is active.** The Cup still uses the existing rule (option A). The mechanism for the other options is built and tested (`src/scoring/qualification.ts`, `tests/cup-integrity.test.ts`) and can be switched in one line. Switch it before a Cup starts, never during one.

## Why this comes up now

A qualifying day matters twice: a player needs at least 3 of them to be eligible, and every qualifying day beyond 3 adds +5 attendance bonus (max +20).

Today a day qualifies if the player was **on the roster of any official game that day**. Since Sprint 3 a game always ends at its deadline (P3, P6). So a player who is in the room when a game starts, then puts the phone down and answers nothing, still ends up on the roster with 0 points. Under the current rule that still counts as attending. A 0 score never helps their best three, but it does count toward eligibility and the attendance bonus.

## Options

| | Rule | Example: Cal was on the roster of 3 games and answered in 1 |
|---|---|---|
| **A** (current, active) | On the roster of at least 1 official game that day | qualifies |
| **B** | Took part (at least one answer, guess or submission) in at least 1 official game that day | qualifies |
| **C** | Took part in at least 2 official games that day | does not qualify |
| **D** | Took part in at least half of that day's official games | does not qualify (1 of 3) |

"Took part" is read from the server's own participation record for each game, so it can't be faked by the client. Choosing to sit out (abstain) does not count as taking part.

## Recommendation

1. **B: took part in at least one official game.** This is the smallest change that closes the gap. You have to actually play to attend, and a family member who joins for only one game still gets the day. **Recommended.**
2. **C: at least two games.** Use this if one-game drop-ins shouldn't earn attendance. It can be unfair on days when only one or two games run.
3. **D: half the day's games.** This adjusts to the length of the night. It is harder to explain, and on short days it behaves like B.

Whatever you choose, it applies from the next Cup onward. Cups in progress and Cups already played keep the rule they started with.
