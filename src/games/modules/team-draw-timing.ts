/**
 * Stage 12.11: Team Draw's clocks, shared by the module and the room's lifecycle policy (one source, no import cycle).
 */
export const TEAM_DRAW_MS = 75_000;
export const TEAM_DRAW_REVEAL_MS = 9_000;
/** A teammate may take the pen once the drawer has drawn nothing for this long (a blank page or an idle one). */
export const TEAM_DRAW_TAKEOVER_MS = 20_000;
