/**
 * Stage 7.3 (docs/stage7/stage73.md §4.4): the room menu's players and roles.
 * Every host or cohost can make another player a cohost, as before. The
 * host of a casual room can also hand the host role to a connected player,
 * between games, after a confirmation that names them and says what changes.
 * Display only: the server decides (current host, connected target, no game
 * on, the session revision); a refusal is shown here in plain words.
 */
import { useEffect, useRef, useState } from "react";

export interface RolePlayer { id: string; name: string; isCohost: boolean; connected: boolean }
export type HandoverResult = { ok: true } | { ok: false; error: string };

export function PlayersAndRoles({ others, canHandOver, handoverNote, onMakeCohost, onHandOver }: {
  others: readonly RolePlayer[];
  /** This viewer is the host of a casual room and no briefing or game is on. */
  canHandOver: boolean;
  /** Why handing over isn't offered right now (a game is on), if it would otherwise be. */
  handoverNote?: string;
  onMakeCohost: (id: string) => void;
  onHandOver: (id: string) => Promise<HandoverResult>;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = asking ? others.find((p) => p.id === asking) : undefined;
  // The chosen player left or dropped while the question was open: close it rather than ask about someone who can't take over.
  useEffect(() => { if (asking && (!target || !target.connected) && !busy) { setAsking(null); setError(""); } }, [asking, target, busy]);
  const confirm = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError("");
    const r = await onHandOver(target.id);
    setBusy(false);
    if (r.ok) setAsking(null);
    else setError(r.error);
  };
  return (
    <div className="mz-card mz-menu__card" aria-label="Players and roles" data-testid="players-roles">
      <span className="mz-kicker">Players and roles</span>
      {others.map((p) => (
        <div key={p.id} className="mz-menu__player" data-testid={`role-row-${p.name}`}>
          <span className="mz-menu__pname">
            {p.name}{p.isCohost ? " · cohost" : ""}
            {!p.connected && <small className="mz-menu__away"> · not connected</small>}
          </span>
          <span className="mz-menu__roles">
            {!p.isCohost && <button type="button" className="mz-chip-btn" onClick={() => onMakeCohost(p.id)}>Make cohost</button>}
            {canHandOver && (
              <button type="button" className="mz-chip-btn" data-testid={`make-host-${p.name}`} disabled={!p.connected || busy}
                aria-label={p.connected ? `Make ${p.name} the host` : `${p.name} isn't connected, so can't be the host`}
                onClick={() => { setError(""); setAsking(p.id); }}>Make host</button>
            )}
          </span>
        </div>
      ))}
      {!canHandOver && handoverNote && <p className="mz-foot mz-menu__note" data-testid="handover-note">{handoverNote}</p>}
      {target && <HandoverConfirm name={target.name} busy={busy} error={error} onConfirm={() => void confirm()} onCancel={() => { if (!busy) { setAsking(null); setError(""); } }} />}
    </div>
  );
}

/** "Make Bea the host?": names the player, says what changes, and waits for an explicit choice. */
function HandoverConfirm({ name, busy, error, onConfirm, onCancel }: { name: string; busy: boolean; error: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="mz-confirm mz-handover" role="alertdialog" aria-labelledby="mz-handover-title" aria-describedby="mz-handover-text" data-testid="handover-confirm"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <p className="mz-confirm__title" id="mz-handover-title" tabIndex={-1} ref={ref}>Make {name} the host?</p>
      <p className="mz-confirm__text" id="mz-handover-text">{name} will run the room: starting games, the lineup and breaks. You’ll be a regular player. Your seat and scores stay as they are.</p>
      {error && <p className="err mz-handover__error" role="alert" data-testid="handover-error">{error}</p>}
      <div className="mz-sheet__actions">
        <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="handover-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="handover-confirm-yes" disabled={busy} aria-busy={busy} onClick={onConfirm}>{busy ? "Handing over…" : `Make ${name} the host`}</button>
      </div>
    </div>
  );
}
