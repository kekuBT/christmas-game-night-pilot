/**
 * Stage 12.10 (docs/stage12/stage1210.md): the team kit (D-S1210-01) and Split Clues (D-S1210-02).
 * The kit and the module are pure; then the room: a team of 1 joins another team, no repeats in a night, a whole game.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fitTeamsForGame, newTeamList, type GameTeams } from "../src/shared/teams.js";
import { answerMatches, catchUpTeam, dealAvoiding, editDistance } from "../src/games/modules/teamKit.js";
import { SPLIT_HELP_MS, SPLIT_LOCK_MS, SPLIT_MAX_TRIES, SPLIT_POINTS, SPLIT_ROUNDS, cluesHeld, dealSeat, splitCluesModule as m, splitPuzzlesFor, type SplitState } from "../src/games/modules/splitClues.js";
import { SPLIT_PUZZLES } from "../src/games/modules/packs/split-clues.js";
import { normalizeGuess } from "../src/games/modules/draw.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { moduleRng } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

const [CORAL, SUN, MINT] = newTeamList(3) as [GameTeams["list"][number], GameTeams["list"][number], GameTeams["list"][number]];

describe("the team kit (D-S1210-01)", () => {
  it("a team with 1 player in the game joins the smallest other team; the move is recorded", () => {
    const fit = fitTeamsForGame([CORAL, SUN, MINT], { a: CORAL.id, b: CORAL.id, c: CORAL.id, d: SUN.id, e: SUN.id, f: MINT.id }, ["a", "b", "c", "d", "e", "f"], 2)!;
    expect(fit.list.map((t) => t.id)).toEqual([CORAL.id, SUN.id]);
    expect(fit.members["f"]).toBe(SUN.id);
    expect(fit.moved).toEqual([{ playerId: "f", from: MINT.id, to: SUN.id }]);
  });

  it("two short teams merge with each other when that's smallest; too few teams left means the game deals its own", () => {
    const fit = fitTeamsForGame([CORAL, SUN, MINT], { a: CORAL.id, b: CORAL.id, c: SUN.id, d: MINT.id }, ["a", "b", "c", "d"], 2)!;
    expect(fit.list.map((t) => t.id)).toEqual([CORAL.id, MINT.id]);
    expect(fit.moved).toEqual([{ playerId: "c", from: SUN.id, to: MINT.id }]);
    expect(fitTeamsForGame([CORAL, SUN], { a: CORAL.id, b: SUN.id }, ["a", "b"], 2)).toBeNull();
    expect(fitTeamsForGame([CORAL, SUN], { a: CORAL.id, b: CORAL.id, c: CORAL.id, d: SUN.id }, ["a", "b", "c", "d"], 2)).toBeNull();
  });

  it("catch-up: only a team alone in last place, and 100+ behind the leader", () => {
    expect(catchUpTeam({ a: 300, b: 200, c: 150 })).toBe("c");
    expect(catchUpTeam({ a: 300, b: 150, c: 150 })).toBeNull();
    expect(catchUpTeam({ a: 200, b: 150 })).toBeNull();
    expect(catchUpTeam({ a: 0, b: 0 })).toBeNull();
  });

  it("answers: case, accents, punctuation, an article, a plural, and one typo in a long answer", () => {
    expect(answerMatches(["Kilimanjaro", "Mount Kilimanjaro"], "  mount KILIMANJARO! ")).toBe(true);
    expect(answerMatches(["Kilimanjaro"], "Kilimanjro")).toBe(true);
    expect(answerMatches(["Kilimanjaro"], "Kilmanjro")).toBe(false);
    expect(answerMatches(["Moon", "The moon"], "the Moon")).toBe(true);
    expect(answerMatches(["Mango"], "mangos")).toBe(true);
    expect(answerMatches(["Lion"], "lino")).toBe(false);
    expect(answerMatches(["Chapati"], "chapatti")).toBe(true);
    expect(editDistance("giraffe", "girafe")).toBe(1);
    expect(editDistance("teh", "the")).toBe(1);
  });

  it("no repeats: unplayed content first, then what was played longest ago", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id }));
    const dealt = dealAvoiding(items, moduleRng(1), ["c", "a"]).map((x) => x.id);
    expect(dealt.slice(0, 2).sort()).toEqual(["b", "d"]);
    expect(dealt.slice(2)).toEqual(["c", "a"]);
  });
});

describe("the Split Clues puzzles", () => {
  it("38 Everyday and 13 Christmas puzzles, unique ids, six clues each, and no clue gives its answer away by name", () => {
    expect(SPLIT_PUZZLES.filter((p) => !p.season)).toHaveLength(38);
    expect(SPLIT_PUZZLES.filter((p) => p.season === "christmas")).toHaveLength(13);
    expect(new Set(SPLIT_PUZZLES.map((p) => p.id)).size).toBe(SPLIT_PUZZLES.length);
    for (const p of SPLIT_PUZZLES) {
      expect(p.clues).toHaveLength(6);
      expect(new Set(p.clues).size).toBe(6);
      for (const c of p.clues) {
        const clue = normalizeGuess(c);
        for (const a of [p.answer, ...(p.alts ?? [])]) expect(clue.includes(normalizeGuess(a)), `${p.id}: "${c}" contains "${a}"`).toBe(false);
        expect(c.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("an Everyday session never gets a Christmas puzzle; a Christmas session gets the Christmas ones first", () => {
    expect(splitPuzzlesFor("everyday", moduleRng(3)).some((p) => p.season)).toBe(false);
    const xmas = splitPuzzlesFor("christmas", moduleRng(3));
    expect(xmas.slice(0, 13).every((p) => p.season === "christmas")).toBe(true);
  });
});

const players = ["k", "a", "z", "b", "w"];
// Coral has three players, Sun two.
const teams: GameTeams = { list: newTeamList(2), members: { k: "team-coral", a: "team-coral", z: "team-coral", b: "team-sun", w: "team-sun" } };
const T0 = 2_000_000;
const ctx = (now: number): ModuleContext => ({ now, players, active: players, scale: 1 });
function game(seed = 5): SplitState {
  const s = m.init({ players, seed, teams, season: "everyday" });
  m.onPlayStart(s, ctx(T0));
  return s;
}
const guess = (s: SplitState, p: string, text: string, now: number) => m.intent(s, p, "split-guess", { round: s.round, text }, ctx(now));
const answer = (s: SplitState) => s.puzzles[s.round]!.answer;

describe("Split Clues (pure)", () => {
  it("six everyday puzzles; the clues are dealt round each team, rotating every round", () => {
    const s = game();
    expect(s.puzzles).toHaveLength(SPLIT_ROUNDS);
    for (const team of [["k", "a", "z"], ["b", "w"]]) {
      const held = team.map((p) => cluesHeld(s, 0, p));
      expect(held.flat().sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(held.every((h) => h.length === 6 / team.length)).toBe(true);
    }
    // Who holds what rotates: each player's seat in the deal moves on by one every round.
    for (const p of players) {
      const k = dealSeat(s, 0, p)!.k;
      expect([0, 1, 2].map((r) => dealSeat(s, r, p)!.slot)).toEqual([0, 1, 2].map((r) => (dealSeat(s, 0, p)!.slot + r) % k));
    }
    // A team of 7: everyone holds one clue, and all six are held.
    const big: GameTeams = { list: newTeamList(2), members: Object.fromEntries(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "q1", "q2"].map((p) => [p, p.startsWith("p") ? "team-coral" : "team-sun"])) };
    const s7 = m.init({ players: Object.keys(big.members), seed: 2, teams: big, season: "everyday" });
    const held7 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((p) => cluesHeld(s7, 0, p));
    expect(held7.every((h) => h.length === 1)).toBe(true);
    expect(new Set(held7.flat()).size).toBe(6);
  });

  it("a phone sees only its own clues until 45 s; nobody else ever sees them or the answer before the reveal", () => {
    const s = game();
    const p = s.puzzles[0]!;
    // Every team plays the same puzzle, so two teams may hold the same clue text; what matters is that a phone shows
    // exactly the clues its own player holds, and nothing else of the puzzle.
    for (const pid of players) {
      const view = m.playerView(s, pid, { now: T0 + 1000, scale: 1 }) as { myClues: string[] };
      const held = cluesHeld(s, 0, pid);
      expect([...view.myClues].sort()).toEqual(held.map((i) => p.clues[i]!).sort());
      const json = JSON.stringify(view);
      for (const [i, c] of p.clues.entries()) if (!held.includes(i)) expect(json, `${pid} sees "${c}"`).not.toContain(c);
      expect(json.toLowerCase()).not.toContain(`"${p.answer.toLowerCase()}"`);
    }
    expect((m.playerView(s, "k", { now: T0 + 1000, scale: 1 }) as { myClues: string[] }).myClues).toHaveLength(2);
    const tv = JSON.stringify(m.publicView(s, { now: T0 + 1000, scale: 1 }));
    for (const c of p.clues) expect(tv).not.toContain(c);
    expect(tv.toLowerCase()).not.toContain(`"${p.answer.toLowerCase()}"`);
    // Future puzzles never leave the server.
    // (A few clue texts appear in two puzzles, e.g. "It can't fly."; those are checked through the current puzzle above.)
    for (const later of s.puzzles.slice(1)) for (const c of later.clues) if (!p.clues.includes(c)) expect(tv + JSON.stringify(m.playerView(s, "k", { now: T0, scale: 1 }))).not.toContain(c);
    // The pooling at 45 s: every phone on a team shows all six of its clues.
    m.advance!(s, ctx(T0 + SPLIT_HELP_MS[1]));
    expect((m.playerView(s, "k", { now: T0 + SPLIT_HELP_MS[1], scale: 1 }) as { myClues: string[] }).myClues).toHaveLength(6);
  });

  it("help from the server clock: the shape at 30 s, the pooling at 45 s, the first letter at 60 s", () => {
    const s = game();
    expect(m.dueAt!(s)).toBe(T0 + SPLIT_HELP_MS[0]);
    expect(m.publicView(s, { now: T0, scale: 1 })["shape"]).toBeUndefined();
    m.advance!(s, ctx(T0 + SPLIT_HELP_MS[0]));
    expect(m.publicView(s, { now: T0, scale: 1 })["shape"]).toMatch(/letters/);
    expect(m.dueAt!(s)).toBe(T0 + SPLIT_HELP_MS[1]);
    m.advance!(s, ctx(T0 + SPLIT_HELP_MS[2]));
    expect(s.help).toBe(3);
    expect(m.publicView(s, { now: T0, scale: 1 })["firstLetter"]).toBe(answer(s)[0]!.toUpperCase());
    expect(m.dueAt!(s)).toBeUndefined();
  });

  it("a wrong try is shown to teammates only and locks the team for 4 s; at most 15 tries a round", () => {
    const s = game();
    expect(guess(s, "k", "zebra-nope", T0 + 100)).toMatchObject({ ok: true, result: { right: false } });
    expect(guess(s, "a", "another", T0 + 200)).toMatchObject({ ok: false, reason: "LOCKED" });
    const mate = m.playerView(s, "a", { now: T0 + 200, scale: 1 }) as { teamTries: { by: string; text: string }[]; lockedUntil?: number };
    expect(mate.teamTries).toEqual([{ by: "k", text: "zebra-nope" }]);
    expect(mate.lockedUntil).toBe(T0 + 100 + SPLIT_LOCK_MS);
    expect(JSON.stringify(m.playerView(s, "b", { now: T0 + 200, scale: 1 }))).not.toContain("zebra-nope");
    expect(JSON.stringify(m.publicView(s, { now: T0 + 200, scale: 1 }))).not.toContain("zebra-nope");
    let t = T0 + 100;
    for (let i = 1; i < SPLIT_MAX_TRIES; i++) { t += SPLIT_LOCK_MS; expect(guess(s, "a", `wrong ${i}`, t).ok).toBe(true); }
    t += SPLIT_LOCK_MS;
    expect(guess(s, "a", answer(s), t)).toMatchObject({ ok: false, reason: "TOO_MANY_TRIES" });
  });

  it("points by solve order; the round ends once every team has solved it; everyone scores their team's points", () => {
    const s = game();
    expect(guess(s, "b", answer(s), T0 + 5000)).toMatchObject({ ok: true, result: { right: true, place: 1 } });
    expect(guess(s, "w", answer(s), T0 + 6000)).toMatchObject({ ok: false, reason: "ALREADY_SOLVED" });
    expect(s.phase).toBe("solve");
    expect(guess(s, "z", answer(s).toUpperCase(), T0 + 9000)).toMatchObject({ ok: true, result: { right: true, place: 2 } });
    expect(s.phase).toBe("reveal");
    const sc = m.scores(s, players);
    expect([sc["b"], sc["w"], sc["k"], sc["a"], sc["z"]]).toEqual([100, 100, 75, 75, 75]);
    const reveal = m.publicView(s, { now: T0 + 9000, scale: 1 })["result"] as { answer: string; clues: string[]; teams: { teamId: string; place: number; seconds: number }[] };
    expect(reveal.answer).toBe(s.puzzles[0]!.answer);
    expect(reveal.clues).toHaveLength(6);
    expect(reveal.teams.find((t) => t.teamId === "team-sun")).toMatchObject({ place: 1, seconds: 5 });
  });

  it("catch-up: +25 for a team alone in last place and 100+ behind, from the rounds before", () => {
    const s = game();
    let t = T0;
    // Round 1: Sun solves, Coral doesn't (Sun 100, Coral 0).
    guess(s, "b", answer(s), t += 1000);
    m.expirePhase(s, ctx(t += 1000)); // solve -> reveal
    m.expirePhase(s, ctx(t += 1000)); // reveal -> round 2
    expect(s.round).toBe(1);
    guess(s, "k", answer(s), t + 1000);
    const coral = s.rounds[1]!["team-coral"]!;
    expect(coral).toMatchObject({ place: 1, bonus: SPLIT_POINTS.catchUp, points: SPLIT_POINTS.place[0] + SPLIT_POINTS.catchUp });
  });

  it("no sitting out; the puzzles' ids are listed for the room's no-repeat rule", () => {
    const s = game();
    expect(m.abstain(s, "k", ctx(T0)).ok).toBe(false);
    expect(m.contentIds(s)).toEqual(s.puzzles.map((p) => p.id));
    expect(m.intent(m.init({ players, seed: 1, teams, season: "everyday" }), "k", "split-guess", { round: 0, text: "x" }, ctx(T0))).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
  });
});

describe("Split Clues in the room", () => {
  function room(names: string[]) {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Clues night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join(names[0]!, { asHost: true }).player.id];
    for (const n of names.slice(1)) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, advance: (ms: number) => { t += ms; engine.tick(); }, now: () => t };
  }

  it("the night's team with only 1 player in the game plays with the smallest other team, and the briefing says so", () => {
    const r = room(["Keku", "Amina", "Baraka", "Wanjiru", "Zawadi"]);
    const [k, a, b, w, z] = r.ids as [string, string, string, string, string];
    const t = r.engine.makeTeams(k, 3, 11);
    const [c1, c2, c3] = t.list.map((x) => x.id) as [string, string, string];
    for (const [p, team] of [[k, c1], [a, c1], [b, c2], [w, c2], [z, c3]] as const) r.engine.moveToTeam(k, p, team);
    const g = r.engine.startGame(k, "split-clues", { official: false, seed: 3 });
    const game = r.engine.games.get(g.id)!;
    expect(game.teams!.list.map((x) => x.id)).toEqual([c1, c2]);
    expect(game.teams!.moved).toEqual([{ playerId: z, from: c3, to: c1 }]);
    const brief = (r.engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    expect((brief["teams"] as GameTeams).moved).toEqual([{ playerId: z, from: c3, to: c1 }]);
  });

  it("a whole game, then a second one that deals puzzles the room hasn't played", () => {
    const r = room(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const playGame = (seed: number) => {
      const g = r.engine.startGame(r.ids[0]!, "split-clues", { official: false, seed });
      for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
      const game = r.engine.games.get(g.id)!;
      const st = game.extra as SplitState;
      for (let round = 0; round < SPLIT_ROUNDS; round++) {
        for (const team of st.teams.list) {
          const p = r.ids.find((x) => st.teams.members[x] === team.id)!;
          expect(r.send(p, g.id, "split-guess", { round, text: st.puzzles[round]!.answer }).accepted).toBe(true);
        }
        expect(st.phase).toBe("reveal");
        r.advance(8_000); // the reveal ends
      }
      expect(game.status).toBe("finished");
      return { game, st };
    };
    const first = playGame(4);
    const tv = (r.engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === first.game.id)!;
    expect((tv["teamResults"] as { rank: number }[]).every((x) => x.rank >= 1)).toBe(true);
    const second = playGame(4);
    const firstIds = new Set(first.st.puzzles.map((p) => p.id));
    expect(second.st.puzzles.some((p) => firstIds.has(p.id))).toBe(false);
  });
});
