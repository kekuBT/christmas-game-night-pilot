/**
 * Audit Batch A follow-up (owner decision 2026-11-07): A1-A18 accepted.
 *  - Previously materialised boards and historical Cup results are preserved:
 *    tested for a game that stored the pre-A1 board, a pre-Sprint-4 game with
 *    no stored board, and a new game (which gets the corrected board).
 *  - Every edited board is unique even after a semantic overlap review that
 *    goes beyond the solver's declared relationships.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent } from "../src/content/registry.js";
import { connectionsSolutions } from "../scripts/content-quality/pilot-lib.js";
import { CONNECTIONS_BOARD, type ConnectionsBoard } from "../src/games/connections.js";
import { RoomEngine, type GameInstance } from "../src/server/room.js";

type Json = Record<string, unknown>;
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
// Real statuses (no test-mode approvals): con-legacy-1 is the only official board, as in production.
const realLib = loadContent();
const docs = join(DEFAULT_CONTENT_DIR, "..", "docs", "content-quality-2");
const declared = (JSON.parse(readFileSync(join(docs, "audit-verdicts.json"), "utf8")) as { connectionsOverlaps: Record<string, Record<string, string[]>> }).connectionsOverlaps;
const semantic = (JSON.parse(readFileSync(join(docs, "audit-batches", "batch-a-semantic-review.json"), "utf8")) as { boards: Record<string, Record<string, { alsoFits: string[]; note: string }>> }).boards;
const groupsOf = (id: string) => (lib.items.get(id)!.item as unknown as { groups: { name: string; words: string[] }[] }).groups;

describe("semantic overlap review of the edited boards", () => {
  it("covers every tile of every edited board, and names only groups on that board", () => {
    expect(Object.keys(semantic).sort()).toEqual(["con-legacy-1", "con-s4-02", "con-s4-05", "con-s4-12"]);
    for (const [id, tiles] of Object.entries(semantic)) {
      const groups = groupsOf(id);
      expect(Object.keys(tiles).sort(), id).toEqual(groups.flatMap((g) => g.words).sort());
      const names = new Set(groups.map((g) => g.name));
      for (const [tile, r] of Object.entries(tiles)) {
        const own = groups.find((g) => g.words.includes(tile))!.name;
        for (const n of r.alsoFits) { expect(names.has(n), `${id} ${tile} -> ${n}`).toBe(true); expect(n).not.toBe(own); }
      }
    }
  });

  it("each edited board still has exactly one solution with every reviewed and declared overlap", () => {
    for (const [id, tiles] of Object.entries(semantic)) {
      const also: Record<string, string[]> = {};
      for (const [w, names] of Object.entries(declared[id] ?? {})) also[w] = [...names];
      for (const [w, r] of Object.entries(tiles)) also[w] = [...new Set([...(also[w] ?? []), ...r.alsoFits])];
      const sols = connectionsSolutions(groupsOf(id), also);
      expect(sols.length, id).toBe(1);
      expect(sols[0]).toEqual(groupsOf(id).map((g) => g.words));
    }
  });

  it("the review matters: one contested judgement (Basil as a green) would give con-s4-02 two solutions", () => {
    const also = { ...declared["con-s4-02"], Basil: ["Shades of green"] };
    expect(connectionsSolutions(groupsOf("con-s4-02"), also).length).toBe(2);
    expect(semantic["con-s4-02"]!["Basil"]!.alsoFits).toEqual([]);
    expect(semantic["con-s4-02"]!["Basil"]!.note).toMatch(/editor should confirm/);
  });
});

// ---------------------------------------------------------------- history
const intent = (roomId: string, gid: string, action: string, payload: Json) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });
function room() {
  const engine = new RoomEngine("Batch A Cup");
  engine.content = realLib;
  const ids = [engine.join("Ada", { asHost: true }).player.id, engine.join("Bea").player.id];
  return { engine, ids, host: ids[0]! };
}
const restore = (e: RoomEngine) => { const r = RoomEngine.fromJSON(JSON.parse(JSON.stringify(e.toJSON())) as Json); r.content = realLib; return r; };
const tileId = (text: string) => `tile-${text.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
const solveAll = (e: RoomEngine, g: GameInstance, pid: string, board: { name: string; tiles: string[] }[]) => {
  for (const c of board) e.submitIntent(intent(e.id, g.id, "connections-guess", { tileIds: c.tiles.map(tileId) }), pid);
};
const gameIn = (e: RoomEngine, id: string) => (e.toJSON()["games"] as Json[]).find((x) => x["id"] === id)!;

/** The board as it was materialised before A1 (Icicle), for a game started before the edit. */
function preA1Board(): ConnectionsBoard {
  const categories = groupsOf("con-legacy-1").map((g) => ({ name: g.name, tiles: g.words.map((w) => (w === "Sleet" ? "Icicle" : w)) }));
  return { categories, tiles: categories.flatMap((c) => c.tiles.map((text) => ({ id: tileId(text), text, category: c.name }))) };
}

describe("Batch A keeps game history intact (old and new cases)", () => {
  it("new official games use the corrected board: Sleet, no Icicle", () => {
    const { engine, host } = room();
    const g = engine.startGame(host, "word-connections", { official: true, seed: 1 });
    const words = (g.extra as { board: ConnectionsBoard }).board.tiles.map((t) => t.text);
    expect(g.extra).toMatchObject({ boardId: "con-legacy-1" });
    expect(words).toContain("Sleet");
    expect(words).not.toContain("Icicle");
  });

  it("a game materialised before A1 keeps Icicle through save and restore, and scores the same", () => {
    const { engine, host, ids } = room();
    const g = engine.startGame(host, "word-connections", { official: true, seed: 1 });
    const ex = g.extra as { board: ConnectionsBoard; tileOrder: string[] };
    ex.board = preA1Board();
    ex.tileOrder = ex.board.tiles.map((t) => t.id);
    const restored = restore(engine);
    const rg = [...(restored as unknown as { games: Map<string, GameInstance> }).games.values()].find((x) => x.id === g.id)!;
    solveAll(restored, rg, ids[0]!, ex.board.categories);
    solveAll(restored, rg, ids[1]!, ex.board.categories.slice(0, 2));
    // The Icicle group was accepted as solved: the stored board, not today's pack, decides.
    const saved = gameIn(restored, g.id);
    const ps = ((saved["extra"] as Json)["playerStates"] as Record<string, { solved: string[] }>);
    expect(ps[ids[0]!]!.solved).toContain("Winter weather");
    expect(JSON.stringify(saved["extra"])).toContain("Icicle");
    expect(JSON.stringify(saved["extra"])).not.toContain("Sleet");
  });

  it("a pre-Sprint-4 game with no stored board replays the original Icicle board", () => {
    const { engine, host, ids } = room();
    const g = engine.startGame(host, "word-connections", { official: true, seed: 1 });
    const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    const sg = (snap["games"] as Json[]).find((x) => x["id"] === g.id)!;
    sg["extra"] = { playerStates: (sg["extra"] as Json)["playerStates"] };
    const old = RoomEngine.fromJSON(snap);
    old.content = realLib;
    const og = [...(old as unknown as { games: Map<string, GameInstance> }).games.values()].find((x) => x.id === g.id)!;
    solveAll(old, og, ids[0]!, CONNECTIONS_BOARD.categories);
    const ps = ((gameIn(old, g.id)["extra"] as Json)["playerStates"] as Record<string, { solved: string[] }>);
    expect(ps[ids[0]!]!.solved).toEqual(expect.arrayContaining(["Winter weather"]));
    expect(ps[ids[0]!]!.solved).toHaveLength(4);
  });

  it("finished results and Cup standings are identical after reloading with the edited library", () => {
    const { engine, host, ids } = room();
    const g = engine.startGame(host, "word-connections", { official: true, seed: 1 });
    const board = (g.extra as { board: ConnectionsBoard }).board;
    solveAll(engine, g, ids[0]!, board.categories);
    solveAll(engine, g, ids[1]!, [...board.categories].reverse());
    expect(g.status).toBe("finished");
    const before = { scores: { ...g.rawScores }, standings: engine.championshipResults() };
    const again = restore(engine);
    expect(gameIn(again, g.id)["rawScores"]).toEqual(before.scores);
    expect(again.championshipResults()).toEqual(before.standings);
  });
});
