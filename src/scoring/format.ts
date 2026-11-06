/**
 * Family Cup competition formats (Sprint 3).
 *
 * A Cup's format is chosen when its room is created and never changes
 * afterwards: switching rules in the middle of a Cup would rewrite results
 * people have already seen. Results always follow the format of the Cup
 * they belong to.
 *
 * - "individual-only" (the TEMPORARY Individual Family Cup, every room
 *   created from Sprint 3 on): only individual games count. Team games
 *   contribute nothing (there is no fake team share), so a day's score is
 *   the mean of that day's individual placement scores. Everything else is
 *   unchanged: best three days, the attendance (participation) bonus, the
 *   0-100 midrank normalisation, the qualifying-day minimum.
 * - "combined-75-25" (the original owner-approved formula, 2026-11-04):
 *   75% individual + 25% team. Rooms created before Sprint 3 keep it, so
 *   their historical results are computed exactly as before.
 *
 * Team capability is kept: the combined format and the team channel in
 * src/scoring/championship.ts are unchanged and still tested, ready for a
 * redesigned team game.
 */
import { CHAMPIONSHIP_CONFIG, type ChampionshipConfig } from "./championship.js";

export type CompetitionFormat = "individual-only" | "combined-75-25";

export interface FormatInfo {
  format: CompetitionFormat;
  label: string;
  /** One plain sentence for players. */
  description: string;
  /** Do team games feed the Cup at all? */
  teamGamesCount: boolean;
  config: ChampionshipConfig;
}

export const COMPETITION_FORMATS: Readonly<Record<CompetitionFormat, FormatInfo>> = Object.freeze({
  "individual-only": {
    format: "individual-only",
    label: "Individual Family Cup",
    description: "Everyone plays for themselves: only individual games count toward this Cup.",
    teamGamesCount: false,
    // Solo-only days: the solo mean at 100%. Stated explicitly rather than
    // relying on the single-category fallback, so a future change to that
    // (still unapproved) fallback cannot silently change this Cup.
    config: Object.freeze({ ...CHAMPIONSHIP_CONFIG, soloWeight: 1, teamWeight: 0, singleCategoryMode: "available-only" as const }),
  },
  "combined-75-25": {
    format: "combined-75-25",
    label: "Family Cup",
    description: "Daily score: 75% individual games, 25% team games.",
    teamGamesCount: true,
    config: CHAMPIONSHIP_CONFIG,
  },
});

/** The format for rooms created now. */
export const NEW_ROOM_FORMAT: CompetitionFormat = "individual-only";
/** The format a snapshot written before formats existed was played under. */
export const LEGACY_ROOM_FORMAT: CompetitionFormat = "combined-75-25";

export function formatInfo(f: CompetitionFormat): FormatInfo {
  return COMPETITION_FORMATS[f];
}
