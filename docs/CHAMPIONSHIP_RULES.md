# Seven-Day Championship — Family Cup Rules
Status: **OWNER-APPROVED 2026-11-04** (Keku). This replaces the earlier provisional best-five / 5×mean formula.

## Approved structure

- Seven scheduled championship days.
- Minimum **three qualifying days** to become championship-eligible.
- A qualifying day is a day on which the player took part in at least one
  successfully completed official game. Practice games never count toward
  scores or attendance.
- Each player's main championship score is the **sum of their best three
  daily scores**.
- **Daily score = 75% individual (solo) + 25% team performance**, where
  each game's contribution is a normalized placement score (see below).
- **Participation bonus: +5 for each qualifying day beyond the first
  three, capped at +20.** So 3 days = +0, 4 = +5, 5 = +10, 6 = +15, 7 = +20.
- **Grand Finale: up to 50 additional points** (ladder below, disabled by
  default in the engine until a finale is actually run).
- **Missing days get no negative points and do not reduce the best-three
  total.** The best three are taken from the days actually attended.

## Formula

```
Championship Total = Sum(Best 3 Daily Scores) + Participation Bonus + Finale Bonus
```

## Normalized game score, 0–100

For a completed official game among N eligible competitors (individuals in
solo games; teams in team games), use **midrank percentile**: rank by
official raw points descending; ties receive the average occupied rank;
if N ≥ 2, `gameScore = 100 * (N - averageRank) / (N - 1)`; if N = 1, the
event is invalid for championship. Example N = 4, distinct rankings:
100, 66.67, 33.33, 0. Tie for 1st occupying ranks 1 and 2: each 83.33.
A team-result score is awarded equally to all eligible team members; do
not multiply contribution by team size.

## Daily score

- `SoloAvg = mean(gameScore for all eligible solo games that day)`,
  `TeamAvg = mean(gameScore for all eligible team games that day)`.
- If both categories are present: `DayScore = 0.75*SoloAvg + 0.25*TeamAvg`.
- If only one category was scheduled: see "Still configurable" below.
  Current engine default: the available category's mean at 100%, flagged
  off-balance.
- If a player skipped every game in one scheduled category, its average
  is 0 (a skipped category is not the same as an unscheduled one).

## Worked example (approved formula)

- Ada, 6 days [75, 80, 90, 65, 70, 85]: best three 90+85+80 = 255,
  participation (6−3)×5 = 15, total 270.
- Bea, 3 days [93, 89, 88]: best three 270, participation 0, total 270.
- Cal, 2 days [100, 100]: ineligible, provisional total 200, ranked last.
- Ada and Bea tie on total 270; the tie-break (below) puts Ada first on
  daily wins.

## Tie-breaks

Higher total; then higher count of first-place daily finishes; then higher
median of the counted (best-three) day scores; then head-to-head finale
placement if both entered; then joint champion. Ineligible players rank
after all eligible players, regardless of total.

## Grand Finale ladder (configurable, see below)

50 to 1st, 35 to 2nd, 25 to 3rd, 15 to 4th, 5 to any other eligible
finisher, 0 to nonparticipants and to ineligible players. The finale may
change the winner by design; disclose it in advance.

## Host overrides

A host override is a signed append-only correction event: actor, time,
target, previous calculated value, new corrected value, reason; the audit
is always visible to room participants.

## Still configurable (not yet approved in detail)

Per Keku 2026-11-04, these three details stay configurable in
`src/scoring/championship.ts` (`CHAMPIONSHIP_CONFIG`) until approved:

1. The precise qualifying-day threshold (currently: at least one completed
   official game that day; a stricter 2-game / 50%-of-playlist threshold
   remains an owner option).
2. The handling of days without team games (currently: available category
   at 100%, flagged off-balance; the alternative "scaled" mode — solo-only
   days count at 75% of the solo mean — is implemented as a config switch
   but not selected).
3. The Grand Finale placement ladder (currently 50/35/25/15/5, disabled by
   default until a finale is run).

## Edge cases to test (covered in tests/family-cup.test.ts)

- Attendance 3, 4, 5, 6, 7 days and the participation cap.
- Missing days, gapped days (days 1, 4, 7 vs 1, 2, 3 with equal scores).
- 2-day ineligibility and provisional ranking last.
- Tied day scores, tied totals, tied games (midrank).
- Finale outcomes, including finale changing the winner and finale
  giving nothing to an ineligible player.
- Practice games contributing nothing (engine filters them before the
  championship module ever sees them).
- Score overflow, negative game score, impossible rank, invalid actor
  rejected (see tests/security.test.ts and tests/sprint-rules.test.ts).
