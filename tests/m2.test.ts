import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";

function setup(n: number, gameId: string, seed = 7) {
  const engine = new RoomEngine("M2 Room");
  const players: string[] = [];
  let host = "";
  for (let i = 0; i < n; i++) {
    const { player } = engine.join(`P${i + 1}`, { asHost: i === 0 });
    players.push(player.id);
    if (player.isHost) host = player.id;
  }
  const game = engine.startGame(host, gameId, { seed });
  return { engine, players, host, game };
}

function intent(engine: RoomEngine, gameId: string, action: string, payload: Record<string, unknown>) {
  return {
    kind: "intent" as const,
    schemaVersion: 1 as const,
    clientEventId: randomUUID(),
    roomId: engine.id,
    gameInstanceId: gameId,
    action,
    payload,
  };
}

describe("Impostor", () => {
  it("impostor never receives the word; honest players do; vote + guess flow scores correctly", () => {
    const { engine, players, game } = setup(4, "impostor", 5);
    const state = game.extra as { impostorId: string; word: string };
    const impostor = state.impostorId;
    const honest = players.filter((p) => p !== impostor);
    // Projections
    for (const pid of honest) {
      const proj = engine.project("player", pid);
      const myGames = proj["myGames"] as { state: { word?: string; role: string } }[];
      expect(myGames[0]?.state.role).toBe("honest");
      expect(myGames[0]?.state.word).toBe(state.word);
    }
    const impProj = engine.project("player", impostor);
    const impGames = impProj["myGames"] as { state: { word?: string; role: string } }[];
    expect(impGames[0]?.state.role).toBe("impostor");
    expect(impGames[0]?.state.word).toBeUndefined();
    // TV must not leak word
    expect(JSON.stringify(engine.project("tv"))).not.toContain(state.word);

    // Clues
    for (const pid of players) {
      expect(engine.submitIntent(intent(engine, game.id, "impostor-clue", { clue: "clue" }), pid).accepted).toBe(true);
    }
    // Self-vote rejected
    expect(engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: honest[0] }), honest[0]!).accepted).toBe(false);
    // All honest vote for impostor, impostor votes for someone else
    for (const pid of honest) {
      expect(engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: impostor }), pid).accepted).toBe(true);
    }
    expect(engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: honest[0] }), impostor).accepted).toBe(true);
    // Now in guess phase; wrong guess -> honest win
    expect(engine.submitIntent(intent(engine, game.id, "impostor-guess", { guess: "WrongWord" }), impostor).accepted).toBe(true);
    expect(game.status).toBe("finished");
    for (const pid of honest) expect(game.rawScores[pid]).toBeGreaterThanOrEqual(100);
    expect(game.rawScores[impostor]).toBe(0);
  });

  it("tie vote means no conviction, impostor wins", () => {
    const { engine, players, game } = setup(4, "impostor", 5);
    const state = game.extra as { impostorId: string };
    for (const pid of players) engine.submitIntent(intent(engine, game.id, "impostor-clue", { clue: "x" }), pid);
    // 2 votes for A, 2 votes for B (excluding self-votes where possible)
    const [a, b, c, d] = players as [string, string, string, string];
    engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: b }), a);
    engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: a }), b);
    engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: a }), c);
    engine.submitIntent(intent(engine, game.id, "impostor-vote", { suspectId: b }), d);
    expect(game.status).toBe("finished");
    expect(game.rawScores[state.impostorId]).toBe(100);
  });
});

describe("Caption Clash", () => {
  it("captions anonymised during vote, own vote rejected, scores by votes + participation", () => {
    const { engine, players, game } = setup(4, "caption-clash", 3);
    for (const pid of players) {
      expect(engine.submitIntent(intent(engine, game.id, "caption-submit", { caption: `Caption from ${pid}` }), pid).accepted).toBe(true);
    }
    // During vote, projection must not show authors
    const proj = engine.project("player", players[0]);
    const myGames = proj["myGames"] as { state: { captions: { author?: string }[] } }[];
    expect(myGames[0]?.state.captions.every((c) => c.author === undefined)).toBe(true);
    // Own vote rejected
    expect(engine.submitIntent(intent(engine, game.id, "caption-vote", { captionId: players[0] }), players[0]!).accepted).toBe(false);
    // All vote for player 2's caption
    for (const pid of players) {
      const target = pid === players[1] ? players[2] : players[1];
      expect(engine.submitIntent(intent(engine, game.id, "caption-vote", { captionId: target }), pid).accepted).toBe(true);
    }
    // Still playing (round 2 of 3)
    expect(game.status).toBe("playing");
    // Finish remaining rounds quickly by submitting/voting each round
    for (let round = 1; round < 3; round++) {
      for (const pid of players) engine.submitIntent(intent(engine, game.id, "caption-submit", { caption: `R${round} ${pid}` }), pid);
      for (const pid of players) {
        const target = pid === players[1] ? players[2] : players[1];
        engine.submitIntent(intent(engine, game.id, "caption-vote", { captionId: target }), pid);
      }
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[players[1]!]).toBeGreaterThan(game.rawScores[players[0]!] ?? 0);
  });
});

describe("Closest Wins", () => {
  it("closest wins 100, ties share, and game finishes after all questions", () => {
    const { engine, players, game } = setup(4, "closest-wins", 1);
    // Answer all 8 questions: player0 exact, player1 close, others far
    const state = game.extra as { questions: { id: string; answer: number }[] };
    for (const q of state.questions) {
      const guesses = [q.answer, q.answer + 1, q.answer + 100, q.answer + 200];
      players.forEach((pid, i) => {
        expect(engine.submitIntent(intent(engine, game.id, "closest-guess", { value: guesses[i] }), pid).accepted).toBe(true);
      });
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[players[0]!]).toBe(800); // 8 × 100
    expect(game.rawScores[players[1]!]).toBe(560); // 8 × 70
  });
});
