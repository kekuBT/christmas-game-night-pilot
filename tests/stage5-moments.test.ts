/**
 * Stage 5 (S5-E): moment lines come only from recorded results, the same on
 * every phone; nothing is said when no fact fits; a win is celebrated with
 * movement only when motion is allowed, and with a still ribbon otherwise.
 */
import { describe, expect, it } from "vitest";
import { celebrationMode, drawMoment, majorityMoment, pulseMoment } from "../apps/web/src/ui/mchezo/lib/moments.js";

const nameOf = (id: string) => ({ k: "Keku", a: "Amina", b: "Bart" })[id] ?? "Someone";
const round = (votesA: number, votesB: number, spotOn: string[] = []) => ({
  prompt: "Tea or coffee?", a: "Tea", b: "Coffee", votesA, votesB,
  majority: (votesA + votesB === 0 ? "none" : votesA > votesB ? "a" : votesB > votesA ? "b" : "tie") as "a" | "b" | "tie" | "none",
  spotOn: spotOn.map((playerId) => ({ playerId, points: 100 })),
});

describe("moment lines", () => {
  it("Majority Rules: a split room first, then a unanimous one, then someone who always called it; otherwise nothing", () => {
    expect(majorityMoment([round(2, 1), round(1, 1)], ["k", "a"], nameOf)).toBe("Round 2 split the room 1–1.");
    expect(majorityMoment([round(2, 1), round(3, 0)], ["k", "a"], nameOf)).toBe("Round 2 was unanimous: everyone picked “Tea”.");
    expect(majorityMoment([round(2, 1, ["k", "a"]), round(1, 2, ["k"])], ["k", "a", "b"], nameOf)).toBe("Keku called the majority every round.");
    expect(majorityMoment([round(2, 1, ["k", "a"]), round(1, 2, ["k", "a"])], ["k", "a", "b"], nameOf)).toBeNull(); // two did: no single name
    expect(majorityMoment([], ["k"], nameOf)).toBeNull();
    expect(majorityMoment([round(0, 0)], ["k"], nameOf)).toBeNull();
  });

  it("Pattern Pulse: only your own perfect rounds, on your own phone", () => {
    const r = (length: number, perfect: boolean, answered = true) => ({ round: length - 3, length, answer: answered ? Array(length).fill(0) : null, perfect });
    expect(pulseMoment([r(3, true), r(4, false), r(5, true)])).toBe("Your longest perfect sequence: 5 shapes.");
    expect(pulseMoment([3, 4, 5, 6, 7, 8].map((n) => r(n, true)))).toBe("Six perfect rounds out of six. Total recall.");
    expect(pulseMoment([r(3, false), r(4, false, false)])).toBeNull();
    expect(pulseMoment(undefined)).toBeNull();
  });

  it("Draw & Guess: a drawing everyone got, else one nobody got, else nothing", () => {
    const t = (drawerId: string, word: string, correct: number) => ({ drawerId, word, correct });
    expect(drawMoment([t("k", "kite", 1), t("a", "owl", 2)], 2, nameOf)).toBe("Everyone got Amina’s “owl”.");
    expect(drawMoment([t("k", "kite", 1), t("a", "owl", 0)], 2, nameOf)).toBe("Nobody got “owl”.");
    expect(drawMoment([t("k", "kite", 1), t("a", "owl", 1)], 2, nameOf)).toBeNull();
  });

  it("celebration: a burst with motion, a still ribbon with Less or Off, nothing if you didn't win", () => {
    expect(celebrationMode(true, false)).toBe("burst");
    expect(celebrationMode(true, true)).toBe("still");
    expect(celebrationMode(false, false)).toBe("none");
    expect(celebrationMode(false, true)).toBe("none");
  });
});
