/**
 * Stage 5.1 (3D): copy that matches the mechanics (no mechanic changed).
 */
import { describe, expect, it } from "vitest";
import { briefingRules } from "../apps/web/src/ui/mchezo/lib/briefing.js";
import { resultsStory } from "../apps/web/src/ui/mchezo/lib/celebrate.js";
import { participationLine, satOutLabel } from "../apps/web/src/ui/mchezo/lib/lifecycle.js";
import { TV_HINT } from "../apps/web/src/ui/mchezo/lib/tvHints.js";
import { captionRoundScores } from "../src/games/caption.js";
import { DRAW_LIMITS, DRAW_MAX_TURNS } from "../src/games/modules/draw.js";
import { pulseInputMs, PULSE_LENGTHS } from "../src/games/modules/pulse.js";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { policyFor } from "../src/server/lifecycle.js";

describe("copy matches the mechanics", () => {
  it("Draw & Guess: the count is drawings and RIGHT guesses; zero says so", () => {
    expect(participationLine("draw-guess", { done: 2, of: 4 } as never)).toBe("Drew or guessed right in 2 of 4 turns");
    expect(participationLine("draw-guess", { done: 0, of: 4 } as never)).toBe("No drawings or right guesses (0 of 4)");
    const steps = briefingRules("draw-guess", "").steps.join(" ");
    expect(DRAW_MAX_TURNS).toBe(6);
    expect(steps).toMatch(/Up to six turns/);
    expect(steps).toMatch(new RegExp(`${DRAW_LIMITS.guessesPerTurn} guesses per drawing`));
    expect(DRAW_LIMITS.swapsPerTurn).toBe(1);
    expect(steps).toMatch(/swap the word once/);
  });

  it("Caption Clash: the briefing gives both parts of the score", () => {
    const pts = captionRoundScores({ captions: { a: "x", b: "y" }, votes: { b: "a" } } as never);
    expect(pts).toEqual({ a: 125, b: 25 });
    expect(briefingRules("caption-clash", "").steps.join(" ")).toMatch(/25 points for each caption you write, plus 100 for every vote/);
  });

  it("Pattern Pulse: the briefing's answer window is the real one", () => {
    const secs = PULSE_LENGTHS.map((l) => pulseInputMs(l) / 1000);
    expect([Math.min(...secs), Math.max(...secs)]).toEqual([16.5, 24]);
    expect(briefingRules("pattern-pulse", "").steps.join(" ")).toMatch(/16 to 24 seconds/);
  });

  it("Impostor: the impostor has no word (TV and briefing agree)", () => {
    expect(TV_HINT["impostor"]).toMatch(/only the category, not the word/);
    expect(TV_HINT["impostor"]).not.toMatch(/different word/);
    expect(briefingRules("impostor", "").steps.join(" ")).toMatch(/A tie, or no votes, catches nobody: the impostor wins/);
  });

  it("Sprint and Geography: the estimate is no longer longer than the game can run", () => {
    for (const id of ["category-sprint", "geography"]) {
      const est = GAME_REGISTRY.find((g) => g.id === id)!.defaultDurationMinutes;
      expect(est).toBeLessThanOrEqual(policyFor(id).gameWindowMs / 60_000 + 1);
    }
  });

  it("sitting out after playing part of a game keeps the place you earned", () => {
    expect(satOutLabel({ state: { myAnswers: {} } })).toBe("You sat this one out");
    expect(satOutLabel({ state: { myAnswers: { q1: 2 } } })).toBe("You sat out the rest");
    const base = { gameInstanceId: "g1", title: "Trivia", official: false, scores: { a: 900, b: 300, c: 100 }, nameOf: (id: string) => id, youId: "a", youSatOut: true };
    const partial = resultsStory({ ...base, yourParticipation: { done: 9, of: 10 } });
    expect(partial.you?.line).toMatch(/^You played 9 of 10, then sat out the rest\./);
    expect(partial.celebrate).toBe(true);
    const whole = resultsStory({ ...base, scores: { a: 0, b: 300, c: 100 }, yourParticipation: { done: 0, of: 10 } });
    expect(whole.you?.line).toBe("You sat this one out. Fair enough.");
    expect(whole.celebrate).toBe(false);
  });
});
