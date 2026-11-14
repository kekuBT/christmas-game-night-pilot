/**
 * Stage 12.13 (docs/stage12/stage1213.md): Tug of War (D-S1213-01). The module is pure; then the room: a whole game
 * with the night's teams of uneven size.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newTeamList, type GameTeams } from "../src/shared/teams.js";
import { TUG_BOUTS, TUG_BOUT_MS, TUG_CATCH_UP, TUG_FREEZE_MS, TUG_RESULT_MS, TUG_SUMS_PER_BOUT, tugOfWarModule as m, tugPlaces, tugPulls, type TugState } from "../src/games/modules/tugOfWar.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint";
// Coral has 3 players, Sun 2.
const players = ["k", "a", "z", "b", "w"];
const teams: GameTeams = { list: newTeamList(2), members: { k: CORAL, a: CORAL, z: CORAL, b: SUN, w: SUN } };
const T0 = 7_000_000;
const ctx = (now: number, ps: readonly string[] = players): ModuleContext => ({ now, players: ps, active: ps, scale: 1 });
function game(seed = 11, t: GameTeams = teams, ps: string[] = players): TugState {
  const s = m.init({ players: ps, seed, teams: t });
  m.onPlayStart(s, ctx(T0, ps));
  return s;
}
const cur = (s: TugState, p: string) => s.sums[s.bout]![s.progress[s.bout]![p]!.idx]!;
const answer = (s: TugState, p: string, right: boolean, now: number, ps = players) => {
  const sum = cur(s, p);
  const choice = right ? sum.correctIndex : (sum.correctIndex + 1) % sum.options.length;
  return m.intent(s, p, "tug-answer", { bout: s.bout, idx: s.progress[s.bout]![p]!.idx, choice }, ctx(now, ps));
};

describe("Tug of War (pure)", () => {
  it("three bouts of the same seeded sums for everyone, a new set each bout", () => {
    const s = game();
    expect(s.sums).toHaveLength(TUG_BOUTS);
    for (const b of s.sums) expect(b).toHaveLength(TUG_SUMS_PER_BOUT);
    expect(s.sums[0]!.map((q) => q.prompt)).not.toEqual(s.sums[1]!.map((q) => q.prompt));
    expect(game(11).sums).toEqual(s.sums);
    // Everyone starts on the same first sum.
    for (const p of players) expect((m.playerView(s, p, ctx(T0)) as { sum: { prompt: string } }).sum.prompt).toBe(s.sums[0]![0]!.prompt);
  });

  it("a right answer moves you on; a wrong one freezes you 2 s and greys that option", () => {
    const s = game();
    expect(answer(s, "k", true, T0 + 100)).toMatchObject({ ok: true, result: { right: true } });
    expect(s.progress[0]!["k"]).toMatchObject({ idx: 1, right: 1 });
    const sum = cur(s, "k");
    const wrongChoice = (sum.correctIndex + 1) % 4;
    expect(m.intent(s, "k", "tug-answer", { bout: 0, idx: 1, choice: wrongChoice }, ctx(T0 + 200))).toMatchObject({ ok: true, result: { right: false } });
    expect(m.intent(s, "k", "tug-answer", { bout: 0, idx: 1, choice: sum.correctIndex }, ctx(T0 + 300))).toMatchObject({ ok: false, reason: "FROZEN" });
    const v = m.playerView(s, "k", ctx(T0 + 300)) as { frozenUntil: number; sum: { wrong: number[] } };
    expect(v.frozenUntil).toBe(T0 + 200 + TUG_FREEZE_MS);
    expect(v.sum.wrong).toEqual([wrongChoice]);
    expect(m.intent(s, "k", "tug-answer", { bout: 0, idx: 1, choice: wrongChoice }, ctx(T0 + 2300))).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(m.intent(s, "k", "tug-answer", { bout: 0, idx: 0, choice: 0 }, ctx(T0 + 2300))).toMatchObject({ ok: false, reason: "STALE_SUM" });
    expect(m.intent(s, "k", "tug-answer", { bout: 2, idx: 1, choice: 0 }, ctx(T0 + 2300))).toMatchObject({ ok: false, reason: "STALE_ROUND" });
    expect(m.intent(s, "k", "tug-answer", { bout: 0, idx: 1, choice: sum.correctIndex }, ctx(T0 + 2300))).toMatchObject({ ok: true, result: { right: true } });
  });

  it("secrecy: a phone gets only its own sum and never its answer; the TV and others get pulls, never a sum", () => {
    const s = game();
    answer(s, "k", true, T0 + 100);
    const mine = m.playerView(s, "k", ctx(T0 + 200)) as Record<string, unknown>;
    const json = JSON.stringify(mine);
    expect(json).not.toContain("correctIndex");
    expect((mine["sum"] as { prompt: string }).prompt).toBe(s.sums[0]![1]!.prompt);
    const other = JSON.stringify(m.playerView(s, "b", ctx(T0 + 200)));
    expect(other).not.toContain(s.sums[0]![1]!.prompt);
    const tv = JSON.stringify(m.publicView(s, ctx(T0 + 200)));
    for (const q of s.sums.flat()) expect(tv).not.toContain(q.prompt);
    expect(tv).not.toContain("correctIndex");
  });

  it("fair for uneven teams: the pull is right answers per player, and the bout's places and points follow it", () => {
    const s = game();
    let t = T0;
    // Coral (3 players): 6 right in all = 2.0 each. Sun (2 players): 5 right = 2.5 each.
    for (const [p, n] of [["k", 2], ["a", 2], ["z", 2], ["b", 3], ["w", 2]] as const) for (let i = 0; i < n; i++) answer(s, p, true, (t += 50));
    const pulls = tugPulls(s);
    expect(pulls.find((p) => p.teamId === CORAL)).toMatchObject({ right: 6, size: 3, pull: 2 });
    expect(pulls.find((p) => p.teamId === SUN)).toMatchObject({ right: 5, size: 2, pull: 2.5 });
    m.expirePhase(s, ctx(T0 + TUG_BOUT_MS));
    expect(s.phase).toBe("result");
    expect(s.results[0]!.map((r) => [r.teamId, r.place, r.points])).toEqual([[CORAL, 2, 75], [SUN, 1, 100]]);
    expect(m.scores(s, players)).toEqual({ k: 75, a: 75, z: 75, b: 100, w: 100 });
    // A frozen window doesn't outlive its bout; nobody can answer in the result.
    expect(answer(s, "k", true, T0 + TUG_BOUT_MS + 100)).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
    m.expirePhase(s, ctx(T0 + TUG_BOUT_MS + TUG_RESULT_MS));
    expect(s).toMatchObject({ bout: 1, phase: "pull" });
    expect(s.progress[1]!["k"]).toMatchObject({ idx: 0, right: 0 });
  });

  it("a tie shares the place", () => {
    expect(tugPlaces([{ teamId: "x", right: 2, size: 2, mult: 1, pull: 1 }, { teamId: "y", right: 3, size: 3, mult: 1, pull: 1 }, { teamId: "z", right: 0, size: 2, mult: 1, pull: 0 }]).map((r) => [r.place, r.points])).toEqual([[1, 100], [1, 100], [3, 55]]);
  });

  it("catch-up: a team alone in last place and 40+ behind pulls ×1.2 in the next bout", () => {
    const three: GameTeams = { list: newTeamList(3), members: { a1: CORAL, a2: CORAL, b1: SUN, b2: SUN, c1: MINT, c2: MINT } };
    const ps = Object.keys(three.members);
    const s = game(3, three, ps);
    let t = T0;
    expect(s.catchUp[0]).toBeNull();
    // Bout 1: Coral 1st (100), Sun 2nd (75), Mint 3rd (55): Mint is alone in last place, 45 behind.
    for (let i = 0; i < 4; i++) answer(s, "a1", true, (t += 50), ps);
    for (let i = 0; i < 2; i++) answer(s, "b1", true, (t += 50), ps);
    m.expirePhase(s, ctx((t = T0 + TUG_BOUT_MS), ps));
    m.expirePhase(s, ctx((t += TUG_RESULT_MS), ps));
    expect(s.catchUp[1]).toBe(MINT);
    expect((m.publicView(s, ctx(t, ps)) as { catchUp: string }).catchUp).toBe(MINT);
    answer(s, "c1", true, t + 100, ps);
    expect(tugPulls(s).find((p) => p.teamId === MINT)).toMatchObject({ right: 1, mult: TUG_CATCH_UP, pull: 0.6 });
    // Two teams level at the bottom: nobody gets it.
    const s2 = game(3, three, ps);
    m.expirePhase(s2, ctx(T0 + TUG_BOUT_MS, ps));
    s2.results[0] = [{ teamId: CORAL, right: 0, size: 2, mult: 1, pull: 0, place: 1, points: 100 }, { teamId: SUN, right: 0, size: 2, mult: 1, pull: 0, place: 2, points: 55 }, { teamId: MINT, right: 0, size: 2, mult: 1, pull: 0, place: 2, points: 55 }];
    m.expirePhase(s2, ctx(T0 + TUG_BOUT_MS + TUG_RESULT_MS, ps));
    expect(s2.catchUp[1]).toBeNull();
  });

  it("no sitting out; the game ends after three bouts with every bout's places", () => {
    const s = game();
    expect(m.abstain(s, "k", ctx(T0)).ok).toBe(false);
    let t = T0;
    for (let b = 0; b < TUG_BOUTS; b++) {
      answer(s, "b", true, (t += 100));
      m.expirePhase(s, ctx((t += TUG_BOUT_MS)));
      m.expirePhase(s, ctx((t += TUG_RESULT_MS)));
    }
    expect(s.phase).toBe("finished");
    expect((m.publicView(s, ctx(t)) as { bouts: unknown[] }).bouts).toHaveLength(TUG_BOUTS);
    expect(m.scores(s, players)).toMatchObject({ b: 300, k: 225 });
    expect(m.participation(s, players).completedUnits).toBe(TUG_BOUTS);
  });
});

describe("Tug of War in the room", () => {
  it("a whole game with uneven night's teams; the bouts end on the room's clock", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Tug night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Zawadi", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const [k, a, z, b, w] = ids as [string, string, string, string, string];
    const tm = engine.makeTeams(k, 2, 5);
    const [c1, c2] = tm.list.map((x) => x.id) as [string, string];
    for (const [p, team] of [[k, c1], [a, c1], [z, c1], [b, c2], [w, c2]] as const) engine.moveToTeam(k, p, team);
    const g = engine.startGame(k, "tug-of-war", { official: false, seed: 9 });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const game = engine.games.get(g.id)!;
    const st = game.extra as TugState;
    for (let bout = 0; bout < TUG_BOUTS; bout++) {
      expect(st).toMatchObject({ bout, phase: "pull" });
      // Sun's two players answer 2 each (2.0 per player); Coral's three answer 1 each (1.0 per player).
      for (const [p, n] of [[b, 2], [w, 2], [k, 1], [a, 1], [z, 1]] as const) {
        for (let i = 0; i < n; i++) {
          const me = st.progress[bout]![p]!;
          const sum = st.sums[bout]![me.idx]!;
          expect(send(p, g.id, "tug-answer", { bout, idx: me.idx, choice: sum.correctIndex }).accepted).toBe(true);
        }
      }
      t += TUG_BOUT_MS + 10; engine.tick();
      expect(st.phase).toBe("result");
      t += TUG_RESULT_MS + 10; engine.tick();
    }
    expect(game.status).toBe("finished");
    const tv = (engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    const results = tv["teamResults"] as { teamId: string; rank: number; score: number }[];
    expect(results.find((x) => x.teamId === c2)).toMatchObject({ rank: 1, score: 300 });
    expect(results.find((x) => x.teamId === c1)).toMatchObject({ rank: 2, score: 225 });
  });
});
