/**
 * Stage 12.15-R (docs/stage12/stage1215r.md; review 6888718011): Relay repairs.
 *  - R1 (D-S1215R-01): a runner's chances are their own turns, so a fully active team of any size qualifies for its
 *    Cup day, and an idle runner never does because teammates finished.
 *  - R4 (D-S1215R-04): a freeze ends on the TV's lanes at the same instant as on the runner's phone.
 *  - R5 (D-S1215R-03): lanes still out at the end are placed by their last leg's time, and every screen and the Cup
 *    follow Relay's places.
 * These tests fail on #39's source (1eafe41); see docs/evidence/stage1215r-local/README.md.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RELAY_FREEZE_MS, RELAY_LEGS, RELAY_POINTS, RELAY_TURN_MS, relayModule as m, relayPlaces, type RelayLane, type RelayQuestion, type RelayState } from "../src/games/modules/relay.js";
import { newTeamList, teamWinnerLine, type GameTeams, type TeamResultRow } from "../src/shared/teams.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { meaningful, NEW_CUP_QUALIFICATION_POLICY } from "../src/scoring/qualification.js";
import { placesOfGame } from "../apps/web/src/ui/mchezo/lib/medals.js";
import { RoomEngine } from "../src/server/room.js";

type Json = Record<string, unknown>;
const POLICY = NEW_CUP_QUALIFICATION_POLICY as Extract<typeof NEW_CUP_QUALIFICATION_POLICY, { kind: "meaningful-participation" }>;
const Q: RelayQuestion[] = Array.from({ length: RELAY_LEGS }, (_, i) => ({ id: `r${i}`, prompt: `${i} + 1 = ?`, options: [i + 1, i + 2, i + 3, i + 4], correctIndex: 0 }));
const T0 = 1_000_000;

function pureRace(coral: string[], sun: string[]) {
  const players = [...coral, ...sun];
  const teams: GameTeams = { list: newTeamList(2), members: Object.fromEntries([...coral.map((p) => [p, "team-coral"]), ...sun.map((p) => [p, "team-sun"])]) };
  const ctx = (now: number): ModuleContext => ({ now, players, active: players, scale: 1 });
  const s = m.init({ players, seed: 1, teams, relay: Q });
  m.onPlayStart(s, ctx(T0));
  const lane = (team: string) => s.lanes.find((l) => l.teamId === team)!;
  const runner = (l: RelayLane) => l.runners[l.runner % l.runners.length]!;
  const answer = (p: string, choice: number, now: number) => {
    const l = s.lanes.find((x) => x.runners.includes(p))!;
    return m.intent(s, p, "relay-answer", { leg: l.legs, choice }, ctx(now));
  };
  return { s, ctx, lane, runner, answer, players };
}

/** A Family Cup room with two teams of the given names, and an Official Relay started and past its briefing. */
function cupRelay(coralNames: string[], sunNames: string[]) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine("Family Cup", { kind: "cup", timing: 2 });
  engine.clock = () => t;
  const all = [...coralNames, ...sunNames];
  const ids = [engine.join(all[0]!, { asHost: true }).player.id];
  for (const n of all.slice(1)) ids.push(engine.join(n).player.id);
  const host = ids[0]!;
  const tm = engine.makeTeams(host, 2, 5);
  const [coral, sun] = tm.list.map((x) => x.id) as [string, string];
  ids.forEach((p, i) => engine.moveToTeam(host, p, i < coralNames.length ? coral : sun));
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  const g = engine.startGame(host, "relay", { official: true, seed: 9 });
  for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
  const game = engine.games.get(g.id)!;
  const st = game.extra as RelayState;
  const laneOf = (team: string) => st.lanes.find((l) => l.teamId === team)!;
  const runner = (l: RelayLane) => l.runners[l.runner % l.runners.length]!;
  /** The lane's runner answers right (after `ms`). */
  const leg = (team: string, ms = 200) => {
    t += ms;
    const l = laneOf(team);
    expect(send(runner(l), g.id, "relay-answer", { leg: l.legs, choice: st.questions[l.legs]!.correctIndex }).accepted).toBe(true);
  };
  const wrong = (team: string, ms = 200) => {
    t += ms;
    const l = laneOf(team);
    const q = st.questions[l.legs]!;
    expect(send(runner(l), g.id, "relay-answer", { leg: l.legs, choice: (q.correctIndex + 1) % q.options.length }).accepted).toBe(true);
  };
  return {
    engine, ids, host, coral, sun, g, game, st, laneOf, runner, leg, wrong, send,
    names: Object.fromEntries(all.map((n, i) => [n, ids[i]!])) as Record<string, string>,
    advance: (ms: number) => { t += ms; engine.tick(); },
    /**
     * The game's time limit arrives 1 s from now, as at the end of a slow race. (Jumping to the real limit would let
     * every turn on the way run out, 20 s at a time: four idle minutes, not a race cut short.)
     */
    timeUp: () => { game.deadlineAt = t + 1000; t += 1001; engine.tick(); },
    now: () => t,
  };
}
type CupRelay = ReturnType<typeof cupRelay>;
const qualified = (engine: RoomEngine) => engine.championshipResults().map((r) => r.playerId).sort();
const dayScore = (engine: RoomEngine, p: string) => engine.championshipResults().find((r) => r.playerId === p)?.dayScores;
const restored = (engine: RoomEngine) => RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
const tvGame = (engine: RoomEngine, gid: string) => (engine.project("tv")["games"] as Json[]).find((x) => x["id"] === gid)!;
const participation = (r: CupRelay) => r.game.outcome!.participation;

describe("R1: a runner's chances are their own turns (D-S1215R-01)", () => {
  it("pure: a fully active team of 3 against 2 — every runner answered every turn, so every runner took part fully", () => {
    const { s, lane, runner, answer, players } = pureRace(["k", "a", "z"], ["b", "w"]);
    let now = T0;
    for (let i = 0; i < RELAY_LEGS; i++) for (const team of ["team-coral", "team-sun"]) {
      const l = lane(team);
      if (l.legs < RELAY_LEGS) expect(answer(runner(l), 0, (now += 100)).ok).toBe(true);
    }
    expect(m.finished(s, { now, players, active: players, scale: 1 })).toBe(true);
    const part = m.participation(s, players).participation;
    for (const p of ["k", "a", "z"]) expect(part[p]).toEqual({ done: 4, of: 4, actions: 4 });
    for (const p of ["b", "w"]) expect(part[p]).toEqual({ done: 6, of: 6, actions: 6 });
    // Before the repair: { done: 4, of: 12 } for each of Coral's three, which fails "at least half".
    for (const p of players) expect(meaningful(part[p]!, POLICY)).toBe(true);
  });

  it.each([
    ["2 and 3", ["Keku", "Amina"], ["Baraka", "Wanjiru", "Zawadi"]],
    ["4 and 5", ["Keku", "Amina", "Juma", "Neema"], ["Baraka", "Wanjiru", "Zawadi", "Otieno", "Akinyi"]],
    ["3 and 4", ["Keku", "Amina", "Juma"], ["Baraka", "Wanjiru", "Zawadi", "Otieno"]],
  ])("room: an Official Relay in a Cup with teams of %s, everyone active: every runner qualifies, before and after a restore", (_, coralNames, sunNames) => {
    const r = cupRelay(coralNames, sunNames);
    // Sun gets home first: Coral runs a leg, then Sun runs two, until Sun is home; then Coral finishes.
    while (r.laneOf(r.sun).legs < RELAY_LEGS) {
      if (r.laneOf(r.coral).legs < RELAY_LEGS - 1) r.leg(r.coral);
      r.leg(r.sun);
    }
    while (r.laneOf(r.coral).legs < RELAY_LEGS) r.leg(r.coral);
    expect(r.game.status).toBe("finished");
    expect(r.engine.countsOfficially(r.game)).toBe(true);
    for (const p of r.ids) {
      const rec = participation(r)[p]!;
      expect(rec.of).toBeGreaterThanOrEqual(2);
      expect([rec.done, rec.actions]).toEqual([rec.of, rec.of]);
    }
    expect(qualified(r.engine)).toEqual([...r.ids].sort());
    const sunIds = sunNames.map((n) => r.names[n]!);
    for (const p of r.ids) expect(dayScore(r.engine, p)).toEqual([sunIds.includes(p) ? 100 : 0]);
    // The record is saved with the game: a restored room counts the same day the same way.
    const again = restored(r.engine);
    expect(qualified(again)).toEqual([...r.ids].sort());
    for (const p of r.ids) expect(dayScore(again, p)).toEqual(dayScore(r.engine, p));
  });

  it("room: wrong answers are actions; an idle runner's turns run out and never count for them, whatever the team does", () => {
    const r = cupRelay(["Keku", "Amina", "Zawadi"], ["Baraka", "Wanjiru"]);
    const [k, a, z] = [r.names["Keku"]!, r.names["Amina"]!, r.names["Zawadi"]!];
    // Sun runs home first (Coral's first runner, Keku, holds the baton meanwhile: 12 x 200 ms, well inside 20 s).
    while (r.laneOf(r.sun).legs < RELAY_LEGS) r.leg(r.sun);
    // Coral: Keku and Amina answer (Keku gets one wrong first each time); Zawadi never does, and her time runs out.
    let zTurns = 0;
    while (r.laneOf(r.coral).legs < RELAY_LEGS) {
      const who = r.runner(r.laneOf(r.coral));
      if (who === z) { r.advance(RELAY_TURN_MS + 1); zTurns++; continue; }
      if (who === k) { r.wrong(r.coral); r.advance(RELAY_FREEZE_MS + 1); }
      r.leg(r.coral);
    }
    expect(r.game.status).toBe("finished");
    const part = participation(r);
    expect(part[k]).toEqual({ done: 6, of: 6, actions: 12 });
    expect(part[a]).toEqual({ done: 6, of: 6, actions: 6 });
    expect(part[z]).toEqual({ done: 0, of: zTurns, actions: 0 });
    expect(zTurns).toBeGreaterThanOrEqual(5);
    expect(qualified(r.engine)).toEqual(r.ids.filter((p) => p !== z).sort());
    expect(qualified(restored(r.engine))).toEqual(r.ids.filter((p) => p !== z).sort());
  });

  it("room: a race cut off by the time limit — a turn still open counts only if its runner answered in it", () => {
    const r = cupRelay(["Keku", "Amina", "Zawadi"], ["Baraka", "Wanjiru"]);
    const [k, a, z, b, w] = ["Keku", "Amina", "Zawadi", "Baraka", "Wanjiru"].map((n) => r.names[n]!) as [string, string, string, string, string];
    for (let i = 0; i < 5; i++) { r.leg(r.coral); r.leg(r.sun); }
    // Coral's next runner (Amina: Keku, Amina, Zawadi, Keku, Amina ran) answers wrong and is still on it at the end;
    // Sun's next runner (Wanjiru) hasn't answered.
    expect([r.runner(r.laneOf(r.coral)), r.runner(r.laneOf(r.sun))]).toEqual([z, w]);
    r.wrong(r.coral);
    r.timeUp();
    expect(r.game.status).toBe("finished");
    const part = participation(r);
    expect(part[k]).toEqual({ done: 2, of: 2, actions: 2 });
    expect(part[a]).toEqual({ done: 2, of: 2, actions: 2 });
    expect(part[z]).toEqual({ done: 2, of: 2, actions: 2 }); // one leg run, plus the open turn she answered in
    expect(part[b]).toEqual({ done: 3, of: 3, actions: 3 });
    expect(part[w]).toEqual({ done: 2, of: 2, actions: 2 }); // the open turn she hadn't answered in isn't held against her
  });

  it("a Relay saved before this repair keeps the participation it was counted with", () => {
    const { s, lane, runner, answer, players } = pureRace(["k", "a", "z"], ["b", "w"]);
    for (const l of s.lanes) { delete l.turnsEnded; delete l.turnsAnswered; delete l.answersBy; delete l.turnAnswered; }
    let now = T0;
    for (let i = 0; i < 3; i++) expect(answer(runner(lane("team-coral")), 0, (now += 100)).ok).toBe(true);
    expect(m.participation(s, players).participation["k"]).toEqual({ done: 1, of: RELAY_LEGS, actions: 1 });
  });
});

describe("R4: a freeze ends on the TV when it ends on the phone (D-S1215R-04)", () => {
  it("pure: wrong at +1001 ms, frozen until +4001; at +4002 neither the lanes nor the runner's phone say frozen", () => {
    const { s, ctx, lane, runner, answer } = pureRace(["k", "a"], ["b", "w"]);
    const l = lane("team-coral");
    const k = runner(l);
    expect(answer(k, 1, T0 + 1001).ok).toBe(true);
    expect(l.frozenUntil).toBe(T0 + 1001 + RELAY_FREEZE_MS);
    const laneView = (now: number) => ((m.publicView(s, ctx(now))["lanes"] as Json[]).find((x) => x["teamId"] === "team-coral")!);
    expect(laneView(T0 + 4000)["frozen"]).toBe(true);
    expect(m.playerView(s, k, ctx(T0 + 4000))["frozenUntil"]).toBe(T0 + 4001);
    expect(laneView(T0 + 4002)["frozen"]).toBe(false);
    expect(m.playerView(s, k, ctx(T0 + 4002))["frozenUntil"]).toBeUndefined();
    expect(((m.playerView(s, k, ctx(T0 + 4002))["lanes"] as Json[]).find((x) => x["teamId"] === "team-coral")!)["frozen"]).toBe(false);
    // The room ticks at the freeze's end (before the 20 s turn ends), and that clears it.
    expect(m.dueAt!(s)).toBe(T0 + 4001);
    m.advance!(s, ctx(T0 + 4001));
    expect(l.frozenUntil).toBeUndefined();
    expect(runner(l)).toBe(k); // still their turn
    expect(m.dueAt!(s)).toBe(T0 + RELAY_TURN_MS);
  });

  it("room: the TV's lane stops saying frozen at the freeze's end with no other answer, and a reconnecting phone agrees", () => {
    const r = cupRelay(["Keku", "Amina"], ["Baraka", "Wanjiru"]);
    const k = r.runner(r.laneOf(r.coral));
    r.wrong(r.coral, 1001);
    const tvLane = () => ((tvGame(r.engine, r.g.id)["state"] as { lanes: Json[] }).lanes.find((x) => x["teamId"] === r.coral)!);
    expect(tvLane()["frozen"]).toBe(true);
    r.advance(RELAY_FREEZE_MS + 1);
    expect(r.laneOf(r.coral).frozenUntil).toBeUndefined();
    expect(tvLane()["frozen"]).toBe(false);
    const phone = ((r.engine.project("player", k)["myGames"] as Json[]) ?? []).find((x) => x["id"] === r.g.id)!;
    expect((phone["state"] as Json)["frozenUntil"]).toBeUndefined();
    expect(r.runner(r.laneOf(r.coral))).toBe(k);
  });
});

describe("R5: lanes still out at the end are placed by their last leg's time (D-S1215R-03)", () => {
  it("pure: equal legs rank by the earlier last leg; the same instant or no legs share a place; finished races unchanged", () => {
    const one = pureRace(["k", "a"], ["b", "w"]);
    let now = T0;
    for (let i = 0; i < 5; i++) {
      expect(one.answer(one.runner(one.lane("team-sun")), 0, (now += 100)).ok).toBe(true);
      expect(one.answer(one.runner(one.lane("team-coral")), 0, (now += 100)).ok).toBe(true);
    }
    expect(relayPlaces(one.s)).toEqual({ "team-sun": 1, "team-coral": 2 });
    expect(m.teamPlaces!(one.s)).toEqual({ "team-sun": 1, "team-coral": 2 });
    // The same instant: a shared place.
    one.lane("team-coral").lastLegAt = one.lane("team-sun").lastLegAt;
    expect(relayPlaces(one.s)).toEqual({ "team-sun": 1, "team-coral": 1 });
    // No legs: a shared place.
    const none = pureRace(["k", "a"], ["b", "w"]);
    expect(relayPlaces(none.s)).toEqual({ "team-coral": 1, "team-sun": 1 });
    // A finished race: the finish order, as before.
    const done = pureRace(["k", "a"], ["b", "w"]);
    now = T0;
    for (let i = 0; i < RELAY_LEGS; i++) expect(done.answer(done.runner(done.lane("team-coral")), 0, (now += 100)).ok).toBe(true);
    for (let i = 0; i < RELAY_LEGS; i++) expect(done.answer(done.runner(done.lane("team-sun")), 0, (now += 100)).ok).toBe(true);
    expect(relayPlaces(done.s)).toEqual({ "team-coral": 1, "team-sun": 2 });
  });

  it("room: equal legs at the time limit — Sun got there first: Sun ranks first everywhere, points stay equal, and a restore keeps it", () => {
    const r = cupRelay(["Keku", "Amina"], ["Baraka", "Wanjiru"]);
    for (let i = 0; i < 5; i++) { r.leg(r.sun); r.leg(r.coral); }
    r.timeUp();
    expect(r.game.status).toBe("finished");
    expect(r.game.outcome!.teamPlaces).toEqual({ [r.sun]: 1, [r.coral]: 2 });
    const check = (engine: RoomEngine) => {
      const g = tvGame(engine, r.g.id);
      const rows = g["teamResults"] as TeamResultRow[];
      expect(rows.map((x) => [x.teamId, x.rank, x.score])).toEqual([[r.sun, 1, 5 * RELAY_POINTS.leg], [r.coral, 2, 5 * RELAY_POINTS.leg]]);
      expect(teamWinnerLine(rows)).toBe(`${rows[0]!.name} wins`);
      const placement = g["cupPlacement"] as Record<string, number>;
      for (const p of r.ids) expect(placement[p]).toBe(r.game.teams!.members[p] === r.sun ? 100 : 0);
      for (const p of r.ids) expect(engine.championshipResults().find((x) => x.playerId === p)!.dayScores).toEqual([r.game.teams!.members[p] === r.sun ? 100 : 0]);
      const medals = placesOfGame({ id: r.g.id, gameId: "relay", status: "finished", rawScores: g["rawScores"] as Record<string, number>, teamResults: rows });
      for (const x of medals) expect(x.medal).toBe(r.game.teams!.members[x.playerId] === r.sun ? "gold" : "silver");
    };
    check(r.engine);
    check(restored(r.engine));
  });

  it("room: a game recorded without team places (before this repair) is placed by its scores, as it was", () => {
    const r = cupRelay(["Keku", "Amina"], ["Baraka", "Wanjiru"]);
    for (let i = 0; i < 5; i++) { r.leg(r.sun); r.leg(r.coral); }
    r.timeUp();
    delete r.game.outcome!.teamPlaces;
    const g = tvGame(r.engine, r.g.id);
    expect((g["teamResults"] as TeamResultRow[]).map((x) => x.rank)).toEqual([1, 1]);
    expect(Object.values(g["cupPlacement"] as Record<string, number>)).toEqual([50, 50, 50, 50]);
    // A damaged record (a team missing) is ignored the same way.
    r.game.outcome!.teamPlaces = { [r.sun]: 1 };
    expect(((tvGame(r.engine, r.g.id)["teamResults"]) as TeamResultRow[]).map((x) => x.rank)).toEqual([1, 1]);
  });
});
