// Sprint 2: guest seats on this device. "Welcome back" offers only seats the
// server has just confirmed; "This device" is collapsed by default so the
// lobby does not grow another wall of buttons.
import { useEffect, useId, useState, type ReactNode } from "react";
import { seats, type SeatSession } from "../../session.js";
import { Keycap } from "../../ui/mchezo/index.js";

export interface VerifiedSeat {
  seat: SeatSession;
  roomName: string;
  displayName: string;
}

/** Check remembered seats with the server. Invalid ones are forgotten (never trusted). */
export function useRememberedSeats(): { verified: VerifiedSeat[]; notes: string[]; checking: boolean; forget: (s: SeatSession) => void } {
  const [verified, setVerified] = useState<VerifiedSeat[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const list = seats.remembered();
    if (list.length === 0) { setChecking(false); return; }
    void Promise.all(list.map(async (seat) => {
      try {
        const r = await fetch(`/rooms/${encodeURIComponent(seat.roomId)}/session`, { headers: { "x-session-token": seat.token } });
        if (r.ok) {
          const body = (await r.json()) as { roomName: string; displayName: string; playerId: string };
          // The server, not the stored name, says whose seat this is.
          if (body.playerId !== seat.playerId) throw new Error("seat mismatch");
          return { ok: true as const, v: { seat, roomName: body.roomName, displayName: body.displayName } };
        }
        if (r.status === 401 || r.status === 404) {
          seats.forgetRemembered(seat.roomId, seat.playerId);
          return { ok: false as const, note: `A seat saved on this device${seat.displayName ? ` for ${seat.displayName}` : ""} no longer works${r.status === 404 ? " (that game is not on this server)" : ""}. If you are still in that game, recover your seat with your recovery code or ask the host.` };
        }
        return { ok: false as const, note: "Couldn’t check your saved seat right now. Try again in a moment." };
      } catch {
        return { ok: false as const, note: "Couldn’t check your saved seat right now. Try again in a moment." };
      }
    })).then((results) => {
      if (cancelled) return;
      setVerified(results.flatMap((r) => (r.ok ? [r.v] : [])));
      setNotes(results.flatMap((r) => (r.ok ? [] : [r.note])));
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, []);
  const forget = (s: SeatSession) => {
    seats.forgetRemembered(s.roomId, s.playerId);
    setVerified((v) => v.filter((x) => !(x.seat.roomId === s.roomId && x.seat.playerId === s.playerId)));
  };
  return { verified, notes, checking, forget };
}

export function WelcomeBack({ verified, notes, onContinue, onForget }: { verified: VerifiedSeat[]; notes: string[]; onContinue: (v: VerifiedSeat) => void; onForget: (v: VerifiedSeat) => void }) {
  if (verified.length === 0 && notes.length === 0) return null;
  return (
    <section className="mz-card mz-welcome" aria-labelledby="mz-welcome-title" data-testid="mz-welcome-back">
      {verified.length > 0 && <h2 className="mz-welcome__title" id="mz-welcome-title">Welcome back</h2>}
      {verified.map((v) => (
        <div key={`${v.seat.roomId}:${v.seat.playerId}`} className="mz-welcome__seat">
          <Keycap block data-testid="mz-continue-seat" onClick={() => onContinue(v)}>Continue as {v.displayName}</Keycap>
          <p className="mz-foot mz-welcome__room">{v.roomName} · remembered on this device</p>
          <button type="button" className="mz-linkbtn" onClick={() => onForget(v)}>Not you? Forget this seat on this device</button>
        </div>
      ))}
      {notes.map((n, i) => <p key={i} className="mz-foot mz-welcome__note" role="status">{n}</p>)}
    </section>
  );
}

/** The opt-in shown next to Join / Host. Default off. */
export function RememberChoice({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  const available = seats.canRemember();
  return (
    <div className="mz-remember">
      <label className="mz-remember__label" htmlFor={id}>
        <input id={id} type="checkbox" className="mz-remember__box" checked={checked && available} disabled={!available} onChange={(e) => onChange(e.target.checked)} data-testid="mz-remember-device" />
        <span>Remember this device</span>
      </label>
      <p className="mz-foot mz-remember__help" id={`${id}-help`}>
        {available
          ? "Keeps your seat on this phone even if you close the tab. Only turn this on if this device is yours, not shared."
          : "This browser won’t let Mchezo remember you (private browsing or blocked site data). You can still play; keep this tab open."}
      </p>
    </div>
  );
}

/** Lobby: what this device knows about the seat. Collapsed by default. */
export function ThisDeviceCard({ remembered, onRemember, onForgetDevice, children }: { remembered: boolean; onRemember: (on: boolean) => void; onForgetDevice: () => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const panelId = useId();
  return (
    <section className="mz-card mz-device" style={{ marginTop: 12 }} data-testid="mz-this-device">
      <button type="button" className="mz-device__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => { setOpen((o) => !o); setConfirmForget(false); }}>
        <span className="mz-kicker">This device</span>
        <span className="mz-device__state">{remembered ? "Remembered" : "This tab only"}</span>
        <span aria-hidden="true" className="mz-device__chev">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={panelId} className="mz-device__panel">
          <RememberChoice checked={remembered} onChange={onRemember} />
          {children}
          {!confirmForget ? (
            <button type="button" className="mz-linkbtn" data-testid="mz-forget-device" onClick={() => setConfirmForget(true)}>Sign out on this device…</button>
          ) : (
            <div className="mz-device__confirm" role="group" aria-label="Confirm sign out">
              <p className="mz-foot">Sign out here? Your seat and scores stay in the game, but this device loses access. To come back you’ll need your recovery code or the host’s help.</p>
              <div className="mz-ready__actions">
                <button type="button" className="mz-chip-btn" onClick={() => setConfirmForget(false)} autoFocus>Keep me signed in</button>
                <button type="button" className="mz-chip-btn mz-chip-btn--danger" data-testid="mz-forget-device-confirm" onClick={onForgetDevice}>Sign out</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
