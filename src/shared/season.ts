/**
 * Stage 8.2 (docs/stage8/stage82.md §3): seasonal content.
 *
 * Two different things, kept apart:
 * - an ITEM's season tag (content metadata, `season: "christmas"` in a pack;
 *   no tag = year-round). Selection reads only this tag, never an item's words.
 * - a SESSION's content choice (a solo or casual room's `contentSeason`):
 *   "everyday" (the default) or "christmas". It decides which items a game in
 *   that room may deal, and is bound to each game when it starts.
 *
 * A device's look (colours and decoration) is a third thing, kept on the
 * device only (apps/web/src/ui/mchezo/look.ts). It never reaches the server
 * and never changes content.
 *
 * Shared by the server and the web app: no answers or content live here.
 */

/** Values an item's `season` tag may take (absent = year-round). */
export const ITEM_SEASONS = ["christmas"] as const;
export type ItemSeason = (typeof ITEM_SEASONS)[number];

/** What a solo or casual session deals. */
export const SESSION_SEASONS = ["everyday", "christmas"] as const;
export type SessionSeason = (typeof SESSION_SEASONS)[number];
export const DEFAULT_SESSION_SEASON: SessionSeason = "everyday";

export function isSessionSeason(v: unknown): v is SessionSeason {
  return v === "everyday" || v === "christmas";
}

/**
 * May an item with this tag be dealt in a session with this content?
 * Everyday: year-round items only. Christmas: Christmas items and year-round
 * items alike (the seasonal pool plus general content).
 */
export function seasonAllows(session: SessionSeason, itemSeason: ItemSeason | undefined): boolean {
  return session === "christmas" || itemSeason === undefined;
}

/** Short names shown to players. */
export const SEASON_LABEL: Record<SessionSeason, string> = { everyday: "Everyday", christmas: "Christmas" };
