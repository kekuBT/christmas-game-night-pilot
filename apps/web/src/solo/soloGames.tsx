/**
 * Stage 6.2: the solo shelf. One small, typed adapter per game that really
 * works alone, so the solo shell (components/mchezo/Solo.tsx) holds nothing
 * game-specific. An adapter is the game's rules (solo/soloRules.ts: rules
 * version, copy, how to read the finished round) plus its two screens: the
 * existing game screen in its solo mode, and the round shown back after it
 * ends. Engines, scoring and projections are the games' own; nothing here
 * re-implements a game.
 *
 * The server's allowlist (registry soloPlay, enforced by RoomEngine) is the
 * authority on what a solo room may start; the client lists a game only if
 * its manifest says soloPlay AND it has an adapter here.
 */
import type { ReactElement } from "react";
import { MchezoMath } from "../components/mchezo/MchezoMath.js";
import { MchezoPulse, PulseRecap } from "../components/mchezo/MchezoPulse.js";
import { ConnectionsSolution, MchezoConnections } from "../components/mchezo/MchezoConnections.js";
import { CONNECTIONS_SOLO, MATH_SOLO, PULSE_SOLO, mathReview, type SoloGameRules } from "./soloRules.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../types.js";

export interface SoloPlayProps {
  /** This player's view of the round (private). */
  game: PlayerGame;
  /** The round's public view. */
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  roomId: string;
  timeLimitMs?: number;
  /** Resolves true when the server took the action (SoloSession.intent). */
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean>;
  /** Stage 8.1: no fresh reply from the server for a while (SoloState.stale). */
  stale?: boolean;
  /** Stage 8.1: read the room again now (SoloSession.refresh). */
  onCheckAgain?: () => void;
}

export interface SoloGameAdapter extends SoloGameRules {
  Play: (p: SoloPlayProps) => ReactElement;
  /** The round shown back after it ends (answers, recap, solution). */
  Review: (p: { game: PlayerGame | undefined; publicGame: PublicGame | undefined; me: string }) => ReactElement | null;
}

const MATH: SoloGameAdapter = {
  ...MATH_SOLO,
  Play: (p) => (
    <MchezoMath solo game={p.game} publicGame={p.publicGame} players={p.players} playerId={p.playerId} gamesTitle={p.title}
      intent={p.intent} post={async <T,>() => ({}) as T} roomId={p.roomId} windowMs={p.timeLimitMs} />
  ),
  Review: ({ game, publicGame }) => {
    const review = mathReview(game, publicGame);
    if (review.length === 0) return null;
    return (
      <details className="mz-solo-review" data-testid="solo-review">
        <summary>Your answers</summary>
        <ol>
          {review.map((q, i) => (
            <li key={i} className={q.ok ? "is-ok" : "is-miss"}>
              <span className="mz-solo-review__q">{q.prompt}</span>
              <span className="mz-solo-review__a">{q.ok ? `✓ ${q.answer}` : `✗ ${q.mine} · answer ${q.answer}`}</span>
            </li>
          ))}
        </ol>
      </details>
    );
  },
};

const PULSE: SoloGameAdapter = {
  ...PULSE_SOLO,
  Play: (p) => <MchezoPulse solo game={p.game} publicGame={p.publicGame} players={p.players} playerId={p.playerId} title={p.title} intent={p.intent} stale={p.stale} onCheckAgain={p.onCheckAgain} />,
  Review: ({ game }) => (game ? <PulseRecap game={game} /> : null),
};

const CONNECTIONS: SoloGameAdapter = {
  ...CONNECTIONS_SOLO,
  Play: (p) => <MchezoConnections solo game={p.game} publicGame={p.publicGame} players={p.players} playerId={p.playerId} title={p.title} intent={p.intent} />,
  Review: ({ game }) => (game ? <ConnectionsSolution game={game} /> : null),
};

/** The solo shelf, in the order it is shown. */
export const SOLO_GAMES: readonly SoloGameAdapter[] = [MATH, PULSE, CONNECTIONS];

export function soloAdapter(gameId: string): SoloGameAdapter | undefined {
  return SOLO_GAMES.find((a) => a.gameId === gameId);
}
