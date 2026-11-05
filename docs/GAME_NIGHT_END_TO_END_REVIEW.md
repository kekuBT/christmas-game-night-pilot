# Game Night End-to-End Review — Work Package C

A realistic local game-night simulation: two scenarios, 28 checks, all
passing on the fourth run (2026-11-05 ~04:39 EST). The driver is
`scripts/check-game-night.mjs` (npm script `check-game-night`). It uses
Playwright Chromium at desktop width (the phones are emulated browser
pages, not real devices) against the local server on port 3461. Every
player is a separate page in one browser context; the TV is a spectator
page. All names and scores are synthetic test data.

## Scenarios

**Scenario 1 — a six-player evening (room code, host Ada + Bea, Cal,
Dee, Eli, Fay), one spectator TV, and Gus, a seventh player who joins
between games.** Games in order: Trivia Showdown, Closest Wins, Math
Mayhem. The host grants Bea cohost through the lobby UI. Gus guesses
one Closest question, then closes his page (disconnected). Eli
abstains in Trivia (whole-game) and in Closest (per-question). Eli
answers one Math question, reloads his page, and answers the rest.
Cal tries to skip a game (guest, not host/cohost) over HTTP.

**Scenario 2 — a full room.** Host + nine guests (10 players) + a
spectator. One Trivia game, eight players answering, one abstaining,
the host answering. The TV leaderboard must show all ten rows.

## What ran

Command: `node scripts/check-game-night.mjs http://localhost:3461`
(four runs; the log of the green run is
`~/workspace/gates-c-game-night4.log`). Runs 1–2 stopped at the same
place (Gus's join); run 3 reached 16 of 17 checks; run 4 passed all
28. Exit code 0, "GAME NIGHT ALL PASSED (28 checks)".

## Results (run 4)

- Cohost granted via the lobby UI: PASS.
- Spectator does not consume a player slot (players 6, spectators 1): PASS.
- Spectator sees no correct answers while playing and has no answer
  controls: PASS.
- Trivia finishes with one abstention and nobody blocked: PASS.
- Trivia scores agree across the TV, the phone, and the server (6 TV
  rows, matching `rawScores`): PASS.
- Tied players share a rank and a score (Cal = Dee, rank 3, 120):
  PASS.
- Identical answers give identical scores (no double-count): PASS.
- Phone standings show the same leader as the TV and the server
  (Fay): PASS.
- Everyone returns to the lobby after Trivia: PASS.
- Closest waiting ring shows honest counts (2/7 after two guesses):
  PASS.
- Disconnected player is marked Away (projection `connection`):
  PASS.
- Abstained player is back in for the next Closest question
  (per-question scope): PASS.
- Closest finishes without the disconnected player: PASS.
- TV lists the disconnected player (Gus) and follows the active
  game (closest): PASS.
- Guest sees no start button; cohost can start a game: PASS.
- Guest skip is rejected (HTTP 400, "Only host/cohost can skip a
  timed-out game"): PASS.
- Reloaded player lands back in the game, his earlier answers
  survived, and he scored in Math: PASS.
- TV follows the active game (math): PASS.
- No stale game panel in the lobby after the games: PASS.
- Championship standings list all seven players: PASS.
- Max room holds 10 players + spectator; max-room Trivia finishes;
  max-room TV leaderboard shows all 10 players: PASS.

## Correctness defects found

None. The scoring, the tie handling, the abstention scopes, the
cohost authority, the guest skip rejection, the disconnect/reconnect
behaviour, and the TV/server/phone agreement all held. (The server
dedupe that guarantees no double-count is pinned separately by the
Milestone K replay unit tests.)

## UX defects and gaps found

1. **A late joiner lands on the finished game's results with no
   context.** Gus joined after Trivia had finished and landed on the
   Trivia reveal walk — a screen about a game he did not play, with
   no line saying so. He could reach the lobby by walking the reveal
   to its finale. This is how the app routes any fresh joiner (the
   latest finished game is shown first); it is confusing for someone
   who just arrived. Suggested: a short line on the results screen
   when the viewer did not play that game ("You joined after this
   game finished — here's the lobby"), or route a fresh joiner
   straight to the lobby when the game is already finished.
   (Package F item; no rule change.)
2. **The old TV dashboard has no Away marker.** The kit surfaces
   (the Trivia stage leaderboard, the waiting ring, the lobby seats)
   mark a disconnected player "Away". The old TV dashboard — which
   is what the TV shows for every non-Trivia game — lists the player
   with no marker at all. A host watching the TV cannot tell who
   dropped out. Suggested: render the same Away marker in the old
   dashboard's player list, or bring the dashboard's player list
   into the kit. (Package F / visual-review item.)
3. **A failed join shows no error on the landing.** The kit landing
   does not render `App.err`, so a join that the server rejects
   leaves the player on the landing with no explanation. (This was
   visible while debugging Gus's join; the join itself had
   succeeded. Package F error-mapping item.)

## Driver bugs found and fixed (not app defects)

- Runs 1–2: the driver waited only for the lobby heading after a
  join. A joiner arriving after a finished game lands on the reveal
  walk, so the heading never appeared and the join timed out. Fixed:
  the driver now waits for the lobby heading, the results' "Back to
  lobby", the reveal step, or a game indicator, and walks the reveal
  to the lobby when needed.
- Run 3: the driver returned only the host to the lobby between
  games, so the cohost's page had no chooser and her start timed
  out. Fixed: every connected player returns to the lobby between
  games (`backToLobbyAll`), which is also what a real evening does.

## Environment limitations

- Chromium emulation only; no real iPhone Safari, no real TV, no
  real phone was used. Seven to eleven pages poll the same local
  server every two seconds, so timings are slower than a single
  player's.
- The driver runs against the shared dev server on port 3461. It
  must not run at the same time as another driver batch (the
  2026-11-05 01:45 parallel-run interference, see
  `docs/BROWSER_RUNTIME_INCIDENTS.md`).
- Screenshots are test-fixture data, labelled so: `14-game-night-
  lobby.png`, `15-game-night-tv-results.png`,
  `16-game-night-closest.png`, `17-game-night-max-room.png` in
  `docs/mchezo-screenshots/`.

## Suggested priorities

1. The late-joiner landing (gap 1) — it is the first thing a real
   late guest sees, and it is the only confusing screen in an
   otherwise clean evening.
2. The TV Away marker (gap 2) — the host's only view of who is
   still in the room, for nine of the eleven games.
3. The join-error rendering (gap 3) — part of the Package F error
   mapping, which also covers the lobby swallowing start errors.
