# Tournament Format and Lifecycle Review (ChatGPT Milestone I review, §2–§5)

Architecture checkpoint only. Nothing in this document is implemented.
It audits the six Studio presets as scheduling behavior (not as
tournaments — none of them scores anything yet), proposes a future
tournament lifecycle, verifies the Smart Shuffle integration, and
records the Studio UX review. Companion document:
`docs/TOURNAMENT_IDENTITY_REVIEW.md` (§1). Source:
`src/games/tournament.ts`, `src/games/shuffle.ts`,
`src/games/manifest.ts`, `apps/web/src/components/mchezo/MchezoStudio.tsx`.

## §2. Six-format feasibility matrix

Pools are computed from the validated manifest catalog (11 games).
Player counts matter because eligibility is a range check:

- At 4 players: all 11 games eligible.
- At 2 players: 6 games (trivia, word-connections, guess-the-year,
  closest-wins, geography, math-mayhem). Impostor, caption-clash,
  who-said-that, category-sprint (min 4) and charades (min 4) drop out.
- Solo pool: 10 at 4 players, 6 at 2 players. Team pool: charades
  only at 4+ players, empty below 4. Think Tank pool: 8 at 4 players
  (trivia, connections, who-said-that, year, closest, sprint,
  geography, math), 6 at 2 players.

"Scoring assumption" below means the format's *intended* scoring —
in every case the implemented scoring is **none**. The Studio shows
schedules, not scores, and no format's description claims otherwise.

| Format | Rounds | Distinct? | Pool | Intended experience | Scoring assumption (none implemented) | Missing engine capabilities | Verdict |
|---|---|---|---|---|---|---|---|
| Points League | 5 | yes | solo | A league of varied solo games | Cumulative points across rounds | Scoring, standings, persistence, roster | Viable as a scheduling prototype; not a tournament yet |
| Team Clash | 3 | no | team | Teams clashing across team games | Team totals from team games | Scoring, team formation, more team games, persistence | **Preview-only, not a viable team tournament** (see below) |
| The Gauntlet | 6 | yes | all | A run of different games, shuffled | Completion / variety (no points model) | Scoring, persistence | Viable as a scheduling prototype |
| Chaos Night | 6 | no | all | Anything-goes randomness | None intended (fun-first) | Persistence; a real differentiator (see below) | Viable as a schedule; **not meaningfully different from Gauntlet** |
| The Think Tank | 5 | yes | knowledge, quiz, word, puzzle, math, estimation | Brain games only | Knowledge accuracy | Scoring, persistence | Viable as a scheduling prototype |
| The Long Game | 10 | no | all | A marathon | Cumulative / endurance | Scoring, persistence | Viable as a scheduling prototype; differs from Chaos only by length |

### Team Clash: a prototype limitation, stated plainly

Team Clash repeating Charades three times is **not** a supported team
tournament. It is what the scheduler honestly produces from a
one-game team catalog: at 4+ players the only team-eligible game is
Charades, so three team rounds are Charades three times; below 4
players the format is explicitly infeasible ("No games fit this
format for N players"). The Studio's own format description says
exactly this ("Only Charades supports teams today, so rounds repeat
it — the catalog gap is shown, not hidden"), and the driver asserts
the infeasible rendering. No team scoring, team formation, or team
variant of any solo game is invented to make the format look
complete. Team Clash stays available as a *schedule preview* (it
demonstrates the team filter and the infeasible path) and must not be
described anywhere as a playable team tournament until the catalog
has more team games and team formation exists.

### Formats that are mostly different labels

The scheduler varies along only three axes: **pool** (solo / team /
all / category-filtered), **distinctness** (distinct vs repeats
allowed), and **length** (3 / 5 / 6 / 10 rounds). Measured against
those axes:

- **Chaos Night vs The Gauntlet: behaviorally near-identical.** Same
  pool, same length; the only difference is the repeat permission.
  And the repeat path still *prefers* variety (smart-mode recency
  bonus: unscheduled games get +10), so a Chaos schedule usually
  comes out distinct anyway. The difference is real in mechanism
  (proven by the pigeonhole test: 6 slots from a 2-game pool repeat
  under Chaos and are infeasible under Gauntlet) but rarely visible
  in practice. Owner decision: keep Chaos as a preset with this
  overlap documented, differentiate it later with a real mechanic
  (not invented here), or drop it.
- **The Long Game vs Chaos Night: differ only by length** (10 vs 6
  rounds, same pool, same repeat policy). Length is a genuine
  scheduling difference, but it is the *only* difference.
- **Points League vs Gauntlet: differ by pool and by one round**
  (solo-only, 5 rounds, vs all-games, 6 rounds). Genuinely different
  schedules (Points League can never contain Charades — tested
  across 20 seeds).
- **The Think Tank vs Gauntlet: differ by pool** (category-filtered
  vs all). Genuinely different (Think Tank can never contain
  impostor, caption-clash, or charades — tested).
- No format is "distinct team" (impossible: one team game) and no
  format is "long distinct" (10 distinct rounds from the 11-game pool
  would be feasible at 4 players — noted as a possible future preset
  idea, not implemented or promised here).

No knockout scoring, team scoring, elimination rule, or new game
mechanic is invented anywhere in this review to make any format
appear complete. Non-viable behavior is shown as infeasible or
preview-only with an explanation, per the review's instruction.

## §3. Tournament lifecycle proposal (design only)

### States and what exists today

No generic-tournament state exists today. The Studio preview is an
ephemeral client-side computation, not a stored draft; individual
games have their own lifecycle (playing → finished / timedOut), and
rooms have no lifecycle at all (no expiry, deletion, or archival —
E audit Q13). The table states, for each proposed state, what would
need to exist.

| State | Meaning | Exists today? | What it needs |
|---|---|---|---|
| Draft | Configured (format, rounds, roster) but not validated or committed | No — the preview is not a draft; nothing is stored | A tournament record + config validation (the engine's infeasible results become draft-time errors) |
| Ready | Validated (feasible schedule for the roster) and awaiting start | No — the closest thing is a preview returning ok, which is not stored | Persist the validated config + roster; a host "ready" action |
| Active | Rounds being played in order | No — games run individually, not as rounds | Round sequencing (current round pointer), per-round game starts tagged with the tournament id, host controls |
| Paused | Play suspended, resumable from the last completed round | No as a tournament state (games have deadline + host skip, rooms do not pause) | Pause/resume actions; in-progress round state = the game's own state (resume = rejoin the game, not restart it) |
| Completed | All rounds played; final standings frozen | No — games complete individually; Family Cup completes via 7 days + finale (finale currently disabled by config) | Final standings computed once and frozen (never re-derived — unlike today's derived standings, which a rule change would restate) |
| Archived | Historical record, read-only, no further play | No — rooms never archive | Archive action + read-only projections + a retention/deletion story (see identity review) |

### Transitions (proposal)

Draft → Ready (host validates; infeasible configs cannot become
Ready) → Active (host starts; roster locked) → Paused ⇄ Active (host
pauses/resumes; pause never discards a completed round) → Completed
(last round finishes; standings frozen) → Archived (host archives;
read-only forever). Abandonment: an Active tournament with no
completed round for a host-defined period may be *cancelled* by the
host (a terminal state distinct from Completed — cancelled
tournaments keep their partial history but never complete).
Cancellation is proposed, not decided: it needs the owner's call on
whether partial results remain visible.

### Membership, ownership, permissions

- **Membership:** a tournament roster is explicit (person records
  from the identity review, plus guest slots for one-night players),
  and it is *not* the same as room presence. Today the Studio
  schedules for the *connected-player count*; a real tournament
  schedules for the *roster size*, because roster members may be
  absent on a given round. Roster ≠ connected is a gap the scheduler
  must close before activation.
- **Ownership:** the tournament owner is the creator's person record,
  independent of any room's host. This is deliberate: room `hostId`
  never transfers (see the contradictions section), but tournament
  ownership should be transferable (owner delegates or hands over),
  because a multi-day tournament outlives a single night's host.
  Cohosts are delegated by the owner (reusing the room's host/cohost
  predicate shape: owner or cohost may act).
- **Permissions:** owner/cohost may configure, start, pause, resume,
  cancel, archive, and correct scores (corrections reuse the
  audited-override pattern: reason required, previous value kept,
  ledger event). Ordinary members may play and view. Spectators keep
  the B-model disjointness (watch, never play, never score).
- **Persistent standings:** tournament standings are stored as
  *events* (round results appended, never overwritten; corrections
  append reversal entries), not re-derived from rawScores on every
  read. This differs deliberately from today's derived standings: a
  Completed tournament's standings must survive a later rule change
  (frozen, like E's EarnedAchievement proposal).
- **Interrupted sessions:** covered by the identity review (token /
  recovery code / host-assisted recovery) plus tournament pause:
  a player who disconnects mid-round rejoins the round's game; a
  tournament whose host disconnects is paused by no one (it simply
  waits — rounds do not auto-advance, per the M6 rule that games
  never auto-advance) until an owner/cohost resumes it.
- **Duplicate prevention:** reuse the existing intent envelope
  (`clientEventId` UUID, `seenIntents` keyed by room + actor +
  event id, persisted) extended to tournament scope (tournament id +
  actor + event id). Tournament actions get exactly-once envelopes
  the same way game intents do today; game rules still reject
  double effects (e.g. ALREADY_ANSWERED) as a second layer.
- **Historical results:** Completed and Archived tournaments keep
  their rounds, results, and frozen standings as records (not
  derivations). History views are per-person (via person records)
  and per-tournament, never merged across tournaments without an
  explicit, separately reviewed aggregation.

### Family Cup boundary (authoritative, unchanged)

- Family Cup rules, counting, and derivation do not change. Not by
  this review, not by a future tournament activation, without the
  owner's explicit approval of a Cup rule change.
- Generic tournaments must not silently inherit Cup scoring
  (75/25 daily split, best-3 days, participation/finale bonuses are
  Cup rules, not generic-tournament rules) and must not write to Cup
  records (`championshipDay`, `championshipResults` are room-scoped
  and stay that way).
- **The tension, stated:** Family Cup counts *all* official finished
  games in its room. If a generic tournament ran in the same room,
  its games would also count toward the Cup unless the Cup's rule
  changed — silent double-counting. Resolution for Phase 1:
  **tournaments run in their own rooms**, separate from Cup rooms.
  Co-hosting a Cup and a tournament in one room (with tagged games
  and a Cup rule that excludes tagged games) is a future decision
  requiring a Cup rule review. It is not assumed, not implemented,
  and not smuggled in through tagging.

## §4. Smart Shuffle integration verification

- **Hard constraints are never overridden by weights.** The pool is
  fixed before any scoring: `eligibleGames` (player-count range,
  exclusions, play style) plus the category filter produce the pool;
  weights only order picks *within* that pool (`shuffle.ts` scores
  the pool copy). A weight cannot admit an ineligible game, because
  weights are never consulted during filtering. Tested: eligibility
  (H), team-clash infeasibility, think-tank category exclusion,
  distinct infeasibility (I).
- **Seeded reproducibility is schedule-level.** Same config + seed
  → same schedule, in both strategies (tested). "Schedule-level"
  matters: the schedule seed reproduces *which games* in *which
  order*, not game content — each game's content seed is drawn
  per-game at start time. A host cannot replay identical questions
  from a tournament seed, and the UI must never imply otherwise.
- **Reasons reflect the actual algorithm.** Reasons and explanations
  are produced by the picker itself and mapped through unchanged
  (`tournament.ts` copies `reasons` + `explanation` from each pick;
  it never re-templates them). Pinned by H's shuffle goldens and by
  I's new tests (singleton pool reports exactly
  `["only-eligible-game"]` / "The only game that fits.").
- **Differentiation, measured:** structural differences are tested
  (pools, distinctness, length — see §2 and the new pigeonhole test).
  Behavioral overlap is documented, not hidden (Chaos ≈ Gauntlet,
  Long ≈ Chaos-by-length).
- **Catalog diversity limits:** distinct schedules cap at pool size
  (Gauntlet needs ≥6 eligible; at 2 players the all-games pool is
  exactly 6, so a 6-round Gauntlet at 2 players is the *entire*
  catalog in shuffled order — no variety left). Category variety
  (tournament mode's +5 for a new category) saturates quickly inside
  narrow pools: Think Tank's 8 games share knowledge/word heavily,
  so the bonus fires rarely. The engine is honest about this (the
  bonus is a preference, never a guarantee of diversity), and the
  preview shows the actual picks, not a diversity claim.

## §5. Studio UX review (code inspection; viewport measurements pending)

- **Preview clarity:** the view is labeled "Tournament Studio
  preview" with the line "Preview only — this schedule is not
  scored, not saved, and not sent to the server," plus a closing
  line "Family Cup rules are unchanged. Tournament scoring is not
  active in this preview." A casual host cannot mistake it for a
  live tournament without ignoring two explicit statements.
- **No implied launch/score/resume:** the Studio contains no start
  button, no score display, no resume control, and no save action.
  Its only actions are format chips, a rounds input, Regenerate,
  and Back to lobby. The absence of start buttons was driver-verified
  (check-studio, 8/8, before the environment breakage) and is
  code-verified now (the component renders no `start-*` testid).
- **Compactness:** six format chips, one rounds input, one
  regenerate button, and a readable round → game list with a
  one-line reason per game. No large configuration form; no
  games-per-round, seed, or exclusion controls exposed (the engine
  supports them; the UI deliberately does not, per the review's
  preference for a compact picker over a form).
- **Design system:** the Studio uses only established Mchezo kit
  classes (`mz-screen` via PhoneScreen, `mz-chip-btn` with 44px
  minimum touch height, `mz-card`, `mz-input`, `mz-foot`,
  `mz-kicker`) and the everyday theme tokens; it adds no new CSS.
  Layout is a single column with wrapping chip rows and no fixed
  widths, which is the pattern that scales down — but that is
  reasoning, not measurement (see below).
- **Player-count assumption, now visible (narrow correction applied
  during this review, under the owner's preview-only-corrections
  authorization):** the preview shows "Scheduled for N players."
  above the schedule, so the host sees the connected-player count
  the schedule assumed. Verified by a new check-studio assertion
  (9/9 after the change).
- **Viewport measurements (measured 2026-11-04 night, after the
  regression batch):** 320px, 360px, and 390px all pass — preview
  note visible, schedule visible with 5 rounds, and no horizontal
  overflow (scrollWidth equals innerWidth at each width). The
  single-column kit layout scales as reasoned.

## Architectural contradictions discovered (for checkpoint item 5)

1. **Cup counting vs tournament separation** (see §3): Family Cup
   counts all official games in its room; generic tournaments must
   not inherit Cup scoring. Resolution: separate rooms for Phase 1;
   co-hosting needs a Cup rule review. (Tension, resolved by
   separation — not by changing either rule silently.)
2. **Room host never transfers vs tournament ownership should
   transfer:** room `hostId` is immutable by design (L34 recovery
   relies on it); a multi-day tournament needs a transferable owner.
   Resolution: tournament owner is an independent field on the
   tournament record, not the room's host. (Design difference, not a
   bug — but it must be explicit, or a future implementer will
   conflate the two.)
3. **Connected count vs roster size:** the Studio schedules for
   connected players; a real tournament schedules for its roster.
   Resolution: roster-based scheduling before activation; the
   preview's assumed count should be displayed (see the narrow
   correction above).
4. **Deadline vs duration, inherited:** the 5-minute room deadline
   governs every game, including a scheduled Charades (15-minute
   design duration) in a tournament round. This is F's flagged
   deadline-vs-duration tension, not new to tournaments, but
   tournaments inherit it: a Long Game's rounds are each 5-minute
   games regardless of design duration. Open question for J/K, not
   decided here.
5. **Derived standings vs frozen standings:** today's standings are
   derived (a rule change restates history); a Completed tournament
   needs frozen standings. These two models must coexist without
   one contaminating the other: tournament standings are stored
   events, Cup standings stay derived until and unless the Cup
   itself adopts freezing (a separate owner decision).
6. **No contradiction found in:** shuffle weights vs hard filters
   (weights never filter), reasons vs algorithm (reasons are the
   algorithm's output), preview labeling vs capability (the UI
   claims nothing it does not do), or the Studio's host-only gating
   vs the lobby's shared nav (the button renders only for
   host/cohost; guests never see it — driver-verified).
