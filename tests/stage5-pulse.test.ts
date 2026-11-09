/**
 * Stage 5: Pattern Pulse — the pure module and the engine around it.
 * Practice-only; server-generated, server-checked patterns; a pattern is in
 * its own player's projection only while they memorise it; per-player pacing
 * with server-clock windows that close even when nobody acts.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PULSE_GRACE_MS, PULSE_LENGTHS, PULSE_SYMBOLS, pulseInputMs, pulseModule, pulsePattern, pulseScore, pulseShowMs, type PulseState,
} from "../src/games/modules/pulse.js";
import { RoomEngine } from "../src/server/room.js";

type Json = Record<string, unknown>;
const P = ["a", "b"];
const ctx = (now: number) => ({ now, players: P, active: P, scale: 1 });

describe("Pattern Pulse module", () => {
  it("patterns: the right length, six symbols, no symbol twice in a row, the same for the same seed, different per player", () => {
    for (let r = 0; r < PULSE_LENGTHS.length; r++) {
      const p = pulsePattern(7, "a", r);
      expect(p).toHaveLength(PULSE_LENGTHS[r]!);
      expect(p.every((x) => Number.isInteger(x) && x >= 0 && x < PULSE_SYMBOLS)).toBe(true);
      expect(p.every((x, i) => i === 0 || x !== p[i - 1])).toBe(true);
      expect(pulsePattern(7, "a", r)).toEqual(p);
    }
    // Over a whole game, two players' sequences differ (nobody can call out the answer).
    const all = (pid: string) => PULSE_LENGTHS.map((_, r) => pulsePattern(7, pid, r).join("")).join("|");
    expect(all("a")).not.toBe(all("b"));
  });

  it("scoring: 20 per symbol right from the start, +50 for the whole sequence; nothing for a miss", () => {
    expect(pulseScore([1, 2, 3], [1, 2, 3])).toEqual({ correctRun: 3, perfect: true, points: 110 });
    expect(pulseScore([1, 2, 3], [1, 2, 4])).toEqual({ correctRun: 2, perfect: false, points: 40 });
    expect(pulseScore([1, 2, 3], [0, 2, 3])).toEqual({ correctRun: 0, perfect: false, points: 0 });
    expect(pulseScore([1, 2, 3], null)).toEqual({ correctRun: 0, perfect: false, points: 0 });
  });

  it("a round: open, see the pattern only while memorising, answer in the window; rounds go in order", () => {
    const s = pulseModule.init({ players: P, seed: 11 });
    expect(pulseModule.intent(s, "a", "pulse-answer", { round: 0, sequence: [0, 1, 2] }, ctx(0))).toEqual({ ok: false, reason: "WRONG_ROUND" });
    expect(pulseModule.intent(s, "a", "pulse-open", { round: 1 }, ctx(0))).toEqual({ ok: false, reason: "WRONG_ROUND" });
    expect(pulseModule.intent(s, "a", "pulse-open", { round: 0 }, ctx(1000))).toEqual({ ok: true });
    // Asking again never restarts the clock.
    expect(pulseModule.intent(s, "a", "pulse-open", { round: 0 }, ctx(2000))).toEqual({ ok: true });
    const showUntil = 1000 + pulseShowMs(3);
    expect(s.per["a"]!.open!.showUntil).toBe(showUntil);
    const during = pulseModule.playerView(s, "a", { now: showUntil - 1, scale: 1 }) as Json;
    expect((during["open"] as Json)["pattern"]).toEqual(pulsePattern(11, "a", 0));
    const after = pulseModule.playerView(s, "a", { now: showUntil, scale: 1 }) as Json;
    expect((after["open"] as Json)["pattern"]).toBeUndefined();
    expect(pulseModule.intent(s, "a", "pulse-answer", { round: 0, sequence: [0, 1] }, ctx(showUntil + 10))).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(pulseModule.intent(s, "a", "pulse-answer", { round: 0, sequence: [0, 1, 9] }, ctx(showUntil + 10))).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
    const r = pulseModule.intent(s, "a", "pulse-answer", { round: 0, sequence: pulsePattern(11, "a", 0) }, ctx(showUntil + 10));
    expect(r).toEqual({ ok: true, result: { round: 0, correctRun: 3, perfect: true, points: 110 } });
    expect(pulseModule.intent(s, "a", "pulse-answer", { round: 0, sequence: pulsePattern(11, "a", 0) }, ctx(showUntil + 20))).toEqual({ ok: false, reason: "ALREADY_ANSWERED" });
    expect(s.per["a"]!.next).toBe(1);
  });

  it("privacy: the public view has counts only; another player's view never has my pattern; a future round's pattern is never sent", () => {
    const s = pulseModule.init({ players: P, seed: 5 });
    pulseModule.intent(s, "a", "pulse-open", { round: 0 }, ctx(0));
    const pub = JSON.stringify(pulseModule.publicView(s, { now: 10, scale: 1 }));
    expect(pub).not.toMatch(/pattern|sequence|answer|results/);
    const theirs = JSON.stringify(pulseModule.playerView(s, "b", { now: 10, scale: 1 }));
    expect(theirs).not.toMatch(/"pattern"/);
    const mine = pulseModule.playerView(s, "a", { now: 10, scale: 1 }) as Json;
    const sent = JSON.stringify(mine);
    for (let r = 1; r < PULSE_LENGTHS.length; r++) expect(sent).not.toContain(JSON.stringify(pulsePattern(5, "a", r)));
  });

  it("a missed window closes as 0 points: on the next action, or by the clock (dueAt/advance) with nobody acting", () => {
    const s = pulseModule.init({ players: P, seed: 3 });
    pulseModule.intent(s, "a", "pulse-open", { round: 0 }, ctx(0));
    const closes = pulseShowMs(3) + pulseInputMs(3) + PULSE_GRACE_MS;
    expect(pulseModule.dueAt!(s)).toBe(closes);
    // An answer after the window (and its grace) is not counted; the round is closed as missed.
    expect(pulseModule.intent(s, "a", "pulse-answer", { round: 0, sequence: pulsePattern(3, "a", 0) }, ctx(closes + 1))).toEqual({ ok: false, reason: "ALREADY_ANSWERED" });
    expect(s.per["a"]!.results[0]).toMatchObject({ round: 0, answer: null, points: 0 });
    // The clock path: b opens and walks away.
    pulseModule.intent(s, "b", "pulse-open", { round: 0 }, ctx(100));
    expect(pulseModule.dueAt!(s)).toBe(100 + closes);
    pulseModule.advance!(s, ctx(100 + closes));
    expect(s.per["b"]!.results[0]).toMatchObject({ round: 0, answer: null, points: 0 });
    expect(pulseModule.dueAt!(s)).toBeUndefined();
  });

  it("finishing: everyone done after six rounds (or sat out) ends the game; totals add up", () => {
    const s = pulseModule.init({ players: P, seed: 9 });
    let t = 0;
    for (let r = 0; r < PULSE_LENGTHS.length; r++) {
      pulseModule.intent(s, "a", "pulse-open", { round: r }, ctx(t));
      t += pulseShowMs(PULSE_LENGTHS[r]!) + 100;
      const seq = pulsePattern(9, "a", r);
      if (r === 5) seq[seq.length - 1] = (seq.at(-1)! + 1) % PULSE_SYMBOLS === seq.at(-2) ? (seq.at(-1)! + 2) % PULSE_SYMBOLS : (seq.at(-1)! + 1) % PULSE_SYMBOLS;
      expect(pulseModule.intent(s, "a", "pulse-answer", { round: r, sequence: seq }, ctx(t)).ok).toBe(true);
    }
    expect(s.per["a"]!.done).toBe(true);
    expect(pulseModule.finished(s, ctx(t))).toBe(false); // b still playing
    expect(pulseModule.abstain(s, "b", ctx(t))).toEqual({ ok: true, wholeGameAbstain: true });
    expect(pulseModule.finished(s, ctx(t))).toBe(true);
    // Five perfect rounds (3..7 symbols) and 7 of 8 in the last: 5×50 + 20×(3+4+5+6+7+7).
    expect(pulseModule.scores(s, P)).toEqual({ a: 5 * 50 + 20 * 32, b: 0 });
    const part = pulseModule.participation(s, P).participation;
    expect(part["a"]).toMatchObject({ done: 6, of: 6, finished: true });
    expect(part["b"]).toMatchObject({ done: 0, of: 6, finished: false });
  });
});

describe("Pattern Pulse: finished means played (independent review)", () => {
  it("a player whose every window ran out is done but not 'finished'", () => {
    const s = pulseModule.init({ players: ["a"], seed: 2 });
    let t = 0;
    for (let r = 0; r < PULSE_LENGTHS.length; r++) {
      pulseModule.intent(s, "a", "pulse-open", { round: r }, { now: t, players: ["a"], active: ["a"], scale: 1 });
      t = pulseModule.dueAt!(s)!;
      pulseModule.advance!(s, { now: t, players: ["a"], active: ["a"], scale: 1 });
      t += 1;
    }
    expect(s.per["a"]!.done).toBe(true);
    expect(pulseModule.participation(s, ["a"]).participation["a"]).toMatchObject({ done: 0, actions: 0, finished: false });
    expect(pulseModule.anyAction(s)).toBe(false);
  });
});

describe("Pattern Pulse in the room engine", () => {
  const T0 = 1_800_000_000_000;
  function setup(n = 2) {
    const engine = new RoomEngine("PP room", { timing: 2 });
    let t = T0;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
    const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const mine = (pid: string, gid: string) => JSON.stringify(((engine.project("player", pid) as Json)["myGames"] as Json[]).find((g) => g["id"] === gid));
    return { engine, ids, send, mine, now: () => t, advance: (ms: number) => { t += ms; engine.tick(t); } };
  }
  const started = (engine: RoomEngine, ids: string[], send: (p: string, g: string, a: string, x?: Json) => { accepted: boolean }) => {
    const g = engine.startGame(ids[0]!, "pattern-pulse", { official: false });
    for (const p of ids) expect(send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    expect(engine.games.get(g.id)!.status).toBe("playing");
    return g.id;
  };

  it("is practice-only: an official start is refused with the reason", () => {
    const { engine, ids } = setup();
    expect(() => engine.startGame(ids[0]!, "pattern-pulse", { official: true })).toThrow(/practice-only/);
  });

  it("plays to a finish on the server: patterns checked there, the TV never sees one, a solo player can practise", () => {
    const { engine, ids, send, advance, mine } = setup(1);
    const gid = started(engine, ids, send);
    for (let r = 0; r < PULSE_LENGTHS.length; r++) {
      expect(send(ids[0]!, gid, "pulse-open", { round: r }).accepted).toBe(true);
      const st = engine.games.get(gid)!.extra as PulseState;
      const pattern = pulsePattern(st.seed, ids[0]!, r);
      expect(JSON.stringify(engine.project("tv"))).not.toContain(`"pattern"`);
      expect(mine(ids[0]!, gid)).toContain(`"pattern":${JSON.stringify(pattern)}`); // memorising: their own phone has it
      advance(pulseShowMs(PULSE_LENGTHS[r]!) + 50);
      expect(mine(ids[0]!, gid)).not.toContain(`"pattern":${JSON.stringify(pattern)}`); // gone once the window closes
      expect(send(ids[0]!, gid, "pulse-answer", { round: r, sequence: pattern }).accepted).toBe(true);
    }
    const g = engine.games.get(gid)!;
    expect(g.status).toBe("finished");
    expect(g.outcome?.reason).toBe("completed");
    expect(g.outcome?.countsOfficially).toBe(false);
    expect(g.rawScores).toEqual({ [ids[0]!]: 6 * 50 + 20 * 33 });
  });

  it("a player who opens a round and walks away: the server clock closes it (0 points) and the game can still end without them acting", () => {
    const { engine, ids, send, advance } = setup(2);
    const gid = started(engine, ids, send);
    // P1 opens round 0 and walks away; Keku opens every round and never answers.
    send(ids[1]!, gid, "pulse-open", { round: 0 });
    for (let r = 0; r < PULSE_LENGTHS.length; r++) {
      expect(send(ids[0]!, gid, "pulse-open", { round: r }).accepted).toBe(true);
      const len = PULSE_LENGTHS[r]!;
      advance(pulseShowMs(len) + pulseInputMs(len) + PULSE_GRACE_MS + 1); // nobody answers
    }
    const st = engine.games.get(gid)!.extra as PulseState;
    expect(st.per[ids[0]!]!.results.map((r) => r.points)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(st.per[ids[0]!]!.done).toBe(true);
    // P1 missed round 0 by the clock too, without acting.
    expect(st.per[ids[1]!]!.results[0]).toMatchObject({ round: 0, answer: null });
    expect(engine.games.get(gid)!.status).toBe("playing"); // P1 still has rounds 1-5 until the deadline
    advance(5 * 60_000);
    const g = engine.games.get(gid)!;
    expect(g.status).toBe("finished");
    expect(g.outcome?.reason).toBe("deadline");
    expect(g.rawScores).toEqual({ [ids[0]!]: 0, [ids[1]!]: 0 });
  });

  it("a restart mid-round keeps the open window and the result so far; the pattern is still hidden after the memorise window", () => {
    const { engine, ids, send, advance, now } = setup(2);
    const gid = started(engine, ids, send);
    send(ids[0]!, gid, "pulse-open", { round: 0 });
    const st = engine.games.get(gid)!.extra as PulseState;
    advance(pulseShowMs(3) + 10);
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    restored.clock = () => now();
    const rst = restored.games.get(gid)!.extra as PulseState;
    expect(rst.per[ids[0]!]!.open).toEqual(st.per[ids[0]!]!.open);
    const tv = JSON.stringify(restored.project("tv"));
    expect(tv).not.toContain(`"pattern"`);
    const answer = pulsePattern(rst.seed, ids[0]!, 0);
    const r = restored.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: restored.id, gameInstanceId: gid, action: "pulse-answer", payload: { round: 0, sequence: answer } }, ids[0]!);
    expect(r.accepted).toBe(true);
    expect((restored.games.get(gid)!.extra as PulseState).per[ids[0]!]!.results[0]).toMatchObject({ points: 110, perfect: true });
  });

  it("sitting out: the rest of the game; further actions are refused; the game goes on for the others", () => {
    const { engine, ids, send } = setup(2);
    const gid = started(engine, ids, send);
    expect(send(ids[1]!, gid, "abstain").accepted).toBe(true);
    expect(send(ids[1]!, gid, "pulse-open", { round: 0 }).accepted).toBe(false);
    expect(engine.games.get(gid)!.status).toBe("playing");
  });
});
