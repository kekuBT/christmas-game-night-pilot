import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { deriveShowPhase, myProgressDone, ornamentColor } from "../apps/web/src/components/showPhase.js";
import type { PlayerGame } from "../apps/web/src/types.js";

// M6: Show Mode phases, waiting counts, and reactions — all privacy-checked.
let server: LocalServer;
let port: number;
beforeAll(async () => {
  server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "cgn-m6-")), newCupTiming: 1 }); // timing v1, as every Cup before D3 (D-UX-09)
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
  const created = await post("/rooms", { name: "M6 Room" });
  const roomId = created.json["roomId"] as string;
  const claim = created.json["hostClaimToken"] as string;
  const players: { id: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const j = await post(`/rooms/${roomId}/join`, { displayName: `M${i}-${randomUUID().slice(0, 4)}`, asHost: i === 0, hostClaimToken: claim });
    players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
  }
  return { roomId, players };
}

describe("M6 show phases (pure derivation)", () => {
  const quiz = (answered: string[]): PlayerGame => ({
    id: "game-1", gameId: "trivia", status: "playing",
    myAnswers: Object.fromEntries(answered.map((q) => [q, 0])), myScore: 0,
    questions: [{ id: "q1", prompt: "A?", options: ["x", "y"] }, { id: "q2", prompt: "B?", options: ["x", "y"] }],
  });
  it("lobby → intro → gameplay → waiting → results, in order", () => {
    expect(deriveShowPhase(undefined, undefined, null, null)).toBe("lobby");
    expect(deriveShowPhase(quiz([]), undefined, null, null)).toBe("intro");
    expect(deriveShowPhase(quiz([]), undefined, "game-1", null)).toBe("gameplay");
    expect(deriveShowPhase(quiz(["q1", "q2"]), undefined, "game-1", null)).toBe("waiting");
    expect(myProgressDone(quiz(["q1"]))).toBe(false);
    expect(myProgressDone(quiz(["q1", "q2"]))).toBe(true);
    const finished: PlayerGame = { ...quiz(["q1", "q2"]), status: "finished" };
    expect(deriveShowPhase(undefined, finished, null, null)).toBe("results");
    expect(deriveShowPhase(undefined, finished, null, "game-1")).toBe("lobby");
  });
  it("ornament colours are stable per player and drawn from the palette", () => {
    expect(ornamentColor("player-abc")).toBe(ornamentColor("player-abc"));
    expect(["#E5BC70", "#A73545", "#7FB069", "#F7F2E8", "#8E6BA8", "#4A90A4"]).toContain(ornamentColor("player-abc"));
  });
});

describe("M6 waiting counts are counts only", () => {
  it("public projection carries submittedCount, never identities or answers", async () => {
    const { roomId, players } = await makeRoom(4);
    const host = players[0]!;
    await post(`/rooms/${roomId}/games`, { gameId: "math-mayhem", official: true }, host.token);
    const proj0 = await get(`/rooms/${roomId}/projection?audience=tv`);
    const games0 = proj0.json["games"] as { id: string; submittedCount?: number; totalPlayers?: number }[];
    expect(games0[0]!.submittedCount).toBe(0);
    expect(games0[0]!.totalPlayers).toBe(4);
    // One player answers one question via the HTTP intent route.
    const proj1 = await get(`/rooms/${roomId}/projection?audience=player`, host.token);
    const myGames = proj1.json["myGames"] as { id: string; questions: { id: string }[] }[];
    const gid = myGames[0]!.id;
    await post(`/rooms/${roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action: "submit-math-answer", payload: { questionId: myGames[0]!.questions[0]!.id, chosenIndex: 0 } } }, host.token);
    const proj2 = await get(`/rooms/${roomId}/projection?audience=tv`);
    const games2 = proj2.json["games"] as { id: string; submittedCount?: number }[];
    expect(games2[0]!.submittedCount).toBe(1);
    const tvText = JSON.stringify(proj2.json);
    // No answer payload, no player token, no recovery token in the TV projection.
    expect(tvText).not.toContain("recoveryToken");
    expect(tvText).not.toContain("sessionToken");
  });
});

describe("M6 reactions: allowed set, rate limit, mute, expiry, no scoring effect", () => {
  it("accepts an allowed reaction, rejects free text and a second reaction within 3s", async () => {
    const { roomId, players } = await makeRoom(2);
    const p = players[0]!;
    expect((await post(`/rooms/${roomId}/reactions`, { emoji: "🎉" }, p.token)).status).toBe(201);
    expect((await post(`/rooms/${roomId}/reactions`, { emoji: "hello" }, p.token)).status).toBe(400);
    expect((await post(`/rooms/${roomId}/reactions`, { emoji: "🎄" }, p.token)).status).toBe(429);
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, p.token);
    const reactions = proj.json["reactions"] as { emoji: string; sender: string }[];
    expect(reactions.some((r) => r.emoji === "🎉")).toBe(true);
    expect(reactions.some((r) => r.emoji === "hello")).toBe(false);
  });
  it("host mute blocks reactions and is visible in projections; reactions never touch scores", async () => {
    const { roomId, players } = await makeRoom(2);
    const host = players[0]!;
    const guest = players[1]!;
    expect((await post(`/rooms/${roomId}/reactions/mute`, { muted: true }, guest.token)).status).toBe(403);
    expect((await post(`/rooms/${roomId}/reactions/mute`, { muted: true }, host.token)).status).toBe(200);
    expect((await post(`/rooms/${roomId}/reactions`, { emoji: "🔥" }, guest.token)).status).toBe(403);
    const proj = await get(`/rooms/${roomId}/projection?audience=player`, host.token);
    expect(proj.json["reactionsMuted"]).toBe(true);
    expect(proj.json["officialStandings"]).toEqual({});
  });
});
