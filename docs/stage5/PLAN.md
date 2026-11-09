# Stage 5 plan: the complete game night

**Baseline:** `b706a84` (the pushed Stage 4 head; its verified code is `84ed7ed`, full gate run `20261109-035458-84ed7ed0-4459`, 59/59).
**Branch:** `claude/stage5-complete-game-night`.

## Checkpoints (each tested and committed before the next starts)

| # | Checkpoint | Exit evidence |
|---|---|---|
| P | Failed-action feedback on every game screen; honest reconnect wording (review items 1–2) | `check-send-failures` fails on the Stage 4 build, passes after; affected drivers green |
| A | Live show TV: one Night Circle frame for the room TV and spectators; shared parts; per-game panels from the public projection only; director controls that never touch server clocks; Live / Briefing / Final standings / Post-game review clearly labelled | TV privacy driver (secret words, live answers, authors, Math answers never shown); updated TV drivers |
| B | Between games: results → lobby → next game, host in control; guests told what's next | flow driver |
| C1 | Majority Rules, Practice-only | unit + driver (privacy, ties, reconnect, TV) |
| C2 | Pattern Pulse, Practice-only | unit + driver (no future patterns, per-player pace, reduced motion) |
| C3 | Draw & Guess, Practice-only | unit + driver (stroke limits, prompt privacy, spectator mid-round, drawer disconnect) |
| E | Personality: lines only from recorded events; celebration language; reactions review | unit + driver |
| D/F | Bluff Battle only if everything above is verified; quality audit of every game | audit doc |
| Z | Full gate on one revision from a clean clone; docs; push | `PASSED (exit 0)` |

## Architecture choice for new games

The eleven existing games live as branches inside `src/server/room.ts`. New games use one **game module** contract (`src/games/modules/`), which `room.ts` calls generically:
- init, intents, abstain, phase and deadline;
- scores, participation;
- player view (private) and public view (TV-safe).

This keeps existing games' code paths untouched, and each new game becomes a pure module with its own unit tests (AGENTS.md: "Each game module implements common contract and pure tests").

New games are `officialEligible: false` in the policy table. Their practice-only reason is stated, and the server refuses an official start, as it already does for Impostor and Charades.
