/**
 * Stage 8.2 (docs/stage8/stage82.md §3.4, §3.7): the solo player's content
 * choice, Everyday unless Christmas was chosen. Remembered on this device
 * (like personal bests), sent with every solo Start, and bound to each round
 * by the server; the solo room keeps the last one too. It is content, not a
 * look: the look is a separate device setting (ui/mchezo/look.ts).
 */
import { useEffect, useState } from "react";
import { DEFAULT_SESSION_SEASON, isSessionSeason, type SessionSeason } from "../../../../src/shared/season.js";

export const SOLO_SEASON_KEY = "mz_solo_season";
const EVENT = "mz-solo-season-change";

export function readSoloSeason(): SessionSeason {
  try {
    const v = localStorage.getItem(SOLO_SEASON_KEY);
    return isSessionSeason(v) ? v : DEFAULT_SESSION_SEASON;
  } catch { return DEFAULT_SESSION_SEASON; }
}

export function writeSoloSeason(s: SessionSeason): void {
  try { localStorage.setItem(SOLO_SEASON_KEY, s); } catch { /* storage unavailable: this visit still uses it */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window */ }
}

/** The solo content choice, kept in step across this tab's screens and other tabs. */
export function useSoloSeason(): [SessionSeason, (s: SessionSeason) => void] {
  const [season, setSeason] = useState<SessionSeason>(readSoloSeason);
  useEffect(() => {
    const sync = () => setSeason(readSoloSeason());
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === SOLO_SEASON_KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", onStorage); };
  }, []);
  return [season, (s) => { setSeason(s); writeSoloSeason(s); }];
}
