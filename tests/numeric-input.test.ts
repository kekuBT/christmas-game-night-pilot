/**
 * E1 (Content Quality 2.0, owner-approved): numeric answers must be
 * enterable. Selection never picks an item whose answer the game's input
 * can't accept; earlier usage history and results are left exactly as they
 * were.
 */
import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/registry.js";
import { answerEnterable, recordUsage, selectContent, type UsageHistory } from "../src/content/select.js";
import { NUMERIC_INPUT, withinNumericInput } from "../src/shared/numericInput.js";

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
          const r = selectContent({ lib, gameId, count: 8, mode, cupId: "cup-e1", usage, seq: ++seq, today: TODAY });
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
    selectContent({ lib, gameId: "closest-wins", count: 8, mode: "practice", cupId: "cup-hist", usage, seq: 2, today: TODAY });
    selectContent({ lib, gameId: "guess-the-year", count: 8, mode: "practice", cupId: "cup-hist", usage, seq: 3, today: TODAY });
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
