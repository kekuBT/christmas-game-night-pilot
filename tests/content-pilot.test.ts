/**
 * Content Quality 2.0: the pilot draft stays valid against the live schema,
 * stays out of the shipped library, and the Connections solver catches
 * boards with more than one solution.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadContent, DEFAULT_CONTENT_DIR } from "../src/content/registry.js";
import { readFileSync } from "node:fs";
import { checkPilot, connectionsSolutions, enterable, readPilot, roundVarietyProblems } from "../scripts/content-quality/pilot-lib.js";

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
  it("flags numeric answers the game's input cannot accept (E1 ranges)", () => {
    expect(enterable("closest-wins", 828)).toBe(true);
    expect(enterable("closest-wins", 5570)).toBe(true);
    expect(enterable("closest-wins", 42.195)).toBe(true);
    expect(enterable("closest-wins", 2e12)).toBe(false);
    expect(enterable("guess-the-year", 1889)).toBe(true);
    expect(enterable("guess-the-year", 999)).toBe(false);
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

describe("content quality 2.0 revision (owner feedback 2026-11-07)", () => {
  const byId = new Map(pilot.entries.map((e) => [e.item.id, e]));
  const batch2 = (JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "pilot", "review-batch-02.json"), "utf8")) as { items: string[] }).items.map((id) => byId.get(id)!);

  it("review batch 02 exists in the pilot and every item is still provisional", () => {
    expect(batch2.length).toBeGreaterThanOrEqual(18);
    expect(batch2.length).toBeLessThanOrEqual(22);
    for (const e of batch2) {
      expect(e, "batch item missing from the pilot").toBeDefined();
      expect((e.item["review"] as { status: string }).status).toBe("provisional");
    }
  });

  it("batch 02 balances tone: modern or nostalgic >= 40%, classic 25-45%, weird >= 15%", () => {
    const share = (t: string) => batch2.filter((e) => e.editorial.tone?.includes(t as never)).length / batch2.length;
    expect(share("modern") + share("nostalgia") - batch2.filter((e) => e.editorial.tone?.includes("modern") && e.editorial.tone.includes("nostalgia")).length / batch2.length).toBeGreaterThanOrEqual(0.4);
    expect(share("classic")).toBeGreaterThanOrEqual(0.25);
    expect(share("classic")).toBeLessThanOrEqual(0.45);
    expect(share("weird")).toBeGreaterThanOrEqual(0.15);
  });

  it("the batch's Trivia questions form a round with no repeated mechanic problems (E10 proposal)", () => {
    const trivia = batch2.filter((e) => e.game === "trivia");
    expect(trivia.length).toBeGreaterThanOrEqual(6);
    expect(roundVarietyProblems(trivia)).toEqual([]);
  });

  it("the variety rule catches the repetition the review found (two 'never said' questions, negative stems)", () => {
    const round = ["trv-cq2-04", "trv-cq2-05", "trv-cq2-12"].map((id) => byId.get(id)!);
    const problems = roundVarietyProblems(round);
    expect(problems.some((p) => p.includes("quote-twist"))).toBe(true);
    expect(problems.some((p) => p.includes("negative stems"))).toBe(true);
    expect(problems.some((p) => p.includes("twice in a row"))).toBe(true);
  });

  it("owner-prioritised fixes are in place", () => {
    expect(byId.has("who-cq2-02")).toBe(false);
    expect(String(byId.get("trv-cq2-14")!.item["prompt"])).toMatch(/first written down/);
    expect(byId.get("cls-cq2-05")!.item["answer"]).toBe(5555);
    expect(String(byId.get("cls-cq2-05")!.item["prompt"])).toMatch(/Heathrow.*JFK/);
    expect(String(byId.get("geo-cq2-04")!.item["prompt"])).toMatch(/standard time zones/);
    expect(String(byId.get("trv-cq2-10")!.item["explanation"])).toMatch(/CO2/);
  });

  it("Category Sprint follows E2 v3: no peer vote, zodiac rejects cat, official sets are closed and large enough", () => {
    for (const e of pilot.entries.filter((x) => x.game === "category-sprint")) {
      expect(JSON.stringify(e.editorial)).not.toMatch(/peer-challenge|peerChallenge|go to the peer/i);
      if (e.item["eligibility"] === "official") {
        expect(e.editorial.proposedFields?.["closedSet"]).toBe(true);
        expect((e.item["answers"] as string[]).length).toBeGreaterThanOrEqual(16);
      }
    }
    const z = byId.get("spr-cq2-02")!;
    const pf = z.editorial.proposedFields as { aliases: Record<string, { to: string }>; knownNotAccepted: Record<string, string> };
    expect(pf.aliases["cat"]).toBeUndefined();
    expect(pf.knownNotAccepted["cat"]).toMatch(/Vietnamese/);
    expect(z.item["eligibility"]).toBe("practice");
  });
});
