/**
 * Stage 7.2 client helpers (docs/stage7/stage72.md §3.5–3.6): what comes
 * next after a casual game, the TV's public line for it, and the Casual
 * wording (a Cup's practice games keep theirs).
 */
import { describe, expect, it } from "vitest";
import { nextState } from "../apps/web/src/components/mchezo/whatsNextState.js";
import { lineupLine, tvFeedFrom } from "../apps/web/src/ui/mchezo/lib/tvfeed.js";
import { outcomeLines } from "../apps/web/src/ui/mchezo/lib/lifecycle.js";
import { QUIPS, resultsStory } from "../apps/web/src/ui/mchezo/lib/celebrate.js";
import type { PartyView, Projection } from "../apps/web/src/types.js";

type Lineup = NonNullable<PartyView["lineup"]>;
const lineup = (statuses: ("pending" | "briefing" | "playing" | "completed")[], next: number | null): Lineup => ({
  expectedPlayers: 2, budgetMinutes: 30, estimateMinutes: 20, transitionMinutes: 2, updatedAt: 1,
  items: statuses.map((status, i) => ({ gameId: i === 0 ? "math-mayhem" : "trivia", started: status !== "pending", status })),
  next, complete: statuses.every((s) => s === "completed"),
});
const titleOf = (id: string) => (id === "trivia" ? "Trivia Showdown" : "Math Mayhem");

describe("what's next", () => {
  it("a break wins; then the lineup's next item; a complete lineup; otherwise the host's free choice", () => {
    expect(nextState(lineup(["completed", "pending"], 1), true)).toEqual({ state: "break" });
    expect(nextState(lineup(["completed", "pending"], 1), false)).toEqual({ state: "next", index: 1 });
    expect(nextState(lineup(["completed", "completed"], null), false)).toEqual({ state: "complete" });
    expect(nextState(lineup(["completed", "playing"], null), false)).toEqual({ state: "free" }); // an item is on: not offered again
    expect(nextState(undefined, false)).toEqual({ state: "free" });
  });

  it("the TV's line says the same, in public words only", () => {
    expect(lineupLine({ party: { revision: 1, lineup: lineup(["completed", "pending"], 1) }, session: { onBreak: false, revision: 2 } }, titleOf))
      .toEqual({ kind: "next", text: "Next up: Trivia Showdown · game 2 of 2. The host starts it." });
    expect(lineupLine({ party: { revision: 1, lineup: lineup(["completed", "completed"], null) } }, titleOf)?.kind).toBe("complete");
    expect(lineupLine({ party: { revision: 1, lineup: lineup(["completed", "pending"], 1) }, session: { onBreak: true, revision: 3 } }, titleOf)?.kind).toBe("break");
    expect(lineupLine({}, titleOf)).toBeNull();
  });

  it("the TV feed carries a casual room's lineup and break; a Cup's lineup only (Stage 12.3), never a break or a player's own state", () => {
    const base = { roomId: "r", joinCode: "ABC123", players: [], games: [], party: { revision: 1, lineup: lineup(["pending"], 0) }, session: { onBreak: true, revision: 4 }, me: { id: "a" }, myGames: [{ id: "g" }] };
    const casual = tvFeedFrom({ ...base, roomKind: "casual" } as unknown as Projection);
    expect([casual.casual, casual.party?.revision, casual.session?.onBreak]).toEqual([true, 1, true]);
    expect(Object.keys(casual)).not.toContain("me");
    const cup = tvFeedFrom({ ...base, roomKind: "cup" } as unknown as Projection);
    // Stage 12.3 (D-S123-01): a Family Cup's lineup is on the TV too; a Cup never has a break, and it isn't casual.
    expect([cup.casual, cup.party?.revision, cup.session]).toEqual([undefined, 1, undefined]);
    expect(Object.keys(cup)).not.toContain("me");
  });
});

describe("Casual wording", () => {
  it("a casual game's outcome line and results lines are Casual; a Cup's practice game keeps Practice", () => {
    const o = { reason: "completed" as const, endedAt: 1, countsOfficially: false, participation: {} };
    expect(outcomeLines(o, false, true)?.counts).toBe("Casual game: just for fun.");
    expect(outcomeLines(o, false)?.counts).toMatch(/^Practice game/);
    const facts = { gameInstanceId: "g-1", title: "T", official: false, scores: { a: 300, b: 200 }, nameOf: (id: string) => id };
    expect(QUIPS.casual).toContain(resultsStory({ ...facts, casual: true }).quip);
    expect(QUIPS.practice).toContain(resultsStory(facts).quip);
  });
});
