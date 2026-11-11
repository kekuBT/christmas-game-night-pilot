/**
 * Stage 8.2 (repair R82-01, review 6799134510): one choice kept on this
 * device (the look, the solo content), shared by every screen of the page.
 *
 * - The value chosen on this page is held in memory and is authoritative
 *   for the page, whether or not it could be saved: a storage write that
 *   fails (private mode, a full or blocked store) never undoes the choice.
 *   Before this repair, the setter announced the change and every listener
 *   re-read storage, so a failed write snapped the choice back.
 * - Same-tab listeners are told the value itself (they read memory).
 * - Other tabs: a successful write elsewhere fires `storage` here, and that
 *   newer choice is taken, as before.
 * - Nothing is promised that wasn't kept: `saved()` says whether the last
 *   choice reached storage, so a screen can say it lasts only until reload.
 *   After a reload, an unsaved choice falls back to what storage holds.
 */
import { useSyncExternalStore } from 'react';

export interface DeviceChoice<T extends string> {
  /** The current value: this page's choice, else what storage holds, else the default. */
  get(): T;
  /** Choose `v` for this page, and try to keep it; returns whether it was saved. */
  set(v: T): boolean;
  /** Did the last choice made on this page reach storage? (true until one fails) */
  saved(): boolean;
  /** React: the current value, re-rendering on any change (this page or another tab). */
  use(): T;
  /** React: whether the last choice was saved. */
  useSaved(): boolean;
  /** Tests only: forget this page's choice. */
  resetForTests(): void;
}

export function createDeviceChoice<T extends string>(key: string, isValid: (v: unknown) => v is T, fallback: T): DeviceChoice<T> {
  let memory: T | undefined;
  let lastSaved = true;
  const listeners = new Set<() => void>();
  let watching = false;

  const readStored = (): T | undefined => {
    try {
      const v = localStorage.getItem(key);
      return isValid(v) ? v : undefined;
    } catch { return undefined; }
  };
  const notify = () => { for (const l of listeners) l(); };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return;
    // Another tab saved a newer choice (or storage was cleared): take what storage now holds.
    memory = readStored();
    lastSaved = true;
    notify();
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    if (!watching && typeof window !== 'undefined') {
      try { window.addEventListener('storage', onStorage); watching = true; } catch { /* no window */ }
    }
    return () => { listeners.delete(cb); };
  };
  const get = (): T => memory ?? readStored() ?? fallback;
  return {
    get,
    set(v: T) {
      memory = v;
      let ok = false;
      try { localStorage.setItem(key, v); ok = true; } catch { /* storage unavailable: this page still uses it */ }
      lastSaved = ok;
      notify();
      return ok;
    },
    saved: () => lastSaved,
    use: () => useSyncExternalStore(subscribe, get, () => fallback),
    useSaved: () => useSyncExternalStore(subscribe, () => lastSaved, () => true),
    resetForTests() { memory = undefined; lastSaved = true; notify(); },
  };
}
