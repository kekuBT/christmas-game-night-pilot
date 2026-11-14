// Stage 12.4 (docs/stage12/stage124.md): "Finish the Family Cup" with PROVISIONAL rules (D-S124-01) and a casual
// night's "End the night" (D-S124-02).
import { afterEach, describe, expect, it } from "vitest";
import { CUP_FINISH_RULES, RoomEngine, cupChampions, sharedRanks } from "../src/server/room.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

async function room(kind: "cup" | "casual", guests = 1): Promise<{ h: Harness; host: Player; others: Player[] }> {
  const h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
  await h.start();
  const r = await h.post("/rooms", { name: "Night", kind });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
  const host = await h.join("Keku", { host: true });
  const others: Player[] = [];
  for (const name of ["Amina", "Baraka"].slice(0, guests)) others.push(await h.join(name));
  return { h, host, others };
}
/** One trivia game: the first player answers everything right, the others everything wrong. */
async function trivia(h: Harness, players: Player[], official: boolean): Promise<string> {
  const s = await h.startGame(players[0]!, "trivia", { official, seed: 11 });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const gid = s.body["gameId"] as string;
  for (const p of players) await h.intent(p, gid, "briefing-ready", { ready: true });
  const qs = (h.game(gid).extra as { questions: { id: string; correctIndex: number }[] }).questions;
  for (const [i, p] of players.entries()) for (const q of qs) await h.intent(p, gid, "trivia-answer", { questionId: q.id, chosenIndex: i === 0 ? q.correctIndex : (q.correctIndex + 1) % 4 });
  expect(h.game(gid).status).toBe("finished");
  return gid;
}
const finish = (h: Harness, p: Player) => h.post(`/rooms/${h.roomId}/cup/finish`, {}, p.token);
const endNight = (h: Harness, p: Player) => h.post(`/rooms/${h.roomId}/night`, {}, p.token);
const day = (h: Harness, p: Player) => h.post(`/rooms/${h.roomId}/day`, {}, p.token);
const projection = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": p.token })).body;

describe("the champion rule (pure; PROVISIONAL, D-S124-01)", () => {
  it("shared ranks; the top eligible total above zero wins; equal tops share; nobody eligible means no champion", () => {
    expect(sharedRanks([{ id: "a", total: 5 }, { id: "b", total: 10 }, { id: "c", total: 10 }]).map((r) => [r.id, r.rank])).toEqual([["b", 1], ["c", 1], ["a", 3]]);
    expect(cupChampions([{ playerId: "a", total: 90, eligible: false }, { playerId: "b", total: 60, eligible: true }])).toEqual(["b"]); // the leader isn't eligible
    expect(cupChampions([{ playerId: "a", total: 60, eligible: true }, { playerId: "b", total: 60, eligible: true }])).toEqual(["a", "b"]);
    expect(cupChampions([{ playerId: "a", total: 60, eligible: false }])).toEqual([]);
    expect(cupChampions([{ playerId: "a", total: 0, eligible: true }])).toEqual([]);
    expect(CUP_FINISH_RULES).toMatchObject({ version: "provisional-1", finalDay: 7, ties: "shared" });
  });
});

describe("Finish the Family Cup (POST /rooms/:id/cup/finish)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("on Day 7, between games: records standings and the champion, once; then no official game starts; a restart keeps it", async () => {
    const r = await room("cup"); h = r.h;
    const both = [r.host, r.others[0]!];
    expect((await finish(h, r.others[0]!)).status).toBe(403);
    const early = await finish(h, r.host);
    expect([early.status, early.body["code"]]).toEqual([409, "NOT_FINAL_DAY"]);
    // Three Cup days with an official game each, so both players are eligible; Keku wins every one.
    for (let d = 1; d <= 3; d++) { await trivia(h, both, true); expect((await day(h, r.host)).status).toBe(200); }
    for (let d = 4; d < 7; d++) expect((await day(h, r.host)).status).toBe(200);
    expect(h.engine().championshipDay).toBe(7);
    // Mid-game: refused.
    const s = await h.startGame(r.host, "trivia", { official: false, seed: 3 });
    const mid = await finish(h, r.host);
    expect([mid.status, mid.body["code"]]).toEqual([409, "GAME_IN_PROGRESS"]);
    expect((await h.post(`/rooms/${h.roomId}/games/${s.body["gameId"]}/cancel`, {}, r.host.token)).status).toBe(200);
    const ok = await finish(h, r.host);
    expect([ok.status, ok.body["changed"]]).toEqual([200, true]);
    const f = (await projection(h, r.others[0]!))["cupFinished"] as { champions: string[]; standings: Json[]; day: number; rules: string };
    expect(f.champions).toEqual([r.host.playerId]);
    expect([f.day, f.rules]).toEqual([7, "provisional-1"]);
    expect(f.standings.map((x) => [x["displayName"], x["rank"], x["eligible"]])).toEqual([["Keku", 1, true], ["Amina", 2, true]]);
    expect(h.engine().ledger.filter((e) => e.type === "cup-finished")).toHaveLength(1);
    const again = await finish(h, r.host);
    expect([again.status, again.body["changed"]]).toEqual([200, false]);
    expect(h.engine().ledger.filter((e) => e.type === "cup-finished")).toHaveLength(1);
    // Its results stand: no official game; practice still works.
    const official = await h.startGame(r.host, "trivia", { official: true });
    expect([official.status, official.body["code"]]).toEqual([409, "CUP_FINISHED"]);
    expect((await h.startGame(r.host, "trivia", { official: false })).status).toBe(201);
    await h.restart();
    expect(h.engine().cupFinished?.champions).toEqual([r.host.playerId]);
  });

  it("a casual room can't be finished; a lineup's Official games become Practice when the Cup finishes", async () => {
    const c = await room("casual"); h = c.h;
    const refused = await finish(h, c.host);
    expect([refused.status, refused.body["code"]]).toEqual([409, "NOT_A_CUP"]);
    await h.dispose();
    const r = await room("cup"); h = r.h;
    for (let d = 1; d < 7; d++) await day(h, r.host);
    expect((await h.post(`/rooms/${h.roomId}/party`, { baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 30, items: [{ gameId: "trivia", official: true }] } }, r.host.token)).status).toBe(200);
    expect((await finish(h, r.host)).status).toBe(200);
    const items = ((await projection(h, r.host))["party"] as { lineup: { items: Json[] } }).lineup.items;
    expect(items.map((i) => i["official"])).toEqual([false]);
    // Nobody played: no champion, said plainly by the record (an empty list).
    expect(h.engine().cupFinished?.champions).toEqual([]);
  });
});

describe("End the night (POST /rooms/:id/night)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("host or cohost, once a game has finished; shown to everyone; saved with the room; a new game clears it", async () => {
    const r = await room("casual"); h = r.h;
    const none = await endNight(h, r.host);
    expect([none.status, none.body["code"]]).toEqual([409, "NO_GAMES_YET"]);
    await trivia(h, [r.host, r.others[0]!], false);
    expect((await endNight(h, r.others[0]!)).status).toBe(403);
    const ok = await endNight(h, r.host);
    expect([ok.status, ok.body["changed"]]).toEqual([200, true]);
    expect((await projection(h, r.others[0]!))["nightComplete"]).toMatchObject({ games: 1 });
    expect((await h.get(`/rooms/${h.roomId}/projection`)).body["nightComplete"]).toMatchObject({ games: 1 }); // the TV's view too
    expect((await endNight(h, r.host)).body["changed"]).toBe(false);
    // Saved with the room (a snapshot round trip; a restart drops every live connection, so nothing could start after it).
    expect(RoomEngine.fromJSON(JSON.parse(JSON.stringify(h.engine().toJSON()))).nightComplete).toMatchObject({ games: 1 });
    expect((await h.startGame(r.host, "trivia", { official: false })).status).toBe(201);
    expect(h.engine().nightComplete).toBeNull();
    expect((await projection(h, r.host))["nightComplete"]).toBeUndefined();
  });

  it("a Family Cup ends its days instead", async () => {
    const r = await room("cup"); h = r.h;
    const res = await endNight(h, r.host);
    expect([res.status, res.body["code"]]).toEqual([409, "NOT_A_CASUAL_ROOM"]);
  });
});
