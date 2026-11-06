// Seat recovery UI (Sprint 2, Workstream D), for ordinary family members.
// - In the lobby ("This device"): get a one-time recovery code, optional.
// - On the start screen: "Lost your place? Recover your seat", with two
//   plain options: a recovery code, or the host's help.
// - For hosts: a card when a device asks for a seat, with a match code to
//   compare and a two-step approve so nobody restores a seat by accident.
// All authority is on the server; this file only collects and shows.
import { useEffect, useId, useRef, useState } from "react";
import { Keycap, PhoneScreen, Wordmark } from "../../ui/mchezo/index.js";
import type { RecoveryRequestView } from "../../types.js";
import { RememberChoice } from "./DeviceSeat.js";

export interface RecoveredSeat {
  roomId: string;
  joinCode?: string;
  playerId: string;
  displayName: string;
  sessionToken: string;
  recoveryCode: string;
}

/** Shows a recovery code once: big, grouped, copyable, with plain warnings. */
export function CodeReveal({ code, title, onDone }: { code: string; title: string; onDone: () => void }) {
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied("yes"); } catch { setCopied("failed"); }
  };
  return (
    <div className="mz-codecard" data-testid="mz-code-reveal">
      <h2 className="mz-codecard__title" tabIndex={-1} ref={headingRef}>{title}</h2>
      {/* Groups never split across lines, so the code reads and copies as XXXXX-XXXXX-XXXXX-XXXXX. */}
      <p className="mz-codecard__code" aria-label={`Recovery code: ${code.split("").join(" ")}`} data-testid="mz-recovery-code">
        {code.split("-").map((g, i) => <span key={i} className="mz-codecard__group">{i > 0 ? "-" : ""}{g}</span>)}
      </p>
      <div className="mz-ready__actions">
        <button type="button" className="mz-chip-btn" onClick={() => void copy()}>{copied === "yes" ? "Copied" : "Copy code"}</button>
      </div>
      <p className="mz-foot" role="status" aria-live="polite">{copied === "failed" ? "Couldn’t copy automatically. Write it down or take a screenshot." : copied === "yes" ? "Copied. Paste it somewhere safe." : ""}</p>
      <ul className="mz-codecard__notes">
        <li>This code is shown only now. Write it down or take a screenshot.</li>
        <li>It gets your seat back on any phone. Keep it private: anyone with it can take your seat.</li>
        <li>Each code works once. You get a new one when you use it.</li>
      </ul>
      <Keycap block onClick={onDone} data-testid="mz-code-saved">I’ve saved it</Keycap>
    </div>
  );
}

/** Lobby section (inside "This device"): optional recovery code. */
export function RecoveryCodeSection({ hasCode, onIssue }: { hasCode: boolean; onIssue: () => Promise<string> }) {
  const [code, setCode] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const issue = async () => {
    setBusy(true); setError("");
    try { setCode(await onIssue()); setConfirmNew(false); } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t make a code. Try again."); } finally { setBusy(false); }
  };
  if (code) return <CodeReveal code={code} title="Your recovery code" onDone={() => setCode(null)} />;
  return (
    <div className="mz-device__section" data-testid="mz-recovery-section">
      <span className="mz-kicker">Recovery code</span>
      <p className="mz-foot" style={{ margin: "2px 0 6px" }}>
        {hasCode
          ? "You have a recovery code. Getting a new one cancels the old one."
          : "Optional. If you lose this phone or close the tab, a recovery code gets your seat back without the host."}
      </p>
      {hasCode && !confirmNew ? (
        <button type="button" className="mz-chip-btn" onClick={() => setConfirmNew(true)}>Get a new code…</button>
      ) : hasCode && confirmNew ? (
        <div className="mz-ready__actions">
          <button type="button" className="mz-chip-btn" onClick={() => setConfirmNew(false)}>Keep my current code</button>
          <button type="button" className="mz-chip-btn mz-chip-btn--danger" disabled={busy} onClick={() => void issue()}>Replace it</button>
        </div>
      ) : (
        <button type="button" className="mz-chip-btn" disabled={busy} onClick={() => void issue()} data-testid="mz-get-recovery-code">{busy ? "Making your code…" : "Get a recovery code"}</button>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

type Step =
  | { kind: "choose" }
  | { kind: "code" }
  | { kind: "host-code" }
  | { kind: "host-seats"; joinCode: string; roomName: string; seats: { playerId: string; displayName: string }[] }
  | { kind: "host-confirm"; joinCode: string; roomName: string; seat: { playerId: string; displayName: string } }
  | { kind: "host-wait"; requestId: string; secret: string; matchCode: string; displayName: string }
  | { kind: "done"; seat: RecoveredSeat };

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** "Lost your place? Recover your seat." */
export function RecoverScreen({ initialCode, onSecured, onRecovered, onBack }: {
  initialCode: string;
  /** Called the moment the server returns the new credential: store it NOW (the old one is already dead). */
  onSecured: (seat: RecoveredSeat, remember: boolean) => void;
  onRecovered: (seat: RecoveredSeat, remember: boolean) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [joinCode, setJoinCode] = useState(initialCode);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const roomId = useId();
  const codeId = useId();
  const cleanRoom = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  // The recovered credential must never live only in this screen's memory:
  // the moment it arrives, the device keeps it (tab, or device if chosen).
  const securedRef = useRef<string | null>(null);
  useEffect(() => {
    if (step.kind !== "done" || securedRef.current === step.seat.sessionToken) return;
    securedRef.current = step.seat.sessionToken;
    onSecured(step.seat, remember);
  }, [step, remember, onSecured]);
  const cleanCode = recoveryCode.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Host path: poll the request until the host decides (only this device holds the secret).
  useEffect(() => {
    if (step.kind !== "host-wait") return;
    let stopped = false;
    const poll = async () => {
      try {
        const r = await postJson(`/rooms/recovery-requests/${step.requestId}/status`, {}, { "x-recovery-request-secret": step.secret });
        if (stopped) return;
        const st = r.body["status"];
        if (st === "recovered") setStep({ kind: "done", seat: r.body as unknown as RecoveredSeat });
        else if (st === "denied") { setStep({ kind: "choose" }); setError("The host declined that request. If this is your seat, talk to them and try again."); }
        else if (st === "expired" || r.status === 404) { setStep({ kind: "choose" }); setError("That request expired. Ask again when the host is ready."); }
        else if (r.status >= 500) setStatus("The server couldn’t finish restoring your seat. Still trying…");
      } catch {
        if (!stopped) setStatus("Can’t reach the game right now. Still trying…");
      }
    };
    const t = setInterval(() => void poll(), 2000);
    void poll();
    return () => { stopped = true; clearInterval(t); };
  }, [step]);

  const submitCode = async () => {
    setBusy(true); setError("");
    try {
      const r = await postJson("/rooms/recover-by-code", { joinCode: cleanRoom, recoveryCode: cleanCode });
      if (r.status === 200) setStep({ kind: "done", seat: r.body as unknown as RecoveredSeat });
      else setError(String(r.body["error"] ?? "That didn’t work. Check both codes."));
    } catch { setError("Can’t reach the game right now. Check your connection and try again."); } finally { setBusy(false); }
  };
  const findSeats = async () => {
    setBusy(true); setError("");
    try {
      const r = await postJson("/rooms/recovery-requests/seats", { joinCode: cleanRoom });
      if (r.status !== 200) { setError(String(r.body["error"] ?? "No game with that room code.")); return; }
      setStep({ kind: "host-seats", joinCode: cleanRoom, roomName: String(r.body["roomName"] ?? ""), seats: (r.body["seats"] as { playerId: string; displayName: string }[]) ?? [] });
    } catch { setError("Can’t reach the game right now."); } finally { setBusy(false); }
  };
  const askHost = async (s: Extract<Step, { kind: "host-confirm" }>) => {
    setBusy(true); setError("");
    try {
      const r = await postJson("/rooms/recovery-requests", { joinCode: s.joinCode, playerId: s.seat.playerId });
      if (r.status !== 201) { setError(String(r.body["error"] ?? "Couldn’t send the request.")); return; }
      setStatus("");
      setStep({ kind: "host-wait", requestId: String(r.body["requestId"]), secret: String(r.body["requestSecret"]), matchCode: String(r.body["matchCode"]), displayName: s.seat.displayName });
    } catch { setError("Can’t reach the game right now."); } finally { setBusy(false); }
  };

  const roomField = (
    <div className="mz-field">
      <label htmlFor={roomId} className="mz-field__label">Room code</label>
      <input id={roomId} className="mz-input mz-input--code" value={joinCode} maxLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" placeholder="6 letters on the host’s screen" onChange={(e) => setJoinCode(e.target.value)} data-testid="mz-recover-room" />
    </div>
  );

  return (
    <PhoneScreen label="Recover your seat">
      <header className="mz-topbar">
        <Wordmark size={20} />
        {step.kind !== "done" && <button type="button" className="mz-chip-btn" onClick={onBack}>Back</button>}
      </header>
      <div className="mz-recover">
        {step.kind === "choose" && (
          <>
            <h1 className="mz-h1">Recover your seat</h1>
            <p className="mz-lede">Your seat, answers and scores are still in the game. Pick how to get back in.</p>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="mz-recover__options">
              <button type="button" className="mz-option" onClick={() => { setError(""); setStep({ kind: "code" }); }} data-testid="mz-recover-with-code">
                <span className="mz-option__title">I have a recovery code</span>
                <span className="mz-option__desc">20 letters and numbers you saved earlier.</span>
              </button>
              <button type="button" className="mz-option" onClick={() => { setError(""); setStep({ kind: "host-code" }); }} data-testid="mz-recover-with-host">
                <span className="mz-option__title">Ask the host for help</span>
                <span className="mz-option__desc">The host confirms it’s you on their screen.</span>
              </button>
            </div>
            <p className="mz-foot">No code and the tab is gone? The host can still restore your seat.</p>
          </>
        )}
        {step.kind === "code" && (
          <form className="mz-form" onSubmit={(e) => { e.preventDefault(); if (cleanRoom.length === 6 && cleanCode.length === 20 && !busy) void submitCode(); }}>
            <h1 className="mz-h1">Use your recovery code</h1>
            {roomField}
            <div className="mz-field">
              <label htmlFor={codeId} className="mz-field__label">Recovery code</label>
              <input id={codeId} className="mz-input mz-input--code" value={recoveryCode} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" onChange={(e) => setRecoveryCode(e.target.value)} data-testid="mz-recover-code" aria-describedby={`${codeId}-hint`} />
              <span className="mz-foot" id={`${codeId}-hint`}>{cleanCode.length}/20 characters · dashes and spaces don’t matter</span>
            </div>
            <RememberChoice checked={remember} onChange={setRemember} />
            {error && <p className="err" role="alert" data-testid="mz-recover-error">{error}</p>}
            <Keycap type="submit" block disabled={cleanRoom.length !== 6 || cleanCode.length !== 20 || busy} data-testid="mz-recover-submit">{busy ? "Checking…" : "Recover my seat"}</Keycap>
            <button type="button" className="mz-linkbtn" onClick={() => setStep({ kind: "choose" })}>Other ways to get back in</button>
          </form>
        )}
        {step.kind === "host-code" && (
          <form className="mz-form" onSubmit={(e) => { e.preventDefault(); if (cleanRoom.length === 6 && !busy) void findSeats(); }}>
            <h1 className="mz-h1">Ask the host for help</h1>
            <p className="mz-lede">First, which game are you in?</p>
            {roomField}
            {error && <p className="err" role="alert">{error}</p>}
            <Keycap type="submit" block disabled={cleanRoom.length !== 6 || busy}>Find my seat</Keycap>
            <button type="button" className="mz-linkbtn" onClick={() => setStep({ kind: "choose" })}>Other ways to get back in</button>
          </form>
        )}
        {step.kind === "host-seats" && (
          <>
            <h1 className="mz-h1">Which seat is yours?</h1>
            <p className="mz-lede">{step.roomName}. The host will check it’s really you.</p>
            <div className="mz-recover__seats" role="list">
              {step.seats.map((seat) => (
                <button key={seat.playerId} type="button" role="listitem" className="mz-option mz-option--seat" onClick={() => setStep({ kind: "host-confirm", joinCode: step.joinCode, roomName: step.roomName, seat })}>
                  <span className="mz-option__title">{seat.displayName}</span>
                </button>
              ))}
            </div>
            <button type="button" className="mz-linkbtn" onClick={() => setStep({ kind: "choose" })}>Back</button>
          </>
        )}
        {step.kind === "host-confirm" && (
          <>
            <h1 className="mz-h1">Restore {step.seat.displayName}’s seat?</h1>
            <p className="mz-lede">We’ll ask the host. They’ll see a number to match with your screen.</p>
            <RememberChoice checked={remember} onChange={setRemember} />
            {error && <p className="err" role="alert">{error}</p>}
            <Keycap block disabled={busy} onClick={() => void askHost(step)} data-testid="mz-ask-host">{busy ? "Asking…" : `Yes, ask the host`}</Keycap>
            <button type="button" className="mz-linkbtn" onClick={() => setStep({ kind: "choose" })}>That’s not me</button>
          </>
        )}
        {step.kind === "host-wait" && (
          <>
            <h1 className="mz-h1">Show this to the host</h1>
            <p className="mz-matchcode" aria-label={`Match code ${step.matchCode.split("").join(" ")}`} data-testid="mz-match-code">{step.matchCode}</p>
            <p className="mz-lede" role="status" aria-live="polite">Waiting for the host to restore {step.displayName}’s seat… They should see the same number.</p>
            {status && <p className="mz-foot" role="status">{status}</p>}
            <button type="button" className="mz-linkbtn" onClick={() => setStep({ kind: "choose" })}>Cancel</button>
          </>
        )}
        {step.kind === "done" && (
          <CodeReveal
            code={step.seat.recoveryCode}
            title={`You’re back, ${step.seat.displayName}. Here’s your new recovery code`}
            onDone={() => onRecovered(step.seat, remember)}
          />
        )}
      </div>
    </PhoneScreen>
  );
}

/** Host/cohost: a device is asking for a seat. Compare the number, then a deliberate two-step approve. */
export function RecoveryRequestsCard({ requests, onDecide }: { requests: RecoveryRequestView[]; onDecide: (r: RecoveryRequestView, approve: boolean) => Promise<void> }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (requests.length === 0) return null;
  const act = async (r: RecoveryRequestView, approve: boolean) => {
    setBusy(true);
    try { await onDecide(r, approve); setConfirming(null); } finally { setBusy(false); }
  };
  return (
    <section className="mz-card mz-recreq" role="region" aria-label="Seat recovery requests" data-testid="mz-recovery-requests" style={{ marginTop: 12 }}>
      <span className="mz-kicker">Seat recovery</span>
      {requests.map((r) => (
        <div key={r.requestId} className="mz-recreq__item">
          <p className="mz-recreq__q">Someone is asking to get <b>{r.displayName}</b>’s seat back on a new device.</p>
          <p className="mz-foot">Only approve if it’s really them. Their screen should show:</p>
          <p className="mz-matchcode mz-matchcode--small" aria-label={`Match code ${r.matchCode.split("").join(" ")}`}>{r.matchCode}</p>
          {confirming !== r.requestId ? (
            <div className="mz-ready__actions">
              <button type="button" className="mz-chip-btn" disabled={busy} onClick={() => setConfirming(r.requestId)} data-testid="mz-recreq-restore">Restore {r.displayName}’s seat…</button>
              <button type="button" className="mz-chip-btn" disabled={busy} onClick={() => void act(r, false)} data-testid="mz-recreq-decline">Decline</button>
            </div>
          ) : (
            <div className="mz-ready__decision" role="group" aria-label="Confirm seat recovery">
              <p className="mz-ready__q">Their screen shows {r.matchCode}, and it’s {r.displayName}?</p>
              <p className="mz-foot">Their old device will be signed out, and everyone in the room will see that you restored this seat.</p>
              <div className="mz-ready__actions">
                <button type="button" className="mz-chip-btn" onClick={() => setConfirming(null)} autoFocus>Cancel</button>
                <button type="button" className="mz-chip-btn mz-chip-btn--danger" disabled={busy} onClick={() => void act(r, true)} data-testid="mz-recreq-confirm">Yes, restore it</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
