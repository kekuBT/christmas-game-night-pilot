// Smart Shuffle / Smart Director engine (Milestone H) — pure, no runtime
// AI, no I/O, no node imports, so it runs identically on the server and
// in the web bundle. It chooses games; it never starts them (the host
// keeps start control) and never changes scores, rooms, or state.
//
// Hard constraints are filters, never overridden by scores:
//   - playerCount within the manifest's [minPlayers, maxPlayers]
//   - excludeIds (host exclusions, already-played, ...)
//   - incompatibleIds (format incompatibility — populated by the
//     tournament engine in Milestone I; empty today, enforced already)
//   - playStyle, when given (solo/team capability filter)
// Soft signals only adjust weights, never eligibility:
//   - recentIds (most-recent-first): not-recently-played bonus
//   - smart: play-style variety vs the most recent game
//   - tournament: category variety vs the set picked so far
//
// Determinism: same request + same seed → same result, via the shared
// mulberry32 PRNG (src/shared/rng.ts). The UI seeds from Date.now() for
// a fresh draw per click; tests pin fixed seeds.
//
// Empty pool is a value, not an exception: { ok: false, reason:
// "no-eligible-games" }. Malformed requests (bad mode, non-integer or
// out-of-range counts) throw — those are programmer errors, and the UI
// never sends them. Validation is by hand, not Zod, so the web bundle
// stays free of extra dependencies; the rules are unit-tested.
import { GAME_MANIFESTS, type GameManifest } from "./manifest.js";
import { GAME_REGISTRY } from "./registry.js";
import { seededRng } from "../shared/rng.js";

export type ShuffleMode = "random" | "smart" | "tournament";
export type ShuffleReason =
  | "random-pick"
  | "not-recently-played"
  | "variety-play-style"
  | "category-variety"
  | "weighted-pick"
  | "only-eligible-game";

export interface ShuffleRequest {
  mode: ShuffleMode;
  playerCount: number;
  seed: number;
  count?: number;
  excludeIds?: readonly string[];
  incompatibleIds?: readonly string[];
  playStyle?: "solo" | "team";
  recentIds?: readonly string[];
  manifests?: readonly GameManifest[];
}

export interface ShufflePick {
  gameId: string;
  title: string;
  reasons: ShuffleReason[];
  explanation: string;
}

export type ShuffleResult =
  | { ok: true; picks: ShufflePick[]; requested: number; partial: boolean }
  | { ok: false; reason: "no-eligible-games"; requested: number };

const REASON_TEXT: Record<ShuffleReason, string> = {
  "random-pick": "Picked at random.",
  "not-recently-played": "Not played recently.",
  "variety-play-style": "Adds a different kind of game after the last one.",
  "category-variety": "Adds a new category to the set.",
  "weighted-pick": "Won the weighted draw.",
  "only-eligible-game": "The only game that fits.",
};

const BASE_WEIGHT = 10;
const RECENCY_BONUS = 10;
const VARIETY_BONUS = 5;

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function validateRequest(r: ShuffleRequest): { count: number; exclude: Set<string>; incompatible: Set<string>; recent: readonly string[] } {
  if (r.mode !== "random" && r.mode !== "smart" && r.mode !== "tournament") {
    throw new Error(`shuffle: unknown mode ${JSON.stringify(r.mode)}`);
  }
  if (!isInt(r.playerCount) || r.playerCount < 1) {
    throw new Error(`shuffle: playerCount must be an integer >= 1, got ${JSON.stringify(r.playerCount)}`);
  }
  if (!isInt(r.seed)) {
    throw new Error(`shuffle: seed must be an integer, got ${JSON.stringify(r.seed)}`);
  }
  const count = r.count ?? 1;
  if (!isInt(count) || count < 1) {
    throw new Error(`shuffle: count must be an integer >= 1, got ${JSON.stringify(r.count)}`);
  }
  for (const [name, value] of [["excludeIds", r.excludeIds], ["incompatibleIds", r.incompatibleIds], ["recentIds", r.recentIds]] as const) {
    if (value !== undefined && (!Array.isArray(value) || value.some((x) => typeof x !== "string"))) {
      throw new Error(`shuffle: ${name} must be an array of strings`);
    }
  }
  if (r.playStyle !== undefined && r.playStyle !== "solo" && r.playStyle !== "team") {
    throw new Error(`shuffle: playStyle must be "solo" or "team", got ${JSON.stringify(r.playStyle)}`);
  }
  return {
    count,
    exclude: new Set(r.excludeIds ?? []),
    incompatible: new Set(r.incompatibleIds ?? []),
    recent: r.recentIds ?? [],
  };
}

/**
 * Stage 9.1 (docs/stage9/stage91.md §3): casual-only games (Jebena Rush) are
 * never picked automatically. Smart Shuffle, Quick Party and tournament
 * schedules all draw from here and serve Cups too, where such a game can't
 * play; a host starts it from the library.
 */
const NEVER_AUTO_PICKED: ReadonlySet<string> = new Set(GAME_REGISTRY.filter((g) => g.casualOnly).map((g) => g.id));

/** The hard-constraint filter. Exported so callers (and the UI) can show how many games fit before picking. */
export function eligibleGames(manifests: readonly GameManifest[], req: ShuffleRequest): GameManifest[] {
  const { exclude, incompatible } = validateRequest(req);
  return manifests.filter(
    (m) =>
      !NEVER_AUTO_PICKED.has(m.id) &&
      req.playerCount >= m.minPlayers &&
      req.playerCount <= m.maxPlayers &&
      !exclude.has(m.id) &&
      !incompatible.has(m.id) &&
      (req.playStyle === undefined || m.playStyle === req.playStyle),
  );
}

function styleOf(manifests: readonly GameManifest[], id: string): "solo" | "team" | undefined {
  return manifests.find((m) => m.id === id)?.playStyle;
}

function buildPick(m: GameManifest, reasons: ShuffleReason[]): ShufflePick {
  return {
    gameId: m.id,
    title: m.title,
    reasons,
    explanation: reasons.map((r) => REASON_TEXT[r]).join(" "),
  };
}

export function shuffle(req: ShuffleRequest): ShuffleResult {
  const manifests = req.manifests ?? GAME_MANIFESTS;
  const { count, recent } = validateRequest(req);
  const pool = eligibleGames(manifests, req);
  if (pool.length === 0) {
    return { ok: false, reason: "no-eligible-games", requested: count };
  }
  const rng = seededRng(req.seed);
  const remaining = [...pool];
  const picks: ShufflePick[] = [];
  const effectiveRecent = [...recent];
  const pickedSoFar: GameManifest[] = [];

  while (picks.length < count && remaining.length > 0) {
    if (remaining.length === 1) {
      // Forced pick: weights are irrelevant, so no bonus reason is claimed.
      const only = remaining[0]!;
      picks.push(buildPick(only, ["only-eligible-game"]));
      remaining.splice(0, 1);
      effectiveRecent.unshift(only.id);
      pickedSoFar.push(only);
      continue;
    }
    let chosen: GameManifest;
    let reasons: ShuffleReason[];
    if (req.mode === "random") {
      chosen = remaining[Math.floor(rng() * remaining.length)]!;
      reasons = ["random-pick"];
    } else {
      // Weighted draw. Bonuses are computed per candidate from the
      // current history (recent + already picked this run).
      const scored = remaining.map((m) => {
        let weight = BASE_WEIGHT;
        const reasonsFor: ShuffleReason[] = [];
        if (!effectiveRecent.includes(m.id)) {
          weight += RECENCY_BONUS;
          reasonsFor.push("not-recently-played");
        }
        if (req.mode === "smart") {
          const lastStyle = effectiveRecent.length > 0 ? styleOf(manifests, effectiveRecent[0]!) : undefined;
          if (lastStyle !== undefined && m.playStyle !== lastStyle) {
            weight += VARIETY_BONUS;
            reasonsFor.push("variety-play-style");
          }
        } else {
          // Tournament: category variety only counts once a set exists.
          if (pickedSoFar.length > 0 && !pickedSoFar.some((p) => p.categories.some((c) => m.categories.includes(c)))) {
            weight += VARIETY_BONUS;
            reasonsFor.push("category-variety");
          }
        }
        return { m, weight, reasonsFor: reasonsFor.length > 0 ? reasonsFor : (["weighted-pick"] as ShuffleReason[]) };
      });
      const total = scored.reduce((sum, s) => sum + s.weight, 0);
      let roll = rng() * total;
      let winner = scored[scored.length - 1]!;
      for (const s of scored) {
        roll -= s.weight;
        if (roll < 0) {
          winner = s;
          break;
        }
      }
      chosen = winner.m;
      reasons = winner.reasonsFor;
    }
    picks.push(buildPick(chosen, reasons));
    remaining.splice(remaining.indexOf(chosen), 1);
    effectiveRecent.unshift(chosen.id);
    pickedSoFar.push(chosen);
  }

  return { ok: true, picks, requested: count, partial: picks.length < count };
}
