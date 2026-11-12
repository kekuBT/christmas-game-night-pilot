// Stage 10.1 repair (review 6828948844, S101-R3; D-S101-13): check-jebena-rush's reconnect checks look only at
// breaks logged after a cursor, never at the page's whole history, and never erase it. These are the helpers the
// driver uses (scripts/lib/break-log.mjs), on the reviewer's ordering: a cup of Amina's broke live (her own row and
// the seat list) before her phone dropped.
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs driver helper, no type declarations
import { cursorOf, newSeatBreaks, since } from "../scripts/lib/break-log.mjs";

interface Ev { n: number; surface: string; seat: string; slot: number; cups: number; anim: string; t: number }
const AMINA = "player-2";
const KEKU = "player-1";
let t = 1_794_499_600_000;
const ev = (n: number, surface: string, seat: string, slot: number): Ev => ({ n, surface, seat, slot, cups: slot, anim: "mz-cini-tip", t: (t += 1000) });

/** Amina's phone, as the reviewer's run had it: her slot 2 broke live on her own row and in the seat list, then Keku's slot 2. */
function priorLog(): Ev[] {
  return [ev(0, "hud", AMINA, 2), ev(1, "seat", AMINA, 2), ev(2, "seat", KEKU, 2)];
}

describe("break-log cursors (S101-R3)", () => {
  it("the old lifetime check rejects the reviewer's ordering: her earlier, legitimate breaks look like a replay", () => {
    const log = priorLog();
    expect(log.filter((e) => e.seat === AMINA)).toHaveLength(2); // what scripts/check-jebena-rush.mjs:599 counted
  });

  it("a prior own break on the HUD and the seat list doesn't fail the reconnect check", () => {
    const log = priorLog();
    const cursor = cursorOf(log); // taken just before her phone drops
    expect(cursor).toBe(3);
    // Offline: her slot 1 is lost while she's away. Back online, the resync shows it broken without breaking it.
    expect(newSeatBreaks(log, cursor, AMINA)).toEqual([]);
    expect(newSeatBreaks(log, cursor, AMINA, 1)).toEqual([]);
  });

  it("a newly replayed break of her seat still fails, on her own row or the seat list", () => {
    for (const surface of ["hud", "seat"]) {
      const log = priorLog();
      const cursor = cursorOf(log);
      log.push(ev(3, surface, AMINA, 1)); // the resync animated the loss she never saw
      const replayed = newSeatBreaks(log, cursor, AMINA);
      expect(replayed, surface).toHaveLength(1);
      expect(replayed[0]).toMatchObject({ surface, seat: AMINA, slot: 1 });
      expect(newSeatBreaks(log, cursor, AMINA, 1), surface).toHaveLength(1); // the lost slot, too
    }
  });

  it("a replayed break of an earlier slot after the cursor still fails (any slot of her seat counts)", () => {
    const log = priorLog();
    const cursor = cursorOf(log);
    log.push(ev(3, "hud", AMINA, 2)); // slot 2 breaking a second time
    expect(newSeatBreaks(log, cursor, AMINA)).toHaveLength(1);
  });

  it("other seats' live breaks after the cursor don't count against her", () => {
    const log = priorLog();
    const cursor = cursorOf(log);
    log.push(ev(3, "seat", KEKU, 1));
    expect(newSeatBreaks(log, cursor, AMINA)).toEqual([]);
    expect(since(log, cursor)).toHaveLength(1);
  });

  it("taking a cursor never erases the history the end-of-match checks need", () => {
    const log = priorLog();
    const before = JSON.stringify(log);
    const cursor = cursorOf(log);
    since(log, cursor);
    newSeatBreaks(log, cursor, AMINA);
    expect(JSON.stringify(log)).toBe(before);
    expect(since(log, 0)).toHaveLength(3); // the whole match, for "every break a real lost life, once"
  });

  it("cursors are event numbers, not positions: an empty log starts at 0, and order on the page is kept", () => {
    expect(cursorOf([])).toBe(0);
    const log = priorLog();
    expect((since(log, 1) as Ev[]).map((e) => e.n)).toEqual([1, 2]);
    expect(cursorOf([ev(5, "hud", AMINA, 0), ev(4, "seat", AMINA, 0)])).toBe(6);
  });
});
