/**
 * Server-authoritative content selection (Sprint 4).
 *
 * Deterministic: the same library, usage history and seed always give the
 * same items. Used inside RoomEngine.startGame, which runs synchronously, so
 * choosing items and recording their use is one atomic step (two requests
 * can never reserve the same item).
 *
 * Pools:
 *   official game  -> items eligible for official play that this Cup has
 *                     NOT used in an official game yet. If too few are left
 *                     the game is refused with a plain reason (no silent
 *                     repeats).
 *   practice game  -> practice-only items and items this Cup has already
 *                     used, least recently used first. Only if those run
 *                     out does practice take a fresh official item, and that
 *                     item is then RETIRED from official play in this Cup
 *                     (any use counts as used). So a practice game can never
 *                     preview a question a later official game will ask, and
 *                     practice never runs dry. Practice may repeat items.
 *
 * Balance: the difficulty mix of an official game mirrors the remaining
 * pool (proportional stratified sampling), so whichever day someone plays,
 * the expected difficulty is the same; within a game, no category takes
 * more than half the items when the pool allows.
 */
import { createHash } from "node:crypto";
import { seededRng } from "../shared/rng.js";
import { officialEligible, practiceUsable, type ContentLibrary, type LoadedItem } from "./registry.js";
import type { ContentGameId } from "./schema.js";
import { isNumericGame, withinNumericInput } from "../shared/numericInput.js";
import { officialSprintSuitable, SPRINT_SIZE_POLICY_VERSION } from "./closedSet.js";

export interface UsageRecord { gameInstanceId: string; day: number; mode: "official" | "practice"; seq: number }
/** Per Cup: item id -> every time it was used. Saved with the room. */
export type UsageHistory = Record<string, UsageRecord[]>;

export interface SelectionRequest {
  lib: ContentLibrary;
  gameId: ContentGameId;
  count: number;
  mode: "official" | "practice";
  cupId: string;
  usage: UsageHistory;
  /** Monotonic per Cup: makes successive games differ, reproducibly. */
  seq: number;
  today: string;
  /**
   * Category Sprint under E2 v3 (Cups created with categorySprint rules):
   * official categories must be closed sets that suit this many players.
   * The roster size is fixed at game start, so eligibility is decided once,
   * here, and recorded in the game. Absent = Sprint 4 behaviour.
   */
  sprint?: { players: number; sizePolicy: typeof SPRINT_SIZE_POLICY_VERSION };
}

export type SelectionResult =
  | { ok: true; items: LoadedItem[]; seed: number; reasons: string[] }
  | { ok: false; reason: "insufficient-content" | "no-suitable-category"; available: number; needed: number; message: string };

export function selectionSeed(cupId: string, gameId: string, seq: number): number {
  return createHash("sha256").update(`${cupId}|${gameId}|${seq}`).digest().readUInt32BE(0);
}

/** Used in this Cup in any game (official, or practice that retired it). */
const usedInCup = (usage: UsageHistory, id: string) => (usage[id] ?? []).length > 0;
const lastUsedSeq = (usage: UsageHistory, id: string) => Math.max(-1, ...(usage[id] ?? []).map((u) => u.seq));

/**
 * E1 (owner-approved): an item whose correct answer the game's input can't
 * accept is never selected, in any mode. Past selections and results are
 * untouched; this only filters the pool for new games.
 */
export function answerEnterable(li: LoadedItem): boolean {
  if (!isNumericGame(li.gameId)) return true;
  const it = li.item as unknown as Record<string, unknown>;
  return withinNumericInput(li.gameId, Number(li.gameId === "guess-the-year" ? it["year"] : it["answer"]));
}

function shuffled<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Pick `count` from `pool` keeping the pool's difficulty mix and spreading categories. */
function stratified(pool: LoadedItem[], count: number, rng: () => number): LoadedItem[] {
  const byDiff = new Map<number, LoadedItem[]>();
  for (const li of shuffled(pool, rng)) {
    const d = li.item.difficulty;
    byDiff.set(d, [...(byDiff.get(d) ?? []), li]);
  }
  // Largest-remainder allocation of `count` across difficulties in proportion to the pool.
  const levels = [...byDiff.keys()].sort();
  const exact = levels.map((d) => (byDiff.get(d)!.length / pool.length) * count);
  const alloc = exact.map(Math.floor);
  let left = count - alloc.reduce((a, b) => a + b, 0);
  const order = levels.map((_, i) => i).sort((a, b) => (exact[b]! - alloc[b]!) - (exact[a]! - alloc[a]!) || a - b);
  for (const i of order) { if (left <= 0) break; if (alloc[i]! < byDiff.get(levels[i]!)!.length) { alloc[i]!++; left--; } }
  const picked: LoadedItem[] = [];
  const perCategory = new Map<string, number>();
  const cap = Math.max(1, Math.ceil(count / 2));
  levels.forEach((d, i) => {
    const bucket = byDiff.get(d)!;
    const want = alloc[i]!;
    const chosen: LoadedItem[] = [];
    // First pass respects the category cap; second fills if the pool is narrow.
    for (const pass of [0, 1]) for (const li of bucket) {
      if (chosen.length >= want) break;
      if (chosen.includes(li)) continue;
      const c = perCategory.get(li.item.category) ?? 0;
      if (pass === 0 && c >= cap) continue;
      chosen.push(li);
      perCategory.set(li.item.category, c + 1);
    }
    picked.push(...chosen);
  });
  // Present in a seeded mixed order, not easy-to-hard blocks.
  return shuffled(picked, rng);
}

export function selectContent(req: SelectionRequest): SelectionResult {
  const listed = (req.lib.byGame.get(req.gameId) ?? []).slice().sort((a, b) => a.item.id.localeCompare(b.item.id));
  const all = listed.filter(answerEnterable);
  const unenterable = listed.length - all.length;
  const excludedNote = unenterable ? [`${unenterable} item(s) skipped: answer can't be entered with this game's input`] : [];
  const seed = selectionSeed(req.cupId, req.gameId, req.seq);
  const rng = seededRng(seed);
  if (req.mode === "official") {
    const sprint = req.gameId === "category-sprint" ? req.sprint : undefined;
    const eligible = all.filter((li) => officialEligible(li, req.today) && (!sprint || officialSprintSuitable(li.item as never, sprint.players).ok));
    const fresh = eligible.filter((li) => !usedInCup(req.usage, li.item.id));
    if (sprint && fresh.length < req.count) {
      // No fallback to "the largest category we have" (owner correction):
      // an unsuitable category would make the uniqueness bonus near-impossible
      // or leave players without answers. Say so and offer practice.
      return {
        ok: false, reason: "no-suitable-category", available: fresh.length, needed: req.count,
        message: `No suitable official Category Sprint categories are left for ${sprint.players} players in this Cup (${fresh.length} suitable, ${req.count} needed). Official categories must be closed lists large enough for the room. You can play Category Sprint as practice instead.`,
      };
    }
    if (fresh.length < req.count) {
      return {
        ok: false, reason: "insufficient-content", available: fresh.length, needed: req.count,
        message: `Not enough unused approved content left in this Cup for an official game (${fresh.length} left, ${req.count} needed). Play it as practice, or approve more content.`,
      };
    }
    const items = stratified(fresh, req.count, rng);
    return { ok: true, items, seed, reasons: [`official pool: ${fresh.length} unused of ${eligible.length} eligible`, ...(sprint ? [`category sprint: closed sets suitable for ${sprint.players} players (size policy v${sprint.sizePolicy})`] : []), `difficulty mix: ${[1, 2, 3].map((d) => items.filter((i) => i.item.difficulty === d).length).join("/")}`, ...excludedNote] };
  }
  // Practice: practice-only or already-used items first (least recently used),
  // then fresh official items, which this use retires from official play.
  const usable = all.filter((li) => practiceUsable(li));
  if (usable.length === 0) {
    return { ok: false, reason: "insufficient-content", available: 0, needed: req.count, message: "No practice content is available for this game yet." };
  }
  const safe = usable.filter((li) => !officialEligible(li, req.today) || usedInCup(req.usage, li.item.id));
  const freshOfficial = usable.filter((li) => officialEligible(li, req.today) && !usedInCup(req.usage, li.item.id));
  const ranked = [
    ...shuffled(safe, rng).sort((a, b) => lastUsedSeq(req.usage, a.item.id) - lastUsedSeq(req.usage, b.item.id)),
    ...shuffled(freshOfficial, rng),
  ];
  const items: LoadedItem[] = [];
  for (let i = 0; items.length < req.count; i++) items.push(ranked[i % ranked.length]!);
  const retired = items.filter((li) => freshOfficial.includes(li)).length;
  return { ok: true, items, seed, reasons: [`practice pool: ${safe.length} practice-only/already used${retired ? `, ${retired} fresh official item(s) retired from official play` : ""}${req.count > usable.length ? " (small pool: items repeat)" : ""}`, ...excludedNote] };
}

/** Record the selection in the Cup's usage history (same synchronous step as game creation). */
export function recordUsage(usage: UsageHistory, items: LoadedItem[], rec: UsageRecord): void {
  for (const li of items) (usage[li.item.id] ??= []).push(rec);
}
