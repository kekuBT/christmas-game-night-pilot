// Stage 12.1 (docs/stage12/stage121.md §3; D-S121-05): the TV's medal table, podium, Cup movement and day leader.
// Display only: pure functions over the public results every screen already shows.
import { describe, expect, it } from "vitest";
import { awardsMedals, cupPodium, cupRows, dayLeaderLine, medalTable, placesOf, podiumOf, type MedalGame } from "../apps/web/src/ui/mchezo/lib/medals.js";

const names: Record<string, string> = { a: "Ada", b: "Bea", c: "Cal", d: "Dee", e: "Eli" };
const nameOf = (id: string) => names[id] ?? id;
let n = 0;
const game = (rawScores: Record<string, number>, extra: Partial<MedalGame> = {}): MedalGame => ({ id: `g${++n}`, gameId: "math-mayhem", status: "finished", rawScores, ...extra });

describe("placesOf (one game's places and medals)", () => {
  it("shares a place on a tie and skips the next one, as a medal table does", () => {
    const p = placesOf({ a: 10, b: 10, c: 5, d: 1 });
    expect(p.map((x) => [x.playerId, x.rank, x.medal])).toEqual([["a", 1, "gold"], ["b", 1, "gold"], ["c", 3, "bronze"], ["d", 4, null]]);
  });
  it("a tie for second shares silver, and nobody gets bronze", () => {
    expect(placesOf({ a: 9, b: 4, c: 4, d: 2 }).map((x) => x.medal)).toEqual(["gold", "silver", "silver", null]);
  });
  it("no medal for a zero score; no medals when everyone tied or only one player scored", () => {
    expect(placesOf({ a: 10, b: 0, c: 0 }).map((x) => x.medal)).toEqual(["gold", null, null]);
    expect(placesOf({ a: 3, b: 3 }).every((x) => x.medal === null)).toBe(true);
    expect(placesOf({ a: 0, b: 0, c: 0 }).every((x) => x.medal === null)).toBe(true);
    expect(placesOf({ a: 7 }).every((x) => x.medal === null)).toBe(true);
    expect(placesOf(undefined)).toEqual([]);
  });
});

describe("medalTable (the night so far)", () => {
  it("accumulates across games and orders by golds, then silvers, then bronzes, then name", () => {
    const t = medalTable([
      game({ a: 10, b: 8, c: 6 }), // a gold, b silver, c bronze
      game({ b: 10, c: 8, a: 6 }), // b gold, c silver, a bronze
      game({ c: 10, d: 10, a: 1 }), // c and d gold, a bronze
    ], nameOf);
    expect(t.games).toBe(3);
    // Everyone has one gold; Bea and Cal have a silver, so they lead; Cal's bronze puts Cal first; Ada's bronzes beat Dee.
    expect(t.rows).toEqual([
      { playerId: "c", gold: 1, silver: 1, bronze: 1 },
      { playerId: "b", gold: 1, silver: 1, bronze: 0 },
      { playerId: "a", gold: 1, silver: 0, bronze: 2 },
      { playerId: "d", gold: 1, silver: 0, bronze: 0 },
    ]);
    expect(t.rows.map((r) => nameOf(r.playerId))).toEqual(["Cal", "Bea", "Ada", "Dee"]);
  });
  it("cooperative games, unfinished games, all-tied and one-player games award nothing and aren't counted", () => {
    const t = medalTable([
      game({ a: 30, b: 30 }, { gameId: "spectrum", outcome: { team: { total: 30, max: 40 } } }),
      game({ a: 10, b: 5 }, { status: "playing" }),
      game({ a: 4, b: 4 }),
      game({ a: 9 }),
    ], nameOf);
    expect(t).toEqual({ rows: [], games: 0 });
  });
  it("only the games `include` accepts (a Cup room's casual games)", () => {
    const g1 = game({ a: 10, b: 1 });
    const g2 = game({ b: 10, a: 1 });
    const t = medalTable([g1, g2], nameOf, (g) => g.id === g1.id);
    expect(t.games).toBe(1);
    expect(t.rows).toEqual([{ playerId: "a", gold: 1, silver: 0, bronze: 0 }, { playerId: "b", gold: 0, silver: 1, bronze: 0 }]);
  });
  it("the same results give the same table, whatever order the players' scores arrive in", () => {
    const x = medalTable([game({ a: 5, b: 9, e: 9 })], nameOf);
    const y = medalTable([game({ e: 9, a: 5, b: 9 })], nameOf);
    expect(x.rows).toEqual(y.rows);
    expect(x.rows.map((r) => r.playerId)).toEqual(["b", "e", "a"]);
  });
});

describe("podiumOf", () => {
  it("gold, silver, bronze steps; a shared first leaves silver empty rather than inventing a place", () => {
    expect(podiumOf(game({ a: 10, b: 7, c: 3 }))!.map((s) => [s.place, s.players.map((p) => p.playerId)])).toEqual([[1, ["a"]], [2, ["b"]], [3, ["c"]]]);
    expect(podiumOf(game({ a: 10, b: 10, c: 3 }))!.map((s) => s.players.map((p) => p.playerId))).toEqual([["a", "b"], [], ["c"]]);
  });
  it("two players: gold and silver, no bronze", () => {
    expect(podiumOf(game({ a: 10, b: 7 }))!.map((s) => s.players.length)).toEqual([1, 1, 0]);
  });
  it("none for a cooperative or all-tied game", () => {
    expect(podiumOf(game({ a: 1, b: 1 }))).toBeNull();
    expect(podiumOf(game({ a: 9, b: 3 }, { outcome: { team: { total: 1, max: 2 } } }))).toBeNull();
    expect(awardsMedals(game({ a: 9, b: 3 }))).toBe(true);
  });
});

describe("cupRows (Cup standings with movement)", () => {
  const before = [{ playerId: "a", total: 50, eligible: true }, { playerId: "b", total: 40, eligible: true }, { playerId: "c", total: 30, eligible: true }];
  it("movement against the earlier snapshot: up is positive, down negative, same is 0", () => {
    const after = [{ playerId: "b", total: 90, eligible: true }, { playerId: "a", total: 60, eligible: true }, { playerId: "c", total: 30, eligible: true }];
    expect(cupRows(after, before).map((r) => [r.playerId, r.rank, r.move])).toEqual([["b", 1, 1], ["a", 2, -1], ["c", 3, 0]]);
  });
  it("shared ranks on equal totals; a newcomer and a missing snapshot get no arrow", () => {
    const after = [{ playerId: "a", total: 60, eligible: true }, { playerId: "d", total: 60, eligible: false }, { playerId: "b", total: 40, eligible: true }];
    expect(cupRows(after, before).map((r) => [r.playerId, r.rank, r.move])).toEqual([["a", 1, 0], ["d", 1, null], ["b", 3, -1]]);
    expect(cupRows(after).every((r) => r.move === null)).toBe(true);
  });
});

describe("cupPodium (the director's Cup standings)", () => {
  it("a shared lead is a real result: everyone on the top total shares gold; nobody without points stands on it", () => {
    const tied = cupRows([{ playerId: "a", total: 50, eligible: true }, { playerId: "b", total: 50, eligible: true }, { playerId: "c", total: 50, eligible: true }]);
    expect(cupPodium(tied)!.map((s) => s.players.map((p) => p.playerId))).toEqual([["a", "b", "c"], [], []]);
    const spread = cupRows([{ playerId: "a", total: 90, eligible: true }, { playerId: "b", total: 40, eligible: true }, { playerId: "c", total: 0, eligible: false }]);
    expect(cupPodium(spread)!.map((s) => s.players.map((p) => p.playerId))).toEqual([["a"], ["b"], []]);
    expect(cupPodium(cupRows([{ playerId: "a", total: 0, eligible: false }]))).toBeNull();
    expect(cupPodium([])).toBeNull();
  });
});

describe("dayLeaderLine", () => {
  it("names the server's day winner(s), never a champion; the final day says 'leading on the final day'", () => {
    expect(dayLeaderLine({ day: 2, winner: "Ada", winners: ["Ada"] })).toBe("Ada is leading Day 2");
    expect(dayLeaderLine({ day: 3, winner: "Ada", winners: ["Ada", "Bea"] })).toBe("Ada and Bea are leading Day 3");
    expect(dayLeaderLine({ day: 7, winner: "Cal", winners: ["Cal"] })).toBe("Cal is leading on the final day");
    expect(dayLeaderLine({ day: 1, winner: null, winners: [] })).toBeNull();
    expect(dayLeaderLine(undefined)).toBeNull();
  });
});

describe("the TV feed and modes (Stage 12.1)", () => {
  it("a Cup room's feed carries its ceremony and its casual-era games; a casual room's never does", async () => {
    const { tvFeedFrom } = await import("../apps/web/src/ui/mchezo/lib/tvfeed.js");
    const base = { roomId: "r", joinCode: "ABC123", players: [], games: [], me: { id: "a" }, myGames: [{ id: "g", state: { word: "SECRET" } }], ceremony: { day: 1, winner: "Ada", winners: ["Ada"], standings: [] } };
    const cup = tvFeedFrom({ ...base, roomKind: "cup", cupSince: { at: 1, seq: 9 }, casualGameIds: ["g1"] } as never);
    expect([cup.cup, cup.ceremony?.winner, cup.casualGameIds, cup.cupSince?.seq]).toEqual([true, "Ada", ["g1"], 9]);
    expect(JSON.stringify(cup)).not.toContain("SECRET");
    const casual = tvFeedFrom({ ...base, roomKind: "casual" } as never);
    expect([casual.cup, casual.ceremony, casual.casualGameIds]).toEqual([undefined, undefined, undefined]);
  });
  it("mode words: Official; Casual for a casual room's games and a Cup room's games from before it was a Cup; else Practice", async () => {
    const { gameModeWord } = await import("../apps/web/src/ui/mchezo/lib/tvfeed.js");
    expect(gameModeWord({ id: "g1", official: true }, { casualGameIds: ["g1"] })).toBe("Official");
    expect(gameModeWord({ id: "g1", official: false }, { casualGameIds: ["g1"] })).toBe("Casual");
    expect(gameModeWord({ id: "g2", official: false }, { casualGameIds: ["g1"] })).toBe("Practice");
    expect(gameModeWord({ id: "g2", official: false }, { casual: true })).toBe("Casual");
  });
  it("the Cup view and the trophy show between games only: a briefing or a live game always takes the screen", async () => {
    const { tvModeFor } = await import("../apps/web/src/ui/mchezo/lib/tvfeed.js");
    const g = (status: string) => ({ id: "g", gameId: "math-mayhem", official: true, status, timedOut: false, players: [] }) as never;
    expect(tvModeFor(undefined, "cup")).toBe("cup");
    expect(tvModeFor(g("finished"), "trophy")).toBe("trophy");
    expect(tvModeFor(g("playing"), "trophy")).toBe("live");
    expect(tvModeFor(g("briefing"), "cup")).toBe("briefing");
  });
});
