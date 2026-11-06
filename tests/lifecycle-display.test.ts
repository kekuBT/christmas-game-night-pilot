// Sprint 3: the client's lifecycle display helpers (pure). The server decides;
// these only word what it decided, and never claim a choice nobody made.
import { describe, expect, it } from "vitest";
import { activeDeadline, formatRemaining, noteServerTime, outcomeLines, participationLine, serverNowEstimate } from "../apps/web/src/ui/mchezo/lib/lifecycle.js";

describe("server-time countdowns", () => {
  it("corrects for a phone clock that is wrong", () => {
    noteServerTime(1_000_000, 1_600_000); // phone 10 min fast
    expect(serverNowEstimate(1_600_500)).toBe(1_000_500);
    noteServerTime(undefined, 0); // a projection without serverNow keeps the last offset
    expect(serverNowEstimate(1_600_500)).toBe(1_000_500);
  });
  it("formats time left, never negative, rounding up", () => {
    expect(formatRemaining(245_000)).toBe("4:05");
    expect(formatRemaining(8_001)).toBe("0:09");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
  it("the phase deadline wins over the game backstop", () => {
    expect(activeDeadline({ phaseDeadlineAt: 5, deadlineAt: 9 })).toBe(5);
    expect(activeDeadline({ deadlineAt: 9 })).toBe(9);
  });
});

describe("participation wording (P5)", () => {
  it("counts what was done, per game", () => {
    expect(participationLine("trivia", { done: 7, of: 10 })).toBe("Answered 7 of 10 questions");
    expect(participationLine("guess-the-year", { done: 1, of: 5 })).toBe("Guessed 1 of 5 events");
    expect(participationLine("word-connections", { done: 2, of: 4, finished: false })).toBe("Solved 2 of 4 groups — puzzle not finished");
    expect(participationLine("word-connections", { done: 4, of: 4, finished: true })).toBe("Solved 4 of 4 groups");
    expect(participationLine("caption-clash", { done: 0, of: 3 })).toBe("Did not submit a caption");
    expect(participationLine("closest-wins", { done: 0, of: 8 })).toBe("Did not submit a guess");
  });
  it("never implies someone chose to sit out unless it is you and you did", () => {
    expect(participationLine("trivia", { done: 0, of: 10 })).toBe("Did not answer (0 of 10)");
    expect(participationLine("trivia", { done: 0, of: 10 }, { you: true })).toBe("Did not answer (0 of 10)");
    expect(participationLine("trivia", { done: 0, of: 10 }, { you: true, choseSatOut: true })).toBe("You chose to sit this one out");
    expect(participationLine("trivia", { done: 0, of: 10 }, { choseSatOut: true })).toBe("Did not answer (0 of 10)");
  });
  it("has nothing to say for games without countable units", () => {
    expect(participationLine("impostor", { done: 0, of: 0 })).toBeNull();
    expect(participationLine("trivia", undefined)).toBeNull();
  });
});

describe("outcome wording", () => {
  const base = { endedAt: 1, participation: {} };
  it("explains each ending and whether it counts", () => {
    expect(outcomeLines({ ...base, reason: "completed", countsOfficially: true }, true)).toEqual({ headline: "Everyone finished.", counts: "Counts toward the Family Cup." });
    expect(outcomeLines({ ...base, reason: "deadline", countsOfficially: true }, true)?.headline).toMatch(/^Time’s up/);
    expect(outcomeLines({ ...base, reason: "backstop-partial", countsOfficially: false, completedUnits: 2, totalUnits: 8, note: "n" }, true)).toEqual({ headline: "The game reached its time limit partway through (2 of 8 completed).", counts: "Does not count toward the Family Cup.", note: "n" });
    expect(outcomeLines({ ...base, reason: "void", countsOfficially: false }, true)?.headline).toMatch(/voided/);
    expect(outcomeLines({ ...base, reason: "completed", countsOfficially: false }, false)?.counts).toBe("Practice game — does not count toward the Family Cup.");
    expect(outcomeLines(undefined, true)).toBeNull();
  });
});
