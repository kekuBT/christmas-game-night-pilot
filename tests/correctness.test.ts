/**
 * Sprint 1 Priority E: bounded correctness fixes within existing rules.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendIntent } from "../apps/web/src/components/intentRetry.js";
import { RoomEngine } from "../src/server/room.js";
import { Harness, myGame, waitFor, type Json } from "./helpers/harness.js";

const raw = (room: RoomEngine, gid: string, action: string, payload: Json) => ({
  kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.id, gameInstanceId: gid, action, payload,
});

describe("game-finished events carry the game's official flag on every finish path", () => {
  // Requirement: the ledger is the audit trail for official results; a
  // finish event must say whether the game counted, however it finished.
  function setup() {
    const room = new RoomEngine("audit");
    const a = room.join("Ada", { asHost: true }).player.id;
    const b = room.join("Bea").player.id;
    return { room, a, b };
  }
  const finishEvent = (room: RoomEngine, gid: string) => room.ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === gid);

  it.each([true, false])("Math, everyone answers everything (official=%s)", (official) => {
    const { room, a, b } = setup();
    const g = room.startGame(a, "math-mayhem", { official, seed: 1 });
    for (const pid of [a, b]) for (const q of g.questions!) room.submitIntent(raw(room, g.id, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }), pid, g.startedAt! + 1000);
    expect(g.status).toBe("finished");
    expect(finishEvent(room, g.id)?.official).toBe(official);
  });

  it("Math, settled by the last player abstaining", () => {
    const { room, a, b } = setup();
    const g = room.startGame(a, "math-mayhem", { official: true, seed: 1 });
    for (const q of g.questions!) room.submitIntent(raw(room, g.id, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }), a, g.startedAt! + 1000);
    room.submitIntent(raw(room, g.id, "abstain", {}), b, g.startedAt! + 1000);
    expect(finishEvent(room, g.id)?.official).toBe(true);
  });

  it("Trivia, finished through the shared finishGame path", () => {
    const { room, a, b } = setup();
    const g = room.startGame(a, "trivia", { official: true, seed: 1 });
    const qs = (g.extra as { questions: { id: string }[] }).questions;
    for (const pid of [a, b]) for (const q of qs) room.submitIntent(raw(room, g.id, "trivia-answer", { questionId: q.id, chosenIndex: 0 }), pid);
    expect(finishEvent(room, g.id)?.official).toBe(true);
  });
});

describe("duplicate actions", () => {
  let h: Harness;
  beforeEach(async () => { h = await new Harness().start(); await h.createRoom(); });
  afterEach(async () => { await h.dispose(); });

  it("a retried intent with the same clientEventId returns the original result and is applied once", async () => {
    // Requirement: a lost response must not turn a correct answer into an
    // error or a double submission when the phone retries.
    const ada = await h.join("Ada", { host: true });
    await h.join("Bea");
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 2 })).body["gameId"] as string;
    const q = h.game(gid).questions![0]!;
    const id = randomUUID();
    const first = await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, id);
    const replay = await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, id);
    expect(first["accepted"]).toBe(true);
    expect(replay).toEqual(first);
    expect(h.engine().ledger.filter((e) => e.type === "score-awarded" && e.gameInstanceId === gid)).toHaveLength(1);
    // Why the client must reuse the id: a fresh id is a second, rejected action.
    const fresh = await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect(fresh).toMatchObject({ accepted: false, reason: "ALREADY_ANSWERED" });
  });

  it("dedupe survives a server restart (the retry may land on the restarted server)", async () => {
    const ada = await h.join("Ada", { host: true });
    await h.join("Bea");
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 2 })).body["gameId"] as string;
    const q = h.game(gid).questions![0]!;
    const id = randomUUID();
    const first = await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, id);
    await h.restart();
    expect(await h.intent(ada, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, id)).toEqual(first);
  });
});

describe("client intent retry (apps/web/src/components/intentRetry.ts)", () => {
  const noSleep = { sleep: async () => {} };
  it("retries the identical request after a network failure", async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ status: 200, body: { accepted: true } });
    expect(await sendIntent(send, noSleep)).toEqual({ status: 200, body: { accepted: true } });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("retries a 5xx, returns the last response if it keeps failing", async () => {
    const send = vi.fn().mockResolvedValue({ status: 503, body: {} });
    expect((await sendIntent(send, noSleep)).status).toBe(503);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("never retries a 4xx: the server already answered", async () => {
    const send = vi.fn().mockResolvedValue({ status: 401, body: { error: "Session token required" } });
    expect((await sendIntent(send, noSleep)).status).toBe(401);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("gives up after the attempt limit on repeated network failures", async () => {
    const send = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(sendIntent(send, noSleep)).rejects.toThrow("Failed to fetch");
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("presence changes are pushed to other screens", () => {
  let h: Harness;
  beforeEach(async () => { h = await new Harness().start(); await h.createRoom(); });
  afterEach(async () => { await h.dispose(); });

  it("when a player's socket drops or returns, everyone else's screen is told immediately", async () => {
    // Requirement: the lobby's "away" marker reflects reality without
    // waiting for the next 2s poll.
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const connectedOf = (p: Json | undefined, id: string) => ((p?.["players"] as Json[]) ?? []).find((x) => x["id"] === id)?.["connected"];
    await h.disconnect(bea);
    await waitFor(() => connectedOf(ada.lastPush, bea.playerId) === false);
    await h.connect(bea);
    await waitFor(() => connectedOf(ada.lastPush, bea.playerId) === true);
    expect(myGame(await h.projection(ada), "none")).toBeUndefined();
  });
});
