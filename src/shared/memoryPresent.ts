/**
 * Stage 11.2 (docs/stage11/stage112.md §3; D-S112-01..03): how a Memory Book entry is presented, in one rule shared
 * by the screen, the PDF (both on the web) and the Markdown export (on the server).
 *
 * - A Cup entry shows its source game's day ("Day 2"); a casual entry never shows a day and is identified by its
 *   game's title. The mode is the entry's recorded source mode, or, for an entry from before this stage, the room's
 *   kind (a room's kind never changes). Never the look, the content or a later setting.
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
  /** The cited games, in citation order, when the room still has them (older entries without a recorded source). */
  sourceGames?: (e: PresentableEntry) => { title?: string; day?: number }[];
}

export const NO_NAME = "A player";

export function entryMode(e: PresentableEntry, ctx: Pick<BookContext, "roomKind">): BookMode {
  return e.source?.mode ?? bookModeOf(ctx.roomKind);
}

const uniqSorted = (xs: number[]) => [...new Set(xs.filter((n) => Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b);

/** "Day 2" or "Days 1, 2" for a Cup entry; null for a casual one (it has no day). */
export function entryDayLabel(e: PresentableEntry, ctx: Pick<BookContext, "roomKind">): string | null {
  if (entryMode(e, ctx) !== "cup") return null;
  const days = uniqSorted(e.source?.days?.length ? e.source.days : [e.day]);
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
export function entryFactLines(e: PresentableEntry, ctx: Pick<BookContext, "nameOf">): string[] {
  if (e.team !== undefined) return [...e.derivedFacts];
  const rows = e.derivedFacts.map((fact, i) => {
    const rec = e.source?.scores?.[i];
    const m = SCORE_FACT.exec(fact);
    if (!m) return { id: null as string | null, name: null as string | null, rest: fact };
    const id = m[1]!;
    // The recorded score is the readable twin of this fact; it's used only when it agrees with it.
    const recorded = rec && rec.playerId === id && rec.points === Number(m[2]) ? rec.name : undefined;
    const name = (recorded ?? (id === "unknown" ? undefined : ctx.nameOf(id))) || null;
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

/** Text for a Markdown export: one line, and nothing typed can make a heading, list, link, image, code or HTML. */
export function mdEscape(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/[\\`*_[\]<>#|~&!()]/g, "\\$&");
}
