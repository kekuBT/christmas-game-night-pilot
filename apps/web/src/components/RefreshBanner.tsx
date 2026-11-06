// Sprint 3: "this app was updated — refresh". Shown on every screen when
// the server requires a newer protocol than this bundle speaks, or when the
// server says this tab can't time Math questions. Display only.
import { useState, useSyncExternalStore } from "react";

let needed = false;
const listeners = new Set<() => void>();
export function setRefreshNeeded(v: boolean): void {
  if (v === needed) return;
  needed = v;
  for (const l of listeners) l();
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function RefreshBanner() {
  const show = useSyncExternalStore(subscribe, () => needed, () => false);
  // "Later" hides it for this page: it must never block answering.
  const [later, setLater] = useState(false);
  if (!show || later) return null;
  return (
    <div role="alert" data-testid="mz-refresh-banner" style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 1000, padding: "12px 16px", borderRadius: 12, background: "#fff4d6", color: "#2b1d00", boxShadow: "0 4px 16px rgba(0,0,0,.3)", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <span>This game was updated. Refresh to keep playing with the latest rules (Math speed bonuses need it).</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => location.reload()} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, fontWeight: 700 }}>Refresh</button>
        <button type="button" data-testid="mz-refresh-later" onClick={() => setLater(true)} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10 }}>Later</button>
      </span>
    </div>
  );
}
