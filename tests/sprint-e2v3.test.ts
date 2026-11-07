/**
 * E2 v3 Category Sprint (owner-approved 2026-11-07, with corrections):
 * closed-set-only official play, category-scoped aliases, canonical duplicate
 * protection, versioned matching, membership verified against a published
 * list, a provisional size policy by player count, NO fallback when nothing
 * suits the room, rules frozen at game start, and older Cups/games unchanged.
 */
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  editDistance, matchSprintAnswer, normalizeSprintAnswer, normalizeSprintAnswerV2, reviewSprintRound, scoreSprintRound, type SprintCategory,
} from "../src/games/sprint.js";
import { officialSprintSuitable, sprintItemProblems, sprintMinimumSize } from "../src/content/closedSet.js";
import { DEFAULT_CONTENT_DIR, itemHash, loadContent, type LoadedItem } from "../src/content/registry.js";
import { selectContent, type UsageHistory } from "../src/content/select.js";
import type { ItemOf, SprintReference } from "../src/content/schema.js";
import { ContentShortage, RoomEngine } from "../src/server/room.js";
import { minimumSuitableSize } from "../scripts/content-quality/sprint-sim.js";

type Json = Record<string, unknown>;
type SprintItem = ItemOf<"category-sprint">;
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
const sprintItems = () => lib.byGame.get("category-sprint")!;
const byId = (id: string) => lib.items.get(id)! as LoadedItem<"category-sprint">;
const cat = (id: string): SprintCategory => {
  const it = byId(id).item;
  return { name: it.name, answers: it.answers, ...(it.aliases ? { aliases: it.aliases } : {}), ...(it.knownNotAccepted ? { knownNotAccepted: it.knownNotAccepted } : {}) };
};
const zodiac = () => cat("spr-cs-chinese-zodiac");

describe("normalisation v2 (generic: never changes meaning)", () => {
  it.each([
    ["go-kart", "go kart"],
    ["Côte d'Ivoire", "cote d ivoire"],
    ["The Netherlands", "netherlands"],
    ["  São  Tomé & Príncipe ", "sao tome and principe"],
    ["Washington, D.C.", "washington dc"],
    ["the", "the"],
    ["Guinea-Bissau", "guinea bissau"],
  ])("%s -> %s", (raw, out) => expect(normalizeSprintAnswerV2(raw)).toBe(out));

  it("v1 normalisation is unchanged (old games are scored exactly as before)", () => {
    expect(normalizeSprintAnswer("Go-Kart!")).toBe("gokart");
    expect(normalizeSprintAnswer(" The  Netherlands ")).toBe("the netherlands");
  });
});

describe("matcher v2: category-scoped aliases", () => {
  it("sheep is the zodiac Goat, but stays sheep in a farm-animal list that has both", () => {
    expect(matchSprintAnswer(zodiac(), "Sheep")).toMatchObject({ kind: "valid", canonical: "goat", via: "alias" });
    const farm: SprintCategory = { name: "Farm animals", answers: ["cow", "goat", "horse", "pig", "sheep", "chicken", "duck", "donkey", "llama", "turkey"] };
    expect(matchSprintAnswer(farm, "Sheep")).toMatchObject({ kind: "valid", canonical: "sheep", via: "exact" });
    expect(matchSprintAnswer(farm, "Goat")).toMatchObject({ kind: "valid", canonical: "goat" });
    // And a category with neither alias nor member never borrows the zodiac's.
    expect(matchSprintAnswer(cat("spr-cs-us-states"), "sheep").kind).toBe("not-on-list");
  });

  it("an alias cannot score twice: goat + sheep from one player count once", () => {
    const { scores, reviews } = reviewSprintRound(zodiac(), { a: ["goat", "sheep", "ram"] }, 2);
    expect(scores["a"]).toBe(40); // one valid answer, and nobody else gave it
    expect(reviews["a"]!.map((r) => r.verdict)).toEqual(["unique", "repeat", "repeat"]);
  });

  it("uniqueness is decided on canonical answers (aubergine is not unique next to eggplant)", () => {
    const veg: SprintCategory = { name: "Veg", answers: ["eggplant", "zucchini", "carrot", "leek", "onion", "pea", "bean", "kale", "beet", "corn"], aliases: { aubergine: { to: "eggplant", reason: "British name" } } };
    expect(scoreSprintRound(veg, { a: ["eggplant"], b: ["Aubergine"] }, 2)).toEqual({ a: 20, b: 20 });
    expect(scoreSprintRound(veg, { a: ["eggplant"], b: ["carrot"] }, 2)).toEqual({ a: 40, b: 40 });
  });

  it("cat and buffalo are explained near-misses in the Chinese zodiac (Vietnamese zodiac)", () => {
    const m = matchSprintAnswer(zodiac(), "Cat");
    expect(m).toMatchObject({ kind: "near-miss" });
    expect((m as { reason: string }).reason).toMatch(/Vietnamese/);
    expect(matchSprintAnswer(zodiac(), "cats")).toMatchObject({ kind: "near-miss" });
    expect(matchSprintAnswer(zodiac(), "buffalo")).toMatchObject({ kind: "near-miss" });
    expect(scoreSprintRound(zodiac(), { a: ["cat", "buffalo"] }, 2)).toEqual({ a: 0 });
  });

  it("plurals fold only onto a listed answer", () => {
    expect(matchSprintAnswer(zodiac(), "Tigers")).toMatchObject({ kind: "valid", canonical: "tiger", via: "plural" });
    expect(matchSprintAnswer(zodiac(), "Roosters")).toMatchObject({ canonical: "rooster" });
    expect(matchSprintAnswer(cat("spr-cs-us-states"), "Texas")).toMatchObject({ canonical: "texas", via: "exact" });
    expect(matchSprintAnswer(cat("spr-cs-us-states"), "Kansas")).toMatchObject({ canonical: "kansas", via: "exact" });
  });
});

describe("matcher v2: typo guard", () => {
  const countries: SprintCategory = { name: "c", answers: ["iran", "iraq", "venezuela", "colombia", "gambia", "zambia", "niger", "nigeria", "austria", "australia"] };
  const animals: SprintCategory = { name: "a", answers: ["mouse", "moose", "horse", "zebra", "camel", "tiger", "otter", "panda", "koala", "llama"] };
  it("Venezuala matches Venezuela; Columbia matches Colombia", () => {
    expect(matchSprintAnswer(countries, "Venezuala")).toMatchObject({ kind: "valid", canonical: "venezuela", via: "typo" });
    expect(matchSprintAnswer(countries, "Columbia")).toMatchObject({ canonical: "colombia", via: "typo" });
  });
  it("short words never merge: mouse/moose and Iran/Iraq stay distinct", () => {
    expect(matchSprintAnswer(animals, "moose")).toMatchObject({ canonical: "moose", via: "exact" });
    expect(matchSprintAnswer(animals, "mosue").kind).toBe("not-on-list");
    expect(matchSprintAnswer(countries, "Irak").kind).toBe("not-on-list");
    expect(matchSprintAnswer(countries, "Iran")).toMatchObject({ canonical: "iran" });
  });
  it("a typo between two members is rejected, not guessed", () => {
    // "zambie" is one edit from zambia but only two from gambia.
    expect(matchSprintAnswer(countries, "zambie").kind).toBe("not-on-list");
    // "nigera" is one edit from nigeria and two from niger.
    expect(matchSprintAnswer(countries, "nigera").kind).toBe("not-on-list");
  });
  it("typo tolerance can be switched off per category", () => {
    expect(matchSprintAnswer({ ...countries, typoTolerance: false }, "Venezuala").kind).toBe("not-on-list");
  });
  it("edit distance counts a neighbour swap as one edit", () => {
    expect(editDistance("venezuela", "venezuela")).toBe(0);
    expect(editDistance("cmaera", "camera")).toBe(1);
  });
});

describe("matcher v1 is preserved for games that recorded it", () => {
  it("v1 accepts only exact normalised members: no aliases, no typos, no plural folding", () => {
    const z = zodiac();
    expect(scoreSprintRound(z, { a: ["Sheep", "Tigers", "Dragon!"] }, 1)).toEqual({ a: 40 });
    expect(scoreSprintRound(z, { a: ["Sheep", "Tigers", "Dragon!"] })).toEqual({ a: 40 }); // default is v1
    expect(scoreSprintRound(z, { a: ["Sheep", "Tigers", "Dragon!"] }, 2)).toEqual({ a: 120 });
  });
  it("only the first five answers count in both versions", () => {
    const answers = ["rat", "ox", "tiger", "rabbit", "dragon", "snake"];
    for (const v of [1, 2] as const) expect(scoreSprintRound(zodiac(), { a: answers }, v)).toEqual({ a: 200 });
    expect(reviewSprintRound(zodiac(), { a: answers }, 2).reviews["a"]![5]).toMatchObject({ verdict: "over-limit" });
  });
});

describe("closed-set membership is verified against its published list, not counted", () => {
  const closed = () => sprintItems().filter((li) => (li.item as SprintItem).closedSet);
  it("the shipped library loads with no problems and every closed set matches its reference exactly", () => {
    expect(lib.problems).toEqual([]);
    expect(closed().map((li) => li.item.id).sort()).toEqual(["spr-cs-africa", "spr-cs-asia", "spr-cs-chinese-zodiac", "spr-cs-elements", "spr-cs-eu-members", "spr-cs-nfl", "spr-cs-planets", "spr-cs-south-america", "spr-cs-us-states", "spr-cs-wc2026"]);
    for (const li of closed()) {
      const it = li.item as SprintItem;
      const ref = lib.sprintReferences.get(it.membership!.reference)!;
      expect(sprintItemProblems(it, ref)).toEqual([]);
      expect(new Set(it.answers)).toEqual(new Set(ref.members.map(normalizeSprintAnswerV2)));
      expect(ref.members).toHaveLength(ref.source.publishedCount);
    }
  });

  it("the right size with a wrong member fails (a count check alone would pass it)", () => {
    const it = structuredClone(byId("spr-cs-us-states").item);
    const ref = lib.sprintReferences.get("us-states")!;
    it.answers = it.answers.map((a) => (a === "vermont" ? "vermount" : a));
    expect(it.answers).toHaveLength(50);
    const problems = sprintItemProblems(it, ref);
    expect(problems.join(" ")).toMatch(/missing members of "us-states": vermont/);
    expect(problems.join(" ")).toMatch(/answers not in "us-states": vermount/);
  });

  it("a reference that does not hold its authority's published count fails", () => {
    const ref: SprintReference = structuredClone(lib.sprintReferences.get("eu-member-states")!);
    ref.members = ref.members.filter((m) => m !== "Malta");
    const it = structuredClone(byId("spr-cs-eu-members").item);
    it.answers = it.answers.filter((a) => a !== "malta");
    expect(sprintItemProblems(it, ref).join(" ")).toMatch(/lists 26 members but its source publishes 27/);
  });

  it("alias rules: points to a member, is never itself a member, never a near-miss", () => {
    const base = structuredClone(byId("spr-cs-chinese-zodiac").item);
    const ref = lib.sprintReferences.get("chinese-zodiac")!;
    const bad = (patch: Partial<SprintItem>) => sprintItemProblems({ ...base, ...patch } as SprintItem, ref).join(" ");
    expect(bad({ aliases: { sheep: { to: "lamb", reason: "x" } } })).toMatch(/not an accepted answer/);
    expect(bad({ aliases: { goat: { to: "goat", reason: "x" } } })).toMatch(/is itself an accepted answer/);
    expect(bad({ aliases: { cat: { to: "rabbit", reason: "x" } } })).toMatch(/both an alias and a known non-answer/);
    expect(bad({ aliases: { "Sheep!": { to: "goat", reason: "x" } } })).toMatch(/not in normalised form/);
    expect(bad({ knownNotAccepted: { goat: "x" } })).toMatch(/known non-answer "goat" is an accepted answer/);
    expect(bad({ definition: undefined })).toMatch(/needs a definition/);
  });

  function tempContent(mutate: (dir: string) => void): string {
    const dir = mkdtempSync(join(tmpdir(), "mz-e2-"));
    cpSync(DEFAULT_CONTENT_DIR, dir, { recursive: true });
    mutate(dir);
    return dir;
  }
  const packFile = (dir: string) => join(dir, "packs", "category-sprint-closed.json");

  it("an item whose list drifts from its reference never loads (problem reported, item skipped)", () => {
    const dir = tempContent((d) => {
      const pack = JSON.parse(readFileSync(packFile(d), "utf8")) as { items: Json[] };
      const us = pack.items.find((i) => i["id"] === "spr-cs-us-states")!;
      us["answers"] = (us["answers"] as string[]).map((a) => (a === "ohio" ? "ohioo" : a));
      writeFileSync(packFile(d), JSON.stringify(pack));
    });
    const l = loadContent(dir, { testApproveProvisional: true });
    expect(l.items.has("spr-cs-us-states")).toBe(false);
    expect(l.problems.find((p) => p.itemId === "spr-cs-us-states")?.message).toMatch(/missing members/);
  });

  it("a real approval of a closed set is refused until a person records a source check", () => {
    const approve = (d: string) => {
      const it = (JSON.parse(readFileSync(packFile(d), "utf8")) as { items: Json[] }).items.find((i) => i["id"] === "spr-cs-us-states")!;
      writeFileSync(join(d, "approvals.json"), JSON.stringify({ schemaVersion: 1, approvals: [{ itemId: "spr-cs-us-states", hash: itemHash("category-sprint", it), reviewer: "Fixture Reviewer", date: "2026-11-07" }] }));
    };
    const unchecked = loadContent(tempContent(approve));
    expect(unchecked.items.get("spr-cs-us-states")!.status).toBe("provisional");
    expect(unchecked.problems.find((p) => p.itemId === "spr-cs-us-states")?.message).toMatch(/no recorded source check/);
    const checked = loadContent(tempContent((d) => {
      approve(d);
      const f = join(d, "reference", "sprint", "us-states.json");
      const ref = JSON.parse(readFileSync(f, "utf8")) as Json;
      ref["sourceCheck"] = { by: "Fixture Reviewer", date: "2026-11-07", url: "https://www.census.gov/" };
      writeFileSync(f, JSON.stringify(ref));
    }));
    expect(checked.problems).toEqual([]);
    expect(checked.items.get("spr-cs-us-states")!.status).toBe("approved");
  });

  it("no shipped reference claims a source check yet (none was done in this environment)", () => {
    for (const ref of lib.sprintReferences.values()) expect(ref.sourceCheck).toBeUndefined();
  });
});

describe("size policy (provisional): max(15, 4 x players), with obscure-tail and dominant rules", () => {
  it.each([[4, 16], [5, 20], [6, 24], [7, 28], [8, 32], [9, 36], [10, 40]])("famous-first, %i players -> %i members", (p, n) => {
    expect(sprintMinimumSize(p, "famous-first")).toBe(n);
    expect(sprintMinimumSize(p, "even")).toBe(n);
  });
  it("obscure-tail needs 35+ and dominant follows its simulated row", () => {
    expect([4, 7, 10].map((p) => sprintMinimumSize(p, "obscure-tail"))).toEqual([35, 35, 40]);
    expect([4, 6, 7, 8, 10].map((p) => sprintMinimumSize(p, "dominant"))).toEqual([18, 24, 35, 50, 118]);
  });
  it("the rule is never looser than the simulation's minimum for famous-first recall", () => {
    const sizes = [12, 13, 15, 16, 18, 20, 24, 27, 28, 30, 32, 35, 36, 40, 45, 50];
    for (let p = 4; p <= 10; p++) {
      const sim = minimumSuitableSize(p, 1.0, 0.25, sizes, 1500);
      expect(sim).not.toBeNull();
      expect(sprintMinimumSize(p, "famous-first")).toBeGreaterThanOrEqual(sim!);
    }
  });
  it("approved example verdicts hold for the shipped categories", () => {
    const ok = (id: string, p: number) => officialSprintSuitable(byId(id).item, p).ok;
    for (let p = 4; p <= 10; p++) {
      expect(ok("spr-cs-south-america", p)).toBe(false);
      expect(ok("spr-cs-chinese-zodiac", p)).toBe(false);
      expect(ok("spr-cs-planets", p)).toBe(false);
      expect(ok("spr-cs-us-states", p)).toBe(true);
      expect(ok("spr-cs-africa", p)).toBe(true);
      expect(ok("spr-cs-elements", p)).toBe(true);
      expect(ok("spr-s4-001", p)).toBe(false); // open category: practice only
    }
    expect([4, 5, 6, 7].map((p) => ok("spr-cs-eu-members", p))).toEqual([true, true, true, false]);
  });
  it("an obscure-tail set without a 'typical player can name 10' estimate is not official", () => {
    const it = { ...byId("spr-cs-africa").item, typicalRecall: 6 };
    expect(officialSprintSuitable(it, 4)).toMatchObject({ ok: false, why: expect.stringMatching(/name at least 10/) });
  });
});

describe("selection: closed sets suited to the room, and no fallback", () => {
  const req = (players: number, usage: UsageHistory = {}, mode: "official" | "practice" = "official") => selectContent({
    lib, gameId: "category-sprint", count: 3, mode, cupId: "cup-e2v3-test", usage, seq: 0, today: "2026-11-07", sprint: { players, sizePolicy: 1 },
  });
  it("official games use only suitable closed sets, chosen at game start for the roster size", () => {
    for (let p = 4; p <= 10; p++) {
      const r = req(p);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const li of r.items) expect(officialSprintSuitable(li.item as SprintItem, p).ok).toBe(true);
    }
    const seven = new Set<string>();
    for (let seq = 0; seq < 20; seq++) {
      const r = selectContent({ lib, gameId: "category-sprint", count: 3, mode: "official", cupId: `cup-${seq}`, usage: {}, seq, today: "2026-11-07", sprint: { players: 7, sizePolicy: 1 } });
      if (r.ok) r.items.forEach((li) => seven.add(li.item.id));
    }
    expect(seven).toEqual(new Set(["spr-cs-us-states", "spr-cs-africa", "spr-cs-elements"]));
  });

  it("when no suitable category is left, the game is refused with a practice offer; nothing smaller is substituted", () => {
    const first = req(4);
    expect(first.ok).toBe(true);
    const usage: UsageHistory = {};
    if (first.ok) for (const li of first.items) usage[li.item.id] = [{ gameInstanceId: "g1", day: 1, mode: "official", seq: 0 }];
    const second = req(4, usage);
    expect(second).toMatchObject({ ok: false, reason: "no-suitable-category", available: 1, needed: 3 });
    expect((second as { message: string }).message).toMatch(/practice/i);
    // Practice still works and may use any non-rejected category.
    expect(req(4, usage, "practice").ok).toBe(true);
  });

  it("without E2 v3 rules (older Cups) selection is unchanged", () => {
    const r = selectContent({ lib, gameId: "category-sprint", count: 3, mode: "official", cupId: "cup-old", usage: {}, seq: 0, today: "2026-11-07" });
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------- the room
const intent = (roomId: string, gid: string, action: string, payload: Json) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });
function room(n: number) {
  const engine = new RoomEngine("E2 Cup");
  engine.content = lib;
  const ids = [engine.join("Ada", { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
  return { engine, ids, host: ids[0]! };
}
const withLib = (e: RoomEngine) => { e.content = lib; return e; };
type Extra = { matcherVersion?: number; eligibility?: { players: number; sizePolicy: number }; categories: SprintCategory[]; roundIndex: number };
const myState = (engine: RoomEngine, pid: string, gid: string) => {
  const proj = engine.project("player", pid) as Json;
  const games = (proj["myGames"] ?? []) as Json[];
  return games.find((g) => g["id"] === gid)?.["state"] as Json | undefined;
};

describe("room: rules frozen per Cup and per game", () => {
  it("a new Cup records the E2 v3 rules, and official games snapshot matcher v2 and the roster size", () => {
    const { engine, host } = room(5);
    expect((engine.toJSON()["cup"] as Json)["categorySprint"]).toEqual({ matcher: 2, sizePolicy: 1 });
    const g = engine.startGame(host, "category-sprint", { official: true, seed: 3 });
    const ex = g.extra as Extra;
    expect(ex.matcherVersion).toBe(2);
    expect(ex.eligibility).toEqual({ players: 5, sizePolicy: 1 });
    expect(ex.categories.every((c) => c.definition && c.answers.length >= 20)).toBe(true);
  });

  it("aliases, typos and near-misses score through the room under v2, and each player sees only their own verdicts", () => {
    const { engine, host, ids } = room(4);
    const g = engine.startGame(host, "category-sprint", { official: true, seed: 3 });
    const ex = g.extra as Extra;
    const sample = (c: SprintCategory) => c.answers.slice(0, 2);
    for (let r = 0; r < 3; r++) {
      const c = ex.categories[r]!;
      const [a, b] = sample(c) as [string, string];
      engine.submitIntent(intent(engine.id, g.id, "sprint-answers", { answers: [a.toUpperCase(), b, "definitely not"] }), ids[0]!);
      engine.submitIntent(intent(engine.id, g.id, "sprint-answers", { answers: [a] }), ids[1]!);
      engine.submitIntent(intent(engine.id, g.id, "sprint-answers", { answers: [] }), ids[2]!);
      engine.submitIntent(intent(engine.id, g.id, "sprint-answers", { answers: ["zzzz"] }), ids[3]!);
    }
    expect(g.status).toBe("finished");
    // Per round: Ada a (shared, 20) + b (unique, 40) = 60; P1 a (shared) = 20.
    expect(g.rawScores[ids[0]!]).toBe(180);
    expect(g.rawScores[ids[1]!]).toBe(60);
    const st = myState(engine, ids[0]!, g.id)!;
    const results = st["results"] as { category: string; accepted: string[]; mine: { verdict: string }[] }[];
    expect(results).toHaveLength(3);
    expect(results[0]!.mine.map((m) => m.verdict)).toEqual(["shared", "unique", "not-on-list"]);
    expect(JSON.stringify(st)).not.toContain("zzzz"); // never another player's answers
    // The TV sees the lists but nobody's verdicts.
    const tv = (engine.project("tv") as Json)["games"] as Json[];
    expect(JSON.stringify(tv)).not.toContain("\"mine\"");
  });

  it("while a game is playing, no accepted list is visible to anyone", () => {
    const { engine, host, ids } = room(4);
    const g = engine.startGame(host, "category-sprint", { official: true, seed: 3 });
    const st = myState(engine, ids[1]!, g.id)!;
    expect(st["results"]).toBeUndefined();
    expect(Object.keys(st).sort()).toEqual(["category", "definition", "roundIndex"]);
  });

  it("no suitable official category: the host gets NO_SUITABLE_CATEGORY and practice still starts", () => {
    const { engine, host, ids } = room(4);
    const g1 = engine.startGame(host, "category-sprint", { official: true, seed: 3 });
    for (let r = 0; r < 3; r++) for (const pid of ids) engine.submitIntent(intent(engine.id, g1.id, "sprint-answers", { answers: [] }), pid);
    expect(g1.status).toBe("finished");
    let err: unknown;
    try { engine.startGame(host, "category-sprint", { official: true, seed: 4 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ContentShortage);
    expect((err as ContentShortage).code).toBe("NO_SUITABLE_CATEGORY");
    expect((err as Error).message).toMatch(/practice/);
    const practice = engine.startGame(host, "category-sprint", { official: false, seed: 5 });
    expect(practice.status).toBe("playing");
    expect((practice.extra as Extra).matcherVersion).toBe(2);
    expect((practice.extra as Extra).eligibility).toBeUndefined();
  });

  it("a Cup created before E2 v3 keeps v1 matching and Sprint 4 selection, across save and restore", () => {
    const { engine } = room(4);
    const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    delete (snap["cup"] as Json)["categorySprint"];
    const old = withLib(RoomEngine.fromJSON(snap));
    expect((old.toJSON()["cup"] as Json)["categorySprint"]).toBeUndefined();
    const host = (snap["hostId"] as string | undefined) ?? (old.toJSON()["hostId"] as string);
    const g = old.startGame(host, "category-sprint", { official: true, seed: 3 });
    expect((g.extra as Extra).matcherVersion).toBeUndefined(); // = v1
    expect((g.extra as Extra).eligibility).toBeUndefined();
    // Saved again, it stays an older Cup.
    const again = withLib(RoomEngine.fromJSON(JSON.parse(JSON.stringify(old.toJSON())) as Json));
    expect((again.toJSON()["cup"] as Json)["categorySprint"]).toBeUndefined();
  });

  it("a game saved with v2 is still scored with v2 after a restart, and a v1 game with v1", () => {
    const { engine, host, ids } = room(4);
    const g = engine.startGame(host, "category-sprint", { official: true, seed: 3 });
    const zodiacLike: SprintCategory = { ...zodiac() };
    // Swap in a known category so the alias difference is observable.
    (g.extra as Extra).categories = [zodiacLike, zodiacLike, zodiacLike];
    const restored = withLib(RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json));
    for (let r = 0; r < 3; r++) for (const pid of ids) restored.submitIntent(intent(restored.id, g.id, "sprint-answers", { answers: pid === ids[0] ? ["Sheep"] : [] }), pid);
    const after = restored.toJSON();
    const saved = ((after["games"] as Json[]).find((x) => x["id"] === g.id))!;
    expect((saved["rawScores"] as Record<string, number>)[ids[0]!]).toBe(120); // sheep = goat, unique, x3
    // The same game recorded as v1 (as every pre-E2 game is) gives sheep nothing.
    const snapV1 = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    const gv1 = (snapV1["games"] as Json[]).find((x) => x["id"] === g.id)!;
    delete (gv1["extra"] as Json)["matcherVersion"];
    const v1 = withLib(RoomEngine.fromJSON(snapV1));
    for (let r = 0; r < 3; r++) for (const pid of ids) v1.submitIntent(intent(v1.id, g.id, "sprint-answers", { answers: pid === ids[0] ? ["Sheep"] : [] }), pid);
    const savedV1 = ((v1.toJSON()["games"] as Json[]).find((x) => x["id"] === g.id))!;
    expect((savedV1["rawScores"] as Record<string, number>)[ids[0]!]).toBe(0);
  });

  it("editing a pack after a game starts never changes that game's categories", () => {
    const { engine, host } = room(4);
    const g = engine.startGame(host, "category-sprint", { official: true, seed: 3 });
    const before = JSON.stringify((g.extra as Extra).categories);
    const li = lib.items.get((g.extra as Extra).categories[0]!.name === "US states" ? "spr-cs-us-states" : "spr-cs-elements")!;
    const original = (li.item as SprintItem).answers;
    (li.item as SprintItem).answers = [...original, "zzz"];
    try { expect(JSON.stringify((g.extra as Extra).categories)).toBe(before); } finally { (li.item as SprintItem).answers = original; }
  });
});
