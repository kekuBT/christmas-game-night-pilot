/**
 * Numeric answer input (E1, Content Quality 2.0). Shared by the server and
 * the web bundle (no Node imports here).
 *
 * One fixed, game-wide range per game. It is never derived from a
 * question's answer, so the input itself can't hint at the answer.
 *
 * The server only selects items whose answer a supported client can enter
 * (content/select.ts), and validates every guess against the same bounds.
 */
export interface NumericInputSpec {
  min: number;
  max: number;
  /** Digits allowed after the decimal point (0 = whole numbers only). */
  decimals: number;
}

export const NUMERIC_INPUT = {
  /**
   * Today's client clamps Guess the Year to 1896–2025 (MchezoYear.tsx) and
   * Closest Wins to 0–1000, whole numbers (MchezoClosest.tsx and
   * NumericGuess). Temporary: until the input fix ships, items outside these
   * bounds are not selected.
   */
  "guess-the-year": { min: 1896, max: 2025, decimals: 0 },
  "closest-wins": { min: 0, max: 1000, decimals: 0 },
} as const satisfies Record<string, NumericInputSpec>;

export type NumericGameId = keyof typeof NUMERIC_INPUT;

export function isNumericGame(gameId: string): gameId is NumericGameId {
  return Object.prototype.hasOwnProperty.call(NUMERIC_INPUT, gameId);
}

/** Can a player enter exactly this value with the game's input? */
export function withinNumericInput(gameId: NumericGameId, value: number): boolean {
  const s: NumericInputSpec = NUMERIC_INPUT[gameId];
  if (!Number.isFinite(value) || value < s.min || value > s.max) return false;
  const scaled = value * 10 ** s.decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}
