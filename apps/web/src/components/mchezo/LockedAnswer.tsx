// Beta R1-R, R5 (review 6904986723): the screen right after a player locks an
// answer in the self-paced quiz games (Trivia, Geography, Math Mayhem). Each
// player goes at their own pace against one game deadline, so nobody waits
// for anybody between questions.
//   - A NONFINAL answer leads with carrying on: a compact confirmation, "keep
//     going", the enabled Next question action and the game's time left, all
//     before the room's progress, which follows as secondary information
//     (counts only, as before). The old screen put "Waiting for everyone" and
//     the tall ring first, pushing Next question below a 320×480 screen.
//   - The FINAL answer has nothing to continue to: it says all your answers
//     are in and shows the wait for the room, with no continuation control.
// Presentation only: the server's deadline, scoring, answer immutability and
// counts-only progress are unchanged; nothing auto-advances.
import type { ReactNode } from "react";
import { GameClock, Keycap, MchezoWaiting, Stamp } from "../../ui/mchezo/index.js";
import type { PublicGame, PublicPlayer } from "../../types.js";

export interface LockedAnswerProps {
  /** The locked option's text, and its index (for the answer colour). */
  answer: string;
  answerIndex: number;
  questionNumber: number;
  questionCount: number;
  /** Questions this player has not answered yet; 0 = that was the last one. */
  remaining: number;
  onNext: () => void;
  players: PublicPlayer[];
  playerId: string;
  publicGame?: PublicGame;
  onTv?: () => void;
  /** A one-player round: no room to show. */
  solo?: boolean;
  /** A game's own line under the card (Math Mayhem: how fast it was answered). */
  note?: ReactNode;
  nextTestId?: string;
}

export function LockedAnswer(p: LockedAnswerProps) {
  const final = p.remaining <= 0;
  const card = (
    <section className="mz-lockcard mz-lockcard--compact" data-testid="mz-lockcard" style={{ background: `var(--mz-answer-${p.answerIndex % 4})`, color: "var(--mz-on-accent)" }}>
      <span className="mz-kicker">Question {p.questionNumber} of {p.questionCount} · {final ? "your last answer" : "your answer"}</span>
      <span className="mz-lockcard__answer">{p.answer}</span>
      <Stamp className="mz-lockcard__stamp">LOCKED IN</Stamp>
    </section>
  );
  if (final) {
    return (
      <main className="mz-screen mz-locked" aria-label="All your answers are in" data-testid="mz-locked-final">
        {card}
        {p.note}
        {p.solo
          ? <p className="mz-locked__lead" role="status">All your answers are in.</p>
          : <div className="mz-locked__room"><MchezoWaiting label="All your answers are in" players={p.players} playerId={p.playerId} publicGame={p.publicGame} onTv={p.onTv} showClock /></div>}
      </main>
    );
  }
  const left = `${p.remaining} question${p.remaining === 1 ? "" : "s"} left`;
  return (
    <main className="mz-screen mz-locked" aria-label="Answer locked in" data-testid="mz-locked">
      {card}
      {p.note}
      <section className="mz-locked__go" aria-label="Keep going">
        <p className="mz-locked__lead" role="status" data-testid="mz-locked-lead">Keep going — you don’t need to wait for anyone. {left}.</p>
        <Keycap block data-testid={p.nextTestId ?? "mz-next-question"} onClick={p.onNext}>Next question</Keycap>
        {p.publicGame && <GameClock game={p.publicGame} />}
      </section>
      {!p.solo && (
        <div className="mz-locked__room" data-testid="mz-locked-room">
          <MchezoWaiting label="How the room is doing" players={p.players} playerId={p.playerId} publicGame={p.publicGame} onTv={p.onTv} />
        </div>
      )}
    </main>
  );
}
