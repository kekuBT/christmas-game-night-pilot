// Math Mayhem in the Mchezo kit (§11 optional modernization) — a
// component and UX extraction of the old GamePanel quiz branch for
// Math, not a gameplay rewrite. Intents, scoring, abstention,
// deadlines, permissions, and reconnect behavior are unchanged:
// answers still submit "submit-math-answer" with { questionId,
// chosenIndex }, abstention still submits "abstain" (whole-game),
// the host skip still posts the same endpoint after the deadline,
// and the session/reconnect flow is untouched (App-level).
//
// What changed, deliberately and disclosed:
// - The panel renders in the kit (QuestionScreen + the locked view +
//   the shared waiting ring) instead of the old green shell, where
//   all ten questions were shown at once on one scrolling page.
//   One question at a time, like Trivia and Geography: the first
//   unanswered question, a locked view after answering, and the
//   waiting ring when all ten are in. Any-order answering is
//   preserved — the server accepts answers in any order, and the
//   "Next question" button moves to the first unanswered one.
// - The locked view shows how long the player took, because speed
//   is scored in Math (100 + a bonus from the game start: +20 in
//   the first 5 seconds, +10 in the first 10, otherwise +0 —
//   scoreMathAnswer, unit-tested). The elapsed shown is the player's
//   own measured time from the game start (deadlineAt minus the
//   5-minute window), captured when they tap; the server still
//   computes the bonus from its own clock at arrival, so the display
//   never claims to be the scored value — it is labelled as the
//   time taken, with the bonus rule next to it.
// - No TV stage: Math has no dedicated TV stage (only Trivia does),
//   so there is no "TV stage" chip — the TV falls through to the
//   old TV Dashboard, as before. No staged reveal either: the
//   finished projection carries no correctIndex for Math (only
//   Trivia's does), so finished results stay the old ShowResults.
//   Intro (ShowIntro) is untouched.
// - The accent is distinct from Trivia's and Geography's
//   (accentIndex 2 vs 3 and 1), so the three quiz games do not look
//   identical.
// - GamePanel's quiz branch now serves only Who Said That; the Math
//   branch is dead (App routes math here first), left in place like
//   Trivia's, Year's, and Geography's dead quiz branches — a future
//   cleanup removes dead branches as more games migrate.
//
// Projection shape (unlike Trivia/Geography): Math questions live on
// the top-level PlayerGame (game.questions, {id, prompt, options})
// and the player's answers on game.myAnswers — the server projects
// Math's generated questions only into the player projection while
// playing (room.ts player branch), not into state.questions.
import { serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { useEffect, useRef, useState } from "react";
import { Keycap, MchezoWaiting, Stamp } from "../../ui/mchezo/index.js";
import { QuestionScreen } from "../../ui/mchezo/index.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

export interface MchezoMathDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  gamesTitle: string;
  intent: (gameInstanceId: string, action: string, payload: Record<string, unknown>) => Promise<void>;
  post: <T>(path: string, body: Record<string, unknown>) => Promise<T>;
  roomId: string;
  isHostOrCohost?: boolean;
  /** The game window from the server policy (for the timer ring). */
  windowMs?: number;
}

export function MchezoMath(deps: MchezoMathDeps) {
  const { game, publicGame, players, playerId, gamesTitle, intent } = deps;
  // Sprint 3: no host skip here. The server ends the game at its deadline
  // by itself; the waiting view shows the countdown (GameClock).
  const questions = game.questions ?? [];
  const myAnswers: Record<string, number | null> = game.myAnswers ?? {};
  const [lastAnswered, setLastAnswered] = useState<string | null>(null);
  // Sprint 2: the answered question is recorded at TAP time, and the grid
  // stays locked on the tapped option until the server answers. Recording
  // it only after the request + refresh resolved let the server's push
  // advance the screen to the next question first, which then flipped back
  // to the previous question's locked view (a visible flash, and a tap on
  // the vanishing question could be lost).
  const [pending, setPending] = useState<{ qid: string; choice: number } | null>(null);
  const firstUnanswered = questions.find((q) => myAnswers[q.id] === undefined || myAnswers[q.id] === null);
  // Sprint 3 (P10): a question's prompt arrives only when it is opened, and
  // its speed bonus is timed by the server from that moment. Open the
  // question on screen once; the projection refresh then brings its prompt.
  const opening = useRef<string | null>(null);
  const needsOpen = !game.abstained && firstUnanswered !== undefined && firstUnanswered.prompt === undefined;
  useEffect(() => {
    if (!needsOpen || !firstUnanswered || opening.current === firstUnanswered.id) return;
    opening.current = firstUnanswered.id;
    void intent(game.id, "math-open", { questionId: firstUnanswered.id });
  }, [needsOpen, firstUnanswered?.id, game.id]);
  // Server time (offset-corrected), and the game's real window from the policy table.
  const secondsLeft = publicGame?.deadlineAt ? Math.max(0, Math.round((publicGame.deadlineAt - serverNowEstimate()) / 1000)) : 0;
  const totalSeconds = Math.round((deps.windowMs ?? 300_000) / 1000);

  // Sat out: the server records whole-game abstention; show the wait, not Q1.
  if (game.abstained) {
    return <MchezoWaiting label="You sat this one out" players={players} playerId={playerId} publicGame={publicGame} showClock />;
  }
  // Just answered: locked view until the player moves on. If the poll has
  // not landed yet (answer not in myAnswers), fall through to the question
  // view — the next poll shows the locked view.
  const lockedQ = lastAnswered ? questions.find((x) => x.id === lastAnswered) : undefined;
  const lockedChoice = lockedQ ? myAnswers[lockedQ.id] : undefined;
  if (lockedQ && lockedChoice !== undefined && lockedChoice !== null) {
    return (
      <main className="mz-screen" aria-label="Answer locked in">
        <section className="mz-lockcard" style={{ background: `var(--mz-answer-${lockedChoice % 4})`, color: "var(--mz-on-accent)" }}>
          <span className="mz-kicker">Your answer</span>
          <span className="mz-lockcard__answer">{String(lockedQ.options?.[lockedChoice] ?? "")}</span>
          <Stamp className="mz-lockcard__stamp">LOCKED IN</Stamp>
        </section>
        {game.myAnswerTimes?.[lockedQ.id] !== undefined && (
          <p className="mz-foot" data-testid="mz-math-elapsed" style={{ padding: "0 16px", margin: "8px 0 0" }}>
            Answered in {(game.myAnswerTimes[lockedQ.id]! / 1000).toFixed(1)} s — timed by the game from when this question appeared (+20 within 5 s, +10 within 10 s, if correct).
          </p>
        )}
        <MchezoWaiting label="Waiting for everyone" players={players} playerId={playerId} publicGame={publicGame} showClock />
        <div style={{ padding: "0 16px 16px" }}>
          <Keycap block variant="neutral" onClick={() => setLastAnswered(null)}>
            {firstUnanswered ? "Next question" : "Waiting for the game to finish"}
          </Keycap>
        </div>
      </main>
    );
  }
  // All answered: wait for the rest of the room (or the deadline/host skip).
  if (!firstUnanswered) {
    return <MchezoWaiting label="All your answers are in" players={players} playerId={playerId} publicGame={publicGame} showClock />;
  }
  if (firstUnanswered.prompt === undefined || firstUnanswered.options === undefined) {
    return (
      <main className="mz-screen" aria-label="Getting your next question">
        <p className="mz-kicker" style={{ padding: "16px" }}>Getting question {questions.indexOf(firstUnanswered) + 1} of {questions.length}…</p>
      </main>
    );
  }
  const idx = questions.indexOf(firstUnanswered);
  const opts = firstUnanswered.options;
  const pendingHere = pending && pending.qid === firstUnanswered.id ? pending.choice : null;
  const selected = myAnswers[firstUnanswered.id] ?? pendingHere;
  return (
    <QuestionScreen
      game={{ name: gamesTitle, kind: "Math", accentIndex: 2 }}
      questionNumber={idx + 1}
      questionCount={questions.length}
      question={firstUnanswered.prompt}
      options={opts.map((label, i) => ({ id: String(i), label: String(label) }))}
      selectedId={selected === null ? null : String(selected)}
      locked={selected !== null}
      onSelect={(id) => {
        if (pending) return;
        setPending({ qid: firstUnanswered.id, choice: Number(id) });
        setLastAnswered(firstUnanswered.id);
        void intent(game.id, "submit-math-answer", { questionId: firstUnanswered.id, chosenIndex: Number(id) }).finally(() => setPending(null));
      }}
      secondsLeft={secondsLeft}
      totalSeconds={totalSeconds}
      extra={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="mz-chip-btn"
            onClick={() => { void intent(game.id, "abstain", {}); }}
          >
            Sit this game out
          </button>
        </div>
      }
    />
  );
}
