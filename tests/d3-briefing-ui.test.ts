/**
 * D3 client helpers (pure parts). The rendered briefing is covered by the
 * browser driver scripts/check-briefing.mjs; the rules themselves by
 * tests/d3-briefing*.test.ts on the server, which decides everything.
 */
import { describe, expect, it } from "vitest";
import { briefingClock, briefingPeople, briefingRules, needsConfirmation, personStatus, timingLines, type BriefingInfo } from "../apps/web/src/ui/mchezo/lib/briefing.js";
import { deriveShowPhase } from "../apps/web/src/components/showPhase.js";
import type { PlayerGame } from "../apps/web/src/types.js";

const b: BriefingInfo = { createdAt: 1_000, startNowAt: 21_000, warnAt: 241_000, expiresAt: 301_000, ready: ["p2"], warned: false };
const players = [
  { id: "p1", displayName: "Ada", connected: true, presence: "connected" as const },
  { id: "p2", displayName: "Bea", connected: false, presence: "reconnecting" as const },
  { id: "p3", displayName: "Cal", connected: true, presence: "connected" as const },
  { id: "p4", displayName: "Dee", connected: false },
];

describe("D3 briefing helpers", () => {
  it("lists the roster in order with readiness and presence (no presence field = away when offline)", () => {
    const people = briefingPeople(["p1", "p2", "p3", "p4"], b, players, "p3");
    expect(people.map((p) => [p.name, p.ready, p.presence, p.you])).toEqual([
      ["Ada", false, "connected", false], ["Bea", true, "reconnecting", false], ["Cal", false, "connected", true], ["Dee", false, "away", false],
    ]);
  });

  it("the host's confirmation names everyone not ready or not connected, never the host (P2 modified)", () => {
    const people = briefingPeople(["p1", "p2", "p3", "p4"], b, players);
    expect(needsConfirmation(people, "p1").map((p) => p.id)).toEqual(["p2", "p3", "p4"]);
    expect(needsConfirmation(people, "p3").map((p) => p.id)).toEqual(["p1", "p2", "p4"]);
  });

  it("status lines say ready and the connection when it isn't live", () => {
    const [ada, bea, , dee] = briefingPeople(["p1", "p2", "p3", "p4"], b, players);
    expect(personStatus(ada!)).toBe("Not ready yet");
    expect(personStatus(bea!)).toBe("Ready · reconnecting");
    expect(personStatus(dee!)).toBe("Not ready yet · away");
  });

  it("time limits come from the policy the server enforces", () => {
    expect(timingLines({ gameWindowMs: 6 * 60_000 })).toEqual(["The whole game ends by itself after about 6 minutes."]);
    expect(timingLines({ gameWindowMs: 8 * 60_000, phaseMs: { question: 40_000 } })).toEqual(["40 seconds for each question.", "The whole game ends by itself after about 8 minutes."]);
    expect(timingLines({ gameWindowMs: 36_000 })).toEqual(["The whole game ends by itself after about 1 minute."]);
    expect(timingLines(undefined)).toEqual([]);
  });

  it("countdowns: Start now unlocks at startNowAt; the warning shows from warnAt or when the server says so", () => {
    expect(briefingClock(b, 11_000)).toEqual({ startNowInMs: 10_000, cancelInMs: 290_000, warning: false });
    expect(briefingClock(b, 241_000).warning).toBe(true);
    expect(briefingClock({ ...b, warned: true }, 100_000).warning).toBe(true);
    expect(briefingClock(b, 400_000)).toMatchObject({ startNowInMs: 0, cancelInMs: 0 });
  });

  it("rules reuse existing intro copy, else the game's registry line", () => {
    expect(briefingRules("word-connections", "x").objective).toBe("Find four groups of four.");
    expect(briefingRules("caption-clash", "x").steps).toHaveLength(3);
    expect(briefingRules("geography", "Flags, capitals…")).toEqual({ objective: "Flags, capitals…", steps: [] });
  });

  it("a timing-v2 game goes straight to play after its briefing: no second intro racing the clock", () => {
    const v1 = { id: "g1", gameId: "trivia", status: "playing", myAnswers: {}, myScore: 0 } as PlayerGame;
    expect(deriveShowPhase(v1, undefined, null, null, "p1")).toBe("intro");
    expect(deriveShowPhase({ ...v1, timingVersion: 2 }, undefined, null, null, "p1")).toBe("gameplay");
  });
});
