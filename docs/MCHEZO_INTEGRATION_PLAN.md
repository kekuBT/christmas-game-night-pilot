# Mchezo "The Circle" — integration plan (Phase 1 audit, 2026-11-04)

## Handoff inspected
`docs/mchezo-handoff/mchezo-ui/` (kept as the reference copy; the integrated
copy lives in `apps/web/src/ui/mchezo/`). React 18/19 + TS source, no backend,
no scoring logic. `npm install && npm run typecheck` in the handoff folder:
**exit 0, clean**. Our app is React 19 + Vite 5 + strict TS, so the handoff's
peer range (React >= 18.2) is compatible; its Vite 6 config is not used.

## What maps cleanly
- **Tokens + provider.** `themes.everyday` is the year-round default;
  `themes.christmas` is a seasonal skin only, never the platform identity.
  Fonts: self-hosted `@fontsource-variable/unbounded` + `@fontsource-variable/figtree`
  (free, $0, works offline after install) instead of the Google Fonts link.
  CSS is `mz-`-prefixed; our old stylesheet is unprefixed, so no collisions.
- **Landing.** `LandingScreen` + `CodeInput` — but adapted (see below).
- **Lobby.** `LobbyScreen` + `CircleLobby` + `useArrivals` — players, host,
  connection states, capacity, up-next game, reaction bursts.
- **Trivia gameplay.** `QuestionScreen` + `AnswerGrid` — one question at a
  time, tap locks the answer (matches our server: one answer per question,
  server-validated; a second tap is rejected server-side and the grid disables
  after selection).
- **Results.** `PhoneRevealScreen` + `ResultCard` + `StandingsList` +
  `AnswerDistribution`, driven by `rankStandings()` (ties share a rank —
  consistent with our midrank-based standings, but note: the phone reveal
  ranks the *finished game's raw scores*, not the cumulative Family Cup
  totals; the cumulative totals stay in ChampionshipView).
- **TV.** `TVStage` + `TVTopBar` + `TVQuestion` + `TVReveal` +
  `TVLeaderboard` + `DirectorBar`. TV data is public-only, same as our
  existing TV Dashboard policy.

## Necessary adaptations (documented deviations, not reinterpretation)
1. **Room code is 6 alphanumeric characters** (e.g. `K7M2Q9`), not 4 letters.
   Our copy of `LandingScreen`/`CodeInput` gains a `codeLength` prop (6) and
   an alphanumeric pattern. The 4-tile default is a handoff assumption about
   *its* demo, not our room system.
2. **No per-question timer exists.** Our games have one 5-minute game
   deadline (`deadlineAt`). `QuestionScreen`'s ring shows real game time
   remaining (deadline countdown), not a per-question clock.
3. **No per-question reveal exists.** Our server reveals answers only at
   game finish. Trivia is presented one question at a time; after the last
   answer the player waits until the game finishes, then sees per-question
   results (own answer vs correct, from the finished projection) and the
   game standings. The handoff's 750-point demo awards are never used;
   points come only from server `rawScores`.
4. **Who-has-answered is counts-only, by existing privacy design (L27).**
   The server projects `submittedCount`/`totalPlayers`, never per-player
   answered status. The waiting screen therefore shows a true count with
   anonymous seats (adapter component using `mz-wait` styles), not
   `WaitingCircle`'s per-player check marks, which would require inventing
   or newly exposing per-player answer status. `WaitingCircle` itself is
   NOT used for this reason.
5. **Answer distribution is aggregate-only, post-finish.** New server field
   `answerCounts` on finished quiz-game projections: per-question counts
   per option index, computed from stored answers, no player identities.
   Used by phone results (question picker) and TV reveal. Never shown
   before finish.
6. **Reactions differ.** Our server accepts 6 emoji (🎄❄️🎉👏😂🔥); the
   handoff has 5 ids (love/bravo/ha/wow/brr). The adapter maps handoff ids
   to our emoji set on send and back on display. No new server emoji set.
7. **Nudges are real or not at all.** The handoff lobby has a nudge affordance
   but our server had no nudge. Phase 2 adds a minimal ephemeral nudge
   (same pattern as reactions: in-memory, never ledger, never scored,
   projected as `nudgedBy` for the target only, expiring). If this were
   cut, the nudge affordance would have to go too — a local-only "Nudged!"
   bubble that nobody receives would be a fake feature.
8. **TV toggle = TV stage view.** There is no separate TV-device pairing in
   our app; the "big screen" toggle opens the TV stage on this device
   (the existing TV Dashboard concept, restyled), and returning restores
   the phone view. It never just flips a display flag with no effect.
9. **Christmas theme wiring is future work.** Phase 2 uses the everyday
   theme for all integrated screens. The christmas theme is available in
   code and will be selected when a seasonal Family Cup event is active;
   it is not hardcoded as the platform look.

## Adapt / reuse / replace
- **Adapt:** landing (code length/pattern), lobby (TV toggle wiring,
  reaction mapping, nudge endpoint, up-next = first unstarted game or the
  playing game), Trivia phone flow (sequential questions, deadline ring,
  waiting adapter, results with question picker), TV stage (featured
  question while playing, reveal + leaderboard after finish, director
  question picker).
- **Reuse as-is:** tokens, provider, AnswerGrid, QuestionScreen,
  PhoneRevealScreen pieces, StandingsList, TV components, rankStandings.
- **Replace (only in integrated views):** old landing card, old LivingLobby
  pills, old Trivia branch of GamePanel, old TV Dashboard (only when a
  Trivia game is the TV subject).
- **Untouched in Phase 2:** the other 10 games' UI, ShowMode intro/waiting/
  results for non-Trivia games, ChampionshipView, MemoryBookView, reactions
  mute/host controls, server scoring, Family Cup rules, auth/session flow,
  WS reconnect, abstention, host recovery.

## Dependencies
- Add: `@fontsource-variable/unbounded`, `@fontsource-variable/figtree`
  (self-hosted fonts). No other new runtime deps. Handoff QA scripts
  (`qa/run_phone.py`, `qa/run_tv.py`) are Playwright-Python; our QA stays
  in the existing Node Playwright drivers (adapted, not ported).

## Risks / open items
- Fonts must render in the built app; if the fontsource install fails, the
  token fallbacks (system fonts) apply and the checkpoint must say so.
- The 480px phone shell vs our old 760px column: integrated views are
  full-viewport Mchezo surfaces; non-integrated views keep the old column
  until their turn. Mixed navigation is a temporary checkpoint state.
- TV stage at 1920×1080 scales down via the handoff's own scaler; small
  laptop windows will show a scaled stage, not a reflowed one — by design.
