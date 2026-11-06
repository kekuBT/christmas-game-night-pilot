/**
 * This device's connection state, shared between App (which owns the
 * WebSocket) and the ConnectionOverlay (which renders the banner above
 * every screen). A tiny external store keeps the banner out of App's many
 * render branches.
 */
import { useSyncExternalStore } from "react";
import type { ConnectionState } from "./ui/mchezo/components/ConnectionBanner.js";

interface ConnSnapshot {
  state: ConnectionState;
  /** performance.now() when the drop started (monotonic, display only). */
  droppedAt: number | null;
}

let snapshot: ConnSnapshot = { state: "online", droppedAt: null };
const listeners = new Set<() => void>();
let restoredTimer: ReturnType<typeof setTimeout> | undefined;
let retryNow: (() => void) | null = null;
let acknowledge: (() => void) | null = null;

function emit(next: ConnSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

export const connection = {
  get: (): ConnSnapshot => snapshot,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** The socket dropped and a reconnect is scheduled. */
  dropped(): void {
    if (snapshot.state === "replaced" || snapshot.state === "signed-out") return;
    clearTimeout(restoredTimer);
    emit({ state: "reconnecting", droppedAt: snapshot.droppedAt ?? performance.now() });
  },
  /** The SERVER accepted the session again (first projection on the new socket). */
  confirmed(): void {
    if (snapshot.state === "reconnecting") {
      emit({ state: "restored", droppedAt: null });
      clearTimeout(restoredTimer);
      restoredTimer = setTimeout(() => emit({ state: "online", droppedAt: null }), 4000);
    } else if (snapshot.state !== "online" && snapshot.state !== "restored") {
      // replaced / signed-out are terminal until acknowledged
    }
  },
  /** The seat was recovered on another device (server close 4001). */
  replaced(): void { clearTimeout(restoredTimer); emit({ state: "replaced", droppedAt: null }); },
  /** The server no longer accepts this credential (1008 / 401). */
  signedOut(): void { clearTimeout(restoredTimer); emit({ state: "signed-out", droppedAt: null }); },
  reset(): void { clearTimeout(restoredTimer); emit({ state: "online", droppedAt: null }); },
  setHandlers(h: { retryNow?: () => void; acknowledge?: () => void }): void {
    if (h.retryNow !== undefined) retryNow = h.retryNow;
    if (h.acknowledge !== undefined) acknowledge = h.acknowledge;
  },
  retryNow: (): void => { retryNow?.(); },
  acknowledge: (): void => { acknowledge?.(); },
};

export function useConnection(): ConnSnapshot {
  return useSyncExternalStore(connection.subscribe, connection.get, connection.get);
}
