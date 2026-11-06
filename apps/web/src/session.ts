/**
 * Guest sessions on this device (Sprint 2, Workstream C).
 *
 * Privacy default: a seat's credential lives in sessionStorage, so it dies
 * with the tab. "Remember this device" is an explicit, reversible opt-in
 * that MOVES the credential to localStorage (never a second copy) so it
 * survives closed tabs and browser restarts on this device.
 *
 * Storage layout:
 * - sessionStorage (this tab): cgn_roomId, cgn_playerId (which seat this
 *   tab is using) and, only when NOT remembered, cgn_token. These are the
 *   keys the app has always used, so ordinary guest play is unchanged.
 * - localStorage (only after consent): mz_remembered_seats, a list of up
 *   to 5 remembered seats {roomId, playerId, token, displayName, ...}.
 *
 * Nothing here ever proves identity by display name: a remembered seat is
 * only offered after the server confirms its credential still works.
 * If storage is unavailable or throws (private browsing, blocked site
 * data), everything falls back to memory for the life of the page.
 */
export interface SeatSession {
  roomId: string;
  playerId: string;
  token: string;
  displayName: string;
  roomName?: string;
  joinCode?: string;
  remembered: boolean;
  savedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const K = { roomId: "cgn_roomId", playerId: "cgn_playerId", token: "cgn_token", name: "cgn_name", remembered: "mz_remembered_seats" } as const;
export const MAX_REMEMBERED = 5;

/** Wrap a storage so every failure becomes "unavailable" instead of an exception. */
function safe(storage: StorageLike | null): { s: StorageLike; ok: boolean } {
  const memory = new Map<string, string>();
  const mem: StorageLike = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) };
  if (!storage) return { s: mem, ok: false };
  try {
    const probe = "__mz_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
  } catch {
    return { s: mem, ok: false };
  }
  return {
    ok: true,
    s: {
      getItem: (k) => { try { return storage.getItem(k); } catch { return mem.getItem(k); } },
      setItem: (k, v) => { try { storage.setItem(k, v); } catch { mem.setItem(k, v); } },
      removeItem: (k) => { try { storage.removeItem(k); } catch { /* nothing to remove */ } mem.removeItem(k); },
    },
  };
}

export function createSessionStore(opts: { session: StorageLike | null; local: StorageLike | null; now?: () => number }) {
  const tab = safe(opts.session);
  const device = safe(opts.local);
  const now = opts.now ?? Date.now;

  const readRemembered = (): SeatSession[] => {
    try {
      const raw = device.s.getItem(K.remembered);
      const list = raw ? (JSON.parse(raw) as SeatSession[]) : [];
      return Array.isArray(list) ? list.filter((x) => x && typeof x.roomId === "string" && typeof x.token === "string" && typeof x.playerId === "string") : [];
    } catch {
      return [];
    }
  };
  const writeRemembered = (list: SeatSession[]) => {
    if (list.length === 0) device.s.removeItem(K.remembered);
    else device.s.setItem(K.remembered, JSON.stringify(list.slice(0, MAX_REMEMBERED)));
  };

  const store = {
    /** Can this browser keep a seat across closed tabs? (false: private mode, blocked storage) */
    canRemember: (): boolean => device.ok,
    /** Is per-tab storage working? (false: the seat lives in memory until the page closes) */
    tabStorageOk: (): boolean => tab.ok,

    /** The seat this tab is using, or null. */
    current(): SeatSession | null {
      const roomId = tab.s.getItem(K.roomId);
      const playerId = tab.s.getItem(K.playerId);
      if (!roomId || !playerId) return null;
      const tabToken = tab.s.getItem(K.token);
      if (tabToken) return { roomId, playerId, token: tabToken, displayName: tab.s.getItem(K.name) ?? "", remembered: false, savedAt: 0 };
      const r = readRemembered().find((x) => x.roomId === roomId && x.playerId === playerId);
      return r ? { ...r, remembered: true } : null;
    },

    token(): string | null {
      return store.current()?.token ?? null;
    },

    /** Start using a seat in this tab (after join, resume, or recovery). */
    begin(seat: Omit<SeatSession, "remembered" | "savedAt">, opts: { remember: boolean }): void {
      tab.s.setItem(K.roomId, seat.roomId);
      tab.s.setItem(K.playerId, seat.playerId);
      tab.s.setItem(K.name, seat.displayName);
      // Drop any older remembered credential for this room (a recovered seat replaces it).
      const others = readRemembered().filter((x) => x.roomId !== seat.roomId);
      if (opts.remember && device.ok) {
        tab.s.removeItem(K.token);
        writeRemembered([{ ...seat, remembered: true, savedAt: now() }, ...others]);
      } else {
        tab.s.setItem(K.token, seat.token);
        writeRemembered(others);
      }
    },

    /** Turn "Remember this device" on or off for the current seat. Returns the new state. */
    setRemember(on: boolean): boolean {
      const cur = store.current();
      if (!cur) return false;
      if (on && !device.ok) return false;
      store.begin({ roomId: cur.roomId, playerId: cur.playerId, token: cur.token, displayName: cur.displayName, roomName: cur.roomName, joinCode: cur.joinCode }, { remember: on });
      return on;
    },

    /** Seats remembered on this device (most recent first). Not yet verified with the server. */
    remembered(): SeatSession[] {
      return readRemembered().map((x) => ({ ...x, remembered: true }));
    },

    /** Forget one remembered seat (e.g. the server no longer accepts it). */
    forgetRemembered(roomId: string, playerId: string): void {
      writeRemembered(readRemembered().filter((x) => !(x.roomId === roomId && x.playerId === playerId)));
    },

    /** Sign this device out of the current seat: removes its credential everywhere on this device. The seat itself stays in the game. */
    signOut(): void {
      const cur = store.current();
      if (cur) store.forgetRemembered(cur.roomId, cur.playerId);
      for (const k of [K.roomId, K.playerId, K.token, K.name]) tab.s.removeItem(k);
    },
  };
  return store;
}

function browserStorage(kind: "sessionStorage" | "localStorage"): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window[kind] : null;
  } catch {
    return null; // accessing the property itself can throw when site data is blocked
  }
}

/** The app's session store (browser storages). */
export const seats = createSessionStore({ session: browserStorage("sessionStorage"), local: browserStorage("localStorage") });
