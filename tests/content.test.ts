/**
 * Sprint 4, CP2: content packs, validation and editorial status.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent, officialEligible, practiceUsable, itemHash } from "../src/content/registry.js";
import { lintLibrary, inventory, evalFormula } from "../src/content/lint.js";

const TODAY = "2026-11-06";
const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id, difficulty: 1, category: "Test", language: "en", eligibility: "official",
  review: { status: "provisional" }, source: { kind: "common-knowledge" }, tags: [], ...extra,
});
function libWith(packs: { gameId: string; items: unknown[] }[], approvals?: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "mz-content-"));
  mkdirSync(join(dir, "packs"));
  packs.forEach((p, i) => writeFileSync(join(dir, "packs", `p${i}.json`), JSON.stringify({ schemaVersion: 1, packId: `p${i}`, gameId: p.gameId, version: "1.0.0", title: "t", language: "en", items: p.items })));
  if (approvals) writeFileSync(join(dir, "approvals.json"), JSON.stringify(approvals));
  return { dir, lib: loadContent(dir) };
}
const trivia = (id: string, extra: Record<string, unknown> = {}) => base(id, { prompt: `What is item ${id}?`, options: ["A", "B", "C", "D"], answer: "B", explanation: "Because.", ...extra });
const codes = (lib: ReturnType<typeof loadContent>) => lintLibrary(lib, TODAY).map((i) => `${i.level}:${i.itemId}:${i.code}`);

describe("the shipped content", () => {
  const lib = loadContent();
  const issues = lintLibrary(lib, TODAY);
  it("loads with no problems and no lint errors", () => {
    expect(lib.problems).toEqual([]);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
  it("covers every content-driven game", () => {
    expect([...lib.byGame.keys()].sort()).toEqual(["caption-clash", "category-sprint", "charades", "closest-wins", "geography", "guess-the-year", "impostor", "trivia", "who-said-that", "word-connections"]);
  });
  it("nothing authored is official without a human or a computation behind it", () => {
    for (const li of lib.items.values()) {
      if (officialEligible(li, TODAY)) expect(["approved", "verified-computed", "legacy"]).toContain(li.status);
      if (li.status === "provisional") expect(officialEligible(li, TODAY)).toBe(false);
    }
  });
  it("the inventory adds up", () => {
    for (const r of inventory(lib, issues, TODAY)) {
      expect(r.approved + r.computed + r.legacy + r.provisional + r.rejected).toBe(r.total);
      expect(r.official + r.practiceOnly + r.rejected).toBe(r.total);
    }
  });
  it("the web app never imports content (answers stay on the server)", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    walk(join(__dirname, "..", "apps", "web", "src"));
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/src\/content\/|content\/packs|from "\.\.\/.*content\/(registry|schema)/);
  });
});

describe("validation and lint catch real mistakes", () => {
  it("rejects malformed items and packs without crashing, and reports them", () => {
    const { lib } = libWith([
      { gameId: "trivia", items: [trivia("trv-ok"), { id: "trv-bad", prompt: "x" }, trivia("trv-ok")] },
      { gameId: "nonsense", items: [] },
    ]);
    expect([...lib.items.keys()]).toEqual(["trv-ok"]);
    expect(lib.problems.map((p) => p.itemId ?? p.file)).toEqual(expect.arrayContaining(["trv-bad", "trv-ok", "p1.json"]));
  });
  it("multiple-choice: the answer must be exactly one option; options must differ", () => {
    const { lib } = libWith([{ gameId: "trivia", items: [trivia("trv-a", { answer: "E" }), trivia("trv-b", { options: ["A", "b", "C", "B"] })] }]);
    const c = codes(lib);
    expect(c).toContain("error:trv-a:answer-not-an-option");
    expect(c).toContain("error:trv-b:duplicate-options");
  });
  it("Connections: 16 distinct words, levels 1-4 once each", () => {
    const g = (name: string, words: string[], level: number) => ({ name, words, level });
    const { lib } = libWith([{ gameId: "word-connections", items: [base("con-x", { groups: [g("A", ["a", "b", "c", "d"], 1), g("B", ["e", "f", "g", "a"], 2), g("C", ["h", "i", "j", "k"], 2), g("D", ["l", "m", "n", "o"], 4)] })] }]);
    expect(codes(lib)).toEqual(expect.arrayContaining(["error:con-x:duplicate-words", "error:con-x:levels"]));
  });
  it("verified-computed must recompute; 'approved' can't be written into a pack", () => {
    const { lib } = libWith([
      { gameId: "closest-wins", items: [
        base("cls-good", { review: { status: "verified-computed" }, prompt: "Minutes in a day?", unit: "minutes", answer: 1440, formula: "24 * 60", explanation: "24 × 60." }),
        base("cls-bad", { review: { status: "verified-computed" }, prompt: "Seconds in an hour?", unit: "seconds", answer: 3000, formula: "60 * 60", explanation: "60 × 60." }),
      ] },
      { gameId: "trivia", items: [trivia("trv-self", { review: { status: "approved" } })] },
    ]);
    const c = codes(lib);
    expect(c).not.toContain("error:cls-good:formula-mismatch");
    expect(c).toContain("error:cls-bad:formula-mismatch");
    expect(c).toContain("error:trv-self:approved-in-file");
    expect(evalFormula("(365 * 4 + 1) * 24")).toBe(35064);
  });
  it("time-sensitive facts stop being official after their review date", () => {
    const { lib } = libWith([{ gameId: "trivia", items: [
      trivia("trv-old", { review: { status: "legacy" }, timeSensitive: { asOf: "2024-01-01", reviewBy: "2025-01-01" } }),
      trivia("trv-new", { review: { status: "legacy" }, timeSensitive: { asOf: "2026-01-01", reviewBy: "2027-06-01" } }),
    ] }]);
    expect(officialEligible(lib.items.get("trv-old")!, TODAY)).toBe(false);
    expect(officialEligible(lib.items.get("trv-new")!, TODAY)).toBe(true);
    expect(codes(lib)).toContain("warn:trv-old:stale");
  });
  it("flags near-duplicates, unclear wording and possibly time-sensitive facts for an editor", () => {
    const { lib } = libWith([{ gameId: "trivia", items: [
      trivia("trv-1", { prompt: "Which planet is known as the Red Planet?" }),
      trivia("trv-2", { prompt: "Which planet is commonly known as the Red Planet?" }),
      trivia("trv-3", { prompt: "Which of these is NOT a mammal?" }),
      trivia("trv-4", { prompt: "Who is the current world chess champion?" }),
    ] }]);
    const c = codes(lib);
    expect(c).toEqual(expect.arrayContaining(["warn:trv-2:near-duplicate", "warn:trv-3:negative-wording", "warn:trv-4:maybe-time-sensitive"]));
  });
});

describe("editorial approval is a human act, bound to the exact item", () => {
  it("an approval with the item's hash makes it approved (official); editing the item voids it", () => {
    const item = trivia("trv-rev");
    const hash = itemHash("trivia", item as never);
    const ok = libWith([{ gameId: "trivia", items: [item] }], { schemaVersion: 1, approvals: [{ itemId: "trv-rev", hash, reviewer: "Keku", date: "2026-11-06" }] });
    const li = ok.lib.items.get("trv-rev")!;
    expect(li.status).toBe("approved");
    expect(li.approval).toEqual({ reviewer: "Keku", date: "2026-11-06" });
    expect(officialEligible(li, TODAY)).toBe(true);
    const edited = libWith([{ gameId: "trivia", items: [{ ...item, answer: "C" }] }], { schemaVersion: 1, approvals: [{ itemId: "trv-rev", hash, reviewer: "Keku", date: "2026-11-06" }] });
    expect(edited.lib.items.get("trv-rev")!.status).toBe("provisional");
    expect(edited.lib.problems[0]!.message).toMatch(/edited since approval/);
  });
  it("the review note itself is not part of the hash (editors can annotate without voiding approval)", () => {
    const a = trivia("trv-h");
    expect(itemHash("trivia", a as never)).toBe(itemHash("trivia", { ...a, review: { status: "provisional", notes: "checked" } } as never));
  });
  it("provisional items are practice-only; rejected items are never used", () => {
    const { lib } = libWith([{ gameId: "trivia", items: [trivia("trv-p"), trivia("trv-r", { review: { status: "rejected" }, prompt: "Something else entirely?" })] }]);
    expect(officialEligible(lib.items.get("trv-p")!, TODAY)).toBe(false);
    expect(practiceUsable(lib.items.get("trv-p")!)).toBe(true);
    expect(practiceUsable(lib.items.get("trv-r")!)).toBe(false);
  });
});
