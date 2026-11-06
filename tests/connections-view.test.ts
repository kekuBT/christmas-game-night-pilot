// Sprint 4: the Word Connections view — own progress and feedback for the
// player, the full board only once the whole game has ended.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import type { ConnectionsBoard } from "../src/games/connections.js";

type Json = Record<string, unknown>;
function setup() {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine("CX");
  engine.clock = () => t;
  const ada = engine.join("Ada", { asHost: true }).player.id;
  const bea = engine.join("Bea").player.id;
  const g = engine.startGame(ada, "word-connections", { official: true, seed: 2 });
  const board = (g.extra as { board: ConnectionsBoard }).board;
  const group = (k: number) => board.tiles.filter((x) => x.category === board.categories[k]!.name).map((x) => x.id);
  const guess = (pid: string, tileIds: string[]) => engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action: "connections-guess", payload: { tileIds } }, pid);
  const view = (pid?: string) => (pid ? (engine.project("player", pid) as { myGames: { state: Json }[] }).myGames[0]!.state : (engine.project("tv") as { games: { state: Json }[] }).games[0]!.state);
  return { engine, g, board, group, guess, view, ada, bea, end: () => { t = g.deadlineAt! + 1; engine.tick(); } };
}

describe("Word Connections view", () => {
  it("a player sees only their own solved groups; no group name is public while playing", () => {
    const s = setup();
    expect(s.guess(s.ada, s.group(0)).accepted).toBe(true);
    const mine = s.view(s.ada);
    expect(mine["mySolved"]).toEqual([{ name: s.board.categories[0]!.name, level: expect.any(Number), tileIds: s.group(0) }]);
    expect(mine["groups"]).toBeUndefined();
    const json = JSON.stringify([s.view(s.bea), s.view()]);
    for (const c of s.board.categories) expect(json).not.toContain(c.name);
    expect(JSON.stringify(mine)).not.toContain(s.board.categories[1]!.name);
  });

  it("feedback on the last guess: correct, one away, or not a group", () => {
    const s = setup();
    s.guess(s.ada, s.group(0));
    expect(s.view(s.ada)["lastGuess"]).toEqual({ correct: true, oneAway: false, group: s.board.categories[0]!.name });
    s.guess(s.ada, [...s.group(1).slice(0, 3), s.group(2)[0]!]);
    expect(s.view(s.ada)["lastGuess"]).toEqual({ correct: false, oneAway: true });
    s.guess(s.ada, [s.group(1)[0]!, s.group(1)[1]!, s.group(2)[1]!, s.group(3)[0]!]);
    expect(s.view(s.ada)["lastGuess"]).toEqual({ correct: false, oneAway: false });
    expect(s.view(s.bea)["lastGuess"]).toBeUndefined(); // Bea's view says nothing about Ada's guesses
  });

  it("finishing early reveals nothing more; the whole board is revealed to everyone when the game ends", () => {
    const s = setup();
    for (let k = 0; k < 4; k++) s.guess(s.ada, s.group(k));
    expect(s.view(s.bea)["groups"]).toBeUndefined();
    expect(s.view()["finishedPlayers"]).toBe(1);
    s.end();
    for (const v of [s.view(s.bea), s.view()]) {
      expect((v["groups"] as { name: string }[]).map((x) => x.name).sort()).toEqual(s.board.categories.map((c) => c.name).sort());
    }
  });

  it("re-guessing a solved group's tiles is refused and costs nothing", () => {
    const s = setup();
    s.guess(s.ada, s.group(0));
    const r = s.guess(s.ada, [s.group(0)[0]!, ...s.group(1).slice(0, 3)]);
    expect(r).toMatchObject({ accepted: false, reason: "TILE_ALREADY_SOLVED" });
    expect((s.view(s.ada)["myState"] as { mistakes: number; guessed: unknown[] })).toMatchObject({ mistakes: 0 });
    expect(s.view(s.ada)["myGuessCount"]).toBe(1);
  });
});
