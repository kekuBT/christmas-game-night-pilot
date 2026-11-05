# Game Manifest system (Milestone F)

The manifest is the single typed source for what each game **is** — for
the Game Library's discovery and filtering (Milestone G), Smart Shuffle
(Milestone H), and tournament scheduling (Milestone I). It describes
games; it does not run them. Gameplay, scoring, and the registry are
unchanged by this module.

Source: `src/games/manifest.ts` (Zod schema + the 11 manifests +
validation). Tests: `tests/manifest.test.ts` (22 tests).

## What a manifest contains

| Field | Meaning | Source / grounding |
|---|---|---|
| `id` | Stable game id, same as the registry id | Registry, cross-checked |
| `title` | Display name | Registry, cross-checked |
| `description` | One honest sentence about how the game plays | Tutorial text + game module |
| `categories` | Discovery labels (e.g. `knowledge`, `party`) | Editorial — see note below |
| `minPlayers` / `maxPlayers` | Player-count bounds | Registry, cross-checked |
| `playStyle` | `solo` or `team` | Registry `modes`, cross-checked |
| `competition` | Always `competitive` today | Every game produces ranked standings |
| `duration` | `{ minutes, source: "design-default", measured: false }` | Registry default; **not measured** |
| `inputs` | What the player provides: `choice`, `numeric`, `text`, `tile-selection`, `performance` | Intent payloads + game modules |
| `devices` | Controllers: always `["phone"]` | Phones are the controllers; TV is a display, not an input device |
| `tv` | `dedicated` (Trivia only) or `dashboard` (all others) | MchezoTvStage exists only for Trivia |
| `intensity` | `unknown` for every game today | Never measured — see note below |
| `intensityNote` | Why intensity is unknown | Fixed note, same for all games |
| `scoring` | `{ type: "per-player-points", teamDerived }` | Every game module returns per-player scores; Charades derives them from team outcomes |
| `features` | `{ practice, official, abstention }` | Practice/official: true for all (startGame accepts the flag for any game). Abstention: see table |
| `tournament` | `{ usesPerPlayerScores, supportsTeams }` | Structural facts only — **no format verdicts** (Milestone I) |
| `details` | Mechanics facts worth knowing (rounds, packs, rotation) | Game modules, registry tutorials, decisions log |

## The 11 games at a glance

| Game | Players | Duration | Style | Inputs | TV | Abstention |
|---|---|---|---|---|---|---|
| Impostor | 4–10 | 10 | solo | text, choice | dashboard | per-phase |
| Caption Clash | 4–10 | 10 | solo | text, choice | dashboard | per-round |
| Trivia Showdown | 2–10 | 10 | solo | choice | **dedicated** | whole-game |
| Word Connections | 1–10 | 8 | solo | tile-selection | dashboard | whole-game |
| Who Said That? | 4–10 | 10 | solo | choice | dashboard | whole-game |
| Guess the Year | 2–10 | 8 | solo | numeric | dashboard | whole-game |
| Closest Wins | 2–10 | 8 | solo | numeric | dashboard | whole-game |
| Category Sprint | 4–10 | 10 | solo | text | dashboard | whole-game |
| Charades | 4–10 | 15 | **team** | performance, choice | dashboard | **none** |
| Geography Challenge | 2–10 | 12 | solo | choice | dashboard | whole-game |
| Math Mayhem | 2–10 | 5 | solo | numeric | dashboard | whole-game |

Per-game details (rounds, packs, special rules) live in each manifest's
`details` field. Notable ones: Impostor's guess forfeit on abstention;
Caption Clash's 3 rounds; Connections' 1-player minimum; Who Said
That's generic local pack; Charades' full rotation (L15) and
team-derived scores; Geography's six provisional modes with text/region
fallbacks (not licensed geometry or tiles); Math's 100 points + capped
speed bonus per correct answer.

## Honesty notes (read before reusing these values)

- **Durations are design defaults, not measurements.** The registry's
  `defaultDurationMinutes` were set at design time; no play-time data
  backs them. Every manifest says so (`source: "design-default"`,
  `measured: false`). Do not present them to players as "takes X
  minutes" without that qualifier, and do not use them as a difficulty
  signal.
- **Intensity is unknown, deliberately.** No game has a measured
  difficulty or intensity rating. The field exists so a future
  measurement pass has somewhere to put one; until then it reads
  `unknown` everywhere, and validation accepts that.
- **Categories are editorial labels.** They exist for discovery
  filtering (G), not as claims about a game's nature. They were
  assigned from each game's mechanics, and changing a label changes no
  behaviour.
- **TV tiers are architectural facts.** Trivia is the only game with a
  dedicated TV stage (`MchezoTvStage`). Every other game's TV presence
  is the old dashboard (Now playing + Recent games + Family Cup
  standings). A manifest claiming otherwise fails validation.
- **Tournament verdicts are deferred.** The manifest does not say
  which tournament formats a game fits, because no tournament engine
  exists yet (Milestone I). It carries only the structural facts I
  needs: per-player scores exist for all 11, and only Charades supports
  teams. Format compatibility is computed in I, not asserted here.
- **Deadline vs duration tension (open question, not resolved here).**
  The room enforces a 5-minute submission deadline on every game
  (L36), while design durations run 5–15 minutes. Games are expected
  to play briskly and the host skip covers stalled games, but whether
  long games (notably 15-minute Charades) sit comfortably under the
  deadline has not been examined. Flagged for Milestone J/K hardening;
  the manifest does not paper over it.
- **No formal accessibility audit exists.** The platform provides
  reduced-motion support and large touch targets, but per-game
  accessibility has not been audited. Inputs are the best available
  proxy (text games need reading/writing; Charades needs physical
  acting); the manifest does not claim more than that.

## Validation

`validateManifest(manifest)` returns a list of problems (empty =
valid). It checks, in order:

1. **Shape** (Zod): required fields present, enums valid, categories
   non-empty, counts positive integers, duration positive.
2. **Registry agreement**: id exists in the registry; title, player
   counts, and duration minutes match it exactly; play style matches
   registry modes; registry status is `implemented`. A manifest that
   disagrees with the registry is invalid — the registry wins.
3. **Room rules**: min ≤ max; max ≤ 10 (the room cap).
4. **Architecture facts**: Trivia must be `dedicated` TV; non-Trivia
   must be `dashboard`; Charades abstention must be `none`.
5. **Internal consistency**: team support and team-derived scores must
   track the play style.

`getManifest(id)` throws on unknown ids and on invalid data — a bad
manifest fails loudly at the call site, never serves silently.
`validateAllManifests()` checks the whole set: exactly one valid
manifest per registry game, no orphans, no duplicates.

## Changing the catalog

- **Add a game**: add the registry entry first, then its manifest.
  Validation fails until both agree.
- **Change a duration or player count**: change the registry first;
  the manifest must be updated to match or validation fails. Never
  edit a manifest to a value the registry contradicts.
- **Measure intensity or durations**: replace `unknown` / the design
  default with measured values and flip `measured` to true — that is a
  data change with evidence, not a schema change. Until then, leave
  the uncertainty explicit.
- **Consumers (G, H, I)** read manifests through `getManifest` /
  `GAME_MANIFESTS` and must not duplicate capability facts in their
  own code. If a consumer needs a fact the manifest lacks, extend the
  schema and the doc together.
