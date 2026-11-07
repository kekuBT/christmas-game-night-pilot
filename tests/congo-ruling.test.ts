/**
 * Owner ruling (2026-11-07, final content checkpoint): a bare "Congo" is
 * ambiguous and scores nothing in Cups created from now on (answer rules 2).
 * The player must name the Republic of the Congo or the Democratic Republic of
 * the Congo unambiguously. Cups created earlier keep scoring a bare "Congo" as
 * the Republic (answer rules 1, from the item's frozen `answerRules1` copy), so
 * a Cup already under way is never re-ruled. Finished and in-progress games are
 * untouched either way: each game holds its own copy of its categories.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { materialize } from "../src/content/materialize.js";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary, type LoadedItem } from "../src/content/registry.js";
import type { ItemOf } from "../src/content/schema.js";
import { matchSprintAnswer, reviewSprintRound, type SprintCategory } from "../src/games/sprint.js";
import { RoomEngine } from "../src/server/room.js";

type Json = Record<string, unknown>;
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
const africaLi = lib.items.get("spr-cs-africa") as LoadedItem<"category-sprint">;
const africa = africaLi.item;
const categoryUnder = (rules: 1 | 2, li: LoadedItem = africaLi): SprintCategory =>
  (materialize("category-sprint", [li], { seed: 1, playerIds: [], sprintAnswerRules: rules }) as { categories: SprintCategory[] }).categories[0]!;
const ROC = "republic of the congo";
const DRC = "democratic republic of the congo";

describe("answer rules 2 (new Cups): a bare Congo is ambiguous", () => {
  const cat = categoryUnder(2);

  it.each(["Congo", "congo", "CONGO", "The Congo", "  congo "])("%j scores nothing and says why", (raw) => {
    const m = matchSprintAnswer(cat, raw);
    expect(m.kind).toBe("near-miss");
    expect(m.kind === "near-miss" && m.reason).toMatch(/Two countries are called Congo/);
  });

  it.each(["Republic of the Congo", "Republic of Congo", "Congo-Brazzaville", "Congo (Brazzaville)", "Congo Republic", "Congo, Republic of"])("%j scores the Republic", (raw) => {
    expect(matchSprintAnswer(cat, raw)).toMatchObject({ kind: "valid", canonical: ROC });
  });

  it.each(["Democratic Republic of the Congo", "Democratic Republic of Congo", "DR Congo", "DRC", "Congo-Kinshasa"])("%j scores the DRC", (raw) => {
    expect(matchSprintAnswer(cat, raw)).toMatchObject({ kind: "valid", canonical: DRC });
  });

  it("a near-typo of Congo is not rescued by typo tolerance", () => {
    for (const raw of ["Kongo", "Congoo", "Conga"]) expect(matchSprintAnswer(cat, raw).kind).not.toBe("valid");
  });

  it("in a scored round, a bare Congo earns 0 and both Congos stay distinct", () => {
    const r = reviewSprintRound(cat, { a: ["Congo"], b: ["Congo-Brazzaville", "DRC"], c: ["DR Congo"] }, 2);
    // b: the Republic (valid, unique: 40) + the DRC (valid, shared with c: 20); c: the DRC (shared: 20).
    expect(r.scores).toEqual({ a: 0, b: 40 + 20, c: 20 });
    expect(r.reviews["a"]![0]).toMatchObject({ verdict: "near-miss" });
    expect(r.reviews["b"]!.map((x) => x.canonical)).toEqual([ROC, DRC]);
  });

  it("the World Cup draft explains a bare Congo instead of silently refusing it (still 0 points)", () => {
    const wc = lib.items.get("spr-cs-wc2026") as LoadedItem<"category-sprint">;
    const c = categoryUnder(2, wc);
    expect(matchSprintAnswer(c, "Congo")).toMatchObject({ kind: "near-miss" });
    expect(matchSprintAnswer(c, "DR Congo")).toMatchObject({ kind: "valid", canonical: "dr congo" });
    expect(wc.item.eligibility).toBe("practice");
  });
});

describe("answer rules 1 (Cups created before the ruling): unchanged", () => {
  const cat = categoryUnder(1);

  it("a bare Congo still scores the Republic, under its old canonical answer", () => {
    expect(matchSprintAnswer(cat, "Congo")).toMatchObject({ kind: "valid", canonical: "congo", via: "exact" });
    expect(matchSprintAnswer(cat, "Republic of the Congo")).toMatchObject({ kind: "valid", canonical: "congo", via: "alias" });
    expect(matchSprintAnswer(cat, "DRC")).toMatchObject({ kind: "valid", canonical: DRC });
  });

  it("the rules-1 copy is exactly the category as it was: 54 members, the same aliases and near-misses", () => {
    const r1 = africa.answerRules1!;
    expect(r1.answers).toHaveLength(54);
    expect(r1.answers).toContain("congo");
    expect(r1.answers).not.toContain(ROC);
    expect(Object.keys(r1.aliases!)).toEqual([
      "republic of the congo", "congo brazzaville", "dr congo", "drc", "democratic republic of congo", "congo kinshasa",
      "ivory coast", "cote divoire", "cape verde", "swaziland", "sao tome", "united republic of tanzania",
    ]);
    expect(Object.keys(r1.knownNotAccepted!)).not.toContain("congo");
    // Everything except the two Congo entries is the same in both rule sets.
    expect(africa.answers.filter((a) => a !== ROC)).toEqual(r1.answers.filter((a) => a !== "congo"));
  });

  it("v1 matching (Cups from before E2 v3) still accepts a bare congo exactly", () => {
    expect(reviewSprintRound(cat, { a: ["Congo"] }, 1).scores).toEqual({ a: 20 + 20 });
  });

  it("items without a rules-1 copy are the same under both rule sets", () => {
    const states = lib.items.get("spr-cs-us-states") as LoadedItem;
    expect(categoryUnder(1, states)).toEqual(categoryUnder(2, states));
  });
});

// ---------------------------------------------------------------- the room
const intent = (roomId: string, gid: string, action: string, payload: Json) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });
/** A library whose only Sprint categories are Africa, US states and elements, so selection must pick Africa. */
function onlyThree(): ContentLibrary {
  const keep = ["spr-cs-africa", "spr-cs-us-states", "spr-cs-elements"];
  const byGame = new Map(lib.byGame);
  byGame.set("category-sprint", keep.map((id) => lib.items.get(id)!));
  return { ...lib, byGame };
}
function room(cupTweak?: (cup: Json) => void) {
  const engine = new RoomEngine("Congo Cup");
  engine.content = onlyThree();
  const ids = [engine.join("Ada", { asHost: true }).player.id];
  for (let i = 1; i < 4; i++) ids.push(engine.join(`P${i}`).player.id);
  if (!cupTweak) return { engine, ids };
  const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
  cupTweak(snap["cup"] as Json);
  const restored = RoomEngine.fromJSON(snap);
  restored.content = onlyThree();
  return { engine: restored, ids };
}
function playCongo(engine: RoomEngine, ids: string[]) {
  const g = engine.startGame(ids[0]!, "category-sprint", { official: false, seed: 5 });
  const cats = (g.extra as { categories: SprintCategory[] }).categories;
  for (let r = 0; r < cats.length; r++) {
    const isAfrica = cats[r]!.name === africa.name;
    for (const pid of ids) engine.submitIntent(intent(engine.id, g.id, "sprint-answers", { answers: pid === ids[0] && isAfrica ? ["Congo"] : [] }), pid);
  }
  expect(cats.map((c) => c.name)).toContain(africa.name);
  expect(g.status).toBe("finished");
  return g.rawScores[ids[0]!];
}

describe("room: answer rules are fixed per Cup and survive save and restore", () => {
  it("a new Cup records answer rules 2 and a bare Congo scores 0", () => {
    const { engine, ids } = room();
    expect((engine.toJSON()["cup"] as Json)["categorySprint"]).toMatchObject({ answerRules: 2 });
    expect(playCongo(engine, ids)).toBe(0);
  });

  it("a stored E2 v3 Cup without answerRules (created before the ruling) keeps scoring a bare Congo", () => {
    const { engine, ids } = room((cup) => { delete (cup["categorySprint"] as Json)["answerRules"]; });
    expect((engine.toJSON()["cup"] as Json)["categorySprint"]).toEqual({ matcher: 2, sizePolicy: 1 });
    expect(playCongo(engine, ids)).toBe(40); // valid and unique
    // Saved and restored again, it stays a rules-1 Cup.
    const again = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    expect((again.toJSON()["cup"] as Json)["categorySprint"]).toEqual({ matcher: 2, sizePolicy: 1 });
  });

  it("a Cup from before E2 v3 (no categorySprint at all) keeps v1 matching and a scoring bare Congo", () => {
    const { engine, ids } = room((cup) => { delete cup["categorySprint"]; });
    expect(playCongo(engine, ids)).toBe(40);
  });

  it("a game started under rules 2 is not re-ruled by a restart", () => {
    const { engine, ids } = room();
    const g = engine.startGame(ids[0]!, "category-sprint", { official: false, seed: 5 });
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    restored.content = onlyThree();
    const cats = ((restored.toJSON()["games"] as Json[]).find((x) => x["id"] === g.id)!["extra"] as { categories: SprintCategory[] }).categories;
    const af = cats.find((c) => c.name === africa.name)!;
    expect(af.answers).toContain(ROC);
    expect(af.knownNotAccepted!["congo"]).toMatch(/Two countries/);
  });

  it("an unknown answer-rules version is never guessed: standings pause and the record is kept", () => {
    const snap = JSON.parse(JSON.stringify(room().engine.toJSON())) as Json;
    ((snap["cup"] as Json)["categorySprint"] as Json)["answerRules"] = 3;
    const restored = RoomEngine.fromJSON(snap);
    expect(restored.cupProblem).toMatch(/answerRules/);
  });
});

describe("content integrity", () => {
  it("the Africa item has no content problems and its rules-1 copy is valid", () => {
    expect(lib.problems.filter((p) => p.itemId === "spr-cs-africa")).toEqual([]);
    const it: ItemOf<"category-sprint"> = africa;
    expect(it.review.status).toBe("provisional");
  });
});
