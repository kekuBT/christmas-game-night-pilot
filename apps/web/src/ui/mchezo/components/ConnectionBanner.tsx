// Connection feedback for THIS device, in The Circle style.
//
// Calm by design: a dropped connection on a phone is normal (screen lock,
// Wi-Fi hop), so the copy says what is happening and that progress is
// safe, never "error". "Reconnected" is shown only after the server has
// accepted the session again (the first projection on the new socket),
// never optimistically when a socket merely opens.
import { useEffect, useRef } from 'react';

export type { ConnectionState } from '../lib/connection.js';
import type { ConnectionState } from '../lib/connection.js';

export interface ConnectionBannerProps {
  state: ConnectionState;
  /** Seconds since the drop, from this device's monotonic timer (display only). */
  secondsOffline?: number;
  onRetryNow?: () => void;
  onAcknowledgeReplaced?: () => void;
}

export function ConnectionBanner({ state, secondsOffline = 0, onRetryNow, onAcknowledgeReplaced }: ConnectionBannerProps) {
  const ackRef = useRef<HTMLButtonElement>(null);
  // A replaced session needs the player's attention: move focus to its button.
  useEffect(() => { if (state === 'replaced' || state === 'signed-out') ackRef.current?.focus(); }, [state]);
  if (state === 'online') return null;
  if (state === 'replaced' || state === 'signed-out') {
    return (
      <div className="mz-conn mz-conn--replaced" role="alertdialog" aria-labelledby="mz-conn-title" aria-describedby="mz-conn-desc" data-testid="mz-conn-replaced">
        <p className="mz-conn__title" id="mz-conn-title">{state === 'replaced' ? 'This seat moved to another device' : 'Your session ended'}</p>
        <p className="mz-conn__desc" id="mz-conn-desc">
          {state === 'replaced'
            ? 'Your seat was recovered on another phone, so this device has been signed out. Your scores stay with your seat.'
            : 'This device no longer has access to the seat. Your scores stay with your seat; you can recover it with a recovery code or the host’s help.'}
        </p>
        <button ref={ackRef} type="button" className="mz-chip-btn mz-conn__btn" onClick={onAcknowledgeReplaced}>OK</button>
      </div>
    );
  }
  const reconnecting = state === 'reconnecting';
  return (
    <div className={`mz-conn ${reconnecting ? 'mz-conn--reconnecting' : 'mz-conn--restored'}`} role="status" aria-live="polite" data-testid="mz-conn">
      <span className="mz-conn__dot" aria-hidden="true" />
      <span className="mz-conn__text">
        {reconnecting
          ? <>Connection lost. Reconnecting…<span className="mz-conn__sub"> Your answers are saved.</span></>
          : 'Reconnected. Your progress is saved.'}
      </span>
      {reconnecting && secondsOffline >= 10 && onRetryNow && (
        <button type="button" className="mz-conn__retry" onClick={onRetryNow}>Try now</button>
      )}
    </div>
  );
}
