/**
 * Stage 12.15-R (docs/stage12/stage1215r.md; review 6888718011):
 *  - R2 (D-S1215R-02): Know Your Rivals' guessing is mutual: a team that opted out neither guesses nor is guessed.
 *  - R3: a Family Question the host skipped is never described again, in any view, after the skip.
 * (R6, the recaps, is tests/stage1215r-recaps.test.ts.)
 * These tests fail on #39's source (1eafe41); see docs/evidence/stage1215r-local/README.md.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newTeamList, type GameTeams, type TeamResultRow } from "../src/shared/teams.js";
import { RIVALS_CATCH_UP_GAP, RIVALS_POINTS, RIVALS_REVEAL_MS, RIVALS_ROUNDS, knowYourRivalsModule as m, type RivalsState } from "../src/games/modules/knowYourRivals.js";
import type { FamilyState } from "../src/games/modules/family.js";
import type { ModuleContext } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

type Json = Record<string, unknown>;
const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint";

// ---------------------------------------------------------------- R2: Know Your Rivals
const T0 = 9_000_000;
function rivals(members: Record<string, string>, nTeams = 2, seed = 5) {
  const ps = Object.keys(members);
  const teams: GameTeams = { list: newTeamList(nTeams), members };
  const ctx = (): ModuleContext => ({ now: T0, players: ps, active: ps, scale: 1 });
  const s = m.init({ players: ps, seed, teams });
  m.onPlayStart(s, ctx());
  const act = (p: string, action: string, payload: Json = {}) => m.intent(s, p, action, { round: s.round, ...payload }, ctx());
  const answer = (picks: Record<string, "a" | "b" | "pass">) => { for (const [p, c] of Object.entries(picks)) expect(act(p, "rivals-answer", { choice: c })).toMatchObject({ ok: true }); };
  const points = (r = s.round) => Object.fromEntries(s.results[r]!.points.map((x) => [x.teamId, x.points + x.bonus]));
  return { s, ps, ctx, act, answer, points, next: () => { m.expirePhase(s, ctx()); } };
}

describe("R2: Know Your Rivals' guessing is mutual (D-S1215R-02)", () => {
  it("the review's case: Sun all say “Rather not say”, Coral answers A/B/B: nobody can guess, nobody scores (it was Sun 30, Coral 0)", () => {
    const g = rivals({ c1: CORAL, c2: CORAL, c3: CORAL, s1: SUN, s2: SUN });
    g.answer({ c1: "a", c2: "b", c3: "b", s1: "pass", s2: "pass" });
    expect(g.s.phase).toBe("reveal");
    expect(g.act("s1", "rivals-guess", { target: CORAL, value: 1 })).toMatchObject({ ok: false, reason: "PHASE_CLOSED" });
    expect(g.points(0)).toEqual({ [CORAL]: 0, [SUN]: 0 });
    expect(g.s.results[0]!.guesses).toEqual([]);
    expect(g.s.results[0]!.sitOut).toEqual([SUN]);
  });

  it("three teams, Sun opts out: Coral and Mint guess each other and only each other; Sun can't guess or lock, and isn't waited for", () => {
    const g = rivals({ c1: CORAL, c2: CORAL, c3: CORAL, s1: SUN, s2: SUN, m1: MINT, m2: MINT }, 3);
    g.answer({ c1: "a", c2: "a", c3: "b", s1: "pass", s2: "pass", m1: "a", m2: "b" });
    expect(g.s.phase).toBe("guess");
    expect((m.publicView(g.s, g.ctx())["teamStatus"] as Json[]).map((x) => [x["teamId"], x["guessing"]])).toEqual([[CORAL, true], [SUN, false], [MINT, true]]);
    expect(g.act("s1", "rivals-guess", { target: CORAL, value: 2 })).toMatchObject({ ok: false, reason: "SITTING_OUT" });
    expect(g.act("s1", "rivals-lock")).toMatchObject({ ok: false, reason: "SITTING_OUT" });
    expect(g.act("c1", "rivals-guess", { target: SUN, value: 0 })).toMatchObject({ ok: false, reason: "NOBODY_ANSWERED" });
    expect(g.act("c1", "rivals-guess", { target: MINT, value: 1 })).toMatchObject({ ok: true });
    expect(g.act("m1", "rivals-guess", { target: CORAL, value: 2 })).toMatchObject({ ok: true });
    expect(g.act("c2", "rivals-lock")).toMatchObject({ ok: true });
    expect(g.act("m2", "rivals-lock")).toMatchObject({ ok: true });
    // Both teams in the guessing have locked: the phase closes without waiting for Sun.
    expect(g.s.phase).toBe("reveal");
    expect(g.points(0)).toEqual({ [CORAL]: 30, [SUN]: 0, [MINT]: 30 });
    expect(g.s.results[0]!.guesses.map((x) => [x.teamId, x.target])).toEqual([[CORAL, MINT], [MINT, CORAL]]);
    expect(g.s.results[0]!.sitOut).toEqual([SUN]);
  });

  it("several teams opt out, or all do: fewer than two teams in the guessing, so straight to the totals", () => {
    const g = rivals({ c1: CORAL, c2: CORAL, s1: SUN, s2: SUN, m1: MINT, m2: MINT }, 3);
    g.answer({ c1: "a", c2: "b", s1: "pass", s2: "pass", m1: "pass", m2: "pass" });
    expect(g.s.phase).toBe("reveal");
    expect(g.s.results[0]!.sitOut).toEqual([SUN, MINT]);
    expect(Object.values(g.points(0))).toEqual([0, 0, 0]);
    g.next();
    g.answer({ c1: "pass", c2: "pass", s1: "pass", s2: "pass", m1: "pass", m2: "pass" });
    expect(g.s.phase).toBe("reveal");
    expect(g.s.results[1]!.sitOut).toEqual([CORAL, SUN, MINT]);
  });

  it("partial answers keep a team in: one of Sun's two answered, so Sun guesses and is guessed (out of 1)", () => {
    const g = rivals({ c1: CORAL, c2: CORAL, s1: SUN, s2: SUN });
    g.answer({ c1: "a", c2: "b", s1: "a", s2: "pass" });
    expect(g.s.phase).toBe("guess");
    expect(g.act("c1", "rivals-guess", { target: SUN, value: 1 })).toMatchObject({ ok: true });
    expect(g.act("s2", "rivals-guess", { target: CORAL, value: 1 })).toMatchObject({ ok: true }); // s2 said "Rather not say" but still guesses with the team
    g.next();
    expect(g.points(0)).toEqual({ [CORAL]: 30, [SUN]: 30 });
    expect(g.s.results[0]!.sitOut).toEqual([]);
  });

  it("equal accuracy with the same chances scores the same, whatever the team sizes", () => {
    const g = rivals({ c1: CORAL, c2: CORAL, c3: CORAL, c4: CORAL, s1: SUN, s2: SUN, m1: MINT, m2: MINT, m3: MINT }, 3);
    g.answer({ c1: "a", c2: "a", c3: "b", c4: "a", s1: "b", s2: "b", m1: "a", m2: "b", m3: "pass" });
    const exact: Record<string, number> = { [CORAL]: 3, [SUN]: 0, [MINT]: 1 };
    for (const [p, team] of [["c1", CORAL], ["s1", SUN], ["m1", MINT]] as const) for (const t of [CORAL, SUN, MINT]) if (t !== team) expect(g.act(p, "rivals-guess", { target: t, value: exact[t] })).toMatchObject({ ok: true });
    g.next();
    expect(g.points(0)).toEqual({ [CORAL]: 60, [SUN]: 60, [MINT]: 60 });
  });

  it("catch-up: a team sitting a round out gets no bonus that round, and the others' chances stay equal", () => {
    const g = rivals({ c1: CORAL, c2: CORAL, s1: SUN, s2: SUN, m1: MINT, m2: MINT }, 3);
    // Round 1: Coral and Sun guess both rivals exactly; Mint guesses nothing: alone in last, 60 behind.
    g.answer({ c1: "a", c2: "b", s1: "a", s2: "a", m1: "b", m2: "b" });
    for (const [p, t, v] of [["c1", SUN, 2], ["c1", MINT, 0], ["s1", CORAL, 1], ["s1", MINT, 0]] as const) g.act(p, "rivals-guess", { target: t, value: v });
    g.next(); g.next();
    expect(RIVALS_CATCH_UP_GAP).toBe(60);
    expect(g.s.catchUp[1]).toBe(MINT);
    // Round 2: Mint opts out entirely: it sits the guessing out, so no points and no bonus; Coral and Sun guess each other.
    g.answer({ c1: "a", c2: "a", s1: "b", s2: "b", m1: "pass", m2: "pass" });
    g.act("c1", "rivals-guess", { target: SUN, value: 0 });
    g.act("s1", "rivals-guess", { target: CORAL, value: 2 });
    g.next();
    expect(g.s.results[1]!.points.find((x) => x.teamId === MINT)).toEqual({ teamId: MINT, points: 0, bonus: 0 });
    expect(g.points(1)).toEqual({ [CORAL]: 30, [SUN]: 30, [MINT]: 0 });
    g.next();
    // Round 3: Mint answers again, guesses exactly and gets its catch-up bonus.
    g.answer({ c1: "a", c2: "a", s1: "b", s2: "b", m1: "a", m2: "a" });
    expect(g.s.catchUp[2]).toBe(MINT);
    g.act("m1", "rivals-guess", { target: CORAL, value: 2 });
    g.next();
    expect(g.s.results[2]!.points.find((x) => x.teamId === MINT)).toEqual({ teamId: MINT, points: 30, bonus: RIVALS_POINTS.catchUp });
  });

  function cupRivals(seed: number) {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Family Cup", { kind: "cup", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Baraka", "Wanjiru", "Zawadi", "Otieno"]) ids.push(engine.join(n).player.id);
    const host = ids[0]!;
    const tm = engine.makeTeams(host, 3, 7);
    const [coral, sun, mint] = tm.list.map((x) => x.id) as [string, string, string];
    ids.forEach((p, i) => engine.moveToTeam(host, p, [coral, coral, sun, sun, mint, mint][i]!));
    const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const play = () => {
      const g = engine.startGame(host, "know-your-rivals", { official: true, seed });
      for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
      const game = engine.games.get(g.id)!;
      const st = game.extra as RivalsState;
      for (let round = 0; round < RIVALS_ROUNDS; round++) {
        // Sun keeps its answers to itself every round; Coral and Mint answer and guess each other exactly.
        for (const [i, c] of [[0, "a"], [1, "b"], [2, "pass"], [3, "pass"], [4, "a"], [5, "a"]] as const) expect(send(ids[i]!, g.id, "rivals-answer", { round, choice: c }).accepted).toBe(true);
        expect(st.phase).toBe("guess");
        expect(send(ids[2]!, g.id, "rivals-guess", { round, target: coral, value: 1 }).accepted).toBe(false);
        expect(send(ids[0]!, g.id, "rivals-guess", { round, target: mint, value: 2 }).accepted).toBe(true);
        expect(send(ids[4]!, g.id, "rivals-guess", { round, target: coral, value: 1 }).accepted).toBe(true);
        expect(send(ids[1]!, g.id, "rivals-lock", { round }).accepted).toBe(true);
        expect(send(ids[5]!, g.id, "rivals-lock", { round }).accepted).toBe(true);
        expect(st.phase).toBe("reveal");
        t += RIVALS_REVEAL_MS + 10; engine.tick();
      }
      expect(game.status).toBe("finished");
      return { g, game };
    };
    return { engine, ids, coral, sun, mint, play };
  }

  it("an Official game in a Cup, and its replay: the same rule each time; opting out never costs a player their Cup day", () => {
    const r = cupRivals(3);
    for (const pass of [1, 2]) {
      const { g, game } = r.play();
      const tvg = (r.engine.project("tv")["games"] as Json[]).find((x) => x["id"] === g.id)!;
      const rows = tvg["teamResults"] as TeamResultRow[];
      expect(rows.map((x) => [x.teamId, x.rank, x.score])).toEqual([[r.coral, 1, 180], [r.mint, 1, 180], [r.sun, 3, 0]]);
      const placement = tvg["cupPlacement"] as Record<string, number>;
      expect(r.ids.map((p) => placement[p])).toEqual([75, 75, 0, 0, 75, 75]);
      // "Rather not say" is a deliberate answer: Sun's players still took part (it never pushes anyone to disclose).
      for (const p of [r.ids[2]!, r.ids[3]!]) expect(game.outcome!.participation[p]).toMatchObject({ actions: RIVALS_ROUNDS });
      const champ = r.engine.championshipResults();
      expect(champ.map((x) => x.playerId).sort()).toEqual([...r.ids].sort());
      expect(champ.find((x) => x.playerId === r.ids[2])!.dayScores).toEqual([0]);
      expect(champ.find((x) => x.playerId === r.ids[0])!.dayScores).toEqual([75]);
      expect(pass).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------- R3: Family Questions
function familyRoom() {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine("Family night", { kind: "casual", timing: 2 });
  engine.clock = () => t;
  const ids = [engine.join("Keku", { asHost: true }).player.id];
  for (const n of ["Amina", "Baraka"]) ids.push(engine.join(n).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  // Each question carries its own canary, in the prompt and every answer.
  ids.forEach((p, i) => engine.addFamilyQuestion(p, { kind: "choice", prompt: `Where was Bibi born CANARY-${i}?`, options: [`Nairobi CANARY-${i}`, `Mombasa CANARY-${i}`, `Kisumu CANARY-${i}`], correctIndex: 1 }));
  const g = engine.startGame(ids[0]!, "family-questions", { official: false, seed: 7 });
  for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
  const game = engine.games.get(g.id)!;
  const st = () => game.extra as FamilyState;
  const canaryOf = (r: number) => st().questions[r]!.prompt.match(/CANARY-\d/)![0]!;
  const authorOf = (r: number) => st().questions[r]!.authorId;
  /** Everyone who can answers round r right, then the reveal's clock runs out. */
  const play = (r: number) => {
    for (const p of ids) if (p !== authorOf(r)) expect(send(p, g.id, "family-answer", { round: r, choice: st().questions[r]!.correctIndex }).accepted).toBe(true);
    expect(st().phase).toBe("reveal");
    t = game.phaseDeadlineAt! + 1; engine.tick(t);
  };
  const skip = (r: number) => expect(send(ids[0]!, g.id, "family-skip", { round: r }).accepted).toBe(true);
  /** Every audience's projection, as each would receive it (the TV; each phone; each phone again after a reconnect). */
  const audiences = (e: RoomEngine) => [["tv", e.project("tv")], ...ids.map((p) => [p, e.project("player", p)] as const)] as [string, Json][];
  const gameViews = (proj: Json) => [...((proj["games"] as Json[] | undefined) ?? []), ...((proj["myGames"] as Json[] | undefined) ?? [])].filter((x) => x["id"] === g.id);
  /** Nothing of round r's question in any game view, for any audience; and nowhere at all in non-authors' projections. */
  const absent = (e: RoomEngine, r: number) => {
    const canary = canaryOf(r);
    for (const [who, proj] of audiences(e)) {
      for (const v of gameViews(proj)) expect(JSON.stringify(v), `${who}'s game view`).not.toContain(canary);
      // The writer's own question list ("mine") is theirs to see; everyone else's whole projection never has it.
      if (who !== authorOf(r)) expect(JSON.stringify(proj), `${who}'s projection`).not.toContain(canary);
    }
  };
  return { engine, ids, g, game, st, canaryOf, play, skip, absent, gameViews, restored: () => RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json) };
}

describe("R3: a skipped Family Question is never described again", () => {
  it("the last question skipped: the finished views keep the skip marker and earlier rounds, and nothing of it — after a reconnect and a restore too", () => {
    const f = familyRoom();
    f.play(0);
    f.play(1);
    expect(f.st().round).toBe(2);
    f.skip(2);
    expect(f.game.status).toBe("finished");
    f.absent(f.engine, 2);
    const tvState = f.gameViews(f.engine.project("tv"))[0]!["state"] as Json;
    expect(tvState).toMatchObject({ phase: "finished", skipped: true });
    expect(tvState["prompt"]).toBeUndefined();
    expect(tvState["options"]).toBeUndefined();
    expect(tvState["kind"]).toBeUndefined();
    const rounds = tvState["rounds"] as Json[];
    expect(rounds[2]).toEqual({ skipped: true });
    expect(rounds[0]!["prompt"]).toContain(f.canaryOf(0));
    expect(rounds[1]!["prompt"]).toContain(f.canaryOf(1));
    // A reconnect is a fresh projection; a restored room projects the same.
    f.absent(f.engine, 2);
    const again = f.restored();
    f.absent(again, 2);
    expect(((f.gameViews(again.project("tv"))[0]!["state"] as Json)["rounds"] as Json[])[2]).toEqual({ skipped: true });
  });

  it("a question skipped mid-game: never shown again while the game goes on, nor at its end, nor after a restore", () => {
    const f = familyRoom();
    f.skip(0);
    expect(f.st()).toMatchObject({ round: 1, phase: "answer" });
    f.absent(f.engine, 0);
    f.play(1);
    f.absent(f.engine, 0);
    f.play(2);
    expect(f.game.status).toBe("finished");
    f.absent(f.engine, 0);
    f.absent(f.restored(), 0);
    const rounds = (f.gameViews(f.engine.project("tv"))[0]!["state"] as Json)["rounds"] as Json[];
    expect(rounds[0]).toEqual({ skipped: true });
    // The last round was played, so the finished view's top level describes it, as before.
    expect((f.gameViews(f.engine.project("tv"))[0]!["state"] as Json)["prompt"]).toContain(f.canaryOf(2));
  });
});
