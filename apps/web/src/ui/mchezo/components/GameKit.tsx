/**
 * Shared game-screen pieces (Sprint 4). Small on purpose: only what
 * several games genuinely share. Each game keeps its own personality.
 */
import { useEffect, useState, type ReactNode } from "react";

/** Game title + a one-line objective, with the game's accent colour. */
export function GameHeader({ title, objective, accent = 3, right }: { title: string; objective: string; accent?: number; right?: ReactNode }) {
  return (
    <header className="mz-gh">
      <div className="mz-gh__text">
        <span className="mz-kicker" style={{ color: `var(--mz-answer-${accent})` }}>{title}</span>
        <h1 className="mz-gh__objective">{objective}</h1>
      </div>
      {right}
    </header>
  );
}

/** A polite live line for feedback ("One away…", "Saved."). */
export function FeedbackLine({ tone = "neutral", children, testId }: { tone?: "neutral" | "good" | "warn"; children: ReactNode; testId?: string }) {
  return <p className={`mz-feedback mz-feedback--${tone}`} role="status" aria-live="polite" data-testid={testId}>{children}</p>;
}

/** Intro card shown before a game: what you are trying to do, in three lines. */
export function GameIntro({ title, objective, steps, accent = 3, onStart, autoStartSeconds = 8 }: { title: string; objective: string; steps: string[]; accent?: number; onStart: () => void; autoStartSeconds?: number }) {
  // Like the Trivia intro: it starts by itself after a short, visible countdown.
  const [left, setLeft] = useState(autoStartSeconds);
  useEffect(() => {
    if (left <= 0) { onStart(); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <main className="mz-screen" aria-label={`${title}: how to play`}>
      <span className="mz-kicker" style={{ color: `var(--mz-answer-${accent})` }}>{title}</span>
      <h1 className="mz-h1">{objective}</h1>
      <ol className="mz-intro-steps">
        {steps.map((s, i) => <li key={i}><span className="mz-intro-steps__n" style={{ background: `var(--mz-answer-${(accent + i) % 4})` }}>{i + 1}</span>{s}</li>)}
      </ol>
      <div className="mz-grow" />
      <p className="mz-foot" aria-live="off">Starting in {Math.max(0, left)}…</p>
      <button type="button" className="mz-key mz-key--brand mz-key--lg mz-key--block" data-testid="show-start-playing" onClick={onStart} autoFocus>Start playing</button>
    </main>
  );
}

/** Ranked scores with each player's participation line. */
export function ScoreList({ rows }: { rows: { id: string; name: string; score: number; you?: boolean; detail?: string | null }[] }) {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev: number | null = null;
  return (
    <ol className="mz-scores" data-testid="mz-scores">
      {sorted.map((r, i) => {
        if (r.score !== prev) { rank = i + 1; prev = r.score; }
        return (
          <li key={r.id} className={`mz-scores__row${r.you ? " mz-scores__row--you" : ""}`}>
            <span className="mz-scores__rank">{rank}</span>
            <span className="mz-scores__name">{r.name}{r.you ? " (you)" : ""}{r.detail ? <small className="mz-scores__detail">{r.detail}</small> : null}</span>
            <span className="mz-scores__pts">{r.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
