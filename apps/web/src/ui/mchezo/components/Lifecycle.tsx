/**
 * Sprint 3 lifecycle UI: a countdown to the server's deadline and a plain
 * summary of how a finished game ended. Display only — the server decides
 * when anything ends (see lib/lifecycle.ts).
 */
import { useEffect, useState } from "react";
import type { GameOutcome } from "../../../types.js";
import { activeDeadline, formatRemaining, outcomeLines, participationLine, serverNowEstimate } from "../lib/lifecycle.js";

/** Re-render once a second while a deadline is in the future. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(serverNowEstimate()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function GameClock({ game, label, tv }: {
  game: { status: string; phaseDeadlineAt?: number; deadlineAt?: number };
  /** e.g. "This question" (phase) vs "This game". Default chosen from the deadline kind. */
  label?: string;
  tv?: boolean;
}) {
  const deadline = game.status === "playing" ? activeDeadline(game) : undefined;
  const now = useNow(deadline !== undefined);
  if (deadline === undefined) return null;
  const left = deadline - now;
  const what = label ?? (game.phaseDeadlineAt !== undefined ? "Time left for this round" : "Time left in this game");
  const up = left <= 0;
  return (
    <p
      className={`mz-foot mz-game-clock${tv ? " mz-game-clock--tv" : ""}`}
      data-testid="mz-game-clock"
      data-deadline={deadline}
      // A timer: read on demand, not announced every second.
      role="timer"
      aria-live="off"
      style={{ margin: "8px 16px 0", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
    >
      {up ? "Time’s up — finishing…" : <>{what}: <span data-testid="mz-game-clock-left">{formatRemaining(left)}</span></>}
    </p>
  );
}

export function OutcomeSummary({ gameId, outcome, official, youId, youChoseSatOut, nameOf, showEveryone }: {
  gameId: string;
  outcome?: GameOutcome;
  official?: boolean;
  youId?: string;
  youChoseSatOut?: boolean;
  nameOf?: (id: string) => string;
  /** TV/results tables: list every player's participation. */
  showEveryone?: boolean;
}) {
  const lines = outcomeLines(outcome, official);
  if (!outcome || !lines) return null;
  const mine = youId ? participationLine(gameId, outcome.participation[youId], { you: true, choseSatOut: youChoseSatOut }) : null;
  const everyone = showEveryone && nameOf
    ? Object.entries(outcome.participation)
      .map(([pid, p]) => ({ pid, line: participationLine(gameId, p) }))
      .filter((x) => x.line && (x.pid !== youId))
    : [];
  return (
    <div className="mz-card mz-outcome" data-testid="mz-outcome" data-reason={outcome.reason} data-counts={String(outcome.countsOfficially)} style={{ margin: "8px 16px" }}>
      <p className="mz-foot" style={{ margin: 0 }} data-testid="mz-outcome-headline">{lines.headline}</p>
      {mine && <p className="mz-foot" style={{ margin: "4px 0 0", fontWeight: 600 }} data-testid="mz-outcome-mine">You: {mine}</p>}
      {everyone.length > 0 && (
        <ul className="mz-foot" style={{ margin: "4px 0 0", paddingLeft: 18 }} data-testid="mz-outcome-everyone">
          {everyone.map((x) => <li key={x.pid}>{nameOf!(x.pid)}: {x.line}</li>)}
        </ul>
      )}
      <p className="mz-foot" style={{ margin: "4px 0 0" }} data-testid="mz-outcome-counts">{lines.counts}</p>
      {lines.note && <p className="mz-foot" style={{ margin: "4px 0 0" }} data-testid="mz-outcome-note">{lines.note}</p>}
    </div>
  );
}
