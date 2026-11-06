/**
 * Sprint 1 Priority C: crash-safe snapshots and isolated restore.
 *
 * Requirement under test: a family room (players, finished games, scores)
 * must survive a crash or restart, and one damaged file must never take
 * other rooms down with it or be silently overwritten/deleted.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { atomicWriteFileSync, decodeSnapshot, SnapshotError } from "../src/server/persistence.js";

const dirs: string[] = [];
const servers: LocalServer[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "mz-persist-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close().catch(() => {});
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function boot(dataDir: string) {
  const server = new LocalServer({ dataDir });
  servers.push(server);
  const port = await server.listen(0);
  const base = `http://localhost:${port}`;
  const post = async (path: string, body: unknown, token?: string) => {
    const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const projection = async (roomId: string, token: string) => {
    const r = await fetch(`${base}/rooms/${roomId}/projection?audience=player`, { headers: { "x-session-token": token } });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  return { server, port, base, post, projection };
}
async function stop(server: LocalServer) {
  await server.close();
  servers.splice(servers.indexOf(server), 1);
}

/** Create a room with a host and one finished official game. */
async function seedRoom(app: Awaited<ReturnType<typeof boot>>, name: string) {
  const room = await app.post("/rooms", { name });
  const roomId = room.body["roomId"] as string;
  const host = await app.post(`/rooms/${roomId}/join`, { displayName: `${name}-host`, asHost: true, hostClaimToken: room.body["hostClaimToken"] });
  await app.post(`/rooms/${roomId}/join`, { displayName: `${name}-guest` });
  const token = host.body["sessionToken"] as string;
  return { roomId, token, joinCode: room.body["joinCode"] as string };
}

describe("atomic writes", () => {
  it("writes the full content and leaves no temp file", () => {
    const d = tempDir();
    const p = join(d, "room.json");
    atomicWriteFileSync(p, '{"a":1}');
    atomicWriteFileSync(p, '{"a":2}');
    expect(readFileSync(p, "utf8")).toBe('{"a":2}');
    expect(readdirSync(d)).toEqual(["room.json"]);
  });

  it("an interrupted write keeps the last complete snapshot and cleans its temp file", () => {
    const d = tempDir();
    const p = join(d, "room.json");
    atomicWriteFileSync(p, '{"generation":1}');
    expect(() => atomicWriteFileSync(p, '{"generation":2}', { beforeRename: () => { throw new Error("simulated crash before rename"); } })).toThrow("simulated crash");
    expect(readFileSync(p, "utf8")).toBe('{"generation":1}');
    expect(readdirSync(d)).toEqual(["room.json"]);
  });

  it("a process killed at random moments mid-save never leaves a torn snapshot", async () => {
    const d = tempDir();
    const p = join(d, "room.json");
    for (let round = 0; round < 12; round++) {
      const child = spawn(process.execPath, ["--import", "tsx", join("tests", "fixtures", "write-loop.mts"), p], { stdio: ["ignore", "pipe", "ignore"] });
      await new Promise<void>((r) => child.stdout.once("data", () => r()));
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 60));
      child.kill("SIGKILL");
      await new Promise((r) => child.once("exit", r));
      const parsed = JSON.parse(readFileSync(p, "utf8")) as { generation: number; filler: string };
      expect(parsed.filler.length).toBe(200_000);
    }
  }, 60_000);
});

describe("restore after restart", () => {
  it("restores one valid room with its players, games and session tokens", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Solo");
    await stop(a.server);
    const b = await boot(d);
    expect(b.server.restoreReport.failed).toEqual([]);
    const proj = await b.projection(r.roomId, r.token);
    expect(proj.status).toBe(200);
    expect((proj.body["players"] as unknown[]).length).toBe(2);
  });

  it("restores multiple valid rooms", async () => {
    const d = tempDir();
    const a = await boot(d);
    const rooms = [await seedRoom(a, "One"), await seedRoom(a, "Two"), await seedRoom(a, "Three")];
    await stop(a.server);
    const b = await boot(d);
    expect(b.server.restoreReport.loaded.map((l) => l.roomId).sort()).toEqual(rooms.map((r) => r.roomId).sort());
    for (const r of rooms) expect((await b.projection(r.roomId, r.token)).status).toBe(200);
  });

  it("a corrupt JSON file among valid rooms is reported, left untouched, and does not block the others", async () => {
    const d = tempDir();
    const a = await boot(d);
    const good1 = await seedRoom(a, "Good1");
    const good2 = await seedRoom(a, "Good2");
    await stop(a.server);
    const corrupt = join(d, "room-aaaa-corrupt.json"); // sorts before the good rooms
    writeFileSync(corrupt, '{"id":"room-aaaa-corrupt","players":[');
    const b = await boot(d);
    expect(b.server.rooms.has(good1.roomId)).toBe(true);
    expect(b.server.rooms.has(good2.roomId)).toBe(true);
    expect(b.server.restoreReport.failed).toEqual([{ file: "room-aaaa-corrupt.json", reason: expect.stringContaining("not valid JSON") }]);
    expect(readFileSync(corrupt, "utf8")).toBe('{"id":"room-aaaa-corrupt","players":[');
  });

  it("a partially written snapshot with no previous generation is reported and preserved, never overwritten", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Torn");
    await stop(a.server);
    const file = join(d, `${r.roomId}.json`);
    rmSync(`${file}.prev`, { force: true });
    const full = readFileSync(file, "utf8");
    truncateSync(file, Math.floor(full.length / 2));
    const torn = readFileSync(file, "utf8");
    const b = await boot(d);
    expect(b.server.rooms.has(r.roomId)).toBe(false);
    expect(b.server.restoreReport.failed[0]?.file).toBe(`${r.roomId}.json`);
    // A new room never reuses the damaged room's file.
    await seedRoom(b, "Fresh");
    expect(readFileSync(file, "utf8")).toBe(torn);
  });

  it("a damaged snapshot with a valid previous generation is recovered, and the damaged file is moved aside, not deleted", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Recover"); // several saves, so .prev exists
    await stop(a.server);
    const file = join(d, `${r.roomId}.json`);
    expect(existsSync(`${file}.prev`)).toBe(true);
    writeFileSync(file, "garbage");
    const b = await boot(d);
    expect(b.server.rooms.has(r.roomId)).toBe(true);
    expect(b.server.restoreReport.loaded.find((l) => l.roomId === r.roomId)?.recoveredFromPrevious).toBe(true);
    const q = b.server.restoreReport.quarantined[0]!;
    expect(readFileSync(q.movedTo, "utf8")).toBe("garbage");
    // The previous generation has the host but may lack the last change (the guest join).
    expect((await b.projection(r.roomId, r.token)).status).toBe(200);
  });

  it.each([
    ["players is not an array", (room: Record<string, unknown>) => { room["players"] = "nope"; }, "players"],
    ["unknown game type", (room: Record<string, unknown>) => { (room["games"] as Record<string, unknown>[]).push({ id: "game-9", gameId: "laser-tag", official: true, status: "finished", players: [], answers: {}, answerTimes: {}, rawScores: {}, seed: 1 }); }, "unknown game type"],
    ["host is not a player", (room: Record<string, unknown>) => { room["hostId"] = "player-99"; }, "hostId"],
    ["game lists an unknown player", (room: Record<string, unknown>) => { (room["games"] as Record<string, unknown>[]).push({ id: "game-9", gameId: "trivia", official: true, status: "finished", players: ["player-77"], answers: {}, answerTimes: {}, rawScores: {}, seed: 1 }); }, "unknown player"],
    ["token hash is malformed", (room: Record<string, unknown>) => { (room["players"] as Record<string, unknown>[])[0]!["recoveryTokenHash"] = "not-a-hash"; }, "recoveryTokenHash"],
  ])("rejects invalid schema (%s) without affecting other rooms", async (_label, mutate, reason) => {
    const d = tempDir();
    const a = await boot(d);
    const bad = await seedRoom(a, "Bad");
    const good = await seedRoom(a, "Good");
    await stop(a.server);
    const file = join(d, `${bad.roomId}.json`);
    rmSync(`${file}.prev`, { force: true });
    const env = JSON.parse(readFileSync(file, "utf8")) as { room: Record<string, unknown> };
    mutate(env.room);
    writeFileSync(file, JSON.stringify(env));
    const b = await boot(d);
    expect(b.server.rooms.has(bad.roomId)).toBe(false);
    expect(b.server.rooms.has(good.roomId)).toBe(true);
    expect(b.server.restoreReport.failed[0]?.reason).toContain(reason);
  });

  it("an unreadable room file is reported and does not stop other rooms", async () => {
    const d = tempDir();
    const a = await boot(d);
    const good = await seedRoom(a, "Good");
    await stop(a.server);
    mkdirSync(join(d, "room-unreadable.json")); // a directory: readFileSync fails with EISDIR (portable stand-in for EACCES; root ignores modes)
    const b = await boot(d);
    expect(b.server.rooms.has(good.roomId)).toBe(true);
    expect(b.server.restoreReport.failed).toEqual([{ file: "room-unreadable.json", reason: expect.stringContaining("unreadable") }]);
  });

  it("a temp file left by an interrupted save is quarantined, not deleted, and the room still loads", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Leftover");
    await stop(a.server);
    const leftover = join(d, `${r.roomId}.json.tmp-123-abcd`);
    writeFileSync(leftover, '{"half":');
    const b = await boot(d);
    expect(b.server.rooms.has(r.roomId)).toBe(true);
    expect(existsSync(leftover)).toBe(false);
    expect(readFileSync(b.server.restoreReport.quarantined[0]!.movedTo, "utf8")).toBe('{"half":');
  });

  it("a missing Memory Book is fine, and a corrupt one never blocks its room", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Book");
    await a.post(`/rooms/${r.roomId}/memory`, { day: 1, text: "A lovely night", sourceEventIds: [] }, r.token);
    await stop(a.server);
    writeFileSync(join(d, `${r.roomId}.book.json`), "{oops");
    const b = await boot(d);
    expect(b.server.rooms.has(r.roomId)).toBe(true);
    expect(b.server.restoreReport.warnings.some((w) => w.file === `${r.roomId}.book.json`)).toBe(true);
    expect(readFileSync(join(d, `${r.roomId}.book.json`), "utf8")).toBe("{oops");
  });

  it("refuses snapshot formats newer than this server understands", () => {
    expect(() => decodeSnapshot(JSON.stringify({ format: 3, room: {} }))).toThrow(SnapshotError);
  });

  it("duplicate room ids load once and report the second file", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Dup");
    await stop(a.server);
    cpSync(join(d, `${r.roomId}.json`), join(d, "zz-copy.json"));
    const b = await boot(d);
    expect(b.server.rooms.has(r.roomId)).toBe(true);
    expect(b.server.restoreReport.failed[0]?.reason).toContain("duplicate room id");
  });
});

describe("compatibility with handoff (v1) snapshots", () => {
  // Generated by the original handoff server at 761e17f; see tests/fixtures/snapshots-v1.
  const CLAIMED = "room-mw48o1td-132188";
  const UNCLAIMED = "room-mw48o1vh-931377";
  const UNCLAIMED_TOKEN = "25ab6810-8bc3-4c09-9b5d-27bab9899fc4";
  const HOST_TOKEN = "3f310ac8e74ec2029c4bf57d338be35b423f3e144f43cc4edab9fcba45a4662f";
  function v1Dir(): string {
    const d = tempDir();
    cpSync(join("tests", "fixtures", "snapshots-v1"), d, { recursive: true });
    return d;
  }

  it("loads v1 rooms with their finished official game, scores and sessions intact", async () => {
    const d = v1Dir();
    const b = await boot(d);
    expect(b.server.restoreReport.failed).toEqual([]);
    expect(b.server.restoreReport.loaded.map((l) => l.format)).toEqual([1, 1]);
    const proj = await b.projection(CLAIMED, HOST_TOKEN);
    expect(proj.status).toBe(200);
    const game = (proj.body["games"] as Record<string, unknown>[])[0]!;
    expect(game["status"]).toBe("finished");
    expect(Object.keys(game["rawScores"] as object)).toHaveLength(2);
    expect(Object.keys(proj.body["officialStandings"] as object)).toHaveLength(2);
  });

  it("honours a legacy plaintext claim file (by hash) and still refuses a claim without the token", async () => {
    const d = v1Dir();
    const b = await boot(d);
    const without = await b.post(`/rooms/${UNCLAIMED}/join`, { displayName: "Mallory", asHost: true });
    expect(without.status).toBe(400);
    const wrong = await b.post(`/rooms/${UNCLAIMED}/join`, { displayName: "Mallory", asHost: true, hostClaimToken: "guess" });
    expect(wrong.status).toBe(400);
    const right = await b.post(`/rooms/${UNCLAIMED}/join`, { displayName: "Owner", asHost: true, hostClaimToken: UNCLAIMED_TOKEN });
    expect(right.status).toBe(201);
    expect(right.body["isHost"]).toBe(true);
  });

  it("rewrites a v1 room as v2 only when it changes, and never deletes the legacy claim file", async () => {
    const d = v1Dir();
    const b = await boot(d);
    const before = readFileSync(join(d, `${CLAIMED}.json`), "utf8");
    expect(JSON.parse(before)["format"]).toBeUndefined();
    await b.post(`/rooms/${UNCLAIMED}/join`, { displayName: "Owner", asHost: true, hostClaimToken: UNCLAIMED_TOKEN });
    expect(readFileSync(join(d, `${CLAIMED}.json`), "utf8")).toBe(before); // untouched room stays v1
    const after = JSON.parse(readFileSync(join(d, `${UNCLAIMED}.json`), "utf8"));
    expect(after["format"]).toBe(2);
    expect(after["hostClaimHash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(d, `${UNCLAIMED}.claim.json`))).toBe(true);
  });
});

describe("host claim and save failures", () => {
  it("a room with no claim on record refuses host claims (previously accepted when the token was omitted)", async () => {
    const d = v1Dir2();
    const b = await boot(d);
    const r = await b.post(`/rooms/${ROOM_NO_CLAIM}/join`, { displayName: "Mallory", asHost: true });
    expect(r.status).toBe(400);
    expect(b.server.rooms.get(ROOM_NO_CLAIM)!.hostId).toBeNull();
  });

  it("new rooms store only a hash of the claim token, inside the room snapshot", async () => {
    const d = tempDir();
    const a = await boot(d);
    const room = await a.post("/rooms", { name: "Hashed" });
    const text = readFileSync(join(d, `${room.body["roomId"]}.json`), "utf8");
    expect(text).not.toContain(room.body["hostClaimToken"] as string);
    expect(existsSync(join(d, `${room.body["roomId"]}.claim.json`))).toBe(false);
  });

  it("a change that cannot be saved answers 500, not a misleading 400", async () => {
    const d = tempDir();
    const a = await boot(d);
    const r = await seedRoom(a, "Disk");
    const file = join(d, `${r.roomId}.json`);
    rmSync(file);
    mkdirSync(file); // the next save cannot replace a directory
    const res = await a.post(`/rooms/${r.roomId}/join`, { displayName: "Late" });
    expect(res.status).toBe(500);
    expect(String(res.body["error"])).toContain("could not be saved");
  });
});

// A v1 room whose claim file is missing (companion lost): built from the fixture.
const ROOM_NO_CLAIM = "room-mw48o1vh-931377";
function v1Dir2(): string {
  const d = tempDir();
  cpSync(join("tests", "fixtures", "snapshots-v1", `${ROOM_NO_CLAIM}.json`), join(d, `${ROOM_NO_CLAIM}.json`));
  return d;
}
