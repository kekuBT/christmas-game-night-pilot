// Stage 10.4 repair (review 6842636842; D-S104-06): a Memory Book change is live only once it is on disk.
//
// The review found that a save added its entry and its request key to the live book before writing it. When the write
// failed the reply was 500, yet the live book kept both: a same-key retry then answered 200 from memory with nothing on
// disk, and the note was gone after a restart. Every Memory Book change (a save, a manual Add, an approval, a
// revocation) is now made on a staged copy, written, and only then published. These tests fail the disk write on
// purpose and check what is visible, approvable and retryable, before and after a restart.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SPECTRUM_ROUNDS, type SpectrumState } from "../src/games/modules/spectrum.js";
import { RoomStore } from "../src/server/persistence.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

const DISK_FULL = () => { throw new Error("simulated disk write failure"); };
const KEY = "save-0001-aaaa";

async function casualRoom(h: Harness): Promise<void> {
  const r = await h.post("/rooms", { name: "Durable night", kind: "casual" });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
}
async function start(h: Harness, host: Player, gameId: string, seats: Player[]): Promise<string> {
  const started = await h.startGame(host, gameId, { official: false });
  expect(started.status).toBe(201);
  const gid = started.body["gameId"] as string;
  for (const p of seats) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  return gid;
}
const finishOf = (h: Harness, gid: string) => h.engine().ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === gid)!;
const save = (h: Harness, p: Player, body: Json) => h.post(`/rooms/${h.roomId}/memory`, { day: 1, ...body }, p.token);
const book = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": p.token })).body as unknown as Json[];
const exported = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": p.token })).body["markdown"] as string;
const approve = (h: Harness, p: Player, id: string) => h.post(`/rooms/${h.roomId}/memory/${id}/approve`, {}, p.token);
const revoke = (h: Harness, p: Player, id: string) => h.post(`/rooms/${h.roomId}/memory/${id}/revoke`, {}, p.token);
const scoreState = (h: Harness) => JSON.stringify({ ledger: h.engine().ledger, games: [...h.engine().games.values()].map((g) => [g.id, g.status, g.outcome]) });

describe("Stage 10.4 repair: a Memory Book change is live only once it is on disk", () => {
  let h: Harness | null = null;
  afterEach(async () => { vi.restoreAllMocks(); await h?.dispose(); h = null; });

  /** Keku (host) and Amina in a casual room; a Jebena match Amina leaves, so Keku wins. */
  async function jebenaFinished() {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    await casualRoom(h);
    const host = await h.join("Keku", { host: true });
    const amina = await h.join("Amina");
    const jr = await start(h, host, "jebena-rush", [host, amina]);
    expect((await h.intent(amina, jr, "abstain", {}))["accepted"]).toBe(true);
    expect(h.game(jr).status).toBe("finished");
    return { h, host, amina, jr };
  }

  it("one failed write, then a retry: nothing is visible or approvable after the failure; the retry persists exactly one pending entry that survives a restart", async () => {
    const { h, host, amina, jr } = await jebenaFinished();
    const before = scoreState(h);
    const body = { fromGame: jr, text: "Keku kept the jebena warm", requestId: KEY };
    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);

    const first = await save(h, amina, body);
    expect(first.status).toBe(500);
    // The failure left the live book as it is on disk: empty, nothing to approve, nothing exported.
    expect(await book(h, amina)).toEqual([]);
    expect((await approve(h, host, "book-1")).status).toBe(400);
    expect(await exported(h, host)).not.toContain("Keku kept the jebena warm");
    expect(first.body["error"]).toMatch(/Memory Book couldn't be saved, so nothing changed/);

    // The same request again, once the disk works: written now, so 201, and the first id (the failure used none).
    const retry = await save(h, amina, body);
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ id: "book-1", approved: false, addedBy: amina.playerId, sourceEventIds: [finishOf(h, jr).eventId] });

    await h.restart();
    const restored = await book(h, amina);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: "book-1", text: "Keku kept the jebena warm", approved: false, sourceEventIds: [finishOf(h, jr).eventId] });
    // The key came back with it: the same request is still the same entry.
    const afterRestart = await save(h, amina, body);
    expect([afterRestart.status, afterRestart.body["id"]]).toEqual([200, "book-1"]);
    expect(await book(h, amina)).toHaveLength(1);
    expect(scoreState(h)).toBe(before);
  });

  it("repeated failed writes keep answering an error and never make the note visible, approvable or exported; the first write that works saves it once", async () => {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    await casualRoom(h);
    const host = await h.join("Keku", { host: true });
    const amina = await h.join("Amina");
    // A completed Spectrum match (the team-result path).
    const sp = await start(h, host, "spectrum", [host, amina]);
    const byId = new Map([host, amina].map((s) => [s.playerId, s]));
    for (let i = 0; i < SPECTRUM_ROUNDS; i++) {
      const g = h.game(sp);
      const st = g.extra as SpectrumState;
      const r = st.rounds[st.round]!;
      expect((await h.intent(byId.get(r.giver!)!, sp, "spectrum-clue", { round: st.round + 1, text: "a warm bath", phaseKey: g.phaseKey }))["accepted"]).toBe(true);
      for (const pid of [...r.required]) expect((await h.intent(byId.get(pid)!, sp, "spectrum-guess", { round: st.round + 1, value: r.target, phaseKey: h.game(sp).phaseKey }))["accepted"]).toBe(true);
      h.clock.advance(h.game(sp).phaseDeadlineAt! - h.clock.now() + 1);
      h.lifecycleTick();
    }
    expect(h.game(sp).status).toBe("finished");
    const before = scoreState(h);
    const body = { fromGame: sp, text: "Every round on target", requestId: KEY };

    const disk = vi.spyOn(RoomStore.prototype, "saveBook").mockImplementation(DISK_FULL);
    for (let i = 0; i < 3; i++) {
      const r = await save(h, amina, body);
      expect(r.status).toBe(500);
      expect(await book(h, amina)).toEqual([]);
      expect(await book(h, host)).toEqual([]);
      expect((await approve(h, host, "book-1")).status).toBe(400);
    }
    expect(await exported(h, host)).toContain("No approved highlights yet.");
    expect(disk).toHaveBeenCalledTimes(3);

    disk.mockRestore();
    const ok = await save(h, amina, body);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ id: "book-1", approved: false, team: { gameInstanceId: sp, end: "completed" } });
    await h.restart();
    const restored = await book(h, host);
    expect(restored.map((e) => [e["id"], e["text"], e["approved"]])).toEqual([["book-1", "Every round on target", false]]);
    expect(scoreState(h)).toBe(before);
  });

  it("a retry after a committed save whose reply was lost returns that same entry, before and after a restart, and adds nothing", async () => {
    const { h, amina, jr } = await jebenaFinished();
    const body = { fromGame: jr, text: "The reply never reached my phone", requestId: KEY };
    const committed = await save(h, amina, body); // written; the phone never hears this reply
    expect(committed.status).toBe(201);
    const retry = await save(h, amina, body);
    expect([retry.status, retry.body["id"]]).toEqual([200, committed.body["id"]]);
    await h.restart();
    const again = await save(h, amina, body);
    expect([again.status, again.body["id"]]).toEqual([200, committed.body["id"]]);
    expect((await book(h, amina)).map((e) => e["id"])).toEqual([committed.body["id"]]);
  });

  it("approval and revocation follow the same rule: a failed write changes neither what's shown nor what's exported, before or after a restart", async () => {
    const { h, host, amina, jr } = await jebenaFinished();
    const saved = await save(h, amina, { fromGame: jr, text: "Pending until Keku says so", requestId: KEY });
    expect(saved.status).toBe(201);
    const id = saved.body["id"] as string;

    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);
    expect((await approve(h, host, id)).status).toBe(500);
    expect((await book(h, host))[0]).toMatchObject({ id, approved: false });
    expect(await exported(h, host)).not.toContain("Pending until Keku says so");
    await h.restart();
    expect((await book(h, host))[0]).toMatchObject({ id, approved: false });

    expect((await approve(h, host, id)).status).toBe(200);
    expect(await exported(h, host)).toContain("Pending until Keku says so");

    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);
    expect((await revoke(h, host, id)).status).toBe(500);
    expect((await book(h, host))[0]).toMatchObject({ id, approved: true, approvedBy: host.playerId });
    expect(await exported(h, host)).toContain("Pending until Keku says so");
    await h.restart();
    expect((await book(h, host))[0]).toMatchObject({ id, approved: true });
  });

  it("manual Add shares the rule: a failed Add leaves earlier entries exactly as they were and adds nothing; the next Add is written once", async () => {
    const { h, host, amina, jr } = await jebenaFinished();
    const fin = finishOf(h, jr).eventId;
    const earlier = await save(h, host, { sourceEventIds: [fin], text: "An earlier note" });
    expect(earlier.status).toBe(201);
    expect((await approve(h, host, earlier.body["id"] as string)).status).toBe(200);
    const snapshot = await book(h, amina);

    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);
    const failed = await save(h, amina, { sourceEventIds: [fin], text: "Lost to a full disk" });
    expect(failed.status).toBe(500);
    expect(await book(h, amina)).toEqual(snapshot);

    const added = await save(h, amina, { sourceEventIds: [fin], text: "Written this time" });
    expect([added.status, added.body["id"]]).toEqual([201, "book-2"]);
    await h.restart();
    expect((await book(h, amina)).map((e) => [e["id"], e["text"], e["approved"]])).toEqual([
      ["book-1", "An earlier note", true],
      ["book-2", "Written this time", false],
    ]);
  });
});
