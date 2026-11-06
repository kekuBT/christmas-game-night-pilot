import { useEffect } from "react";
import type { PlayerGame, PublicGame, RegistryGame } from "../types.js";
import { outcomeLines, participationLine } from "../ui/mchezo/lib/lifecycle.js";

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

export function ShowWaiting(props: { game: PublicGame; title: string }) {
  const submitted = props.game.submittedCount ?? 0;
  const total = props.game.totalPlayers ?? props.game.players.length;
  return <div className="card waiting" data-testid="show-waiting">
    <p className="show-kicker">⏳ Waiting for others</p>
    <h2>{props.title}</h2>
    <p>You are done — nice work. <b>{submitted} of {total} players</b> have played so far in this game.</p>
    <p className="muted">Counts only — nobody can see who submitted or what they answered. When everyone is done, results appear automatically.</p>
    {/* Sprint 3: no host skip; the server ends the game at its time limit. */}
    <p className="muted">If someone doesn’t finish, the game ends by itself when time runs out.</p>
  </div>;
}

export function ShowResults(props: { game: PlayerGame; title: string; nameOf: (id: string) => string; onBack: () => void; games: RegistryGame[]; official?: boolean; youId?: string }) {
  const outcome = outcomeLines(props.game.outcome, props.official);
  const scores = Object.entries(props.game.rawScores ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number));
  const top = scores.length > 0 ? scores[0]![1] : null;
  const winners = scores.filter(([, v]) => v === top).map(([pid]) => props.nameOf(pid));
  return <div className="card show-results" data-testid="show-results">
    <p className="show-kicker">🏆 Results</p>
    <h2>{props.title}</h2>
    {winners.length > 0 && <p className="reveal-winner">{winners.length > 1 ? `It's a tie! ${winners.join(" & ")}` : `${winners[0]} wins this game!`}</p>}
    <ol className="reveal-list">
      {scores.map(([pid, v], i) => {
        const part = participationLine(props.game.gameId, props.game.outcome?.participation[pid], { you: pid === props.youId, choseSatOut: pid === props.youId && props.game.abstained === true });
        return <li key={pid} className="reveal-row" style={{ animationDelay: `${i * 120}ms` }}>{props.nameOf(pid)}: <b>{v}</b> points{part ? <span className="muted"> — {part}</span> : null}</li>;
      })}
    </ol>
    {outcome ? <div data-testid="mz-outcome" data-reason={props.game.outcome!.reason} data-counts={String(props.game.outcome!.countsOfficially)}>
      <p className="muted" data-testid="mz-outcome-headline">{outcome.headline}</p>
      <p className="muted" data-testid="mz-outcome-counts">{outcome.counts}</p>
      {outcome.note && <p className="muted" data-testid="mz-outcome-note">{outcome.note}</p>}
    </div> : <p className="muted">{props.official ? "Official game — these points count toward the Family Cup." : "Practice game — no championship points."}</p>}
    <button data-testid="show-back-to-lobby" onClick={props.onBack}>Back to lobby</button>
  </div>;
}
