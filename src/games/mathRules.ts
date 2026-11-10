/**
 * Stage 6.1: Math Mayhem's rules version, with no dependencies, so the web
 * app can import it (src/games/math.ts uses node:crypto via the protocol).
 *
 * A personal best is compared only with rounds played under the same
 * version, so bump MATH_RULES_VERSION whenever the questions (count, kinds,
 * ranges), the time window, or the scoring (100 per correct answer, speed
 * bonus) change.
 */
export const MATH_RULES_VERSION = 1;
/** Questions per round under MATH_RULES_VERSION 1. */
export const MATH_QUESTION_COUNT = 10;
