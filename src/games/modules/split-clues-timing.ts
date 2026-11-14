/**
 * Stage 12.10: Split Clues' clocks, shared by the module and the room's lifecycle policy (one source, no import cycle).
 */
export const SPLIT_SOLVE_MS = 75_000;
export const SPLIT_REVEAL_MS = 7_000;
/** Help steps, from the start of a round: the answer's shape, the pooling of the clues, the first letter. */
export const SPLIT_HELP_MS = [30_000, 45_000, 60_000] as const;
