// Game Library filtering and sorting (Milestone G) — pure, no React.
// Operates on manifests (Milestone F), never on the registry directly, so
// discovery always agrees with the single capability source.
//
// Filter semantics (documented for the UI and the driver):
// - Search: case-insensitive substring over title + description +
//   categories. Empty query matches everything.
// - Categories: a game matches when it has ANY selected category (OR).
//   No selection matches everything.
// - Player count: a game matches when minPlayers <= N <= maxPlayers.
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
  playerCount: number | null;
  maxDuration: number | null;
  playStyle: PlayStyleFilter;
  sort: LibrarySort;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  query: "",
  categories: [],
  playerCount: null,
  maxDuration: null,
  playStyle: "all",
  sort: "name",
};

/** True when any filter differs from the defaults (drives Reset). */
export function hasActiveFilters(filters: LibraryFilters): boolean {
  return (
    filters.query !== "" ||
    filters.categories.length > 0 ||
    filters.playerCount !== null ||
    filters.maxDuration !== null ||
    filters.playStyle !== "all" ||
    filters.sort !== "name"
  );
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

export function filterGames(manifests: readonly GameManifest[], filters: LibraryFilters): GameManifest[] {
  const visible = manifests.filter((m) => {
    if (!matchesQuery(m, filters.query)) return false;
    if (filters.categories.length > 0 && !filters.categories.some((c) => m.categories.includes(c))) return false;
    if (filters.playerCount !== null && (filters.playerCount < m.minPlayers || filters.playerCount > m.maxPlayers)) return false;
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
