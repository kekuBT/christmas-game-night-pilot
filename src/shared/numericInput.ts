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
  /** The same span the content schema allows for a year (1000–2100). Whole years. */
  "guess-the-year": { min: 1000, max: 2100, decimals: 0 },
  /** Any non-negative quantity up to a trillion, to 3 decimal places (42.195 km). */
  "closest-wins": { min: 0, max: 1_000_000_000_000, decimals: 3 },
} as const satisfies Record<string, NumericInputSpec>;
/*
 * History: until E1 the client clamped Guess the Year to 1896–2025 and
 * Closest Wins to 0–1000 (whole numbers). Selection skips any item outside
 * these bounds (content/select.ts), so that can't happen again unnoticed.
 */

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

export type ParsedEntry = { ok: true; value: number } | { ok: false; message: string };

/**
 * Read what a player typed. Accepts spaces, underscores and apostrophes as
 * digit grouping ("5 570", "1'000"), and either "." or "," as the decimal
 * separator. A single comma followed by exactly three digits ("5,570") is
 * read as thousands grouping, because that is how most players type large
 * numbers; the Submit button always shows the value it will send, so a
 * misreading is visible before anything is submitted.
 * Never clamps or rounds: an out-of-range or over-precise entry is an error
 * the player can see and fix.
 */
export function parseNumericEntry(gameId: NumericGameId, raw: string): ParsedEntry {
  const s: NumericInputSpec = NUMERIC_INPUT[gameId];
  let t = raw.trim().replace(/[\s\u00a0\u202f_']/g, "");
  if (t === "") return { ok: false, message: "Type a number." };
  if (!/^[0-9.,]+$/.test(t)) return { ok: false, message: t.startsWith("-") ? "Negative numbers aren’t used in this game." : "Use digits only." };
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  if (dots && commas) {
    // Both used: the last one is the decimal separator, the other groups digits.
    const dec = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
    t = t.split(dec === "." ? "," : ".").join("");
    if (dec === ",") t = t.replace(",", ".");
  } else if (commas) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : commas === 1 ? t.replace(",", ".") : "";
  } else if (dots > 1) {
    t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : "";
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, message: "That doesn’t look like a number." };
  const value = Number(t);
  const places = t.includes(".") ? t.split(".")[1]!.length : 0;
  if (places > s.decimals) return { ok: false, message: s.decimals === 0 ? "Whole numbers only." : `Use at most ${s.decimals} decimal places.` };
  if (!withinNumericInput(gameId, value)) {
    const year = gameId === "guess-the-year";
    return { ok: false, message: `Enter ${year ? "a year" : "a number"} from ${formatNumeric(s.min, { year })} to ${formatNumeric(s.max, { year })}.` };
  }
  return { ok: true, value };
}

/** How a value is shown back to the player (and on the Submit button). */
export function formatNumeric(value: number, opts: { year?: boolean } = {}): string {
  if (opts.year) return String(value);
  return value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}
