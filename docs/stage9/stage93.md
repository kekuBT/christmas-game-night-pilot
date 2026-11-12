# Stage 9.3: playable Spectrum, one complete cooperative journey

- **Handoff:** ChatGPT's 6813167965 on PR #16, which also cleared Stage 9.2.
- **Base:** `0765222` (PR #16's cleared head), on branch `claude/stage9-3-spectrum-play`, as a PR stacked on #16.
- **Authorization:** the owner's standing D-WF-01.
- **Rules:** unchanged from the cleared foundation (`docs/stage9/stage92.md` §2–§7): four rounds, 2–10 players on a fixed roster, clue 60 s → guess 45 s → reveal 8 s, the median team guess, 10/7/4/0 points for a maximum of 40, the original year-round pack `sp-pairs-1`, and the cleared sit-out semantics.

## 1. What this slice is, and isn't
- **It is:** Spectrum, playable end to end in a casual room:
  - choosing it from the library;
  - the briefing;
  - phone play for the clue-giver and the guessers;
  - spectator and TV play;
  - one cooperative team result everywhere a finished game is summarised;
  - Play again.
- **It isn't:** solo, a Cup game, a Quick Party or Smart Shuffle pick, a new content pack, a Memory Book entry, or a humour feature. The pack and the rules don't change.
- **Spend:** no paid AI, no new service, no deployment, no public port, nothing paid for.

## 2. Registration and eligibility
Spectrum is registered only together with its cooperative result path (§3), in the same commit.

- **Registry:** `{ id: "spectrum", title: "Spectrum", minPlayers: 2, maxPlayers: 10, casualOnly: true, cooperative: true }`.
  - `casualOnly` is already server-enforced: a Cup or a solo room refuses it (`CASUAL_ONLY`). The Cup picker already hides casual-only games, and Smart Shuffle never auto-picks them.
  - Starting needs at least 2 connected players and allows at most 10, as for every game (the room's existing checks).
  - The roster is fixed at the start. Late joiners and spectators watch.
- **Manifest:** a typed cooperative variant. `competition: "cooperative"` and `scoring: { type: "shared-team-total" }`, cross-checked: a cooperative game is never official, never per-player-scored for tournaments, and never team-derived.
- **Quick Party:** never adds it (like Jebena Rush). A host starts it from the library.
- **Lifecycle policy:** `{ model: "phased", gameWindowMs: 10 min, phaseMs: SPECTRUM_PHASE_MS, officialEligible: false, unit: "rounds" }`.
  - The durations come from the module's own constant, the one source.
  - Four rounds take at most 452 s, so the 10-minute window is a backstop. If it ever fires mid-round, the result keeps only the revealed rounds and says why (`backstop-partial`).
- **Through the real RoomEngine:** the server keeps its clock, its catch-up after a restart, the phase-key and round checks, and duplicate-event handling, as for every phased game.

## 3. The cooperative result branch
**The problem.** The room's result pipeline is per player. `rawScores` feeds the score log, the results hero ("X wins"), ranks and places, the lobby's last-game line, TV standings, achievements and the Cup. Spectrum's `scores()` copies the one team total to every roster player, but only as a compatibility representation (D-S92-08).

**The branch:**
- **Typed and persisted.** At `finalize`, a cooperative game records `outcome.team`, the authoritative team result:
  - `total` and `max` (40);
  - the revealed rounds: pair labels, clue, target, team guess, distance, points, guess count and reason;
  - the module's end reason, beside the room's own `reason`.
  - It is validated with Zod when the room is saved and restored.
- **Adapter copies stay internal.** For a cooperative game, the server:
  - never projects `rawScores` to any audience;
  - never logs per-player `score-awarded` events, logging one `team-score-recorded` event instead;
  - leaves it out of achievements and any cross-game ranking.
  - The copies are never summed.
- **Every reachable summary says "team".** That covers the phone results hero, the lobby's last-game summary, the TV's live, final and review views, show mode and the What's next panel:
  - no individual winner, place, achievement, personal best or Cup credit is derived from Spectrum;
  - no "You won", "You came 2nd" or "You missed this one" lines (the 9.2 clearance note).
- **Existing competitive games are unchanged.** Every branch is keyed on the game being cooperative.
- **The web bundle never imports the module or the pack.** The client gets only projections, and `stage91-bank-privacy` already enforces this.

## 4. The briefing
In plain words, for everyone:
- **The common goal:** one team, one score out of 40, four rounds.
- **Rotating roles:** each round, one player gives the clue and everyone else guesses.
- **The clue rule:** "Give a clue, not the target number."
- **Guesses:** a guess can't be changed once sent. The team's guess is the middle of everyone's guesses.
- **Scoring:** within 5 → 10, within 10 → 7, within 20 → 4, else 0.
- **When things go wrong:** no clue in time skips the round for 0, and so does a clue-giver who leaves before the clue. Nobody has to guess, but only the guesses sent count. Leaving the game hands your role on.

## 5. Phone play
- **The scale:** both end labels (left = 0, right = 100), the pair's meaning, and a marker.
- **The clue-giver,** in the clue phase:
  - sees the current target only, as a marker and a number;
  - enters the clue (1–80 characters) and sends it with a button or Enter;
  - is reminded: "Give a clue, not the target number."
  - During guessing, they see "Your team is guessing" and the count.
- **A guesser:**
  - In the clue phase, they wait ("<name> is thinking of a clue").
  - In the guess phase, they see the clue as text and their own scale control, and send their guess.
  - After sending, "Your guess: 62 · locked in" and the count.
- **The reveal:** the target, the team's guess, the distance and the points, in words, for example "Target 72 · team guess 68 · 4 away · +10 for the team". It also explains a skipped round ("No clue in time: 0 points"), and a round with no guesses.
- **A sat-out player or late joiner:** the public view, never a target.
- **The countdown** is text, from the server's phase deadline.
- **No accidental sends:**
  - dragging or pressing a key only moves the draft; only Send (or Enter) sends;
  - a draft is local, and a reconnect never sends it;
  - every send names its round and phase key, so a stale one is refused and changes nothing.

## 6. The scale (accessibility contract, from 9.2 §10)
- **A native range input** (0–100, step 1) with an accessible name naming both ends ("From Cold (0) to Hot (100)").
  - The arrow keys move it by 1, and Page Up/Down by 10 (native behaviour, also handled explicitly).
  - The number is always shown as text beside it.
- **Send** is a button and also Enter. The states "Not sent yet", "Sending…" and "Locked in: 62" are text.
- **Everywhere:** both looks, 320/390 phones without sideways scroll, desktop and TV. Reduced motion and Animations Off keep every meaning; markers are told apart by shape and label as well as colour.

## 7. Spectator and TV
- **Live:**
  - the round, the pair and its meaning;
  - who gives the clue, and the clue once given;
  - the guess count ("3 of 5 guesses in") and the countdown;
  - the running team total.
  - Never an unrevealed target or anyone's guess.
- **At a reveal:** the target, the team's guess, the distance and the points, on the scale and in words.
- **Final and review:** the team result, a total out of 40 and a line for each round. The end reason is explained in words. There are no standings.

## 8. Endings, Play again and recovery
- **Endings:** four rounds give one shared result. A partial ending (fewer than two left, or the backstop) says why and keeps the points earned.
- **Play again** uses the casual room's existing rematch: a fresh match (new seed, pairs, targets and roles) with its own ready barrier (the briefing). It starts with no draft, guess or role carried over.
- **Disconnect, reload or a server restart** never restore time, duplicate a send, expose a secret or invent a guess:
  - the deadlines are absolute and persisted;
  - catch-up walks the original deadlines;
  - the room drops a repeated client event id;
  - a reloaded phone shows only what its projection holds.
- **Sit-outs and host changes:**
  - Explicit sit-outs, and the clue-giver leaving before or after the clue, follow the cleared rules (9.2 §3).
  - Handing over the host changes nothing in Spectrum: roles come from the seat order, not from the host.

## 9. Privacy
The cleared projection rules (9.2 §7) apply through the real room for every audience: the clue-giver, a guesser (the host included), a sat-out player, spectators/TV and late joiners. Plus:
- **`outcome.team`** holds only revealed facts: past targets, team guesses, guess counts and clues. It never holds anyone's individual guess.
- **The clue** is free text, rendered as text (React escapes it). There's no HTML, link or markdown.

## 10. Decisions
See `docs/DECISIONS.md` D-S93-01 onward.

## 11. Validation plan
- **RoomEngine and API tests** at 2, 4 and 10 players:
  - fixed roster and late joiners;
  - Cup and solo refusal;
  - timing, restart catch-up and duplicates;
  - shared-score invariants (`outcome.team` is the one total, with no `rawScores` in any projection);
  - privacy canaries for every role and phase, through `RoomEngine.project`.
- **A browser driver,** `check-spectrum`:
  - host, guesser and TV through four rounds;
  - replay and cancel;
  - a timeout, a sit-out and a partial ending;
  - reload and offline recovery;
  - two-room isolation;
  - both looks;
  - keyboard use and 320/390 widths;
  - no individual winner or credit on any Spectrum summary.
- **Regression:** the existing competitive drivers stay in the gate.
- **Gates:** sequential clean fast then full gates on the completed checkpoint, then a new completed report with screenshots and limitations. Real iPhone Safari and Android Chrome are kept separate from emulation (not run).
