/**
 * This device's connection state, shared between App (which owns the
 * WebSocket) and the ConnectionOverlay (which renders the banner above
 * every screen). A tiny external store keeps the banner out of App's many
 * render branches.
 */
import { useSyncExternalStore } from "react";
import type { ConnectionState } from "./ui/mchezo/lib/connection.js";

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
  /**
   * The server no longer accepts this credential (1008 / 401). A seat that
   * already moved to another device keeps that more specific explanation: the
   * old phone's next poll is always refused afterwards.
   */
  signedOut(): void {
    if (snapshot.state === "replaced") return;
    clearTimeout(restoredTimer);
    emit({ state: "signed-out", droppedAt: null });
  },
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

// ---------------------------------------------------------------- room notices
// Seat recoveries are always announced to the room (recovery contract §2.1
// step 6). App feeds the server's notices in; each new one is shown once.
export interface NoticeItem { id: string; text: string }
let noticeQueue: NoticeItem[] = [];
const seenNotices = new Set<string>();
const noticeListeners = new Set<() => void>();
const emitNotices = () => { for (const l of noticeListeners) l(); };

export const roomNotices = {
  get: (): NoticeItem[] => noticeQueue,
  subscribe(l: () => void): () => void { noticeListeners.add(l); return () => noticeListeners.delete(l); },
  offer(items: NoticeItem[]): void {
    const fresh = items.filter((i) => !seenNotices.has(i.id));
    if (!fresh.length) return;
    for (const i of fresh) seenNotices.add(i.id);
    noticeQueue = [...noticeQueue, ...fresh];
    emitNotices();
  },
  dismiss(id: string): void { noticeQueue = noticeQueue.filter((n) => n.id !== id); emitNotices(); },
};

export function useRoomNotices(): NoticeItem[] {
  return useSyncExternalStore(roomNotices.subscribe, roomNotices.get, roomNotices.get);
}
