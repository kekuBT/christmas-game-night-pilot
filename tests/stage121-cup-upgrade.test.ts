// Stage 12.1 (docs/stage12/stage121.md §2.2; D-S121-02): "Make it a Family Cup", a casual room's one-way, in-place
// upgrade. Host only, casual only, refused mid-game, idempotent, persisted; no score or standings change; official games
// count afterwards; the Cup's days work; the Memory Book keeps games played while casual casual.
import { afterEach, describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

async function casualRoom(): Promise<{ h: Harness; host: Player; guest: Player }> {
  const h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
  await h.start();
  const r = await h.post("/rooms", { name: "Friday", kind: "casual" });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
  const host = await h.join("Keku", { host: true });
  const guest = await h.join("Amina");
  return { h, host, guest };
}
/** A Trivia game both players answer in full (correct answers for the host), finished. */
async function trivia(h: Harness, host: Player, guest: Player, official: boolean): Promise<string> {
  const s = await h.startGame(host, "trivia", { official, seed: 7 });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const gid = s.body["gameId"] as string;
  for (const p of [host, guest]) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  const qs = (h.game(gid).extra as { questions: { id: string; correctIndex: number }[] }).questions;
  for (const q of qs) await h.intent(host, gid, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex });
  for (const q of qs) await h.intent(guest, gid, "trivia-answer", { questionId: q.id, chosenIndex: (q.correctIndex + 1) % 4 });
  expect(h.game(gid).status).toBe("finished");
  return gid;
}
const upgrade = (h: Harness, p: Player) => h.post(`/rooms/${h.roomId}/cup`, {}, p.token);
const projection = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": p.token })).body;
const finishOf = (h: Harness, gid: string) => h.engine().ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === gid)!.eventId;

describe("Make it a Family Cup (POST /rooms/:id/cup)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("only the host; a guest is refused and nothing changes", async () => {
    const r = await casualRoom(); h = r.h;
    const res = await upgrade(h, r.guest);
    expect([res.status, res.body["code"]]).toEqual([403, "NOT_HOST"]);
    expect((await projection(h, r.host))["roomKind"]).toBe("casual");
  });

  it("refused while a game is getting ready or playing; allowed once it has finished", async () => {
    const r = await casualRoom(); h = r.h;
    const s = await h.startGame(r.host, "trivia", { official: false, seed: 1 });
    expect(s.status).toBe(201);
    const res = await upgrade(h, r.host);
    expect([res.status, res.body["code"]]).toEqual([409, "GAME_IN_PROGRESS"]);
    expect(h.engine().kind).toBe("casual");
  });

  it("turns the room into a Cup in place: same code and players, day 1, casual games kept casual, idempotent", async () => {
    const r = await casualRoom(); h = r.h;
    const casualGame = await trivia(h, r.host, r.guest, false);
    const before = await projection(h, r.host);
    expect(before["roomKind"]).toBe("casual");
    expect(before["party"]).toBeDefined();
    const res = await upgrade(h, r.host);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, changed: true, roomKind: "cup", championshipDay: 1 });
    const after = await projection(h, r.host);
    expect(after["roomKind"]).toBe("cup");
    expect(after["joinCode"]).toBe(before["joinCode"]);
    expect((after["players"] as Json[]).map((p) => p["displayName"]).sort()).toEqual(["Amina", "Keku"]);
    expect(after["casualGameIds"]).toEqual([casualGame]);
    expect(after["cupSince"]).toMatchObject({ seq: expect.any(Number), at: expect.any(Number) });
    expect(after["party"]).toBeUndefined(); // Quick Party is a casual-room feature
    expect(after["championship"]).toEqual([]); // the casual game was never official: no standings
    const started = h.engine().ledger.filter((e) => e.type === "cup-started");
    expect(started).toHaveLength(1);
    expect(started[0]!.actor).toBe(r.host.playerId);
    // Asking again changes nothing.
    const again = await upgrade(h, r.host);
    expect([again.status, again.body["changed"]]).toEqual([200, false]);
    expect(h.engine().ledger.filter((e) => e.type === "cup-started")).toHaveLength(1);
  });

  it("after the upgrade, official games count, days advance, and the Cup's rules can still be set until its first game", async () => {
    const r = await casualRoom(); h = r.h;
    // Official games are refused in a casual room.
    expect((await h.startGame(r.host, "trivia", { official: true })).status).not.toBe(201);
    await trivia(h, r.host, r.guest, false);
    expect((await upgrade(h, r.host)).status).toBe(200);
    // The casual game doesn't freeze the new Cup's rules.
    expect(() => h!.engine().configureCup({})).not.toThrow();
    const official = await trivia(h, r.host, r.guest, true);
    expect(h.game(official).official).toBe(true);
    const champ = (await projection(h, r.host))["championship"] as Json[];
    expect(champ.length).toBe(2);
    expect(() => h!.engine().configureCup({})).toThrow(/fixed once its first game/);
    const day = await h.post(`/rooms/${h.roomId}/day`, {}, r.host.token);
    expect(day.body["day"]).toBe(2);
  });

  it("the stored up-next plan becomes Official for an official-eligible game (a new Cup defaults to Official); practice-only stays practice", async () => {
    const r = await casualRoom(); h = r.h;
    expect((await h.post(`/rooms/${h.roomId}/plan`, { gameId: "trivia", official: false }, r.host.token)).status).toBe(200);
    // A casual room can't plan an official game.
    expect((await h.post(`/rooms/${h.roomId}/plan`, { gameId: "trivia", official: true }, r.host.token)).status).toBe(400);
    expect((await upgrade(h, r.host)).status).toBe(200);
    expect((await projection(h, r.guest))["upNext"]).toEqual({ gameId: "trivia", official: true });
    // The host can still choose Practice afterwards, and asking to upgrade again doesn't flip it back.
    expect((await h.post(`/rooms/${h.roomId}/plan`, { gameId: "trivia", official: false }, r.host.token)).status).toBe(200);
    await upgrade(h, r.host);
    expect((await projection(h, r.guest))["upNext"]).toEqual({ gameId: "trivia", official: false });
    // A practice-only game planned while casual stays practice.
    const r2 = await casualRoom();
    try {
      expect((await r2.h.post(`/rooms/${r2.h.roomId}/plan`, { gameId: "majority-rules", official: false }, r2.host.token)).status).toBe(200);
      expect((await upgrade(r2.h, r2.host)).status).toBe(200);
      expect((await projection(r2.h, r2.guest))["upNext"]).toEqual({ gameId: "majority-rules", official: false });
    } finally { await r2.h.dispose(); }
  });

  it("survives a restart: still a Cup, with when it started and its casual games", async () => {
    const r = await casualRoom(); h = r.h;
    const g = await trivia(h, r.host, r.guest, false);
    await upgrade(h, r.host);
    const since = h.engine().cupSince;
    await h.restart();
    expect(h.engine().kind).toBe("cup");
    expect(h.engine().cupSince).toEqual(since);
    expect(h.engine().casualGameIds).toEqual([g]);
    expect((await projection(h, r.host))["roomKind"]).toBe("cup");
  });

  it("the Memory Book keeps a game played while casual casual (no Day), and files Cup games under their day", async () => {
    const r = await casualRoom(); h = r.h;
    const casualGame = await trivia(h, r.host, r.guest, false);
    await upgrade(h, r.host);
    const cupGame = await trivia(h, r.host, r.guest, true);
    const add = (gid: string, text: string) => h!.post(`/rooms/${h!.roomId}/memory`, { day: 1, text, sourceEventIds: [finishOf(h!, gid)] }, r.guest.token);
    const e1 = await add(casualGame, "From the casual round");
    const e2 = await add(cupGame, "From the first official game");
    expect(e1.body["source"]).toMatchObject({ mode: "casual" });
    expect((e1.body["source"] as Json)["days"]).toBeUndefined();
    expect(e2.body["source"]).toMatchObject({ mode: "cup", days: [1] });
    for (const e of [e1, e2]) await h.post(`/rooms/${h.roomId}/memory/${e.body["id"]}/approve`, {}, r.host.token);
    const md = (await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": r.host.token })).body["markdown"] as string;
    expect(md).toMatch(/^## Trivia Showdown\nNote: From the casual round$/m);
    expect(md).toMatch(/^## Day 1\nNote: From the first official game$/m);
    // An older entry (no recorded source) about the casual game, restored: still casual, from the room's citation.
    const live = h.server["books"].get(h.roomId)!;
    delete live.entries.find((x: { id: string }) => x.id === e1.body["id"])!.source;
    const md2 = (await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": r.host.token })).body["markdown"] as string;
    expect(md2).toMatch(/^## Trivia Showdown\nNote: From the casual round$/m);
  });
});

describe("upgradeToCup (engine)", () => {
  it("a room created as a Cup is already one (no change); a solo room can't become one", () => {
    const cup = new RoomEngine("c", { kind: "cup" });
    const { player } = cup.join("Keku", { asHost: true });
    expect(cup.upgradeToCup(player.id)).toEqual({ changed: false });
    expect(cup.cupSince).toBeNull();
    const solo = new RoomEngine("s", { kind: "solo" });
    const me = solo.join("Zoë", { asHost: true }).player;
    expect(() => solo.upgradeToCup(me.id)).toThrow(/Only a casual room/);
  });
  it("a snapshot from before Stage 12.1 restores with no upgrade fields", () => {
    const casual = new RoomEngine("c", { kind: "casual" });
    casual.join("Keku", { asHost: true });
    const json = JSON.parse(JSON.stringify(casual.toJSON())) as Record<string, unknown>;
    expect(json["cupSince"]).toBeUndefined();
    const back = RoomEngine.fromJSON(json);
    expect([back.kind, back.cupSince, back.casualGameIds]).toEqual(["casual", null, []]);
  });
});
