/**
 * Stage 8.2 (docs/stage8/stage82.md §3.4, §3.7): the solo player's content
 * choice, Everyday unless Christmas was chosen. Kept on this device (like
 * personal bests) when storage allows, sent with every NEW solo Start, and
 * bound to each round by the server. It is content, not a look: the look is
 * a separate device setting (ui/mchezo/look.ts).
 *
 * Repair R82-01 (review 6799134510): the choice made on this page is
 * authoritative for the page even when it can't be saved, on every screen
 * (shelf → round); other tabs' saved choices still arrive.
 */
import { createDeviceChoice } from "../ui/mchezo/deviceChoice.js";
import { DEFAULT_SESSION_SEASON, isSessionSeason, type SessionSeason } from "../../../../src/shared/season.js";

export const SOLO_SEASON_KEY = "mz_solo_season";
export const soloSeasonChoice = createDeviceChoice<SessionSeason>(SOLO_SEASON_KEY, isSessionSeason, DEFAULT_SESSION_SEASON);

export const readSoloSeason = (): SessionSeason => soloSeasonChoice.get();
export const writeSoloSeason = (s: SessionSeason): boolean => soloSeasonChoice.set(s);

/** The solo content choice: the same on every screen of this page, kept in step with other tabs. */
export function useSoloSeason(): [SessionSeason, (s: SessionSeason) => void] {
  return [soloSeasonChoice.use(), (s) => { soloSeasonChoice.set(s); }];
}
/** Whether the last solo content choice could be saved (false: it lasts until this page is reloaded). */
export const useSoloSeasonSaved = (): boolean => soloSeasonChoice.useSaved();
