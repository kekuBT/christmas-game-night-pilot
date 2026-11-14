import { randomUUID } from "node:crypto";
import { contentLibrary } from "../src/content/registry.js";
import { describe, expect, it } from "vitest";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { RoomEngine } from "../src/server/room.js";

function setup(n: number, gameId: string, seed = 7) {
  const engine = new RoomEngine("M3 Room");
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

describe("M3 registry", () => {
  it("all 17 games are implemented (the 11 originals + Stage 5's Majority Rules, Pattern Pulse and Draw & Guess + Stage 9.1's Jebena Rush + Stage 9.3's Spectrum + Stage 12.5's Family Questions)", () => {
    expect(GAME_REGISTRY.map((g) => g.id)).toEqual(["impostor", "caption-clash", "trivia", "word-connections", "who-said-that", "guess-the-year", "closest-wins", "category-sprint", "charades", "geography", "math-mayhem", "majority-rules", "pattern-pulse", "jebena-rush", "spectrum", "family-questions", "draw-guess"]);
    expect(GAME_REGISTRY.every((g) => g.status === "implemented")).toBe(true);
  });
});

describe("Trivia / Who Said / Geography / Year", () => {
  it("trivia: correct answers score, wrong score 0, game finishes", () => {
    const { engine, players, game } = setup(4, "trivia", 7);
    const state = game.extra as { questions: { id: string; correctIndex: number }[] };
    for (const pid of players) {
      for (const q of state.questions) {
        expect(engine.submitIntent(intent(engine, game.id, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid).accepted).toBe(true);
      }
    }
    expect(game.status).toBe("finished");
    // 10 questions × (100 + 20 speed in engine? engine uses 3000ms elapsed, so +20) = 1200
    for (const pid of players) expect(game.rawScores[pid]).toBe(1200);
    // Finished trivia reveals its keys + aggregate counts (Mchezo results);
    // while playing, neither may appear — see the new mchezo test file.
    const tv = engine.project("tv") as { games: { gameId: string; state?: { questions?: { correctIndex?: number }[] }; answerCounts?: Record<string, number[]> }[] };
    const finished = tv.games.find((g) => g.gameId === "trivia");
    expect(finished?.state?.questions?.every((q) => typeof q.correctIndex === "number")).toBe(true);
    expect(Object.keys(finished?.answerCounts ?? {})).toHaveLength(10);
    // Everyone answered correctly: each question's correct option holds all 4.
    for (const q of (game.extra as { questions: { id: string; correctIndex: number }[] }).questions) {
      const counts = finished?.answerCounts?.[q.id] ?? [];
      expect(counts[q.correctIndex]).toBe(4);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
    }
  });

  it("year: exact scores 100, 5 years off scores 50", () => {
    const { engine, players, game } = setup(2, "guess-the-year", 1);
    const state = game.extra as { events: { id: string; year: number }[] };
    for (const pid of players) {
      for (const e of state.events) {
        const guess = pid === players[0] ? e.year : e.year + 5;
        engine.submitIntent(intent(engine, game.id, "year-guess", { eventId: e.id, value: guess }), pid);
      }
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[players[0]!]).toBe(800);
    expect(game.rawScores[players[1]!]).toBe(400);
  });

  it("geography: the content covers all six modes, and a game's questions use valid modes", () => {
    const { engine, players, game } = setup(2, "geography", 1);
    const state = game.extra as { questions: { id: string; correctIndex: number; mode: string }[] };
    const packModes = new Set((contentLibrary().byGame.get("geography") ?? []).map((li) => (li.item as { mode: string }).mode));
    for (const m of ["flag", "outline", "capital", "region", "higher-lower", "distance"]) expect(packModes.has(m)).toBe(true);
    for (const q of state.questions) expect(["flag", "outline", "capital", "region", "higher-lower", "distance"]).toContain(q.mode);
    for (const pid of players) {
      for (const q of state.questions) {
        engine.submitIntent(intent(engine, game.id, "geography-answer", { questionId: q.id, chosenIndex: q.correctIndex }), pid);
      }
    }
    expect(game.status).toBe("finished");
  });
});

describe("Connections / Sprint / Charades", () => {
  it("connections: correct groups solve, mistakes capped, score with bonus", () => {
    const { engine, players, game } = setup(2, "word-connections", 1);
    // The game's own board (Sprint 4): its four groups, by tile id.
    const board = (game.extra as { board: { categories: { name: string }[]; tiles: { id: string; category: string }[] } }).board;
    const groups = board.categories.map((c) => board.tiles.filter((t) => t.category === c.name).map((t) => t.id));
    for (const pid of players) {
      for (const group of groups) {
        expect(engine.submitIntent(intent(engine, game.id, "connections-guess", { tileIds: group }), pid).accepted).toBe(true);
      }
    }
    expect(game.status).toBe("finished");
    for (const pid of players) expect(game.rawScores[pid]).toBe(450); // 4×100 + 50 zero-mistake bonus
  });

  it("sprint: valid unique answers score more than shared answers", () => {
    const { engine, players, game } = setup(4, "category-sprint", 1);
    // The game's own categories (Sprint 4 content selection): use real accepted answers.
    const cats = (game.extra as { categories: { answers: string[] }[] }).categories;
    const rounds: Record<string, string[]>[] = cats.map((c) => {
      const [a, b, x, y, z] = c.answers as [string, string, string, string, string];
      return { [players[0]!]: [a, b], [players[1]!]: [a, x], [players[2]!]: [y], [players[3]!]: [z] };
    });
    // Round 2 and 3 reuse the round-1 pattern; player 0 shares one answer per round.
    for (const round of rounds) {
      for (const [pid, answers] of Object.entries(round)) {
        expect(engine.submitIntent(intent(engine, game.id, "sprint-answers", { answers }), pid).accepted).toBe(true);
      }
    }
    expect(game.status).toBe("finished");
    // Player 0 each round: 2 valid answers, 1 unique (b) => 40 + 20 = 60; three rounds => 180.
    // Player 2 each round: 1 valid unique answer => 40; three rounds => 120.
    expect(game.rawScores[players[0]!]).toBe(180);
    expect(game.rawScores[players[2]!]).toBe(120);
  });

  it("charades: actor prompt private, team scores assigned, game finishes after 4 turns", () => {
    const { engine, players, game } = setup(4, "charades", 1);
    // Actor rotates; find current actor via projection
    for (let turn = 0; turn < 4; turn++) {
      const proj = engine.project("player", players[0]);
      const myGames = proj["myGames"] as { state: { actor: string; prompt?: string } }[];
      const actor = myGames[0]!.state.actor;
      // Other players must not see the prompt
      const other = players.find((p) => p !== actor)!;
      const otherProj = engine.project("player", other);
      const otherGames = otherProj["myGames"] as { state: { prompt?: string } }[];
      expect(otherGames[0]!.state.prompt).toBeUndefined();
      expect(JSON.stringify(engine.project("tv"))).not.toContain("Building a snowman");
      expect(engine.submitIntent(intent(engine, game.id, "charades-turn", { outcome: "correct" }), actor).accepted).toBe(true);
    }
    expect(game.status).toBe("finished");
    expect(Object.values(game.rawScores).some((v) => v > 0)).toBe(true);
  });
});
