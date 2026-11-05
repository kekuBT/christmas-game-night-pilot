// Shared waiting view (moved from MchezoTrivia.tsx in Milestone J.3 so
// other games can reuse it — it was already game-agnostic: label-driven,
// counts-only ring, host skip when stalled). The footNote defaults to
// the Trivia reveal line so Trivia is byte-identical in behavior;
// other games pass their own (Closest Wins uses the shared waiting
// sentence from the old ShowWaiting banner).
//
// Waiting view: honest counts only. Centre = players who have played so
// far (server submittedCount) out of the room; tokens carry offline badges
// only, never check marks for answers we cannot see.
import { Keycap, PlayerToken } from "./primitives.js";
import { toMzPlayers } from "../../../components/mchezo/adapters.js";
import type { PublicGame, PublicPlayer } from "../../../types.js";

export function MchezoWaiting({ label, players, playerId, publicGame, stalled, isHostOrCohost, onSkip, onTv, footNote }: {
  label: string;
  players: PublicPlayer[];
  playerId: string;
  publicGame?: PublicGame;
  stalled?: boolean;
  isHostOrCohost?: boolean;
  onSkip?: () => void;
  onTv?: () => void;
  footNote?: string;
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
              <span className="mz-seat__name">{p.id === playerId ? "You" : p.connection === "disconnected" ? "Away" : p.name}</span>
            </span>
          );
        })}
        <div className="mz-wait__center" role="status" aria-live="polite">
          <span className="mz-wait__count">{done}<small>/{total}</small></span>
          <span className="mz-wait__label">{done < total ? "have played so far" : "everyone’s in"}</span>
        </div>
      </div>
      <p className="mz-foot">{footNote ?? "The reveal plays right here when the game finishes."}</p>
      {onTv && <div style={{ padding: "0 16px 16px" }}><button type="button" className="mz-chip-btn" data-testid="mz-tv-stage" onClick={onTv}>TV stage</button></div>}
      {stalled && isHostOrCohost && onSkip && <><p className="mz-foot">This game has passed its deadline and may be stalled.</p><div style={{ padding: "0 16px 16px" }}><Keycap block variant="neutral" onClick={onSkip}>Skip timed-out game (no scores invented)</Keycap></div></>}
      {stalled && !isHostOrCohost && <p className="mz-foot">The host can skip this game if it stays stalled.</p>}
    </div>
  );
}
