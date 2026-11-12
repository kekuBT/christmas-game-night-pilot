/**
 * Spectrum's phase durations (Stage 9.2 §5, Stage 9.3 §2): the one source for
 * the module and the room's lifecycle policy. Public timing facts only, so
 * this file may be imported anywhere; the module and its pairs stay
 * server-side (tests/stage91-bank-privacy.test.ts).
 */
export const SPECTRUM_PHASE_MS = { clue: 60_000, guess: 45_000, reveal: 8_000 } as const;
