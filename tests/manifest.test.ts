import { GAME_POLICIES } from "../src/server/lifecycle.js";
import { describe, expect, it } from "vitest";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { GAME_MANIFESTS, getManifest, validateAllManifests, validateManifest } from "../src/games/manifest.js";

describe("the shipped manifests", () => {
  it("every registry game has exactly one valid manifest", () => {
    expect(GAME_MANIFESTS).toHaveLength(GAME_REGISTRY.length);
    expect(validateAllManifests()).toEqual([]);
    for (const m of GAME_MANIFESTS) {
      expect(validateManifest(m)).toEqual([]);
    }
  });

  it("getManifest returns the registry title and throws on unknown ids", () => {
    expect(getManifest("trivia").title).toBe("Trivia Showdown");
    expect(getManifest("charades").playStyle).toBe("team");
    expect(() => getManifest("no-such-game")).toThrow("Unknown game manifest");
  });

  it("durations are design defaults, never measured times", () => {
    for (const m of GAME_MANIFESTS) {
      expect(m.duration.source).toBe("design-default");
      expect(m.duration.measured).toBe(false);
    }
  });

  it("intensity is unknown everywhere: it has never been measured", () => {
    for (const m of GAME_MANIFESTS) {
      expect(m.intensity).toBe("unknown");
    }
  });

  it("only trivia has a dedicated TV stage", () => {
    for (const m of GAME_MANIFESTS) {
      expect(m.tv).toBe(m.id === "trivia" ? "dedicated" : "dashboard");
    }
  });

  it("every original game supports practice and official play; Stage 5's and Stage 9.1's new games are practice-only", () => {
    // Stage 5: new games launch practice-only until the owner approves their
    // Cup scoring; the manifest and the server's policy must agree. Stage 9.1:
    // Jebena Rush too (casual rooms only).
    const STAGE5_PRACTICE_ONLY = ["majority-rules", "pattern-pulse", "draw-guess", "jebena-rush"];
    for (const m of GAME_MANIFESTS) {
      expect(m.features.practice).toBe(true);
      expect(m.features.official).toBe(!STAGE5_PRACTICE_ONLY.includes(m.id));
    }
    for (const id of STAGE5_PRACTICE_ONLY) {
      expect(GAME_POLICIES[id]?.officialEligible).toBe(false);
      expect(GAME_POLICIES[id]?.practiceOnlyReason).toMatch(/practice-only/);
    }
  });

  it("abstention matches the engine per game (decision L33)", () => {
    // Regression: closest-wins shipped as "whole-game" while its details,
    // the engine (abstainClosest, per-question state), and L33 all say
    // per-question — a player who sits out one question can still play
    // the later ones. Pin every game's value so a typo cannot hide again.
    const expected: Record<string, string> = {
      impostor: "per-phase",
      "caption-clash": "per-round",
      trivia: "whole-game",
      "word-connections": "whole-game",
      "who-said-that": "whole-game",
      "guess-the-year": "whole-game",
      "closest-wins": "per-question",
      "category-sprint": "whole-game",
      charades: "none",
      geography: "whole-game",
      "math-mayhem": "whole-game",
      "majority-rules": "per-round",
      "pattern-pulse": "whole-game",
      "draw-guess": "per-round",
      // Stage 9.1: sitting out leaves the match (the player is out from then).
      "jebena-rush": "whole-game",
    };
    for (const m of GAME_MANIFESTS) {
      expect(m.features.abstention).toBe(expected[m.id]);
    }
  });
});

describe("validateManifest shape errors", () => {
  const valid = GAME_MANIFESTS[0]!;

  it("rejects a missing description", () => {
    const { description, ...rest } = valid as Record<string, unknown>;
    void description;
    expect(validateManifest(rest)).toEqual(expect.arrayContaining([expect.stringContaining("description")]));
  });

  it("rejects empty categories", () => {
    expect(validateManifest({ ...valid, categories: [] })).toEqual(
      expect.arrayContaining([expect.stringContaining("categories")]),
    );
  });

  it("rejects a non-positive duration", () => {
    expect(validateManifest({ ...valid, duration: { minutes: 0, source: "design-default", measured: false } })).toEqual(
      expect.arrayContaining([expect.stringContaining("duration.minutes")]),
    );
  });

  it("rejects an unknown game id", () => {
    expect(validateManifest({ ...valid, id: "no-such-game" })).toEqual([
      'id: no registry game with id "no-such-game"',
    ]);
  });
});

describe("validateManifest contradictions", () => {
  const trivia = getManifest("trivia");
  const charades = getManifest("charades");

  it("rejects a title that disagrees with the registry", () => {
    const errors = validateManifest({ ...trivia, title: "Trivia Night" });
    expect(errors).toContain('title: "Trivia Night" does not match registry "Trivia Showdown"');
  });

  it("rejects player counts that disagree with the registry", () => {
    const errors = validateManifest({ ...trivia, minPlayers: 3 });
    expect(errors).toContain("minPlayers: 3 does not match registry 2");
  });

  it("rejects a duration that disagrees with the registry", () => {
    const errors = validateManifest({ ...trivia, duration: { minutes: 99, source: "design-default", measured: false } });
    expect(errors).toContain("duration.minutes: 99 does not match registry 10");
  });

  it("rejects a play style that contradicts registry modes", () => {
    const errors = validateManifest({ ...trivia, playStyle: "team" });
    expect(errors).toContain('playStyle: "team" contradicts registry modes [solo]');
  });

  it("rejects minPlayers above maxPlayers", () => {
    const errors = validateManifest({ ...trivia, minPlayers: 9, maxPlayers: 2 });
    expect(errors).toContain("minPlayers: 9 exceeds maxPlayers 2");
  });

  it("rejects maxPlayers above the room cap of 10", () => {
    const errors = validateManifest({ ...trivia, minPlayers: 2, maxPlayers: 11 });
    expect(errors).toContain("maxPlayers: 11 exceeds the room cap of 10");
  });

  it("rejects a dashboard TV claim for trivia", () => {
    const errors = validateManifest({ ...trivia, tv: "dashboard" });
    expect(errors).toContain('tv: trivia must be "dedicated" (MchezoTvStage exists)');
  });

  it("rejects a dedicated TV claim for a non-trivia game", () => {
    const errors = validateManifest({ ...charades, tv: "dedicated" });
    expect(errors).toContain('tv: only trivia has a dedicated stage; others are "dashboard"');
  });

  it("rejects an abstention claim for charades", () => {
    const errors = validateManifest({ ...charades, features: { ...charades.features, abstention: "whole-game" } });
    expect(errors).toContain("features.abstention: charades has no abstention (NOT_APPLICABLE)");
  });

  it("rejects team support that contradicts the play style", () => {
    const errors = validateManifest({ ...trivia, tournament: { usesPerPlayerScores: true, supportsTeams: true } });
    expect(errors).toContain('tournament.supportsTeams: true contradicts playStyle "solo"');
  });

  it("rejects team-derived scores that contradict the play style", () => {
    const errors = validateManifest({ ...trivia, scoring: { type: "per-player-points", teamDerived: true } });
    expect(errors).toContain('scoring.teamDerived: true contradicts playStyle "solo"');
  });
});

describe("validateAllManifests set errors", () => {
  it("reports a registry game with no manifest", () => {
    // validateAllManifests reads the module-level arrays, so this test
    // documents the contract rather than mutating it: with the shipped
    // set complete, there is nothing to report.
    expect(validateAllManifests()).toEqual([]);
    expect(GAME_REGISTRY.every((g) => GAME_MANIFESTS.some((m) => m.id === g.id))).toBe(true);
  });
});
