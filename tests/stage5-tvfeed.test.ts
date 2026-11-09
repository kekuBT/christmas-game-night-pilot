/**
 * Stage 5 (S5-A): the TV show is drawn from the public feed only, its mode
 * label is unambiguous, and its headline comes from recorded scores.
 */
import { describe, expect, it } from "vitest";
import { tvFeedFrom, tvModeFor, winnerLine } from "../apps/web/src/ui/mchezo/lib/tvfeed.js";
import type { Projection, PublicGame } from "../apps/web/src/types.js";

const game = (status: PublicGame["status"], extra: Partial<PublicGame> = {}): PublicGame => ({ id: "g1", gameId: "math-mayhem", official: false, status, players: ["a", "b"], ...extra }) as PublicGame;

describe("tvFeedFrom", () => {
  it("never carries the viewer's own seat or private game state", () => {
    const proj = {
      roomId: "r1", joinCode: "ABC123", name: "Room", players: [], games: [game("playing")], officialStandings: {}, seq: 3,
      me: { id: "a", displayName: "Ada", isHost: true, isCohost: false },
      myGames: [{ id: "g1", gameId: "impostor", status: "playing", state: { word: "SECRET-WORD" } }],
      recoveryRequests: [{ id: "x" }],
    } as unknown as Projection;
    const feed = tvFeedFrom(proj);
    const text = JSON.stringify(feed);
    expect(text).not.toContain("SECRET-WORD");
    expect(Object.keys(feed)).not.toContain("me");
    expect(Object.keys(feed)).not.toContain("myGames");
    expect(Object.keys(feed)).not.toContain("recoveryRequests");
    expect(feed.joinCode).toBe("ABC123");
  });
});

describe("tvModeFor", () => {
  it("lobby with no game; briefing and live always win over a local choice", () => {
    expect(tvModeFor(undefined, "auto")).toBe("lobby");
    expect(tvModeFor(game("briefing"), "review")).toBe("briefing");
    expect(tvModeFor(game("playing"), "lobby")).toBe("live");
    expect(tvModeFor(game("playing"), "review")).toBe("live"); // a look back can never hide live play
  });
  it("a finished game opens on its final standings; review and lobby only by choice", () => {
    expect(tvModeFor(game("finished"), "auto")).toBe("final");
    expect(tvModeFor(game("finished"), "review")).toBe("review");
    expect(tvModeFor(game("finished"), "lobby")).toBe("lobby");
  });
});

describe("winnerLine", () => {
  const nameOf = (id: string) => ({ a: "Ada", b: "Bea", c: "Cal" })[id] ?? id;
  it("names one winner, a shared first place, an all-way tie and nobody scoring", () => {
    expect(winnerLine({ a: 300, b: 100 }, nameOf)).toBe("Ada wins");
    expect(winnerLine({ a: 300, b: 300, c: 100 }, nameOf)).toBe("Ada and Bea tie for first");
    expect(winnerLine({ a: 200, b: 200, c: 200 }, nameOf)).toBe("Everyone tied");
    expect(winnerLine({ a: 0, b: 0 }, nameOf)).toBe("Nobody scored this time");
    expect(winnerLine({}, nameOf)).toBe("No scores were recorded");
  });
});
