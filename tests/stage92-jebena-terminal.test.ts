/**
 * Stage 9.2 cleanup (review 6811101479, nonblocking note from the Stage 9.1
 * clearance): when a Jebena Rush match ends, no player's last rejected try
 * may stay in the saved module state. Normal turn changes already cleared
 * it, and views never showed it to anyone else; this pins every terminal
 * path: the last one standing (by a timeout, the holder leaving, another
 * player leaving), every bank used up (after an accepted answer, after a
 * timeout), a one-player start, and the room's own match limit (through the
 * module contract's onFinish).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { jebenaModule, type JebenaState } from "../src/games/modules/jebena.js";
import { RoomEngine } from "../src/server/room.js";

const SECRET = "zzqxv private try";
const ctx = (s: JebenaState, now = 1) => ({ now, players: s.order, active: s.order, scale: 1 });
const cat = (id: string) => JEBENA_CATEGORIES.find((c) => c.id === id)!;
const fresh = (s: JebenaState) => cat(s.category).answers.find((a) => !(s.used[s.category] ?? []).includes(a.id))!.name;

/** The holder types something that isn't accepted: a private try, kept for this turn only. */
function privateTry(s: JebenaState): string {
  const holder = s.turn!.player;
  const r = jebenaModule.intent(s, holder, "jebena-answer", { turn: s.turn!.n, text: SECRET }, ctx(s));
  expect(r).toMatchObject({ ok: true, result: { verdict: "not-in-bank" } });
  expect(s.attempts[holder]?.text).toBe(SECRET);
  return holder;
}

/** After the end: the try is gone from the state and from every view. */
function expectNothingKept(s: JebenaState): void {
  expect(s.end).not.toBeNull();
  expect(s.turn).toBeNull();
  expect(s.attempts).toEqual({});
  expect(JSON.stringify(s)).not.toContain(SECRET);
  for (const id of s.order) {
    const v = jebenaModule.playerView(s, id, { now: 2, scale: 1 }) as { attempt?: unknown };
    expect(v.attempt).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain(SECRET);
  }
  expect(JSON.stringify(jebenaModule.publicView(s, { now: 2, scale: 1 }))).not.toContain(SECRET);
}

/** Every category used up except what the test leaves. */
function useUpEveryBank(s: JebenaState, exceptOneIn?: string): void {
  for (const c of JEBENA_CATEGORIES) {
    const ids = c.answers.map((a) => a.id);
    s.used[c.id] = c.id === exceptOneIn ? ids.slice(1) : ids;
  }
}

describe("Jebena Rush: nothing private outlives the match, on every terminal path", () => {
  it("the last one standing after a timeout", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 3, settings: { hearts: 3 } });
    const holder = privateTry(s);
    s.per[holder]!.hearts = 1;
    jebenaModule.expirePhase(s, ctx(s, 5));
    expect(s.end).toBe("last-standing");
    expectNothingKept(s);
  });

  it("the last one standing when the holder leaves", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 4 });
    const holder = privateTry(s);
    expect(jebenaModule.abstain(s, holder, ctx(s))).toMatchObject({ ok: true });
    expect(s.end).toBe("last-standing");
    expectNothingKept(s);
  });

  it("the last one standing when the other player leaves (the holder's try is still open)", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 5 });
    const holder = privateTry(s);
    const other = s.order.find((p) => p !== holder)!;
    expect(jebenaModule.abstain(s, other, ctx(s))).toMatchObject({ ok: true });
    expect(s.end).toBe("last-standing");
    expectNothingKept(s);
  });

  it("every bank used up by an accepted answer", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 6 });
    useUpEveryBank(s, s.category);
    privateTry(s);
    const r = jebenaModule.intent(s, s.turn!.player, "jebena-answer", { turn: s.turn!.n, text: fresh(s) }, ctx(s));
    expect(r).toMatchObject({ ok: true, result: { verdict: "accepted" } });
    expect(s.end).toBe("banks-exhausted");
    expectNothingKept(s);
  });

  it("every bank used up when a timeout looks for the next category", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 7, settings: { hearts: 5 } });
    useUpEveryBank(s);
    privateTry(s);
    jebenaModule.expirePhase(s, ctx(s, 5));
    expect(s.end).toBe("banks-exhausted");
    expectNothingKept(s);
  });

  it("a one-player start ends at once, with nothing kept", () => {
    const s = jebenaModule.init({ players: ["a"], seed: 8 });
    expect(s.end).toBe("last-standing");
    expect(s.attempts).toEqual({});
  });

  it("the room's match limit: onFinish drops the try the holder made just before it", () => {
    const engine = new RoomEngine("JR terminal", { kind: "casual", timing: 2 });
    let t = 1_800_000_000_000;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id, engine.join("Amina").player.id];
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const g = engine.startGame(ids[0]!, "jebena-rush", { official: false });
    for (const p of ids) expect(send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    const game = engine.games.get(g.id)!;
    const s = game.extra as JebenaState;
    game.deadlineAt = t + 2000; // test seam: the limit falls inside the first turn
    t += 1000;
    const holder = s.turn!.player;
    expect(send(holder, g.id, "jebena-answer", { turn: s.turn!.n, text: SECRET })).toMatchObject({ accepted: true, result: { verdict: "not-in-bank" } });
    expect(s.attempts[holder]?.text).toBe(SECRET);
    t = game.deadlineAt + 1;
    engine.tick(t);
    expect(game.status).toBe("finished");
    expect(game.outcome?.reason).toBe("deadline");
    expect(s.end).toBeNull(); // the room ended it, not the module
    expect(s.attempts).toEqual({});
    expect(JSON.stringify(engine.toJSON())).not.toContain(SECRET);
    for (const id of ids) expect(JSON.stringify(engine.project("player", id))).not.toContain(SECRET);
  });
});
