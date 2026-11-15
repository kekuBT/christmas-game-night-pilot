/**
 * Stage 12.15 (docs/stage12/stage1215.md; D-S1215-01): the seven games built for teams in a Family Cup. The owner's
 * answer of 2026-11-14: they count, Official or Practice like any Cup game. How they count is the owner-approved Cup
 * rule of 2026-11-04 (docs/CHAMPIONSHIP_RULES.md): a team game ranks its teams, every member gets the team's placement,
 * and a day is 75% individual + 25% team.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { midrankScore } from "../src/scoring/championship.js";
import { COMPETITION_FORMATS } from "../src/scoring/format.js";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { eligibleGames } from "../src/games/shuffle.js";
import { policyFor } from "../src/server/lifecycle.js";
import { TEAM_RANKED_GAMES } from "../src/shared/teams.js";
import { TUG_BOUTS, TUG_BOUT_MS, TUG_RESULT_MS, type TugState } from "../src/games/modules/tugOfWar.js";
import { awardsMedals, medalTable, placesOf, placesOfGame, podiumOf } from "../apps/web/src/ui/mchezo/lib/medals.js";
import { INDIVIDUAL_CUP_TEAM_GAME_NOTE, RoomEngine, StartRefused, partyModesError, type GameInstance } from "../src/server/room.js";

type Json = Record<string, unknown>;
const TEAM_GAMES = ["team-huddle", "relay", "split-clues", "team-draw", "territory", "tug-of-war", "know-your-rivals"];

function cupRoom(names: string[], opts: { timing?: 1 | 2; individual?: boolean } = {}) {
  let t = 1_800_000_000_000;
  let engine = new RoomEngine("Family Cup", { kind: "cup", timing: opts.timing ?? 1 });
  engine.clock = () => t;
  const ids = [engine.join(names[0]!, { asHost: true }).player.id];
  for (const n of names.slice(1)) ids.push(engine.join(n).player.id);
  if (opts.individual) {
    // An Individual Family Cup, made before Stage 12.15, the way it is saved.
    const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    snap["cup"] = { ...(snap["cup"] as Json), format: "individual-only" };
    engine = RoomEngine.fromJSON(snap);
    engine.clock = () => t;
    for (const p of ids) engine.markConnected(p);
  }
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  return { engine, ids, host: ids[0]!, send, tick: (ms: number) => { t += ms; engine.tick(); } };
}
/** A finished official game with these scores (as cup-integrity.test.ts does for a recorded result). */
function finish(g: GameInstance, scores: Record<string, number>) {
  g.status = "finished"; g.official = true; g.rawScores = scores; delete g.outcome;
}
const placementOf = (engine: RoomEngine, gid: string) =>
  ((engine.project("tv")["games"] as Json[]).find((x) => x["id"] === gid)!["cupPlacement"]) as Record<string, number> | undefined;

describe("which games, and which Cups", () => {
  it("new rooms are Family Cups: 75% individual, 25% team, and say so", () => {
    const { engine } = cupRoom(["Keku", "Amina"]);
    expect(engine.competitionFormat).toBe("combined-75-25");
    expect(engine.project("tv")["competition"]).toMatchObject({ format: "combined-75-25", label: "Family Cup", teamGamesCount: true, description: COMPETITION_FORMATS["combined-75-25"].description });
  });

  it("the seven team games can be Official in a Cup; Charades stays practice-only; none is ever picked automatically", () => {
    expect([...TEAM_RANKED_GAMES].sort()).toEqual([...TEAM_GAMES].sort());
    for (const id of TEAM_GAMES) {
      expect(policyFor(id).officialEligible).toBe(true);
      expect(GAME_REGISTRY.find((g) => g.id === id)!.casualOnly).toBeUndefined();
      expect(GAME_MANIFESTS.find((m) => m.id === id)!.features.official).toBe(true);
    }
    expect(policyFor("charades").officialEligible).toBe(false);
    const picked = eligibleGames(GAME_MANIFESTS, { mode: "random", playerCount: 6, seed: 1 }).map((m) => m.id);
    for (const id of TEAM_GAMES) expect(picked).not.toContain(id);
    expect(picked).toContain("charades"); // unchanged: Charades was always pickable
  });

  it("an Individual Family Cup (made before Stage 12.15) keeps its format: a team game is practice there, with the reason", () => {
    const { engine, host } = cupRoom(["Keku", "Amina", "Baraka", "Wanjiru"], { individual: true });
    expect(engine.competitionFormat).toBe("individual-only");
    try { engine.startGame(host, "team-huddle", { official: true }); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(StartRefused);
      expect((e as StartRefused).code).toBe("TEAM_GAMES_DONT_COUNT");
      expect((e as StartRefused).message).toBe(INDIVIDUAL_CUP_TEAM_GAME_NOTE);
    }
    expect(engine.games.size).toBe(0); // nothing started, nothing selected
    expect(engine.startGame(host, "team-huddle", { official: false }).official).toBe(false);
    // A lineup can't mark one Official there either.
    expect(partyModesError("cup", 4, [{ gameId: "relay", official: true }], false)).toMatch(/counts individual games only/);
    expect(partyModesError("cup", 4, [{ gameId: "relay", official: true }], true)).toBeNull();
    expect(partyModesError("cup", 4, [{ gameId: "relay" }], false)).toBeNull();
    expect(() => engine.savePartyPlan(host, 0, { expectedPlayers: 4, budgetMinutes: 30, items: [{ gameId: "relay", official: true }] })).toThrowError(/counts individual games only/);
  });

  it("a casual room made into a Family Cup: its lineup's team games become Official, and its teams stay", () => {
    const e = new RoomEngine("x", { kind: "casual" });
    const host = e.join("Keku", { asHost: true }).player.id;
    for (const n of ["Amina", "Baraka", "Wanjiru"]) e.join(n);
    e.makeTeams(host, 2, 4);
    e.savePartyPlan(host, 0, { expectedPlayers: 4, budgetMinutes: 30, items: [{ gameId: "tug-of-war" }, { gameId: "charades" }] });
    e.upgradeToCup(host);
    expect(e.competitionFormat).toBe("combined-75-25");
    expect(e.party?.items.map((i) => i.official)).toEqual([true, undefined]); // Charades stays practice-only
    expect(e.teams?.list).toHaveLength(2);
  });
});

describe("a team game in the Cup ranks its teams", () => {
  it("every member gets the team's placement, whatever the team's size (not the players' ranks)", () => {
    const { engine, ids, host } = cupRoom(["Keku", "Amina", "Zawadi", "Baraka", "Wanjiru"]);
    const [k, a, z, b, w] = ids as [string, string, string, string, string];
    const tm = engine.makeTeams(host, 2, 1);
    const [coral, sun] = tm.list.map((x) => x.id) as [string, string];
    for (const [p, team] of [[k, coral], [a, coral], [z, coral], [b, sun], [w, sun]] as const) engine.moveToTeam(host, p, team);
    const g = engine.startGame(host, "relay", { official: true, seed: 3 });
    expect(Object.values(g.teams!.members).sort()).toEqual([coral, coral, coral, sun, sun].sort()); // the night's teams
    finish(g, { [k]: 120, [a]: 120, [z]: 120, [b]: 70, [w]: 70 });
    const placed = placementOf(engine, g.id)!;
    expect(placed).toEqual({ [k]: 100, [a]: 100, [z]: 100, [b]: 0, [w]: 0 });
    // The old way (ranking the five players) would have given 75 and 12.5.
    expect(midrankScore(120, [120, 120, 120, 70, 70])).toBe(75);
    expect(midrankScore(70, [120, 120, 120, 70, 70])).toBe(12.5);
    expect(engine.officialStandings()).toEqual(placed);
  });

  it("three uneven teams with a tie for first: the tied teams share the average place", () => {
    const { engine, ids, host } = cupRoom(["Keku", "Amina", "Zawadi", "Baraka", "Wanjiru", "Juma", "Neema"]);
    const [k, a, z, b, w, j, n] = ids as [string, string, string, string, string, string, string];
    const tm = engine.makeTeams(host, 3, 1);
    const [coral, sun, mint] = tm.list.map((x) => x.id) as [string, string, string];
    for (const [p, team] of [[k, coral], [a, coral], [z, coral], [b, sun], [w, sun], [j, mint], [n, mint]] as const) engine.moveToTeam(host, p, team);
    const g = engine.startGame(host, "territory", { official: true, seed: 3 });
    finish(g, { [k]: 200, [a]: 200, [z]: 200, [b]: 200, [w]: 200, [j]: 90, [n]: 90 });
    expect(placementOf(engine, g.id)).toEqual({ [k]: 75, [a]: 75, [z]: 75, [b]: 75, [w]: 75, [j]: 0, [n]: 0 });
  });

  it("practice and casual team games show no Cup placement; an Official one only once finished", () => {
    const { engine, ids, host } = cupRoom(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const g = engine.startGame(host, "team-huddle", { official: true, seed: 2 });
    expect(placementOf(engine, g.id)).toBeUndefined();
    finish(g, Object.fromEntries(ids.map((p, i) => [p, i < 2 ? 100 : 0])));
    expect(placementOf(engine, g.id)).toBeDefined();
    const casual = new RoomEngine("c", { kind: "casual" });
    expect(JSON.stringify(casual.project("tv"))).not.toContain("cupPlacement");
  });

  it("a recorded Charades result keeps the players' ranking (Cups that already exist keep their numbers)", () => {
    const { engine, ids, host } = cupRoom(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const g = engine.startGame(host, "charades", { official: false });
    finish(g, { [ids[0]!]: 400, [ids[1]!]: 400, [ids[2]!]: 0, [ids[3]!]: 0 });
    expect(placementOf(engine, g.id)).toEqual({ [ids[0]!]: 83.33333333333333, [ids[1]!]: 83.33333333333333, [ids[2]!]: 16.666666666666668, [ids[3]!]: 16.666666666666668 });
  });
});

describe("a whole Official Tug of War in a Family Cup", () => {
  it("is played with the Cup's teams, ranks them, and is 25% of the day beside an individual game", () => {
    const { engine, ids, host, send, tick } = cupRoom(["Keku", "Amina", "Zawadi", "Baraka", "Wanjiru"], { timing: 2 });
    const [k, a, z, b, w] = ids as [string, string, string, string, string];
    const tm = engine.makeTeams(host, 2, 5);
    const [coral, sun] = tm.list.map((x) => x.id) as [string, string];
    for (const [p, team] of [[k, coral], [a, coral], [z, coral], [b, sun], [w, sun]] as const) engine.moveToTeam(host, p, team);
    const g = engine.startGame(host, "tug-of-war", { official: true, seed: 9 });
    expect(g.official).toBe(true);
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const st = engine.games.get(g.id)!.extra as TugState;
    for (let bout = 0; bout < TUG_BOUTS; bout++) {
      // Sun's two answer 2 each (2.0 per player), Coral's three 1 each (1.0): Sun wins every bout.
      for (const [p, n] of [[b, 2], [w, 2], [k, 1], [a, 1], [z, 1]] as const) {
        for (let i = 0; i < n; i++) {
          const me = st.progress[bout]![p]!;
          expect(send(p, g.id, "tug-answer", { bout, idx: me.idx, choice: st.sums[bout]![me.idx]!.correctIndex }).accepted).toBe(true);
        }
      }
      tick(TUG_BOUT_MS + 10);
      tick(TUG_RESULT_MS + 10);
    }
    const game = engine.games.get(g.id)!;
    expect(game.status).toBe("finished");
    expect(engine.countsOfficially(game)).toBe(true);
    expect(placementOf(engine, g.id)).toEqual({ [k]: 0, [a]: 0, [z]: 0, [b]: 100, [w]: 100 });
    // A day with only a team game: the team average at 100%.
    const day1 = engine.championshipResults();
    expect(day1.find((r) => r.playerId === b)!.dayScores).toEqual([100]);
    expect(day1.find((r) => r.playerId === k)!.dayScores).toEqual([0]);
    // Then an individual game the same day: Keku wins it, Wanjiru is last.
    const tr = engine.startGame(host, "trivia", { official: true, seed: 4 });
    for (const p of ids) send(p, tr.id, "briefing-ready", { ready: true });
    const trivia = engine.games.get(tr.id)!;
    const qs = (trivia.extra as { questions: { id: string; correctIndex: number }[] }).questions;
    const right: Record<string, number> = { [k]: 10, [a]: 7, [z]: 5, [b]: 3, [w]: 1 };
    for (const p of ids) qs.forEach((q, i) => { tick(300); send(p, tr.id, "trivia-answer", { questionId: q.id, chosenIndex: i < right[p]! ? q.correctIndex : (q.correctIndex + 1) % 4 }); });
    expect(trivia.status).toBe("finished");
    const solo = (p: string) => midrankScore(trivia.rawScores[p]!, Object.values(trivia.rawScores));
    const res = engine.championshipResults();
    for (const [p, team] of [[k, 0], [a, 0], [z, 0], [b, 100], [w, 100]] as const) {
      expect(res.find((r) => r.playerId === p)!.dayScores).toEqual([0.75 * solo(p) + 0.25 * team]);
    }
  });
});

describe("teams in a Family Cup", () => {
  it("the host makes them; team games use them, every other game stays individual", () => {
    const { engine, ids, host } = cupRoom(["Keku", "Amina", "Zawadi", "Baraka", "Wanjiru", "Juma"]);
    const tm = engine.makeTeams(host, 3, 2);
    expect(engine.project("tv")["teams"]).toMatchObject({ list: tm.list });
    const huddle = engine.startGame(host, "team-huddle", { official: false, seed: 1 });
    expect(huddle.teams!.list.map((t) => t.id)).toEqual(tm.list.map((t) => t.id));
    expect(Object.keys(huddle.teams!.members).sort()).toEqual([...ids].sort());
    huddle.status = "finished"; // done with it (only one game runs at a time)
    const trivia = engine.startGame(host, "trivia", { official: true, seed: 1 });
    expect(trivia.teams).toBeUndefined(); // "play as teams" is a casual-room feature
    expect(() => engine.makeTeams(ids[1]!, 2)).toThrowError(/host or a cohost/);
    const solo = new RoomEngine("s", { kind: "solo" });
    const me = solo.join("Keku", { asHost: true }).player.id;
    expect(() => solo.makeTeams(me, 2)).toThrowError(/game nights and Family Cups/);
  });
});

describe("TV medals for a game built for teams (display only)", () => {
  const team = (members: string[], score: number | null, rank: number | null) => ({ members, score, rank });
  it("go by team place: the whole winning team gets gold, the next team silver, then bronze", () => {
    const g = { id: "g1", gameId: "team-draw", status: "finished", rawScores: { k: 100, a: 100, z: 100, b: 75, w: 75, j: 55, n: 55 },
      teamResults: [team(["k", "a", "z"], 100, 1), team(["b", "w"], 75, 2), team(["j", "n"], 55, 3)] };
    const medal = Object.fromEntries(placesOfGame(g).map((p) => [p.playerId, p.medal]));
    expect(medal).toEqual({ k: "gold", a: "gold", z: "gold", b: "silver", w: "silver", j: "bronze", n: "bronze" });
    // Ranking the seven players instead (the old way) gave the second team no medal: it shared 4th place.
    expect(placesOf(g.rawScores).filter((p) => p.playerId === "b")[0]!.medal).toBeNull();
    expect(medalTable([g], (id) => id).rows.find((r) => r.playerId === "w")).toMatchObject({ silver: 1 });
    expect(podiumOf(g)!.map((s) => s.players.map((p) => p.playerId))).toEqual([["a", "k", "z"], ["b", "w"], ["j", "n"]]);
  });
  it("no medals when every team tied or scored nothing; other games still place their players", () => {
    const tied = { id: "g2", gameId: "relay", status: "finished", rawScores: { k: 40, b: 40 }, teamResults: [team(["k"], 40, 1), team(["b"], 40, 1)] };
    expect(awardsMedals(tied)).toBe(false);
    const zero = { id: "g3", gameId: "relay", status: "finished", rawScores: { k: 30, b: 0 }, teamResults: [team(["k"], 30, 1), team(["b"], 0, 2)] };
    expect(placesOfGame(zero).map((p) => p.medal)).toEqual(["gold", null]);
    // Trivia played as teams (Stage 12.7) keeps per-player medals.
    const trivia = { id: "g4", gameId: "trivia", status: "finished", rawScores: { k: 900, a: 300, b: 600 }, teamResults: [team(["k", "a"], 600, 1), team(["b"], 600, 1)] };
    expect(Object.fromEntries(placesOfGame(trivia).map((p) => [p.playerId, p.medal]))).toEqual({ k: "gold", b: "silver", a: "bronze" });
  });
});
