import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";

// Deadline/timeout behaviour (nonvisual backlog, L13 follow-up).
// Math Mayhem previously checked its own 5-minute clock from startedAt
// instead of the game's deadlineAt, so moving a deadline (or a deadline
// already in the past while startedAt was recent) did not stop Math
// answers — while every social game did stop. One deadline must govern
// all games, and a host-skipped game must unblock the room.

function makeRoom() {
  const engine = new RoomEngine("Deadline Room");
  const host = engine.join("Host", { asHost: true }).player.id;
  const guests = [engine.join("Guest1").player.id, engine.join("Guest2").player.id, engine.join("Guest3").player.id];
  return { engine, host, guests };
}

function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown>) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}

describe("deadline/timeout", () => {
  it("math answers after deadlineAt are rejected, even when startedAt is recent", () => {
    const { engine, host, guests } = makeRoom();
    const game = engine.startGame(host, "math-mayhem", { seed: 7 });
    game.startedAt = Date.now();
    game.deadlineAt = Date.now() - 1000;
    const q = game.questions![0]!;
    const res = engine.submitIntent(intent(engine.id, game.id, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }), guests[0]!);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("PHASE_CLOSED");
  });

  it("math answers before deadlineAt are accepted", () => {
    const { engine, host, guests } = makeRoom();
    const game = engine.startGame(host, "math-mayhem", { seed: 7 });
    const q = game.questions![0]!;
    const res = engine.submitIntent(intent(engine.id, game.id, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }), guests[0]!);
    expect(res.accepted).toBe(true);
  });

  it("a game without deadlineAt (legacy snapshot) still uses the 5-minute window from startedAt", () => {
    const { engine, host, guests } = makeRoom();
    const game = engine.startGame(host, "math-mayhem", { seed: 7 });
    game.deadlineAt = undefined;
    game.startedAt = Date.now() - 6 * 60 * 1000;
    const q = game.questions![0]!;
    const late = engine.submitIntent(intent(engine.id, game.id, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }), guests[0]!);
    expect(late).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
  });

  // Sprint 3 (P3/P4): the server closes a game at its deadline by itself,
  // keeping valid answers; the host "skip" no longer voids anything.
  it("the host skip after a deadline closes the game with the deadline rules (not voided) and unblocks the next game", () => {
    const { engine, host } = makeRoom();
    const game = engine.startGame(host, "trivia", { seed: 1 });
    game.deadlineAt = Date.now() - 1000;
    expect(engine.skipTimedOutGame(host, game.id)).toBe("deadline");
    expect(game.status).toBe("finished");
    expect(game.timedOut).toBeUndefined();
    expect(game.outcome?.reason).toBe("deadline");
    // A second skip is a no-op, not a second ending.
    expect(engine.skipTimedOutGame(host, game.id)).toBe("deadline");
    const next = engine.startGame(host, "math-mayhem", { seed: 7 });
    expect(next.status).toBe("playing");
    expect(next.gameId).toBe("math-mayhem");
  });

  it("a playing game past its deadline no longer blocks a new game: the deadline closes it first", () => {
    const { engine, host } = makeRoom();
    const game = engine.startGame(host, "trivia", { seed: 1 });
    game.deadlineAt = Date.now() - 1000;
    const next = engine.startGame(host, "math-mayhem", { seed: 7 });
    expect(game.status).toBe("finished");
    expect(game.outcome?.reason).toBe("deadline");
    expect(next.status).toBe("playing");
  });

  it("before its deadline a game blocks a new game", () => {
    const { engine, host } = makeRoom();
    engine.startGame(host, "trivia", { seed: 1 });
    expect(() => engine.startGame(host, "math-mayhem", { seed: 7 })).toThrow("A game is already in progress");
  });
});
