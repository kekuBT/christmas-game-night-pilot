/**
 * Stage 8.1 (S2): Pattern Pulse's game clock, as shown between patterns.
 * Pure: no React, no fetch, no clock of its own.
 *
 * The server owns the game's deadline (`deadlineAt`) and ends the game when
 * it passes. This only works out what to SHOW: the time left in the whole
 * game, measured on the server's clock (deadline − server-time estimate),
 * whether it is low, whether it is up, and which announcement, if any, is due.
 *
 * Announcements are for assistive technology and are made only when the
 * clock crosses into a more urgent band: under a minute, under 20 seconds,
 * time up. Each band is announced at most once per game, so nothing is
 * announced every second, and a clock that jumps back (a corrected
 * server-time estimate) never repeats one.
 */
import { formatRemaining } from "../../ui/mchezo/lib/lifecycle.js";

/** At or under this much game time left, the clock shows its warning tone. */
export const PULSE_CLOCK_LOW_MS = 60_000;
/** The second, more urgent announcement. */
export const PULSE_CLOCK_URGENT_MS = 20_000;

export type ClockBand = "none" | "low" | "urgent" | "up";
const SEVERITY: Record<ClockBand, number> = { none: 0, low: 1, urgent: 2, up: 3 };

export interface GameClockView {
  /** Milliseconds left, never negative. */
  leftMs: number;
  /** "3:42"; "0:00" once the deadline is here. */
  label: string;
  band: ClockBand;
  /** One minute or less left (and not yet up). */
  low: boolean;
  up: boolean;
}

/** The band for this much time left. */
export function clockBand(leftMs: number): ClockBand {
  if (leftMs <= 0) return "up";
  if (leftMs <= PULSE_CLOCK_URGENT_MS) return "urgent";
  if (leftMs <= PULSE_CLOCK_LOW_MS) return "low";
  return "none";
}

/** What the game clock shows at server time `serverNow`; null when the game has no deadline. */
export function gameClockView(deadlineAt: number | undefined, serverNow: number): GameClockView | null {
  if (deadlineAt === undefined || !Number.isFinite(deadlineAt)) return null;
  const leftMs = Math.max(0, deadlineAt - serverNow);
  const band = clockBand(deadlineAt - serverNow);
  return { leftMs, label: formatRemaining(leftMs), band, low: band === "low" || band === "urgent", up: band === "up" };
}

/**
 * The band to announce now, or null. `announced` is the most urgent band
 * already announced this game ("none" at first). Only a move to a MORE
 * urgent band is announced; staying in a band, or going back to a less
 * urgent one, announces nothing.
 */
export function clockAnnouncement(announced: ClockBand, current: ClockBand): ClockBand | null {
  return SEVERITY[current] > SEVERITY[announced] ? current : null;
}

/**
 * What has been announced, for one game instance (spec feedback 6790913242):
 * the history belongs to the game, not to a screen, so moving between the
 * ready, memorise and tap-back screens never repeats a warning, and a new
 * game (Play again, a rematch) starts with a clean history.
 */
export interface AnnouncementHistory { gameId: string | null; band: ClockBand }
export const NO_ANNOUNCEMENTS: AnnouncementHistory = { gameId: null, band: "none" };

/**
 * The history after the clock reads `current` in game `gameId`, and the band
 * to announce now (null for none). A clock correction that skips a band
 * announces only the band it lands in (never the ones it skipped); one that
 * goes back and then forward again announces nothing it already said.
 */
export function nextAnnouncement(history: AnnouncementHistory, gameId: string, current: ClockBand): { history: AnnouncementHistory; say: ClockBand | null } {
  const base = history.gameId === gameId ? history : { gameId, band: "none" as ClockBand };
  const say = clockAnnouncement(base.band, current);
  return { history: say ? { gameId, band: say } : base, say };
}

/** The words announced for a band (polite, once). */
export function clockAnnouncementText(band: ClockBand): string {
  switch (band) {
    case "low": return "Under a minute of game time left.";
    case "urgent": return "Under 20 seconds of game time left.";
    case "up": return "The game’s time is up.";
    default: return "";
  }
}
