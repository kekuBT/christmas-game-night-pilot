// Stage 7.1: the Quick Party planner. Pure (no I/O, no platform imports),
// so the web bundle and the server run the same rules: the browser builds
// and edits a preview, the server checks a lineup before saving it
// (docs/stage7/stage71.md §3.1–3.4).
//
// Hard filters (never overridden): the expected group size within each
// game's [minPlayers, maxPlayers] (shuffle.ts eligibleGames), implemented
// games only, no duplicates, at most PARTY_MAX_GAMES, and the time fit.
// Preferences (order only): not-recently-played and category variety,
// from shuffle()'s "tournament" weighting. That mode is a weighting; it is
// not the Tournament Studio's scoring or formats, which stay untouched.
//
// Time fit: a game counts as its documented design estimate
// (manifest duration.minutes, "about N min"; not measured) plus
// PARTY_TRANSITION_MINUTES for the rules, getting ready and results. A
// lineup fits when the sum is at or under the budget. No game clock is
// changed and no finish time is promised.
import { GAME_MANIFESTS, type GameManifest } from "./manifest.js";
import { GAME_REGISTRY } from "./registry.js";
import { eligibleGames, shuffle } from "./shuffle.js";

export const PARTY_BUDGETS = [15, 30, 60] as const;
export type PartyBudget = (typeof PARTY_BUDGETS)[number];
/** Minutes added per game for the rules on phones, getting ready, and results. */
export const PARTY_TRANSITION_MINUTES = 2;
export const PARTY_MAX_GAMES = 8;
export const PARTY_MIN_PLAYERS = 1;
export const PARTY_MAX_PLAYERS = 10;

export function isPartyBudget(n: unknown): n is PartyBudget {
  return typeof n === "number" && (PARTY_BUDGETS as readonly number[]).includes(n);
}
export function isPartyGroupSize(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= PARTY_MIN_PLAYERS && n <= PARTY_MAX_PLAYERS;
}

/** One game in a lineup, with what the screens show about it. */
export interface PartyItem {
  gameId: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  /** The design estimate ("about N min"), without the transition allowance. */
  minutes: number;
}

export interface PartyRequest {
  expectedPlayers: number;
  budgetMinutes: number;
  seed: number;
  /** Games removed in this preview: never offered again until the planner is reopened. */
  excludeIds?: readonly string[];
  /** The room's finished games, most recent first (a preference only). */
  recentIds?: readonly string[];
  /** Tests: a different catalogue. */
  manifests?: readonly GameManifest[];
}

/**
 * - fits: the lineup is within budget, and other eligible games remain (they
 *   just don't fit the time left).
 * - short: within budget, but every eligible game is already in it (the pool
 *   ran out before the time did).
 * - none: no single eligible game fits the budget, or no game fits the group.
 */
export type PartyStatus = "fits" | "short" | "none";

export interface PartyLineup {
  expectedPlayers: number;
  budgetMinutes: number;
  items: PartyItem[];
  /** Sum of (estimate + transition) over the items. */
  estimateMinutes: number;
  status: PartyStatus;
  /** Games that fit the group size (after exclusions): the pool the lineup came from. */
  poolSize: number;
  /** Why "none": nobody-fits (no game for this group size) or too-short (none fits the time). */
  noneReason?: "no-game-for-group" | "too-short";
}

const implemented = (id: string) => GAME_REGISTRY.find((g) => g.id === id)?.status !== "not-implemented";

function itemOf(m: GameManifest): PartyItem {
  return { gameId: m.id, title: m.title, minPlayers: m.minPlayers, maxPlayers: m.maxPlayers, minutes: m.duration.minutes };
}

/** One game's share of the lineup estimate: its design estimate plus the transition allowance. */
export function slotMinutes(item: Pick<PartyItem, "minutes">): number {
  return item.minutes + PARTY_TRANSITION_MINUTES;
}

export function lineupMinutes(items: readonly Pick<PartyItem, "minutes">[]): number {
  return items.reduce((n, i) => n + slotMinutes(i), 0);
}

/** The games a group of this size can play (hard filters only), in catalogue order. */
/**
 * Stage 9.1: games Quick Party never adds by itself (docs/stage9/stage91.md
 * §3). Jebena Rush is new and casual-only; a host starts it from the library.
 */
// Stage 12.5: Family Questions needs questions the family wrote first, so a planner never puts it in a lineup.
// Stage 12.8: Team Huddle is casual-only, like Jebena Rush and Spectrum (a lineup can also run in a Family Cup).
export const NOT_IN_QUICK_PARTY: ReadonlySet<string> = new Set(["jebena-rush", "spectrum", "family-questions", "team-huddle"]);

export function partyPool(expectedPlayers: number, opts: { excludeIds?: readonly string[]; manifests?: readonly GameManifest[] } = {}): PartyItem[] {
  if (!isPartyGroupSize(expectedPlayers)) throw new Error(`party: group size must be a whole number from ${PARTY_MIN_PLAYERS} to ${PARTY_MAX_PLAYERS}`);
  const manifests = (opts.manifests ?? GAME_MANIFESTS).filter((m) => implemented(m.id) && !NOT_IN_QUICK_PARTY.has(m.id));
  return eligibleGames(manifests, { mode: "random", playerCount: expectedPlayers, seed: 0, excludeIds: opts.excludeIds ?? [] }).map(itemOf);
}

/** A lineup for this group and budget: deterministic for a seed. */
export function planParty(req: PartyRequest): PartyLineup {
  if (!isPartyGroupSize(req.expectedPlayers)) throw new Error(`party: group size must be a whole number from ${PARTY_MIN_PLAYERS} to ${PARTY_MAX_PLAYERS}`);
  if (!isPartyBudget(req.budgetMinutes)) throw new Error(`party: budget must be one of ${PARTY_BUDGETS.join(", ")} minutes`);
  if (!Number.isInteger(req.seed)) throw new Error("party: seed must be an integer");
  // The draw itself never sees a game Quick Party doesn't add, so existing lineups are unchanged.
  const manifests = (req.manifests ?? GAME_MANIFESTS).filter((m) => implemented(m.id) && !NOT_IN_QUICK_PARTY.has(m.id));
  const pool = partyPool(req.expectedPlayers, { excludeIds: req.excludeIds, manifests });
  const base = { expectedPlayers: req.expectedPlayers, budgetMinutes: req.budgetMinutes, poolSize: pool.length };
  if (pool.length === 0) return { ...base, items: [], estimateMinutes: 0, status: "none", noneReason: "no-game-for-group" };
  // The order: shuffle's weighted draw over the whole pool (preferences only).
  const ordered = shuffle({ mode: "tournament", playerCount: req.expectedPlayers, seed: req.seed, count: pool.length, excludeIds: req.excludeIds ?? [], recentIds: req.recentIds ?? [], manifests });
  if (!ordered.ok) return { ...base, items: [], estimateMinutes: 0, status: "none", noneReason: "no-game-for-group" };
  const byId = new Map(pool.map((p) => [p.gameId, p]));
  const items: PartyItem[] = [];
  let used = 0;
  for (const pick of ordered.picks) {
    if (items.length >= PARTY_MAX_GAMES) break;
    const it = byId.get(pick.gameId);
    if (!it || used + slotMinutes(it) > req.budgetMinutes) continue; // too long for the time left: a shorter one may still fit
    items.push(it);
    used += slotMinutes(it);
  }
  if (items.length === 0) return { ...base, items, estimateMinutes: 0, status: "none", noneReason: "too-short" };
  return { ...base, items, estimateMinutes: used, status: items.length === pool.length ? "short" : "fits" };
}

/** Re-describe a lineup the host edited (same group, budget and pool rules). */
export function describeLineup(expectedPlayers: number, budgetMinutes: number, items: readonly PartyItem[], opts: { excludeIds?: readonly string[]; manifests?: readonly GameManifest[] } = {}): PartyLineup {
  const pool = partyPool(expectedPlayers, opts);
  const estimateMinutes = lineupMinutes(items);
  const inLineup = new Set(items.map((i) => i.gameId));
  const status: PartyStatus = items.length === 0 ? "none" : pool.every((p) => inLineup.has(p.gameId)) ? "short" : "fits";
  return { expectedPlayers, budgetMinutes, items: [...items], estimateMinutes, status, poolSize: pool.length, ...(items.length === 0 ? { noneReason: pool.length === 0 ? "no-game-for-group" as const : "too-short" as const } : {}) };
}

/**
 * What can replace item `index`: games that fit the group size, aren't in
 * the lineup (or excluded), and keep the lineup within budget.
 */
export function replacementOptions(lineup: Pick<PartyLineup, "expectedPlayers" | "budgetMinutes" | "items">, index: number, opts: { excludeIds?: readonly string[]; manifests?: readonly GameManifest[] } = {}): PartyItem[] {
  const current = lineup.items[index];
  if (!current) return [];
  const others = lineup.items.filter((_, i) => i !== index);
  const room = lineup.budgetMinutes - lineupMinutes(others);
  const taken = new Set(lineup.items.map((i) => i.gameId));
  return partyPool(lineup.expectedPlayers, opts).filter((p) => !taken.has(p.gameId) && slotMinutes(p) <= room);
}

export function replaceItem(items: readonly PartyItem[], index: number, next: PartyItem): PartyItem[] {
  return items.map((it, i) => (i === index ? next : it));
}
export function removeItem(items: readonly PartyItem[], index: number): PartyItem[] {
  return items.filter((_, i) => i !== index);
}
/** Move item `index` by `delta` (−1 up, +1 down); out of range is a no-op. */
export function moveItem(items: readonly PartyItem[], index: number, delta: -1 | 1): PartyItem[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  const out = [...items];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

/** The items for these game ids, from the catalogue (undefined for an unknown id). */
export function partyItemsFor(gameIds: readonly string[], manifests: readonly GameManifest[] = GAME_MANIFESTS): (PartyItem | undefined)[] {
  return gameIds.map((id) => {
    const m = manifests.find((x) => x.id === id);
    return m ? itemOf(m) : undefined;
  });
}

/**
 * The server's check before saving a lineup (and on restore). Everything
 * the planner guarantees, checked again: the host's browser is not trusted.
 */
export function validatePartyPlan(plan: { expectedPlayers: unknown; budgetMinutes: unknown; items: readonly { gameId: string }[] }, manifests: readonly GameManifest[] = GAME_MANIFESTS): { ok: true; estimateMinutes: number } | { ok: false; error: string } {
  if (!isPartyGroupSize(plan.expectedPlayers)) return { ok: false, error: `The group size must be a whole number from ${PARTY_MIN_PLAYERS} to ${PARTY_MAX_PLAYERS}.` };
  if (!isPartyBudget(plan.budgetMinutes)) return { ok: false, error: `The time must be ${PARTY_BUDGETS.join(", ")} minutes.` };
  if (plan.items.length < 1 || plan.items.length > PARTY_MAX_GAMES) return { ok: false, error: `A lineup has 1 to ${PARTY_MAX_GAMES} games.` };
  const ids = plan.items.map((i) => i.gameId);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "A lineup can't have the same game twice." };
  const items: PartyItem[] = [];
  for (const id of ids) {
    const reg = GAME_REGISTRY.find((g) => g.id === id);
    const m = manifests.find((x) => x.id === id);
    if (!reg || !m || reg.status !== "implemented") return { ok: false, error: `Unknown game: ${id}` };
    if (plan.expectedPlayers < m.minPlayers || plan.expectedPlayers > m.maxPlayers) {
      return { ok: false, error: `${m.title} is for ${m.minPlayers}–${m.maxPlayers} players, not ${plan.expectedPlayers}.` };
    }
    items.push(itemOf(m));
  }
  const estimateMinutes = lineupMinutes(items);
  if (estimateMinutes > plan.budgetMinutes) return { ok: false, error: `That lineup is about ${estimateMinutes} minutes, more than ${plan.budgetMinutes}.` };
  return { ok: true, estimateMinutes };
}
