// Shared waiting view (moved from MchezoTrivia.tsx in Milestone J.3 so
// other games can reuse it — it was already game-agnostic: label-driven,
// counts-only ring; Sprint 3: a deadline countdown replaced the host skip). The footNote defaults to
// the Trivia reveal line so Trivia is byte-identical in behavior;
// other games pass their own (Closest Wins uses the shared waiting
// sentence from the old ShowWaiting banner).
//
// Waiting view: honest counts only. Centre = players who have played so
// far (server submittedCount) out of the room; tokens carry offline badges
// only, never check marks for answers we cannot see.
import { PlayerToken } from "./primitives.js";
import { GameClock } from "./Lifecycle.js";
import { toMzPlayers } from "../../../components/mchezo/adapters.js";
import type { PublicGame, PublicPlayer } from "../../../types.js";

export function MchezoWaiting({ label, players, playerId, publicGame, onTv, footNote, showClock }: {
  label: string;
  players: PublicPlayer[];
  playerId: string;
  publicGame?: PublicGame;
  onTv?: () => void;
  footNote?: string;
  /** Show the deadline countdown here (screens that have no other clock on show). */
  showClock?: boolean;
}) {
  const done = publicGame?.submittedCount ?? 0;
  const total = publicGame?.totalPlayers ?? players.length;
  const mzPlayers = toMzPlayers(players);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div>
      <p className="mz-kicker">{label}</p>
      <div className="mz-wait">
        <svg className="mz-wait__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} className="mz-wait__track" />
          <circle cx="50" cy="50" r={r} className="mz-wait__fill" strokeDasharray={c} strokeDashoffset={c * (1 - done / Math.max(1, total))} transform="rotate(-90 50 50)" />
        </svg>
        {mzPlayers.map((p, k) => {
          const a = -Math.PI / 2 + (k * Math.PI * 2) / Math.max(1, mzPlayers.length);
          return (
            <span key={p.id} className="mz-wait__seat" style={{ left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` }}>
              <PlayerToken player={p} index={k} size={40} you={p.id === playerId} badge={p.connection === "disconnected" ? "offline" : null} />
              <span className="mz-seat__name">{p.id === playerId ? "You" : p.presence === "reconnecting" ? "Reconnecting" : p.connection === "disconnected" ? "Away" : p.name}</span>
            </span>
          );
        })}
        <div className="mz-wait__center" role="status" aria-live="polite">
          <span className="mz-wait__count">{done}<small>/{total}</small></span>
          <span className="mz-wait__label">{done < total ? "have played so far" : "everyone’s in"}</span>
        </div>
      </div>
      <p className="mz-foot">{footNote ?? "The reveal plays right here when the game finishes."}</p>
      <PresenceNote players={players} participants={publicGame?.players} youId={playerId} />
      {onTv && <div style={{ padding: "0 16px 16px" }}><button type="button" className="mz-chip-btn" data-testid="mz-tv-stage" onClick={onTv}>TV stage</button></div>}
      {/* Sprint 3: no routine host Skip. The server ends the game at its
          time limit by itself (answers given in time count); the countdown
          above the game shows how long is left. */}
      {showClock && publicGame && <GameClock game={publicGame} label="Ends automatically in" />}
      <p className="mz-foot" data-testid="mz-ends-by-itself">If someone doesn’t finish, the game ends by itself when time runs out.</p>
    </div>
  );
}

/**
 * Who the game is waiting on, in plain words. Only players IN this game
 * (its fixed roster) are mentioned: a room member who never joined the
 * game is not something anyone is waiting for. Presence comes from the
 * server; nothing here decides completion.
 */
function PresenceNote({ players, participants, youId }: { players: PublicPlayer[]; participants?: string[]; youId: string }) {
  const inGame = players.filter((p) => p.id !== youId && (!participants || participants.includes(p.id)));
  const reconnecting = inGame.filter((p) => p.presence === "reconnecting");
  const away = inGame.filter((p) => p.presence === "away" || (!p.presence && !p.connected));
  if (reconnecting.length === 0 && away.length === 0) return null;
  const names = (list: PublicPlayer[]) => list.map((p) => p.displayName).join(", ");
  return (
    <p className="mz-foot mz-presence-note" role="status" aria-live="polite" data-testid="mz-presence-note">
      {reconnecting.length > 0 && <>Waiting for {reconnecting.length === 1 ? "1 player" : `${reconnecting.length} players`} to reconnect ({names(reconnecting)}). </>}
      {away.length > 0 && <>{names(away)} {away.length === 1 ? "is" : "are"} away.</>}
    </p>
  );
}
