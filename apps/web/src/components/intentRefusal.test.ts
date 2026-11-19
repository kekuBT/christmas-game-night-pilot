/**
 * Fair starts (handoff 7004097156, H7): what a phone says when the server refuses one of its actions. A briefing
 * Ready (or "not ready") that reaches the server after play began is refused (READY_LOCKED) and changes nothing; the
 * game the player wanted has started and is on their screen, so it is not a failure to show on that game.
 */
import { describe, expect, it } from "vitest";
import { refusalText } from "./intentRefusal.js";

describe("refusalText", () => {
  it("a late Ready, or a late 'not ready', is not a failure: the game has started", () => {
    expect(refusalText("briefing-ready", "READY_LOCKED")).toBeNull();
  });

  it("every other refusal keeps its words", () => {
    expect(refusalText("closest-guess", "PHASE_CLOSED")).toBe("Time was up for that one — it wasn’t counted.");
    expect(refusalText("huddle-pick", "READY_LOCKED")).toBe("The game has already started.");
    expect(refusalText("briefing-ready", "NOT_A_PARTICIPANT")).toBe("Not accepted: NOT_A_PARTICIPANT");
    expect(refusalText("relay-answer", undefined)).toBe("Not accepted: unknown");
  });
});
