/**
 * Stage 12.12 (docs/stage12/stage1212.md): Territory (D-S1212-01 board, D-S1212-02 game). The board and the module are
 * pure; then the room: a whole game with the night's teams, its questions from the Trivia pool.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newTeamList, type GameTeams } from "../src/shared/teams.js";
import { TERRITORY_CELLS, TERRITORY_CENTRE, TERRITORY_HOMES, cellName, hexDistance, hexNeighbours, largestRegion } from "../src/shared/territoryBoard.js";
import { TERRITORY_CATCH_UP_GAP, TERRITORY_POINTS, TERRITORY_ROUNDS, claimableCells, territoryModule as m, territoryScores, type TerritoryState } from "../src/games/modules/territory.js";
import type { HuddleQuestion } from "../src/games/modules/teamHuddle.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint", IRIS = "team-iris";
const players = ["k", "a", "b", "w"];
const teams: GameTeams = { list: newTeamList(2), members: { k: CORAL, a: CORAL, b: SUN, w: SUN } };
const quiz: HuddleQuestion[] = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, prompt: `Question ${i}?`, options: ["Alpha", "Bravo", "Charlie", "Delta"], correctIndex: i % 4 }));
const T0 = 5_000_000;
const ctx = (now: number, ps: readonly string[] = players): ModuleContext => ({ now, players: ps, active: ps, scale: 1 });
function game(t: GameTeams = teams, ps: string[] = players): TerritoryState {
  const s = m.init({ players: ps, seed: 1, teams: t, quiz });
  m.onPlayStart(s, ctx(T0, ps));
  return s;
}
const right = (s: TerritoryState) => s.questions[s.round]!.correctIndex;
const wrong = (s: TerritoryState) => (right(s) + 1) % 4;
const answer = (s: TerritoryState, p: string, choice: number, now: number, ps = players) => m.intent(s, p, "territory-answer", { round: s.round, choice }, ctx(now, ps));
const claim = (s: TerritoryState, p: string, cell: number, now: number, ps = players) => m.intent(s, p, "territory-claim", { round: s.round, cell }, ctx(now, ps));

describe("the board (D-S1212-01)", () => {
  it("19 cells; the centre has 6 neighbours, a corner 3; homes are spread evenly", () => {
    expect(TERRITORY_CELLS).toHaveLength(19);
    expect(cellName(TERRITORY_CENTRE)).toBe("C3");
    expect(hexNeighbours(TERRITORY_CENTRE)).toHaveLength(6);
    for (const n of [2, 3, 4] as const) for (const h of TERRITORY_HOMES[n]) expect(hexNeighbours(h)).toHaveLength(3);
    expect(hexDistance(TERRITORY_HOMES[2][0]!, TERRITORY_HOMES[2][1]!)).toBe(4);
    const three = TERRITORY_HOMES[3];
    for (const x of three) for (const y of three) if (x !== y) expect(hexDistance(x, y)).toBe(4);
    // 4 teams: two pairs, each team 2 from its neighbour and 4 from the others' corners at least once.
    expect(new Set(TERRITORY_HOMES[4]).size).toBe(4);
    expect(TERRITORY_HOMES[4].map((h) => hexDistance(h, TERRITORY_CENTRE))).toEqual([2, 2, 2, 2]);
  });

  it("the biggest joined land counts cells that touch", () => {
    const owner: (string | null)[] = TERRITORY_CELLS.map(() => null);
    for (const c of [0, 1, 4, 18]) owner[c] = CORAL;
    expect(largestRegion(owner, CORAL)).toBe(3);
    expect(largestRegion(owner, SUN)).toBe(0);
  });
});

describe("Territory (pure)", () => {
  it("each team starts on its home; eight questions; equal scores", () => {
    const s = game();
    expect(s.homes).toEqual({ [CORAL]: TERRITORY_HOMES[2][0], [SUN]: TERRITORY_HOMES[2][1] });
    expect(s.questions).toHaveLength(TERRITORY_ROUNDS);
    expect(m.scores(s, players)).toEqual({ k: 15, a: 15, b: 15, w: 15 });
    const four: GameTeams = { list: newTeamList(4), members: { a1: CORAL, a2: CORAL, b1: SUN, b2: SUN, c1: MINT, c2: MINT, d1: IRIS, d2: IRIS } };
    const s4 = m.init({ players: Object.keys(four.members), seed: 1, teams: four, quiz });
    expect(Object.values(s4.homes)).toEqual([...TERRITORY_HOMES[4]]);
  });

  it("one tap answers for the team; nobody else learns what a team answered until the question closes", () => {
    const s = game();
    expect(answer(s, "k", wrong(s), T0 + 1000)).toMatchObject({ ok: true });
    expect(answer(s, "a", right(s), T0 + 1200)).toMatchObject({ ok: false, reason: "TEAM_ALREADY_ANSWERED" });
    expect(answer(s, "b", 7, T0 + 1300)).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(m.intent(s, "b", "territory-answer", { round: 3, choice: 0 }, ctx(T0))).toMatchObject({ ok: false, reason: "STALE_ROUND" });
    expect(m.intent(s, "zed", "territory-answer", { round: 0, choice: 0 }, ctx(T0))).toMatchObject({ ok: false, reason: "NOT_ON_A_TEAM" });
    const mate = m.playerView(s, "a", ctx(T0 + 1300)) as Record<string, unknown>;
    expect(mate["teamAnswer"]).toEqual({ choice: wrong(s), by: "k" });
    const other = m.playerView(s, "b", ctx(T0 + 1300)) as Record<string, unknown>;
    expect(other["teamAnswer"]).toBeUndefined();
    for (const v of [other, m.publicView(s, ctx(T0 + 1300))]) {
      const status = (v["teamStatus"] as { teamId: string; answered: boolean; choice?: number }[]);
      expect(status.find((x) => x.teamId === CORAL)).toEqual({ teamId: CORAL, answered: true });
      expect(v["correctIndex"]).toBeUndefined();
    }
    // Every team has answered: the question closes early.
    expect(answer(s, "w", right(s), T0 + 2000)).toMatchObject({ ok: true });
    expect(s.phase).toBe("claim");
    const tv = m.publicView(s, ctx(T0 + 2000)) as { correctIndex: number; teamStatus: { teamId: string; choice: number; right: boolean; seconds: number }[]; order: string[] };
    expect(tv.correctIndex).toBe(right(s));
    expect(tv.teamStatus.find((x) => x.teamId === SUN)).toMatchObject({ right: true, seconds: 2 });
    expect(tv.order).toEqual([SUN]);
  });

  it("only a team that got it right claims, a cell next to its land, once; homes can't be taken; picks stay hidden", () => {
    const s = game();
    answer(s, "k", wrong(s), T0 + 500);
    answer(s, "b", right(s), T0 + 900);
    expect(claim(s, "a", hexNeighbours(s.homes[CORAL]!)[0]!, T0 + 1000)).toMatchObject({ ok: false, reason: "NOT_RIGHT_THIS_ROUND" });
    const sunNext = claimableCells(s, SUN);
    expect(sunNext.sort()).toEqual(hexNeighbours(s.homes[SUN]!).sort());
    expect(claim(s, "w", s.homes[CORAL]!, T0 + 1000)).toMatchObject({ ok: false, reason: "CELL_NOT_CLAIMABLE" });
    expect(claim(s, "w", TERRITORY_CENTRE, T0 + 1000)).toMatchObject({ ok: false, reason: "CELL_NOT_CLAIMABLE" });
    expect(claim(s, "w", sunNext[0]!, T0 + 1000)).toMatchObject({ ok: true });
    expect(claim(s, "b", sunNext[1]!, T0 + 1100)).toMatchObject({ ok: false, reason: "TEAM_ALREADY_PICKED" });
    expect((m.playerView(s, "b", ctx(T0 + 1100)) as Record<string, unknown>)["teamPick"]).toEqual({ cell: sunNext[0], by: "w" });
    const coralView = JSON.stringify(m.playerView(s, "k", ctx(T0 + 1100)));
    expect(coralView).not.toContain("teamPick");
    expect((m.publicView(s, ctx(T0 + 1100))["teamStatus"] as { teamId: string; picked: boolean }[]).find((x) => x.teamId === SUN)).toMatchObject({ picked: true });
    expect(JSON.stringify(m.publicView(s, ctx(T0 + 1100)))).not.toContain("teamPick");
    m.expirePhase(s, ctx(T0 + 12_000));
    expect(s.owner[sunNext[0]!]).toBe(SUN);
    expect(s.resolved[0]).toEqual([{ teamId: SUN, cell: sunNext[0], from: null, auto: false, extra: false }]);
    expect(s.round).toBe(1);
    expect(s.phase).toBe("question");
  });

  it("a contested cell goes to the team that answered first; the slower team gets the nearest free cell; no pick: the game picks", () => {
    const four: GameTeams = { list: newTeamList(2), members: { k: CORAL, a: CORAL, b: SUN, w: SUN } };
    const s = game(four);
    // Grow both teams towards the centre so they can reach the same cell.
    s.owner[TERRITORY_CENTRE - 1] = CORAL; // C2, next to Coral's home C1
    s.owner[TERRITORY_CENTRE + 1] = SUN; // C4, next to Sun's home C5
    const contested = TERRITORY_CENTRE;
    answer(s, "b", right(s), T0 + 3000); // Sun first
    answer(s, "k", right(s), T0 + 4000); // Coral second
    expect(claim(s, "k", contested, T0 + 4500)).toMatchObject({ ok: true }); // Coral picks first, but answered later
    expect(claim(s, "w", contested, T0 + 5000)).toMatchObject({ ok: true });
    m.expirePhase(s, ctx(T0 + 15_000));
    const [first, second] = s.resolved[0]!;
    expect(first).toMatchObject({ teamId: SUN, cell: contested, auto: false });
    expect(second).toMatchObject({ teamId: CORAL, auto: true, wanted: contested });
    expect(s.owner[contested]).toBe(SUN);
    expect(s.owner[second!.cell]).toBe(CORAL);
    // Round 2: a right team that picks nothing still gets a cell.
    answer(s, "a", right(s), T0 + 16_000);
    m.expirePhase(s, ctx(T0 + 36_000));
    m.expirePhase(s, ctx(T0 + 46_000));
    expect(s.resolved[1]).toHaveLength(1);
    expect(s.resolved[1]![0]).toMatchObject({ teamId: CORAL, auto: true });
  });

  it("a steal takes another team's cell next to yours, and the scores follow the land", () => {
    const s = game();
    s.owner[TERRITORY_CENTRE - 1] = CORAL;
    s.owner[TERRITORY_CENTRE] = SUN;
    s.owner[TERRITORY_CENTRE + 1] = SUN;
    answer(s, "k", right(s), T0 + 1000);
    answer(s, "b", wrong(s), T0 + 2000);
    expect(claim(s, "k", TERRITORY_CENTRE, T0 + 3000)).toMatchObject({ ok: true });
    m.expirePhase(s, ctx(T0 + 13_000));
    expect(s.resolved[0]![0]).toMatchObject({ teamId: CORAL, cell: TERRITORY_CENTRE, from: SUN });
    const land = territoryScores(s);
    expect(land[CORAL]).toEqual({ cells: 3, region: 3, score: 3 * TERRITORY_POINTS.cell + 3 * TERRITORY_POINTS.region });
    // Sun's C4 is now cut off from its home C5? No: C4 and C5 touch, so its land is 2 cells in one region.
    expect(land[SUN]).toEqual({ cells: 2, region: 2, score: 2 * TERRITORY_POINTS.cell + 2 * TERRITORY_POINTS.region });
    expect(m.scores(s, players)).toMatchObject({ k: land[CORAL]!.score, b: land[SUN]!.score });
  });

  it("catch-up: a team alone in last place and 30+ behind gets one extra cell when right", () => {
    const s = game();
    // Sun far ahead: 4 more cells joined to its home.
    for (const c of [TERRITORY_CENTRE + 1, TERRITORY_CENTRE, 6, 10]) s.owner[c] = SUN;
    const totals = territoryScores(s);
    expect(totals[SUN]!.score - totals[CORAL]!.score).toBeGreaterThanOrEqual(TERRITORY_CATCH_UP_GAP);
    expect(m.publicView(s, ctx(T0))["catchUp"]).toBe(CORAL);
    answer(s, "k", right(s), T0 + 1000);
    answer(s, "b", wrong(s), T0 + 2000);
    m.expirePhase(s, ctx(T0 + 12_000));
    expect(s.resolved[0]!.map((c) => [c.teamId, c.extra])).toEqual([[CORAL, false], [CORAL, true]]);
  });

  it("no sitting out; a whole game ends after eight questions; the recap lists every round", () => {
    const s = game();
    expect(m.abstain(s, "k", ctx(T0)).ok).toBe(false);
    let t = T0;
    for (let r = 0; r < TERRITORY_ROUNDS; r++) {
      answer(s, "k", right(s), (t += 1000));
      answer(s, "b", right(s), (t += 1000));
      m.expirePhase(s, ctx((t += 10_000)));
    }
    expect(s.phase).toBe("finished");
    const pub = m.publicView(s, ctx(t)) as { rounds: { answer: string; claims: unknown[] }[] };
    expect(pub.rounds).toHaveLength(TERRITORY_ROUNDS);
    expect(pub.rounds[0]!.answer).toBe(quiz[0]!.options[quiz[0]!.correctIndex]);
    expect(m.participation(s, players).completedUnits).toBe(TERRITORY_ROUNDS);
    const totals = territoryScores(s);
    expect(totals[CORAL]!.cells + totals[SUN]!.cells).toBeLessThanOrEqual(19);
  });
});

describe("Territory in the room", () => {
  function room(names: string[]) {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Territory night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join(names[0]!, { asHost: true }).player.id];
    for (const n of names.slice(1)) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, advance: (ms: number) => { t += ms; engine.tick(); } };
  }

  it("a whole game with the night's teams: questions from the Trivia pool, answers hidden per team, team results", () => {
    const r = room(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const [k, a, b, w] = r.ids as [string, string, string, string];
    const tm = r.engine.makeTeams(k, 2, 5);
    const [c1, c2] = tm.list.map((x) => x.id) as [string, string];
    for (const [p, team] of [[k, c1], [a, c1], [b, c2], [w, c2]] as const) r.engine.moveToTeam(k, p, team);
    const g = r.engine.startGame(k, "territory", { official: false, seed: 4 });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    const game = r.engine.games.get(g.id)!;
    const st = game.extra as TerritoryState;
    expect(st.questions).toHaveLength(TERRITORY_ROUNDS);
    const stateOf = (pid: string) => (r.engine.project("player", pid) as { myGames: { id: string; state: Record<string, unknown> }[] }).myGames.find((x) => x.id === g.id)!.state;
    for (let round = 0; round < TERRITORY_ROUNDS; round++) {
      const q = st.questions[round]!;
      expect(r.send(k, g.id, "territory-answer", { round, choice: q.correctIndex }).accepted).toBe(true);
      // Sun's phones and the TV don't learn Coral's answer while the question is open.
      expect(JSON.stringify(stateOf(b))).not.toContain("\"teamAnswer\"");
      expect((r.engine.project("tv") as { games: { id: string; state: Record<string, unknown> }[] }).games.find((x) => x.id === g.id)!.state["correctIndex"]).toBeUndefined();
      expect(r.send(w, g.id, "territory-answer", { round, choice: (q.correctIndex + 1) % q.options.length }).accepted).toBe(true);
      expect(st.phase).toBe("claim");
      const cells = (stateOf(a)["claimable"] as number[]) ?? [];
      if (cells.length) expect(r.send(a, g.id, "territory-claim", { round, cell: cells[0] }).accepted).toBe(true);
      r.advance(11_000);
    }
    expect(game.status).toBe("finished");
    const tv = (r.engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    const results = tv["teamResults"] as { teamId: string; rank: number }[];
    expect(results).toHaveLength(2);
    expect(results.find((x) => x.teamId === c1)!.rank).toBe(1);
  });
});
