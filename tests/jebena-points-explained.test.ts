/**
 * Handoff 7059278886: Jebena Rush results explain each total. The server's standings carry the two earned parts,
 * `outlasted` (players out before this one) and `hearts` (cups still whole, 0 once out):
 * points = outlasted × 100 + hearts × 10. Accepted answers and timeouts are a separate participation stat.
 * The rule, the totals and the places are unchanged (a scoring change is a separate owner decision).
 *
 * Covered: the verified two-player 120–0 (module and a real room, with every projection and the room's scores);
 * a tie; an early exit (a player who leaves); the parts always making the total, over many seeded matches; and the
 * results copy, including an older server's standings without the parts.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { JEBENA_GRACE_MS, JEBENA_POINTS, jebenaModule, jebenaPoints, jebenaStandings, type JebenaState } from "../src/games/modules/jebena.js";
import { RoomEngine } from "../src/server/room.js";
import { JEBENA_POINT_PARTS, playedLine, pointsBreakdown, type JebenaStanding } from "../apps/web/src/ui/mchezo/lib/jebena.js";

type Json = Record<string, unknown>;
const ctx = (now: number, players: string[]) => ({ now, players, active: players, scale: 1 });
const unusedName = (s: JebenaState) => {
  const c = JEBENA_CATEGORIES.find((x) => x.id === s.category)!;
  return c.answers.find((a) => !(s.used[s.category] ?? []).includes(a.id))!.name;
};
const newGame = (seed: number, players: string[], hearts: number) => jebenaModule.init({ players, seed, settings: { hearts } } as never) as JebenaState;
function accept(s: JebenaState, now: number) {
  const r = jebenaModule.intent(s, s.turn!.player, "jebena-answer", { turn: s.turn!.n, text: unusedName(s) }, ctx(now, s.order));
  expect(r).toMatchObject({ ok: true, result: { verdict: "accepted" } });
}
const timeout = (s: JebenaState, now: number) => jebenaModule.expirePhase!(s, ctx(now, s.order) as never);
/** Every row's parts make its total, and the total is the rule's own. */
function expectPartsMakeTotals(s: JebenaState) {
  const pts = jebenaPoints(s);
  for (const r of jebenaStandings(s)) {
    expect(r.points, r.id).toBe(r.outlasted * JEBENA_POINTS.perOutlasted + r.hearts * JEBENA_POINTS.perHeart);
    expect(r.points, r.id).toBe(pts[r.id]);
    expect(pointsBreakdown(r), r.id).not.toBeNull();
  }
}
/** The verified example's moves: A = an accepted answer, T = the turn runs out. The first holder loses. */
const PLAN_120_0 = { loser: "AATAATAATAATAT", winner: "AATAATAATAAAA" };

describe("handoff 7059278886: the standings say how each total was earned", () => {
  it("the verified two-player 120–0: 100 for outlasting one player + 20 for two whole cups; the loser named 9 answers and scores 0", () => {
    const s = newGame(2024, ["a", "b"], 5);
    const loser = s.order[0]!;
    const winner = s.order[1]!;
    const plan: Record<string, string> = { [loser]: PLAN_120_0.loser, [winner]: PLAN_120_0.winner };
    const step: Record<string, number> = { [loser]: 0, [winner]: 0 };
    let now = 1;
    while (!s.end) {
      const who = s.turn!.player;
      const move = plan[who]![step[who]!]!;
      step[who] = step[who]! + 1;
      now += 1000;
      if (move === "A") accept(s, now); else timeout(s, now);
    }
    const rows = jebenaStandings(s);
    expect(rows).toEqual([
      { id: winner, place: 1, hearts: 2, out: false, satOut: false, answers: 10, timeouts: 3, outlasted: 1, points: 120 },
      { id: loser, place: 2, hearts: 0, out: true, satOut: false, answers: 9, timeouts: 5, outlasted: 0, points: 0 },
    ]);
    expect(pointsBreakdown(rows[0]!)).toBe("Outlasted 1 player (100) + 2 whole cups (20) = 120");
    expect(pointsBreakdown(rows[1]!)).toBe("Outlasted nobody (0) + no whole cups (0) = 0");
    expect(playedLine(rows[0]!)).toBe("Played: 10 answers · 3 timeouts");
    expect(playedLine(rows[1]!)).toBe("Played: 9 answers · 5 timeouts");
    expectPartsMakeTotals(s);
  });

  it("a tie: two players still in with the same cups share first place, with the same parts and the same total", () => {
    const s = newGame(7, ["a", "b", "c"], 3);
    const [first, second, third] = s.order as [string, string, string];
    // The third player's turns all run out (3 cups); the other two always answer. Then the match is cut (a limit).
    let now = 1;
    while (!s.per[third]!.outOrder) {
      now += 1000;
      if (s.turn!.player === third) timeout(s, now); else accept(s, now);
    }
    const rows = jebenaStandings(s);
    const top = rows.filter((r) => r.place === 1);
    expect(top.map((r) => r.id).sort()).toEqual([first, second].sort());
    for (const r of top) {
      expect(r).toMatchObject({ hearts: 3, out: false, outlasted: 1, points: 130 });
      expect(pointsBreakdown(r)).toBe("Outlasted 1 player (100) + 3 whole cups (30) = 130");
    }
    expect(rows.find((r) => r.id === third)).toMatchObject({ place: 3, outlasted: 0, points: 0, timeouts: 3 });
    expectPartsMakeTotals(s);
  });

  it("an early exit: a player who leaves first outlasts nobody; those who stay count them as outlasted", () => {
    const s = newGame(11, ["a", "b", "c"], 3);
    const [, mid, leaver] = s.order as [string, string, string];
    expect(jebenaModule.abstain(s, leaver, ctx(10, s.order) as never)).toEqual({ ok: true, wholeGameAbstain: true });
    // Then the middle player's turns run out until they are out too; the first one keeps the jebena.
    let now = 100;
    while (!s.end) {
      now += 1000;
      if (s.turn!.player === mid) timeout(s, now); else accept(s, now);
    }
    const rows = jebenaStandings(s);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[leaver]).toMatchObject({ satOut: true, out: true, outlasted: 0, hearts: 0, points: 0 });
    expect(pointsBreakdown(byId[leaver]!)).toBe("Outlasted nobody (0) + no whole cups (0) = 0");
    expect(byId[mid]).toMatchObject({ out: true, outlasted: 1, hearts: 0, points: 100 });
    expect(pointsBreakdown(byId[mid]!)).toBe("Outlasted 1 player (100) + no whole cups (0) = 100");
    const keeper = rows[0]!;
    expect(keeper).toMatchObject({ place: 1, out: false, outlasted: 2, hearts: 3, points: 230 });
    expect(pointsBreakdown(keeper)).toBe("Outlasted 2 players (200) + 3 whole cups (30) = 230");
    expectPartsMakeTotals(s);
  });

  it("the parts always make the total: 120 seeded matches with random play, 2 to 6 players, 3/5/7 cups, at every step", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const players = Array.from({ length: 2 + (seed % 5) }, (_, i) => `p${i}`);
      const s = newGame(seed, players, [3, 5, 7][seed % 3]!);
      let x = seed * 7919;
      let now = 1;
      for (let step = 0; step < 400 && !s.end; step++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        now += 1000;
        if (x % 7 === 0 && step > 3) { const who = s.order.find((id) => s.per[id]!.outOrder === null && id !== s.turn!.player); if (who) jebenaModule.abstain(s, who, ctx(now, s.order) as never); }
        else if (x % 3 === 0) timeout(s, now);
        else accept(s, now);
        if (step % 5 === 0 || s.end) expectPartsMakeTotals(s);
      }
    }
  });
});

describe("handoff 7059278886: in a real room, every projection carries the parts, and the room's scores are unchanged", () => {
  const T0 = 1_800_000_000_000;
  it("the 120–0 played through a room: the TV's and both players' standings explain 120 and 0; rawScores equal the totals", () => {
    const engine = new RoomEngine("JR points", { kind: "casual", timing: 2 });
    let t = T0;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id, engine.join("Amina").player.id];
    const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    engine.setLobbySettings(ids[0]!, "jebena-rush", { hearts: 5 }, engine.session.revision);
    const g = engine.startGame(ids[0]!, "jebena-rush", { official: false, settings: { hearts: 5 } });
    for (const p of ids) expect(send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    const game = engine.games.get(g.id)!;
    const st = () => game.extra as JebenaState;
    const loser = st().turn!.player;
    const winner = ids.find((id) => id !== loser)!;
    const plan: Record<string, string> = { [loser]: PLAN_120_0.loser, [winner]: PLAN_120_0.winner };
    const step: Record<string, number> = { [loser]: 0, [winner]: 0 };
    while (game.status === "playing") {
      const s = st();
      const who = s.turn!.player;
      const move = plan[who]![step[who]!]!;
      step[who] = step[who]! + 1;
      // An answer comes 100 ms into the turn; a timeout is the room's own: its tick just past the turn's deadline (the next turn starts at that deadline).
      if (move === "A") { t += 100; const r = send(who, g.id, "jebena-answer", { turn: s.turn!.n, text: unusedName(s) }); expect(r.accepted, JSON.stringify(r)).toBe(true); }
      else { t = Math.max(t, game.phaseDeadlineAt!) + JEBENA_GRACE_MS + 1; engine.tick(t); }
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores).toEqual({ [winner]: 120, [loser]: 0 });
    const views: [string, JebenaStanding[]][] = [
      ["tv", (engine.project("tv") as { games: { id: string; state: { standings: JebenaStanding[] } }[] }).games.find((x) => x.id === g.id)!.state.standings],
      ...ids.map((pid) => [pid, (engine.project("player", pid) as { myGames: { id: string; state: { standings: JebenaStanding[] } }[] }).myGames.find((x) => x.id === g.id)!.state.standings] as [string, JebenaStanding[]]),
    ];
    for (const [who, rows] of views) {
      expect(rows.map((r) => [r.id, r.outlasted, r.hearts, r.points, r.answers]), who).toEqual([[winner, 1, 2, 120, 10], [loser, 0, 0, 0, 9]]);
      expect(rows.map((r) => pointsBreakdown(r)), who).toEqual(["Outlasted 1 player (100) + 2 whole cups (20) = 120", "Outlasted nobody (0) + no whole cups (0) = 0"]);
      for (const r of rows) expect(r.points, who).toBe(game.rawScores[r.id]);
    }
  });
});

describe("handoff 7059278886: the results copy", () => {
  const row = (over: Partial<JebenaStanding>): JebenaStanding => ({ id: "x", place: 1, hearts: 0, out: false, satOut: false, answers: 0, timeouts: 0, points: 0, ...over });
  it("uses the rule's own numbers", () => {
    expect(JEBENA_POINT_PARTS).toEqual({ perOutlasted: JEBENA_POINTS.perOutlasted, perCup: JEBENA_POINTS.perHeart });
  });
  it("singular and plural; a winner who kept every cup; answers stay out of the points line", () => {
    expect(pointsBreakdown(row({ outlasted: 3, hearts: 1, points: 310 }))).toBe("Outlasted 3 players (300) + 1 whole cup (10) = 310");
    expect(pointsBreakdown(row({ outlasted: 0, hearts: 5, points: 50 }))).toBe("Outlasted nobody (0) + 5 whole cups (50) = 50");
    expect(pointsBreakdown(row({ outlasted: 1, hearts: 2, points: 120, answers: 30 }))).not.toMatch(/answer/);
    expect(playedLine(row({ answers: 1, timeouts: 1 }))).toBe("Played: 1 answer · 1 timeout");
    expect(playedLine(row({ answers: 0, timeouts: 0 }))).toBe("Played: 0 answers · 0 timeouts");
  });
  it("an older server's standings (no parts) or parts that don't make the total: no explanation, only the total", () => {
    expect(pointsBreakdown(row({ hearts: 2, points: 120 }))).toBeNull();
    expect(pointsBreakdown(row({ outlasted: 1, hearts: 2, points: 130 }))).toBeNull();
  });
});
