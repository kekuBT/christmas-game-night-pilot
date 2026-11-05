# Tournament Studio architecture (Milestone I — prototype, preview-only)

The Studio lets a host configure a tournament event and preview the
schedule it would produce. It is a **prototype**: it schedules games
and nothing else. It does not score, rank, save, or start anything,
and it does not touch the approved Family Cup system. This document is
the design record for what exists, what is deliberately absent, and
what a future activation would need.

Source: `src/games/tournament.ts` (engine + presets). Tests:
`tests/tournament.test.ts` (15 tests). Preview UI:
`apps/web/src/components/mchezo/MchezoStudio.tsx` (host-only view).
Driver: `scripts/check-studio.mjs` (8 checks).

## The boundary (what I does not do)

- **Family Cup is untouched.** No change to
  `src/scoring/championship.ts`, `officialStandings`, achievements, or
  ceremony code. The tournament engine imports only `manifest.ts` and
  `shuffle.ts`; it never imports championship code, and no server
  route, projection field, or ledger entry was added for tournaments.
- **No tournament scoring is activated.** The preview shows schedules
  (round → games) and pick explanations. It shows no points, no
  standings, no winners. A format's description may mention what its
  scoring *would* rank (e.g. "a league table would rank cumulative
  play") — that is a description of the format's intent, not a
  scoring implementation.
- **No server state.** Up-next is client state (H), and the Studio
  preview is likewise computed client-side from manifests, the
  connected-player count, and the room's game history. Nothing is
  written to a room, and refreshing the page loses the preview.

## Formats and presets

Formats are **preset data, not engine branches**: the engine never
switches on a format name — it reads the config fields (rounds,
gamesPerRound, distinctOnly, playStyle, categories). Adding a format
means adding a preset entry plus tests, not changing the scheduler.

| Format | Rounds | Distinct? | Pool | Honest note |
|---|---|---|---|---|
| Points League | 5 | yes | solo games | League variety; scoring not implemented. |
| Team Clash | 3 | no | team games | Only Charades supports teams today, so all three rounds are Charades. The gap is shown, not hidden. |
| The Gauntlet | 6 | yes | all games | Six different games, shuffled order. |
| Chaos Night | 6 | no | all games | Repeats welcome; the schedule always fills. |
| The Think Tank | 5 | yes | knowledge, quiz, word, puzzle, math, estimation | The category set is a preset choice (brain games), not a rule. Pool is 8 games. |
| The Long Game | 10 | no | all games | A marathon; repeats allowed. |

Preset rounds are defaults: the preview UI lets the host change rounds
(1–20). `gamesPerRound` exists in the engine (sequential groups within
a round, not parallel play — the room plays one game at a time) but
presets all use 1 and the UI does not expose it yet.

## Config model and validation

`TournamentConfig`: `format`, `name` (display only, defaults to the
preset label), `rounds` (int 1–20), `gamesPerRound` (int 1–5),
`playerCount` (int ≥ 1), `distinctOnly` (default true),
`playStyle?`, `categories?` (OR match, like the Library),
`excludeIds?`, `seed` (int), `recentIds?` (most-recent-first),
`manifests?` (default the validated catalog).

Validation is by hand, not Zod — the same reason as H: the engine is
imported into the web bundle, and Zod would add a dependency there
for a small, unit-tested rule set. Malformed configs throw (programmer
errors); scheduling infeasibility returns a value (see below), never
an exception. `configFromPreset` merges preset defaults with room
data (player count, seed, recent history) and caller overrides.

## Scheduling algorithm (reuses H, no second picker)

1. **Hard filters first**: H's `eligibleGames` (player-count range,
   exclusions, play style) plus the category filter.
2. **Empty pool** → `{ ok: false, reason: "no-eligible-games",
   eligible: 0, requested: slots }`.
3. **Distinct schedule larger than the pool** →
   `{ ok: false, reason: "not-enough-games", eligible, requested:
   slots }`. Repeat-allowed schedules cannot hit this case (any
   non-empty pool fills any slot count).
4. **Distinct**: one H tournament-mode shuffle call with
   `count = slots` (distinct by construction, category variety across
   the set, recency-weighted), then chunked into rounds.
5. **Repeat-allowed**: one H smart-mode pick per slot, each seeded
   deterministically from `seed + slot index`, with already-scheduled
   games prepended to the recency history so repeats spread out
   instead of clustering.
6. Picks carry H's reason codes and explanations, so the preview can
   show *why* each game was chosen.

Determinism: same config + seed → same schedule, in both strategies.
Purity: the engine does not mutate its inputs (tested with
deep-frozen configs and manifests).

## Knockout brackets: unsupported, deliberately

Elimination brackets need an advancement model (who advances on what
result) and a scoring model to feed it. Neither exists — scoring is
out of scope for I by assignment — so a bracket request fails
validation (`unknown format … knockout brackets are unsupported`)
instead of producing a bracket-shaped schedule that means nothing.
What brackets would need: a scoring model (see below), an advancement
rule per bracket type (single/double elimination, seeding), and
bracket-state persistence. None of that is designed here.

## Gaps the prototype makes visible (not hides)

- **Team formats are thin**: one team game exists (Charades, min 4
  players). Team Clash at fewer than 4 players is infeasible, and at
  4+ it repeats Charades. More team games (or team variants of solo
  games) are a catalog need, not a scheduler fix.
- **Team formation is not in I**: scheduling a team game is not
  forming teams. Who is on which team, how teams are balanced, and how
  team scores derive to players are all future work (Charades already
  derives per-player scores from team outcomes; a tournament team
  system would need its own design).
- **No multi-game rounds in the UI**: the engine supports
  `gamesPerRound > 1` as sequential groups, but the preview UI fixes
  it at 1. Exposing it is a UI decision, not an engine change.

## Preview UI scope

Host-only entry ("Studio (preview)" in the lobby nav row; guests
never see it). Format chips, a rounds input, a Regenerate button, and
the schedule (round → game titles + pick explanations) or an explicit
infeasible message ("No games fit this format for N players" /
"Only E games fit, but S slots were requested"). No start buttons, no
scores, no save. The view carries two fencing lines: "Preview only —
this schedule is not scored, not saved, and not sent to the server"
and "Family Cup rules are unchanged. Tournament scoring is not active
in this preview."

## Future activation checklist (needs architecture review, not in I)

1. A scoring model per format (what counts, how ties break, whether
   practice games count — Family Cup answers these for itself; a
   tournament needs its own answers).
2. A standings store separate from Family Cup's `officialStandings`
   (never blend the two; the current engine writes nowhere, so this
   is greenfield, not a migration).
3. Team formation and team-score derivation, if team formats activate.
4. Server persistence for events (creation, rounds, results) and host
   controls for running them (advance round, skip, cancel).
5. A bracket model, only if brackets are wanted.
6. A decision on whether tournament results ever feed achievements or
   the Memory Book (default: no, until reviewed).

Until that review happens, the Studio stays exactly what it is: a
local scheduling preview.
