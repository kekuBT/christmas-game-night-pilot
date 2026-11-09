// Game Library filtering and sorting (Milestone G) — pure, no React.
// Operates on manifests (Milestone F), never on the registry directly, so
// discovery always agrees with the single capability source.
//
// Filter semantics (documented for the UI and the driver):
// - Search: case-insensitive substring over title + description +
//   categories. Empty query matches everything.
// - Categories: a game matches when it has ANY selected category (OR).
//   No selection matches everything.
// - Group size: a game matches when minPlayers <= N <= maxPlayers. "Fits your
//   room" uses the room's connected count (Stage 4).
// - Max duration: a game matches when duration.minutes <= max.
// - Play style: exact match unless "all".
// - Sort: name (title A–Z) or duration (minutes ascending, ties broken
//   by title). Sorting never drops games; filtering never reorders
//   beyond the chosen sort.
import type { GameManifest } from "../../../../../../src/games/manifest.js";

export type PlayStyleFilter = "all" | "solo" | "team";
export type LibrarySort = "name" | "duration";

export interface LibraryFilters {
  query: string;
  categories: string[];
  /** A group size to check games against ("Group size"), or null. */
  playerCount: number | null;
  /** Stage 4 (S3-LIB-03): "Fits your room": the room's connected count, kept live. */
  fitsRoom: boolean;
  maxDuration: number | null;
  playStyle: PlayStyleFilter;
  /** Ordering only: never counted as a filter (S3-LIB-04). */
  sort: LibrarySort;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  query: "",
  categories: [],
  playerCount: null,
  fitsRoom: false,
  maxDuration: null,
  playStyle: "all",
  sort: "name",
};

/** True when any filter differs from the defaults (drives Clear filters). Sorting is not a filter. */
export function hasActiveFilters(filters: LibraryFilters): boolean {
  return (
    filters.query !== "" ||
    filters.categories.length > 0 ||
    filters.playerCount !== null ||
    filters.fitsRoom ||
    filters.maxDuration !== null ||
    filters.playStyle !== "all"
  );
}

/** Every filter back to its default; the chosen sort stays. */
export function clearFilters(filters: LibraryFilters): LibraryFilters {
  return { ...DEFAULT_FILTERS, sort: filters.sort };
}

/**
 * Stage 4 (S3-NAV-01): the library's view lives in its address, so browser
 * Back/Forward, a refresh and opening a game's details all keep it. Canonical
 * order, defaults omitted, so equal views have equal addresses.
 */
export const LIBRARY_PARAM_KEYS = ["q", "cat", "players", "len", "type", "sort"] as const;

export function filtersToQuery(f: LibraryFilters): string {
  const q = new URLSearchParams();
  if (f.query.trim()) q.set("q", f.query);
  for (const c of [...f.categories].sort((a, b) => a.localeCompare(b))) q.append("cat", c);
  if (f.fitsRoom) q.set("players", "room");
  else if (f.playerCount !== null) q.set("players", String(f.playerCount));
  if (f.maxDuration !== null) q.set("len", String(f.maxDuration));
  if (f.playStyle !== "all") q.set("type", f.playStyle);
  if (f.sort !== "name") q.set("sort", f.sort);
  return q.toString();
}

export function filtersFromQuery(query: string): LibraryFilters {
  const q = new URLSearchParams(query);
  const int = (v: string | null, min: number, max: number) => {
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const players = q.get("players");
  const type = q.get("type");
  return {
    query: (q.get("q") ?? "").slice(0, 80),
    categories: [...new Set(q.getAll("cat").map((c) => c.slice(0, 40)).filter(Boolean))].slice(0, 12),
    playerCount: players === "room" ? null : int(players, 1, 20),
    fitsRoom: players === "room",
    maxDuration: int(q.get("len"), 1, 120),
    playStyle: type === "solo" || type === "team" ? type : "all",
    sort: q.get("sort") === "duration" ? "duration" : "name",
  };
}

/** How a game fits a room of `players` connected players. Size only: says nothing about content or the Cup. */
export type RoomFit = "fits" | "needs-more" | "too-many";
export function roomFit(m: Pick<GameManifest, "minPlayers" | "maxPlayers">, players: number): RoomFit {
  return players < m.minPlayers ? "needs-more" : players > m.maxPlayers ? "too-many" : "fits";
}

/** Sorted unique category list across the catalog, for filter chips. */
export function allCategories(manifests: readonly GameManifest[]): string[] {
  return [...new Set(manifests.flatMap((m) => m.categories))].sort((a, b) => a.localeCompare(b));
}

function matchesQuery(m: GameManifest, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = [m.title, m.description, ...m.categories].join(" ").toLowerCase();
  return haystack.includes(q);
}

export function filterGames(manifests: readonly GameManifest[], filters: LibraryFilters, roomPlayers?: number): GameManifest[] {
  const size = filters.fitsRoom && roomPlayers !== undefined ? roomPlayers : filters.playerCount;
  const visible = manifests.filter((m) => {
    if (!matchesQuery(m, filters.query)) return false;
    if (filters.categories.length > 0 && !filters.categories.some((c) => m.categories.includes(c))) return false;
    if (size !== null && (size < m.minPlayers || size > m.maxPlayers)) return false;
    if (filters.maxDuration !== null && m.duration.minutes > filters.maxDuration) return false;
    if (filters.playStyle !== "all" && m.playStyle !== filters.playStyle) return false;
    return true;
  });
  const sorted = [...visible];
  if (filters.sort === "duration") {
    sorted.sort((a, b) => a.duration.minutes - b.duration.minutes || a.title.localeCompare(b.title));
  } else {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
  return sorted;
}
