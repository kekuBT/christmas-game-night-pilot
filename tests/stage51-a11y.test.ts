/**
 * Stage 5.1 (3F, O-12/O-14): text alternatives that never give the answer
 * away, and no internal ids on player-facing screens.
 */
import { describe, expect, it } from "vitest";
import { flagAlt } from "../src/games/geography.js";
import { playerName, statusWords, titleFor } from "../apps/web/src/ui/mchezo/lib/names.js";

describe("flag text alternatives", () => {
  it("uses the pack's description, else the explanation before its colon, never an option name", () => {
    const opts = ["France", "Italy", "Spain", "Germany"];
    expect(flagAlt({ mode: "flag", options: opts, imageAlt: "Three vertical stripes: green, white, red.", explanation: "x" })).toBe("Three vertical stripes: green, white, red.");
    expect(flagAlt({ mode: "flag", options: opts, explanation: "Blue, white, and red vertical stripes: France." })).toBe("Blue, white, and red vertical stripes");
    // A description that names an option is never used.
    expect(flagAlt({ mode: "flag", options: opts, imageAlt: "The flag of France", explanation: "France: blue, white, red." })).toBe("A flag (no description available)");
    expect(flagAlt({ mode: "capital", options: opts, explanation: "x" })).toBeUndefined();
  });
});

describe("no internal ids on screen", () => {
  it("titles and names fall back to words, not ids", () => {
    expect(titleFor("who-said-that")).toBe("Who Said That?");
    expect(titleFor("who-said-that", [{ id: "who-said-that", title: "Quote Quiz" }])).toBe("Quote Quiz");
    expect(titleFor("no-such-game")).toBe("This game");
    expect(playerName("player-3", [{ id: "player-1", displayName: "Keku" }])).toBe("A player");
    expect(statusWords("playing")).toBe("In play");
  });
});

