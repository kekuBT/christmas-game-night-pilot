// D-AA-01, review 7040842858: a player's "Stay on this screen" choice in Trivia and Math Mayhem lasts for the rest
// of THAT game instance, through component remounts (TV stage and back), reloads and seat recovery. It used to live in
// component state and silently reset on a reload, so the countdown came back although the screen had promised it
// would not.
//
// What is stored (this tab's sessionStorage, key "mz_quiz_stay"): ONE small record for the seat this tab is using,
//   { v: 1, scope: "room:<roomId>" | "solo:<roomId>", seat: "<playerId>", games: { "<gameInstanceId>": savedAtMs } }.
// No answers, names, tokens or recovery codes. Game and player ids are only unique within a room, so the room is
// part of the scope.
//   - Another seat or room never inherits a choice: a read for a different scope/seat finds nothing and removes the
//     stale record (a session change); a write for a new seat replaces it.
//   - Bounded: at most MAX_GAMES games, each kept for at most TTL_MS.
//   - A new game or Play again is a new game instance, so it counts down as normal.
//   - If sessionStorage is unavailable (private browsing, blocked site data), or a write to it fails later (a quota
//     error), the record lives in memory for the life of the page and memory is authoritative: remounts keep the
//     newest choice; a reload cannot (see createStayStorage).
import { useCallback, useMemo, useState } from "react";

export interface StayStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STAY_KEY = "mz_quiz_stay";
export const MAX_GAMES = 8;
export const TTL_MS = 12 * 60 * 60 * 1000;

interface StayRecord { v: 1; scope: string; seat: string; games: Record<string, number> }

/** The identity a choice belongs to: a room or solo session, a seat in it and one game instance. */
export interface StayIdentity { scope: string; seat: string; game: string }

/** "room:<id>" or "solo:<id>"; empty when the room is not known yet (nothing is then stored or read). */
export const stayScope = (roomId: string | null | undefined, solo: boolean | undefined): string => (roomId ? `${solo ? "solo" : "room"}:${roomId}` : "");

const usable = (id: StayIdentity) => id.scope !== "" && id.seat !== "" && id.game !== "";

function parse(raw: string | null): StayRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as StayRecord;
    if (r?.v !== 1 || typeof r.scope !== "string" || typeof r.seat !== "string" || !r.games || typeof r.games !== "object") return null;
    const games: Record<string, number> = {};
    for (const [k, t] of Object.entries(r.games)) if (typeof t === "number" && Number.isFinite(t)) games[k] = t;
    return { v: 1, scope: r.scope, seat: r.seat, games };
  } catch {
    return null;
  }
}

/** Whether this seat chose to stay for this game. A record for another seat or room is removed, not used. */
export function readStay(storage: StayStorage, id: StayIdentity, now: number = Date.now()): boolean {
  if (!usable(id)) return false;
  let raw: string | null;
  try { raw = storage.getItem(STAY_KEY); } catch { return false; }
  const rec = parse(raw);
  if (!rec) {
    if (raw !== null) { try { storage.removeItem(STAY_KEY); } catch { /* nothing to remove */ } }
    return false;
  }
  if (rec.scope !== id.scope || rec.seat !== id.seat) {
    try { storage.removeItem(STAY_KEY); } catch { /* nothing to remove */ }
    return false;
  }
  const t = rec.games[id.game];
  return typeof t === "number" && now - t >= 0 && now - t < TTL_MS;
}

/** Record that this seat chose to stay for this game (keeping this seat's other recent games, bounded). */
export function writeStay(storage: StayStorage, id: StayIdentity, now: number = Date.now()): void {
  if (!usable(id)) return;
  let prev: StayRecord | null;
  try { prev = parse(storage.getItem(STAY_KEY)); } catch { prev = null; }
  const kept = prev && prev.scope === id.scope && prev.seat === id.seat
    ? Object.entries(prev.games).filter(([g, t]) => g !== id.game && now - t >= 0 && now - t < TTL_MS)
    : [];
  const games = Object.fromEntries([...kept.sort((a, b) => b[1] - a[1]).slice(0, MAX_GAMES - 1), [id.game, now]]);
  const rec: StayRecord = { v: 1, scope: id.scope, seat: id.seat, games };
  try { storage.setItem(STAY_KEY, JSON.stringify(rec)); } catch { /* the caller's storage handles its own fallback */ }
}

/** Forget every stored choice (leaving a room or a solo round). */
export function clearStay(storage: StayStorage = stayStorage()): void {
  try { storage.removeItem(STAY_KEY); } catch { /* nothing to remove */ }
}

// ---- The page's storage: this tab's sessionStorage, or memory when it is unavailable or a write fails. ----
/**
 * A store over `real` (this tab's sessionStorage, or null when it is unavailable) that never lets an older persistent
 * value hide a newer choice made in this page (review 7042658020):
 *   - while every write succeeds, it reads and writes `real`;
 *   - after the FIRST failed write (a quota error, blocked site data), it latches into memory mode for the life of the
 *     page: the newest value lives in memory and every read comes from memory. The stale persistent copy is removed
 *     where removal still works, so a reload cannot bring back an older choice;
 *   - in memory mode each later write is still tried on `real` too; when storage is writable again the newest value is
 *     persisted, and when it is not, the stale copy is removed again;
 *   - removing (clear, a seat or room switch) acts on both copies, so nothing comes back.
 */
export function createStayStorage(real: StayStorage | null): StayStorage {
  const memory = new Map<string, string>();
  let memoryMode = real === null;
  const dropReal = (k: string) => { try { real?.removeItem(k); } catch { /* unavailable */ } };
  return {
    getItem(k) {
      if (memoryMode || !real) return memory.get(k) ?? null;
      try { return real.getItem(k); } catch { memoryMode = true; return memory.get(k) ?? null; }
    },
    setItem(k, v) {
      if (memoryMode || !real) {
        memory.set(k, v);
        if (real) { try { real.setItem(k, v); } catch { dropReal(k); } }
        return;
      }
      try { real.setItem(k, v); } catch { memoryMode = true; memory.set(k, v); dropReal(k); }
    },
    removeItem(k) {
      memory.delete(k);
      dropReal(k);
    },
  };
}

let page: StayStorage | null = null;

/** This page's store: sessionStorage when it can be read and written (probed once), memory otherwise. */
export function stayStorage(): StayStorage {
  if (page) return page;
  let real: StayStorage | null;
  try {
    const s = typeof window !== "undefined" ? window.sessionStorage : null;
    if (s) { s.setItem("__mz_stay_probe__", "1"); s.removeItem("__mz_stay_probe__"); }
    real = s;
  } catch {
    real = null;
  }
  page = createStayStorage(real);
  return page;
}
/** Tests only: forget this page's store. */
export function resetStayStorageForTests(): void { page = null; }

/**
 * The Stay choice for this seat and game: [stayed, stay]. Read from storage on every identity change, so a remount,
 * a reload, a new game or a different seat each see the right value.
 */
export function useStayPreference(id: StayIdentity): [boolean, () => void] {
  const [version, bump] = useState(0);
  const stayed = useMemo(() => readStay(stayStorage(), id), [id.scope, id.seat, id.game, version]);
  const stay = useCallback(() => { writeStay(stayStorage(), id); bump((n) => n + 1); }, [id.scope, id.seat, id.game]);
  return [stayed, stay];
}
