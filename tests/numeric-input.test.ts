/**
 * E1 (Content Quality 2.0, owner-approved): numeric answers must be
 * enterable. Selection never picks an item whose answer the game's input
 * can't accept; earlier usage history and results are left exactly as they
 * were.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadContent } from "../src/content/registry.js";
import { answerEnterable, recordUsage, selectContent, type UsageHistory } from "../src/content/select.js";
import { NUMERIC_INPUT, parseNumericEntry, withinNumericInput } from "../src/shared/numericInput.js";
import { NUMERIC_INPUT_PROTOCOL, PROTOCOL_HEADER } from "../src/shared/clientProtocol.js";
import type { ClosestState } from "../src/games/closest.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

const lib = loadContent();
const TODAY = "2026-11-07";

describe("numeric input bounds", () => {
  it("accepts values inside the range at the allowed precision only", () => {
    const y = NUMERIC_INPUT["guess-the-year"];
    expect(withinNumericInput("guess-the-year", y.min)).toBe(true);
    expect(withinNumericInput("guess-the-year", y.max)).toBe(true);
    expect(withinNumericInput("guess-the-year", y.min - 1)).toBe(false);
    expect(withinNumericInput("guess-the-year", 1969.5)).toBe(false);
    expect(withinNumericInput("closest-wins", Number.NaN)).toBe(false);
    expect(withinNumericInput("closest-wins", -1)).toBe(false);
  });
});

describe("selection skips unenterable numeric items", () => {
  for (const gameId of ["closest-wins", "guess-the-year"] as const) {
    it(`${gameId}: no official or practice game ever gets an unenterable item`, () => {
      const usage: UsageHistory = {};
      let seq = 0;
      for (const mode of ["official", "practice"] as const) {
        for (let n = 0; n < 40; n++) {
          const r = selectContent({ roomKind: "cup", lib, gameId, count: 8, mode, cupId: "cup-e1", usage, seq: ++seq, today: TODAY });
          if (!r.ok) break;
          for (const li of r.items) expect(answerEnterable(li), li.item.id).toBe(true);
          recordUsage(usage, r.items, { gameInstanceId: `g${seq}`, day: 1, mode, seq });
        }
      }
    });
  }

  it("leaves recorded usage of an item untouched, even if it is now skipped", () => {
    const skipped = [...(lib.byGame.get("closest-wins") ?? []), ...(lib.byGame.get("guess-the-year") ?? [])].filter((li) => !answerEnterable(li));
    const usage: UsageHistory = {};
    for (const li of skipped) usage[li.item.id] = [{ gameInstanceId: "past", day: 1, mode: "official", seq: 1 }];
    const before = JSON.stringify(usage);
    selectContent({ roomKind: "cup", lib, gameId: "closest-wins", count: 8, mode: "practice", cupId: "cup-hist", usage, seq: 2, today: TODAY });
    selectContent({ roomKind: "cup", lib, gameId: "guess-the-year", count: 8, mode: "practice", cupId: "cup-hist", usage, seq: 3, today: TODAY });
    expect(JSON.stringify(usage)).toBe(before);
  });

  it("every shipped numeric item is enterable or explicitly skipped (the skip list is what the input can't take)", () => {
    for (const gameId of ["closest-wins", "guess-the-year"] as const) {
      for (const li of lib.byGame.get(gameId) ?? []) {
        const it = li.item as unknown as Record<string, number>;
        const v = gameId === "guess-the-year" ? it["year"]! : it["answer"]!;
        expect(answerEnterable(li)).toBe(withinNumericInput(gameId, v));
      }
    }
  });
});

describe("typed entry (what a phone keyboard produces)", () => {
  const ok = (g: "closest-wins" | "guess-the-year", t: string) => { const r = parseNumericEntry(g, t); return r.ok ? r.value : `ERR ${r.message}`; };
  it("reads grouping and decimal separators without clamping or rounding", () => {
    expect(ok("closest-wins", "5570")).toBe(5570);
    expect(ok("closest-wins", "5,570")).toBe(5570);
    expect(ok("closest-wins", "5 570")).toBe(5570);
    expect(ok("closest-wins", "2,419,200")).toBe(2419200);
    expect(ok("closest-wins", "42.195")).toBe(42.195);
    expect(ok("closest-wins", "42,5")).toBe(42.5);
    expect(ok("closest-wins", "1.234.567,8")).toBe(1234567.8);
    expect(ok("closest-wins", " 8.3 ")).toBe(8.3);
    expect(ok("guess-the-year", "1066")).toBe(1066);
    expect(ok("guess-the-year", "1889")).toBe(1889);
  });
  it("refuses, with a message, what it cannot represent exactly", () => {
    expect(ok("closest-wins", "")).toMatch(/^ERR/);
    expect(ok("closest-wins", "-5")).toMatch(/Negative/);
    expect(ok("closest-wins", "1.2345")).toMatch(/3 decimal places/);
    expect(ok("closest-wins", "12abc")).toMatch(/^ERR/);
    expect(ok("closest-wins", "2000000000000")).toMatch(/from 0 to/);
    expect(ok("guess-the-year", "1969.5")).toMatch(/Whole numbers/);
    expect(ok("guess-the-year", "999")).toMatch(/a year from 1000 to 2100/);
  });
  it("the game-wide ranges contain every year and quantity the content schema allows", () => {
    expect(NUMERIC_INPUT["guess-the-year"]).toMatchObject({ min: 1000, max: 2100 });
    expect(NUMERIC_INPUT["closest-wins"].decimals).toBeGreaterThanOrEqual(3);
  });
  it("after the fix, no shipped numeric item is skipped", () => {
    for (const g of ["closest-wins", "guess-the-year"] as const) for (const li of lib.byGame.get(g) ?? []) expect(answerEnterable(li), li.item.id).toBe(true);
  });
});

describe("server: numeric guesses are validated and outdated tabs are refused", () => {
  let h: Harness;
  beforeEach(async () => { h = await new Harness(undefined, { clock: new FakeClock() }).start(); await h.createRoom(); });
  afterEach(async () => { await h.dispose(); });
  const rawIntent = (p: Player, gid: string, action: string, payload: Json, protocol: string | null) => fetch(`${h.base}/rooms/${h.roomId}/intents`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-token": p.token, ...(protocol === null ? {} : { [PROTOCOL_HEADER]: protocol }) },
    body: JSON.stringify(h.intentBody(gid, action, payload)),
  }).then((r) => r.json() as Promise<Json>);

  it("Closest Wins accepts large and decimal guesses, refuses out-of-range ones", async () => {
    // Three players, so two guesses don't close the question.
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    const gid = (await h.startGame(ada!, "closest-wins", { seed: 3 })).body["gameId"] as string;
    expect(await h.intent(ada!, gid, "closest-guess", { value: -1 })).toMatchObject({ accepted: false, reason: "INVALID_GUESS" });
    expect(await h.intent(ada!, gid, "closest-guess", { value: 1.2345 })).toMatchObject({ accepted: false, reason: "INVALID_GUESS" });
    expect(await h.intent(ada!, gid, "closest-guess", { value: 2e12 })).toMatchObject({ accepted: false, reason: "INVALID_GUESS" });
    expect(await h.intent(ada!, gid, "closest-guess", { value: 86400 })).toMatchObject({ accepted: true });
    expect(await h.intent(bea!, gid, "closest-guess", { value: 42.195 })).toMatchObject({ accepted: true });
    const st = h.game(gid).extra as ClosestState;
    const q = st.questions[0]!;
    expect(st.guesses[q.id]).toEqual({ [ada!.playerId]: 86400, [bea!.playerId]: 42.195 });
  });

  it("Guess the Year accepts any whole year 1000–2100", async () => {
    const [ada] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada!, "guess-the-year", { seed: 3 })).body["gameId"] as string;
    const ev = (h.game(gid).extra as { events: { id: string }[] }).events;
    expect(await h.intent(ada!, gid, "year-guess", { eventId: ev[0]!.id, value: 999 })).toMatchObject({ accepted: false, reason: "INVALID_GUESS" });
    expect(await h.intent(ada!, gid, "year-guess", { eventId: ev[0]!.id, value: 1969.5 })).toMatchObject({ accepted: false, reason: "INVALID_GUESS" });
    expect(await h.intent(ada!, gid, "year-guess", { eventId: ev[0]!.id, value: 1066 })).toMatchObject({ accepted: true });
  });

  it("a tab older than the numeric-input protocol (or with none) can't submit a numeric guess", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada, "closest-wins", { seed: 3 })).body["gameId"] as string;
    expect(await rawIntent(ada, gid, "closest-guess", { value: 1000 }, "3")).toMatchObject({ accepted: false, reason: "CLIENT_OUTDATED" });
    expect(await rawIntent(ada, gid, "closest-guess", { value: 1000 }, null)).toMatchObject({ accepted: false, reason: "CLIENT_OUTDATED" });
    expect(await rawIntent(bea, gid, "closest-guess", { value: 5570 }, String(NUMERIC_INPUT_PROTOCOL))).toMatchObject({ accepted: true });
    // Nothing was recorded for the refused guesses.
    const st = h.game(gid).extra as ClosestState;
    expect(st.guesses[st.questions[0]!.id]).toEqual({ [bea.playerId]: 5570 });
  });
});
