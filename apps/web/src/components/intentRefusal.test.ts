/**
 * Fair starts (handoff 7004097156, H7; narrowed per 7004637491): what a phone says when the server refuses one of its
 * actions. Only an "I'm ready" refused because its own game already started (READY_LOCKED) says nothing: that game is
 * on the player's screen. Everything else keeps its words.
 */
import { describe, expect, it } from "vitest";
import { refusalText } from "./intentRefusal.js";

describe("refusalText", () => {
  it("a late 'I'm ready' is not a failure: its game has started", () => {
    expect(refusalText("briefing-ready", { ready: true }, "READY_LOCKED")).toBeNull();
  });

  it("a late 'not ready' still says the game has started (the player asked for more time and didn't get it)", () => {
    expect(refusalText("briefing-ready", { ready: false }, "READY_LOCKED")).toBe("The game has already started.");
  });

  it("READY_LOCKED is not swallowed for any other action, nor any other briefing refusal", () => {
    expect(refusalText("huddle-pick", { ready: true }, "READY_LOCKED")).toBe("The game has already started.");
    expect(refusalText("briefing-ready", { ready: true }, "PHASE_CLOSED")).toBe("Time was up for that one — it wasn’t counted.");
    expect(refusalText("briefing-ready", { ready: true }, "NOT_A_PARTICIPANT")).toBe("Not accepted: NOT_A_PARTICIPANT");
    expect(refusalText("briefing-ready", {}, "READY_LOCKED")).toBe("The game has already started.");
  });

  it("every other refusal keeps its words", () => {
    expect(refusalText("closest-guess", {}, "PHASE_CLOSED")).toBe("Time was up for that one — it wasn’t counted.");
    expect(refusalText("relay-answer", {}, undefined)).toBe("Not accepted: unknown");
  });
});
