// D-AA-01, review 7040842858: the "Stay on this screen" choice is kept per room or solo session, seat and game
// instance, through remounts and reloads, and never leaks to another seat, room or game. The browser regression
// (scripts/check-quiz-advance.mjs, section P) checks the reload, remount and replay journeys in the real app.
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_GAMES, STAY_KEY, TTL_MS, clearStay, readStay, resetStayStorageForTests, stayScope, stayStorage, writeStay, type StayStorage } from "./stayPreference.js";

function mapStorage(): StayStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const throwing: StayStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};
const A = { scope: "room:room-a", seat: "player-1", game: "game-3" };

describe("D-AA-01: the Stay choice (stayPreference)", () => {
  beforeEach(() => resetStayStorageForTests());

  it("scopes say room or solo, and an unknown room stores nothing", () => {
    expect(stayScope("room-a", false)).toBe("room:room-a");
    expect(stayScope("room-a", true)).toBe("solo:room-a");
    expect(stayScope("", false)).toBe("");
    const s = mapStorage();
    writeStay(s, { ...A, scope: "" });
    expect(s.data.size).toBe(0);
    expect(readStay(s, { ...A, scope: "" })).toBe(false);
  });

  it("a choice is read back for the same room, seat and game (what a reload or remount sees)", () => {
    const s = mapStorage();
    expect(readStay(s, A)).toBe(false);
    writeStay(s, A, 1000);
    expect(readStay(s, A, 2000)).toBe(true);
  });

  it("a new game or Play again (another game instance) counts down again", () => {
    const s = mapStorage();
    writeStay(s, A, 1000);
    expect(readStay(s, { ...A, game: "game-4" }, 2000)).toBe(false);
    expect(readStay(s, A, 2000)).toBe(true);
  });

  it("another seat or room never inherits it, and its read removes the stale record", () => {
    const s = mapStorage();
    writeStay(s, A, 1000);
    expect(readStay(s, { ...A, seat: "player-2" }, 2000)).toBe(false);
    expect(s.data.has(STAY_KEY)).toBe(false);
    writeStay(s, A, 1000);
    expect(readStay(s, { ...A, scope: "room:room-b" }, 2000)).toBe(false);
    expect(s.data.has(STAY_KEY)).toBe(false);
    writeStay(s, A, 1000);
    expect(readStay(s, { ...A, scope: "solo:room-a" }, 2000)).toBe(false);
  });

  it("a write for another seat replaces the record (no other seat's games are kept)", () => {
    const s = mapStorage();
    writeStay(s, A, 1000);
    writeStay(s, { ...A, seat: "player-2", game: "game-9" }, 2000);
    const rec = JSON.parse(s.data.get(STAY_KEY)!);
    expect(rec).toEqual({ v: 1, scope: "room:room-a", seat: "player-2", games: { "game-9": 2000 } });
  });

  it("retention is bounded: at most MAX_GAMES games, each for at most TTL_MS", () => {
    const s = mapStorage();
    for (let i = 0; i < MAX_GAMES + 5; i++) writeStay(s, { ...A, game: `game-${i}` }, 1000 + i);
    const rec = JSON.parse(s.data.get(STAY_KEY)!);
    expect(Object.keys(rec.games)).toHaveLength(MAX_GAMES);
    expect(rec.games[`game-${MAX_GAMES + 4}`]).toBeDefined();
    expect(rec.games["game-0"]).toBeUndefined();
    writeStay(s, A, 0);
    expect(readStay(s, A, TTL_MS - 1)).toBe(true);
    expect(readStay(s, A, TTL_MS)).toBe(false);
  });

  it("the record holds only ids and times: no answers, names, tokens or recovery codes", () => {
    const s = mapStorage();
    writeStay(s, A, 1234);
    expect(JSON.parse(s.data.get(STAY_KEY)!)).toEqual({ v: 1, scope: "room:room-a", seat: "player-1", games: { "game-3": 1234 } });
  });

  it("a malformed or foreign record is ignored and removed", () => {
    for (const raw of ["not json", JSON.stringify({ v: 2 }), JSON.stringify({ v: 1, scope: 1, seat: "x", games: {} }), JSON.stringify({ v: 1, scope: "room:room-a", seat: "player-1", games: { "game-3": "yes" } })]) {
      const s = mapStorage();
      s.data.set(STAY_KEY, raw);
      expect(readStay(s, A, 2000), raw).toBe(false);
    }
  });

  it("storage that throws never breaks the screen: reads say no, writes are dropped", () => {
    expect(readStay(throwing, A)).toBe(false);
    expect(() => writeStay(throwing, A)).not.toThrow();
    expect(() => clearStay(throwing)).not.toThrow();
  });

  it("without sessionStorage (this test has no window), the page's storage keeps the choice in memory", () => {
    const st = stayStorage();
    writeStay(st, A, 1000);
    expect(readStay(stayStorage(), A, 2000)).toBe(true);
    clearStay();
    expect(readStay(stayStorage(), A, 2000)).toBe(false);
  });
});
