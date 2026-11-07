/**
 * Category Sprint source checks and draft batch 1 (owner direction 2026-11-07).
 *  - The comparison logic (scripts/content-quality/sprint-source-compare.ts).
 *  - Every committed source snapshot still agrees with its reference list, so a
 *    list edited without re-checking its source fails here.
 *  - No human source check or approval is recorded on anyone's behalf.
 *  - Draft categories stay practice-only and provisional, never reach official
 *    selection, and are exactly the lists their sources published.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { officialSprintSuitable } from "../src/content/closedSet.js";
import { DEFAULT_CONTENT_DIR, loadContent } from "../src/content/registry.js";
import type { ItemOf, SprintReference } from "../src/content/schema.js";
import { selectContent } from "../src/content/select.js";
import { matchSprintAnswer } from "../src/games/sprint.js";
import { compareMembership, type Crosswalk, type SourceSnapshot } from "../scripts/content-quality/sprint-source-compare.js";

type Sprint = ItemOf<"category-sprint">;
const root = join(DEFAULT_CONTENT_DIR, "..");
const snapDir = join(root, "docs", "content-quality-2", "sprint-sources");
const refDir = join(DEFAULT_CONTENT_DIR, "reference", "sprint");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const refs = readdirSync(refDir).filter((f) => f.endsWith(".json")).map((f) => readJson<SprintReference>(join(refDir, f)));
const crosswalk = readJson<Record<string, Crosswalk[]>>(join(snapDir, "crosswalk.json"));
const snap = (id: string) => readJson<SourceSnapshot & { blocked?: string }>(join(snapDir, `${id}.json`));
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
const sprintItems = (lib.byGame.get("category-sprint") ?? []).map((li) => li.item as Sprint);
const drafts = readJson<{ items: Sprint[] }>(join(DEFAULT_CONTENT_DIR, "packs", "category-sprint-closed-drafts.json")).items;

const S = (published: string[]): SourceSnapshot => ({ id: "t", authority: "t", fetchedAt: "2026-11-07", pages: [], extraction: "t", published });

describe("compareMembership", () => {
  it("classifies exact, spelling, alias and crosswalk matches", () => {
    const c = compareMembership({
      snapshot: S(["Kenya", "Côte D'Ivoire", "United Republic of Tanzania", "Congo DR"]),
      members: ["Kenya", "Côte d'Ivoire", "Tanzania", "DR Congo"], declaredCount: 4,
      aliases: { "united republic of tanzania": { to: "tanzania" } },
      crosswalk: [{ source: "Congo DR", member: "DR Congo", reason: "word order" }],
    });
    expect(c.matches.map((m) => m.kind)).toEqual(["exact", "spelling", "alias", "crosswalk"]);
    expect(c.verdict).toBe("matches source");
  });

  it("reports omissions, extras, collisions and a wrong declared count; a count alone never passes", () => {
    // Same count, different members: the case a count check misses.
    const swapped = compareMembership({ snapshot: S(["Kenya", "Ghana"]), members: ["Kenya", "Gahna"], declaredCount: 2 });
    expect(swapped.omissions).toEqual(["Ghana"]);
    expect(swapped.extras).toEqual(["Gahna"]);
    expect(swapped.verdict).toBe("differs from source");
    const twice = compareMembership({ snapshot: S(["Congo", "CONGO"]), members: ["Congo", "Chad"], declaredCount: 2 });
    expect(twice.collisions).toHaveLength(1);
    expect(twice.verdict).toBe("differs from source");
    expect(compareMembership({ snapshot: S(["A b"]), members: ["A b"], declaredCount: 2 }).verdict).toBe("differs from source");
  });
});

describe("committed source snapshots", () => {
  const items = new Map(sprintItems.map((i) => [i.membership?.reference, i]));
  const checked = refs.filter((r) => !snap(r.id).blocked);

  it("every reference list has a snapshot; only the Chinese zodiac is blocked", () => {
    for (const r of refs) expect(() => snap(r.id), r.id).not.toThrow();
    expect(refs.filter((r) => snap(r.id).blocked).map((r) => r.id)).toEqual(["chinese-zodiac"]);
  });

  it.each(checked.map((r) => [r.id, r] as const))("%s matches what its source published", (_id, r) => {
    const c = compareMembership({ snapshot: snap(r.id), members: r.members, declaredCount: r.source.publishedCount, aliases: items.get(r.id)?.aliases, crosswalk: crosswalk[r.id] });
    expect({ omissions: c.omissions, extras: c.extras, collisions: c.collisions }).toEqual({ omissions: [], extras: [], collisions: [] });
    expect(c.verdict).toBe("matches source");
  });

  it("records no human source check and no approval on anyone's behalf", () => {
    for (const r of refs) expect(r.sourceCheck, r.id).toBeUndefined();
    expect(readdirSync(DEFAULT_CONTENT_DIR)).not.toContain("approvals.json");
    for (const i of sprintItems) expect(i.review.status === "approved", i.id).toBe(false);
  });

  it("the Congo answers stay distinct and say which state they scored", () => {
    const africa = sprintItems.find((i) => i.id === "spr-cs-africa")!;
    expect(matchSprintAnswer(africa, "Congo")).toMatchObject({ kind: "valid", canonical: "congo" });
    expect(matchSprintAnswer(africa, "DRC")).toMatchObject({ kind: "valid", canonical: "democratic republic of the congo" });
    expect(matchSprintAnswer(africa, "Congo-Kinshasa")).toMatchObject({ kind: "valid", canonical: "democratic republic of the congo" });
    expect(matchSprintAnswer(africa, "Congo-Brazzaville")).toMatchObject({ kind: "valid", canonical: "congo" });
  });
});

describe("draft batch 1 (Asia, 2026 World Cup, NFL)", () => {
  it("is practice-only, provisional and tagged as an official candidate", () => {
    expect(drafts.map((d) => d.id)).toEqual(["spr-cs-asia", "spr-cs-wc2026", "spr-cs-nfl"]);
    for (const d of drafts) {
      expect(d.eligibility).toBe("practice");
      expect(d.review.status).toBe("provisional");
      expect(d.tags).toContain("official-candidate");
      expect(lib.problems.filter((p) => p.itemId === d.id)).toEqual([]);
      expect(sprintItems.map((i) => i.id)).toContain(d.id);
    }
  });

  it("never reaches official selection, even in test mode", () => {
    for (let seq = 0; seq < 40; seq++) {
      for (const players of [4, 7, 10]) {
        const r = selectContent({ lib, gameId: "category-sprint", count: 3, mode: "official", cupId: `cup-${seq}`, usage: {}, seq, today: "2026-11-07", sprint: { players, sizePolicy: 1 } });
        if (r.ok) for (const it of r.items) expect(drafts.map((d) => d.id)).not.toContain(it.item.id);
      }
    }
  });

  it("each draft's answers are exactly the canonical forms of its source list", () => {
    for (const d of drafts) {
      const s = snap(d.membership!.reference);
      expect(s.published.length).toBe(d.answers.length);
    }
    const wc = drafts.find((d) => d.id === "spr-cs-wc2026")!;
    expect(matchSprintAnswer(wc, "Korea Republic")).toMatchObject({ kind: "valid", canonical: "south korea" });
    expect(matchSprintAnswer(wc, "United Kingdom")).toMatchObject({ kind: "near-miss" });
    const nfl = drafts.find((d) => d.id === "spr-cs-nfl")!;
    expect(matchSprintAnswer(nfl, "49ers")).toMatchObject({ kind: "valid", canonical: "san francisco ers" });
    expect(matchSprintAnswer(nfl, "New York")).toMatchObject({ kind: "near-miss" });
    const asia = drafts.find((d) => d.id === "spr-cs-asia")!;
    expect(matchSprintAnswer(asia, "Korea")).toMatchObject({ kind: "near-miss" });
    expect(matchSprintAnswer(asia, "Burma")).toMatchObject({ kind: "valid", canonical: "myanmar" });
  });

  it("capacity if promoted: two official Sprint games for 4-8 players, still one for 9-10 (the honest limit)", () => {
    const official = sprintItems.filter((i) => i.eligibility === "official" || i.tags?.includes("official-candidate"));
    const games = (players: number, pool: Sprint[]) => Math.floor(pool.filter((i) => officialSprintSuitable(i, players).ok).length / 3);
    const today = sprintItems.filter((i) => i.eligibility === "official");
    expect([4, 5, 6, 7, 8, 9, 10].map((p) => games(p, today))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect([4, 5, 6, 7, 8, 9, 10].map((p) => games(p, official))).toEqual([2, 2, 2, 2, 2, 1, 1]);
  });
});
