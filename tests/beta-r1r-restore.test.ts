/**
 * Beta R1-R (review 6900450343 R2; docs/beta/beta-r1-repair.md): a restore handed to the service user, and the check
 * that service user runs before starting a server on it. Under real separate users, from the package, the same steps
 * run in scripts/check-release-package.mjs (section U); this file covers what one process can show.
 */
import { chmodSync, chownSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backup, check, localUser, restore } from "../src/server/datatool.js";
import { RoomStore } from "../src/server/persistence.js";
import { Harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `mz-r1r-restore-${label}-`)); dirs.push(d); return d; };
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const NOBODY = { uid: 65534, gid: 65534 };

async function backedUp(): Promise<{ backupDir: string; roomId: string }> {
  const dataDir = tmp("data");
  const h = new Harness(dataDir);
  await h.start();
  await h.createRoom("Restore test");
  await h.join("Keku", { host: true });
  const roomId = h.roomId;
  await h.stop();
  new RoomStore(dataDir).saveBook(roomId, { entries: [{ id: "m1", text: "Restored memory" }], revision: 1 });
  const backupDir = join(tmp("bk"), "b");
  await backup(dataDir, backupDir);
  return { backupDir, roomId };
}

describe("restore --owner: a private ownership transition", () => {
  it(isRoot ? "as root: the new folder and every file in it belong to the service user, still 0700 and 0600" : "without root: --owner is refused with the reason, and the copy is left complete", async () => {
    const { backupDir } = await backedUp();
    const into = join(tmp("rs"), "data");
    if (!isRoot) {
      await expect(restore(backupDir, into, { owner: NOBODY })).rejects.toThrowError(/--owner needs root \(sudo\)\. The restored copy is complete but still owned by this user/);
      return;
    }
    const m = await restore(backupDir, into, { owner: NOBODY });
    expect([m.rooms, m.books]).toEqual([1, 1]);
    expect(existsSync(join(into, "server.lock"))).toBe(false); // the restore's own lock record is gone
    expect([statSync(into).uid, statSync(into).gid, statSync(into).mode & 0o777]).toEqual([65534, 65534, 0o700]);
    for (const f of readdirSync(into)) expect([f, statSync(join(into, f)).uid, statSync(join(into, f)).mode & 0o777]).toEqual([f, 65534, 0o600]);
    // As root, check then sees a folder that is not this user's: it says so, and what to do.
    await expect(check(into)).rejects.toThrowError(/belongs to uid 65534, not this user \(uid 0\).*Restore it with --owner <this user>/);
  });

  it("localUser resolves a local user, and names a missing one plainly", () => {
    expect(localUser("root")).toEqual({ uid: 0, gid: 0 });
    expect(() => localUser("no-such-user-mz")).toThrowError(/No local user named "no-such-user-mz"/);
  });
});

describe("copies belong to whoever runs the tool", () => {
  it("a backup and a plain restore are owned by this user, whoever owns the data (on 92a3722, run as root, they kept the service user's owner)", async () => {
    const dataDir = tmp("owned-data");
    const h = new Harness(dataDir);
    await h.start();
    await h.createRoom("Owner test");
    await h.join("Keku", { host: true });
    await h.stop();
    const me = process.getuid!();
    if (isRoot) for (const f of [dataDir, ...readdirSync(dataDir).map((n) => join(dataDir, n))]) chownSync(f, 65534, 65534); // the service's data
    const backupDir = join(tmp("bk"), "b");
    await backup(dataDir, backupDir);
    for (const f of readdirSync(backupDir)) expect([f, statSync(join(backupDir, f)).uid, statSync(join(backupDir, f)).mode & 0o777]).toEqual([f, me, 0o600]);
    const into = join(tmp("rs"), "data");
    await restore(backupDir, into);
    for (const f of readdirSync(into)) expect([f, statSync(join(into, f)).uid]).toEqual([f, me]);
  });
});

describe("datatool check (run as the service user)", () => {
  it("a restore this user owns: OK, with the rooms and Memory Books counted, the lock taken and released, nothing left behind", async () => {
    const { backupDir } = await backedUp();
    const into = join(tmp("rs"), "data");
    await restore(backupDir, into);
    const before = readdirSync(into).sort();
    const r = await check(into);
    expect([r.rooms, r.books]).toEqual([1, 1]);
    expect(readdirSync(into).sort()).toEqual(before); // its write probe and lock record are gone
  });

  it("refuses a data directory open to others, or a room that doesn't decode, naming it", async () => {
    const { backupDir, roomId } = await backedUp();
    const into = join(tmp("rs"), "data");
    await restore(backupDir, into);
    chmodSync(into, 0o755);
    await expect(check(into)).rejects.toThrowError(/is open to others \(mode 755; 0700 expected\)/);
    chmodSync(into, 0o700);
    writeFileSync(join(into, `${roomId}.json`), "{\"not\":\"a room\"}");
    await expect(check(into)).rejects.toThrowError(new RegExp(`${roomId}\\.json is not a valid room snapshot`));
  });
});
