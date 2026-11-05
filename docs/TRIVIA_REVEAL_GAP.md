# Trivia reveal gap — Phase 2.1 §6 report

No client-only reveal was invented and no game rule was changed in this
pass. This note states what the authoritative Trivia lifecycle supports
today, what is missing for coordinated suspense, whether per-question
reveals can exist without rule changes, and what implementation that
would take.

## What the authoritative lifecycle supports today

Server (`src/server/room.ts`, `src/games/trivia.ts`):

- Start generates 10 questions (`generateTrivia(seed)`); all players see
  the same set. There is no per-question state machine.
- Answers arrive as `trivia-answer` intents in **any order**. A second
  answer to the same question is rejected (`ALREADY_ANSWERED`); answers
  after the game's `deadlineAt` (start + 5 minutes) are rejected
  (`PHASE_CLOSED`).
- The game finishes when every **connected** player has answered all
  questions or abstained (`quizAllDone`), or when the host/cohost skips
  it **after** the deadline (`skipTimedOutGame` — timed-out games score
  nothing and are excluded from official standings). There is no host
  "finish early" control.
- Scoring is fixed at finish: each correct answer is worth
  `100 + speedBonus(3000ms) = 120` points (`scoreTrivia` with a fixed
  3000ms reference — not a live response-time race). Ties in raw scores
  share ranks (`rankStandings`).
- Projections reveal the answer key, aggregate answer counts, and
  per-question point values **only after finish** — never while playing
  (privacy design: no per-player answer status is ever projected).

Client (Mchezo, Phase 2/2.1):

- Intro auto-advances after 8s; questions are presented one at a time
  (first unanswered — a presentation choice, not a server phase).
- Locked view after answering; counts-only waiting ring
  (`submittedCount`/`totalPlayers`, never per-player marks).
- Results at finish only: per-question picker, aggregate "How the room
  answered" counts, per-question points earned, game total, game rank
  with ties.
- TV director (question / reveal / leaderboard) replays **finished**
  data. Its reveal animation (counting → bars → answer) is a display
  timer over post-finish data, not a live event.

## What is missing for coordinated suspense

- No server per-question phase: nothing records "question N is now
  revealed", and no projection field carries a live reveal.
- No per-question timer: the question ring shows the **game** deadline
  (300s total), not a per-question countdown. There is no per-question
  time limit in the rules.
- No live TV reveal: while a game is playing, the TV stage shows a
  featured question only; it cannot show a live reveal because the
  server has not revealed anything yet.
- No host reveal control: the host cannot reveal a question early, and
  cannot finish a game early (only skip it after the deadline, which
  voids its scores).

## Can per-question reveals exist without changing game rules?

Yes — as a **display-only** staged reveal, with one condition kept:

- Reveal rule: a question's correct answer + aggregate counts become
  visible once every connected player has answered **that** question or
  abstained from the game, or when the host reveals it manually.
- This changes nothing scored: answers are still accepted in any order
  until the game finishes, the 5-minute deadline still governs, scores
  are still computed once at finish, ties are unchanged. Revealing Q1
  cannot help Q5 (different question), so early reveals leak no
  advantage.
- What would change the rules, and is therefore NOT proposed here:
  gated progression (must finish Q1 before seeing Q2 — breaks
  any-order answering) and per-question timers (adds a time limit the
  rules do not have). Both need explicit owner approval as rule changes.

## Implementation required (proposed Phase 2.2)

1. Server: a `revealed` set on the quiz game state, updated when a
   question's answers complete (connected players only, mirroring
   `activePlayers`) or on a new host/cohost `reveal-question` intent.
   Projection: `revealed: Record<questionId, { correctIndex, counts }>`
   for playing games — aggregate only, same privacy shape as the
   post-finish fields. No scoring, deadline, or ordering change.
2. Phone: QuestionScreen gains a revealed state per question (locked →
   revealed styling with the correct answer + counts); the waiting ring
   is unchanged.
3. TV: the director gains a live reveal stage driven by the same
   `revealed` field (today's reveal stage only handles finished games).
4. Host: a reveal control on the waiting view (host/cohost only) plus
   the existing post-deadline skip as the escape hatch.
5. Tests: unit tests for reveal completion (all-answered, abstention,
   disconnect, host override), secrecy tests (no key before reveal),
   and driver coverage for phone + TV reveal sync.
6. Docs: decision log entry + PROGRESS update; the staged reveal must
   be announced as display-only so nobody mistakes it for a scoring
   change.

## Recommendation

Implement the display-only staged reveal as Phase 2.2, in the order
above, without gated progression and without per-question timers. It
delivers the coordinated suspense Show Mode intends while keeping every
authoritative rule — scoring, deadline, any-order answering, abstention,
ties — exactly as it is.

## Milestone D outcome (2026-11-04, local only)

The "Implementation required (proposed Phase 2.2)" section above is
SUPERSEDED in one respect: its live-reveal rule (reveal once every
connected player answered that question, plus host manual reveal) was
ruled OUT under the assignment's integrity rule before implementation.
A disconnected player may reconnect while answers are still accepted,
so any in-play correct-answer or distribution display creates a relay
channel to a still-eligible player; "all connected answered" is
insufficient, and host controls must not override the safety
condition. No server `revealed` set, no `reveal-question` intent, and
no live TV reveal stage were built.

What was built instead (decision L42): a post-completion staged
reveal, display-only, over the finished projection's existing fields
(correctIndex, answerCounts, questionPoints, rawScores). Phone:
question → reveal per question, then a standings finale, with
Next/Previous, auto-play (6s/step, stops at the finale), question
jumps, and a persistent Back to lobby. TV: the auto-director walks
question (4s) → reveal (5s) per question, then the leaderboard;
manual jumps switch auto off. No scoring, deadline, ordering, or
tie rule changed; gated progression and per-question timers remain
deferred pending owner decision, as before.

Refresh/reconnect recovery: the sequence is rebuilt from the finished
projection on mount and restarts at the first question, so nothing is
lost — but a full reload-to-results round-trip was not driver-verified
and is recorded as a limitation, not a claim.
