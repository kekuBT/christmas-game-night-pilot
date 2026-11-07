/**
 * Content Quality 2.0: the pilot draft stays valid against the live schema,
 * stays out of the shipped library, and the Connections solver catches
 * boards with more than one solution.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadContent, DEFAULT_CONTENT_DIR } from "../src/content/registry.js";
import { checkPilot, connectionsSolutions, enterable, readPilot } from "../scripts/content-quality/pilot-lib.js";

const pilot = readPilot(join(DEFAULT_CONTENT_DIR, "pilot", "pilot-cq2.json"));
const lib = loadContent();

describe("content quality 2.0 pilot", () => {
  it("passes the live schemas and editorial checks with no errors", () => {
    const errors = checkPilot(pilot, new Set(lib.items.keys())).filter((f) => f.level === "error");
    expect(errors).toEqual([]);
  });
  it("is not part of the shipped library and holds no approvals", () => {
    for (const e of pilot.entries) {
      expect(lib.items.has(e.item.id)).toBe(false);
      expect((e.item["review"] as { status: string }).status).toBe("provisional");
    }
  });
  it("flags numeric answers the current client cannot accept", () => {
    expect(enterable("closest-wins", 828)).toBe(true);
    expect(enterable("closest-wins", 5570)).toBe(false);
    expect(enterable("closest-wins", 42.195)).toBe(false);
    expect(enterable("guess-the-year", 1889)).toBe(false);
  });
});

describe("connections uniqueness solver", () => {
  const board = [
    { name: "Planets", words: ["Venus", "Saturn", "Neptune", "Jupiter"] },
    { name: "Chocolate bars", words: ["Mars", "Twix", "Bounty", "Snickers"] },
    { name: "Space things", words: ["Galaxy", "Comet", "Nebula", "Asteroid"] },
    { name: "Shades of red", words: ["Ruby", "Scarlet", "Crimson", "Cherry"] },
  ];
  it("finds the second solution in a board with a superset category", () => {
    // Galaxy is also a chocolate bar; Mars is a planet; every planet is a 'space thing'.
    const overlaps = { Galaxy: ["Chocolate bars"], Mars: ["Planets", "Space things"], Venus: ["Space things"], Saturn: ["Space things"], Neptune: ["Space things"], Jupiter: ["Space things"] };
    expect(connectionsSolutions(board, overlaps).length).toBeGreaterThan(1);
  });
  it("accepts a board whose overlaps are forced by counting", () => {
    expect(connectionsSolutions(board, { Mars: ["Planets"] }).length).toBe(1);
  });
});
