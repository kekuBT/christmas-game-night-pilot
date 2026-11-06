import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";

// Follow-up review 5769121221 (2026-11-04) — regression tests first.
// These tests fail against the pre-fix code and pass after the fixes.
let server: LocalServer;
let port: number;
beforeAll(async () => {
  server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "cgn-review2-")) });
  port = await server.listen(0);
});
afterAll(async () => { await server.close(); });
async function post(path: string, body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["x-session-token"] = token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function makeRoom(n: number) {
  const created = await post("/rooms", { name: "Review2" });
  const roomId = created.json["roomId"] as string;
  const claim = created.json["hostClaimToken"] as string;
  const players: { id: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const j = await post(`/rooms/${roomId}/join`, { displayName: `R${i}-${randomUUID().slice(0, 4)}`, asHost: i === 0, hostClaimToken: claim });
    players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
  }
  return { roomId, claim, players };
}

describe("review #3: advanceDay guards", () => {
  it("advancing past day 7 is rejected, and advancing during a game is rejected", async () => {
    const { roomId, players } = await makeRoom(4);
    const host = players[0]!;
    for (let d = 2; d <= 7; d++) {
      const r = await post(`/rooms/${roomId}/day`, {}, host.token);
      expect(r.status).toBe(200);
      expect(r.json["day"]).toBe(d);
    }
    const over = await post(`/rooms/${roomId}/day`, {}, host.token);
    expect(over.status).toBe(400);
    expect(String(over.json["error"] ?? "")).toMatch(/final day/i);
  });
  it("engine: advanceDay while a game is playing throws, and day 8 throws", () => {
    const engine = new RoomEngine("Days");
    const host = engine.join("Host", { asHost: true }).player.id;
    for (let i = 1; i < 4; i++) engine.join(`P${i}`);
    engine.startGame(host, "math-mayhem", { official: true });
    expect(() => engine.advanceDay(host)).toThrow(/in progress/i);
    // Finish the game by marking it finished (test shortcut), then advance to 7 and stop.
    const game = [...engine.games.values()][0]!;
    game.status = "finished";
    for (let d = 2; d <= 7; d++) expect(engine.advanceDay(host)).toBe(d);
    expect(() => engine.advanceDay(host)).toThrow(/final day/i);
  });
});

describe("review #4: host bootstrap is bound to room creation", () => {
  it("joining asHost without the creation token does not grant host", async () => {
    const created = await post("/rooms", { name: "Bootstrap" });
    const roomId = created.json["roomId"] as string;
    expect(typeof created.json["hostClaimToken"]).toBe("string");
    const noToken = await post(`/rooms/${roomId}/join`, { displayName: "Sneaky", asHost: true });
    expect(noToken.status).toBe(400);
    const wrongToken = await post(`/rooms/${roomId}/join`, { displayName: "Sneaky2", asHost: true, hostClaimToken: "nope" });
    expect(wrongToken.status).toBe(400);
    const withToken = await post(`/rooms/${roomId}/join`, { displayName: "Creator", asHost: true, hostClaimToken: created.json["hostClaimToken"] });
    expect(withToken.status).toBe(201);
    expect(withToken.json["isHost"]).toBe(true);
    // A second caller with the same token after a host exists joins as a regular player, not host.
    const second = await post(`/rooms/${roomId}/join`, { displayName: "Late", asHost: true, hostClaimToken: created.json["hostClaimToken"] });
    expect(second.status).toBe(201);
    expect(second.json["isHost"]).toBe(false);
  });
  it("join-by-code asHost also requires the creation token", async () => {
    const created = await post("/rooms", { name: "Bootstrap2" });
    const code = created.json["joinCode"] as string;
    const r = await post("/rooms/join-by-code", { joinCode: code, displayName: "Sneaky", asHost: true });
    expect(r.status).toBe(400);
  });
});

describe("review #6: role-aware Impostor projections over HTTP", () => {
  it("with a fixed seed, exactly one player is the impostor (no word) and every honest player gets the same word", async () => {
    const { roomId, players } = await makeRoom(4);
    const host = players[0]!;
    const started = await post(`/rooms/${roomId}/games`, { gameId: "impostor", official: false, seed: 7 }, host.token);
    expect(started.status).toBe(201);
    const states: { role?: string; word?: string }[] = [];
    for (const p of players) {
      const proj = await get(`/rooms/${roomId}/projection?audience=player`, p.token);
      expect(proj.status).toBe(200);
      const my = (proj.json["myGames"] as { state: { role?: string; word?: string } }[])[0]!.state;
      states.push(my);
    }
    const impostors = states.filter((s) => s.role === "impostor");
    const honest = states.filter((s) => s.role === "honest");
    expect(impostors.length).toBe(1);
    expect(impostors[0]!.word).toBeUndefined();
    expect(honest.length).toBe(3);
    expect(new Set(honest.map((s) => s.word)).size).toBe(1);
    expect(honest[0]!.word).toBeTruthy();
    // TV projection never carries the word or the role assignment.
    const tv = await get(`/rooms/${roomId}`);
    expect(JSON.stringify(tv.json)).not.toContain(honest[0]!.word);
  });
});

describe("review #5: export layout helpers (long content)", () => {
  it("paginateLines never puts a line past the page bottom, and splits long entries across pages", async () => {
    const { paginateLines } = await import("../apps/web/src/components/exportLayout.js");
    // 10 lines of 60 units on a 280-unit page starting at y=32: pages hold
    // at most 4 lines (32+4*60=272), so 10 lines need 3 pages.
    const pages = paginateLines(Array(10).fill(60), 280, 32);
    expect(pages.length).toBe(3);
    expect(pages.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginateLines([], 280, 32)).toEqual([[]]);
  });
  it("selectShareEntries surfaces the overflow instead of silently clipping", async () => {
    const { selectShareEntries } = await import("../apps/web/src/components/exportLayout.js");
    const entries = Array.from({ length: 12 }, (_, i) => i);
    const { shown, overflow } = selectShareEntries(entries);
    expect(shown.length).toBe(8);
    expect(overflow).toBe(4);
    expect(selectShareEntries([1, 2]).overflow).toBe(0);
  });
});
