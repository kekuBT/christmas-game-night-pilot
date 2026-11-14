/**
 * Stage 12.9 (docs/stage12/stage129.md): Relay. The module (pure): the baton, the freeze, passing an absent runner,
 * places and scores, and what each screen may see. Then the room: a whole race.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RELAY_FREEZE_MS, RELAY_LEGS, RELAY_POINTS, RELAY_TURN_MS, relayModule as m, relayPlaces, type RelayQuestion, type RelayState } from "../src/games/modules/relay.js";
import { newTeamList, type GameTeams } from "../src/shared/teams.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

const Q: RelayQuestion[] = Array.from({ length: RELAY_LEGS }, (_, i) => ({ id: `r${i}`, prompt: `${i} + 1 = ?`, options: [i + 1, i + 2, i + 3, i + 4], correctIndex: 0 }));
const players = ["k", "a", "b", "w", "z"];
// Coral has three runners, Sun two.
const teams: GameTeams = { list: newTeamList(2), members: { k: "team-coral", a: "team-coral", z: "team-coral", b: "team-sun", w: "team-sun" } };
const T0 = 1_000_000;
const ctx = (now: number): ModuleContext => ({ now, players, active: players, scale: 1 });
function race(): RelayState {
  const s = m.init({ players, seed: 1, teams, relay: Q });
  m.onPlayStart(s, ctx(T0));
  return s;
}
const answer = (s: RelayState, p: string, choice: number, now: number) => {
  const lane = s.lanes.find((l) => l.runners.includes(p))!;
  return m.intent(s, p, "relay-answer", { leg: lane.legs, choice }, ctx(now));
};

describe("Relay (pure)", () => {
  it("only the runner answers; a right answer passes the baton; runners take turns (a smaller team's run more)", () => {
    const s = race();
    expect(answer(s, "a", 0, T0 + 10)).toMatchObject({ ok: false, reason: "NOT_YOUR_LEG" });
    expect(answer(s, "k", 0, T0 + 10)).toMatchObject({ ok: true });
    expect(answer(s, "a", 0, T0 + 20)).toMatchObject({ ok: true });
    expect(answer(s, "z", 0, T0 + 30)).toMatchObject({ ok: true });
    expect(answer(s, "k", 0, T0 + 40)).toMatchObject({ ok: true });
    const coral = s.lanes.find((l) => l.teamId === "team-coral")!;
    expect(coral.ranBy).toEqual(["k", "a", "z", "k"]);
    for (let i = 0; i < 4; i++) answer(s, ["b", "w"][i % 2]!, 0, T0 + 50 + i);
    expect(s.lanes.find((l) => l.teamId === "team-sun")!.ranBy).toEqual(["b", "w", "b", "w"]);
  });

  it("a wrong answer freezes the runner and greys the option out; the freeze ends", () => {
    const s = race();
    expect(answer(s, "k", 2, T0 + 100)).toMatchObject({ ok: true, result: { right: false } });
    expect(answer(s, "k", 0, T0 + 200)).toMatchObject({ ok: false, reason: "FROZEN" });
    expect(answer(s, "k", 2, T0 + 100 + RELAY_FREEZE_MS)).toMatchObject({ ok: false, reason: "ALREADY_TRIED" });
    expect(answer(s, "k", 0, T0 + 100 + RELAY_FREEZE_MS)).toMatchObject({ ok: true, result: { right: true } });
    expect(s.lanes.find((l) => l.teamId === "team-coral")!.wrong).toEqual([]);
  });

  it("a runner who doesn't answer in time is passed over on the same sum; the clock says when", () => {
    const s = race();
    expect(m.dueAt!(s)).toBe(T0 + RELAY_TURN_MS);
    m.advance!(s, ctx(T0 + RELAY_TURN_MS));
    const coral = s.lanes.find((l) => l.teamId === "team-coral")!;
    expect([coral.legs, coral.runners[coral.runner]]).toEqual([0, "a"]);
    expect(answer(s, "k", 0, T0 + RELAY_TURN_MS + 1)).toMatchObject({ ok: false, reason: "NOT_YOUR_LEG" });
    expect(answer(s, "a", 0, T0 + RELAY_TURN_MS + 1)).toMatchObject({ ok: true });
  });

  it("places and scores: legs, then the earlier finish; every runner scores their team's points", () => {
    const s = race();
    let t = T0;
    // Sun finishes all legs first; Coral is two legs short when the race is stopped.
    for (let i = 0; i < RELAY_LEGS; i++) answer(s, ["b", "w"][i % 2]!, 0, ++t);
    for (let i = 0; i < RELAY_LEGS - 2; i++) answer(s, ["k", "a", "z"][i % 3]!, 0, ++t);
    expect(s.finishOrder).toEqual(["team-sun"]);
    expect(relayPlaces(s)).toEqual({ "team-sun": 1, "team-coral": 2 });
    const sc = m.scores(s, players);
    expect(sc["b"]).toBe(RELAY_LEGS * RELAY_POINTS.leg + RELAY_POINTS.finish[0]);
    expect(sc["k"]).toBe((RELAY_LEGS - 2) * RELAY_POINTS.leg);
    expect(sc["a"]).toBe(sc["k"]);
    expect(m.finished(s, ctx(t))).toBe(false);
    for (let i = RELAY_LEGS - 2; i < RELAY_LEGS; i++) answer(s, ["k", "a", "z"][i % 3]!, 0, ++t);
    expect(m.finished(s, ctx(t))).toBe(true);
    expect(m.scores(s, players)["z"]).toBe(RELAY_LEGS * RELAY_POINTS.leg + RELAY_POINTS.finish[1]);
  });

  it("each phone sees only its own team's sum; the TV sees lanes, never a sum or an answer", () => {
    const s = race();
    answer(s, "k", 0, T0 + 1); // Coral moves to leg 1, Sun stays on leg 0
    const coralView = m.playerView(s, "a", { now: T0 + 2, scale: 1 });
    expect(coralView).toMatchObject({ myTeamId: "team-coral", myLeg: 1, prompt: Q[1]!.prompt, myTurn: true });
    const sunView = m.playerView(s, "b", { now: T0 + 2, scale: 1 });
    expect(sunView).toMatchObject({ myTeamId: "team-sun", myLeg: 0, prompt: Q[0]!.prompt });
    expect(JSON.stringify(sunView)).not.toContain(Q[1]!.prompt);
    const tv = m.publicView(s, { now: T0 + 2, scale: 1 });
    expect(JSON.stringify(tv)).not.toMatch(/prompt|options|correctIndex|"\d+ \+ 1 = \?"/);
    expect(tv["lanes"]).toEqual([
      expect.objectContaining({ teamId: "team-coral", legs: 1, runnerId: "a" }),
      expect.objectContaining({ teamId: "team-sun", legs: 0, runnerId: "b" }),
    ]);
  });

  it("nothing happens before the start; there's no sitting out", () => {
    const s = m.init({ players, seed: 1, teams, relay: Q });
    expect(m.dueAt!(s)).toBeUndefined();
    expect(m.intent(s, "k", "relay-answer", { leg: 0, choice: 0 }, ctx(T0))).toMatchObject({ ok: false, reason: "NOT_STARTED" });
    expect(m.abstain(s, "k", ctx(T0)).ok).toBe(false);
  });
});

describe("Relay in the room", () => {
  it("a whole race: teams dealt, the same sums for each team, finish order and team results", () => {
    const engine = new RoomEngine("Relay night", { kind: "casual", timing: 2 });
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const g = engine.startGame(ids[0]!, "relay", { official: false, seed: 9 });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const game = engine.games.get(g.id)!;
    const st = game.extra as RelayState;
    expect(st.startedAt).not.toBeNull();
    expect(st.lanes).toHaveLength(2);
    expect(st.questions).toHaveLength(RELAY_LEGS);
    for (let round = 0; round < RELAY_LEGS; round++) {
      for (const lane of st.lanes) {
        const runner = lane.runners[lane.runner]!;
        expect(send(runner, g.id, "relay-answer", { leg: lane.legs, choice: st.questions[lane.legs]!.correctIndex }).accepted).toBe(true);
      }
    }
    expect(game.status).toBe("finished");
    const tv = (engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    const rows = tv["teamResults"] as { teamId: string; rank: number }[];
    expect(rows.find((r) => r.teamId === st.finishOrder[0])!.rank).toBe(1);
  });

  it("time runs out mid-race: the race ends, and places and scores follow the legs run", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Relay night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const g = engine.startGame(ids[0]!, "relay", { official: false, seed: 9 });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const game = engine.games.get(g.id)!;
    const st = game.extra as RelayState;
    const [home, out] = st.lanes as [RelayState["lanes"][number], RelayState["lanes"][number]];
    const runLeg = (lane: RelayState["lanes"][number]) => {
      t += 500;
      expect(send(lane.runners[lane.runner]!, g.id, "relay-answer", { leg: lane.legs, choice: st.questions[lane.legs]!.correctIndex }).accepted).toBe(true);
    };
    for (let i = 0; i < RELAY_LEGS; i++) runLeg(home);
    for (let i = 0; i < 5; i++) runLeg(out);
    expect(game.status).toBe("playing");
    expect(game.deadlineAt).toBeDefined();
    t = game.deadlineAt! + 1;
    engine.tick();
    expect(game.status).toBe("finished");
    const tv = (engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    const rows = tv["teamResults"] as { teamId: string; rank: number; score: number }[];
    expect(rows.find((r) => r.teamId === home.teamId)).toMatchObject({ rank: 1, score: RELAY_LEGS * RELAY_POINTS.leg + RELAY_POINTS.finish[0] });
    expect(rows.find((r) => r.teamId === out.teamId)).toMatchObject({ rank: 2, score: 5 * RELAY_POINTS.leg });
    const lanes = (tv["state"] as { lanes: { teamId: string; legs: number; finished: boolean }[] }).lanes;
    expect(lanes.find((l) => l.teamId === out.teamId)).toMatchObject({ legs: 5, finished: false });
  });
});
