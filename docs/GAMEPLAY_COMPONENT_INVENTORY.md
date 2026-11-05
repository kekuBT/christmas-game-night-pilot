# Gameplay Component Inventory (Milestone J close-out — Work Package B)

**Status: inventory + audit. The two-button simplification is a planned
correction (see §1), not yet implemented — it changes web code and
must wait for the in-flight K regression batch to land before the
bundle is rebuilt.**

This inventory answers Package B: what J.3 actually built, what is
reusable, and what remains game-specific. It is grounded in the code
as of the J.3 commit (`44ddef3`) plus the K work in progress.

## 1. The two submission buttons — finding and plan

**Finding.** `NumericGuess` holds two independent values: the dial
(`dialValue`, initial 50) and the number field (`numInput`, initially
empty). They are not synchronized — moving the dial does not fill the
field, typing does not move the dial. The two buttons therefore submit
*different* values: "Submit guess" sends `Number(numInput)` (0 when
the field is empty, exactly as the old panel did), and "Submit dial
guess {v}" sends `dialValue`. The dial button's label shows its value,
which helps; the number button's label does not show its value, so a
player who typed a number and also moved the dial cannot tell at a
glance which value each button sends. The ambiguity is real but
bounded: both buttons submit a number for the same question through
the same intent (`closest-guess`), and the server treats them
identically.

**Verdict: the two buttons are not genuinely different semantics.**
They exist because the two inputs hold separate state. A single
primary Submit can preserve both input methods if the inputs share
one value:

- One source of truth (`value`, initial 50). The dial sets it; the
  number field edits it; the displayed value is always the value that
  will be submitted.
- One primary button, labelled with the value ("Submit guess 250"),
  so the player always knows exactly what will be submitted.
- Keyboard behavior preserved: the number field keeps keyboard entry
  (arrows, typing) and the dial keeps arrow-key support.
- Validation: the field's value is clamped to `[min, max]` and the
  clamp is *visible* (the field always shows the current value), so
  no value is silently changed. The old "empty field submits 0" quirk
  disappears with the unification — the value is never invisible —
  which is a disclosed behavior change, not a silent one.
- Server semantics unchanged: one `closest-guess` intent with a
  numeric value, same as today.

**Planned correction (after the K batch lands):** unify
`NumericGuess` to a single value + single Submit button, update the
`check-closest` driver (it uses both `mz-num-submit` and
`mz-num-dial-submit`) and the F5/e2e `actClosest` helper, re-run the
affected drivers, and commit as a separately tested UX correction.
Until then the two buttons stay as they are — they are correct, just
ambiguous.

## 2. Page cohesion — Closest Wins, whole phone experience

The Closest game renders in the kit (`PhoneScreen`) for gameplay and
waiting, and the App routes it there before the old shell — so the
play view itself has no legacy chrome. But the game *flow* still
crosses surfaces:

- **Lobby (kit):** Circle lobby, Cup indicator ("Family Cup · Day 1
  of 7"), game setup, TV toggle, library, studio. Coherent.
- **Intro (old):** `ShowIntro` — the 8-second auto-advance screen
  with `show-start-playing`. Not kit; it is the same legacy intro
  every game uses, including Trivia.
- **Play (kit):** `MchezoClosest` — kicker, prompt card, NumericGuess,
  AbstainControl, waiting ring. Coherent, and it shows no Family Cup
  indicator while playing (the Cup context is lost mid-game).
- **Results (old):** `ShowResults` — the legacy results screen every
  game uses, including Trivia.
- **Return to lobby:** the results screen's "Back to lobby" returns
  to the kit lobby. Works, but the transition is old → kit.

**Finding:** the play panel is modern; the flow around it is not.
The narrow consistency correction is to migrate `ShowIntro` and
`ShowResults` to the kit — but that touches all eleven games, so it
is a separate visual-review item, not a B fix. Documented here for
that review, not implemented in B. The missing Cup indicator in game
views is a smaller gap (the lobby shows it; game views do not) and
belongs in the same review.

## 3. Component inventory

### NumericGuess (`ui/mchezo/components/NumericGuess.tsx`)
- **Used by:** Closest Wins today (dial 0–1000, initial 50);
  Guess the Year next (timeline 1900–2025) — the component was built
  for this reuse (Package D).
- **Supported use cases:** any game whose answer is a single number
  in a bounded range, submitted once per question. Dial + number
  field + submit.
- **Known limitations:** two independent input states (see §1 — to be
  unified); the number field does not clamp to `[min, max]` (an
  out-of-range guess is submitted as typed — the server accepts it
  and scores by closeness, as the old panel did); no countdown shown
  (the deadline is invisible in this component); the field starts
  empty per mount (component-local state, not App-shared).
- **Not for:** text, tile, choice, or performance answers — games
  that answer differently must not be forced into it.

### AbstainControl (`ui/mchezo/components/AbstainControl.tsx`)
- **Used by:** Closest Wins (and, by design, any game with
  abstention). Trivia's abstention still uses its own button in
  `MchezoTrivia` (not yet migrated to this control).
- **Supported use cases:** a single "Sit out (abstain)" action plus
  the verbatim abstained note ("You sat this one out — 0 points for
  what you skipped. The game continues for everyone else.").
- **Known limitations:** it renders the note when `abstained` is true
  but takes no game context — the caller must know the abstention
  scope (whole-game vs per-question vs per-phase) and hide it where
  the server would reject it (e.g. post-guess Closest, where the
  server throws `ALREADY_GUESSED` — `MchezoClosest` omits it there).
  It does not enforce scope itself.

### MchezoWaiting (`ui/mchezo/components/Waiting.tsx`, moved into the kit in J.3)
- **Used by:** Trivia play and Closest Wins (done states). The old
  `ShowWaiting` still serves the other nine games.
- **Supported use cases:** any waiting state — counts-only ring
  (`submittedCount`/`totalPlayers` from the public projection, never
  per-player answered identities, decision L27), seats with Away
  badges, host skip when stalled, optional footnote.
- **Known limitations:** the default footnote is Trivia-specific
  ("The reveal plays right here when the game finishes.") — callers
  must pass their own `footNote` (Closest does). It shows the skip
  button only when the caller supplies `onSkip` (host + stalled);
  the caller owns that gating.

### Game screen scaffold — PhoneScreen (`ui/mchezo/components/phone/screens.tsx`)
- **Used by:** every kit screen (lobby, Trivia, Closest, Library,
  Studio, TV stage).
- **Supported use cases:** a 480px-max phone screen with a label and
  a tone; the single scaffold for all kit views.
- **Known limitations:** it is a container, not a game layout — each
  game still composes its own cards, kickers, and controls inside it.
  It does not provide a game header (kicker + prompt) or a Cup
  indicator; those are per-screen.

### Results presentation
- **Kit:** `MchezoTriviaResults` (in `MchezoTrivia.tsx`) — the
  post-completion staged reveal (question → reveal → standings),
  with per-question points and the answer distribution. Trivia-only:
  it depends on `correctIndex`/`answerCounts`/`questionPoints`,
  which only Trivia's finished projection carries.
- **Old:** `ShowResults` (`components/ShowMode.tsx`) — the results
  screen for all eleven games, including Closest and Trivia's
  fallback. It shows game scores and the day's standings.
- **Known limitations:** two systems, not one. The kit reveal cannot
  serve other games without their finished projections carrying the
  same per-question data, and the old results screen is the legacy
  chrome noted in §2. A shared kit results component is a future
  slice, not a B fix.

### Host-only controls
- **Start / chooser / mode:** the lobby's Game setup card (host/cohost
  only) — mode segmented control, "Choose a different game" compact
  selector, single Start Keycap. Ordinary players see no setup card.
- **Skip:** the waiting views' "Skip timed-out game" button, host +
  stalled only, server-enforced (deadline + playing status).
- **Shuffle:** "Surprise me" / "Smart shuffle" (Milestone H) — set
  up-next only, never start.
- **Studio:** the Tournament Studio preview button (host only).
- **Known limitations:** the setup card is the only place the mode
  lives; a host who wants to change the mode mid-game cannot (there
  is no setup card in game views). The Start button has no in-flight
  guard in the UI itself — the guard is in `App.startGame` (K fix),
  not in the button.

### Error messages
- **Mechanism:** `App.setErr` — server rejections surface as
  `Not accepted: <reason>` and request failures as the error message.
  The old shell renders them as `<p className="err">`; the kit
  lobby does not render `err` at all (a kit gap — a start error in
  the lobby is swallowed, which is why the K double-start guard
  matters: it prevents the error from being set in the first place).
- **Known limitations:** raw server reasons (`PHASE_CLOSED`,
  `ALREADY_ANSWERED`) reach the player untranslated in the old
  shell. A human-readable error mapping is a Package F item.

### Submission confirmation
- **Mechanism:** per-game confirmation text ("Your guess: 42",
  "Abstained on this question.") plus the waiting ring. Trivia
  confirms via the answer grid (own answer marked, locked).
- **Known limitations:** the last finisher's confirmation never
  renders (the guess and the game's advancement are one server
  mutation — the game finishes before the confirmation can show).
  That is a server-semantics fact, not a UI bug, and the drivers
  assert around it.

### Loading and reconnect states
- **Mechanism:** the App polls the projection every 2s; a reload
  restores the session from sessionStorage (`cgn_roomId` /
  `cgn_playerId` / `cgn_token`) and re-joins via `/reconnect`;
  the WS auto-reconnects (decision L32). The lobby share chip shows
  "…" until the projection lands.
- **Known limitations:** there is no explicit "reconnecting" state
  in the UI — a reload shows the landing briefly, then the room.
  A stale session (bad token) surfaces as a 400 with no recovery
  affordance in the UI (the player must re-join by code). A
  "session replaced" message does not exist yet (supersede is a J.2
  contract, not implemented).

## 4. What is truly reusable vs game-specific

**Truly reusable (proven across two games):** `MchezoWaiting`
(Trivia + Closest), `AbstainControl` (Closest; Trivia pending),
`NumericGuess` (Closest; Year next), `PhoneScreen`, `Keycap` /
`PlayerToken` (primitives), the lobby/setup/skip host controls.

**Reusable with adaptation:** the staged reveal (Trivia-only data
today — needs per-game finished-projection data to generalize);
the results presentation (two systems — needs a kit results
component before it can be shared).

**Game-specific (must not be generalized):** the question/answer
interaction itself (choice grids, dials, tiles, text, performance),
the scoring display (per-question points are Trivia's; Closest's
are per-question closeness scores), and any hidden-role or team
mechanics (Impostor, Charades). A social-deduction game must not be
forced into the same interface as a numerical-estimation game —
that is why `NumericGuess` is scoped to number answers only.
