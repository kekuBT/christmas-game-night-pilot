# M6 — Show Mode & Visual Experience: audit, architecture, plan

Status: M6.1 done 2026-11-04. M6.2/M6.3/M6.5 partially implemented in the same session
(see docs/PROGRESS.md). Family Cup scoring, championship-day persistence, day-specific
ceremonies, and Memory Book line pagination are carried forward unchanged — no M6 change
touches `src/scoring/` or the ledger.

## M6.1 audit findings (read from the live code, not assumed)

1. **Landing:** two buttons, no steps. "Create a room" is disabled with no name and no
   explanation why. A developer note ("open a second tab to test multiplayer") is not
   family language.
2. **Lobby is one long scroll:** game list, active game panel, and finished games all
   compete. The active game panel appears below the fold, so a player who just joined
   a started game must hunt for it. No primary action hierarchy.
3. **No waiting state:** after answering, a quiz player sees only "Answered." No count
   of who is still playing, no sense of what happens next.
4. **No show states:** a game starts instantly; the tutorial is a paragraph inside the
   game card. There is no announcement, intro, reveal, or results moment.
5. **Host controls are scattered:** start buttons per game card, cohost grants per
   player row, skip button only when a deadline has passed and only in the lobby card.
6. **TV view is a text dump,** not a stage: standings, now-playing, and recent games
   as plain paragraphs.
7. **Players are plain pills:** no presence beyond "(away)", no ready state, no
   personality.
8. **No reactions, no sound setting, no animation setting.** Effects, where they
   exist, are CSS only and cannot be reduced by the player.

## Show Mode state model (presentation layer only — server stays authoritative)

Derived client-side from the projection plus per-player local state. No new server
game state, no change to game rules, timers, or scoring.

| Show phase | When it shows | Primary action |
|---|---|---|
| `landing` | No session | Enter name, then Join or Create |
| `lobby` | Session, no playing game | Host: pick a game and start it. Player: wait, watch ornaments, react |
| `intro` | A playing game the player has not dismissed yet | "Start playing" (also auto-advances after a few seconds — nobody is left behind) |
| `gameplay` | Playing game, intro dismissed | Play the game (per-game panel) |
| `waiting` | Playing game, my progress done (see below) | Wait — shows how many have played so far; host skip if stalled |
| `results` | Latest game finished, not yet dismissed | See scores and winner, then "Back to lobby" |
| `championship` / `tv` / `memory` | Explicit nav choice | Existing views, restyled as stage views |

`myProgressDone` (per game, from the player's own projection only): quiz games —
every question answered; Caption — vote cast; Closest — guess submitted; Year — every
event guessed; Impostor — vote cast or (clue phase) clue submitted; Connections —
a group submitted and no tiles left ungrouped is not knowable, so Connections shows
the waiting banner only after a submitted group when the player has no selection
pending (best effort, labelled as such). Other games fall back to the existing
per-game feedback.

**Privacy rule:** the waiting banner shows counts only (`submittedCount` /
total players), never who submitted or what they submitted. `submittedCount` is
cumulative per game (players who have submitted at least one accepted intent),
computed server-side from the engine, and labelled "have played so far" — it is
not a per-phase count, and the UI says so.

## Design system (extends Midnight Christmas, does not replace it)

Tokens unchanged: bg `#102C25`, panel `#245344`, gold `#E5BC70`, cream `#F7F2E8`,
accent `#A73545`. Added: ornament palette (gold, cranberry, pine, snow, plum) assigned
by hashing the player id, so a player's ornament colour is stable across sessions;
`.show-*` classes for phase banners, `.answer-tile` for tactile choices,
`.role-card` for the Impostor flip, `.ornament` for lobby players, `.waiting`
for waiting states. Animation intensity is a per-player local setting
(`full` / `reduced` / `off`) stored in localStorage, plus `prefers-reduced-motion`
respected in CSS. Sound is off by default; the toggle is local only and uses a
WebAudio chime (no assets, no downloads).

## Reactions (M6.5, server-assisted but scoring-free)

- Allowed set only: 🎄 ❄️ 🎉 👏 😂 🔥. No free text, ever.
- Server (`LocalServer`, not the engine, not the ledger): per-room recent reactions
  (emoji, sender display name, timestamp), rate-limited 1 per 3 seconds and 30 per
  hour per player, host/cohost mute toggle. Reactions are ephemeral: projections
  only carry reactions younger than 15 seconds, and they are never persisted.
- Client renders reactions only on lobby, TV, and results screens — never during
  private gameplay phases (Impostor clue/vote, Charades actor prompt), so they
  cannot distract a secret moment or leak anything.
- Reactions never touch scores, standings, or the ledger.

## Game personalities (M6.3 first, M6.4 rest)

- Impostor: flippable private role card (button-based flip, keyboard accessible).
- Trivia/Math/quiz games: large tactile answer tiles with answered states.
- Connections: tap grouping with a visible group tray and mistake feedback.
  **Drag-and-group was explored and deferred:** HTML5 drag-and-drop does not work
  reliably on iPhone Safari, and a pointer-based drag would duplicate the tap flow
  for no gameplay gain. Tap grouping stays the interaction; the tray makes it feel
  grouped. Revisit only if a touch drag can be proven on a real iPhone.
- Guess the Year: timeline slider (range input) with a numeric input alternative.
- Closest Wins: dial-style range input with a numeric input alternative.
- Remaining games (M6.4): personality styling and feedback through the same
  shared components, no rule changes.

## What is deliberately NOT in M6

- No 3D world, no particle/confetti systems, no sound effects library, no new
  dependencies beyond the existing ones, no server-side timers or auto-advance of
  games (host control is preserved — only the per-player intro auto-advances, and
  only for that player's own screen).
- No real-device claim: iPhone Safari and Android Chrome remain NOT RUN until a
  real device runs; Chromium emulation is the only browser evidence.

## Stage order

M6.1 audit + architecture (this doc) → M6.2 shared foundation → M6.3 signature
interactions (Impostor, Trivia, Connections, Year) → M6.4 remaining games +
championship/TV/Memory Book restyle → M6.5 reactions + polish → M6.6 verification
and visual review package (screenshots at iPhone + TV/desktop sizes, in-chat).
