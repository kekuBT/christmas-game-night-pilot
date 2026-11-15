/**
 * Stage 12.14 (docs/stage12/stage1214.md): Know Your Rivals (D-S1214-01). The module is pure; then the room: a whole
 * game with the night's teams, its phases closing early and on the room's clock, and what each audience sees.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newTeamList, type GameTeams } from "../src/shared/teams.js";
import {
  RIVALS_ANSWER_MS, RIVALS_CATCH_UP_GAP, RIVALS_GUESS_MS, RIVALS_POINTS, RIVALS_REVEAL_MS, RIVALS_ROUNDS,
  guessPoints, knowYourRivalsModule as m, rivalsQuestionsFor, teamCount, type RivalsState,
} from "../src/games/modules/knowYourRivals.js";
import { RIVALS_QUESTIONS } from "../src/games/modules/packs/know-your-rivals.js";
import { moduleRng, type ModuleContext } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint";
// Long ids, so "never in this view" can be checked as text. Coral has 3 players, Sun 2.
const KEKU = "p-keku", AMINA = "p-amina", ZAWADI = "p-zawadi", BARAKA = "p-baraka", WANJIRU = "p-wanjiru";
const players = [KEKU, AMINA, ZAWADI, BARAKA, WANJIRU];
const teams: GameTeams = { list: newTeamList(2), members: { [KEKU]: CORAL, [AMINA]: CORAL, [ZAWADI]: CORAL, [BARAKA]: SUN, [WANJIRU]: SUN } };
const T0 = 9_000_000;
const ctx = (now = T0, ps: readonly string[] = players): ModuleContext => ({ now, players: ps, active: ps, scale: 1 });
function game(seed = 5, t: GameTeams = teams, ps: string[] = players, season?: "christmas"): RivalsState {
  const s = m.init({ players: ps, seed, teams: t, ...(season ? { season } : {}) });
  m.onPlayStart(s, ctx(T0, ps));
  return s;
}
const act = (s: RivalsState, p: string, action: string, payload: Record<string, unknown> = {}, ps = players) => m.intent(s, p, action, { round: s.round, ...payload }, ctx(T0, ps));
const answerAll = (s: RivalsState, picks: Record<string, "a" | "b" | "pass">, ps = players) => { for (const [p, c] of Object.entries(picks)) expect(act(s, p, "rivals-answer", { choice: c }, ps)).toMatchObject({ ok: true }); };
type View = Record<string, unknown>;
const pv = (s: RivalsState, p: string, ps = players) => m.playerView(s, p, ctx(T0, ps)) as View;
const tv = (s: RivalsState, ps = players) => m.publicView(s, ctx(T0, ps)) as View;

describe("Know Your Rivals (pure)", () => {
  it("six light questions: everyday ones in an everyday session, Christmas ones first at Christmas, unplayed first", () => {
    expect(new Set(RIVALS_QUESTIONS.map((q) => q.id)).size).toBe(RIVALS_QUESTIONS.length);
    for (const q of RIVALS_QUESTIONS) {
      expect(q.prompt.length).toBeLessThanOrEqual(70);
      expect(q.a.length).toBeLessThanOrEqual(16);
      expect(q.b.length).toBeLessThanOrEqual(16);
      expect(q.a).not.toBe(q.b);
    }
    const s = game();
    expect(s.questions).toHaveLength(RIVALS_ROUNDS);
    expect(s.questions.every((q) => q.season === undefined)).toBe(true);
    expect(game().questions).toEqual(s.questions);
    const xmas = game(5, teams, players, "christmas");
    expect(xmas.questions.every((q) => q.season === "christmas")).toBe(true);
    // Unplayed first: avoiding every everyday question but six leaves exactly those six at the front.
    const everyday = RIVALS_QUESTIONS.filter((q) => q.season === undefined);
    const fresh = everyday.slice(0, 6).map((q) => q.id);
    const dealt = rivalsQuestionsFor(undefined, moduleRng(1), everyday.slice(6).map((q) => q.id)).slice(0, 6).map((q) => q.id);
    expect([...dealt].sort()).toEqual([...fresh].sort());
    expect(m.contentIds(s)).toEqual(s.questions.map((q) => q.id));
  });

  it("answering: a, b or \"Rather not say\", changeable until everyone has answered, then on to the guesses", () => {
    const s = game();
    expect(s).toMatchObject({ round: 0, phase: "answer" });
    expect(act(s, KEKU, "rivals-answer", { choice: "c" })).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(act(s, KEKU, "rivals-answer", { choice: "a", round: 1 })).toMatchObject({ ok: false, reason: "STALE_ROUND" });
    expect(act(s, "p-stranger", "rivals-answer", { choice: "a" })).toMatchObject({ ok: false, reason: "NOT_ON_A_TEAM" });
    expect(act(s, KEKU, "rivals-shout", {})).toMatchObject({ ok: false, reason: "UNKNOWN_ACTION" });
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 1 })).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
    expect(act(s, KEKU, "rivals-answer", { choice: "a" })).toMatchObject({ ok: true });
    expect(act(s, KEKU, "rivals-answer", { choice: "b" })).toMatchObject({ ok: true });
    expect(pv(s, KEKU)["myAnswer"]).toBe("b");
    expect(tv(s)).toMatchObject({ answered: 1, of: 5, phase: "answer" });
    answerAll(s, { [AMINA]: "a", [ZAWADI]: "pass", [BARAKA]: "a" });
    expect(s.phase).toBe("answer");
    answerAll(s, { [WANJIRU]: "b" });
    expect(s.phase).toBe("guess");
    expect(act(s, KEKU, "rivals-answer", { choice: "a" })).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
    expect(teamCount(s, 0, CORAL)).toEqual({ teamId: CORAL, answered: 2, a: 1, b: 1, passed: 1 });
    expect(teamCount(s, 0, SUN)).toEqual({ teamId: SUN, answered: 2, a: 1, b: 1, passed: 0 });
  });

  it("privacy: nobody, not even a teammate, ever sees another player's own answer; the TV and others see only counts", () => {
    const s = game();
    answerAll(s, { [KEKU]: "a" });
    for (const p of players.filter((x) => x !== KEKU)) expect(pv(s, p)["myAnswer"]).toBeUndefined();
    const watch = () => {
      const views = [tv(s), ...players.map((p) => pv(s, p))];
      // No view, at any point, names a player next to an answer: no player id appears in any view at all
      // (guesses carry who set them, but only to that team's own phones, checked below).
      for (const v of views) {
        const { teamGuesses: _g, lockedBy: _l, ...rest } = v;
        void _g; void _l;
        for (const p of players) expect(JSON.stringify(rest)).not.toContain(p);
      }
    };
    watch();
    answerAll(s, { [AMINA]: "b", [ZAWADI]: "a", [BARAKA]: "a", [WANJIRU]: "pass" });
    watch();
    act(s, KEKU, "rivals-guess", { target: SUN, value: 1 });
    act(s, KEKU, "rivals-lock");
    act(s, BARAKA, "rivals-lock");
    expect(s.phase).toBe("reveal");
    watch();
    const r = tv(s)["result"] as { counts: unknown[] };
    expect(r.counts).toEqual([{ teamId: CORAL, answered: 3, a: 2, b: 1, passed: 0 }, { teamId: SUN, answered: 1, a: 1, b: 0, passed: 1 }]);
    for (let i = 0; i < 3; i++) m.expirePhase(s, ctx());
    watch();
  });

  it("guesses stay on the team's own phones until the reveal; any teammate sets, one locks; checks", () => {
    const s = game();
    answerAll(s, { [KEKU]: "a", [AMINA]: "a", [ZAWADI]: "b", [BARAKA]: "a", [WANJIRU]: "pass" });
    expect(tv(s)["sizes"]).toEqual([{ teamId: CORAL, answered: 3 }, { teamId: SUN, answered: 1 }]);
    expect(act(s, KEKU, "rivals-guess", { target: CORAL, value: 1 })).toMatchObject({ ok: false, reason: "INVALID_TARGET" });
    expect(act(s, KEKU, "rivals-guess", { target: "team-nobody", value: 1 })).toMatchObject({ ok: false, reason: "INVALID_TARGET" });
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 2 })).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 0.5 })).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 0 })).toMatchObject({ ok: true });
    expect(act(s, AMINA, "rivals-guess", { target: SUN, value: 1 })).toMatchObject({ ok: true });
    expect(act(s, BARAKA, "rivals-guess", { target: CORAL, value: 2 })).toMatchObject({ ok: true });
    // Coral's phones see Coral's guess and who set it; Sun's phones and the TV never do.
    for (const p of [KEKU, AMINA, ZAWADI]) expect(pv(s, p)["teamGuesses"]).toEqual({ [SUN]: { value: 1, by: AMINA } });
    for (const p of [BARAKA, WANJIRU]) expect(pv(s, p)["teamGuesses"]).toEqual({ [CORAL]: { value: 2, by: BARAKA } });
    expect(JSON.stringify(tv(s))).not.toContain("teamGuesses");
    expect(JSON.stringify(tv(s))).not.toContain(AMINA);
    expect(act(s, ZAWADI, "rivals-lock")).toMatchObject({ ok: true });
    expect(pv(s, KEKU)["lockedBy"]).toBe(ZAWADI);
    expect(pv(s, BARAKA)["lockedBy"]).toBeUndefined();
    expect(tv(s)["teamStatus"]).toEqual([{ teamId: CORAL, locked: true, guessing: true }, { teamId: SUN, locked: false, guessing: true }]);
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 0 })).toMatchObject({ ok: false, reason: "TEAM_LOCKED" });
    expect(act(s, KEKU, "rivals-lock")).toMatchObject({ ok: false, reason: "TEAM_LOCKED" });
    expect(s.phase).toBe("guess");
    expect(act(s, WANJIRU, "rivals-lock")).toMatchObject({ ok: true });
    expect(s.phase).toBe("reveal");
    // Now everyone sees every team's guesses and points (who set them, never).
    const res = tv(s)["result"] as { guesses: unknown[]; points: unknown[] };
    expect(res.guesses).toEqual([
      { teamId: CORAL, target: SUN, guess: 1, actual: 1, size: 1, points: 30 },
      { teamId: SUN, target: CORAL, guess: 2, actual: 2, size: 3, points: 30 },
    ]);
    expect(res.points).toEqual([{ teamId: CORAL, points: 30, bonus: 0 }, { teamId: SUN, points: 30, bonus: 0 }]);
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 0 })).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
  });

  it("points: 30 for exact, less the further off, scaled by how many answered; an unguessed rival scores 0", () => {
    expect(guessPoints(2, 2, 3)).toBe(RIVALS_POINTS.exact);
    expect(guessPoints(1, 2, 3)).toBe(20);
    expect(guessPoints(0, 3, 3)).toBe(0);
    expect(guessPoints(0, 1, 4)).toBe(23);
    expect(guessPoints(null, 1, 2)).toBe(0);
    expect(guessPoints(0, 0, 0)).toBe(0);
    // Three teams: every team guesses both others, so every team has the same number of guesses whatever its size.
    const three: GameTeams = { list: newTeamList(3), members: { c1: CORAL, c2: CORAL, c3: CORAL, s1: SUN, s2: SUN, m1: MINT, m2: MINT } };
    const ps = Object.keys(three.members);
    const s = game(2, three, ps);
    answerAll(s, { c1: "a", c2: "a", c3: "b", s1: "b", s2: "b", m1: "a", m2: "pass" }, ps);
    act(s, "c1", "rivals-guess", { target: SUN, value: 0 }, ps); // exact: 30
    act(s, "c1", "rivals-guess", { target: MINT, value: 0 }, ps); // 1 off of 1: 0
    act(s, "s1", "rivals-guess", { target: CORAL, value: 3 }, ps); // 1 off of 3: 20
    m.expirePhase(s, ctx(T0, ps)); // the guess clock runs out: Mint never guessed, Sun didn't guess Mint
    expect(s.phase).toBe("reveal");
    const pts = Object.fromEntries(s.results[0]!.points.map((p) => [p.teamId, p.points]));
    expect(pts).toEqual({ [CORAL]: 30, [SUN]: 20, [MINT]: 0 });
    expect(s.results[0]!.guesses.filter((g) => g.teamId === MINT).map((g) => g.guess)).toEqual([null, null]);
    expect(m.scores(s, ps)).toMatchObject({ c1: 30, c3: 30, s2: 20, m2: 0 });
  });

  it("\"Rather not say\": not counted; a team where nobody answered sits the guessing out (12.15-R); if nobody answers at all, no guessing", () => {
    const s = game();
    answerAll(s, { [KEKU]: "a", [AMINA]: "a", [ZAWADI]: "b", [BARAKA]: "pass", [WANJIRU]: "pass" });
    // Stage 12.15-R (D-S1215R-02): only Coral answered, so there is nobody for Coral to guess and Sun guesses nobody.
    // (Before it, Sun still guessed Coral and could score while nobody could score on Sun.)
    expect(s.phase).toBe("reveal");
    expect(act(s, KEKU, "rivals-guess", { target: SUN, value: 0 })).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
    expect(s.results[0]!.guesses).toEqual([]);
    expect(s.results[0]!.sitOut).toEqual([SUN]);
    expect(s.results[0]!.counts.find((c) => c.teamId === SUN)).toEqual({ teamId: SUN, answered: 0, a: 0, b: 0, passed: 2 });
    m.expirePhase(s, ctx());
    expect(s).toMatchObject({ round: 1, phase: "answer" });
    // Round 2: everyone says "Rather not say": nothing to guess, so straight to the totals.
    answerAll(s, Object.fromEntries(players.map((p) => [p, "pass" as const])));
    expect(s.phase).toBe("reveal");
    expect(s.results[1]!.points.every((p) => p.points === 0)).toBe(true);
    // And on the clock: nobody answers at all.
    const t = game(8);
    m.expirePhase(t, ctx());
    expect(t.phase).toBe("reveal");
  });

  it("catch-up: a team alone in last place and 60+ behind gets +15 in a round where it scores", () => {
    const three: GameTeams = { list: newTeamList(3), members: { c1: CORAL, c2: CORAL, s1: SUN, s2: SUN, m1: MINT, m2: MINT } };
    const ps = Object.keys(three.members);
    const s = game(4, three, ps);
    expect(s.catchUp[0]).toBeNull();
    // Round 1: Coral and Sun guess both rivals exactly (60 each); Mint guesses nothing (0): alone in last, 60 behind.
    answerAll(s, { c1: "a", c2: "b", s1: "a", s2: "a", m1: "b", m2: "b" }, ps);
    for (const [p, target, v] of [["c1", SUN, 2], ["c1", MINT, 0], ["s1", CORAL, 1], ["s1", MINT, 0]] as const) act(s, p, "rivals-guess", { target, value: v }, ps);
    m.expirePhase(s, ctx(T0, ps));
    m.expirePhase(s, ctx(T0, ps));
    expect(s.round).toBe(1);
    expect(RIVALS_CATCH_UP_GAP).toBe(60);
    expect(s.catchUp[1]).toBe(MINT);
    expect(tv(s, ps)["catchUp"]).toBe(MINT);
    expect(pv(s, "m1", ps)["catchUp"]).toBe(MINT);
    // Round 2: Mint guesses Sun exactly (30) and gets the +15; nobody else guesses.
    answerAll(s, { c1: "a", c2: "b", s1: "a", s2: "a", m1: "b", m2: "b" }, ps);
    act(s, "m1", "rivals-guess", { target: SUN, value: 2 }, ps);
    m.expirePhase(s, ctx(T0, ps));
    expect(s.results[1]!.points.find((p) => p.teamId === MINT)).toEqual({ teamId: MINT, points: 30, bonus: RIVALS_POINTS.catchUp });
    m.expirePhase(s, ctx(T0, ps));
    // Now 60 / 60 / 45: 15 behind, so no catch-up.
    expect(s.catchUp[2]).toBeNull();
    // A catch-up team that scores nothing gets nothing.
    const t = game(4, three, ps);
    t.results[0] = { counts: [], guesses: [], points: [{ teamId: CORAL, points: 60, bonus: 0 }, { teamId: SUN, points: 60, bonus: 0 }, { teamId: MINT, points: 0, bonus: 0 }] };
    t.phase = "reveal";
    m.expirePhase(t, ctx(T0, ps));
    expect(t.catchUp[1]).toBe(MINT);
    m.expirePhase(t, ctx(T0, ps));
    m.expirePhase(t, ctx(T0, ps));
    expect(t.results[1]!.points.find((p) => p.teamId === MINT)).toEqual({ teamId: MINT, points: 0, bonus: 0 });
  });

  it("no sitting out; six rounds on the clock, then every round's totals and points", () => {
    const s = game();
    expect(m.abstain(s, KEKU, ctx()).ok).toBe(false);
    expect(m.phase(s)).toEqual({ key: "0:answer", kind: "question" });
    for (let r = 0; r < RIVALS_ROUNDS; r++) {
      answerAll(s, { [KEKU]: "a", [BARAKA]: "b" });
      m.expirePhase(s, ctx());
      expect(m.phase(s)).toEqual({ key: `${r}:guess`, kind: "guess" });
      act(s, KEKU, "rivals-guess", { target: SUN, value: 0 });
      m.expirePhase(s, ctx());
      expect(m.phase(s)).toEqual({ key: `${r}:reveal`, kind: "reveal" });
      m.expirePhase(s, ctx());
    }
    expect(s.phase).toBe("finished");
    expect(m.finished(s, ctx())).toBe(true);
    expect(m.phase(s)).toBeNull();
    const view = tv(s) as { rounds: { prompt: string; counts: unknown[] }[] };
    expect(view.rounds).toHaveLength(RIVALS_ROUNDS);
    expect(view.rounds.map((r) => r.prompt)).toEqual(s.questions.map((q) => q.prompt));
    expect(m.scores(s, players)).toEqual({ [KEKU]: 180, [AMINA]: 180, [ZAWADI]: 180, [BARAKA]: 0, [WANJIRU]: 0 });
    expect(m.participation(s, players)).toMatchObject({ completedUnits: RIVALS_ROUNDS, totalUnits: RIVALS_ROUNDS });
    expect(m.participation(s, players).participation[KEKU]).toMatchObject({ actions: RIVALS_ROUNDS * 2 });
    expect(m.participation(s, players).participation[AMINA]).toMatchObject({ actions: 0 });
    // A finished game keeps nobody's own answer in any view.
    expect(pv(s, KEKU)["myAnswer"]).toBeUndefined();
  });
});

describe("Know Your Rivals in the room", () => {
  it("a whole game with the night's teams: phases close early or on the room's clock; each audience sees its own", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Rivals night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Zawadi", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const [k, a, z, b, w] = ids as [string, string, string, string, string];
    const tm = engine.makeTeams(k, 2, 5);
    const [c1, c2] = tm.list.map((x) => x.id) as [string, string];
    for (const [p, team] of [[k, c1], [a, c1], [z, c1], [b, c2], [w, c2]] as const) engine.moveToTeam(k, p, team);
    const g = engine.startGame(k, "know-your-rivals", { official: false, seed: 3 });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const game = engine.games.get(g.id)!;
    const st = game.extra as RivalsState;
    const stateOf = (pid?: string) => (pid
      ? (engine.project("player", pid) as { myGames: { id: string; state: Record<string, unknown> }[] }).myGames.find((x) => x.id === g.id)!.state
      : (engine.project("tv") as { games: { id: string; state: Record<string, unknown> }[] }).games.find((x) => x.id === g.id)!.state);
    for (let round = 0; round < RIVALS_ROUNDS; round++) {
      expect(st).toMatchObject({ round, phase: "answer" });
      // Coral: 2 a, 1 b. Sun: 1 a, 1 "Rather not say".
      for (const [p, c] of [[k, "a"], [a, "a"], [z, "b"], [b, "a"], [w, "pass"]] as const) expect(send(p, g.id, "rivals-answer", { round, choice: c }).accepted).toBe(true);
      expect(st.phase).toBe("guess");
      expect(stateOf(z)["myAnswer"]).toBe("b");
      expect(stateOf(k)["myAnswer"]).toBe("a");
      expect(JSON.stringify(stateOf())).not.toContain(z);
      // Coral guesses Sun exactly (1 of 1); Sun guesses Coral 1 off (1 of 3): 20.
      expect(send(a, g.id, "rivals-guess", { round, target: c2, value: 1 }).accepted).toBe(true);
      expect(send(w, g.id, "rivals-guess", { round, target: c1, value: 1 }).accepted).toBe(true);
      expect(stateOf(b)["teamGuesses"]).toEqual({ [c1]: { value: 1, by: w } });
      expect(stateOf(k)["teamGuesses"]).toEqual({ [c2]: { value: 1, by: a } });
      expect(JSON.stringify(stateOf())).not.toContain(w);
      expect(send(k, g.id, "rivals-lock", { round }).accepted).toBe(true);
      if (round % 2 === 0) {
        // Even rounds: Sun locks too, so the guesses close early.
        expect(send(b, g.id, "rivals-lock", { round }).accepted).toBe(true);
      } else {
        t += RIVALS_GUESS_MS + 10; engine.tick();
      }
      expect(st.phase).toBe("reveal");
      t += RIVALS_REVEAL_MS + 10; engine.tick();
    }
    expect(game.status).toBe("finished");
    const tvGame = (engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    const results = tvGame["teamResults"] as { teamId: string; rank: number; score: number }[];
    expect(results.find((x) => x.teamId === c1)).toMatchObject({ rank: 1, score: 180 });
    expect(results.find((x) => x.teamId === c2)).toMatchObject({ rank: 2, score: 120 });
    expect(RIVALS_ANSWER_MS).toBe(20_000);
  });

  it("the answer phase closes on the room's clock when someone never answers", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Rivals clock", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const [k] = ids as [string, string, string, string];
    engine.makeTeams(k, 2, 4);
    const g = engine.startGame(k, "know-your-rivals", { official: false, seed: 4 });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const st = engine.games.get(g.id)!.extra as RivalsState;
    // One player on each team answers (12.15-R: with only one team's answers there would be nothing to guess).
    const rival = ids.find((p) => st.teams.members[p] !== st.teams.members[k])!;
    expect(send(k, g.id, "rivals-answer", { round: 0, choice: "a" }).accepted).toBe(true);
    expect(send(rival, g.id, "rivals-answer", { round: 0, choice: "b" }).accepted).toBe(true);
    t += RIVALS_ANSWER_MS - 1000; engine.tick();
    expect(st.phase).toBe("answer");
    t += 2000; engine.tick();
    expect(st.phase).toBe("guess");
  });
});
