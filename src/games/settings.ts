/**
 * Stage 9.1 (docs/stage9/stage91.md §6, D-S91-07): settings a game takes at
 * its start. Only Jebena Rush has any so far (its hearts). The server
 * validates them, records them with the game, Play again reuses them, and a
 * repeated start request must carry the same ones.
 */
export interface GameSettings {
  /** Jebena Rush: lives each player starts with (shown as cups since Stage 10.1; the key keeps its name, D-S101-02). */
  hearts?: number;
}

export const JEBENA_HEART_CHOICES = [3, 5, 7] as const;
export const JEBENA_DEFAULT_HEARTS = 5;

/** Games that take settings, with their defaults. */
const DEFAULTS: Readonly<Record<string, GameSettings>> = { "jebena-rush": { hearts: JEBENA_DEFAULT_HEARTS } };

export type SettingsCheck = { ok: true; settings?: GameSettings } | { ok: false; reason: string };

/**
 * Validate the settings a start asks for. A game without settings accepts
 * none (absent or {}); a game with settings fills in its defaults and refuses
 * anything it doesn't know.
 */
export function validateGameSettings(gameId: string, raw: unknown): SettingsCheck {
  const defaults = DEFAULTS[gameId];
  const given = raw === undefined || raw === null ? {} : raw;
  if (typeof given !== "object" || Array.isArray(given)) return { ok: false, reason: "Settings must be an object." };
  const keys = Object.keys(given);
  if (!defaults) return keys.length === 0 ? { ok: true } : { ok: false, reason: "This game has no settings." };
  const out: GameSettings = { ...defaults };
  for (const k of keys) {
    const v = (given as Record<string, unknown>)[k];
    if (k === "hearts" && gameId === "jebena-rush") {
      if (typeof v !== "number" || !(JEBENA_HEART_CHOICES as readonly number[]).includes(v)) return { ok: false, reason: "Cups must be 3, 5 or 7." };
      out.hearts = v;
    } else {
      return { ok: false, reason: `Unknown setting: ${k}.` };
    }
  }
  return { ok: true, settings: out };
}

/** Are two validated settings the same? (A repeated start must match its first one.) */
export function sameSettings(a: GameSettings | undefined, b: GameSettings | undefined): boolean {
  return (a?.hearts ?? null) === (b?.hearts ?? null);
}
