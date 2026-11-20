// D-AA-01, review 7040842858: the "Stay on this screen" choice is kept per room or solo session, seat and game
// instance, through remounts and reloads, and never leaks to another seat, room or game. The browser regression
// (scripts/check-quiz-advance.mjs, section P) checks the reload, remount and replay journeys in the real app.
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_GAMES, STAY_KEY, TTL_MS, clearStay, createStayStorage, readStay, resetStayStorageForTests, stayScope, stayStorage, writeStay, type StayStorage } from "./stayPreference.js";

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

/** A sessionStorage stand-in whose writes (or removes) can start failing, as a full quota or blocked data would. */
function flakyStorage() {
  const data = new Map<string, string>();
  const ctl = { failWrites: false, failRemoves: false };
  const storage: StayStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { if (ctl.failWrites) throw new DOMException("quota", "QuotaExceededError"); data.set(k, v); },
    removeItem: (k) => { if (ctl.failRemoves) throw new DOMException("blocked", "SecurityError"); data.delete(k); },
  };
  return { data, ctl, storage };
}
const G1 = { scope: "room:a", seat: "player-1", game: "game-1" };
const G2 = { ...G1, game: "game-2" };
const G3 = { ...G1, game: "game-3" };

describe("D-AA-01, review 7042658020: a later failed write never hides the newer Stay choice", () => {
  it("first write works; later writes fail with the old record still readable: the next game's Stay is true at once", () => {
    const real = flakyStorage();
    const s = createStayStorage(real.storage);
    writeStay(s, G1, 1000);
    expect(readStay(s, G1, 1500)).toBe(true);
    real.ctl.failWrites = true;
    writeStay(s, G2, 2000);
    expect(readStay(s, G2, 2001)).toBe(true); // was false: the older persistent record hid the in-memory one
    expect(readStay(s, G1, 2001)).toBe(true); // this seat's earlier game is kept in the same record
  });

  it("the newer choice survives a remount (a new reader of the same page store) and the stale persistent copy is gone", () => {
    const real = flakyStorage();
    const s = createStayStorage(real.storage);
    writeStay(s, G1, 1000);
    real.ctl.failWrites = true;
    writeStay(s, G2, 2000);
    expect(readStay(s, G2, 3000)).toBe(true);
    // The old record was removed from storage, so a reload cannot bring back an older choice in its place.
    expect(real.data.has(STAY_KEY)).toBe(false);
  });

  it("clearing, and switching seat or room, do not resurrect the fallback", () => {
    const real = flakyStorage();
    const s = createStayStorage(real.storage);
    writeStay(s, G1, 1000);
    real.ctl.failWrites = true;
    writeStay(s, G2, 2000);
    clearStay(s);
    expect(readStay(s, G2, 3000)).toBe(false);
    expect(readStay(s, G1, 3000)).toBe(false);
    writeStay(s, G2, 4000);
    expect(readStay(s, { ...G2, seat: "player-2" }, 4001)).toBe(false); // another seat: removed, not inherited
    expect(readStay(s, G2, 4002)).toBe(false);
    writeStay(s, G2, 5000);
    expect(readStay(s, { ...G2, scope: "room:b" }, 5001)).toBe(false); // another room
    expect(readStay(s, G2, 5002)).toBe(false);
  });

  it("when storage becomes writable again, the newest value stays authoritative and is persisted", () => {
    const real = flakyStorage();
    const s = createStayStorage(real.storage);
    writeStay(s, G1, 1000);
    real.ctl.failWrites = true;
    writeStay(s, G2, 2000);
    real.ctl.failWrites = false;
    writeStay(s, G3, 3000);
    expect(readStay(s, G3, 3001)).toBe(true);
    expect(readStay(s, G2, 3001)).toBe(true);
    // A reload (a fresh store over the same storage) reads the newest record, not an older one.
    const reloaded = createStayStorage(real.storage);
    expect(readStay(reloaded, G3, 3002)).toBe(true);
    expect(readStay(reloaded, G2, 3002)).toBe(true);
  });

  it("if even removing fails, this page still reads the newest choice from memory", () => {
    const real = flakyStorage();
    const s = createStayStorage(real.storage);
    writeStay(s, G1, 1000);
    real.ctl.failWrites = true;
    real.ctl.failRemoves = true;
    writeStay(s, G2, 2000);
    expect(readStay(s, G2, 2001)).toBe(true);
  });

  it("storage unavailable from the start (null) keeps choices in memory", () => {
    const s = createStayStorage(null);
    writeStay(s, G1, 1000);
    expect(readStay(s, G1, 1001)).toBe(true);
    clearStay(s);
    expect(readStay(s, G1, 1002)).toBe(false);
  });
});

