# Smart Shuffle / Smart Director engine (Milestone H)

A pure engine that **chooses** games. It never starts one (the host
keeps start control), never touches rooms, scores, or state, and never
calls a runtime AI: deterministic constraint filtering plus a seeded
weighted draw, with every pick explained by structured reason codes.

Source: `src/games/shuffle.ts`. Tests: `tests/shuffle.test.ts` (19
tests, including pinned-seed goldens). UI: two host-only buttons in the
lobby's Game setup card (`Surprise me`, `Smart shuffle`) plus a result
line; driver `scripts/check-shuffle.mjs` (7 checks).

## Modes

| Mode | How it picks | When to use it |
|---|---|---|
| `random` | Uniform draw from the eligible pool. | "Surprise me" — no preferences, just a game. |
| `smart` | Weighted draw: recency + play-style variety bonuses. | "Smart shuffle" — a fresh-feeling next game. |
| `tournament` | Sequential distinct picks with recency + category-variety bonuses. | Session sets (Milestone I wires it to formats). |

## Hard constraints (filters, never overridden by scores)

- `playerCount` within the manifest's `[minPlayers, maxPlayers]`.
- `excludeIds` — host exclusions, already-played, anything the caller
  wants out. Hard: excluded games can never be picked.
- `incompatibleIds` — format incompatibility. Enforced already, but
  nothing populates it yet: no tournament formats exist until
  Milestone I, so today it is always empty. The engine does not invent
  format verdicts.
- `playStyle` (`solo` / `team`), when given — a capability filter for
  team contexts.

An empty pool is a value, not an exception: `{ ok: false, reason:
"no-eligible-games", requested }`. The UI renders it as "No games fit
N players." Requesting more picks than the pool holds returns every
eligible game with `partial: true`, not an error.

## Soft signals (weights only, never eligibility)

- Base weight 10 per game.
- **Not recently played** (+10): the game's id is absent from
  `recentIds` (most-recent-first history). Recent games can still be
  picked — just less likely.
- **Smart play-style variety** (+5): the candidate's play style differs
  from the most recent game's style. Requires a known most-recent game;
  a stale or empty history gives no bonus.
- **Tournament category variety** (+5): the candidate shares no
  category with the set picked so far. Only applies once a set exists —
  the first pick of a set gets no category bonus.

Picks are sequential without replacement: after each pick, the picked
game leaves the pool and joins the front of the effective history, so a
multi-pick set naturally diversifies.

## Reason codes and explanations

Every pick carries `reasons` (structured codes) and `explanation` (the
deterministic rendering, fragments joined in fixed order):

| Code | Text |
|---|---|
| `random-pick` | Picked at random. |
| `not-recently-played` | Not played recently. |
| `variety-play-style` | Adds a different kind of game after the last one. |
| `category-variety` | Adds a new category to the set. |
| `weighted-pick` | Won the weighted draw. |
| `only-eligible-game` | The only game that fits. |

A singleton pool is always `only-eligible-game` alone — weights are
irrelevant when there is no choice, so no bonus reason is claimed.
Otherwise, smart/tournament picks list the bonuses that applied, or
`weighted-pick` when none did.

## Determinism and the PRNG

Same request + same seed → same result, via the shared mulberry32
PRNG (`src/shared/rng.ts`, re-exported by `src/shared/protocol.ts` so
existing callers are untouched). The engine was deliberately kept free
of node imports and Zod so the web bundle can import it: the shared
RNG is pure math, and request validation is by hand (rules
unit-tested). The UI seeds from `Date.now()` for a fresh draw per
click; determinism is an engine property, tested with pinned seeds,
not a UI property.

## UI wiring (restrained, host-only)

- Buttons live in the Game setup card, so guests never see them.
- `playerCount` is the **connected** player count (fallback: room
  size) — the same population `startGame` enforces min/max against.
- `recentIds` is the room's game history, most-recent-first.
- A shuffle sets the up-next game and shows "`Title`: `explanation`"
  in the result line. Manual selection and a successful start clear
  the line, so it never describes a stale pick.
- The library (G) and the chooser are untouched; shuffle is a third,
  independent way to set up-next.

## What H does not do (Milestone I's job)

- No tournament formats, brackets, or format-compatibility verdicts.
  `tournament` mode picks a distinct, constraint-fitting set; I
  decides which sets a format accepts.
- No scheduling, no multi-day planning, no standings implications.
- No new server endpoint: up-next is client state, so the engine runs
  client-side from the projection the lobby already has.
