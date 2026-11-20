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
// counts-only progress are unchanged.
//
// Auto-advance (handoff 7037561069, D-AA-01), for Trivia and Math Mayhem only:
// a NONFINAL locked view moves on by itself after a reading time, instead of
// waiting for the routine Next question tap. The view is shown only once the
// server's projection carries the answer, so the countdown starts on a lock the
// server has confirmed. Each player still goes at their own pace: moving on
// opens this player's next question only (Math's speed clock still starts on
// that open, and never on a hidden page), and the room reaches its results when
// the server decides, as before. The countdown pauses while the page is hidden.
// Next question still works at once; "Stay on this screen" turns auto-advance
// off for the rest of the game (WCAG 2.2.1). Screen readers hear one static
// sentence, not every tick. Geography passes no autoAdvanceMs and stays manual.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameClock, Keycap, MchezoWaiting, Stamp } from "../../ui/mchezo/index.js";
import { usePageVisible } from "../../ui/mchezo/lib/visibility.js";
import type { PublicGame, PublicPlayer } from "../../types.js";

/** D-AA-01: how long a locked answer stays up before the next question opens by itself (a provisional default). */
export const QUIZ_AUTO_ADVANCE_MS = 4000;

/**
 * D-AA-01: right after moving on (Next question, or the countdown), the next question's answers ignore taps for this
 * long. Without it a second tap on Next question, or a tap as the countdown ran out, lands on an answer of the next
 * question and locks it (check-quiz-advance R4 reproduced it in Trivia). A deliberate answer takes longer than this.
 */
export const QUIZ_ARM_MS = 450;

/** The carry-over guard: call `advanced()` when moving on; `arming` is true for QUIZ_ARM_MS after. */
export function useAdvanceGuard(): { arming: boolean; advanced: () => void } {
  const [until, setUntil] = useState(0);
  const [, rerender] = useState(0);
  useEffect(() => {
    const wait = until - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => rerender((n) => n + 1), wait + 10);
    return () => clearTimeout(t);
  }, [until]);
  return { arming: until > Date.now(), advanced: () => setUntil(Date.now() + QUIZ_ARM_MS) };
}

/** The whole seconds the countdown shows for the time left (never below 0). */
export function advanceSecondsLeft(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

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
  /** D-AA-01: move on by itself after this long (Trivia and Math Mayhem); undefined = manual only. */
  autoAdvanceMs?: number;
  /** The player chose to stay: no auto-advance for the rest of this game. */
  stayed?: boolean;
  /** "Stay on this screen": turn auto-advance off for the rest of this game. */
  onStay?: () => void;
}

/** The countdown under Next question; it calls onNext once, after `ms` of visible time. */
function AutoAdvance({ ms, onNext, onStay }: { ms: number; onNext: () => void; onStay?: () => void }) {
  const visible = usePageVisible();
  const [left, setLeft] = useState(ms);
  const fired = useRef(false);
  useEffect(() => {
    if (!visible || fired.current) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const step = now - last;
      last = now;
      setLeft((l) => l - step);
    }, 200);
    return () => clearInterval(t);
  }, [visible]);
  useEffect(() => {
    if (left > 0 || fired.current) return;
    fired.current = true;
    onNext();
  }, [left]);
  return (
    <div className="mz-locked__advance" data-testid="mz-advance">
      {/* The ticking number is for sighted players; the status line above says it once, in words. */}
      <p className="mz-foot" aria-hidden="true" data-testid="mz-advance-count">Next question in {advanceSecondsLeft(left)} s</p>
      {onStay && <button type="button" className="mz-chip-btn" data-testid="mz-advance-stay" onClick={onStay}>Stay on this screen</button>}
    </div>
  );
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
  const auto = p.autoAdvanceMs !== undefined && p.autoAdvanceMs > 0 && !p.stayed;
  const autoLine = auto ? ` The next question opens by itself in ${advanceSecondsLeft(p.autoAdvanceMs!)} seconds.` : "";
  return (
    <main className="mz-screen mz-locked" aria-label="Answer locked in" data-testid="mz-locked">
      {card}
      {p.note}
      <section className="mz-locked__go" aria-label="Keep going">
        <p className="mz-locked__lead" role="status" data-testid="mz-locked-lead">Keep going — you don’t need to wait for anyone. {left}.{autoLine}</p>
        {/* The neutral keycap this screen always used: carrying on is now first, not a new colour (W8). */}
        <Keycap block variant="neutral" data-testid={p.nextTestId ?? "mz-next-question"} onClick={p.onNext}>Next question</Keycap>
        {auto && <AutoAdvance ms={p.autoAdvanceMs!} onNext={p.onNext} onStay={p.onStay} />}
        {p.stayed && <p className="mz-foot" role="status" data-testid="mz-advance-paused">Staying on this screen: questions won’t move on by themselves for the rest of this game. Tap Next question when you’re ready.</p>}
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
