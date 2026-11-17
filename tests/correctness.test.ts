/**
 * Sprint 1 Priority E: bounded correctness fixes within existing rules.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeIntentFailure, isUnconfirmedIntermediaryFailure, sendIntent } from "../apps/web/src/components/intentRetry.js";
import { NOT_DELIVERED, humanError } from "../apps/web/src/ui/mchezo/lib/errors.js";
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

// Beta R4 (review 6935165862): a 502/503/504 from a proxy or the host's edge
// (the game restarting behind it) is UNCONFIRMED, not a failure the player
// should read as "Request failed (502)". The phone says it couldn't confirm
// it (NOT_DELIVERED), which never claims the server didn't receive it; the
// screen then shows the server's own state. Typed app errors stay themselves.
describe("an exhausted intermediary 502/503/504 is unconfirmed (apps/web/src/components/intentRetry.ts)", () => {
  const noSleep = { sleep: async () => {} };
  /** The phone's send: one fixed request (one body, one clientEventId), answered by `answer`. */
  function phone(answer: (attempt: number) => { status: number; body: unknown }) {
    const body = JSON.stringify({ intent: { clientEventId: randomUUID(), action: "trivia-answer" } });
    const sent: string[] = [];
    const send = vi.fn(async () => { sent.push(body); return answer(sent.length); });
    return { send, sent };
  }
  /** What the App shows for a send that ended with an HTTP error: humanError of the thrown message. */
  const shown = (res: { status: number; body: unknown }) => humanError(describeIntentFailure(res));

  it.each([502, 503, 504])("server down, nothing committed: three %i answers from the proxy (no app body) are unconfirmed, one event id throughout", async (status) => {
    const { send, sent } = phone(() => ({ status, body: {} })); // a proxy's HTML page parses to {}
    const res = await sendIntent(send, noSleep);
    expect(res.status).toBe(status);
    expect(send).toHaveBeenCalledTimes(3); // the retry count is unchanged
    expect(new Set(sent).size).toBe(1); // every retry is the identical request: one clientEventId
    expect(isUnconfirmedIntermediaryFailure(res)).toBe(true);
    expect(shown(res)).toBe(NOT_DELIVERED);
    expect(shown(res)).not.toMatch(/Request failed|502|503|504/);
  });

  it("committed, reply lost: a 502 then the server's deduped original answer is a plain success", async () => {
    // The first try reached the server and was recorded, but the proxy lost the reply;
    // the retry (same clientEventId) gets the original result back from the server's dedupe.
    const { send, sent } = phone((n) => (n === 1 ? { status: 502, body: {} } : { status: 200, body: { accepted: true } }));
    const res = await sendIntent(send, noSleep);
    expect(res).toEqual({ status: 200, body: { accepted: true } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(new Set(sent).size).toBe(1);
    expect(isUnconfirmedIntermediaryFailure(res)).toBe(false);
  });

  it("committed, every reply lost: the wording says it couldn't confirm, never that it wasn't received", async () => {
    // The server recorded the first try; every reply was replaced by the proxy's 502.
    const { send } = phone(() => ({ status: 502, body: {} }));
    const res = await sendIntent(send, noSleep);
    expect(shown(res)).toBe(NOT_DELIVERED);
    expect(NOT_DELIVERED).toMatch(/couldn’t confirm/);
    expect(NOT_DELIVERED).toMatch(/If it doesn’t show as in, try again/); // the screen's state decides
    expect(NOT_DELIVERED).not.toMatch(/not received|didn’t reach|wasn’t sent|failed|not saved/i);
  });

  it("one of Mchezo's existing app errors on a 5xx stays itself (error, reason or code)", () => {
    for (const status of [502, 503, 504]) {
      const res = { status, body: { error: "Display name already taken" } };
      expect(isUnconfirmedIntermediaryFailure(res)).toBe(false);
      expect(shown(res)).toBe("That name is taken in this room — pick another.");
      expect(shown({ status, body: { reason: "PHASE_CLOSED" } })).toBe("That game has closed — the five-minute limit passed. The host can skip it once it is stalled.");
      expect(shown({ status, body: { code: "ALREADY_ANSWERED" } })).toBe("Your answer is already in — it counted once.");
      expect(shown({ status, body: { error: "Not accepted: UNKNOWN_QUESTION" } })).toBe("That question is no longer open.");
      expect(shown({ status, body: { error: "Only host/cohost can start a game" } })).toBe("Only the host or a cohost can do that.");
    }
  });

  // Review 6936791624: a gateway can answer with JSON that LOOKS like an app error. Mchezo's intents endpoint never
  // answers 502/503/504 and marks no reply as its own, so only an existing Mchezo app error counts as the app's.
  it("the review's reproductions: a gateway's generic JSON is unconfirmed, not shown", () => {
    expect(shown({ status: 502, body: { error: "Bad Gateway" } })).toBe(NOT_DELIVERED);
    expect(shown({ status: 503, body: { code: "SERVICE_UNAVAILABLE" } })).toBe(NOT_DELIVERED);
    expect(shown({ status: 504, body: { reason: "upstream timeout" } })).toBe(NOT_DELIVERED);
  });
  const GATEWAY_JSON: unknown[] = [
    { error: "Bad Gateway" }, { code: "SERVICE_UNAVAILABLE" }, { reason: "upstream timeout" },
    { error: "Service Unavailable", code: "503" }, { error: "Gateway Timeout", message: "upstream request timeout" },
    { code: "MAINTENANCE" }, { error: "no healthy upstream" }, { status: "error", message: "Bad gateway" },
    { error: "constructor" }, { reason: "toString" },
  ];
  it.each([502, 503, 504])("every generic gateway JSON body on a %i is unconfirmed, and its text is never shown", (status) => {
    for (const body of GATEWAY_JSON) {
      const res = { status, body };
      expect(isUnconfirmedIntermediaryFailure(res), JSON.stringify(body)).toBe(true);
      expect(shown(res), JSON.stringify(body)).toBe(NOT_DELIVERED);
    }
  });
  it("a gateway's generic JSON on every try still sends ONE request, three times (same event id)", async () => {
    const { send, sent } = phone(() => ({ status: 502, body: { error: "Bad Gateway" } }));
    const res = await sendIntent(send, noSleep);
    expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(sent).size).toBe(1);
    expect(shown(res)).toBe(NOT_DELIVERED);
  });
  it("generic JSON on other statuses is unchanged (non-target behaviour): a 500 or 4xx still shows its error", () => {
    expect(describeIntentFailure({ status: 500, body: { error: "Bad Gateway" } })).toBe("Bad Gateway");
    expect(describeIntentFailure({ status: 500, body: { code: "SERVICE_UNAVAILABLE" } })).toBe("Request failed (500)");
    expect(describeIntentFailure({ status: 400, body: { error: "Session token required" } })).toBe("Session token required");
  });

  it("meaningful app errors keep their wording: 4xx errors are not retried and not reworded", async () => {
    const { send } = phone(() => ({ status: 401, body: { error: "Unknown player slot" } }));
    const res = await sendIntent(send, noSleep);
    expect(send).toHaveBeenCalledTimes(1);
    expect(isUnconfirmedIntermediaryFailure(res)).toBe(false);
    expect(shown(res)).toBe("We could not bring you back into your seat — rejoin with the room code.");
    expect(shown({ status: 409, body: { error: "A game is already in progress" } })).toBe("A game is already running — finish it or wait for the host.");
  });

  it("other statuses are unchanged: a bare 500 or 4xx still says what it was", () => {
    expect(isUnconfirmedIntermediaryFailure({ status: 500, body: {} })).toBe(false);
    expect(describeIntentFailure({ status: 500, body: {} })).toBe("Request failed (500)");
    expect(describeIntentFailure({ status: 404, body: {} })).toBe("Request failed (404)");
    expect(isUnconfirmedIntermediaryFailure({ status: 200, body: { accepted: false, reason: "ALREADY_ANSWERED" } })).toBe(false);
  });

  it("a non-object or empty-string body is not an app error", () => {
    expect(isUnconfirmedIntermediaryFailure({ status: 502, body: "<html>Bad Gateway</html>" })).toBe(true);
    expect(isUnconfirmedIntermediaryFailure({ status: 504, body: null })).toBe(true);
    expect(isUnconfirmedIntermediaryFailure({ status: 503, body: { error: "  " } })).toBe(true);
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
