/**
 * Sprint 3, Workstream F (P10): Math speed is measured per question, on the
 * server's clock, from the moment the server reveals that question to that
 * player. No client timestamp is ever used.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FakeClock, Harness, myGame, type Json, type Player } from "./helpers/harness.js";
import { RoomEngine } from "../src/server/room.js";
import { CLIENT_PROTOCOL, clientNeedsRefresh, MIN_CLIENT_PROTOCOL } from "../src/shared/clientProtocol.js";

let h: Harness;
let clock: FakeClock;
beforeEach(async () => {
  clock = new FakeClock();
  h = await new Harness(undefined, { clock }).start();
  await h.createRoom();
});
afterEach(async () => { await h.dispose(); });

async function setup(): Promise<{ ada: Player; bea: Player; gid: string }> {
  const ada = await h.join("Ada", { host: true });
  const bea = await h.join("Bea");
  const gid = (await h.startGame(ada, "math-mayhem", { seed: 9 })).body["gameId"] as string;
  return { ada, bea, gid };
}
const qs = (gid: string) => h.game(gid).questions!;

describe("Math: per-question server timing", () => {
  it("prompts are hidden until the player opens a question; opening reveals it and starts its clock", async () => {
    const { bea, gid } = await setup();
    const before = myGame(await h.projection(bea), gid)["questions"] as Json[];
    expect(before.every((q) => q["prompt"] === undefined && q["options"] === undefined)).toBe(true);
    const q = qs(gid)[0]!;
    const r = await h.intent(bea, gid, "math-open", { questionId: q.id });
    expect(r).toMatchObject({ accepted: true, result: { questionId: q.id, prompt: q.prompt, options: q.options, openedAt: clock.now() } });
    const after = myGame(await h.projection(bea), gid)["questions"] as Json[];
    expect(after[0]).toEqual({ id: q.id, prompt: q.prompt, options: q.options });
    expect(after[1]).toEqual({ id: qs(gid)[1]!.id });
    expect(JSON.stringify(myGame(await h.projection(bea), gid))).not.toContain("correctIndex");
  });

  it("question 7 answered 3 s after it opened earns the full speed bonus, however late in the game", async () => {
    const { bea, gid } = await setup();
    const q = qs(gid)[6]!;
    clock.advance(90_000); // a minute and a half into the game
    await h.intent(bea, gid, "math-open", { questionId: q.id });
    clock.advance(3_000);
    const r = await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect(r).toMatchObject({ accepted: true, result: { points: 120, answeredInMs: 3_000 } });
    expect(myGame(await h.projection(bea), gid)["myAnswerTimes"]).toEqual({ [q.id]: 3_000 });
  });

  it("bonus brackets: <=5 s +20, <=10 s +10, slower +0; wrong answers 0", async () => {
    const { bea, gid } = await setup();
    const cases: [number, boolean, number][] = [[5_000, true, 120], [5_001, true, 110], [10_000, true, 110], [10_001, true, 100], [2_000, false, 0]];
    for (const [k, [ms, correct, expected]] of cases.entries()) {
      const q = qs(gid)[k]!;
      await h.intent(bea, gid, "math-open", { questionId: q.id });
      clock.advance(ms);
      const r = await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: correct ? q.correctIndex : (q.correctIndex + 1) % 4 });
      expect((r["result"] as Json)["points"], `case ${ms}ms`).toBe(expected);
    }
  });

  it("re-opening never restarts the clock (no bonus farming by reopening)", async () => {
    const { bea, gid } = await setup();
    const q = qs(gid)[0]!;
    await h.intent(bea, gid, "math-open", { questionId: q.id });
    clock.advance(20_000);
    expect(await h.intent(bea, gid, "math-open", { questionId: q.id })).toMatchObject({ accepted: true, result: { openedAt: clock.now() - 20_000 } });
    clock.advance(1_000);
    expect(((await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }))["result"] as Json)["points"]).toBe(100);
  });

  it("each player's clock is their own", async () => {
    const { ada, bea, gid } = await setup();
    const q = qs(gid)[0]!;
    await h.intent(ada, gid, "math-open", { questionId: q.id });
    clock.advance(30_000);
    await h.intent(bea, gid, "math-open", { questionId: q.id });
    clock.advance(2_000);
    const a = await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    const b = await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect([(a["result"] as Json)["points"], (b["result"] as Json)["points"]]).toEqual([100, 120]);
  });

  it("answering without opening (an old client) counts correctness only — no speed bonus", async () => {
    const { bea, gid } = await setup();
    const q = qs(gid)[0]!;
    const r = await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect((r["result"] as Json)["points"]).toBe(100);
  });

  it("opening is refused after answering, for non-players, after the deadline, and for other games", async () => {
    const { ada, bea, gid } = await setup();
    const q = qs(gid)[0]!;
    await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect(await h.intent(bea, gid, "math-open", { questionId: q.id })).toMatchObject({ accepted: false, reason: "ALREADY_ANSWERED" });
    expect(await h.intent(bea, gid, "math-open", { questionId: "nope" })).toMatchObject({ accepted: false, reason: "UNKNOWN_QUESTION" });
    const late = await h.join("Zed");
    expect(await h.intent(late, gid, "math-open", { questionId: qs(gid)[1]!.id })).toMatchObject({ accepted: false, reason: "NOT_IN_GAME" });
    clock.t = h.game(gid).deadlineAt! + 1;
    expect(await h.intent(ada, gid, "math-open", { questionId: qs(gid)[1]!.id })).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
  });

  it("open times survive a restart", async () => {
    const { bea, gid } = await setup();
    const q = qs(gid)[0]!;
    await h.intent(bea, gid, "math-open", { questionId: q.id });
    await h.restart();
    await h.connect(bea);
    clock.advance(4_000);
    expect(((await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }))["result"] as Json)["points"]).toBe(120);
  });
});

describe("Math games from before Sprint 3 keep their rules", () => {
  it("a restored legacy game (no openedAt) shows every prompt and times from the game start", () => {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Legacy");
    engine.clock = () => t;
    const host = engine.join("Ada", { asHost: true }).player.id;
    engine.join("Bea");
    const g = engine.startGame(host, "math-mayhem", { seed: 1 });
    delete g.openedAt;
    delete g.lifecycleVersion;
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    restored.clock = () => t;
    const view = (restored.project("player", host) as { myGames: Json[] }).myGames[0]!;
    expect((view["questions"] as Json[]).every((q) => typeof q["prompt"] === "string")).toBe(true);
    t += 3_000;
    const q = g.questions![0]!;
    const r = restored.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: restored.id, gameInstanceId: g.id, action: "submit-math-answer", payload: { questionId: q.id, chosenIndex: q.correctIndex } }, host);
    expect((r.result as Json)["points"]).toBe(120);
  });
});

describe("outdated clients (owner decision: no recorded opening, no bonus — and tell them to refresh)", () => {
  it("every projection publishes the protocol; an up-to-date app is never asked to refresh", async () => {
    const { bea, gid } = await setup();
    const p = await h.projection(bea);
    expect(p["protocol"]).toEqual({ current: CLIENT_PROTOCOL, min: MIN_CLIENT_PROTOCOL });
    expect(myGame(p, gid)["refreshNeeded"]).toBeUndefined();
    expect(clientNeedsRefresh(MIN_CLIENT_PROTOCOL)).toBe(false);
    expect(clientNeedsRefresh(MIN_CLIENT_PROTOCOL + 1)).toBe(true);
  });

  it("a tab from before Sprint 3 can still play, is told to refresh, and scores correctness only for that game", async () => {
    const { bea, gid } = await setup();
    h.legacyClient = true; // Bea's old tab sends no protocol version
    const view = myGame(await h.projection(bea), gid);
    expect(view["refreshNeeded"]).toBe(true);
    expect((view["questions"] as Json[]).every((q) => typeof q["prompt"] === "string")).toBe(true); // playable, not blank
    expect(h.game(gid).promptsExposed).toEqual([bea.playerId]);
    h.legacyClient = false;
    // Even if she now refreshes and opens properly, she already saw every prompt: no bonus this game.
    const q = qs(gid)[0]!;
    await h.intent(bea, gid, "math-open", { questionId: q.id });
    clock.advance(1_000);
    const r = await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect(r["result"]).toMatchObject({ points: 100, speedBonus: "not-timed" });
    expect(String((r["result"] as Json)["refreshAdvice"])).toMatch(/Refresh the page/);
    // Audited once, saved before anyone acts on it, and survives a restart.
    expect(h.engine().ledger.filter((e) => e.type === "math-untimed-client" && e.playerId === bea.playerId)).toHaveLength(1);
    await h.restart();
    expect(h.game(gid).promptsExposed).toEqual([bea.playerId]);
  });

  it("hiding the version can't be used to read prompts early for a bonus", async () => {
    const { ada, gid } = await setup();
    h.legacyClient = true;
    await h.projection(ada); // read every prompt in advance
    h.legacyClient = false;
    for (const q of qs(gid).slice(0, 3)) {
      await h.intent(ada, gid, "math-open", { questionId: q.id });
      const r = await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
      expect((r["result"] as Json)["points"]).toBe(100);
    }
  });

  it("other players are unaffected by one player's old tab", async () => {
    const { ada, bea, gid } = await setup();
    h.legacyClient = true;
    await h.projection(bea);
    h.legacyClient = false;
    const q = qs(gid)[0]!;
    await h.intent(ada, gid, "math-open", { questionId: q.id });
    clock.advance(2_000);
    expect(((await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }))["result"] as Json)["points"]).toBe(120);
    expect(myGame(await h.projection(ada), gid)["refreshNeeded"]).toBeUndefined();
  });
});
