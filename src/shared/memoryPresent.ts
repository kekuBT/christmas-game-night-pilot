/**
 * Stage 11.2 (docs/stage11/stage112.md §3; D-S112-01..03): how a Memory Book entry is presented, in one rule shared
 * by the screen, the PDF (both on the web) and the Markdown export (on the server).
 *
 * - A Cup entry shows its source game's day ("Day 2"); a casual entry never shows a day and is identified by its
 *   game's title. The mode is the entry's recorded source mode, or, for an entry from before this stage, the room's
 *   kind (a room's kind never changes). Never the look, the content or a later setting.
 * - An entry from before this stage gets its day and title from the same room's citation at read/export time (its
 *   cited finish, that finish's game, the game's recorded day and title); a day that can't be verified is left out.
 *   The stored entry is never changed (no migration).
 * - Competitive facts read "Name: N points": the name the server recorded when the entry was made, else the same
 *   room's player by id (players are never removed and names never change), else "A player". Never an internal id.
 *
 * Types and pure functions only: the web imports this file.
 */

/** A room's kind as the book sees it ("solo" counts as casual: it has no Cup days). */
export type BookMode = "cup" | "casual";
export const bookModeOf = (roomKind: string | undefined): BookMode => (roomKind === "casual" || roomKind === "solo" ? "casual" : "cup");

/** One competitive fact's player and points, recorded by the server with the entry (name null: not a player then). */
export interface MemoryScore { playerId: string; name: string | null; points: number }

/** What the server recorded about an entry's source when it was made (absent on entries from before Stage 11.2). */
export interface MemorySource {
  mode: BookMode;
  /** Cup only: the cited games' own days, sorted and unique. */
  days?: number[];
  /** The cited games' titles, in citation order. */
  titles: string[];
  /** Competitive entries: one per derived fact, in the same order. */
  scores?: MemoryScore[];
}

/** The parts of an entry this rule reads (the server's and the web's entries both have them). */
export interface PresentableEntry {
  day: number;
  sourceEventIds: string[];
  derivedFacts: string[];
  team?: unknown;
  source?: MemorySource;
}

/** The room around an entry: its kind, its players by id, and its cited games' titles and days (for older entries). */
export interface BookContext {
  roomKind: string | undefined;
  nameOf: (playerId: string) => string | undefined;
  /**
   * The cited games, in citation order, when the room still has them (older entries without a recorded source).
   * Stage 12.1: `mode` is a game's own era: a game played while the room was casual stays casual after it becomes a Cup.
   */
  sourceGames?: (e: PresentableEntry) => { title?: string; day?: number; mode?: BookMode }[];
}

export const NO_NAME = "A player";

export function entryMode(e: PresentableEntry, ctx: Pick<BookContext, "roomKind" | "sourceGames">): BookMode {
  return e.source?.mode ?? ctx.sourceGames?.(e)?.[0]?.mode ?? bookModeOf(ctx.roomKind);
}

const uniqSorted = (xs: number[]) => [...new Set(xs.filter((n) => Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b);

/**
 * The cited games' own days, from the same room's citation (each cited finish -> its game -> that game's recorded
 * day), or null when any of them can't be verified there. Never the entry's stored day (D-S112-05).
 */
function citedDays(e: PresentableEntry, ctx: Pick<BookContext, "sourceGames">): number[] | null {
  const games = ctx.sourceGames?.(e) ?? [];
  if (e.sourceEventIds.length === 0 || games.length !== e.sourceEventIds.length) return null;
  if (games.some((g) => !Number.isSafeInteger(g.day) || g.day! < 1)) return null;
  return games.map((g) => g.day!);
}

/**
 * "Day 2" or "Days 1, 2" for a Cup entry; null for a casual one (it has no day), and null when a Cup entry's day
 * can't be verified.
 * - A new entry: the days the server recorded from its cited games when it was made.
 * - An older entry (no recorded days): the same room's citation, at read/export time (D-S112-05). Its stored `day`
 *   is not used: it can be the day the note was added rather than its game's (a Day 2 note about a Day 1 game).
 */
export function entryDayLabel(e: PresentableEntry, ctx: Pick<BookContext, "roomKind" | "sourceGames">): string | null {
  if (entryMode(e, ctx) !== "cup") return null;
  const days = uniqSorted(e.source?.days?.length ? e.source.days : citedDays(e, ctx) ?? []);
  if (days.length === 0) return null;
  return days.length === 1 ? `Day ${days[0]}` : `Days ${days.join(", ")}`;
}

/** The source game's title (the first cited game's), when known. */
export function entryTitle(e: PresentableEntry, ctx: Partial<BookContext>): string | null {
  const t = e.source?.titles?.[0] ?? ctx.sourceGames?.(e)?.[0]?.title;
  return t && t.trim() ? t : null;
}

/**
 * How an entry is identified: "Day 2" for a Cup entry, its game's title for a casual one ("Trivia Showdown"), or
 * "A game" if a casual entry's game can't be named. Used for the badge, the PDF's parenthesis and the Markdown heading.
 */
export function entryLabel(e: PresentableEntry, ctx: BookContext): string {
  return entryDayLabel(e, ctx) ?? entryTitle(e, ctx) ?? "A game";
}

/** A fact the server wrote from a score event: exactly "<id>: <points> points" (the only form it ever wrote). */
const SCORE_FACT = /^(\S+): (-?\d+) points$/;

/**
 * An entry's facts as people read them. A team entry's line is kept as it is (it names no one). A competitive fact
 * reads "Name: N points" with exactly the stored points; an unknown player is "A player". Two different players with
 * the same name in one entry (only possible in a corrupted or hand-edited file) become "Ada" and "Ada (2)", in id order.
 */
export function entryFactLines(e: PresentableEntry, ctx: Pick<BookContext, "nameOf">, opts: { printable?: (s: string) => string } = {}): string[] {
  if (e.team !== undefined) return [...e.derivedFacts];
  const rows = e.derivedFacts.map((fact, i) => {
    const rec = e.source?.scores?.[i];
    const m = SCORE_FACT.exec(fact);
    if (!m) return { id: null as string | null, name: null as string | null, rest: fact };
    const id = m[1]!;
    // The recorded score is the readable twin of this fact; it's used only when it agrees with it.
    const recorded = rec && rec.playerId === id && rec.points === Number(m[2]) ? rec.name : undefined;
    const full = (recorded ?? (id === "unknown" ? undefined : ctx.nameOf(id))) || null;
    // A medium that can't print every character (the PDF) maps the name first, so two names that print alike
    // ("李雷" and "王芳" both print "??") are still told apart below.
    const name = full && opts.printable ? opts.printable(full) : full;
    return { id, name, rest: `${m[2]} points` };
  });
  // Disambiguate one name shared by different ids (deterministic: by id order).
  const idsByName = new Map<string, string[]>();
  for (const r of rows) if (r.id && r.name) { const list = idsByName.get(r.name) ?? []; if (!list.includes(r.id)) list.push(r.id); idsByName.set(r.name, list); }
  for (const list of idsByName.values()) list.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return rows.map((r) => {
    if (r.id === null) return r.rest;
    if (!r.name) return `${NO_NAME}: ${r.rest}`;
    const list = idsByName.get(r.name)!;
    const k = list.indexOf(r.id);
    return `${k > 0 ? `${r.name} (${k + 1})` : r.name}: ${r.rest}`;
  });
}

/**
 * The PDF's built-in font prints Windows-1252 (WinAnsi) only. jsPDF writes a line holding any other character as
 * two-byte text that font can't read, so the WHOLE line comes out garbled, its label and points included
 * (D-S112-04). Every PDF line goes through pdfText: it's NFC-normalised, every character the font has is kept, and
 * each other character (an emoji counts once) becomes "?". The Markdown export keeps every character.
 */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export const PDF_MISSING = "?";
export function pdfText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    out += c <= 0x7f || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch) ? ch : PDF_MISSING;
  }
  return out;
}
/** Whether pdfText had to replace anything in `s`. */
export const pdfLoses = (s: string): boolean => pdfText(s) !== s.normalize("NFC");

/**
 * Text for a Markdown export: one line, and nothing typed can make a heading, list, link, image, code or HTML.
 * Exactly the characters in docs/stage11/stage112.md \u00a73.3 get a backslash. "(", ")" and "!" don't: with "[" and "]"
 * escaped they can't start a link or an image, and escaping them would put backslashes into readable text such as a
 * Spectrum team line's "(fewer than two players were left)".
 */
export function mdEscape(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/[\\`*_[\]<>#|~&]/g, "\\$&");
}
