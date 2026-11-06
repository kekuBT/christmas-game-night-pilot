// Host readiness (Sprint 2): who is here, who is missing, are we ready,
// and exactly what Start would do. Ordinary case = one calm line;
// exceptions are spelled out. Everything shown comes from the server's
// readiness projection; the server enforces the same rules on Start.
import type { PublicPlayer, Readiness } from "../../types.js";

export interface StartDecision {
  gameTitle: string;
  reconnecting: string[]; // player ids still inside the reconnect window
}

export function ReadinessCard({ readiness, players, gameTitle, minPlayers, maxPlayers, decision, onWait, onStartWithout }: {
  readiness?: Readiness;
  players: PublicPlayer[];
  gameTitle: string;
  minPlayers: number;
  maxPlayers: number;
  decision: StartDecision | null;
  onWait: () => void;
  onStartWithout: () => void;
}) {
  if (!readiness) return null;
  const name = (id: string) => players.find((p) => p.id === id)?.displayName ?? "A player";
  const willPlay = readiness.wouldPlay.length;
  const missing = readiness.wouldMiss;
  const tooFew = willPlay < minPlayers;
  const tooMany = willPlay > maxPlayers;
  const allHere = missing.length === 0;
  const list = (ids: string[]) => ids.map(name).join(", ");
  return (
    <section className="mz-card mz-ready" aria-labelledby="mz-ready-title" data-testid="mz-readiness" style={{ marginTop: 12 }}>
      <span className="mz-kicker" id="mz-ready-title">Who’s playing</span>
      <p className="mz-ready__summary" role="status" aria-live="polite" data-testid="mz-readiness-summary">
        {allHere
          ? `Everyone’s here · ${willPlay} will play ${gameTitle}`
          : `${willPlay} will play ${gameTitle}${readiness.reconnecting ? ` · ${readiness.reconnecting} reconnecting` : ""}${readiness.away ? ` · ${readiness.away} away` : ""}`}
      </p>
      {!allHere && (
        <ul className="mz-ready__list" aria-label="Players who would miss this game">
          {missing.map((m) => (
            <li key={m.id} className={`mz-ready__item mz-ready__item--${m.presence}`}>
              <span className="mz-ready__name">{name(m.id)}</span>
              <span className="mz-ready__status">{m.presence === "reconnecting" ? "Reconnecting… not in this game unless they’re back" : "Away · won’t be in this game"}</span>
            </li>
          ))}
        </ul>
      )}
      {tooFew && <p className="mz-foot mz-ready__warn">{gameTitle} needs at least {minPlayers} players with a connection.</p>}
      {tooMany && <p className="mz-foot mz-ready__warn">{gameTitle} fits at most {maxPlayers} players.</p>}
      {decision && (
        <div className="mz-ready__decision" role="alertdialog" aria-labelledby="mz-ready-q" data-testid="mz-start-decision">
          <p className="mz-ready__q" id="mz-ready-q">
            {list(decision.reconnecting)} {decision.reconnecting.length === 1 ? "is" : "are"} reconnecting. Start {decision.gameTitle} without {decision.reconnecting.length === 1 ? "them" : "them all"}?
          </p>
          <p className="mz-foot">If you start now, they sit this official game out and keep their seat for the next one.</p>
          <div className="mz-ready__actions">
            <button type="button" className="mz-chip-btn" data-testid="mz-start-wait" onClick={onWait} autoFocus>Wait for {list(decision.reconnecting)}</button>
            <button type="button" className="mz-chip-btn mz-chip-btn--danger" data-testid="mz-start-without" onClick={onStartWithout}>Start without {decision.reconnecting.length === 1 ? list(decision.reconnecting) : "them"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
