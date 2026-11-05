import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { escapeHtml } from "../src/shared/protocol.js";

describe("M5 security / hardening", () => {
  it("forged score intents are rejected: wrong actor, wrong room, unknown action", () => {
    const engine = new RoomEngine("Security Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    const guest = engine.join("Guest").player.id;
    const game = engine.startGame(host, "math-mayhem", { seed: 1 });
    const q = game.questions![0]!;
    const base = {
      kind: "intent" as const,
      schemaVersion: 1 as const,
      roomId: engine.id,
      gameInstanceId: game.id,
      action: "submit-math-answer",
      payload: { questionId: q.id, chosenIndex: q.correctIndex },
    };
    // Wrong room
    expect(engine.submitIntent({ ...base, clientEventId: randomUUID(), roomId: "wrong-room" }, host).accepted).toBe(false);
    // Unknown action
    expect(engine.submitIntent({ ...base, clientEventId: randomUUID(), action: "award-points" }, host).accepted).toBe(false);
    // Player not in game cannot score (use a non-player id)
    expect(engine.submitIntent({ ...base, clientEventId: randomUUID() }, "player-999").accepted).toBe(false);
    // Guest can score only their own answers, not host's, via actor binding (engine uses actorId, not payload playerId)
    const guestIntent = { ...base, clientEventId: randomUUID() };
    expect(engine.submitIntent(guestIntent, guest).accepted).toBe(true);
    expect(game.rawScores[host]).toBe(0);
    expect(game.rawScores[guest]).toBeGreaterThan(0);
  });

  it("XSS captions are escaped and oversize text is capped", () => {
    expect(escapeHtml("<img src=x onerror=alert(1)>")).not.toContain("<img");
    const engine = new RoomEngine("XSS Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    for (let i = 0; i < 3; i++) engine.join(`P${i}`);
    const game = engine.startGame(host, "caption-clash", { seed: 1 });
    const long = "x".repeat(1000);
    const result = engine.submitIntent(
      {
        kind: "intent",
        schemaVersion: 1,
        clientEventId: randomUUID(),
        roomId: engine.id,
        gameInstanceId: game.id,
        action: "caption-submit",
        payload: { caption: long },
      },
      host,
    );
    expect(result.accepted).toBe(true);
    const state = game.extra as { rounds: { captions: Record<string, string> }[] };
    expect(state.rounds[0]!.captions[host]!.length).toBeLessThanOrEqual(140);
  });

  it("snapshot restore preserves ledger checksum", () => {
    const engine = new RoomEngine("Backup Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.join("Guest");
    engine.startGame(host, "math-mayhem", { seed: 1 });
    const snapshot = engine.toJSON();
    const restored = RoomEngine.fromJSON(snapshot);
    expect(restored.ledgerChecksum()).toBe(engine.ledgerChecksum());
    expect(restored.players.size).toBe(2);
  });
});

describe("Milestone K: intent replay (dedupe pinning)", () => {
  // The earlier security test's name claimed replay coverage, but its body
  // never submitted the same clientEventId twice. This test pins the real
  // behavior: a replayed intent returns the ORIGINAL result without
  // re-applying (no double score, no ALREADY_ANSWERED on replay).
  it("replaying the same intent returns the original result without re-applying", () => {
    const engine = new RoomEngine("Replay Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.join("Guest");
    const game = engine.startGame(host, "math-mayhem", { seed: 1 });
    const q = game.questions![0]!;
    const eventId = randomUUID();
    const intent = {
      kind: "intent" as const,
      schemaVersion: 1 as const,
      roomId: engine.id,
      gameInstanceId: game.id,
      action: "submit-math-answer",
      payload: { questionId: q.id, chosenIndex: q.correctIndex },
    };
    const first = engine.submitIntent({ ...intent, clientEventId: eventId }, host);
    expect(first.accepted).toBe(true);
    const scoreAfterFirst = game.rawScores[host];
    expect(scoreAfterFirst).toBeGreaterThan(0);
    const second = engine.submitIntent({ ...intent, clientEventId: eventId }, host);
    expect(second.accepted).toBe(true);
    expect(second).toEqual(first);
    expect(game.rawScores[host]).toBe(scoreAfterFirst);
  });

  it("replaying a rejected intent returns the same rejection", () => {
    const engine = new RoomEngine("Replay Rejection Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.join("Guest");
    const game = engine.startGame(host, "math-mayhem", { seed: 1 });
    const eventId = randomUUID();
    const intent = {
      kind: "intent" as const,
      schemaVersion: 1 as const,
      roomId: engine.id,
      gameInstanceId: game.id,
      action: "submit-math-answer",
      payload: { questionId: "no-such-question", chosenIndex: 0 },
    };
    const first = engine.submitIntent({ ...intent, clientEventId: eventId }, host);
    expect(first.accepted).toBe(false);
    expect(first.reason).toBe("UNKNOWN_QUESTION");
    const second = engine.submitIntent({ ...intent, clientEventId: eventId }, host);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("UNKNOWN_QUESTION");
    expect(second).toEqual(first);
  });
});
