# Changing a game's official/practice status after it has been played — design only (P11)

**Status: designed, NOT built, NOT active.** P11: there is no unrestricted way to change a game's status after it has been played. This document describes a restricted version for the owner to approve or reject.

## The problem
Sometimes a host starts a game in the wrong mode. Practice when the family meant official is the common case. Today the only fix is to replay the game. An unrestricted "switch to official" button would let a host make a game count after seeing who won, which is exactly the abuse P11 rules out.

## Proposed rules (all must hold)
1. **Only practice → official**, and only for a game that is eligible to count (`policy.officialEligible`). Official → practice is not offered at all: removing a game someone won is the same abuse in reverse. A void (D-S3-05) is the only way an official result stops counting.
2. **Only before anyone can see the result**, meaning while the game is still `playing`. After it ends, the status is final. This removes the "decide after seeing the winner" problem completely.
3. **Every roster player must agree** on their own phone. One "no", or no answer before the game ends, keeps it practice. The host alone can't do it.
4. **Same day only.** The game keeps the championship day it was started on.
5. **Audited:** a `game-reclassified` ledger event records who asked, who agreed, and when, and the change shows in the room's notices.

## What it would touch
- `RoomEngine`: a `requestReclassify` / `consentReclassify` pair stored on the game, checked with exactly-once rules like `finalize`.
- Results: a line "Made official during play — everyone agreed".
- Tests: a rejection for each rule above, plus races between consent and the deadline. The deadline wins, so a game that ends before everyone agrees stays practice.

## Alternative considered
The host could tick a "this was meant to be official" box within 2 minutes of the start. It's simpler, but it is still a decision one person makes during play, and that person may already see who is doing well. Rejected in favour of consent from every player.

## Recommendation
Don't build this unless the family actually starts games in the wrong mode during a real Cup. Sprint 3's lobby makes the mode clearer: practice-only games are labelled and the Official button is disabled for them. That may be enough.
