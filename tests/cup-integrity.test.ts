/**
 * Sprint 3, CP4: championship integrity.
 *
 * 1. Historical results keep their rules: a 4-day Cup played on the exact
 *    Sprint 2 commit (3119f17, fixture generated there, including official
 *    Charades through the 75/25 team channel, a host-skipped game and a
 *    score override) restores on Sprint 3 with IDENTICAL standings,
 *    championship and ceremony.
 * 2. New rooms run the Individual Family Cup: team games add nothing, a
 *    day is the mean of its individual placement scores, best three days +
 *    attendance bonus + midrank normalisation unchanged.
 * 3. A Cup's format cannot change after the room exists.
 * 4. Qualification options exist but the active rule is the existing one.
 * 5. A seven-day Individual Cup with deadline endings and restarts.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { computeChampionship } from "../src/scoring/ledger.js";
import { COMPETITION_FORMATS } from "../src/scoring/format.js";
import { ACTIVE_QUALIFICATION_POLICY, PROPOSED_QUALIFICATION_POLICIES, qualifies } from "../src/scoring/qualification.js";
import { midrankScore } from "../src/scoring/championship.js";
import { GAME_POLICIES } from "../src/server/lifecycle.js";
import { FakeClock, Harness, type Player } from "./helpers/harness.js";

type Json = Record<string, unknown>;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/cup-legacy-sprint2.json", import.meta.url), "utf8")) as {
  snapshot: Json; officialStandings: Json; championship: Json[]; ceremony: Json;
};
const intent = (roomId: string, gid: string, action: string, payload: Json) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });

describe("historical Cups keep their rules (before/after)", () => {
  it("a Sprint 2 Cup restores with identical standings, championship and ceremony", () => {
    const engine = RoomEngine.fromJSON(structuredClone(fixture.snapshot));
    expect(engine.competitionFormat).toBe("combined-75-25");
    expect(engine.officialStandings()).toEqual(fixture.officialStandings);
    expect(engine.championshipResults()).toEqual(fixture.championship);
    expect(engine.ceremony()).toEqual(fixture.ceremony);
  });

  it("the baseline really exercises the team channel and the legacy exclusions", () => {
    const games = (fixture.snapshot["games"] as Json[]);
    expect(games.some((g) => g["gameId"] === "charades" && g["official"] === true)).toBe(true);
    expect(games.some((g) => g["timedOut"] === true)).toBe(true);
    expect(games.some((g) => g["official"] === false)).toBe(true);
    // Day 1 has an official team game: removing it would change Day 1 scores.
    const withoutTeam = RoomEngine.fromJSON(structuredClone(fixture.snapshot));
    for (const g of withoutTeam.games.values()) if (g.gameId === "charades") g.official = false;
    expect(withoutTeam.championshipResults()).not.toEqual(fixture.championship);
  });

  it("a legacy room survives a save/restore round trip still on its own rules", () => {
    const engine = RoomEngine.fromJSON(structuredClone(fixture.snapshot));
    const again = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    expect(again.competitionFormat).toBe("combined-75-25");
    expect(again.championshipResults()).toEqual(fixture.championship);
  });
});

describe("the Individual Family Cup (new rooms)", () => {
  function room(n: number) {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Individual Cup");
    engine.clock = () => t;
    const host = engine.join("Ada", { asHost: true }).player.id;
    const ids = [host];
    for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
    const tick = (ms: number) => { t += ms; };
    return { engine, host, ids, tick };
  }
  function playTrivia(engine: RoomEngine, host: string, ids: string[], correct: number[], tick: (ms: number) => void) {
    const g = engine.startGame(host, "trivia", { official: true, seed: 5 });
    const qs = (g.extra as { questions: { id: string; correctIndex: number }[] }).questions;
    ids.forEach((pid, i) => qs.forEach((q, k) => { tick(500); engine.submitIntent(intent(engine.id, g.id, "trivia-answer", { questionId: q.id, chosenIndex: k < correct[i]! ? q.correctIndex : (q.correctIndex + 1) % 4 }), pid); }));
    expect(g.status).toBe("finished");
    return g;
  }

  it("new rooms are individual-only and say so in every projection", () => {
    const { engine } = room(2);
    expect(engine.competitionFormat).toBe("individual-only");
    const tv = engine.project("tv") as Json;
    expect(tv["competition"]).toEqual({ format: "individual-only", label: "Individual Family Cup", description: COMPETITION_FORMATS["individual-only"].description, teamGamesCount: false });
  });

  it("a day's score is the mean of its individual placement scores (no team share, no fake contribution)", () => {
    const { engine, host, ids, tick } = room(3);
    const g1 = playTrivia(engine, host, ids, [10, 5, 0], tick);
    const g2 = playTrivia(engine, host, ids, [0, 5, 10], tick);
    const res = engine.championshipResults();
    for (const pid of ids) {
      const expected = (midrankScore(g1.rawScores[pid]!, Object.values(g1.rawScores)) + midrankScore(g2.rawScores[pid]!, Object.values(g2.rawScores))) / 2;
      expect(res.find((r) => r.playerId === pid)!.dayScores).toEqual([expected]);
    }
  });

  it("matches the shared championship engine with solo-only days (best three + attendance bonus unchanged)", () => {
    const { engine, host, ids, tick } = room(3);
    const skill = [[10, 6, 2], [4, 9, 6], [7, 7, 1], [2, 3, 10], [9, 1, 5]];
    for (const s of skill) { playTrivia(engine, host, ids, s, tick); engine.advanceDay(host); }
    const days = [...engine.games.values()].map((g) => ({ g, all: Object.values(g.rawScores) }))
      .flatMap(({ g, all }) => ids.map((pid) => ({ playerId: pid, day: g.day ?? 1, soloScores: [midrankScore(g.rawScores[pid]!, all)], teamScores: [] as number[] })));
    expect(engine.championshipResults()).toEqual(computeChampionship(days, { config: COMPETITION_FORMATS["individual-only"].config }));
    const top = engine.championshipResults()[0]!;
    expect(top.qualifyingDays).toBe(5);
    expect(top.participationBonus).toBe(10); // 5 days: +5 for each beyond 3
    expect(top.counted).toHaveLength(3); // best three
  });

  it("a team game can never feed an Individual Cup, even if one were recorded official", () => {
    const { engine, host, ids, tick } = room(4);
    playTrivia(engine, host, ids, [10, 7, 4, 1], tick);
    const before = engine.championshipResults();
    const standingsBefore = engine.officialStandings();
    // Simulate a team result injected by a bug or an old client: it must be ignored.
    const ch = engine.startGame(host, "charades", { official: false });
    ch.status = "finished"; ch.official = true; ch.rawScores = { [ids[0]!]: 0, [ids[1]!]: 400, [ids[2]!]: 0, [ids[3]!]: 400 };
    expect(engine.championshipResults()).toEqual(before);
    expect(engine.officialStandings()).toEqual(standingsBefore);
  });

  it("the format cannot be changed once the room exists", () => {
    const { engine } = room(2);
    expect(() => { (engine as unknown as { competitionFormat: string }).competitionFormat = "combined-75-25"; }).toThrow(TypeError);
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    expect(restored.competitionFormat).toBe("individual-only");
  });
});

describe("qualifying days (P7: mechanism only, existing rule active)", () => {
  it("the active rule is the existing one", () => {
    expect(ACTIVE_QUALIFICATION_POLICY).toEqual({ kind: "any-official-game" });
    expect(new RoomEngine("x").qualificationPolicy).toEqual({ kind: "any-official-game" });
  });

  const g = (done: number, of = 10, finished?: boolean) => ({ done, of, ...(finished !== undefined ? { finished } : {}) });
  it.each([
    // A did nothing in 1 of 3 games that day
    [{ gamesOnRoster: 1, gamesPlayed: 0, gamesThatDay: 3, participations: [g(0)] }, [true, false, false, false, false]],
    // one answer in one game of three: B says yes, E (meaningful) says no
    [{ gamesOnRoster: 3, gamesPlayed: 1, gamesThatDay: 3, participations: [g(1), g(0), g(0)] }, [true, true, false, false, false]],
    // a short night: ONE game, played properly (6 of 10): E says yes
    [{ gamesOnRoster: 1, gamesPlayed: 1, gamesThatDay: 1, participations: [g(6)] }, [true, true, false, true, true]],
    // two games, a couple of answers each: C/D yes, E no
    [{ gamesOnRoster: 3, gamesPlayed: 2, gamesThatDay: 3, participations: [g(2), g(1), g(0)] }, [true, true, true, true, false]],
    // a Connections puzzle played to its end (0 groups, 4 mistakes) is meaningful
    [{ gamesOnRoster: 1, gamesPlayed: 1, gamesThatDay: 4, participations: [g(0, 4, true)] }, [true, true, false, false, true]],
    // exactly half counts
    [{ gamesOnRoster: 1, gamesPlayed: 1, gamesThatDay: 2, participations: [g(5)] }, [true, true, false, true, true]],
    // a game from before Sprint 3 (no record) keeps counting
    [{ gamesOnRoster: 1, gamesPlayed: 1, gamesThatDay: 1, participations: [null] }, [true, true, false, true, true]],
  ])("attendance %j -> options A-E %j", (a, expected) => {
    expect(PROPOSED_QUALIFICATION_POLICIES.map((p) => qualifies(p.policy, a))).toEqual(expected);
  });

  it("option E's threshold is the policy's own share, not a hidden constant", () => {
    const a = { gamesOnRoster: 1, gamesPlayed: 1, gamesThatDay: 1, participations: [{ done: 3, of: 10 }] };
    expect(qualifies({ kind: "meaningful-games", minGames: 1, share: 0.5 }, a)).toBe(false);
    expect(qualifies({ kind: "meaningful-games", minGames: 1, share: 0.3 }, a)).toBe(true);
    expect(qualifies({ kind: "meaningful-games", minGames: 2, share: 0.3 }, a)).toBe(false);
  });

  it("option E (not active) in a real room: one answer is not enough, half a game is", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("E");
    engine.clock = () => t;
    const host = engine.join("Ada", { asHost: true }).player.id;
    const bea = engine.join("Bea").player.id;
    const cal = engine.join("Cal").player.id;
    const game = engine.startGame(host, "trivia", { official: true, seed: 2 });
    const qs = (game.extra as { questions: { id: string; correctIndex: number }[] }).questions;
    const answer = (pid: string, n: number) => { for (const q of qs.slice(0, n)) engine.submitIntent(intent(engine.id, game.id, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid); };
    answer(host, 10); answer(bea, 5); answer(cal, 1);
    t = game.deadlineAt! + 1;
    engine.tick();
    expect(engine.championshipResults().map((r) => r.playerId).sort()).toEqual([bea, cal, host].sort()); // active rule A unchanged
    engine.qualificationPolicy = PROPOSED_QUALIFICATION_POLICIES.find((p) => p.id === "E")!.policy;
    expect(engine.championshipResults().map((r) => r.playerId).sort()).toEqual([bea, host].sort());
  });

  it("option B (not active) would stop a do-nothing roster spot from earning a qualifying day", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Q");
    engine.clock = () => t;
    const host = engine.join("Ada", { asHost: true }).player.id;
    const bea = engine.join("Bea").player.id;
    const cal = engine.join("Cal").player.id;
    const g = engine.startGame(host, "trivia", { official: true, seed: 2 });
    const qs = (g.extra as { questions: { id: string; correctIndex: number }[] }).questions;
    for (const pid of [host, bea]) for (const q of qs) engine.submitIntent(intent(engine.id, g.id, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
    t = g.deadlineAt! + 1;
    engine.tick();
    expect(engine.championshipResults().map((r) => r.playerId).sort()).toEqual([bea, cal, host].sort()); // active rule: Cal's day counts
    engine.qualificationPolicy = PROPOSED_QUALIFICATION_POLICIES.find((p) => p.id === "B")!.policy;
    expect(engine.championshipResults().map((r) => r.playerId).sort()).toEqual([bea, host].sort());
  });
});

describe("a seven-day Individual Cup with deadlines and restarts", () => {
  let h: Harness;
  afterEach(async () => { await h.dispose(); });

  it("results are identical before and after each restart, every game ends once, and the Cup is decided", async () => {
    const clock = new FakeClock();
    h = await new Harness(undefined, { clock }).start();
    await h.createRoom();
    const ps: Player[] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    for (let day = 1; day <= 7; day++) {
      // Game 1: everyone answers some trivia; the deadline closes it during a server outage on odd days.
      const g1 = (await h.startGame(ps[0]!, "trivia", { seed: day })).body["gameId"] as string;
      const qs = (h.game(g1).extra as { questions: { id: string; correctIndex: number }[] }).questions;
      for (const [i, p] of ps.entries()) {
        const n = (day + i * 3) % qs.length;
        for (const q of qs.slice(0, n)) await h.intent(p, g1, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex });
      }
      if (day % 2 === 1) {
        await h.stop();
        clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
        await h.restart(); // the deadline fell due while the server was down
        for (const p of ps) await h.connect(p);
        expect(h.game(g1).outcome?.reason).toBe("deadline");
      } else {
        clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
        h.lifecycleTick();
      }
      // Game 2: math, everyone finishes (completed).
      const g2 = (await h.startGame(ps[0]!, "math-mayhem", { seed: day })).body["gameId"] as string;
      for (const [i, p] of ps.entries()) for (const [k, q] of h.game(g2).questions!.entries()) {
        await h.intent(p, g2, "submit-math-answer", { questionId: q.id, chosenIndex: (k + i + day) % 3 === 0 ? (q.correctIndex + 1) % 4 : q.correctIndex });
      }
      expect(h.game(g2).outcome?.reason).toBe("completed");
      const snapshotResults = JSON.stringify(h.engine().championshipResults());
      await h.restart();
      for (const p of ps) await h.connect(p);
      expect(JSON.stringify(h.engine().championshipResults())).toBe(snapshotResults);
      if (day < 7) expect((await h.post(`/rooms/${h.roomId}/day`, {}, ps[0]!.token)).status).toBe(200);
    }
    const engine = h.engine();
    for (const g of engine.games.values()) expect(engine.ledger.filter((e) => e.type === "game-finished" && e.gameInstanceId === g.id)).toHaveLength(1);
    const results = engine.championshipResults();
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.eligible)).toBe(true);
    expect(results.every((r) => r.counted.length === 3 && r.qualifyingDays === 7 && r.participationBonus === 20)).toBe(true);
    expect(results[0]!.total).toBeGreaterThanOrEqual(results[1]!.total);
  });
});
