/**
 * Sprint 4, CP1: the qualifying-day rule is part of each Cup's saved
 * identity (src/server/cup.ts), validated, immutable once the Cup begins,
 * and new Cups use the owner-approved meaningful-participation rule:
 *   >= 50% of a game's scoring opportunities AND >= 2 genuine actions, in at
 *   least one completed, officially counted game that day. Wrong answers
 *   count; opening, rostering, staying connected and abstaining do not.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { LEGACY_QUALIFICATION_POLICY, meaningful, NEW_CUP_QUALIFICATION_POLICY, qualifies, type GameParticipationRecord } from "../src/scoring/qualification.js";
import { CONNECTIONS_BOARD } from "../src/games/connections.js";
import { FakeClock, Harness } from "./helpers/harness.js";

type Json = Record<string, unknown>;
const NEW = NEW_CUP_QUALIFICATION_POLICY as Extract<typeof NEW_CUP_QUALIFICATION_POLICY, { kind: "meaningful-participation" }>;
const intent = (roomId: string, gid: string, action: string, payload: Json) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });

describe("the rule itself (boundaries)", () => {
  const rec = (done: number, of: number, actions = done, finished?: boolean): GameParticipationRecord => ({ done, of, actions, ...(finished !== undefined ? { finished } : {}) });
  it.each([
    ["5 of 10 answered", rec(5, 10), true],
    ["4 of 10 answered", rec(4, 10), false],
    ["10 of 10, all wrong (wrong answers are attempts)", rec(10, 10), true],
    ["1 of 2 (50%) but only one action", rec(1, 2), false],
    ["2 of 3 rounds", rec(2, 3), true],
    ["1 of 3 rounds", rec(1, 3), false],
    ["4 of 8 guesses", rec(4, 8), true],
    ["0 of 10", rec(0, 10), false],
    ["Connections: puzzle ended by the player through 4 mistakes", rec(0, 4, 4, true), true],
    ["Connections: 2 of 4 groups solved, unfinished", rec(2, 4, 2, false), true],
    ["Connections: 1 group + 3 mistakes, deadline reached (not finished by the player)", rec(1, 4, 4, false), false],
    ["Connections: deadline reached having done nothing", rec(0, 4, 0, false), false],
    ["a record with no actions count (pre-Sprint 4) falls back to done", { done: 6, of: 10 }, true],
  ] as [string, GameParticipationRecord, boolean][])("%s -> %s", (_label, p, expected) => {
    expect(meaningful(p, NEW)).toBe(expected);
  });
  it("a game with no participation record at all fails closed under the new rule", () => {
    expect(meaningful(null, NEW)).toBe(false);
    expect(qualifies(NEW, { gamesOnRoster: 1, participations: [null] })).toBe(false);
    expect(qualifies(LEGACY_QUALIFICATION_POLICY, { gamesOnRoster: 1, participations: [null] })).toBe(true);
  });
  it("one meaningful game is enough on a short night; minGames is honoured", () => {
    expect(qualifies(NEW, { gamesOnRoster: 3, participations: [{ done: 1, of: 10, actions: 1 }, { done: 6, of: 10, actions: 6 }, { done: 0, of: 8, actions: 0 }] })).toBe(true);
    expect(qualifies({ ...NEW, minGames: 2 }, { gamesOnRoster: 3, participations: [{ done: 1, of: 10, actions: 1 }, { done: 6, of: 10, actions: 6 }] })).toBe(false);
  });
});

// ---------------------------------------------------------------- real rooms
function room(n = 3) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine("Q Cup");
  engine.clock = () => t;
  const ids = [engine.join("Ada", { asHost: true }).player.id];
  for (const name of ["Bea", "Cal", "Dee", "Eli"].slice(0, n - 1)) ids.push(engine.join(name).player.id);
  return { engine, ids, host: ids[0]!, advance: (ms: number) => { t += ms; }, at: (v: number) => { t = v; } };
}
type R = ReturnType<typeof room>;
function trivia(r: R, perPlayer: Record<string, { answer: number; wrong?: boolean; abstainAfter?: boolean }>, official = true) {
  const g = r.engine.startGame(r.host, "trivia", { official, seed: 3 });
  const qs = (g.extra as { questions: { id: string; correctIndex: number }[] }).questions;
  for (const [pid, plan] of Object.entries(perPlayer)) {
    for (const q of qs.slice(0, plan.answer)) r.engine.submitIntent(intent(r.engine.id, g.id, "trivia-answer", { questionId: q.id, chosenIndex: plan.wrong ? (q.correctIndex + 1) % 4 : q.correctIndex }), pid);
    if (plan.abstainAfter) r.engine.submitIntent(intent(r.engine.id, g.id, "abstain", {}), pid);
  }
  if (g.status === "playing") { r.at(g.deadlineAt! + 1); r.engine.tick(); }
  return g;
}
const qualified = (r: R) => r.engine.championshipResults().map((x) => x.playerId).sort();

describe("new Cups: who qualifies, game by game", () => {
  it("new rooms carry the approved rule in a saved Cup record", () => {
    const { engine } = room();
    expect(engine.cup).toMatchObject({ schemaVersion: 1, origin: "created", format: "individual-only", qualificationPolicy: NEW_CUP_QUALIFICATION_POLICY });
    expect((engine.toJSON()["cup"] as Json)["qualificationPolicy"]).toEqual(NEW_CUP_QUALIFICATION_POLICY);
  });

  it("Trivia: 5 answers (even all wrong) qualifies; 4 doesn't; answering 3 then sitting out doesn't", () => {
    const r = room(4);
    const [ada, bea, cal, dee] = r.ids as [string, string, string, string];
    trivia(r, { [ada]: { answer: 10 }, [bea]: { answer: 5, wrong: true }, [cal]: { answer: 4 }, [dee]: { answer: 3, abstainAfter: true } });
    expect(qualified(r)).toEqual([ada, bea].sort());
  });

  it("Math: opening every question without answering is not participation", () => {
    const r = room(2);
    const [ada, bea] = r.ids as [string, string];
    const g = r.engine.startGame(r.host, "math-mayhem", { official: true, seed: 1 });
    for (const q of g.questions!) r.engine.submitIntent(intent(r.engine.id, g.id, "math-open", { questionId: q.id }), bea);
    for (const q of g.questions!) r.engine.submitIntent(intent(r.engine.id, g.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }), ada);
    r.at(g.deadlineAt! + 1); r.engine.tick();
    expect(g.outcome?.participation[bea]).toMatchObject({ done: 0, actions: 0 });
    expect(qualified(r)).toEqual([ada]);
  });

  it("Word Connections: ending the puzzle through the allowed mistakes counts; reaching the deadline does not", () => {
    const r = room(3);
    const [ada, bea, cal] = r.ids as [string, string, string];
    const g = r.engine.startGame(r.host, "word-connections", { official: true, seed: 1 });
    const cats = CONNECTIONS_BOARD.categories.map((c) => CONNECTIONS_BOARD.tiles.filter((t) => t.category === c.name).map((t) => t.id));
    const guess = (pid: string, tiles: string[]) => r.engine.submitIntent(intent(r.engine.id, g.id, "connections-guess", { tileIds: tiles }), pid);
    // Ada solves everything.
    for (const c of cats) guess(ada, c);
    // Bea makes four genuine wrong guesses: the puzzle ends for her (allowed mistakes used up).
    for (let k = 0; k < 4; k++) guess(bea, [cats[0]![k]!, cats[1]![k]!, cats[2]![k]!, cats[3]![(k + 1) % 4]!]);
    // Cal solves one group, makes one mistake, then the deadline arrives.
    guess(cal, cats[0]!);
    guess(cal, [cats[1]![0]!, cats[2]![0]!, cats[3]![0]!, cats[1]![1]!]);
    r.at(g.deadlineAt! + 1); r.engine.tick();
    expect(g.outcome?.participation[bea]).toMatchObject({ finished: true, actions: 4 });
    expect(g.outcome?.participation[cal]).toMatchObject({ done: 1, finished: false, actions: 2 });
    expect(qualified(r)).toEqual([ada, bea].sort());
  });

  it("Category Sprint: empty submissions are not playing", () => {
    const r = room(4);
    const [ada, bea] = r.ids as [string, string];
    const g = r.engine.startGame(r.host, "category-sprint", { official: true, seed: 1 });
    for (let round = 0; round < 3; round++) {
      r.engine.submitIntent(intent(r.engine.id, g.id, "sprint-answers", { answers: ["robin", "wren"] }), ada);
      r.engine.submitIntent(intent(r.engine.id, g.id, "sprint-answers", { answers: [" ", ""] }), bea);
      r.at(g.phaseDeadlineAt! + 1); r.engine.tick();
    }
    expect(g.outcome?.participation[bea]).toMatchObject({ done: 0, actions: 0 });
    expect(g.outcome?.participation[ada]).toMatchObject({ done: 3, actions: 3 });
  });

  it("practice, void and zero-participation games never qualify a day", () => {
    const r = room(2);
    const [ada, bea] = r.ids as [string, string];
    trivia(r, { [ada]: { answer: 10 }, [bea]: { answer: 10 } }, false); // practice
    expect(qualified(r)).toEqual([]);
    const v = r.engine.startGame(r.host, "trivia", { official: true, seed: 4 });
    for (const q of (v.extra as { questions: { id: string }[] }).questions) {
      r.engine.submitIntent(intent(r.engine.id, v.id, "trivia-answer", { questionId: q.id, chosenIndex: 0 }), ada);
    }
    (v.extra as { questions: unknown }).questions = null; // integrity failure at the deadline
    r.at(v.deadlineAt! + 1); r.engine.tick();
    expect(v.outcome?.reason).toBe("void");
    expect(qualified(r)).toEqual([]);
    trivia(r, {}); // official, nobody answered: not counted
    expect(qualified(r)).toEqual([]);
  });
});

describe("worked example: a five-day Individual Cup", () => {
  it("brief players don't earn days; meaningful players do; three days to be eligible; +5 per day beyond three", () => {
    const r = room(4);
    const [ada, bea, cal, dee] = r.ids as [string, string, string, string];
    const plan: Record<string, number[]> = {
      // answers per day out of 10 (one official Trivia a day)
      [ada]: [10, 9, 8, 10, 7], // meaningful every day
      [bea]: [6, 1, 5, 0, 5], //   meaningful on days 1, 3, 5
      [cal]: [2, 2, 2, 2, 2], //   joins every night, answers a couple: never meaningful
      [dee]: [10, 10, 0, 0, 0], // two strong days only
    };
    for (let day = 0; day < 5; day++) {
      trivia(r, Object.fromEntries(Object.entries(plan).map(([pid, a]) => [pid, { answer: a[day]! }])));
      if (day < 4) r.engine.advanceDay(r.host);
    }
    const res = Object.fromEntries(r.engine.championshipResults().map((x) => [x.playerId, x]));
    expect(res[ada]).toMatchObject({ qualifyingDays: 5, participationBonus: 10, eligible: true });
    expect(res[ada]!.counted).toHaveLength(3);
    expect(res[bea]).toMatchObject({ qualifyingDays: 3, participationBonus: 0, eligible: true });
    expect(res[cal]).toBeUndefined(); // no qualifying day at all
    expect(res[dee]).toMatchObject({ qualifyingDays: 2, eligible: false });
    // The same Cup under the legacy rule: Cal would have 5 days and +10.
    const legacy = room(4);
    legacy.engine.configureCup({ qualificationPolicy: LEGACY_QUALIFICATION_POLICY });
    const [la, lb, lc, ld] = legacy.ids as [string, string, string, string];
    const map: Record<string, string> = { [ada]: la, [bea]: lb, [cal]: lc, [dee]: ld };
    for (let day = 0; day < 5; day++) {
      trivia(legacy, Object.fromEntries(Object.entries(plan).map(([pid, a]) => [map[pid]!, { answer: a[day]! }])));
      if (day < 4) legacy.engine.advanceDay(legacy.host);
    }
    const lres = Object.fromEntries(legacy.engine.championshipResults().map((x) => [x.playerId, x]));
    expect(lres[lc]).toMatchObject({ qualifyingDays: 5, participationBonus: 10, eligible: true });
    expect(lres[ld]).toMatchObject({ qualifyingDays: 5 }); // even 0-answer days counted
  });
});

describe("persistence, migration and immutability", () => {
  let h: Harness | undefined;
  afterEach(async () => { await h?.dispose(); h = undefined; });

  it("the Cup record survives a real server restart unchanged", async () => {
    h = await new Harness(undefined, { clock: new FakeClock() }).start();
    await h.createRoom();
    const before = structuredClone(h.engine().cup);
    await h.restart();
    expect(h.engine().cup).toEqual(before);
    expect(h.engine().qualificationPolicy).toEqual(NEW_CUP_QUALIFICATION_POLICY);
  });

  it("a saved rule is used as saved, even when the application default is different", () => {
    const { engine } = room();
    const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    (snap["cup"] as Json)["qualificationPolicy"] = { kind: "meaningful-participation", version: 1, minShare: 0.6, minActions: 3, minGames: 1 };
    const restored = RoomEngine.fromJSON(snap);
    expect(restored.qualificationPolicy).toEqual({ kind: "meaningful-participation", version: 1, minShare: 0.6, minActions: 3, minGames: 1 });
    expect(restored.qualificationPolicy).not.toEqual(NEW_CUP_QUALIFICATION_POLICY);
  });

  it("Cups from before Sprint 4 keep their historical rule and format", () => {
    const sprint2 = JSON.parse(readFileSync(new URL("./fixtures/cup-legacy-sprint2.json", import.meta.url), "utf8")) as { snapshot: Json; championship: unknown };
    const e2 = RoomEngine.fromJSON(structuredClone(sprint2.snapshot));
    expect(e2.cup).toMatchObject({ origin: "legacy-restored", format: "combined-75-25", qualificationPolicy: LEGACY_QUALIFICATION_POLICY });
    expect(e2.championshipResults()).toEqual(sprint2.championship);
    // A Sprint 3 room: individual-only, no Cup record.
    const { engine } = room();
    const s3 = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    delete s3["cup"];
    s3["competitionFormat"] = "individual-only";
    const e3 = RoomEngine.fromJSON(s3);
    expect(e3.cup).toMatchObject({ origin: "legacy-restored", format: "individual-only", qualificationPolicy: LEGACY_QUALIFICATION_POLICY });
    // Once restored, it is saved with its rule, so it stays legacy forever.
    expect(RoomEngine.fromJSON(JSON.parse(JSON.stringify(e3.toJSON())) as Json).qualificationPolicy).toEqual(LEGACY_QUALIFICATION_POLICY);
  });

  it.each([
    ["an unknown rule", { kind: "anyone-who-shows-up" }],
    ["a missing threshold", { kind: "meaningful-participation", version: 1, minActions: 2, minGames: 1 }],
    ["a nonsense threshold", { kind: "meaningful-participation", version: 1, minShare: 7, minActions: 2, minGames: 1 }],
    ["a future version", { kind: "meaningful-participation", version: 2, minShare: 0.5, minActions: 2, minGames: 1 }],
  ])("an invalid saved rule (%s) pauses standings, never guesses, and is written back untouched", (_l, bad) => {
    const r = room(2);
    trivia(r, { [r.ids[0]!]: { answer: 10 }, [r.ids[1]!]: { answer: 10 } });
    expect(r.engine.championshipResults()).toHaveLength(2);
    const snap = JSON.parse(JSON.stringify(r.engine.toJSON())) as Json;
    (snap["cup"] as Json)["qualificationPolicy"] = bad;
    const broken = RoomEngine.fromJSON(snap);
    expect(broken.cupProblem).toMatch(/Cup record invalid/);
    expect(broken.championshipResults()).toEqual([]);
    expect(broken.officialStandings()).toEqual({});
    expect(broken.ceremony().winner).toBeNull();
    expect(((broken.project("tv") as Json)["competition"] as Json)["standingsPaused"]).toMatch(/paused/);
    expect((broken.toJSON()["cup"] as Json)["qualificationPolicy"]).toEqual(bad); // preserved for repair
    expect([...broken.games.values()][0]!.status).toBe("finished"); // no results lost
    expect(() => broken.configureCup({ qualificationPolicy: LEGACY_QUALIFICATION_POLICY })).toThrow(/repaired, not replaced/);
  });

  it("the rule can be chosen only before the Cup's first game, and never assigned directly", () => {
    const r = room(2);
    r.engine.configureCup({ qualificationPolicy: LEGACY_QUALIFICATION_POLICY });
    expect(() => r.engine.configureCup({ qualificationPolicy: { kind: "nope" } })).toThrow();
    trivia(r, { [r.ids[0]!]: { answer: 10 } });
    expect(() => r.engine.configureCup({ qualificationPolicy: NEW_CUP_QUALIFICATION_POLICY })).toThrow(/fixed once its first game/);
    expect(() => { (r.engine as unknown as { qualificationPolicy: unknown }).qualificationPolicy = NEW_CUP_QUALIFICATION_POLICY; }).toThrow(TypeError);
    expect(Object.isFrozen(r.engine.cup.qualificationPolicy)).toBe(true);
  });
});
