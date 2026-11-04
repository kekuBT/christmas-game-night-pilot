import { useEffect } from "react";
import type { PlayerGame, PublicGame, RegistryGame } from "../types.js";

/**
 * Show Mode phase screens (M6.2). Intro auto-advances after a few seconds
 * for that player only — the game itself is never auto-advanced, and the
 * host still chooses when to start the next game. Results are driven by
 * the finished game's real scores; the "new leader" line compares the
 * finished game's winner against the previous session standings passed in.
 */
export function ShowIntro(props: { game: PlayerGame; title: string; tutorial: string; onStart: () => void }) {
  useEffect(() => {
    const t = setTimeout(props.onStart, 8000);
    return () => clearTimeout(t);
  }, [props.game.id]);
  return <div className="card show-intro" data-testid="show-intro">
    <p className="show-kicker">🎬 Coming up</p>
    <h2>{props.title}</h2>
    <p>{props.tutorial}</p>
    <p className="muted">Get ready — the game starts on your phone in a few seconds, or tap below.</p>
    <button data-testid="show-start-playing" onClick={props.onStart}>Start playing</button>
  </div>;
}

export function ShowWaiting(props: { game: PublicGame; title: string; isHostOrCohost: boolean; onSkip?: () => void }) {
  const submitted = props.game.submittedCount ?? 0;
  const total = props.game.totalPlayers ?? props.game.players.length;
  const stalled = props.game.deadlineAt !== undefined && Date.now() > props.game.deadlineAt;
  return <div className="card waiting" data-testid="show-waiting">
    <p className="show-kicker">⏳ Waiting for others</p>
    <h2>{props.title}</h2>
    <p>You are done — nice work. <b>{submitted} of {total} players</b> have played so far in this game.</p>
    <p className="muted">Counts only — nobody can see who submitted or what they answered. When everyone is done, results appear automatically.</p>
    {stalled && props.isHostOrCohost && <><p>This game has passed its deadline and may be stalled.</p><button onClick={props.onSkip}>Skip timed-out game (no scores invented)</button></>}
    {stalled && !props.isHostOrCohost && <p className="muted">The host can skip this game if it stays stalled.</p>}
  </div>;
}

export function ShowResults(props: { game: PlayerGame; title: string; nameOf: (id: string) => string; onBack: () => void; games: RegistryGame[]; official?: boolean }) {
  const scores = Object.entries(props.game.rawScores ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number));
  const top = scores.length > 0 ? scores[0]![1] : null;
  const winners = scores.filter(([, v]) => v === top).map(([pid]) => props.nameOf(pid));
  return <div className="card show-results" data-testid="show-results">
    <p className="show-kicker">🏆 Results</p>
    <h2>{props.title}</h2>
    {winners.length > 0 && <p className="reveal-winner">{winners.length > 1 ? `It's a tie! ${winners.join(" & ")}` : `${winners[0]} wins this game!`}</p>}
    <ol className="reveal-list">
      {scores.map(([pid, v], i) => <li key={pid} className="reveal-row" style={{ animationDelay: `${i * 120}ms` }}>{props.nameOf(pid)}: <b>{v}</b> points</li>)}
    </ol>
    <p className="muted">{props.official ? "Official game — these points count toward the Family Cup." : "Practice game — no championship points."}</p>
    <button data-testid="show-back-to-lobby" onClick={props.onBack}>Back to lobby</button>
  </div>;
}
