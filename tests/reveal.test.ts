import { describe, expect, it } from "vitest";
import { clampStep, revealSteps, stepLabel } from "../apps/web/src/ui/mchezo/lib/reveal.js";

describe("revealSteps", () => {
  it("walks question/reveal pairs in order, then a standings finale", () => {
    expect(revealSteps(3, true)).toEqual([
      { kind: "question", index: 0 },
      { kind: "reveal", index: 0 },
      { kind: "question", index: 1 },
      { kind: "reveal", index: 1 },
      { kind: "question", index: 2 },
      { kind: "reveal", index: 2 },
      { kind: "standings" },
    ]);
  });

  it("ten questions give twenty-one steps", () => {
    expect(revealSteps(10, true)).toHaveLength(21);
  });

  it("zero questions give standings only", () => {
    expect(revealSteps(0, true)).toEqual([{ kind: "standings" }]);
  });

  it("unfinished games give no steps at all (secrecy)", () => {
    expect(revealSteps(10, false)).toEqual([]);
    expect(revealSteps(0, false)).toEqual([]);
  });

  it("steps carry no answer data — kind and index only", () => {
    for (const s of revealSteps(10, true)) {
      expect(Object.keys(s).sort()).toEqual(s.kind === "standings" ? ["kind"] : ["index", "kind"]);
    }
  });
});

describe("clampStep", () => {
  const steps = revealSteps(3, true);
  it("clamps below zero to the first step", () => {
    expect(clampStep(steps, -2)).toBe(0);
  });
  it("clamps past the end to the last step", () => {
    expect(clampStep(steps, 99)).toBe(steps.length - 1);
  });
  it("keeps in-range positions", () => {
    expect(clampStep(steps, 4)).toBe(4);
  });
  it("empty lists stay at zero", () => {
    expect(clampStep([], 5)).toBe(0);
  });
});

describe("stepLabel", () => {
  it("labels question, reveal, and standings steps", () => {
    expect(stepLabel({ kind: "question", index: 2 }, 10)).toBe("Question 3 of 10");
    expect(stepLabel({ kind: "reveal", index: 2 }, 10)).toBe("Reveal 3 of 10");
    expect(stepLabel({ kind: "standings" }, 10)).toBe("Standings");
  });
});
