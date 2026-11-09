/**
 * Stage 5: Majority Rules — the pure module and the engine around it.
 * Practice-only; predict first, then vote; votes anonymous for good; an
 * explicit, tested tie policy; server-side scoring.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { majorityModule, majorityRoundResult, MAJORITY_ROUNDS, type MajorityState } from "../src/games/modules/majority.js";
import { MAJORITY_PROMPTS } from "../src/games/modules/packs/majority-prompts.js";
import { RoomEngine } from "../src/server/room.js";

type Json = Record<string, unknown>;
const ctx = (players: string[]) => ({ now: 0, players, active: players, scale: 1 });
const P = ["a", "b", "c"];

function play(s: MajorityState, plan: Record<string, ["a" | "b", "a" | "b"]>) {
  for (const [pid, [pred, vote]] of Object.entries(plan)) {
    expect(majorityModule.intent(s, pid, "majority-predict", { choice: pred }, ctx(P))).toEqual({ ok: true });
    expect(majorityModule.intent(s, pid, "majority-vote", { choice: vote }, ctx(P))).toEqual({ ok: true });
  }
}

describe("Majority Rules module", () => {
  it("deals five distinct prompts from the original pack, the same for the same seed", () => {
    const s1 = majorityModule.init({ players: P, seed: 42 });
    const s2 = majorityModule.init({ players: P, seed: 42 });
    expect(s1.prompts).toHaveLength(MAJORITY_ROUNDS);
    expect(new Set(s1.prompts.map((p) => p.id)).size).toBe(MAJORITY_ROUNDS);
    expect(s1.prompts).toEqual(s2.prompts);
    expect(s1.prompts.every((p) => MAJORITY_PROMPTS.some((q) => q.id === p.id))).toBe(true);
    expect(new Set(MAJORITY_PROMPTS.map((p) => p.id)).size).toBe(MAJORITY_PROMPTS.length);
  });

  it("two steps in order: a vote before a prediction is refused; each is locked once given", () => {
    const s = majorityModule.init({ players: P, seed: 1 });
    expect(majorityModule.intent(s, "a", "majority-vote", { choice: "a" }, ctx(P))).toEqual({ ok: false, reason: "PREDICT_FIRST" });
    expect(majorityModule.intent(s, "a", "majority-predict", { choice: "a" }, ctx(P))).toEqual({ ok: true });
    expect(majorityModule.intent(s, "a", "majority-predict", { choice: "b" }, ctx(P))).toEqual({ ok: false, reason: "ALREADY_ANSWERED" });
    expect(majorityModule.intent(s, "a", "majority-vote", { choice: "c" }, ctx(P))).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
  });

  it("a clear majority: 100 for each right prediction, 0 otherwise; your own vote counts", () => {
    const s = majorityModule.init({ players: P, seed: 1 });
    play(s, { a: ["a", "a"], b: ["b", "a"], c: ["a", "b"] });
    expect(s.phase).toBe("reveal"); // everyone did both: the round reveals at once
    const r = majorityRoundResult(s, 0);
    expect(r).toEqual({ a: 2, b: 1, majority: "a", points: { a: 100, b: 0, c: 100 } });
  });

  it("tie policy: an evenly split room makes every prediction worth 50; nobody voting gives no majority", () => {
    const s = majorityModule.init({ players: ["a", "b"], seed: 1 });
    const c2 = ctx(["a", "b"]);
    majorityModule.intent(s, "a", "majority-predict", { choice: "a" }, c2);
    majorityModule.intent(s, "a", "majority-vote", { choice: "a" }, c2);
    majorityModule.intent(s, "b", "majority-predict", { choice: "a" }, c2);
    majorityModule.intent(s, "b", "majority-vote", { choice: "b" }, c2);
    expect(majorityRoundResult(s, 0)).toEqual({ a: 1, b: 1, majority: "tie", points: { a: 50, b: 50 } });
    const n = majorityModule.init({ players: P, seed: 1 });
    majorityModule.intent(n, "a", "majority-predict", { choice: "b" }, ctx(P));
    majorityModule.expirePhase(n, ctx(P)); // time ran out: one prediction, no votes
    expect(majorityRoundResult(n, 0)).toEqual({ a: 0, b: 0, majority: "none", points: { a: 0 } });
  });

  it("skipping a round discards what was given and scores 0; the round ends when everyone is done", () => {
    const s = majorityModule.init({ players: P, seed: 1 });
    majorityModule.intent(s, "c", "majority-predict", { choice: "a" }, ctx(P));
    expect(majorityModule.abstain(s, "c", ctx(P))).toEqual({ ok: true });
    play(s, { a: ["a", "a"], b: ["a", "a"] });
    expect(s.phase).toBe("reveal");
    expect(majorityRoundResult(s, 0).points).toEqual({ a: 100, b: 100 });
    expect(majorityModule.intent(s, "c", "majority-predict", { choice: "a" }, ctx(P))).toEqual({ ok: false, reason: "PHASE_CLOSED" });
  });

  it("phases: predict → reveal → next round; the fifth reveal ends the game", () => {
    const s = majorityModule.init({ players: P, seed: 3 });
    for (let r = 0; r < MAJORITY_ROUNDS; r++) {
      expect(majorityModule.phase(s)).toEqual({ key: `${r}:predict`, kind: "predict" });
      majorityModule.expirePhase(s, ctx(P));
      expect(majorityModule.phase(s)).toEqual({ key: `${r}:reveal`, kind: "reveal" });
      majorityModule.expirePhase(s, ctx(P));
    }
    expect(majorityModule.finished(s, ctx(P))).toBe(true);
    expect(majorityModule.phase(s)).toBeNull();
  });

  it("privacy: while a round is open the public view has no votes or predictions; after it, totals only, never who voted what", () => {
    const s = majorityModule.init({ players: P, seed: 1 });
    play(s, { a: ["a", "a"], b: ["b", "b"] });
    const open = JSON.stringify(majorityModule.publicView(s, { now: 0, scale: 1 }));
    expect(open).not.toMatch(/votes|prediction|"result"/i);
    expect(open).not.toMatch(/"a":"a"|"b":"b"/);
    majorityModule.intent(s, "c", "majority-predict", { choice: "a" }, ctx(P));
    majorityModule.intent(s, "c", "majority-vote", { choice: "a" }, ctx(P));
    const after = majorityModule.publicView(s, { now: 0, scale: 1 }) as Json;
    const res = after["result"] as Json;
    expect(res["votesA"]).toBe(2);
    expect(res["votesB"]).toBe(1);
    expect(res["majority"]).toBe("a");
    expect(JSON.stringify(after)).not.toMatch(/"vote":|myVote/);
    // Your own view adds only your own choices.
    const mine = majorityModule.playerView(s, "b", { now: 0, scale: 1 });
    expect(mine["myPrediction"]).toBe("b");
    expect(mine["myVote"]).toBe("b");
  });
});

describe("Majority Rules in the room engine", () => {
  const T0 = 1_800_000_000_000;
  function setup(n = 3) {
    const engine = new RoomEngine("MR room", { timing: 2 });
    let t = T0;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
    const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, advance: (ms: number) => { t += ms; engine.tick(t); } };
  }

  it("is practice-only: an official start is refused with the reason", () => {
    const { engine, ids } = setup();
    expect(() => engine.startGame(ids[0]!, "majority-rules", { official: true })).toThrow(/practice-only/);
  });

  it("plays five rounds to a finish with server-side scores, and the TV never sees a vote", () => {
    const { engine, ids, send, advance } = setup();
    const g = engine.startGame(ids[0]!, "majority-rules", { official: false });
    for (const p of ids) expect(send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    expect(engine.games.get(g.id)!.status).toBe("playing");
    for (let r = 0; r < MAJORITY_ROUNDS; r++) {
      // Keku and P1 always predict "a" and vote "a"; P2 predicts "b" and votes "b".
      for (const [i, p] of ids.entries()) {
        const c = i === 2 ? "b" : "a";
        expect(send(p, g.id, "majority-predict", { choice: c }).accepted).toBe(true);
        if (i === 0) {
          const tv = JSON.stringify((engine.project("tv").games as Json[]).find((x) => x["id"] === g.id));
          expect(tv).not.toMatch(/votesA|myPrediction|"result"/);
        }
        expect(send(p, g.id, "majority-vote", { choice: c }).accepted).toBe(true);
      }
      advance(11_000); // the reveal (10 s) moves on
    }
    const done = engine.games.get(g.id)!;
    expect(done.status).toBe("finished");
    expect(done.rawScores).toEqual({ [ids[0]!]: 500, [ids[1]!]: 500, [ids[2]!]: 0 });
    expect(done.outcome?.countsOfficially).toBe(false);
  });

  it("a round's deadline closes it with the input received; a restart mid-game keeps every vote", () => {
    const { engine, ids, send, advance } = setup();
    const g = engine.startGame(ids[0]!, "majority-rules", { official: false });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    send(ids[0]!, g.id, "majority-predict", { choice: "a" });
    send(ids[0]!, g.id, "majority-vote", { choice: "a" });
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    const st = restored.games.get(g.id)!.extra as MajorityState;
    expect(st.votes[0]).toEqual({ [ids[0]!]: "a" });
    advance(46_000); // the 45 s predict phase ends without the other two
    const live = engine.games.get(g.id)!.extra as MajorityState;
    expect(live.phase).toBe("reveal");
    expect(majorityRoundResult(live, 0)).toEqual({ a: 1, b: 0, majority: "a", points: { [ids[0]!]: 100 } });
  });
});
