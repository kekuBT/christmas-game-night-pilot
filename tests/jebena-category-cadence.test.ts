/**
 * D-JR-01 (handoff 7057753827): Jebena Rush changes its category during a
 * streak of accepted answers too, not only after a timeout or a used-up bank.
 * Each category lasts a seeded 5 to 8 accepted answers; the change comes at the
 * turn boundary, with the jebena's pass; the count is in the saved state.
 *
 * Covered here: sustained correct play (fails on the base, where the category
 * never moves); the cadence's bounds and determinism; rejected, duplicate and
 * late sends; timeouts and used-up banks; restart recovery; every viewer seeing
 * the same category; privacy; and the reported 120-0 under the existing points.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { JEBENA_POINTS, jebenaModule, jebenaPoints, type JebenaState } from "../src/games/modules/jebena.js";
import * as jebena from "../src/games/modules/jebena.js";
import { RoomEngine } from "../src/server/room.js";
import { lastPlayLine, type JebenaLogEntry } from "../apps/web/src/ui/mchezo/lib/jebena.js";

type Json = Record<string, unknown>;
const cat = (id: string) => JEBENA_CATEGORIES.find((c) => c.id === id)!;
const ctx = (now: number, players: string[]) => ({ now, players, active: players, scale: 1 });
const unused = (s: JebenaState) => cat(s.category).answers.find((x) => !(s.used[s.category] ?? []).includes(x.id))!;
const answer = (s: JebenaState, who: string, text: string, now = 1) => jebenaModule.intent(s, who, "jebena-answer", { turn: s.turn!.n, text }, ctx(now, s.order));
/** The holder names a fresh answer; returns the category the next turn plays. */
function acceptOne(s: JebenaState, now = 1): string {
  const r = answer(s, s.turn!.player, unused(s).name, now);
  expect(r).toMatchObject({ ok: true, result: { verdict: "accepted" } });
  return s.category;
}
const newGame = (seed: number, players = ["a", "b", "c"], hearts = 5) => jebenaModule.init({ players, seed, settings: { hearts } } as never) as JebenaState;
const categoryEntries = (s: JebenaState) => s.log.filter((e) => e.kind === "category");

describe("D-JR-01: a streak of accepted answers changes the category", () => {
  it("sustained correct play: the category changes within 8 accepted answers, at the turn boundary, and again after the next streak", () => {
    // On the base (rules version 1) this fails: 16 accepted answers in a row never leave the first category.
    const s = newGame(424242);
    const first = s.category;
    const seen: { turn: number; category: string }[] = [];
    for (let i = 0; i < 16; i++) {
      acceptOne(s);
      seen.push({ turn: s.turn!.n, category: s.category });
    }
    const distinct = [...new Set(seen.map((x) => x.category))];
    expect(distinct.length, `categories played: ${distinct.join(", ")}`).toBeGreaterThanOrEqual(2);
    expect(seen.slice(0, 4).every((x) => x.category === first), "the first category lasts at least 5 answers").toBe(true);
    const changes = categoryEntries(s).filter((e) => e.reason === "streak");
    expect(changes.length).toBeGreaterThanOrEqual(2);
    // Each change is logged for the turn that starts with it (the phone shows "Category · new!" for that turn).
    for (const c of changes) expect(s.log.some((e) => e.kind === "accepted" && e.turn === c.turn - 1)).toBe(true);
  });

  it("bounded and seeded: every streak lasts 5 to 8 accepted answers; the same seed gives the same schedule, others differ", () => {
    expect(jebena.JEBENA_STREAK).toEqual({ min: 5, max: 8 });
    expect(jebena.JEBENA_RULES_VERSION).toBe(2);
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) for (let round = 1; round <= 12; round++) {
      const n = jebena.jebenaStreakLength(seed, round);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(8);
      expect(jebena.jebenaStreakLength(seed, round)).toBe(n);
      lengths.add(n);
    }
    expect([...lengths].sort()).toEqual([5, 6, 7, 8]);
    // A whole match: the gaps between streak changes are exactly the seeded lengths.
    const play = (seed: number) => {
      const s = newGame(seed, ["a", "b", "c", "d"]);
      const cats: string[] = [];
      for (let i = 0; i < 60; i++) cats.push(acceptOne(s));
      return { s, cats };
    };
    const a = play(99);
    const b = play(99);
    expect(a.cats).toEqual(b.cats);
    let round = 1;
    let since = 0;
    for (const e of a.s.log) {
      if (e.kind === "accepted") since += 1;
      if (e.kind === "category" && e.reason === "streak") {
        expect(since, `round ${round}`).toBe(jebena.jebenaStreakLength(99, round));
        round += 1;
        since = 0;
      }
    }
    expect(round).toBeGreaterThan(6);
    expect(play(100).cats).not.toEqual(a.cats);
  });

  it("only accepted answers count: rejected tries, a used answer, a stale or out-of-turn send change neither the category nor the count", () => {
    const s = newGame(7);
    const len = s.streak!.changeAfter;
    for (let i = 0; i < len - 1; i++) {
      const holder = s.turn!.player;
      const other = s.order.find((p) => p !== holder)!;
      const before = JSON.stringify({ category: s.category, streak: s.streak, round: s.categoryRound });
      expect(answer(s, holder, "Zzqxv Plonk")).toMatchObject({ ok: true, result: { verdict: "not-in-bank" } });
      expect(answer(s, holder, "")).toMatchObject({ ok: true, result: { verdict: "empty" } });
      if (i > 0) expect(answer(s, holder, s.log.filter((e) => e.kind === "accepted").slice(-1)[0]!.answer!)).toMatchObject({ ok: true, result: { verdict: "used" } });
      expect(jebenaModule.intent(s, other, "jebena-answer", { turn: s.turn!.n, text: unused(s).name }, ctx(1, s.order))).toMatchObject({ ok: false, reason: "NOT_YOUR_TURN" });
      expect(jebenaModule.intent(s, holder, "jebena-answer", { turn: s.turn!.n - 1, text: unused(s).name }, ctx(1, s.order))).toMatchObject({ ok: false });
      expect(JSON.stringify({ category: s.category, streak: s.streak, round: s.categoryRound })).toBe(before);
      acceptOne(s);
      expect(s.streak!.accepted).toBe(i + 1);
    }
    const cat0 = s.category;
    acceptOne(s); // the streak's last answer
    expect(s.category).not.toBe(cat0);
    expect(s.streak).toEqual({ accepted: 0, changeAfter: jebena.jebenaStreakLength(7, 2) });
  });

  it("a timeout still changes the category (and costs a cup); the streak starts again from zero in the new one", () => {
    const s = newGame(31);
    acceptOne(s); acceptOne(s);
    expect(s.streak!.accepted).toBe(2);
    const who = s.turn!.player;
    const cat0 = s.category;
    jebenaModule.expirePhase!(s, ctx(50_000, s.order) as never);
    expect(s.per[who]!.hearts).toBe(4);
    expect(s.category).not.toBe(cat0);
    expect(categoryEntries(s).slice(-1)[0]).toMatchObject({ reason: "timeout", categoryId: s.category });
    expect(s.streak).toEqual({ accepted: 0, changeAfter: jebena.jebenaStreakLength(31, 2) });
    // Used answers stay used when a category comes back.
    expect(Object.values(s.used).flat().length).toBe(2);
  });

  it("a used-up bank changes the category with no penalty (reason used-up); a streak never ends the match, even when no other category has answers left", () => {
    const s = newGame(5);
    const c = cat(s.category);
    s.used[s.category] = c.answers.slice(0, c.answers.length - 1).map((x) => x.id);
    acceptOne(s);
    expect(categoryEntries(s).slice(-1)[0]).toMatchObject({ reason: "used-up" });
    expect(s.streak!.accepted).toBe(0);
    // Every other category used up: the streak's change has nowhere to go, so the category stays and play goes on.
    const t = newGame(6);
    for (const other of JEBENA_CATEGORIES) if (other.id !== t.category) t.used[other.id] = other.answers.map((x) => x.id);
    const only = t.category;
    for (let i = 0; i < t.streak!.changeAfter + 2; i++) acceptOne(t);
    expect(t.category).toBe(only);
    expect(t.end).toBeNull();
    expect(categoryEntries(t).filter((e) => e.reason === "streak")).toHaveLength(0);
  });

  it("a match saved under rules version 1 keeps version 1 (no streak changes) after the upgrade", () => {
    const s = newGame(11);
    const v1 = JSON.parse(JSON.stringify(s)) as JebenaState;
    v1.rulesVersion = 1;
    delete v1.streak;
    const first = v1.category;
    for (let i = 0; i < 12; i++) acceptOne(v1);
    expect(v1.category).toBe(first);
    expect(v1.streak).toBeUndefined();
  });
});

describe("D-JR-01 in the room engine: recovery and every viewer agree", () => {
  const T0 = 1_800_000_000_000;
  function setup(n = 3) {
    const engine = new RoomEngine("JR cadence", { kind: "casual", timing: 2 });
    let t = T0;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
    const send = (pid: string, gid: string, action: string, payload: Json = {}, clientEventId: string = randomUUID()) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId, roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, now: () => t, advance: (ms: number) => { t += ms; engine.tick(t); } };
  }
  function start(env: ReturnType<typeof setup>) {
    const g = env.engine.startGame(env.ids[0]!, "jebena-rush", { official: false });
    for (const p of env.ids) expect(env.send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    const game = env.engine.games.get(g.id)!;
    expect(game.status).toBe("playing");
    return { gid: g.id, game };
  }
  const st = (engine: RoomEngine, gid: string) => engine.games.get(gid)!.extra as JebenaState;
  /** What each viewer is shown: every player's own projection and the TV's. */
  const shown = (engine: RoomEngine, gid: string, ids: string[]) => {
    const player = ids.map((pid) => ((engine.project("player", pid) as { myGames: { id: string; state: { category: { id: string; round: number } } }[] }).myGames.find((g) => g.id === gid)!.state.category));
    const tv = (engine.project("tv") as { games: { id: string; state: { category: { id: string; round: number } } }[] }).games.find((g) => g.id === gid)!.state.category;
    return { player, tv };
  };
  const play = (env: ReturnType<typeof setup>, engine: RoomEngine, gid: string, clientEventId?: string) => {
    const s = st(engine, gid);
    return engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: clientEventId ?? randomUUID(), roomId: engine.id, gameInstanceId: gid, action: "jebena-answer", payload: { turn: s.turn!.n, text: unused(s).name } }, s.turn!.player);
  };

  it("restart mid-streak: the restored room has the same category and count, and changes at the same answer as one that never stopped", () => {
    const env = setup();
    const { gid } = start(env);
    const len = st(env.engine, gid).streak!.changeAfter;
    for (let i = 0; i < len - 2; i++) expect(play(env, env.engine, gid).accepted).toBe(true);
    const snap = JSON.parse(JSON.stringify(env.engine.toJSON()));
    const restored = RoomEngine.fromJSON(snap);
    restored.clock = () => env.now();
    expect(st(restored, gid).streak).toEqual(st(env.engine, gid).streak);
    expect(st(restored, gid).category).toBe(st(env.engine, gid).category);
    // Both go on with the same answers: the change comes at the same accepted answer, to the same category.
    const runOn = (engine: RoomEngine) => {
      const cats: string[] = [];
      for (let i = 0; i < 4; i++) { expect(play(env, engine, gid).accepted).toBe(true); cats.push(st(engine, gid).category); }
      return cats;
    };
    const a = runOn(env.engine);
    const b = runOn(restored);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(2);
  });

  it("a duplicate send (same client event) and a reconnect's refetch change nothing; every player and the TV show the same category, before and after a change", () => {
    const env = setup(4);
    const { gid } = start(env);
    const len = st(env.engine, gid).streak!.changeAfter;
    for (let i = 0; i < len; i++) {
      const before = st(env.engine, gid).category;
      const view = shown(env.engine, gid, env.ids);
      expect(view.player.every((c) => c.id === before && c.id === view.tv.id && c.round === view.tv.round)).toBe(true);
      const eid = randomUUID();
      expect(play(env, env.engine, gid, eid).accepted).toBe(true);
      const after = JSON.stringify(st(env.engine, gid));
      // The same send again: a replay of the same event id, for a turn that has moved on.
      const s = st(env.engine, gid);
      const dup = env.engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: eid, roomId: env.engine.id, gameInstanceId: gid, action: "jebena-answer", payload: { turn: s.turn!.n - 1, text: "anything" } }, env.ids[0]!);
      expect(dup.accepted === false || JSON.stringify(st(env.engine, gid)) === after).toBe(true);
      expect(JSON.stringify(st(env.engine, gid))).toBe(after);
      // A reconnect only reads.
      env.engine.project("player", env.ids[1]!);
      expect(JSON.stringify(st(env.engine, gid))).toBe(after);
    }
    const changed = shown(env.engine, gid, env.ids);
    expect(changed.tv.round).toBe(2);
    expect(changed.player.every((c) => c.id === changed.tv.id && c.round === 2)).toBe(true);
  });

  it("the turn clock is unchanged: the turn after a streak's change gets the same full turn as after any other accepted answer", () => {
    const env = setup(2);
    const { gid, game } = start(env);
    const len = st(env.engine, gid).streak!.changeAfter;
    const gaps: { round: number; gap: number }[] = [];
    for (let i = 0; i < len + 1; i++) {
      env.advance(1000);
      expect(play(env, env.engine, gid).accepted).toBe(true);
      gaps.push({ round: st(env.engine, gid).categoryRound, gap: game.phaseDeadlineAt! - env.now() });
    }
    expect(gaps.map((g) => g.round)).toContain(2);
    expect(new Set(gaps.map((g) => g.gap)).size, JSON.stringify(gaps)).toBe(1);
    expect(game.phaseKey).toBe(`turn:${st(env.engine, gid).turn!.n}`);
  });

  it("privacy: no view carries the schedule's bank or unused answers (only played facts, plus the streak count is never shown)", () => {
    const env = setup(2);
    const { gid } = start(env);
    for (let i = 0; i < 6; i++) expect(play(env, env.engine, gid).accepted).toBe(true);
    const s = st(env.engine, gid);
    const unusedNames = cat(s.category).answers.filter((a) => !(s.used[s.category] ?? []).includes(a.id)).map((a) => a.name).filter((n) => n.length > 6).slice(0, 10);
    for (const view of [env.engine.project("tv"), env.engine.project("player", env.ids[0]!), env.engine.project("player", env.ids[1]!)]) {
      const text = JSON.stringify(view);
      for (const n of unusedNames) expect(text.includes(`"${n}"`), n).toBe(false);
      expect(text.includes("changeAfter")).toBe(false);
    }
  });
});

describe("the reported 120-0, under the existing points (100 per player outlasted, 10 per cup kept while in)", () => {
  it("two players, 5 cups: nearly even play, and the final score is 120-0", () => {
    const s = newGame(2024, ["a", "b"], 5);
    const loser = s.order[0]!; // holds the first turn
    const winner = s.order[1]!;
    // A = an accepted answer, T = the turn runs out. Turns alternate, the loser first; the loser's last turn breaks their last cup.
    const plan: Record<string, string> = { [loser]: "AATAATAATAATAT", [winner]: "AATAATAATAAAA" };
    const step: Record<string, number> = { [loser]: 0, [winner]: 0 };
    let now = 1;
    while (!s.end) {
      const who = s.turn!.player;
      const move = plan[who]![step[who]!]!;
      step[who] = step[who]! + 1;
      now += 1000;
      if (move === "A") acceptOne(s, now);
      else jebenaModule.expirePhase!(s, ctx(now, s.order) as never);
    }
    expect(s.end).toBe("last-standing");
    expect({ loser: { answers: s.per[loser]!.answers, timeouts: s.per[loser]!.timeouts, cups: s.per[loser]!.hearts }, winner: { answers: s.per[winner]!.answers, timeouts: s.per[winner]!.timeouts, cups: s.per[winner]!.hearts } })
      .toEqual({ loser: { answers: 9, timeouts: 5, cups: 0 }, winner: { answers: 10, timeouts: 3, cups: 2 } });
    // The winner: 1 player outlasted (100) + 2 cups kept (2 x 10). The loser: outlasted nobody, and cups count only while in.
    expect(jebenaPoints(s)).toEqual({ [winner]: 1 * JEBENA_POINTS.perOutlasted + 2 * JEBENA_POINTS.perHeart, [loser]: 0 });
    expect(jebenaPoints(s)[winner]).toBe(120);
    // Accepted answers are tracked separately (9 against 10) and earn no points under this rule.
  });
});

describe("review 7058749487: after a change, the last-play line says which category the answer was named in", () => {
  const nameOf = (id?: string) => ({ k: "Keku", a: "Amina" } as Record<string, string>)[id ?? ""] ?? "Someone";
  const sports: JebenaLogEntry = { seq: 5, turn: 5, kind: "accepted", player: "k", answer: "Boxing", categoryId: "jr-sports", categoryName: "Sports" };
  const toAnimals: JebenaLogEntry = { seq: 6, turn: 6, kind: "category", categoryId: "jr-animals", reason: "streak" };
  it("the transition: the answer is qualified with its own category; the current one is left to the heading", () => {
    expect(lastPlayLine([sports, toAnimals], nameOf, undefined, "jr-animals")).toBe("Keku named “Boxing” in Sports.");
    expect(lastPlayLine([sports, toAnimals], nameOf, "k", "jr-animals")).toBe("You named “Boxing” in Sports.");
  });
  it("the same category: the ordinary, concise line", () => {
    expect(lastPlayLine([sports], nameOf, undefined, "jr-sports")).toBe("Keku named “Boxing”.");
    const lion: JebenaLogEntry = { seq: 7, turn: 6, kind: "accepted", player: "a", answer: "Lion", categoryId: "jr-animals", categoryName: "Animals" };
    expect(lastPlayLine([sports, toAnimals, lion], nameOf, undefined, "jr-animals")).toBe("Amina named “Lion”.");
  });
  it("legacy or missing context: no raw id and no guessed name", () => {
    const noName: JebenaLogEntry = { ...sports, categoryName: undefined };
    const line = lastPlayLine([noName, toAnimals], nameOf, undefined, "jr-animals");
    expect(line).toBe("Keku named “Boxing”, before the category changed.");
    expect(line).not.toContain("jr-");
    const noCategory: JebenaLogEntry = { seq: 1, turn: 1, kind: "accepted", player: "k", answer: "Boxing" };
    expect(lastPlayLine([noCategory], nameOf, undefined, "jr-animals")).toBe("Keku named “Boxing”.");
    // A caller that doesn't say which category is on screen gets the line it always had.
    expect(lastPlayLine([sports, toAnimals], nameOf)).toBe("Keku named “Boxing”.");
  });
  it("other plays are unchanged by the category argument", () => {
    expect(lastPlayLine([{ seq: 1, turn: 1, kind: "timeout", player: "a", hearts: 3, categoryId: "jr-sports" }], nameOf, undefined, "jr-animals")).toBe("Amina ran out of time: a cup broke (3 left).");
  });

  it("in the room engine: after a streak's change, every view's last accepted entry names its own (previous) category; older saved logs get names too; only played categories appear", () => {
    const engine = new RoomEngine("JR context", { kind: "casual", timing: 2 });
    let t = 1_800_000_000_000;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id, engine.join("Amina").player.id];
    const send = (pid: string, gid: string, action: string, payload: Json) => engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const g = engine.startGame(ids[0]!, "jebena-rush", { official: false });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const st = () => engine.games.get(g.id)!.extra as JebenaState;
    const first = st().category;
    const firstName = JEBENA_CATEGORIES.find((c) => c.id === first)!.name;
    const len = st().streak!.changeAfter;
    for (let i = 0; i < len; i++) { t += 500; expect(send(st().turn!.player, g.id, "jebena-answer", { turn: st().turn!.n, text: unused(st()).name }).accepted).toBe(true); }
    expect(st().category).not.toBe(first);
    type View = { category: { id: string }; log: JebenaLogEntry[] };
    const views: View[] = [
      (engine.project("tv") as { games: { id: string; state: View }[] }).games.find((x) => x.id === g.id)!.state,
      ...ids.map((pid) => (engine.project("player", pid) as { myGames: { id: string; state: View }[] }).myGames.find((x) => x.id === g.id)!.state),
    ];
    for (const v of views) {
      const lastAccepted = v.log.filter((e) => e.kind === "accepted").slice(-1)[0]!;
      expect(lastAccepted).toMatchObject({ categoryId: first, categoryName: firstName });
      expect(lastPlayLine(v.log, (id) => (id === ids[0] ? "Keku" : "Amina"), undefined, v.category.id)).toMatch(new RegExp(`named “.+” in ${firstName}\\.$`));
      const played = new Set(v.log.filter((e) => e.kind === "category").map((e) => e.categoryId));
      for (const e of v.log) if (e.categoryName) expect(played.has(e.categoryId)).toBe(true);
    }
    // The saved state itself is unchanged: names are worked out for the view, so a log saved before this repair gets them too.
    expect(st().log.some((e) => "categoryName" in e)).toBe(false);
  });
});
