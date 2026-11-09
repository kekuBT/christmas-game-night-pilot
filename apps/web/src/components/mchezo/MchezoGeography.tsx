// Geography Challenge in the Mchezo kit (Work Package E) — a
// component and UX extraction of the old GamePanel quiz branch for
// Geography, not a gameplay rewrite. Intents, scoring, abstention,
// deadlines, permissions, and reconnect behavior are unchanged:
// answers still submit "geography-answer" with { questionId,
// chosenIndex }, abstention still submits "abstain" (whole-game),
// the host skip still posts the same endpoint after the deadline,
// and the session/reconnect flow is untouched (App-level).
//
// What changed, deliberately and disclosed:
// - The panel renders in the kit (QuestionScreen + the locked view +
//   the shared waiting ring) instead of the old green shell, where
//   all eight questions were shown at once on one scrolling page.
//   One question at a time, like Trivia: the first unanswered
//   question, a locked view after answering, and the waiting ring
//   when all eight are in. Any-order answering is preserved — the
//   server accepts answers in any order, and the "Next question"
//   button moves to the first unanswered one.
// - No TV stage: Geography has no dedicated TV stage (only Trivia
//   does), so there is no "TV stage" chip — the TV falls through to
//   the old TV Dashboard, as before. No staged reveal either: the
//   finished projection carries no correctIndex for Geography (only
//   Trivia's does), so finished results stay the old ShowResults.
//   Intro (ShowIntro) is untouched.
// - The question mode (flag / capital / outline / region /
//   higher-lower / distance) is NOT shown as a label: the projection
//   carries only { id, prompt, options } for Geography, so the mode
//   never reaches the client. The prompts are self-describing (the
//   flag emoji, "capital of", the outline hint, "region", "taller",
//   "closest to Paris"). Adding the mode to the projection would be
//   a small, safe server change (display metadata, not an answer
//   key) — a possible follow-up, not done here, so E stays
//   server-free.
// - The accent is distinct from Trivia's (accentIndex 1 vs 3), so
//   the two quiz games do not look identical.
// - GamePanel's quiz branch still serves Math and Who Said That;
//   only Geography's branch is now dead (App routes geography here
//   first), left in place like Trivia's dead quiz branch — a future
//   cleanup removes dead branches as more games migrate.
import { satOutLabel, serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { useState, type ReactNode } from "react";
import { Keycap, MchezoWaiting, Stamp } from "../../ui/mchezo/index.js";
import { QuestionScreen } from "../../ui/mchezo/index.js";
import type { GameState, PlayerGame, PublicGame, PublicPlayer } from "../../types.js";
import { asRecord } from "../../types.js";

export interface MchezoGeographyDeps {
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

function stateOf(game: PlayerGame): GameState {
  return asRecord(game.state) as GameState;
}

export function MchezoGeography(deps: MchezoGeographyDeps) {
  const { game, publicGame, players, playerId, gamesTitle, intent } = deps;
  // Sprint 3: no host skip here. The server ends the game at its deadline
  // by itself; the waiting view shows the countdown (GameClock).
  const st = stateOf(game);
  const questions = st.questions ?? [];
  const myAnswers: Record<string, number> = st.myAnswers ?? {};
  const [lastAnswered, setLastAnswered] = useState<string | null>(null);
  // Sprint 2: the answered question is recorded at TAP time, and the grid
  // stays locked on the tapped option until the server answers. Recording
  // it only after the request + refresh resolved let the server's push
  // advance the screen to the next question first, which then flipped back
  // to the previous question's locked view (a visible flash, and a tap on
  // the vanishing question could be lost).
  const [pending, setPending] = useState<{ qid: string; choice: number } | null>(null);
  const firstUnanswered = questions.find((q) => myAnswers[q.id] === undefined);
  // Server time (offset-corrected), and the game's real window from the policy table.
  const secondsLeft = publicGame?.deadlineAt ? Math.max(0, Math.round((publicGame.deadlineAt - serverNowEstimate()) / 1000)) : 0;
  const totalSeconds = Math.round((deps.windowMs ?? 300_000) / 1000);

  // Sat out: the server records whole-game abstention; show the wait, not Q1.
  if (game.abstained) {
    return <MchezoWaiting label={satOutLabel(game)} players={players} playerId={playerId} publicGame={publicGame} showClock />;
  }
  // Just answered: locked view until the player moves on. If the poll has
  // not landed yet (answer not in myAnswers), fall through to the question
  // view — the next poll shows the locked view.
  const lockedQ = lastAnswered ? questions.find((x) => x.id === lastAnswered) : undefined;
  const lockedChoice = lockedQ ? myAnswers[lockedQ.id] : undefined;
  if (lockedQ && lockedChoice !== undefined) {
    return (
      <main className="mz-screen" aria-label="Answer locked in">
        <section className="mz-lockcard" style={{ background: `var(--mz-answer-${lockedChoice % 4})`, color: "var(--mz-on-accent)" }}>
          <span className="mz-kicker">Your answer</span>
          <span className="mz-lockcard__answer">{lockedQ.options[lockedChoice]}</span>
          <Stamp className="mz-lockcard__stamp">LOCKED IN</Stamp>
        </section>
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
  const idx = questions.indexOf(firstUnanswered);
  const pendingHere = pending && pending.qid === firstUnanswered.id ? pending.choice : null;
  const selected = myAnswers[firstUnanswered.id] ?? pendingHere;
  return (
    <QuestionScreen
      game={{ name: gamesTitle, kind: "Geography", accentIndex: 1 }}
      questionNumber={idx + 1}
      questionCount={questions.length}
      question={firstUnanswered.prompt}
      questionNode={withFlagAlt(firstUnanswered.prompt, firstUnanswered.imageAlt)}
      options={firstUnanswered.options.map((label, i) => ({ id: String(i), label }))}
      selectedId={selected === null ? null : String(selected)}
      locked={selected !== null}
      sending={myAnswers[firstUnanswered.id] === undefined && pendingHere !== null}
      onSelect={(id) => {
        if (pending) return;
        setPending({ qid: firstUnanswered.id, choice: Number(id) });
        setLastAnswered(firstUnanswered.id);
        void intent(game.id, "geography-answer", { questionId: firstUnanswered.id, chosenIndex: Number(id) }).finally(() => setPending(null));
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

/**
 * Stage 5.1 (3F, O-12): a flag emoji in a prompt, given to assistive
 * technology as a picture with a description (from the server's imageAlt,
 * which never names an option) instead of the emoji's own name, which may
 * be the answer. Sighted players see the same emoji as before.
 */
export function withFlagAlt(prompt: string, alt: string | undefined): ReactNode {
  if (!alt) return prompt;
  const parts = prompt.split(/(\p{Regional_Indicator}{2})/u);
  if (parts.length === 1) return prompt;
  return parts.map((part, i) => (i % 2 === 1
    ? <span key={i} role="img" aria-label={`Flag: ${alt}`} data-testid="geo-flag">{part}</span>
    : part));
}
