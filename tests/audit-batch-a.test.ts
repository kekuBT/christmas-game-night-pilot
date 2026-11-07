/**
 * Audit Batch A (Content Quality 2.0, owner direction 2026-11-07): factual
 * and mechanical corrections applied as a reviewable change. Retired items
 * keep their ids (Cup usage history and past results stay valid) and are
 * never selected again; every edited Connections board still has exactly
 * one solution; nothing is approved.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent, officialEligible } from "../src/content/registry.js";
import { recordUsage, selectContent, type UsageHistory } from "../src/content/select.js";
import { connectionsSolutions } from "../scripts/content-quality/pilot-lib.js";

const lib = loadContent();
const TODAY = "2026-11-07";
const RETIRED = ["trv-hist-038", "geo-s4-026", "trv-hist-129", "year-s4-006", "year-s4-014", "year-s4-016", "year-s4-020", "year-s4-042", "year-s4-043", "trv-lang-053", "trv-geog-028", "geo-s4-042", "cls-k-13", "cls-k-26"];
const EDITED_BOARDS = ["con-legacy-1", "con-s4-05", "con-s4-12", "con-s4-02"];
const overlaps = (JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "..", "docs", "content-quality-2", "audit-verdicts.json"), "utf8")) as { connectionsOverlaps: Record<string, Record<string, string[]>> }).connectionsOverlaps;

describe("Audit Batch A corrections", () => {
  it("the library still loads cleanly and every Batch A id still exists", () => {
    expect(lib.problems).toEqual([]);
    for (const id of [...RETIRED, ...EDITED_BOARDS, "trv-scie-125", "spr-s4-011", "spr-s4-004", "year-s4-044"]) expect(lib.items.has(id), id).toBe(true);
  });

  it("retired items are 'rejected' with a reason, and nothing was approved", () => {
    for (const id of RETIRED) {
      const li = lib.items.get(id)!;
      expect(li.status).toBe("rejected");
      expect(li.item.review.notes).toMatch(/Audit Batch A, objective defect/);
    }
    for (const li of lib.items.values()) if (/Audit Batch A/.test(li.item.review.notes ?? "")) expect(li.status).not.toBe("approved");
  });

  it("retired items are never selected, in official or practice games", () => {
    for (const gameId of ["trivia", "geography", "guess-the-year", "closest-wins"] as const) {
      const usage: UsageHistory = {};
      let seq = 0;
      for (const mode of ["official", "practice"] as const) for (let i = 0; i < 12; i++) {
        const r = selectContent({ lib, gameId, count: 5, mode, cupId: "cup-batch-a", usage, seq: ++seq, today: TODAY });
        if (!r.ok) continue;
        for (const li of r.items) expect(RETIRED, `${gameId} ${mode} picked ${li.item.id}`).not.toContain(li.item.id);
        recordUsage(usage, r.items, { gameInstanceId: `g${seq}`, day: 1, mode, seq });
      }
    }
  });

  it("past usage of a retired item is left untouched (Cup history compatibility)", () => {
    const usage: UsageHistory = {};
    for (const id of RETIRED) usage[id] = [{ gameInstanceId: "past-cup-game", day: 1, mode: "official", seq: 1 }];
    const before = JSON.stringify(usage);
    for (const gameId of ["trivia", "geography", "guess-the-year", "closest-wins"] as const) {
      const r = selectContent({ lib, gameId, count: 5, mode: "official", cupId: "cup-old", usage, seq: 2, today: TODAY });
      expect(r.ok).toBe(true);
    }
    expect(JSON.stringify(usage)).toBe(before);
  });

  it("every edited Connections board has exactly one solution (declared overlaps)", () => {
    for (const id of EDITED_BOARDS) {
      const groups = (lib.items.get(id)!.item as unknown as { groups: { name: string; words: string[] }[] }).groups;
      expect(connectionsSolutions(groups, overlaps[id] ?? {}).length, id).toBe(1);
    }
  });

  it("A1: both candidate fixes are unique by counting, so the choice of 'Sleet' is editorial (precise label), not a solver result", () => {
    const groups = (lib.items.get("con-legacy-1")!.item as unknown as { groups: { name: string; words: string[] }[] }).groups.map((g) => ({ ...g, words: [...g.words] }));
    const winter = groups.find((g) => g.name === "Winter weather")!;
    winter.name = "Winter words";
    winter.words = winter.words.map((w) => (w === "Sleet" ? "Icicle" : w));
    const also: Record<string, string[]> = { ...overlaps["con-legacy-1"] };
    for (const g of groups) if (g.name !== "Winter words" && g.name !== "Reindeer names") for (const w of g.words) also[w] = [...(also[w] ?? []), "Winter words"];
    // Counting still forces one solution, but every food and decoration would honestly fit "Winter words":
    // a catch-all label the solver cannot judge. Hence the minimal factual fix (Sleet) under the precise label.
    expect(connectionsSolutions(groups, also).length).toBe(1);
  });

  it("the legacy board keeps its status, so official Connections still has a board", () => {
    const li = lib.items.get("con-legacy-1")!;
    expect(li.status).toBe("legacy");
    expect(officialEligible(li, TODAY)).toBe(true);
    expect((li.item as unknown as { groups: { words: string[] }[] }).groups.flatMap((g) => g.words)).not.toContain("Icicle");
  });

  it("A8 and A17 corrections are present", () => {
    expect((lib.items.get("trv-scie-125")!.item as unknown as { options: string[] }).options).toContain("Electron cloud");
    expect((lib.items.get("trv-scie-125")!.item as unknown as { options: string[] }).options).not.toContain("Proton cloud");
    expect((lib.items.get("spr-s4-011")!.item as unknown as { answers: string[] }).answers).toContain("chicken");
    expect((lib.items.get("spr-s4-004")!.item as unknown as { answers: string[] }).answers).toEqual(expect.arrayContaining(["eggplant", "zucchini"]));
  });
});
