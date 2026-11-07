/**
 * E10, the owner-approved part (2026-11-07): question-format metadata on the
 * library's quiz items, editorial content-mix warnings, and tests for
 * repetitive formats. NOT approved: activating the variety step, so the
 * selector must ignore the metadata entirely.
 */
import { describe, expect, it } from "vitest";
import { CONTENT_MIX, contentMixWarnings, lintLibrary } from "../src/content/lint.js";
import { DEFAULT_CONTENT_DIR, loadContent, type LoadedItem } from "../src/content/registry.js";
import { QUIZ_MECHANICS, TriviaItem } from "../src/content/schema.js";
import { selectContent } from "../src/content/select.js";
import { roundProblems } from "../scripts/content-quality/variety.js";

const QUIZ = ["trivia", "geography", "who-said-that"] as const;
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
const quizItems = QUIZ.flatMap((g) => lib.byGame.get(g) ?? []);
type Tagged = { mechanic?: string; negativeStem?: boolean };

/** Ten official-pool items copied from the real library, with formats set as given. */
function pool(mechanics: (string | undefined)[], extra: Partial<Tagged> = {}): LoadedItem[] {
  const base = (lib.byGame.get("trivia") ?? []).filter((li) => li.item.eligibility === "official" && li.status !== "rejected");
  return mechanics.map((m, i) => {
    const li = base[i]!;
    const item = { ...li.item, mechanic: m, ...extra } as typeof li.item;
    if (m === undefined) delete (item as Tagged).mechanic;
    return { ...li, item };
  });
}

describe("question-format metadata on the library", () => {
  it("every quiz item in use has a format, and the vocabulary is the pilot's", () => {
    expect(quizItems.length).toBeGreaterThan(200);
    for (const li of quizItems) {
      const m = (li.item as Tagged).mechanic;
      expect(QUIZ_MECHANICS as readonly string[], li.item.id).toContain(m);
    }
    const issues = lintLibrary(lib, "2026-11-07");
    expect(issues.filter((i) => i.code === "format-untagged")).toEqual([]);
  });

  it("the schema refuses an unknown format and a negativeStem other than true", () => {
    const one = (lib.byGame.get("trivia") ?? [])[0]!.item;
    expect(TriviaItem.safeParse({ ...one, mechanic: "riddle" }).success).toBe(false);
    expect(TriviaItem.safeParse({ ...one, negativeStem: false }).success).toBe(false);
    expect(TriviaItem.safeParse({ ...one, mechanic: "myth-buster", negativeStem: true }).success).toBe(true);
  });

  it("today's library is plain-heavy: no content-mix warning on any quiz game", () => {
    const issues = lintLibrary(lib, "2026-11-07").filter((i) => i.code === "content-mix");
    expect(issues).toEqual([]);
    const tally = new Map<string, number>();
    for (const li of quizItems) tally.set((li.item as Tagged).mechanic!, (tally.get((li.item as Tagged).mechanic!) ?? 0) + 1);
    expect(tally.get("recall")! + tally.get("recognition")!).toBeGreaterThan(quizItems.length * 0.8);
  });
});

describe("content-mix warnings (editor-facing)", () => {
  it(`warn when one twist format is over ${CONTENT_MIX.maxTwistShare * 100}% of a game's official pool`, () => {
    expect(contentMixWarnings(pool(["origin-story", "origin-story", ...Array(8).fill("recall")]))).toEqual([]);
    expect(contentMixWarnings(pool(["origin-story", "origin-story", "origin-story", ...Array(7).fill("recall")]))).toEqual([
      "'origin-story' is 3 of 10 official-pool items (30%; max 20%): rounds will repeat this format",
    ]);
  });

  it(`warn when quote twists together are over ${CONTENT_MIX.maxQuoteTwistShare * 100}%, and when negative stems are`, () => {
    expect(contentMixWarnings(pool(["never-said", "misquote", ...Array(8).fill("recognition")]))).toEqual([
      "quote twists are 2 of 10 official-pool items (20%; max 10%)",
    ]);
    const neg = pool(Array(10).fill("recall"));
    for (const li of neg.slice(0, 2)) (li.item as Tagged).negativeStem = true;
    expect(contentMixWarnings(neg)).toEqual(["negative stems are 2 of 10 official-pool items (20%; max 10%)"]);
  });

  it("plain formats are never a mix problem; tiny pools and practice items are not judged", () => {
    expect(contentMixWarnings(pool(Array(10).fill("deduction")))).toEqual([]);
    expect(contentMixWarnings(pool(["weird-but-true", "weird-but-true", "weird-but-true"]))).toEqual([]);
    const practice = pool(Array(10).fill("weird-but-true")).map((li) => ({ ...li, item: { ...li.item, eligibility: "practice" as const } }));
    expect(contentMixWarnings(practice)).toEqual([]);
  });

  it("the round rule still catches repetitive rounds built from tagged library items", () => {
    const items = pool(["origin-story", "recall", "origin-story", "recall", "origin-story"]).map((li) => ({ id: li.item.id, difficulty: li.item.difficulty, category: li.item.category, tags: { mechanic: (li.item as Tagged).mechanic } }));
    expect(roundProblems(items)).toEqual(["'origin-story' appears 3 times (max 2)"]);
  });
});

describe("E10 selection is not activated", () => {
  it("official and practice quiz selections are identical with and without the format metadata", () => {
    const stripped = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
    for (const g of QUIZ) for (const li of stripped.byGame.get(g) ?? []) { delete (li.item as Tagged).mechanic; delete (li.item as Tagged).negativeStem; }
    for (const g of QUIZ) for (const mode of ["official", "practice"] as const) for (let seq = 0; seq < 5; seq++) {
      const req = { gameId: g, count: 10, mode, cupId: "cup-e10", usage: {}, seq, today: "2026-11-07" };
      const a = selectContent({ lib, ...req });
      const b = selectContent({ lib: stripped, ...req });
      expect(a.ok, `${g} ${mode}`).toBe(b.ok);
      if (a.ok && b.ok) expect(a.items.map((x) => x.item.id)).toEqual(b.items.map((x) => x.item.id));
    }
  });
});
