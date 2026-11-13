// Stage 10.5 (D-S105-03, D-S105-04): the pure rules that keep one page's Memory Book current
// (apps/web/src/ui/mchezo/lib/bookSync.ts): what a page does with revisions it hears and snapshots it gets back.
import { describe, expect, it } from "vitest";
import { accept, exportIsStale, exportStep, freshSync, hear, isBookSnapshot, NOTHING } from "../apps/web/src/ui/mchezo/lib/bookSync.js";
import type { MemoryEntry } from "../apps/web/src/types.js";

const entry = (id: string, approved = false): MemoryEntry => ({ id, day: 1, text: id, sourceEventIds: ["evt-1"], approved, derivedFacts: [] });
const snap = (revision: number, ...entries: MemoryEntry[]) => ({ revision, entries });

describe("bookSync: hearing revisions", () => {
  it("a new page has heard nothing and shows nothing; any revision (0 included) puts it behind", () => {
    const s = freshSync("room-a");
    expect([s.heard, s.applied]).toEqual([NOTHING, NOTHING]);
    expect(hear(s, 0)).toBe(true);
    expect(s.heard).toBe(0);
  });
  it("the heard revision only rises: a late or repeated notice never lowers it", () => {
    const s = freshSync("room-a");
    hear(s, 5); hear(s, 3); hear(s, 5);
    expect(s.heard).toBe(5);
  });
  it("junk is ignored: not a number, negative, fractional", () => {
    const s = freshSync("room-a");
    for (const bad of [undefined, null, "7", -1, 2.5, Number.NaN]) expect(hear(s, bad)).toBe(false);
    expect(s.heard).toBe(NOTHING);
  });
  it("a newer revision heard while a fetch runs marks one more fetch; an old one doesn't", () => {
    const s = freshSync("room-a");
    hear(s, 1);
    s.inFlight = true;
    hear(s, 1);
    expect(s.again).toBe(false);
    hear(s, 2);
    expect(s.again).toBe(true);
  });
});

describe("bookSync: accepting snapshots", () => {
  it("applies only a newer snapshot for this page's room", () => {
    const s = freshSync("room-a");
    expect(accept(s, "room-a", snap(2, entry("book-1")))).toBe(true);
    expect(s.applied).toBe(2);
    expect(accept(s, "room-a", snap(2, entry("book-1")))).toBe(false); // the same revision again
    expect(accept(s, "room-a", snap(1))).toBe(false); // older
    expect(accept(s, "room-b", snap(9, entry("x")))).toBe(false); // another room's reply
    expect(s.applied).toBe(2);
  });
  it("reordered replies: the newer one wins whichever arrives first", () => {
    const s = freshSync("room-a");
    hear(s, 4);
    expect(accept(s, "room-a", snap(4, entry("book-1", true)))).toBe(true); // the later request answered first
    expect(accept(s, "room-a", snap(3, entry("book-1")))).toBe(false); // the earlier one, late
    expect(s.applied).toBe(4);
  });
  it("a snapshot counts as hearing its revision, so the page isn't left thinking it's behind", () => {
    const s = freshSync("room-a");
    hear(s, 1);
    accept(s, "room-a", snap(3));
    expect(s.heard).toBe(3);
    expect(hear(s, 3)).toBe(false);
  });
  it("isBookSnapshot: the authoritative shape only (not the plain list)", () => {
    expect(isBookSnapshot(snap(0))).toBe(true);
    expect(isBookSnapshot([entry("book-1")])).toBe(false);
    expect(isBookSnapshot({ revision: -1, entries: [] })).toBe(false);
    expect(isBookSnapshot({ revision: 1.5, entries: [] })).toBe(false);
    expect(isBookSnapshot({ revision: 1 })).toBe(false);
    expect(isBookSnapshot(null)).toBe(false);
  });
});

describe("bookSync: exports", () => {
  it("a snapshot at or past everything heard is used; behind it, fetch again up to three times, then cancel", () => {
    expect(exportStep(3, 3, 1)).toBe("use");
    expect(exportStep(4, 3, 1)).toBe("use");
    expect(exportStep(2, 3, 1)).toBe("retry");
    expect(exportStep(2, 3, 2)).toBe("retry");
    expect(exportStep(2, 3, 3)).toBe("cancel");
  });
  it("the Markdown on screen is stale once the page knows of a newer book (heard or shown)", () => {
    expect(exportIsStale(3, { heard: 3, applied: 3 })).toBe(false);
    expect(exportIsStale(3, { heard: 4, applied: 3 })).toBe(true);
    expect(exportIsStale(3, { heard: 3, applied: 4 })).toBe(true);
  });
});
