import { describe, expect, it } from "vitest";
import { GAME_MANIFESTS, type GameManifest } from "../src/games/manifest.js";
import { eligibleGames, shuffle, type ShuffleRequest } from "../src/games/shuffle.js";

const ids = (ms: readonly GameManifest[]) => ms.map((m) => m.id);
const base: ShuffleRequest = { mode: "random", playerCount: 4, seed: 1 };

describe("eligibleGames hard constraints", () => {
  it("player count is an inclusive range check", () => {
    expect(ids(eligibleGames(GAME_MANIFESTS, { ...base, playerCount: 1 }))).toEqual(["word-connections"]);
    expect(eligibleGames(GAME_MANIFESTS, { ...base, playerCount: 4 })).toHaveLength(11);
    expect(eligibleGames(GAME_MANIFESTS, { ...base, playerCount: 11 })).toEqual([]);
  });

  it("excludeIds and incompatibleIds are hard filters", () => {
    const all = ids(GAME_MANIFESTS);
    expect(eligibleGames(GAME_MANIFESTS, { ...base, excludeIds: all })).toEqual([]);
    expect(ids(eligibleGames(GAME_MANIFESTS, { ...base, incompatibleIds: ["trivia", "charades"] }))).not.toContain("trivia");
    expect(ids(eligibleGames(GAME_MANIFESTS, { ...base, incompatibleIds: ["trivia", "charades"] }))).not.toContain("charades");
  });

  it("playStyle filters capability", () => {
    expect(ids(eligibleGames(GAME_MANIFESTS, { ...base, playStyle: "team" }))).toEqual(["charades"]);
    expect(eligibleGames(GAME_MANIFESTS, { ...base, playStyle: "solo" })).toHaveLength(10);
  });
});

describe("shuffle empty and partial results", () => {
  it("no eligible games is an explicit value, not an exception", () => {
    expect(shuffle({ ...base, playerCount: 11 })).toEqual({ ok: false, reason: "no-eligible-games", requested: 1 });
    expect(shuffle({ ...base, excludeIds: ids(GAME_MANIFESTS) })).toEqual({ ok: false, reason: "no-eligible-games", requested: 1 });
  });

  it("requesting more than the pool gives every eligible game plus partial", () => {
    const r = shuffle({ mode: "tournament", playerCount: 4, seed: 7, count: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks).toHaveLength(11);
    expect(r.partial).toBe(true);
    expect(new Set(r.picks.map((p) => p.gameId)).size).toBe(11);
  });

  it("tournament picks are distinct", () => {
    const r = shuffle({ mode: "tournament", playerCount: 4, seed: 3, count: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.picks.map((p) => p.gameId)).size).toBe(3);
  });
});

describe("shuffle determinism", () => {
  it("same request and seed give the same result in every mode", () => {
    for (const mode of ["random", "smart", "tournament"] as const) {
      const req: ShuffleRequest = { mode, playerCount: 6, seed: 42, count: 3, recentIds: ["trivia", "charades"] };
      expect(shuffle(req)).toEqual(shuffle(req));
    }
  });

  it("different seeds can give different picks", () => {
    const a = shuffle({ ...base, seed: 1 });
    const b = shuffle({ ...base, seed: 2 });
    expect(a.ok && b.ok && a.picks[0]!.gameId).not.toBe(b.ok && b.picks[0]!.gameId);
  });
});

describe("shuffle reasons", () => {
  it("a singleton pool is forced, whatever the mode", () => {
    for (const mode of ["random", "smart", "tournament"] as const) {
      const r = shuffle({ mode, playerCount: 1, seed: 9 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.picks[0]!.gameId).toBe("word-connections");
      expect(r.picks[0]!.reasons).toEqual(["only-eligible-game"]);
      expect(r.picks[0]!.explanation).toBe("The only game that fits.");
    }
  });

  it("random mode always reasons random-pick on a multi-game pool", () => {
    const r = shuffle({ ...base, seed: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks[0]!.reasons).toEqual(["random-pick"]);
    expect(r.picks[0]!.explanation).toBe("Picked at random.");
  });

  it("smart mode gives the recency bonus to every unplayed game", () => {
    // Empty history: no variety bonus is possible (no last game), and
    // every candidate is unplayed, so any pick reasons not-recently-played.
    const r = shuffle({ mode: "smart", playerCount: 4, seed: 11, recentIds: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks[0]!.reasons).toEqual(["not-recently-played"]);
  });

  it("smart mode falls back to weighted-pick when no bonus applies", () => {
    // Both pool games recent and same style as the last game: no bonus.
    const trivia = GAME_MANIFESTS.find((m) => m.id === "trivia")!;
    const year = GAME_MANIFESTS.find((m) => m.id === "guess-the-year")!;
    const pool = [trivia, year];
    const r = shuffle({ mode: "smart", playerCount: 4, seed: 4, recentIds: ["trivia", "guess-the-year"], manifests: pool });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks[0]!.reasons).toEqual(["weighted-pick"]);
  });

  it("weights actually bias the draw toward the higher-weight game", () => {
    // A (unplayed, weight 20) vs B (recent, weight 10): over 200 seeds
    // A must win strictly more often. Ratio 2:1 makes a reversal
    // astronomically unlikely (mean 133 vs 67).
    const trivia = GAME_MANIFESTS.find((m) => m.id === "trivia")!;
    const a = { ...trivia, id: "a-game" };
    const b = { ...trivia, id: "b-game" };
    let aWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = shuffle({ mode: "smart", playerCount: 4, seed, recentIds: ["b-game"], manifests: [a, b] });
      if (r.ok && r.picks[0]!.gameId === "a-game") aWins++;
    }
    expect(aWins).toBeGreaterThan(100);
  });
});

describe("shuffle goldens (pinned seeds)", () => {
  const varietyPool = () => {
    const charades = GAME_MANIFESTS.find((m) => m.id === "charades")!;
    const trivia = GAME_MANIFESTS.find((m) => m.id === "trivia")!;
    return [{ ...charades, id: "team-game" }, { ...trivia, id: "solo-game" }];
  };
  const firstPickId = (r: ReturnType<typeof shuffle>) => (r.ok ? r.picks[0]!.gameId : "none");

  it("smart variety: seed 0 picks the variety game with both bonuses", () => {
    const r = shuffle({ mode: "smart", playerCount: 4, seed: 0, recentIds: ["solo-game"], manifests: varietyPool() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks[0]).toEqual({
      gameId: "team-game",
      title: "Charades",
      reasons: ["not-recently-played", "variety-play-style"],
      explanation: "Not played recently. Adds a different kind of game after the last one.",
    });
  });

  it("smart variety: seed 2 picks the recent game on the weighted fallback", () => {
    const r = shuffle({ mode: "smart", playerCount: 4, seed: 2, recentIds: ["solo-game"], manifests: varietyPool() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks[0]).toEqual({
      gameId: "solo-game",
      title: "Trivia Showdown",
      reasons: ["weighted-pick"],
      explanation: "Won the weighted draw.",
    });
  });

  it("random mode goldens on the full catalog", () => {
    expect(firstPickId(shuffle({ ...base, seed: 0 }))).toBe("trivia");
    expect(firstPickId(shuffle({ ...base, seed: 1 }))).toBe("closest-wins");
    expect(firstPickId(shuffle({ ...base, seed: 2 }))).toBe("charades");
    expect(firstPickId(shuffle({ ...base, seed: 3 }))).toBe("category-sprint");
  });

  it("tournament category variety: seed 2 rewards a disjoint category on the second pick", () => {
    const trivia = GAME_MANIFESTS.find((m) => m.id === "trivia")!;
    const pool = [
      { ...trivia, id: "cat-a", categories: ["knowledge"] },
      { ...trivia, id: "cat-b", categories: ["knowledge"] },
      { ...trivia, id: "cat-c", categories: ["party"] },
    ];
    const r = shuffle({ mode: "tournament", playerCount: 4, seed: 2, count: 2, manifests: pool });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks.map((p) => p.gameId)).toEqual(["cat-c", "cat-a"]);
    expect(r.picks[1]!.reasons).toEqual(["not-recently-played", "category-variety"]);
  });

  it("tournament category variety: seed 0 gives no bonus when the second pick shares a category", () => {
    const trivia = GAME_MANIFESTS.find((m) => m.id === "trivia")!;
    const pool = [
      { ...trivia, id: "cat-a", categories: ["knowledge"] },
      { ...trivia, id: "cat-b", categories: ["knowledge"] },
      { ...trivia, id: "cat-c", categories: ["party"] },
    ];
    const r = shuffle({ mode: "tournament", playerCount: 4, seed: 0, count: 2, manifests: pool });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks.map((p) => p.gameId)).toEqual(["cat-a", "cat-b"]);
    expect(r.picks[1]!.reasons).toEqual(["not-recently-played"]);
  });
});

describe("shuffle validation", () => {
  it("throws on malformed requests", () => {
    expect(() => shuffle({ ...base, mode: "nope" as never })).toThrow("unknown mode");
    expect(() => shuffle({ ...base, playerCount: 0 })).toThrow("playerCount");
    expect(() => shuffle({ ...base, count: 0 })).toThrow("count");
    expect(() => shuffle({ ...base, seed: 1.5 })).toThrow("seed");
    expect(() => shuffle({ ...base, excludeIds: "trivia" as never })).toThrow("excludeIds");
  });
});
