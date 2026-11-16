/**
 * Beta R1 (docs/beta/beta-r1.md §3): the family's data outside the release: backup and restore into an isolated
 * folder, bounded retention that never deletes, and what a full disk does.
 */
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "./helpers/harness.js";
import { LocalServer } from "../src/server/http.js";
import { RoomStore } from "../src/server/persistence.js";
import { backup, prune, restore, verify } from "../src/server/datatool.js";
import { DataDirLock } from "../src/server/datalock.js";

const dirs: string[] = [];
const harnesses: Harness[] = [];
afterEach(async () => {
  for (const h of harnesses.splice(0)) await h.dispose();
  for (const d of dirs.splice(0)) { try { chmodSync(d, 0o700); } catch { /* gone */ } rmSync(d, { recursive: true, force: true }); }
});
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `mz-beta-data-${label}-`)); dirs.push(d); return d; };
const fresh = (label: string) => { const d = tmp(label); rmSync(d, { recursive: true, force: true }); return d; };

/** A data directory with two rooms (players joined) and a Memory Book for one, written by a real server. */
async function familyData(): Promise<{ dataDir: string; roomIds: string[] }> {
  const dataDir = tmp("src");
  const h = new Harness(dataDir);
  await h.start();
  const roomIds: string[] = [];
  for (const name of ["Kitchen Cup", "Garden Night"]) {
    await h.createRoom(name);
    await h.join("Keku", { host: true });
    await h.join("Amina");
    roomIds.push(h.roomId);
  }
  await h.stop();
  new RoomStore(dataDir).saveBook(roomIds[0]!, { entries: [{ id: "m1", text: "Amina's comeback" }], revision: 1 });
  return { dataDir, roomIds };
}
async function roomsServedFrom(dataDir: string): Promise<string[]> {
  const server = new LocalServer({ dataDir, heartbeatMs: null, lifecycleSweepMs: null });
  try { await server.listen(0); return [...(server as unknown as { rooms: Map<string, unknown> }).rooms.keys()].sort(); } finally { await server.close(); }
}

describe("backup and restore into an isolated folder", () => {
  it("a backup holds every room, its previous generation and the Memory Book; restored elsewhere, a server serves the same rooms", async () => {
    const { dataDir, roomIds } = await familyData();
    const out = fresh("backup");
    const m = await backup(dataDir, out);
    expect([m.rooms, m.books, m.serverWasRunning]).toEqual([2, 1, false]);
    expect(m.files.map((f) => f.name)).toEqual(expect.arrayContaining([`${roomIds[0]}.json`, `${roomIds[0]}.json.prev`, `${roomIds[0]}.book.json`, `${roomIds[1]}.json`]));
    // Private: the folder 0700, every file 0600.
    expect(statSync(out).mode & 0o777).toBe(0o700);
    for (const f of m.files) expect([f.name, statSync(join(out, f.name)).mode & 0o777]).toEqual([f.name, 0o600]);
    const into = fresh("restored");
    await restore(out, into);
    expect(await roomsServedFrom(into)).toEqual([...roomIds].sort());
    expect(JSON.parse(readFileSync(join(into, `${roomIds[0]}.book.json`), "utf8")).entries[0].text).toBe("Amina's comeback");
    // The original is untouched.
    expect(await roomsServedFrom(dataDir)).toEqual([...roomIds].sort());
  });

  it("a backup refuses while a server is using the data (unless asked), and never goes inside the data folder", async () => {
    const { dataDir } = await familyData();
    const server = new DataDirLock(dataDir, "server"); // a running server holds the directory
    await server.acquire();
    try {
      await expect(backup(dataDir, fresh("b1"))).rejects.toThrowError(/^A server \(pid \d+\) is using .* Stop it first/);
      const m = await backup(dataDir, fresh("b2"), { allowRunning: true });
      expect([m.serverWasRunning, m.files.some((f) => f.name === "server.lock")]).toEqual([true, false]);
    } finally { await server.release(); }
    await expect(backup(dataDir, join(dataDir, "inside"))).rejects.toThrowError(/outside the data directory/);
    expect(existsSync(join(dataDir, "server.lock"))).toBe(false); // the backup's own lock record is gone afterwards
  });

  it("restore checks everything before copying: a changed byte, a missing file or a bad room is refused, naming it", async () => {
    const { dataDir, roomIds } = await familyData();
    const out = fresh("backup");
    await backup(dataDir, out);
    const file = join(out, `${roomIds[1]}.json`);
    const good = readFileSync(file, "utf8");
    writeFileSync(file, good.replace("Garden Night", "Garden Nite"));
    await expect(restore(out, fresh("r1"))).rejects.toThrowError(new RegExp(`${roomIds[1]}\\.json does not match the manifest`));
    rmSync(file);
    expect(() => verify(out)).toThrowError(/is missing from the backup/);
    writeFileSync(file, good);
    expect(verify(out).files.length).toBeGreaterThan(0);
  });

  it("restore never overwrites: a folder with anything in it is refused", async () => {
    const { dataDir } = await familyData();
    const out = fresh("backup");
    await backup(dataDir, out);
    const into = tmp("occupied");
    writeFileSync(join(into, "keep.txt"), "the family's");
    await expect(restore(out, into)).rejects.toThrowError(/not empty: restore goes into a new folder/);
    expect(readdirSync(into)).toEqual(["keep.txt"]);
  });
});

describe("retention: bounded, manual, and nothing is deleted", () => {
  it("lists old rooms in a dry run; --apply moves them into an archive (never while a server runs); recent rooms stay", async () => {
    const { dataDir, roomIds } = await familyData();
    const old = join(dataDir, `${roomIds[0]}.json`);
    const snap = JSON.parse(readFileSync(old, "utf8")) as Record<string, unknown>;
    writeFileSync(old, JSON.stringify({ ...snap, savedAt: new Date(Date.now() - 90 * 86_400_000).toISOString() }));
    const before = readdirSync(dataDir).sort();
    const dry = await prune(dataDir, 60);
    expect(dry.candidates.map((c) => c.roomId)).toEqual([roomIds[0]]);
    expect(dry.candidates[0]!.files).toEqual(expect.arrayContaining([`${roomIds[0]}.json`, `${roomIds[0]}.book.json`]));
    expect(readdirSync(dataDir).sort()).toEqual(before); // dry run: nothing moved
    const server = new DataDirLock(dataDir, "server");
    await server.acquire();
    await expect(prune(dataDir, 60, { apply: true })).rejects.toThrowError(/^A server \(pid \d+\) is using .* stop it before archiving/);
    await server.release();
    const done = await prune(dataDir, 60, { apply: true });
    expect(existsSync(old)).toBe(false);
    expect(readdirSync(done.archivedTo!)).toEqual(expect.arrayContaining([`${roomIds[0]}.json`, `${roomIds[0]}.book.json`]));
    expect(await roomsServedFrom(dataDir)).toEqual([roomIds[1]]);
    await expect(prune(dataDir, 3)).rejects.toThrowError(/at least 7/);
  });
});

describe("a full disk", () => {
  it("a failed save answers 500 with a plain reason, never corrupts the saved room, keeps the server up, and saves again once space is back", async () => {
    const dataDir = tmp("full");
    const h = new Harness(dataDir);
    harnesses.push(h);
    await h.start();
    await h.createRoom("Disk");
    await h.join("Keku", { host: true });
    const file = join(dataDir, `${h.roomId}.json`);
    const saved = readFileSync(file, "utf8");
    const original = RoomStore.prototype.saveRoom;
    RoomStore.prototype.saveRoom = function () { throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }); };
    try {
      const r = await h.post("/rooms/join-by-code", { joinCode: h.joinCode, displayName: "Amina" });
      expect([r.status, String(r.body["error"])]).toEqual([500, expect.stringMatching(/could not be saved to disk/)]);
      expect(readFileSync(file, "utf8")).toBe(saved); // the room on disk is the last good one
      expect((await h.get("/health")).status).toBe(200);
    } finally { RoomStore.prototype.saveRoom = original; }
    const later = await h.post("/rooms/join-by-code", { joinCode: h.joinCode, displayName: "Baraka" });
    expect(later.status).toBe(201);
    await h.stop();
    const names = (JSON.parse(readFileSync(file, "utf8")).room.players as { displayName: string }[]).map((p) => p.displayName).sort();
    // Amina joined while the disk was full: in memory, then saved with the next successful save.
    expect(names).toEqual(["Amina", "Baraka", "Keku"]);
  });
});
