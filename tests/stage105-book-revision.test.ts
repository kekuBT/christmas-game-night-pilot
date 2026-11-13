// Stage 10.5 (docs/stage10/stage105.md; D-S105-01, D-S105-02): the Memory Book's revision, and who hears it moved.
//
// The revision is durable, separate from the ledger's seq, and moves only when a change commits (inside Stage 10.4's
// staged write). Members' projections carry it and a revision-only frame tells this room's current members after each
// commit; the TV, spectators and other rooms hear nothing, and no frame carries a note. The data itself is fetched,
// authenticated, as a snapshot.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { MemoryBook } from "../src/server/memorybook.js";
import { RoomStore } from "../src/server/persistence.js";
import { FakeClock, Harness, waitFor, type Json, type Player } from "./helpers/harness.js";

const NOTE = "A note that must never travel on a socket";
const DISK_FULL = () => { throw new Error("simulated disk write failure"); };

async function casualRoom(h: Harness, name = "Live book night"): Promise<{ roomId: string; joinCode: string; hostClaimToken: string }> {
  const r = await h.post("/rooms", { name, kind: "casual" });
  return { roomId: r.body["roomId"] as string, joinCode: r.body["joinCode"] as string, hostClaimToken: r.body["hostClaimToken"] as string };
}
/** Every frame a socket receives, by kind. */
function listen(ws: WebSocket): Json[] {
  const frames: Json[] = [];
  ws.on("message", (d) => frames.push(JSON.parse(d.toString()) as Json));
  return frames;
}
const bookFrames = (frames: Json[]) => frames.filter((f) => f["kind"] === "book");
const raw = (frames: Json[]) => frames.map((f) => JSON.stringify(f)).join("\n");
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("MemoryBook.revision (pure)", () => {
  it("starts at 0, rides along in toJSON, clone and fromJSON; an old or malformed book restores as 0", () => {
    const b = new MemoryBook();
    expect(b.revision).toBe(0);
    b.bumpRevision(); b.bumpRevision();
    expect(b.toJSON()["revision"]).toBe(2);
    const c = b.clone();
    c.bumpRevision();
    expect([b.revision, c.revision]).toEqual([2, 3]); // the clone is independent
    expect(MemoryBook.fromJSON(b.toJSON()).revision).toBe(2);
    expect(MemoryBook.fromJSON({ entries: [], next: 1 }).revision).toBe(0); // a book from before Stage 10.5
    for (const bad of [-3, 1.5, "7", null, Number.MAX_VALUE]) expect(MemoryBook.fromJSON({ entries: [], next: 1, revision: bad }).revision).toBe(0);
  });
});

describe("Stage 10.5: the book revision over HTTP and the socket", () => {
  let h: Harness | null = null;
  const extra: WebSocket[] = [];
  afterEach(async () => { vi.restoreAllMocks(); for (const ws of extra.splice(0)) ws.terminate(); await h?.dispose(); h = null; });

  /** Keku (host), Amina and Baraka in a casual room, each with a live socket; a Jebena match Amina leaves. */
  async function room() {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    const r = await casualRoom(h);
    Object.assign(h, r);
    const host = await h.join("Keku", { host: true });
    const amina = await h.join("Amina");
    const started = await h.startGame(host, "jebena-rush", { official: false });
    expect(started.status).toBe(201);
    const jr = started.body["gameId"] as string;
    for (const p of [host, amina]) expect((await h.intent(p, jr, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
    expect((await h.intent(amina, jr, "abstain", {}))["accepted"]).toBe(true);
    expect(h.game(jr).status).toBe("finished");
    const baraka = await h.join("Baraka"); // a third member, joined after the match
    const fin = h.engine().ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === jr)!.eventId;
    return { h, host, amina, baraka, jr, fin };
  }
  const snap = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/memory?revision=1`, { "x-session-token": p.token })).body as { revision: number; entries: Json[] };
  const save = (h: Harness, p: Player, body: Json) => h.post(`/rooms/${h.roomId}/memory`, { day: 1, ...body }, p.token);

  it("each committed change raises it by exactly one (save, manual Add, approve, revoke); the snapshot and export carry it; it survives a restart", async () => {
    const { h, host, amina, jr, fin } = await room();
    expect(await snap(h, amina)).toEqual({ revision: 0, entries: [] });
    expect((await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": amina.token })).body).toEqual([]); // the plain list, unchanged
    const a = await save(h, amina, { fromGame: jr, text: "Saved from the results", requestId: "live-0001-aaaa" });
    expect(a.status).toBe(201);
    expect((await snap(h, amina)).revision).toBe(1);
    expect((await save(h, host, { sourceEventIds: [fin], text: "Added by hand" })).status).toBe(201);
    expect((await snap(h, amina)).revision).toBe(2);
    expect((await h.post(`/rooms/${h.roomId}/memory/${a.body["id"]}/approve`, {}, host.token)).status).toBe(200);
    expect((await snap(h, amina)).revision).toBe(3);
    expect((await h.post(`/rooms/${h.roomId}/memory/${a.body["id"]}/revoke`, {}, host.token)).status).toBe(200);
    const s = await snap(h, amina);
    expect(s.revision).toBe(4);
    expect(s.entries.map((e) => [e["text"], e["approved"]])).toEqual([["Saved from the results", false], ["Added by hand", false]]);
    expect((await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": amina.token })).body).toMatchObject({ revision: 4 });
    await h.restart();
    expect(await snap(h, amina)).toEqual(s);
  });

  it("never moves on a failed write, a refusal, an idempotent repeat, a read or an export", async () => {
    const { h, host, amina, baraka, jr } = await room();
    const body = { fromGame: jr, text: "Once", requestId: "live-0002-bbbb" };
    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);
    expect((await save(h, amina, body)).status).toBe(500);
    expect((await snap(h, amina)).revision).toBe(0);
    expect((await save(h, amina, body)).status).toBe(201);
    expect((await snap(h, amina)).revision).toBe(1);
    expect((await save(h, amina, body)).status).toBe(200); // the same request again
    expect((await save(h, amina, { ...body, text: "Changed" })).status).toBe(409); // ATTEMPT_MISMATCH
    expect((await save(h, amina, { fromGame: jr, text: "" })).status).toBe(400); // NOTE_REQUIRED
    expect((await h.post(`/rooms/${h.roomId}/memory/book-9/approve`, {}, host.token)).status).toBe(400); // no such entry
    expect((await h.post(`/rooms/${h.roomId}/memory/book-1/approve`, {}, baraka.token)).status).toBe(403); // not host or cohost
    for (let i = 0; i < 3; i++) { await snap(h, amina); await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": host.token }); }
    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);
    expect((await h.post(`/rooms/${h.roomId}/memory/book-1/approve`, {}, host.token)).status).toBe(500);
    expect((await snap(h, amina)).revision).toBe(1);
  });

  it("an old book on disk (no revision) loads as 0, and its first change makes it 1", async () => {
    const { h, host, amina, fin } = await room();
    expect((await save(h, host, { sourceEventIds: [fin], text: "Before Stage 10.5" })).status).toBe(201);
    await h.stop();
    const path = join(h.dataDir, `${h.roomId}.book.json`);
    const old = JSON.parse(readFileSync(path, "utf8")) as Json;
    delete old["revision"];
    writeFileSync(path, JSON.stringify(old));
    await h.start();
    const s = await snap(h, amina);
    expect(s.revision).toBe(0);
    expect(s.entries.map((e) => e["text"])).toEqual(["Before Stage 10.5"]);
    expect((await h.post(`/rooms/${h.roomId}/memory/book-1/approve`, {}, host.token)).status).toBe(200);
    expect((await snap(h, amina)).revision).toBe(1);
  });

  it("the frame reaches this room's current members only, carries the revision and nothing else, and comes only after a commit", async () => {
    const { h, host, amina, baraka, jr } = await room();
    const fk = listen(host.ws!), fa = listen(amina.ws!), fb = listen(baraka.ws!);
    // The room's TV, a spectator, and a member of another room, each with a live socket. Each is listened to as soon
    // as it exists, so its first frame (sent on connect) can't arrive before anyone is listening.
    const open = (url: string, protocols: string[] = []) => { const ws = new WebSocket(url, protocols); extra.push(ws); return { ws, frames: listen(ws) }; };
    const tv = open(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=tv`);
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const sws = open(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=spectator`, [`cgn-spectator-${spec.body["spectatorToken"]}`]);
    const other = await casualRoom(h, "Next door");
    const zed = await h.post("/rooms/join-by-code", { joinCode: other.joinCode, displayName: "Zed", asHost: true, hostClaimToken: other.hostClaimToken });
    const ows = open(`ws://localhost:${h.port}/?roomId=${other.roomId}&audience=player`, [`cgn-session-${zed.body["sessionToken"]}`]);
    const ft = tv.frames, fs = sws.frames, fo = ows.frames;
    await waitFor(() => ft.length > 0 && fs.length > 0 && fo.length > 0);

    // A failed write and a refusal: nobody hears anything.
    vi.spyOn(RoomStore.prototype, "saveBook").mockImplementationOnce(DISK_FULL);
    expect((await save(h, amina, { fromGame: jr, text: NOTE, requestId: "live-0003-cccc" })).status).toBe(500);
    expect((await save(h, amina, { fromGame: jr, text: "" })).status).toBe(400);
    await settle();
    expect([fk, fa, fb, ft, fs, fo].map((f) => bookFrames(f).length)).toEqual([0, 0, 0, 0, 0, 0]);

    // The commit: every member of this room hears { kind: "book", revision: 1 }, and only that.
    expect((await save(h, amina, { fromGame: jr, text: NOTE, requestId: "live-0003-cccc" })).status).toBe(201);
    await waitFor(() => bookFrames(fk).length === 1 && bookFrames(fa).length === 1 && bookFrames(fb).length === 1);
    for (const f of [fk, fa, fb]) expect(bookFrames(f)).toEqual([{ kind: "book", revision: 1 }]);
    // An idempotent repeat: no second frame.
    expect((await save(h, amina, { fromGame: jr, text: NOTE, requestId: "live-0003-cccc" })).status).toBe(200);
    await settle();
    expect(bookFrames(fk).length).toBe(1);
    // The TV, the spectator and the other room heard nothing, and no socket ever carried the note.
    expect([ft, fs, fo].map((f) => bookFrames(f).length)).toEqual([0, 0, 0]);
    for (const f of [fk, fa, fb, ft, fs, fo]) expect(raw(f)).not.toContain(NOTE);
    // A book change sends no projection broadcast: the TV got no new projection from it.
    const tvProjections = ft.filter((f) => f["kind"] === "projection").length;
    expect((await h.post(`/rooms/${h.roomId}/memory/book-1/approve`, {}, host.token)).status).toBe(200);
    await waitFor(() => bookFrames(fk).length === 2);
    expect(bookFrames(fk)[1]).toEqual({ kind: "book", revision: 2 });
    expect(ft.filter((f) => f["kind"] === "projection").length).toBe(tvProjections);
  });

  it("members' projections carry memoryRevision; the TV's and a spectator's don't; a book change moves no ledger seq or room rev", async () => {
    const { h, host, amina, jr } = await room();
    const before = await h.projection(amina);
    expect(before["memoryRevision"]).toBe(0);
    expect((await save(h, amina, { fromGame: jr, text: "Counted", requestId: "live-0004-dddd" })).status).toBe(201);
    const after = await h.projection(amina);
    expect(after["memoryRevision"]).toBe(1);
    expect((await h.projection(host))["memoryRevision"]).toBe(1);
    expect([after["seq"], after["rev"]]).toEqual([before["seq"], before["rev"]]);
    expect(h.engine().ledger.some((e) => JSON.stringify(e).includes("Counted"))).toBe(false);
    const tv = await h.tv();
    expect("memoryRevision" in tv).toBe(false);
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const sp = (await h.get(`/rooms/${h.roomId}/projection?audience=spectator`, { "x-spectator-token": spec.body["spectatorToken"] as string })).body;
    expect("memoryRevision" in sp).toBe(false);
  });

  it("two rooms keep separate revisions; the snapshot is for this room's members only", async () => {
    const { h, amina, jr } = await room();
    const other = await casualRoom(h, "Next door");
    const zed = await h.post("/rooms/join-by-code", { joinCode: other.joinCode, displayName: "Zed", asHost: true, hostClaimToken: other.hostClaimToken });
    expect((await save(h, amina, { fromGame: jr, text: "Here", requestId: "live-0005-eeee" })).status).toBe(201);
    expect((await h.get(`/rooms/${other.roomId}/memory?revision=1`, { "x-session-token": zed.body["sessionToken"] as string })).body).toEqual({ revision: 0, entries: [] });
    expect((await h.get(`/rooms/${h.roomId}/memory?revision=1`, { "x-session-token": zed.body["sessionToken"] as string })).status).toBe(401);
    expect((await h.get(`/rooms/${h.roomId}/memory?revision=1`)).status).toBe(401);
  });

  it("fresh exports: pending and revoked notes stay out; a cohost may approve and revoke, a guest may not", async () => {
    const { h, host, amina, baraka, fin } = await room();
    expect((await save(h, amina, { sourceEventIds: [fin], text: "Pending, so not exported" })).status).toBe(201);
    expect((await save(h, amina, { sourceEventIds: [fin], text: "Approved, then revoked" })).status).toBe(201);
    expect((await h.post(`/rooms/${h.roomId}/memory/book-2/approve`, {}, amina.token)).status).toBe(403);
    expect((await h.post(`/rooms/${h.roomId}/cohost`, { targetId: baraka.playerId }, host.token)).status).toBe(200);
    expect((await h.post(`/rooms/${h.roomId}/memory/book-2/approve`, {}, baraka.token)).status).toBe(200);
    const exp = async () => (await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": amina.token })).body as { markdown: string; revision: number };
    let e = await exp();
    expect(e.markdown).toContain("Approved, then revoked");
    expect(e.markdown).not.toContain("Pending, so not exported");
    expect((await h.post(`/rooms/${h.roomId}/memory/book-2/revoke`, {}, baraka.token)).status).toBe(200);
    e = await exp();
    expect(e.markdown).not.toContain("Approved, then revoked");
    expect(e.revision).toBe(4);
    const s = await snap(h, amina);
    expect(s.entries.filter((x) => x["approved"]).length).toBe(0);
  });
});
