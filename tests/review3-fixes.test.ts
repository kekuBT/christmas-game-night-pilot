import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";
import { openPlayerSocket } from "./helpers/socket.js";

// Third review 5769441799 (2026-11-04) — regression tests first.
let server: LocalServer;
let port: number;
let dataDir: string;
beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cgn-review3-"));
  server = new LocalServer({ dataDir });
  port = await server.listen(0);
});
afterAll(async () => { await server.close(); });
async function post(path: string, body: Record<string, unknown>, token?: string, base?: number) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${base ?? port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function get(path: string, token?: string, base?: number) {
  const headers: Record<string, string> = {};
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${base ?? port}${path}`, { headers });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("review3 P1: championshipDay survives restart", () => {
  it("engine toJSON/fromJSON round-trip preserves the day, and old snapshots default to 1", () => {
    const engine = new RoomEngine("Day Room");
    const host = engine.join("Host", { asHost: true }).player.id;
    engine.advanceDay(host);
    engine.advanceDay(host);
    engine.advanceDay(host);
    expect(engine.championshipDay).toBe(4);
    const restored = RoomEngine.fromJSON(engine.toJSON());
    expect(restored.championshipDay).toBe(4);
    const old = engine.toJSON();
    delete old["championshipDay"];
    expect(RoomEngine.fromJSON(old).championshipDay).toBe(1);
  });
  it("HTTP restart: day 4 before restart is still day 4 after, and new games land on day 4", async () => {
    const created = await post("/rooms", { name: "Restart Day" });
    const roomId = created.json["roomId"] as string;
    const claim = created.json["hostClaimToken"] as string;
    const players: { id: string; token: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const j = await post(`/rooms/${roomId}/join`, { displayName: `D${i}-${randomUUID().slice(0, 4)}`, asHost: i === 0, hostClaimToken: claim });
      players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
    }
    const host = players[0]!;
    for (let d = 2; d <= 4; d++) {
      const r = await post(`/rooms/${roomId}/day`, {}, host.token);
      expect(r.json["day"]).toBe(d);
    }
    const before = await get(`/rooms/${roomId}/projection?audience=player`, host.token);
    expect((before.json as Record<string, unknown>)["championshipDay"]).toBe(4);
    // Restart with the same dataDir.
    await server.close();
    server = new LocalServer({ dataDir });
    port = await server.listen(0);
    const after = await get(`/rooms/${roomId}/projection?audience=player`, host.token);
    expect((after.json as Record<string, unknown>)["championshipDay"]).toBe(4);
    // Reconnect everyone (restart drops sockets), then start a game: it must be day 4.
    // Sprint 2: presence comes from a live socket, as in the app.
    const sockets = [];
    for (const p of players) {
      await post(`/rooms/${roomId}/reconnect`, { playerId: p.id, recoveryToken: p.token });
      sockets.push(await openPlayerSocket(port, roomId, p.token));
    }
    const started = await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", official: true }, host.token);
    expect(started.status).toBe(201);
    for (const ws of sockets) ws.terminate();
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, host.token);
    const games = (proj.json as { games: { id: string; day?: number }[] }).games;
    const mine = games.find((g) => g.id === started.json["gameId"]);
    expect(mine?.day).toBe(4);
  });
});

describe("review3 P1: ceremony crowns the current day's winner", () => {
  it("Day 2 winner is named even when the overall leader is someone else", () => {
    const engine = new RoomEngine("Ceremony Day");
    const a = engine.join("Ada", { asHost: true }).player.id;
    const b = engine.join("Bea").player.id;
    // Day 1: Ada wins.
    const g1 = engine.startGame(a, "math-mayhem", { official: true });
    g1.rawScores = { [a]: 300, [b]: 100 };
    g1.status = "finished";
    engine.advanceDay(a);
    // Day 2: Bea wins, with the same margin, so overall totals tie and the
    // old overall-leader ceremony would have named Ada (first in order).
    const g2 = engine.startGame(a, "math-mayhem", { official: true });
    g2.rawScores = { [a]: 100, [b]: 300 };
    g2.status = "finished";
    const ceremony = engine.ceremony();
    expect(ceremony.day).toBe(2);
    expect(ceremony.winner).toBe("Bea");
    expect(ceremony.winners).toEqual(["Bea"]);
  });
  it("a tied day names both winners", () => {
    const engine = new RoomEngine("Ceremony Tie");
    const a = engine.join("Ada", { asHost: true }).player.id;
    const b = engine.join("Bea").player.id;
    const g1 = engine.startGame(a, "math-mayhem", { official: true });
    g1.rawScores = { [a]: 200, [b]: 200 };
    g1.status = "finished";
    const ceremony = engine.ceremony();
    expect(ceremony.day).toBe(1);
    expect(ceremony.winners?.sort()).toEqual(["Ada", "Bea"]);
  });
});

describe("review3 P2: oversized entries split across PDF pages, with output bounds", () => {
  it("paginateLines splits a 400-unit entry across pages and never exceeds the page bottom", async () => {
    const { paginateLines } = await import("../apps/web/src/components/exportLayout.js");
    // 60 lines of 7 units each = 420 units, page height 280 starting at 32:
    // every page must hold lines whose cumulative height stays <= 280.
    const heights = Array(60).fill(7);
    const pages = paginateLines(heights, 280, 32);
    expect(pages.flat()).toEqual(heights.map((_, i) => i));
    for (const page of pages) {
      const total = 32 + page.reduce((s, i) => s + heights[i]!, 0);
      expect(total).toBeLessThanOrEqual(280);
    }
    expect(pages.length).toBeGreaterThan(1);
  });
  it("canvas note y is clamped inside the 1080px image", async () => {
    const { canvasNoteY } = await import("../apps/web/src/components/exportLayout.js");
    expect(canvasNoteY(500)).toBe(500);
    expect(canvasNoteY(2000)).toBe(1040);
  });
});
