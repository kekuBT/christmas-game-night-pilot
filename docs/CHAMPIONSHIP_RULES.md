# Seven-Day Championship — Deterministic Proposed Rules
Status: **PROVISIONAL FORMULA FOR LOCAL IMPLEMENTATION**, not yet owner-approved for an official family championship.

## Invariants
- Seven calendar **session slots** are explicitly scheduled by the host; dates/time zone stored per room; default room time zone chosen by host; late-night play cannot automatically spill scores into a different day.
- At most one official playlist per day slot. Finalized official results cannot be edited silently or counted twice. Casual games never change championship points.
- Each official playlist is a set of announced game instances. Attendance, eligibility, rosters, game mode (solo/team), raw results, cancellations and justified exclusions are captured before locking the day.
- Only actual eligible human players score. Solo/team weight targets 75/25; team outcomes must not scale with team size. No raw-point aggregation across games with incompatible scales.
- Host override is a signed append-only correction event: actor, time, target, previous calculated value, new corrected value, reason; audit always visible to room participants (private notes, if any, excluded).

## Recommended normalized game score, 0–100
For a completed official game among N eligible competitors (individuals in solo games; TEAMS in team games), use **midrank percentile**: rank each by official raw points descending; ties receive average occupied rank; if N>=2, `gameScore = 100 * (N - averageRank)/(N - 1)`; if N=1, the event is invalid for championship. Clamp and round only for display, not internal calculations. Example N=4 and distinct rankings: 100, 66.666..., 33.333..., 0. Tie for 1st occupying ranks 1 and 2: each score 83.333...; ranks 3,4 score 33.333...,0. A team-result score is awarded equally to all eligible team members; do not multiply contribution by team size. Preserve exact precision in ledger.

**Important tradeoff:** In a 2-team game only 100/0 outcomes occur; creative games need subjective tie adjudication. Disclose exact behavior to Keku, run simulations and compare alternate score transforms before finalizing.

## Provisional official day score
- Recommended official playlist has a mixture of three solo games and one team game. Do not enforce exactly 3:1, but warn if a playlist cannot support ~75/25 experience.
- For any participating player, `SoloAvg = mean(gameScore for all scheduled eligible solo games)`, `TeamAvg = mean(gameScore for all scheduled eligible team games)`.
- If a player joins an official game and receives no valid result because they voluntarily abandon it, default 0 with host appeal; if the host cancels the whole game or marks a participant ineligible before start, exclude that item from relevant denominator. Do not compute an average only over the games someone chose to finish: prevents cherry-picking.
- If a playlist contains both categories, `DayScore = 0.75*SoloAvg + 0.25*TeamAvg`. If **only solo** or **only team** games were scheduled, normalize the available category to 100% rather than treating a missing category as zero; flag the playlist as off-balance and ask host to confirm. If the player skipped every game in one scheduled category, its average is 0.
- **Valid player-day (proposed):** player took part in >=1 successfully completed scheduled official game. This is flexible but permits one-game days; log a fairness warning where total participation was <50% of eligible official games. A more stringent 2-game/50% threshold remains an owner option. A fully absent player has no valid day and no 0 score.

## Best-five-of-seven and minimum-three eligibility
For player P, take valid day scores sorted high-to-low, keep up to five (i.e., the best five of seven). To be championship eligible, P must have >=3 valid days.

**Attendance-neutral provisional championship base score:** `Base = 5 * mean(best min(5, validDayCount) day scores)`. The base range is 0–500 and gives a 3-day player a fair numerical chance while attendees at 5–7 days have more opportunities to replace a weak day. This interprets 'best five' as best *up to* five, rather than a sum in which fewer than five days automatically lose points. Present both interpretations with example before the owner signs off.

Example: Ada valid days [75,80,90,65,70,85], keeps [90,85,80,75,70], mean 80, base 400. Bea valid days [93,89,88] keeps all three, mean 90, base 450, eligible because >=3. Cal only two days [100,100] is ineligible, shown as provisional/unranked. This is deliberate: attending five days increases chance of a good average, but does not grant free points simply for showing up.

**Grand Finale:** Optional 0–50 extra championship points from a separately declared Finale session. Provisional mapping: 50 to 1st, 35 to 2nd, 25 to 3rd, 15 to 4th, 5 to any other eligible finisher, 0 nonparticipant. *Needs owner approval*; must not silently alter eligibility or erase best-five. Configurable disabled by default until sign-off. Grand Finale may change winner by design; disclose in advance.

**Provisional tie-breaks:** higher count of winning valid daily placements among counted days; then higher median of counted day scores; then head-to-head finale placement if both entered; then joint champion. Avoid attendance as an arbitrary unannounced tie-breaker. Ranks and any subsequent adjusted points are reproducible from event log.

## Team assignment and fairness
Rotate teams automatically across team events, aiming to minimize repeated partner pairings and imbalance in team sizes. For odd player counts use uneven teams with a transparent compensation policy: prefer a 3-person team vs 2-person team with neutral difficulty or extra turn normalization; never assume raw points are comparable without per-capita/turn normalization. Provide host manual shuffle with audit and avoid hard-coded gender/age/skill grouping. No player should systematically sit out team games without fair substitute credit; explicit opt-in sit-out can be an excused exclusion before game start.

## Edge cases to test
- Player reconnects and retries same score submission; counted once.
- Host cancels game after one result; voiding event does not alter already finalized other days.
- Tie raw score among two of four; midrank arithmetic verified.
- Solo game 3 players and team game 2 teams; different N handled.
- Score overflow, negative game score, impossible rank and invalid actor rejected.
- Attendance 0/1/2/3/5/7 days, late join, withdrawn player, walkover and cancellation.
- 3- and 5-day players compare correctly, no raw score advantage from playing more games per category.
- Duplicate day close, timezone midnight edge, host override undo via compensating event.
- Championship recomputes identically from ledger after DB migration and restore.

## Owner decisions, not silently final
1. Is mean(best up to five)*5 the preferred fairness model vs sum(best five)?
2. Is at least one game enough for valid day or require majority / minimum 2?
3. Is 75/25 appropriate at day level, and what happens with absent category?
4. Finale 0–50 ladder and its possibility to change champion?
5. Tie-break sequence, team-rotation and odd-size compensation?

All figures here are implementation defaults and test data for LOCAL development. The owner must approve before using them to award real family trophies.



---
