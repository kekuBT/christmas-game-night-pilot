/**
 * One catalog for every games surface (Home, Library, the host's picker,
 * game details). Pure: no React.
 *
 * Sources, never duplicated:
 *  - Titles, descriptions, categories, player counts, play style and the
 *    *estimated* session length come from the game manifests
 *    (src/games/manifest.ts), which are validated against the registry.
 *  - The *real* time limit and whether a game can count officially come from
 *    the server's lifecycle policy (GET /games), exactly as the server enforces.
 *  - Cover art comes from lib/covers.ts.
 */
import type { GameManifest } from "../../../../../../src/games/manifest.js";

export interface PolicyFacts {
  id: string;
  lifecycle?: { gameWindowMs: number; officialEligible: boolean; practiceOnlyReason?: string };
}

export interface CatalogGame {
  id: string;
  title: string;
  description: string;
  categories: readonly string[];
  /** Hard minimum: the game can't start with fewer. */
  minPlayers: number;
  maxPlayers: number;
  /** Stage 6.1: better with this many (a recommendation, not a requirement). */
  recommendedPlayers?: number;
  /** Stage 6.1: offered under Play solo. */
  soloPlay: boolean;
  team: boolean;
  /** Design estimate of a session, in minutes (not measured, not a deadline). */
  estimateMinutes: number;
  /** The server's game window (deadline), when known. */
  timeLimitMs?: number;
  /** False when the server would refuse an official start. Unknown until the policy loads: true. */
  officialEligible: boolean;
  practiceOnlyReason?: string;
}

export function buildCatalog(manifests: readonly GameManifest[], policies: readonly PolicyFacts[] = []): CatalogGame[] {
  return manifests.map((m) => {
    const p = policies.find((x) => x.id === m.id)?.lifecycle;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      categories: m.categories,
      minPlayers: m.minPlayers,
      maxPlayers: m.maxPlayers,
      ...(m.recommendedPlayers && m.recommendedPlayers > m.minPlayers ? { recommendedPlayers: m.recommendedPlayers } : {}),
      soloPlay: m.soloPlay === true,
      team: m.playStyle === "team",
      estimateMinutes: m.duration.minutes,
      ...(p ? { timeLimitMs: p.gameWindowMs } : {}),
      officialEligible: p ? p.officialEligible : m.features.official,
      ...(p?.practiceOnlyReason ? { practiceOnlyReason: p.practiceOnlyReason } : {}),
    };
  });
}

/** "2–10 players", or "1 player" style for a fixed count. */
export function playersLabel(g: Pick<CatalogGame, "minPlayers" | "maxPlayers"> & { recommendedPlayers?: number }): string {
  const range = g.minPlayers === g.maxPlayers ? `${g.minPlayers} player${g.minPlayers === 1 ? "" : "s"}` : `${g.minPlayers}–${g.maxPlayers} players`;
  // Stage 6.1: a hard minimum and a recommendation are told apart.
  return g.recommendedPlayers && g.recommendedPlayers > g.minPlayers ? `${range} · best with ${g.recommendedPlayers}+` : range;
}

/** Does the game fit this many connected players? */
export function fits(g: Pick<CatalogGame, "minPlayers" | "maxPlayers">, players: number): boolean {
  return players >= g.minPlayers && players <= g.maxPlayers;
}

/** "Needs 2 more players" when it doesn't fit yet; null when it does. */
export function fitNote(g: Pick<CatalogGame, "minPlayers" | "maxPlayers">, players: number): string | null {
  if (players < g.minPlayers) {
    const n = g.minPlayers - players;
    return `Needs ${n} more player${n === 1 ? "" : "s"}`;
  }
  if (players > g.maxPlayers) return `Up to ${g.maxPlayers} players`;
  return null;
}

/**
 * Stage 12.5: games Home never features. Family Questions can't be played until the family has written questions in a
 * room, so it's a poor first thing to show a newcomer (and leaving it out keeps the rotation the other games had).
 */
// Stage 12.8: Team Huddle stays out too, so the daily rotation (keyed to the pool's size) doesn't reshuffle every
// day's pick; it's in the shelf and the library like every game.
export const NOT_FEATURED: ReadonlySet<string> = new Set(["family-questions", "team-huddle"]);

/**
 * The game featured on Home today: a plain rotation through the catalog by
 * calendar day, so it changes daily and is the same for everyone. It is not a
 * recommendation and says nothing about anyone's history.
 */
export function featuredOfTheDay(catalog: readonly CatalogGame[], day: Date): CatalogGame | undefined {
  const pool = catalog.filter((g) => !NOT_FEATURED.has(g.id));
  if (pool.length === 0) return undefined;
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const dayNumber = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000);
  return sorted[dayNumber % sorted.length];
}
