/**
 * Stage 6.1: a solo game's personal best, kept on this device only.
 *
 * - Local only: one browser's storage. No account, no sync, no server copy,
 *   so the screens say "on this device".
 * - Compatible rounds only: a best is filed under its game AND its rules
 *   version (e.g. MATH_RULES_VERSION). A round under other rules, difficulty
 *   or scoring never compares with it.
 * - Never breaks play: storage that is missing, full, blocked (private
 *   mode, a sandboxed frame) or holds malformed data reads as "no best", and
 *   a failed save is reported to the caller, which says so on screen.
 */
export const PB_STORAGE_KEY = "mchezo.pb.v1";

export interface PersonalBest {
  score: number;
  /** When it was set (ms since epoch, this device's clock). */
  at: number;
  rulesVersion: number;
}

/** The subset of Storage used here (injectable for tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** This browser's localStorage if it can actually be used, else null. */
export function deviceStore(): KeyValueStore | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = "mchezo.probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

const slot = (gameId: string, rulesVersion: number) => `${gameId}@${rulesVersion}`;

function isBest(x: unknown): x is PersonalBest {
  if (!x || typeof x !== "object") return false;
  const b = x as Record<string, unknown>;
  return typeof b["score"] === "number" && Number.isFinite(b["score"]) && b["score"] >= 0
    && typeof b["at"] === "number" && Number.isFinite(b["at"])
    && typeof b["rulesVersion"] === "number" && Number.isInteger(b["rulesVersion"]);
}

/** Every saved best, keyed "<gameId>@<rulesVersion>"; malformed data reads as none. */
function readAll(store: KeyValueStore | null): Record<string, PersonalBest> {
  if (!store) return {};
  try {
    const raw = store.getItem(PB_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, PersonalBest> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (isBest(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** The best for this game under these rules, if any. */
export function readBest(store: KeyValueStore | null, gameId: string, rulesVersion: number): PersonalBest | undefined {
  const b = readAll(store)[slot(gameId, rulesVersion)];
  return b && b.rulesVersion === rulesVersion ? b : undefined;
}

export interface RecordOutcome {
  /** The best before this round (same game and rules), if any. */
  previous?: PersonalBest;
  /** This round beat the previous best, or there was none. */
  isNewBest: boolean;
  /** Whether the result is stored (false: storage unavailable or the write failed). */
  saved: boolean;
}

/**
 * File a finished round's score. Only a higher score replaces the best (a tie
 * keeps the earlier one). A save failure never throws.
 */
export function recordScore(store: KeyValueStore | null, gameId: string, rulesVersion: number, score: number, at: number): RecordOutcome {
  const all = readAll(store);
  const key = slot(gameId, rulesVersion);
  const previous = all[key];
  const isNewBest = !previous || score > previous.score;
  if (!isNewBest) return { previous, isNewBest, saved: store !== null };
  if (!store) return { ...(previous ? { previous } : {}), isNewBest, saved: false };
  try {
    store.setItem(PB_STORAGE_KEY, JSON.stringify({ ...all, [key]: { score, at, rulesVersion } satisfies PersonalBest }));
    return { ...(previous ? { previous } : {}), isNewBest, saved: true };
  } catch {
    return { ...(previous ? { previous } : {}), isNewBest, saved: false };
  }
}
