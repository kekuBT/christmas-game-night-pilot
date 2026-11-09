// Tournament Studio scheduling engine (Milestone I) — pure, preview-only.
// It schedules games for a host-configured event. It deliberately does
// NOT score anything: no standings, no championship writes, no
// achievements, no server calls. The approved Family Cup rules
// (src/scoring/championship.ts) are untouched, and no new authoritative
// scoring system is activated here — a future activation needs its own
// architecture review (see docs/TOURNAMENT_STUDIO_ARCHITECTURE.md).
//
// The engine reuses the Milestone H shuffle engine instead of inventing
// a second picker: distinct schedules come from one tournament-mode
// shuffle call (distinct by construction), repeat-allowed schedules
// from one pick per slot (each seeded deterministically from
// seed + slot index). The per-slot strategy is the preset's
// repeatSelection: "variety-weighted" (smart-mode, recency + variety
// weights, repeats spread out) or "uniform-random" (random-mode,
// history ignored by design, repeats cluster naturally). Chaos Night
// is the approved uniform-random format; it differs from Gauntlet
// (distinct + variety-weighted) by scheduling behavior, not by label.
// Like H, this module is free of node imports and Zod so the preview UI
// can import it into the web bundle; validation is by hand and tested.
//
// Knockout brackets are NOT a format here: elimination needs an
// advancement/scoring model that does not exist yet, so requesting one
// fails validation instead of producing a misleading bracket.
import { GAME_MANIFESTS, type GameManifest } from "./manifest.js";
import { eligibleGames, shuffle, type ShuffleReason } from "./shuffle.js";

export type TournamentFormat =
  | "points-league"
  | "team-clash"
  | "gauntlet"
  | "chaos-night"
  | "think-tank"
  | "long-game";

export const TOURNAMENT_FORMATS: TournamentFormat[] = [
  "points-league",
  "team-clash",
  "gauntlet",
  "chaos-night",
  "think-tank",
  "long-game",
];

export interface TournamentPreset {
  format: TournamentFormat;
  label: string;
  description: string;
  rounds: number;
  gamesPerRound: number;
  distinctOnly: boolean;
  playStyle?: "solo" | "team";
  categories?: string[];
  // Repeat-path pick strategy. Only meaningful when distinctOnly is
  // false; distinct schedules always use tournament-mode. Default
  // (absent) is "variety-weighted".
  repeatSelection?: "variety-weighted" | "uniform-random";
}

export const TOURNAMENT_PRESETS: TournamentPreset[] = [
  {
    format: "points-league",
    label: "Points League",
    description: "Five rounds, five different solo games. A league table would rank cumulative play — scoring is not part of this preview.",
    rounds: 5,
    gamesPerRound: 1,
    distinctOnly: true,
    playStyle: "solo",
  },
  {
    format: "team-clash",
    label: "Team Clash",
    description: "Three team rounds. It needs a team game, and today the only one is Charades, so every round is Charades.",
    rounds: 3,
    gamesPerRound: 1,
    distinctOnly: false,
    playStyle: "team",
  },
  {
    format: "gauntlet",
    label: "The Gauntlet",
    description: "Six different games, one after another, in shuffled order.",
    rounds: 6,
    gamesPerRound: 1,
    distinctOnly: true,
  },
  {
    format: "chaos-night",
    label: "Chaos Night",
    description: "Six rounds, anything goes, repeats welcome. Picks are uniform random — no variety preference, so repeats cluster naturally. This is the approved scheduling distinction from Gauntlet.",
    rounds: 6,
    gamesPerRound: 1,
    distinctOnly: false,
    repeatSelection: "uniform-random",
  },
  {
    format: "think-tank",
    label: "The Think Tank",
    description: "Five different brain games: knowledge, puzzles, words, and numbers.",
    rounds: 5,
    gamesPerRound: 1,
    distinctOnly: true,
    categories: ["knowledge", "quiz", "word", "puzzle", "math", "estimation"],
  },
  {
    format: "long-game",
    label: "The Long Game",
    description: "Ten rounds, a marathon. Repeats allowed so the schedule always fills.",
    rounds: 10,
    gamesPerRound: 1,
    distinctOnly: false,
  },
];

export function presetFor(format: string): TournamentPreset {
  const p = TOURNAMENT_PRESETS.find((x) => x.format === format);
  if (!p) throw new Error(`tournament: unknown format ${JSON.stringify(format)} (knockout brackets are unsupported)`);
  return p;
}

export interface TournamentConfig {
  format: TournamentFormat;
  name?: string;
  rounds: number;
  gamesPerRound: number;
  playerCount: number;
  distinctOnly?: boolean;
  playStyle?: "solo" | "team";
  categories?: readonly string[];
  excludeIds?: readonly string[];
  seed: number;
  recentIds?: readonly string[];
  manifests?: readonly GameManifest[];
  // Repeat-path pick strategy (see TournamentPreset.repeatSelection).
  repeatSelection?: "variety-weighted" | "uniform-random";
}

/** Build a full config from a preset plus room data. Overrides win over preset defaults. */
export function configFromPreset(
  format: TournamentFormat,
  opts: { playerCount: number; seed: number; rounds?: number; recentIds?: string[] },
): TournamentConfig {
  const p = presetFor(format);
  return {
    format: p.format,
    name: p.label,
    rounds: opts.rounds ?? p.rounds,
    gamesPerRound: p.gamesPerRound,
    playerCount: opts.playerCount,
    distinctOnly: p.distinctOnly,
    playStyle: p.playStyle,
    categories: p.categories,
    seed: opts.seed,
    recentIds: opts.recentIds ?? [],
    repeatSelection: p.repeatSelection,
  };
}

export interface ScheduledGame {
  gameId: string;
  title: string;
  reasons: ShuffleReason[];
  explanation: string;
}

export interface TournamentRound {
  round: number;
  games: ScheduledGame[];
}

export type ScheduleResult =
  | {
      ok: true;
      format: TournamentFormat;
      name: string;
      rounds: TournamentRound[];
      totalGames: number;
    }
  | {
      ok: false;
      reason: "no-eligible-games" | "not-enough-games";
      eligible: number;
      requested: number;
    };

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function validateConfig(c: TournamentConfig): void {
  presetFor(c.format);
  if (!isInt(c.rounds) || c.rounds < 1 || c.rounds > 20) {
    throw new Error(`tournament: rounds must be an integer 1–20, got ${JSON.stringify(c.rounds)}`);
  }
  if (!isInt(c.gamesPerRound) || c.gamesPerRound < 1 || c.gamesPerRound > 5) {
    throw new Error(`tournament: gamesPerRound must be an integer 1–5, got ${JSON.stringify(c.gamesPerRound)}`);
  }
  if (!isInt(c.playerCount) || c.playerCount < 1) {
    throw new Error(`tournament: playerCount must be an integer >= 1, got ${JSON.stringify(c.playerCount)}`);
  }
  if (!isInt(c.seed)) {
    throw new Error(`tournament: seed must be an integer, got ${JSON.stringify(c.seed)}`);
  }
  if (c.playStyle !== undefined && c.playStyle !== "solo" && c.playStyle !== "team") {
    throw new Error(`tournament: playStyle must be "solo" or "team", got ${JSON.stringify(c.playStyle)}`);
  }
  if (c.repeatSelection !== undefined && c.repeatSelection !== "variety-weighted" && c.repeatSelection !== "uniform-random") {
    throw new Error(`tournament: repeatSelection must be "variety-weighted" or "uniform-random", got ${JSON.stringify(c.repeatSelection)}`);
  }
  if (c.repeatSelection === "uniform-random" && (c.distinctOnly ?? true)) {
    throw new Error(`tournament: uniform-random repeatSelection only applies to repeat-allowed schedules (distinctOnly must be false)`);
  }
  for (const [name, value] of [["categories", c.categories], ["excludeIds", c.excludeIds], ["recentIds", c.recentIds]] as const) {
    if (value !== undefined && (!Array.isArray(value) || value.some((x) => typeof x !== "string"))) {
      throw new Error(`tournament: ${name} must be an array of strings`);
    }
  }
}

export function scheduleTournament(config: TournamentConfig): ScheduleResult {
  validateConfig(config);
  const manifests = config.manifests ?? GAME_MANIFESTS;
  const distinctOnly = config.distinctOnly ?? true;
  const slots = config.rounds * config.gamesPerRound;
  // Hard filters first (H's filter), then the category filter (OR match).
  let eligible = eligibleGames(manifests, {
    mode: "tournament",
    playerCount: config.playerCount,
    seed: config.seed,
    excludeIds: config.excludeIds,
    playStyle: config.playStyle,
  });
  if (config.categories !== undefined && config.categories.length > 0) {
    eligible = eligible.filter((m) => config.categories!.some((c) => m.categories.includes(c)));
  }
  if (eligible.length === 0) {
    return { ok: false, reason: "no-eligible-games", eligible: 0, requested: slots };
  }
  if (distinctOnly && slots > eligible.length) {
    return { ok: false, reason: "not-enough-games", eligible: eligible.length, requested: slots };
  }

  const recent = config.recentIds ?? [];
  let flat: ScheduledGame[];
  if (distinctOnly) {
    // One tournament-mode call: distinct by construction, category
    // variety across the set, recency-weighted.
    const r = shuffle({
      mode: "tournament",
      playerCount: config.playerCount,
      seed: config.seed,
      count: slots,
      recentIds: recent,
      manifests: eligible,
    });
    if (!r.ok) return { ok: false, reason: "no-eligible-games", eligible: 0, requested: slots };
    flat = r.picks.map((p) => ({ gameId: p.gameId, title: p.title, reasons: p.reasons, explanation: p.explanation }));
  } else {
    // Repeat path: one pick per slot, each deterministically seeded
    // from seed + slot index. The strategy is the preset's
    // repeatSelection. "variety-weighted" uses smart-mode picks with
    // already-scheduled games as recency, so repeats spread out.
    // "uniform-random" (Chaos Night, approved) uses random-mode picks
    // that deliberately ignore history — no recency, no variety
    // weights — so repeats cluster naturally. Hard eligibility is
    // identical in both: picks come only from the filtered pool.
    const uniform = config.repeatSelection === "uniform-random";
    flat = [];
    const scheduledSoFar: string[] = [];
    for (let i = 0; i < slots; i++) {
      const r = shuffle({
        mode: uniform ? "random" : "smart",
        playerCount: config.playerCount,
        seed: config.seed + i,
        // Random mode ignores recentIds by construction (uniform draw),
        // so history is passed only to the weighted path.
        recentIds: uniform ? [] : [...scheduledSoFar, ...recent],
        manifests: eligible,
      });
      if (!r.ok || r.picks.length === 0) return { ok: false, reason: "no-eligible-games", eligible: 0, requested: slots };
      const p = r.picks[0]!;
      flat.push({ gameId: p.gameId, title: p.title, reasons: p.reasons, explanation: p.explanation });
      scheduledSoFar.unshift(p.gameId);
    }
  }

  const rounds: TournamentRound[] = [];
  for (let k = 0; k < config.rounds; k++) {
    rounds.push({
      round: k + 1,
      games: flat.slice(k * config.gamesPerRound, (k + 1) * config.gamesPerRound),
    });
  }
  return {
    ok: true,
    format: config.format,
    name: config.name ?? presetFor(config.format).label,
    rounds,
    totalGames: flat.length,
  };
}
