/**
 * Stage 12.8 (docs/stage12/stage128.md): Team Huddle, a quiz a team answers together. The module (pure): majority and
 * ties, closing early only when every team agrees, scoring, sitting out, and what each screen may see. Then the room:
 * the night's teams or two dealt, privacy through the projections, a whole game, and Charades with 2–4 teams.
 */
import { describe, expect, it } from "vitest";
import { HUDDLE_POINTS, huddleTeamRound, teamHuddleModule as m, type HuddleQuestion, type HuddleState } from "../src/games/modules/teamHuddle.js";
import { newTeamList, type GameTeams } from "../src/shared/teams.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { randomUUID } from "node:crypto";
import { RoomEngine } from "../src/server/room.js";
import { charadesTotalTurns, currentActor, type CharadesState } from "../src/games/charades.js";

const Q = (n: number): HuddleQuestion[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, prompt: `Question ${i}?`, options: ["A", "B", "C", "D"], correctIndex: 1 }));
const players = ["k", "a", "b", "w"];
const teams: GameTeams = { list: newTeamList(2), members: { k: "team-coral", a: "team-coral", b: "team-sun", w: "team-sun" } };
const ctx = (active = players): ModuleContext => ({ now: 0, players, active, scale: 1 });
const fresh = (n = 2): HuddleState => m.init({ players, seed: 1, teams, huddle: Q(n) });
const pick = (s: HuddleState, p: string, choice: number) => m.intent(s, p, "huddle-pick", { round: s.round, choice }, ctx());

describe("Team Huddle (pure)", () => {
  it("a team's answer is its majority; a tie goes to the option picked first; nobody picking means no answer", () => {
    const s = fresh();
    pick(s, "k", 2); pick(s, "a", 1); // Coral: a tie, C picked first
    pick(s, "b", 1);                   // Sun: one pick, B
    expect(huddleTeamRound(s, 0, "team-coral")).toMatchObject({ answer: 2, counts: [0, 1, 1, 0], right: false, points: 0 });
    expect(huddleTeamRound(s, 0, "team-sun")).toMatchObject({ answer: 1, right: true, together: false, points: HUDDLE_POINTS.right });
    // Changing a pick moves it to the back of the queue: Keku switches to B, so Coral agrees on B.
    pick(s, "k", 1);
    expect(huddleTeamRound(s, 0, "team-coral")).toMatchObject({ answer: 1, right: true, together: true, points: HUDDLE_POINTS.right + HUDDLE_POINTS.together });
    const empty = fresh();
    expect(huddleTeamRound(empty, 0, "team-sun").answer).toBeNull();
  });

  it("closes early only once everyone has picked and every team agrees; otherwise time decides", () => {
    const s = fresh();
    pick(s, "k", 1); pick(s, "a", 1); pick(s, "b", 0);
    expect(s.phase).toBe("pick");
    pick(s, "w", 2); // everyone picked, Sun disagrees
    expect(s.phase).toBe("pick");
    pick(s, "w", 0); // Sun agrees now
    expect(s.phase).toBe("reveal");
    m.expirePhase(s, ctx());
    expect([s.round, s.phase]).toEqual([1, "pick"]);
    pick(s, "k", 3);
    m.expirePhase(s, ctx()); // time ran out: majority of whoever picked
    expect(s.phase).toBe("reveal");
    m.expirePhase(s, ctx());
    expect(s.phase).toBe("finished");
    // Round 1: Coral (k, a) B together = 125; Sun A = 0. Round 2: Coral D = 0.
    expect(m.scores(s, players)).toEqual({ k: 125, a: 125, b: 0, w: 0 });
  });

  it("a player who sits out doesn't hold the question open or cost the team its together bonus", () => {
    const s = fresh(1);
    expect(m.abstain(s, "a", ctx()).ok).toBe(true);
    pick(s, "k", 1); pick(s, "b", 1); pick(s, "w", 1);
    expect(s.phase).toBe("reveal");
    expect(huddleTeamRound(s, 0, "team-coral")).toMatchObject({ right: true, together: true, points: 125 });
    expect(m.intent(s, "a", "huddle-pick", { round: 0, choice: 1 }, ctx()).ok).toBe(false);
  });

  it("refuses a stale round, a bad option, a player on no team; the same pick twice keeps its place", () => {
    const s = fresh();
    expect(m.intent(s, "k", "huddle-pick", { round: 1, choice: 1 }, ctx())).toMatchObject({ ok: false, reason: "STALE_ROUND" });
    expect(m.intent(s, "k", "huddle-pick", { round: 0, choice: 4 }, ctx())).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    const lone = m.init({ players: [...players, "z"], seed: 1, teams, huddle: Q(1) });
    expect(m.intent(lone, "z", "huddle-pick", { round: 0, choice: 1 }, ctx([...players, "z"]))).toMatchObject({ ok: false, reason: "NOT_ON_A_TEAM" });
    pick(s, "k", 2); pick(s, "a", 1); pick(s, "k", 2);
    expect(huddleTeamRound(s, 0, "team-coral").answer).toBe(2);
  });

  it("teammates see each other's picks; the other team, the TV and spectators never see an option before the reveal", () => {
    const s = fresh();
    pick(s, "k", 3); pick(s, "b", 2);
    const coral = m.playerView(s, "a", { now: 0, scale: 1 });
    expect(coral["teammates"]).toEqual([{ playerId: "k", choice: 3, sat: false }]);
    const sun = m.playerView(s, "w", { now: 0, scale: 1 });
    expect(sun["teammates"]).toEqual([{ playerId: "b", choice: 2, sat: false }]);
    expect(JSON.stringify(sun)).not.toMatch(/"choice":3/);
    const tv = m.publicView(s, { now: 0, scale: 1 });
    // One of two picked: not agreed yet (agreeing needs the whole team).
    expect(tv["teamProgress"]).toEqual([{ teamId: "team-coral", picked: 1, of: 2, agreed: false }, { teamId: "team-sun", picked: 1, of: 2, agreed: false }]);
    pick(s, "a", 3);
    expect((m.publicView(s, { now: 0, scale: 1 })["teamProgress"] as { agreed: boolean }[])[0]!.agreed).toBe(true);
    expect(JSON.stringify(tv)).not.toMatch(/"choice"|correctIndex|"answer"/);
    // After the reveal everyone sees each team's answer and split.
    m.expirePhase(s, ctx());
    const after = m.publicView(s, { now: 0, scale: 1 }) as { result: { correctIndex: number; teams: { teamId: string; answer: number }[] } };
    expect(after.result.correctIndex).toBe(1);
    expect(after.result.teams.map((t) => t.answer)).toEqual([3, 2]);
  });

  it("participation counts picks; scores are the team's for every member", () => {
    const s = fresh(1);
    pick(s, "k", 1); pick(s, "b", 1);
    m.expirePhase(s, ctx());
    expect(m.participation(s, players).participation).toMatchObject({ k: { done: 1 }, a: { done: 0 }, b: { done: 1 }, w: { done: 0 } });
    expect(m.scores(s, players)).toEqual({ k: 100, a: 100, b: 100, w: 100 });
  });
});

// ---------------------------------------------------------------------------------------------- the room


type Json = Record<string, unknown>;

function room(n: number) {
  const engine = new RoomEngine("Huddle night", { kind: "casual", timing: 2 });
  const names = ["Keku", "Amina", "Baraka", "Wanjiru", "Otieno", "Zawadi", "Juma"];
  const ids = [engine.join(names[0]!, { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(names[i]!).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  const ready = (gid: string) => { for (const p of ids) send(p, gid, "briefing-ready", { ready: true }); };
  return { engine, ids, send, ready };
}

describe("Team Huddle in the room (D-S128-01, D-S128-02)", () => {
  it("with no teams in the room, the game deals two balanced teams of its own; eight questions from the Trivia pool", () => {
    const env = room(5);
    const g = env.engine.startGame(env.ids[0]!, "team-huddle", { official: false, seed: 3 });
    env.ready(g.id);
    const game = env.engine.games.get(g.id)!;
    expect(env.engine.teams).toBeNull();
    const sizes = game.teams!.list.map((t) => Object.values(game.teams!.members).filter((m) => m === t.id).length).sort();
    expect(sizes).toEqual([2, 3]);
    const st = game.extra as HuddleState;
    expect(st.questions).toHaveLength(8);
    expect(new Set(st.questions.map((q) => q.id)).size).toBe(8);
  });

  it("uses the night's teams (even while paused); teammates see each other's picks; other teams and the TV don't", () => {
    const env = room(4);
    const [k, a, b, w] = env.ids as [string, string, string, string];
    env.engine.makeTeams(k, 2, 1);
    for (const [p, t] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"]] as const) env.engine.moveToTeam(k, p, t);
    env.engine.renameTeam(k, "team-coral", "The Lions");
    env.engine.setTeamPlay(k, false);
    const g = env.engine.startGame(k, "team-huddle", { official: false, seed: 4 });
    env.ready(g.id);
    const game = env.engine.games.get(g.id)!;
    expect(game.teams!.members).toEqual({ [k]: "team-coral", [a]: "team-coral", [b]: "team-sun", [w]: "team-sun" });
    expect(game.teams!.list.find((t) => t.id === "team-coral")!.name).toBe("The Lions");
    const st = game.extra as HuddleState;
    const canary = (st.questions[0]!.correctIndex + 2) % 4;
    expect(env.send(k, g.id, "huddle-pick", { round: 0, choice: canary }).accepted).toBe(true);
    const mine = (env.engine.project("player", a)["myGames"] as Json[]).find((x) => x["id"] === g.id)!["state"] as Json;
    expect(mine["teammates"]).toEqual([{ playerId: k, choice: canary, sat: false }]);
    for (const viewer of [b, w]) {
      const other = (env.engine.project("player", viewer)["myGames"] as Json[]).find((x) => x["id"] === g.id)!["state"] as Json;
      expect(JSON.stringify(other["teammates"])).not.toContain(k);
    }
    const tvGame = (env.engine.project("tv")["games"] as Json[]).find((x) => x["id"] === g.id)!;
    expect(JSON.stringify(tvGame)).not.toMatch(/"choice"|"teammates"|"picks"|correctIndex/);
  });

  it("plays to the end; every player scores their team's points; the finished game has team results", () => {
    const env = room(4);
    const [k, a, b, w] = env.ids as [string, string, string, string];
    env.engine.makeTeams(k, 2, 1);
    for (const [p, t] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"]] as const) env.engine.moveToTeam(k, p, t);
    const g = env.engine.startGame(k, "team-huddle", { official: false, seed: 5 });
    env.ready(g.id);
    const game = env.engine.games.get(g.id)!;
    const st = game.extra as HuddleState;
    for (let r = 0; r < st.questions.length; r++) {
      const right = st.questions[r]!.correctIndex;
      // Coral always agrees on the right answer; Sun always agrees on a wrong one: each question closes early.
      for (const p of [k, a]) env.send(p, g.id, "huddle-pick", { round: r, choice: right });
      for (const p of [b, w]) env.send(p, g.id, "huddle-pick", { round: r, choice: (right + 1) % 4 });
      expect(st.phase).toBe("reveal");
      env.engine.tick((game.phaseDeadlineAt ?? 0) + 1);
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores).toEqual({ [k]: 1000, [a]: 1000, [b]: 0, [w]: 0 });
    const tv = (env.engine.project("tv")["games"] as Json[]).find((x) => x["id"] === g.id)!;
    expect((tv["teamResults"] as { teamId: string; score: number }[]).map((r) => [r.teamId, r.score])).toEqual([["team-coral", 1000], ["team-sun", 0]]);
  });
});

describe("Charades with the night's teams (D-S128-03)", () => {
  it("2–4 teams with equal turns; the teams' names; a smaller team's players act more than once", () => {
    const env = room(7);
    const k = env.ids[0]!;
    env.engine.makeTeams(k, 3, 2);
    const g = env.engine.startGame(k, "charades", { official: false, seed: 6 });
    env.ready(g.id);
    const game = env.engine.games.get(g.id)!;
    const st = game.extra as CharadesState;
    expect(st.teams).toHaveLength(3);
    expect(st.teamNames).toEqual(["Team Coral", "Team Sun", "Team Mint"]);
    expect(charadesTotalTurns(st)).toBe(9); // 3 teams × the largest team (3)
    const actingTeams: number[] = [];
    while (st.phase === "playing") {
      const actor = currentActor(st);
      actingTeams.push(st.teams.findIndex((t) => t.includes(actor)));
      expect(env.send(actor, g.id, "charades-turn", { outcome: "correct" }).accepted).toBe(true);
    }
    expect(actingTeams).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    expect(game.status).toBe("finished");
    expect(new Set(Object.values(game.rawScores))).toEqual(new Set([300]));
    expect((game.teams?.list ?? []).map((t) => t.id)).toEqual(["team-coral", "team-sun", "team-mint"]);
  });

  it("with no teams, two balanced teams dealt for the game, named on every screen", () => {
    const env = room(5);
    const g = env.engine.startGame(env.ids[0]!, "charades", { official: false, seed: 7 });
    env.ready(g.id); // a game in its briefing projects no state yet
    const st = env.engine.games.get(g.id)!.extra as CharadesState;
    expect(st.teams.map((t) => t.length).sort()).toEqual([2, 3]);
    expect(st.teamNames).toEqual(["Team Coral", "Team Sun"]);
    const pub = (env.engine.project("tv")["games"] as Json[]).find((x) => x["id"] === g.id)!["state"] as Json;
    expect(pub["teamNames"]).toEqual(["Team Coral", "Team Sun"]);
    expect(pub["totalTurns"]).toBe(6);
  });
});
