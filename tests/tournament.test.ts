import { describe, expect, it } from "vitest";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import {
  configFromPreset,
  presetFor,
  scheduleTournament,
  TOURNAMENT_FORMATS,
  TOURNAMENT_PRESETS,
  type TournamentConfig,
} from "../src/games/tournament.js";

const base4 = (format: TournamentConfig["format"] = "points-league"): TournamentConfig =>
  configFromPreset(format, { playerCount: 4, seed: 1 });

describe("presets", () => {
  it("six formats, each with a preset", () => {
    expect(TOURNAMENT_FORMATS).toHaveLength(6);
    expect(TOURNAMENT_PRESETS).toHaveLength(6);
    for (const f of TOURNAMENT_FORMATS) {
      const p = presetFor(f);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.rounds).toBeGreaterThanOrEqual(1);
      expect(p.gamesPerRound).toBe(1);
    }
  });

  it("knockout brackets are rejected, not scheduled", () => {
    expect(() => presetFor("knockout")).toThrow("unsupported");
    expect(() => presetFor("single-elimination")).toThrow("unsupported");
  });

  it("configFromPreset merges defaults with overrides", () => {
    const c = configFromPreset("gauntlet", { playerCount: 6, seed: 9, rounds: 3 });
    expect(c.format).toBe("gauntlet");
    expect(c.rounds).toBe(3);
    expect(c.distinctOnly).toBe(true);
    expect(c.playerCount).toBe(6);
    expect(c.seed).toBe(9);
    const d = configFromPreset("gauntlet", { playerCount: 6, seed: 9 });
    expect(d.rounds).toBe(6);
  });
});

describe("scheduleTournament validation", () => {
  it("throws on malformed configs", () => {
    expect(() => scheduleTournament({ ...base4(), rounds: 0 })).toThrow("rounds");
    expect(() => scheduleTournament({ ...base4(), rounds: 21 })).toThrow("rounds");
    expect(() => scheduleTournament({ ...base4(), gamesPerRound: 0 })).toThrow("gamesPerRound");
    expect(() => scheduleTournament({ ...base4(), gamesPerRound: 6 })).toThrow("gamesPerRound");
    expect(() => scheduleTournament({ ...base4(), playerCount: 0 })).toThrow("playerCount");
    expect(() => scheduleTournament({ ...base4(), seed: 1.5 })).toThrow("seed");
    expect(() => scheduleTournament({ ...base4(), format: "knockout" as never })).toThrow("unsupported");
  });
});

describe("scheduleTournament shapes", () => {
  it("points league: 5 rounds, 5 distinct solo games", () => {
    const r = scheduleTournament(base4("points-league"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rounds).toHaveLength(5);
    expect(r.totalGames).toBe(5);
    const ids = r.rounds.flatMap((x) => x.games.map((g) => g.gameId));
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) {
      expect(GAME_MANIFESTS.find((m) => m.id === id)!.playStyle).toBe("solo");
    }
  });

  it("gauntlet: distinct games in shuffled order", () => {
    const r = scheduleTournament(base4("gauntlet"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rounds).toHaveLength(6);
    expect(new Set(r.rounds.flatMap((x) => x.games.map((g) => g.gameId))).size).toBe(6);
  });

  it("chaos night: repeats allowed, shape holds", () => {
    const r = scheduleTournament(base4("chaos-night"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rounds).toHaveLength(6);
    expect(r.totalGames).toBe(6);
  });

  it("think tank: every scheduled game is a brain game", () => {
    const think = new Set(["knowledge", "quiz", "word", "puzzle", "math", "estimation"]);
    const r = scheduleTournament(base4("think-tank"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const g of r.rounds.flatMap((x) => x.games)) {
      const cats = GAME_MANIFESTS.find((m) => m.id === g.gameId)!.categories;
      expect(cats.some((c) => think.has(c))).toBe(true);
    }
    expect(r.rounds.flatMap((x) => x.games.map((g) => g.gameId))).not.toContain("charades");
    expect(r.rounds.flatMap((x) => x.games.map((g) => g.gameId))).not.toContain("impostor");
  });

  it("team clash at 4 players schedules only Charades (the one team game)", () => {
    const r = scheduleTournament(base4("team-clash"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rounds).toHaveLength(3);
    expect(r.rounds.flatMap((x) => x.games.map((g) => g.gameId))).toEqual(["charades", "charades", "charades"]);
  });

  it("team clash at 2 players is explicitly infeasible (no team game fits)", () => {
    const r = scheduleTournament(configFromPreset("team-clash", { playerCount: 2, seed: 1 }));
    expect(r).toEqual({ ok: false, reason: "no-eligible-games", eligible: 0, requested: 3 });
  });

  it("distinct schedule larger than the pool is explicitly infeasible", () => {
    const r = scheduleTournament({ ...base4("gauntlet"), rounds: 20 });
    expect(r).toEqual({ ok: false, reason: "not-enough-games", eligible: 11, requested: 20 });
  });

  it("gamesPerRound chunks rounds correctly", () => {
    const r = scheduleTournament({ ...base4("gauntlet"), rounds: 2, gamesPerRound: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rounds).toHaveLength(2);
    expect(r.rounds[0]!.games).toHaveLength(2);
    expect(r.rounds[1]!.games).toHaveLength(2);
    expect(r.totalGames).toBe(4);
    expect(new Set(r.rounds.flatMap((x) => x.games.map((g) => g.gameId))).size).toBe(4);
  });

  it("every scheduled game carries reasons and an explanation", () => {
    const r = scheduleTournament(base4("gauntlet"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const g of r.rounds.flatMap((x) => x.games)) {
      expect(g.reasons.length).toBeGreaterThan(0);
      expect(g.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe("format differentiation (review §4)", () => {
  const twoGames = GAME_MANIFESTS.filter((m) => m.id === "trivia" || m.id === "math-mayhem");

  it("pigeonhole: chaos repeats from a 2-game pool where gauntlet is infeasible", () => {
    const chaos = scheduleTournament({ ...configFromPreset("chaos-night", { playerCount: 4, seed: 1 }), manifests: twoGames, rounds: 6 });
    expect(chaos.ok).toBe(true);
    if (!chaos.ok) return;
    const ids = chaos.rounds.flatMap((x) => x.games.map((g) => g.gameId));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBeLessThan(6); // 6 slots, 2 games: a repeat is forced
    const gauntlet = scheduleTournament({ ...configFromPreset("gauntlet", { playerCount: 4, seed: 1 }), manifests: twoGames, rounds: 6 });
    expect(gauntlet).toEqual({ ok: false, reason: "not-enough-games", eligible: 2, requested: 6 });
  });

  it("points league never schedules Charades (solo filter is structural, every seed)", () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = scheduleTournament(configFromPreset("points-league", { playerCount: 4, seed }));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const ids = r.rounds.flatMap((x) => x.games.map((g) => g.gameId));
      expect(ids).not.toContain("charades");
      for (const id of ids) {
        expect(GAME_MANIFESTS.find((m) => m.id === id)!.playStyle).toBe("solo");
      }
    }
  });

  it("long game and chaos differ only by length (same pool, same repeat policy)", () => {
    const long = scheduleTournament(configFromPreset("long-game", { playerCount: 4, seed: 3 }));
    const chaos = scheduleTournament(configFromPreset("chaos-night", { playerCount: 4, seed: 3 }));
    expect(long.ok).toBe(true);
    expect(chaos.ok).toBe(true);
    if (!long.ok || !chaos.ok) return;
    expect(long.totalGames).toBe(10);
    expect(chaos.totalGames).toBe(6);
  });

  it("repeat-path reasons come from the engine (singleton pool reports only-eligible-game)", () => {
    const r = scheduleTournament(configFromPreset("team-clash", { playerCount: 4, seed: 5 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const g of r.rounds.flatMap((x) => x.games)) {
      expect(g.reasons).toEqual(["only-eligible-game"]);
      expect(g.explanation).toBe("The only game that fits.");
    }
  });
});

describe("scheduleTournament determinism and purity", () => {
  it("same config and seed give the same schedule in both strategies", () => {
    const distinct = base4("gauntlet");
    expect(scheduleTournament(distinct)).toEqual(scheduleTournament(distinct));
    const repeat = base4("chaos-night");
    expect(scheduleTournament(repeat)).toEqual(scheduleTournament(repeat));
  });

  it("does not mutate its inputs", () => {
    const config = base4("gauntlet");
    const frozenManifests = Object.freeze(GAME_MANIFESTS.map((m) => Object.freeze({ ...m, categories: Object.freeze([...m.categories]) })));
    const frozenConfig = Object.freeze({ ...config, manifests: frozenManifests, recentIds: Object.freeze(["trivia"]) });
    const r = scheduleTournament(frozenConfig);
    expect(r.ok).toBe(true);
  });
});
