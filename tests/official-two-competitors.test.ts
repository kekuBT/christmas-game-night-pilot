/**
 * D1 (owner-approved 2026-11-07): an OFFICIAL game needs at least two
 * competitors. Championship scoring has always skipped games with fewer than
 * two scores (room.ts officialStandings/playerDays, championship.ts N=1), yet a
 * one-player official Word Connections game used to start, retire its board
 * from the Cup's official pool, and report "Counts toward the Family Cup".
 *
 * Now the server refuses such a start BEFORE content is selected (nothing is
 * consumed), with a code the client turns into an explicit "play it as
 * practice" choice — never a silent switch. Completed historical games keep
 * their stored record, but no one-player game reports that it counts.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent } from "../src/content/registry.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, StartRefused } from "../src/server/room.js";

type Json = Record<string, unknown>;
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });

function room(n: number) {
  const engine = new RoomEngine("D1 Cup");
  engine.content = lib;
  const ids = [engine.join("Keku", { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
  return { engine, host: ids[0]!, ids };
}
const usage = (e: RoomEngine) => JSON.stringify((e.toJSON() as Json)["contentUsage"]);

describe("D1: official games need two competitors", () => {
  it("refuses a one-player official start with OFFICIAL_NEEDS_TWO, before any content is used", () => {
    const { engine, host } = room(1);
    const before = usage(engine);
    let err: unknown;
    try { engine.startGame(host, "word-connections", { official: true }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(StartRefused);
    expect((err as StartRefused).code).toBe("OFFICIAL_NEEDS_TWO");
    expect((err as Error).message).toMatch(/at least 2 players/);
    expect(engine.toJSON()["games"]).toEqual([]);
    expect(usage(engine)).toBe(before); // no board retired from the official pool
  });

  it("the same one player can still start it as practice (an explicit, separate choice)", () => {
    const { engine, host } = room(1);
    const g = engine.startGame(host, "word-connections", { official: false });
    expect(g.official).toBe(false);
  });

  it("two connected players can start it officially, as before", () => {
    const { engine, host } = room(2);
    const g = engine.startGame(host, "word-connections", { official: true });
    expect(g.official).toBe(true);
    expect(g.players).toHaveLength(2);
  });

  it("a historical one-player official game keeps its record but no longer reports that it counts", () => {
    const { engine, host, ids } = room(2);
    const g = engine.startGame(host, "word-connections", { official: true });
    const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    // Rewrite the stored game into what an older build produced: one competitor, finished, "counts".
    const stored = (snap["games"] as Json[]).find((x) => x["id"] === g.id)!;
    stored["players"] = [host];
    stored["status"] = "finished";
    stored["rawScores"] = { [host]: 300 };
    stored["outcome"] = { reason: "completed", endedAt: Date.now(), countsOfficially: true, participation: {} };
    const restored = RoomEngine.fromJSON(snap);
    // The stored record is preserved exactly.
    const again = (restored.toJSON()["games"] as Json[]).find((x) => x["id"] === g.id)!;
    expect((again["outcome"] as Json)["countsOfficially"]).toBe(true);
    expect(again["rawScores"]).toEqual({ [host]: 300 });
    // But nothing reports it as counting, and standings are unchanged (empty).
    for (const audience of [["player", host], ["player", ids[1]], ["tv", undefined]] as const) {
      const proj = restored.project(audience[0], audience[1]) as Json;
      const pub = (proj["games"] as Json[]).find((x) => x["id"] === g.id)!;
      expect(pub["countsOfficially"]).toBe(false);
      expect((pub["outcome"] as Json)["countsOfficially"]).toBe(false);
      expect(String((pub["outcome"] as Json)["note"])).toMatch(/only one player/i);
    }
    const mine = ((restored.project("player", host) as Json)["myGames"] as Json[]).find((x) => x["id"] === g.id);
    if (mine?.["outcome"]) expect((mine["outcome"] as Json)["countsOfficially"]).toBe(false);
    expect(restored.officialStandings()).toEqual({});
  });
});

describe("D1 over HTTP", () => {
  const dir = mkdtempSync(join(tmpdir(), "mchezo-d1-"));
  const server = new LocalServer({ dataDir: dir, content: lib, heartbeatMs: null });
  let base = "";
  afterAll(() => server.close());

  it("answers 409 OFFICIAL_NEEDS_TWO with a player-facing message, and nothing starts", async () => {
    base = `http://127.0.0.1:${await server.listen(0)}`;
    const post = async (path: string, body: Json, token?: string) => {
      const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body: JSON.stringify(body) });
      return { status: r.status, body: (await r.json()) as Json };
    };
    const created = await post("/rooms", { name: "D1" });
    const roomId = created.body["roomId"] as string;
    const joined = await post(`/rooms/${roomId}/join`, { displayName: "Keku", asHost: true, hostClaimToken: created.body["hostClaimToken"] });
    const token = joined.body["recoveryToken"] as string;
    const res = await post(`/rooms/${roomId}/games`, { gameId: "word-connections", official: true }, token);
    expect(res.status).toBe(409);
    expect(res.body["code"]).toBe("OFFICIAL_NEEDS_TWO");
    expect(String(res.body["error"])).toMatch(/practice/i);
    const proj = (await (await fetch(`${base}/rooms/${roomId}/projection?audience=player`, { headers: { "x-session-token": token } })).json()) as Json;
    expect(proj["games"]).toEqual([]);
    const practice = await post(`/rooms/${roomId}/games`, { gameId: "word-connections", official: false }, token);
    expect(practice.status).toBe(201);
  });
});
