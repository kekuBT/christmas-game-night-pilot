# Qualifying days — options for the owner (Sprint 3, P7)

**Status: decision needed. Nothing here is active.** The Cup still uses the existing rule (option A). The mechanism for the other options is built and tested (`src/scoring/qualification.ts`, `tests/cup-integrity.test.ts`) and can be switched in one line. Switch it before a Cup starts, never during one.

## Why this comes up now

A qualifying day matters twice: a player needs at least 3 of them to be eligible, and every qualifying day beyond 3 adds +5 attendance bonus (max +20).

Today a day qualifies if the player was **on the roster of any official game that day**. Since Sprint 3 a game always ends at its deadline (P3, P6). So a player who is in the room when a game starts, then puts the phone down and answers nothing, still ends up on the roster with 0 points. Under the current rule that still counts as attending. A 0 score never helps their best three, but it does count toward eligibility and the attendance bonus.

## Options

| | Rule | Cal was on 3 games' rosters, answered once | Short night: one game, 6 of 10 answered |
|---|---|---|---|
| **A** (current, **active**) | On the roster of ≥ 1 official game that day | qualifies | qualifies |
| B | Took part (≥ 1 answer, guess or submission) in ≥ 1 official game | qualifies | qualifies |
| C | Took part in ≥ 2 official games | does not | does not |
| D | Took part in ≥ half of that day's official games | does not | qualifies |
| **E** (proposed) | **Meaningful scoring participation:** completed ≥ half of the scoring items of ≥ 1 official game, or played it to its end | **does not** | **qualifies** |

"Took part" and "completed" come from the server's own record of each game (`outcome.participation`), so the client can't fake them. Choosing to sit out is never counted as taking part.

## Owner decision (2026-11-06)

**B is not approved:** one answer is not enough evidence of meaningful participation. The current rule (A) stays active until a threshold is approved.

## Proposal: option E, meaningful scoring participation

A day qualifies when, in **at least one** official game that day, the player completed **at least half** of what that game scores:

| Game | "Half" means |
|---|---|
| Trivia, Who Said That?, Geography, Math | ≥ 5 of 10 answers |
| Guess the Year, Closest Wins | ≥ 4 of 8 guesses |
| Caption Clash, Category Sprint | ≥ 2 of 3 rounds submitted |
| Word Connections | ≥ 2 of 4 groups solved, **or** the puzzle played to its end (4 groups or 4 mistakes) |

Why this fits:
- **Meaningful:** one tap is never enough; the player has to genuinely play most of a game.
- **Short family nights:** a single game played properly is enough, so a night with one or two games still counts for everyone who played them.
- **Fair to time limits:** a player who runs out of time at 5 of 10 still qualifies. Someone who joins, answers once and leaves doesn't.
- **Hard to game:** the record is server-side, sitting out doesn't count, and practice games never count.
- **Configurable:** the share (0.5) and minimum games (1) are parameters of the policy, so for example `minGames: 2` for longer nights is a one-line change.

Implemented and tested (`src/scoring/qualification.ts` option E, `tests/cup-integrity.test.ts`), **not active.** Games recorded before Sprint 3 have no participation record and keep counting as before.

Whatever you choose applies from the next Cup onward. Cups in progress and Cups already played keep the rule they started with.
