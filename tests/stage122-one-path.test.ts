// Stage 12.2 (docs/stage12/stage122.md): "Back to a casual game night" (the undo of Make it a Family Cup, D-S122-01),
// a room's starting content from the host's pinned look (D-S122-04), and the /tv address (D-S122-03).
import { afterEach, describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { isClientPath } from "../src/shared/clientRoutes.js";
import { entryMode } from "../src/shared/memoryPresent.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

async function casualRoom(body: Record<string, unknown> = {}): Promise<{ h: Harness; host: Player; guest: Player }> {
  const h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
  await h.start();
  const r = await h.post("/rooms", { name: "Friday", kind: "casual", ...body });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
  const host = await h.join("Keku", { host: true });
  const guest = await h.join("Amina");
  return { h, host, guest };
}
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
const undo = (h: Harness, p: Player) => h.post(`/rooms/${h.roomId}/casual`, {}, p.token);
const projection = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": p.token })).body;
const finishOf = (h: Harness, gid: string) => h.engine().ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === gid)!.eventId;

describe("Back to a casual game night (POST /rooms/:id/casual)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("undoes the upgrade: casual again with the same code and players, casual features back, logged once, idempotent", async () => {
    const r = await casualRoom(); h = r.h;
    await trivia(h, r.host, r.guest, false);
    expect((await upgrade(h, r.host)).status).toBe(200);
    const before = await projection(h, r.host);
    expect([before["roomKind"], before["party"]]).toEqual(["cup", undefined]);
    const res = await undo(h, r.host);
    expect([res.status, res.body["changed"], res.body["roomKind"]]).toEqual([200, true, "casual"]);
    const after = await projection(h, r.host);
    expect(after["roomKind"]).toBe("casual");
    expect(after["joinCode"]).toBe(before["joinCode"]);
    expect((after["players"] as Json[]).length).toBe(2);
    expect(after["cupSince"]).toBeUndefined();
    expect(after["party"]).toBeDefined(); // Quick Party is back
    expect(after["cupUndone"]).toMatchObject({ games: 1, seq: expect.any(Number) });
    expect(h.engine().ledger.filter((e) => e.type === "cup-undone")).toHaveLength(1);
    const again = await undo(h, r.host);
    expect([again.status, again.body["changed"]]).toEqual([200, false]);
    expect(h.engine().ledger.filter((e) => e.type === "cup-undone")).toHaveLength(1);
    // Official games are refused again, as in any casual room.
    expect((await h.startGame(r.host, "trivia", { official: true })).status).not.toBe(201);
  });

  it("refusals: a guest; a casual room is a no-op; a Cup created as one; mid-game; after an official game finished", async () => {
    const r = await casualRoom(); h = r.h;
    expect((await undo(h, r.host)).body["changed"]).toBe(false); // already casual
    await upgrade(h, r.host);
    const g = await undo(h, r.guest);
    expect([g.status, g.body["code"]]).toEqual([403, "NOT_HOST"]);
    const s = await h.startGame(r.host, "trivia", { official: true, seed: 3 });
    expect(s.status).toBe(201);
    const mid = await undo(h, r.host);
    expect([mid.status, mid.body["code"]]).toEqual([409, "GAME_IN_PROGRESS"]);
    // Finish that official game: now the Cup's results stand.
    const gid = s.body["gameId"] as string;
    for (const p of [r.host, r.guest]) await h.intent(p, gid, "briefing-ready", { ready: true });
    const qs = (h.game(gid).extra as { questions: { id: string; correctIndex: number }[] }).questions;
    for (const p of [r.host, r.guest]) for (const q of qs) await h.intent(p, gid, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect(h.game(gid).status).toBe("finished");
    const late = await undo(h, r.host);
    expect([late.status, late.body["code"]]).toEqual([409, "OFFICIAL_GAME_PLAYED"]);
    expect(h.engine().kind).toBe("cup");
  });

  it("a practice game played during the short Cup becomes a casual game, and the Memory Book drops its 'Day 1'", async () => {
    const r = await casualRoom(); h = r.h;
    await upgrade(h, r.host);
    const practice = await trivia(h, r.host, r.guest, false);
    const e = await h.post(`/rooms/${h.roomId}/memory`, { day: 1, text: "From the practice round", sourceEventIds: [finishOf(h, practice)] }, r.guest.token);
    expect(e.body["source"]).toMatchObject({ mode: "cup", days: [1] }); // recorded while the room was a Cup
    await h.post(`/rooms/${h.roomId}/memory/${e.body["id"]}/approve`, {}, r.host.token);
    expect((await undo(h, r.host)).status).toBe(200);
    expect(h.engine().casualGameIds).toContain(practice);
    const md = (await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": r.host.token })).body["markdown"] as string;
    expect(md).toMatch(/^## Trivia Showdown\nNote: From the practice round$/m);
    expect(md).not.toMatch(/Day 1/);
  });

  it("the stored up-next plan stops being official; a restart keeps the room casual with its undo note", async () => {
    const r = await casualRoom(); h = r.h;
    await upgrade(h, r.host);
    expect((await h.post(`/rooms/${h.roomId}/plan`, { gameId: "trivia", official: true }, r.host.token)).status).toBe(200);
    await undo(h, r.host);
    expect((await projection(h, r.guest))["upNext"]).toEqual({ gameId: "trivia", official: false });
    const note = h.engine().cupUndone;
    await h.restart();
    expect([h.engine().kind, h.engine().cupSince, h.engine().cupUndone]).toEqual(["casual", null, note]);
    // Making it a Family Cup again works, with a fresh start, and clears the undo note.
    expect((await upgrade(h, r.host)).body["changed"]).toBe(true);
    expect(h.engine().cupUndone).toBeNull();
  });
});

describe("undoCupUpgrade (engine)", () => {
  it("a Cup created as one can't go back; a solo room can't either", () => {
    const cup = new RoomEngine("c", { kind: "cup" });
    const host = cup.join("Keku", { asHost: true }).player;
    expect(() => cup.undoCupUpgrade(host.id)).toThrow(/created as a Family Cup/);
    const solo = new RoomEngine("s", { kind: "solo" });
    const me = solo.join("Zoë", { asHost: true }).player;
    expect(() => solo.undoCupUpgrade(me.id)).toThrow(/Only a Family Cup/);
  });
});

describe("a room's starting content from the host's look (POST /rooms contentSeason)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });
  it("a casual room created with christmas deals Christmas; without it, Everyday; a Cup ignores it", async () => {
    const r = await casualRoom({ contentSeason: "christmas" }); h = r.h;
    expect((await projection(h, r.host))["contentSeason"]).toBe("christmas");
    const plain = await h.post("/rooms", { name: "Plain", kind: "casual" });
    expect(h.server["rooms"].get(plain.body["roomId"] as string)!.contentSeason).toBe("everyday");
    const cup = await h.post("/rooms", { name: "Cup", kind: "cup", contentSeason: "christmas" });
    expect(h.server["rooms"].get(cup.body["roomId"] as string)!.contentSeason).toBe("everyday");
    expect((await h.post("/rooms", { name: "Bad", kind: "casual", contentSeason: "halloween" })).status).toBe(400);
  });
});

describe("the TV address and the book's era rule", () => {
  it("/tv is an app path (a reload or a typed address works); /tv/x is not", () => {
    for (const p of ["/tv", "/tv/"]) expect(isClientPath(p), p).toBe(true);
    for (const p of ["/tv/x", "/tvs"]) expect(isClientPath(p), p).toBe(false);
  });
  it("entryMode: the room's current casual era wins over a recorded cup mode; otherwise the recorded mode", () => {
    const e = { sourceEventIds: ["ev"], source: { mode: "cup" as const, days: [1] } };
    expect(entryMode(e as never, { roomKind: "casual", sourceGames: () => [{ mode: "casual" }] })).toBe("casual");
    expect(entryMode(e as never, { roomKind: "cup", sourceGames: () => [{ mode: "cup" }] })).toBe("cup");
    expect(entryMode(e as never, { roomKind: "cup", sourceGames: () => [{}] })).toBe("cup");
    expect(entryMode({ sourceEventIds: [], source: { mode: "casual" } } as never, { roomKind: "cup", sourceGames: () => [{ mode: "cup" }] })).toBe("casual");
  });
});
