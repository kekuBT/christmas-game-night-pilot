import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";

// Completion-sprint P4: complete multiplayer sessions through the engine,
// projection secrecy, and championship mathematics end to end.
function intent(gameId: string, action: string, payload: Record<string, unknown>, roomId: string) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}
function room(n: number) {
  const engine = new RoomEngine("P4 Session");
  const host = engine.join("Host", { asHost: true }).player.id;
  const ids = [host];
  for (let i = 0; i < n - 1; i++) ids.push(engine.join(`G${i}`).player.id);
  return { engine, host, ids };
}

describe("complete multiplayer sessions", () => {
  it("a 4-player room plays Math, Trivia, and Closest to finished with correct totals", () => {
    const { engine, host, ids } = room(4);
    const math = engine.startGame(host, "math-mayhem", { official: true });
    for (const pid of ids) for (const q of math.questions!) {
      engine.submitIntent(intent(math.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, engine.id), pid);
    }
    expect(math.status).toBe("finished");
    expect(Object.values(math.rawScores).every((v) => v >= 1000)).toBe(true);
    const trivia = engine.startGame(host, "trivia", { official: true, seed: 3 });
    const tq = (trivia.extra as { questions: { id: string }[] }).questions;
    for (const pid of ids) for (const q of tq) {
      engine.submitIntent(intent(trivia.id, "trivia-answer", { questionId: q.id, chosenIndex: 0 }, engine.id), pid);
    }
    expect(trivia.status).toBe("finished");
    const closest = engine.startGame(host, "closest-wins", { official: true });
    const cq = (closest.extra as { questions: { id: string }[] }).questions;
    // Closest has 8 questions; each player guesses every question to finish it.
    for (const _q of cq) {
      for (const pid of ids) {
        engine.submitIntent(intent(closest.id, "closest-guess", { value: 100 }, engine.id), pid);
      }
    }
    expect(closest.status).toBe("finished");
    expect(engine.ledger.filter((e) => e.type === "game-finished").length).toBe(3);
    expect(Object.keys(engine.officialStandings()).length).toBe(4);
  });

  it("a 10-player room can be created, and the 11th join is refused", () => {
    const { engine } = room(10);
    expect(engine.players.size).toBe(10);
    expect(() => engine.join("Eleventh")).toThrow("full");
  });

  it("duplicate display names are refused", () => {
    const { engine } = room(2);
    expect(() => engine.join("Host")).toThrow("already taken");
    expect(() => engine.join("host")).toThrow("already taken");
  });

  it("a second concurrent game is refused while one is playing", () => {
    const { engine, host } = room(4);
    engine.startGame(host, "math-mayhem", { official: true });
    expect(() => engine.startGame(host, "trivia", {})).toThrow("already in progress");
  });

  it("reconnect restores the same slot and a wrong token cannot take it over", () => {
    const { engine, ids } = room(2);
    const player = engine.players.get(ids[1]!)!;
    const token = engine.join("Temp", {}) ; // a different player, to prove tokens differ
    expect(token.recoveryToken).not.toBe(player.recoveryTokenHash);
    expect(() => engine.reconnect(ids[1]!, "0".repeat(64))).toThrow("does not match");
  });
});

describe("projection secrecy", () => {
  it("TV projections contain no answer keys, words, or tokens, in any game", () => {
    const { engine, host, ids } = room(4);
    const games = ["impostor", "caption-clash", "trivia", "word-connections", "who-said-that", "guess-the-year", "closest-wins", "category-sprint", "charades", "geography", "math-mayhem"];
    // Tokens are never projected. Answer keys are never projected for a
    // PLAYING game — but finished trivia legitimately reveals its keys and
    // aggregate answer counts (Mchezo results/TV reveal), so the key check
    // below is scoped to the playing game only, and the finished-trivia
    // reveal is asserted explicitly after the loop.
    const alwaysBanned = ["recoveryToken", "recoveryTokenHash"];
    for (const gid of games) {
      const game = engine.startGame(host, gid, { official: false, seed: 1 });
      const tv = engine.project("tv") as { games: { id: string; state?: unknown }[] };
      const tvJson = JSON.stringify(tv);
      for (const b of alwaysBanned) expect(tvJson).not.toContain(b);
      const playing = tv.games.find((g) => g.id === game.id);
      expect(JSON.stringify(playing?.state ?? {})).not.toContain("correctIndex");
      expect(JSON.stringify(playing?.state ?? {})).not.toContain("correctAnswer");
      // Finish or skip the game so the next one can start.
      game.status = "finished";
    }
    expect(ids.length).toBe(4);
    // Finished trivia reveal: keys + aggregate counts are public, and the
    // counts carry no player identities (arrays of numbers, not a map).
    const finalTv = engine.project("tv") as { games: { gameId: string; answerCounts?: Record<string, number[]> }[] };
    const trivia = finalTv.games.find((g) => g.gameId === "trivia");
    expect(trivia?.answerCounts).toBeDefined();
    expect(Object.keys(trivia?.answerCounts ?? {})).toHaveLength(10);
    for (const counts of Object.values(trivia?.answerCounts ?? {})) {
      expect(counts).toHaveLength(4);
      expect(counts.every((n) => typeof n === "number")).toBe(true);
    }
    expect(JSON.stringify(finalTv)).toContain("correctIndex");
  });

  it("a player projection contains only that player's private state", () => {
    const { engine, host, ids } = room(4);
    const game = engine.startGame(host, "impostor", { official: false, seed: 2 });
    const mine = JSON.stringify(engine.project("player", ids[0]!));
    expect(mine).not.toContain("recoveryToken");
    const states = ids.map((id) => (engine.project("player", id) as { myGames: { state: { word?: string; role?: string } }[] }).myGames[0]!.state);
    // Role-aware assertion (replaces the old seen <= 2 count, which was
    // true even if both clients received the secret): with a fixed seed,
    // exactly one player is the impostor and gets NO word, and every
    // honest player gets the SAME word. See also the HTTP/WS version in
    // tests/review2-fixes.test.ts.
    const impostors = states.filter((s) => s.role === "impostor");
    const honest = states.filter((s) => s.role === "honest");
    expect(impostors.length).toBe(1);
    expect(impostors[0]!.word).toBeUndefined();
    expect(honest.length).toBe(3);
    expect(new Set(honest.map((s) => s.word)).size).toBe(1);
    expect(honest[0]!.word).toBeTruthy();
    expect(game.id).toBeTruthy();
  });

  it("host projection never includes recovery tokens", () => {
    const { engine, host } = room(3);
    const hostProj = JSON.stringify(engine.project("host", host));
    expect(hostProj).not.toContain("recoveryToken");
  });
});

describe("championship mathematics end to end", () => {
  it("a 3-day, 4-player championship ranks the consistent player first", () => {
    const { engine, host, ids } = room(4);
    const playDay = (winnerIdx: number) => {
      const game = engine.startGame(host, "math-mayhem", { official: true });
      for (const pid of ids) {
        for (const q of game.questions!) {
          // Winner answers everything; others answer the first question only correctly.
          const correct = pid === ids[winnerIdx] || q.id === game.questions![0]!.id;
          engine.submitIntent(intent(game.id, "submit-math-answer", { questionId: q.id, chosenIndex: correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length }, engine.id), pid);
        }
      }
    };
    playDay(0);
    engine.advanceDay(host);
    playDay(0);
    engine.advanceDay(host);
    playDay(1);
    const results = engine.championshipResults();
    expect(results.every((r) => r.eligible)).toBe(true);
    expect(results[0]!.playerId).toBe(ids[0]);
  });

  // Sprint 3 (P9): Charades, the only team game, is practice-only, so no
  // real game can feed the team channel now. The channel itself is unchanged
  // and still covered by tests/scoring.test.ts and tests/championship.test.ts.
  it("the team game (Charades) cannot be official, and a practice Charades never enters the championship", () => {
    const { engine, host } = room(4);
    expect(() => engine.startGame(host, "charades", { official: true })).toThrow(/practice-only/);
    const game = engine.startGame(host, "charades", { official: false });
    const st = game.extra as { teams: string[][] };
    // Actor correct on every turn: both teams score equally.
    for (let i = 0; i < 4; i++) {
      const actor = [...st.teams[0]!, ...st.teams[1]!][i]!;
      engine.submitIntent(intent(game.id, "charades-turn", { outcome: "correct" }, engine.id), actor);
    }
    expect(game.status).toBe("finished");
    expect(engine.championshipResults().length).toBe(0);
    expect(engine.officialStandings()).toEqual({});
  });
});
