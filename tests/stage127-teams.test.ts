/**
 * Stage 12.7 (docs/stage12/stage127.md): teams for the night. The rules (pure), the room (who may change teams, how a
 * newcomer joins, what a game copies at its start), team results from real games, persistence, and HTTP.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { TEAM_PLAY_GAMES, balanceTeams, checkTeamName, newTeamList, smallestTeam, teamResults, teamWinnerLine, teamWins, type GameTeams } from "../src/shared/teams.js";
import { RoomEngine, TeamsRefused } from "../src/server/room.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { FakeClock, Harness, type Player } from "./helpers/harness.js";

type Json = Record<string, unknown>;

describe("the rules (pure)", () => {
  it("2–4 named, coloured teams; a balance differs by at most one and is the same for the same seed", () => {
    expect(newTeamList(3).map((t) => [t.id, t.name, t.color])).toEqual([["team-coral", "Team Coral", "coral"], ["team-sun", "Team Sun", "sun"], ["team-mint", "Team Mint", "mint"]]);
    expect(newTeamList(9)).toHaveLength(4);
    expect(newTeamList(1)).toHaveLength(2);
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const list = newTeamList(3);
    const m = balanceTeams(ids, list, 42);
    const sizes = list.map((t) => Object.values(m).filter((x) => x === t.id).length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(balanceTeams(ids, list, 42)).toEqual(m);
    expect(Object.keys(m).sort()).toEqual(ids);
  });

  it("a newcomer joins the smallest team; names are checked", () => {
    const list = newTeamList(2);
    expect(smallestTeam({ list, members: { a: "team-coral", b: "team-coral", c: "team-sun" } }, ["a", "b", "c"])).toBe("team-sun");
    expect(smallestTeam({ list, members: { a: "team-coral", b: "team-sun" } }, ["a", "b"])).toBe("team-coral");
    expect(checkTeamName("  The   Lions ")).toEqual({ ok: true, name: "The Lions" });
    expect(checkTeamName("")).toMatchObject({ ok: false });
    expect(checkTeamName("x".repeat(21))).toMatchObject({ ok: false });
  });

  it("team results: the average of members who took part (a small team can win); ties share; nobody played means no score", () => {
    const teams: GameTeams = { list: newTeamList(3), members: { a: "team-coral", b: "team-coral", c: "team-coral", d: "team-sun", e: "team-mint" } };
    const rows = teamResults(teams, { a: 300, b: 100, c: 0, d: 250, e: 0 }, (p) => p !== "c" && p !== "e");
    expect(rows.map((r) => [r.name, r.score, r.rank, r.counted])).toEqual([["Team Sun", 250, 1, ["d"]], ["Team Coral", 200, 2, ["a", "b"]], ["Team Mint", null, null, []]]);
    expect(teamWinnerLine(rows)).toBe("Team Sun wins");
    const tie = teamResults({ list: newTeamList(2), members: { a: "team-coral", b: "team-sun" } }, { a: 5, b: 5 }, () => true);
    expect(tie.map((r) => r.rank)).toEqual([1, 1]);
    expect(teamWinnerLine(tie)).toBe("Every team tied");
    const wins = teamWins([{ teamResults: rows }, { teamResults: tie }], newTeamList(3));
    expect(wins.map((w) => [w.name, w.wins, w.played])).toEqual([["Team Sun", 1, 2], ["Team Coral", 0, 2], ["Team Mint", 0, 0]]);
  });

  it("the team games are the competitive per-player games, not Impostor, Charades or Spectrum", () => {
    const expected = GAME_MANIFESTS.filter((m) => m.competition === "competitive" && m.scoring.type === "per-player-points" && !m.scoring.teamDerived && m.id !== "impostor").map((m) => m.id).sort();
    expect([...TEAM_PLAY_GAMES].sort()).toEqual(expected);
    expect(TEAM_PLAY_GAMES.size).toBe(14);
  });
});

function room(n: number, kind: "casual" | "cup" = "casual") {
  const engine = new RoomEngine("Teams night", { kind, timing: 2 });
  const names = ["Keku", "Amina", "Baraka", "Wanjiru", "Otieno", "Zawadi"];
  const ids = [engine.join(names[0]!, { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(names[i]!).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  return { engine, ids, send };
}

describe("teams in the room (D-S127-01)", () => {
  it("the host or a cohost makes, moves, renames, pauses and clears teams; a guest can't; a Family Cup can't", () => {
    const { engine, ids } = room(5);
    const [host, guest] = ids as [string, string];
    expect(() => engine.makeTeams(guest, 2)).toThrow(TeamsRefused);
    const t = engine.makeTeams(host, 2, 7);
    expect(Object.keys(t.members).sort()).toEqual([...ids].sort());
    const r0 = t.revision;
    const target = t.list.find((x) => x.id !== t.members[guest])!.id;
    engine.moveToTeam(host, guest, target);
    expect(engine.teams!.members[guest]).toBe(target);
    expect(engine.teams!.revision).toBe(r0 + 1);
    expect(() => engine.moveToTeam(host, guest, t.list[0]!.id, r0)).toThrowError(/changed since you looked/);
    engine.renameTeam(host, "team-coral", "The Lions");
    expect(() => engine.renameTeam(host, "team-sun", "the lions")).toThrowError(/Another team has that name/);
    expect(() => engine.makeTeams(host, 5)).toThrowError(/2 to 4/);
    engine.setTeamPlay(host, false);
    expect(engine.teams!.paused).toBe(true);
    engine.setTeamPlay(host, true);
    expect(engine.teams!.paused).toBeUndefined();
    engine.clearTeams(host);
    expect(engine.teams).toBeNull();
    const cup = room(3, "cup");
    try { cup.engine.makeTeams(cup.ids[0]!, 2); expect.unreachable(); } catch (e) { expect((e as TeamsRefused).code).toBe("NOT_A_CASUAL_ROOM"); }
  });

  it("a newcomer joins the smallest team; the teams are public on every screen and saved with the room", () => {
    const { engine, ids } = room(3);
    engine.makeTeams(ids[0]!, 2, 3);
    const late = engine.join("Zawadi").player.id;
    const sizes = engine.teams!.list.map((t) => Object.values(engine.teams!.members).filter((m) => m === t.id).length);
    expect(sizes.sort()).toEqual([2, 2]);
    expect(engine.teams!.members[late]).toBeDefined();
    expect(engine.project("tv")["teams"]).toEqual(engine.teams);
    expect(engine.project("player", ids[1]!)["teams"]).toEqual(engine.teams);
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    expect(restored.teams).toEqual(engine.teams);
    const bad = JSON.parse(JSON.stringify(engine.toJSON()));
    bad.teams.list[0].color = "purple";
    expect(RoomEngine.fromJSON(bad).teams).toBeNull();
    const twice = JSON.parse(JSON.stringify(engine.toJSON()));
    twice.teams.list[1].color = twice.teams.list[0].color;
    expect(RoomEngine.fromJSON(twice).teams).toBeNull();
  });

  it("making teams again keeps a kept team's name; a revision is never given out twice, even after No teams tonight", () => {
    const { engine, ids } = room(4);
    const host = ids[0]!;
    engine.makeTeams(host, 2, 1);
    engine.renameTeam(host, "team-coral", "Team Mint");
    const three = engine.makeTeams(host, 3, 2);
    expect(three.list.map((t) => t.name)).toEqual(["Team Mint", "Team Sun", "Team Mint 2"]);
    const old = engine.teams!.revision;
    engine.clearTeams(host);
    const again = engine.makeTeams(host, 2, 3);
    expect(again.revision).toBeGreaterThan(old);
    // An old view (from before the clear) can't move anyone in the new teams.
    expect(() => engine.moveToTeam(host, ids[1]!, "team-sun", old)).toThrowError(/changed since you looked/);
    // The counter survives a restart too.
    engine.clearTeams(host);
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    expect(restored.teams).toBeNull();
    expect(restored.makeTeams(host, 2, 4).revision).toBeGreaterThan(again.revision);
  });
});

describe("games played as teams (D-S127-02)", () => {
  function playMath(env: ReturnType<typeof room>, right: Record<string, number>) {
    const g = env.engine.startGame(env.ids[0]!, "math-mayhem", { official: false, seed: 5 });
    for (const p of env.ids) env.send(p, g.id, "briefing-ready", { ready: true });
    const game = env.engine.games.get(g.id)!;
    for (const p of env.ids) {
      for (const [n, q] of (game.questions ?? []).entries()) {
        env.send(p, g.id, "math-open", { questionId: q.id });
        env.send(p, g.id, "submit-math-answer", { questionId: q.id, chosenIndex: n < (right[p] ?? 0) ? q.correctIndex : (q.correctIndex + 1) % q.options.length });
      }
    }
    return game;
  }

  it("a team game copies the teams at its start; the finished game's team results are public; later moves don't change it", () => {
    const env = room(4);
    const [k, a, b, w] = env.ids as [string, string, string, string];
    env.engine.makeTeams(k, 2, 1);
    for (const [p, t] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"]] as const) env.engine.moveToTeam(k, p, t);
    const game = playMath(env, { [k]: 10, [a]: 0, [b]: 5, [w]: 5 });
    expect(game.status).toBe("finished");
    expect(game.teams!.members).toEqual({ [k]: "team-coral", [a]: "team-coral", [b]: "team-sun", [w]: "team-sun" });
    const tv = (env.engine.project("tv")["games"] as Json[]).find((g) => g["id"] === game.id)!;
    const rows = tv["teamResults"] as { teamId: string; score: number; rank: number }[];
    const coral = rows.find((r) => r.teamId === "team-coral")!, sun = rows.find((r) => r.teamId === "team-sun")!;
    expect(coral.score).toBe(Math.round((game.rawScores[k]! + game.rawScores[a]!) / 2));
    expect(sun.score).toBe(Math.round((game.rawScores[b]! + game.rawScores[w]!) / 2));
    // Moving a player afterwards changes the room's teams, never a finished game's.
    env.engine.moveToTeam(k, a, "team-sun");
    expect(env.engine.games.get(game.id)!.teams!.members[a]).toBe("team-coral");
    // The player's own projection carries the same team facts.
    const mine = (env.engine.project("player", a)["myGames"] as Json[]).find((g) => g["id"] === game.id)!;
    expect(mine["teamResults"]).toEqual(tv["teamResults"]);
  });

  it("no team copy: paused teams, a game that isn't a team game, or teams with only one side playing", () => {
    const env = room(4);
    const k = env.ids[0]!;
    env.engine.makeTeams(k, 2, 1);
    env.engine.setTeamPlay(k, false);
    expect(env.engine.startGame(k, "trivia", { official: false }).teams).toBeUndefined();
    env.engine.cancelBriefing(k, [...env.engine.games.keys()].at(-1)!);
    env.engine.setTeamPlay(k, true);
    expect(env.engine.startGame(k, "impostor", { official: false }).teams).toBeUndefined();
    env.engine.cancelBriefing(k, [...env.engine.games.keys()].at(-1)!);
    for (const p of env.ids) env.engine.moveToTeam(k, p, "team-coral");
    expect(env.engine.startGame(k, "trivia", { official: false }).teams).toBeUndefined();
  });
});

describe("over HTTP", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("POST /rooms/:id/teams: statuses, and the reply carries the teams", async () => {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    const r = await h.post("/rooms", { name: "Night", kind: "casual" });
    h.roomId = r.body["roomId"] as string;
    h.joinCode = r.body["joinCode"] as string;
    h.hostClaimToken = r.body["hostClaimToken"] as string;
    const host: Player = await h.join("Keku", { host: true });
    const amina: Player = await h.join("Amina");
    const post = (p: Player, body: unknown) => h!.post(`/rooms/${h!.roomId}/teams`, body, p.token);
    expect((await post(amina, { action: "make", count: 2 })).status).toBe(403);
    expect((await post(host, { action: "make", count: 7 })).status).toBe(400);
    expect((await post(host, { action: "move", playerId: amina.playerId, teamId: "team-sun" })).status).toBe(409);
    const made = await post(host, { action: "make", count: 2 });
    expect(made.status).toBe(200);
    const teams = made.body["teams"] as { revision: number; members: Record<string, string> };
    expect(Object.keys(teams.members).sort()).toEqual([host.playerId, amina.playerId].sort());
    expect((await post(host, { action: "move", playerId: amina.playerId, teamId: "team-nope" })).status).toBe(404);
    const stale = await post(host, { action: "move", playerId: amina.playerId, teamId: "team-sun", baseRevision: teams.revision - 1 });
    expect([stale.status, stale.body["code"]]).toEqual([409, "STALE"]);
    expect((await post(host, { action: "rename", teamId: "team-sun", name: "Simba" })).status).toBe(200);
    expect((await post(host, { action: "play", on: false })).status).toBe(200);
    expect((await post(host, { action: "clear" })).status).toBe(200);
    expect((await h.tv())["teams"]).toBeUndefined();
  });
});
