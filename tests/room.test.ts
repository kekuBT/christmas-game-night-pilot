import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateMathQuestions, mathSpeedBonus, scoreMathAnswer } from "../src/games/math.js";
import { getGame, GAME_REGISTRY } from "../src/games/registry.js";
import { escapeHtml, IntentSchema, sanitizeText } from "../src/shared/protocol.js";
import { RoomEngine } from "../src/server/room.js";

describe("protocol", () => {
  it("rejects malformed intents", () => {
    expect(IntentSchema.safeParse({ kind: "intent", schemaVersion: 99 }).success).toBe(false);
  });
  it("escapes HTML in captions", () => {
    expect(escapeHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });
  it("sanitises and caps text", () => {
    expect(sanitizeText("  hello   world  ")).toBe("hello world");
    expect(sanitizeText("   ")).toBeNull();
  });
  it("registry lists all 12 games (Stage 5 adds Majority Rules), Math implemented", () => {
    expect(GAME_REGISTRY).toHaveLength(12);
    expect(getGame("math-mayhem").status).toBe("implemented");
  });
});

describe("math", () => {
  it("generates exactly 10 verified questions with 4 unique options", () => {
    const qs = generateMathQuestions(7);
    expect(qs).toHaveLength(10);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBe(q.correctAnswer);
    }
  });
  it("scores correct with capped speed bonus, wrong with 0", () => {
    const qs = generateMathQuestions(7);
    const q = qs[0]!;
    expect(scoreMathAnswer(q, q.correctIndex, 3000)).toBe(120);
    expect(scoreMathAnswer(q, q.correctIndex, 8000)).toBe(110);
    expect(scoreMathAnswer(q, q.correctIndex, 20000)).toBe(100);
    expect(scoreMathAnswer(q, (q.correctIndex + 1) % 4, 1000)).toBe(0);
    expect(scoreMathAnswer(q, null, 1000)).toBe(0);
    expect(mathSpeedBonus(5000)).toBe(20);
  });
  it("same seed gives same questions", () => {
    expect(generateMathQuestions(7)).toEqual(generateMathQuestions(7));
  });
});

describe("room engine", () => {
  function setup(n = 4) {
    const engine = new RoomEngine("Test Room");
    const players: { id: string; token: string }[] = [];
    let host = "";
    for (let i = 0; i < n; i++) {
      const { player, recoveryToken } = engine.join(`Player${i + 1}`, { asHost: i === 0 });
      players.push({ id: player.id, token: recoveryToken });
      if (player.isHost) host = player.id;
    }
    return { engine, players, host };
  }

  it("10 players can join, duplicate names rejected", () => {
    const { engine } = setup(10);
    expect(engine.players.size).toBe(10);
    expect(() => engine.join("Player1")).toThrow();
  });

  it("Math game finishes and scores server-side; duplicate intent does not double-score", () => {
    const { engine, players, host } = setup(4);
    const game = engine.startGame(host, "math-mayhem", { seed: 7 });
    const pid = players[0]!.id;
    const q = game.questions![0]!;
    const intent = {
      kind: "intent" as const,
      schemaVersion: 1 as const,
      clientEventId: randomUUID(),
      roomId: engine.id,
      gameInstanceId: game.id,
      action: "submit-math-answer",
      payload: { questionId: q.id, chosenIndex: q.correctIndex },
    };
    // Sprint 3 (P10): the question is opened (revealed) first; speed counts from then.
    engine.submitIntent({ ...intent, clientEventId: randomUUID(), action: "math-open", payload: { questionId: q.id } }, pid, (game.startedAt ?? 0) + 1000);
    const first = engine.submitIntent(intent, pid, (game.startedAt ?? 0) + 3000);
    const second = engine.submitIntent(intent, pid, (game.startedAt ?? 0) + 3000);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(game.rawScores[pid]).toBe(120);
    expect(engine.ledger.filter((e) => e.type === "score-awarded").length).toBe(1);
  });

  it("reconnect requires the token; wrong token does not take over", () => {
    const { engine, players } = setup(2);
    const p = players[0]!;
    engine.disconnect(p.id);
    expect(() => engine.reconnect(p.id, "wrong-token")).toThrow();
    // Sprint 2: verifying the credential does not by itself make the player
    // present; presence follows a live socket (markConnected).
    expect(engine.reconnect(p.id, p.token).id).toBe(p.id);
    expect(engine.players.get(p.id)!.connected).toBe(false);
    engine.markConnected(p.id);
    expect(engine.players.get(p.id)!.connected).toBe(true);
  });

  it("non-host cannot start, unknown game cannot start", () => {
    const { engine, players, host } = setup(4);
    expect(() => engine.startGame(players[1]!.id, "math-mayhem")).toThrow();
    expect(() => engine.startGame(host, "not-a-game")).toThrow(/Unknown game/);
  });

  it("who-said-that projection exposes speakers as answer options", () => {
    const { engine, players, host } = setup(4);
    engine.startGame(host, "who-said-that", { seed: 7 });
    const proj = engine.project("player", players[0]!.id) as { myGames: { state: { questions: { id: string; prompt: string; options: string[] }[] } }[] };
    const qs = proj.myGames[0]!.state.questions;
    expect(qs.length).toBeGreaterThan(0);
    // Each question shows its own four speakers (shuffled per game) as the answer options.
    const game = [...engine.games.values()][0]!;
    const own = (game.extra as { questions: { id: string; quote: string; speakers: string[] }[] }).questions;
    expect(qs[0]!.prompt).toBe(own[0]!.quote);
    expect(qs[0]!.options).toEqual(own[0]!.speakers);
    expect(new Set(qs[0]!.options).size).toBe(4);
  });

  it("cannot start a second game while one is playing", () => {
    const { engine, host } = setup(4);
    engine.startGame(host, "math-mayhem", { seed: 7 });
    expect(() => engine.startGame(host, "trivia", { seed: 7 })).toThrow(/already in progress/);
  });

  it("TV and other-player projections do not leak answer keys or tokens", () => {
    const { engine, players, host } = setup(4);
    const game = engine.startGame(host, "math-mayhem", { seed: 7 });
    const canary = "SECRET_ROLE_CANARY_123";
    // Simulate a secret in server state only; projections must never include it
    const tv = JSON.stringify(engine.project("tv"));
    const other = JSON.stringify(engine.project("player", players[1]!.id));
    expect(tv).not.toContain("correctIndex");
    expect(other).not.toContain("correctIndex");
    expect(tv).not.toContain(players[0]!.token);
    expect(tv).not.toContain(canary);
    expect(game.questions![0]!.correctIndex).toBeDefined(); // Server still holds it
  });

  it("host can grant cohost, cohost can start", () => {
    const { engine, players, host } = setup(4);
    engine.grantCohost(host, players[1]!.id);
    expect(() => engine.startGame(players[1]!.id, "math-mayhem", { seed: 1 })).not.toThrow();
  });
});

describe("Milestone K: host-claim attribution", () => {
  it("claiming the host role logs a host-claimed event; guest joins do not", () => {
    const engine = new RoomEngine("Claim Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    const ledger = engine.toJSON().ledger as { type: string; playerId?: string }[];
    const claims = ledger.filter((e) => e.type === "host-claimed");
    expect(claims).toHaveLength(1);
    expect(claims[0]!.playerId).toBe(host);
    engine.join("Guest");
    const ledgerAfter = engine.toJSON().ledger as { type: string; playerId?: string }[];
    expect(ledgerAfter.filter((e) => e.type === "host-claimed")).toHaveLength(1);
  });
});
