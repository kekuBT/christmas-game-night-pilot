/**
 * Beta R1-R (review 6900450343 R1; docs/beta/beta-r1-repair.md): one process writes a data directory at a time, shown
 * with real processes. Overlapping first starts and stale-lock recovery (many starts at the same moment), a datatool
 * holding the directory for its whole operation, a running server refusing the tools, a crash and restart, and a
 * clean SIGTERM. On 92a3722 the overlapping starts gave two or three holders in every round
 * (docs/evidence/beta-r1-repair-local/repro-lock-race-92a3722.out.txt).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { backup, check, prune, restore } from "../src/server/datatool.js";
import { RoomStore } from "../src/server/persistence.js";
import { Harness } from "./helpers/harness.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dirs: string[] = [];
const procs: ChildProcess[] = [];
afterEach(async () => {
  for (const p of procs.splice(0)) if (p.exitCode === null && p.signalCode === null) { p.kill("SIGKILL"); await new Promise((r) => p.once("exit", r)); }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `mz-r1r-${label}-`)); dirs.push(d); return d; };

interface Started { child: ChildProcess; out: () => string; port?: number; exit?: number | null }
/** Start src/server/serve.ts on `dataDir`; resolves with its port, or its exit code if it exits first. */
function startServer(dataDir: string): Promise<Started> {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  procs.push(child);
  let out = "";
  child.stdout!.on("data", (d) => { out += d; }); child.stderr!.on("data", (d) => { out += d; });
  return new Promise((res) => {
    const t = setInterval(() => { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) { clearInterval(t); res({ child, out: () => out, port: Number(m[1]) }); } }, 50);
    child.once("exit", (code) => { clearInterval(t); res({ child, out: () => out, exit: code }); });
  });
}
const stop = (s: Started, signal: NodeJS.Signals = "SIGTERM") => new Promise<number | null>((res) => { if (s.child.exitCode !== null) { res(s.child.exitCode); return; } s.child.once("exit", (c) => res(c)); s.child.kill(signal); });

interface Contender { c: ChildProcess; out: string; pipeErrors: string[]; exit?: { code: number | null; signal: NodeJS.Signals | null } }

/**
 * `n` processes take the lock at the same moment, by an explicit protocol (review 6901841738 R3;
 * tests/fixtures/lock-child.mts): every contender is started and READY before GO goes to all of them; each answers ACQ
 * or REFUSED; END goes only to a confirmed, still-running holder; then every contender must exit 0.
 * Anything else fails the test with what each contender printed: an exit before READY or before an answer, a holder
 * gone before END, an ERROR, a non-zero exit or a signal, a timeout, or any error on a pipe (an EPIPE included). Nothing
 * is counted as a refusal unless the contender said REFUSED, and no pipe error is ignored.
 * Returns how many held the lock and the most holders at once.
 */
async function race(dir: string, n: number): Promise<{ acquired: number; maxAtOnce: number; refusals: string[] }> {
  const kids: Contender[] = Array.from({ length: n }, () => {
    const c = spawn(process.execPath, ["--import", "tsx", join("tests", "fixtures", "lock-child.mts"), dir], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    procs.push(c);
    const k: Contender = { c, out: "", pipeErrors: [] };
    c.stdout!.on("data", (d) => { k.out += d; });
    c.stderr!.on("data", (d) => { k.out += d; });
    for (const [name, stream] of [["stdin", c.stdin!], ["stdout", c.stdout!], ["stderr", c.stderr!]] as const) {
      stream.on("error", (e: NodeJS.ErrnoException) => { k.pipeErrors.push(`${name}: ${e.code ?? ""} ${e.message}`); });
    }
    c.once("exit", (code, signal) => { k.exit = { code, signal }; });
    return k;
  });
  const describeAll = () => kids.map((k, i) => `#${i} pid ${k.c.pid} exit ${JSON.stringify(k.exit ?? null)} pipe errors ${JSON.stringify(k.pipeErrors)} said ${JSON.stringify(k.out.slice(-300))}`).join("\n");
  const phase = async (label: string, done: (k: Contender) => boolean, ms = 30_000) => {
    const end = Date.now() + ms;
    while (!kids.every(done)) {
      if (Date.now() > end) throw new Error(`lock race: timed out waiting for ${label}\n${describeAll()}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const fail = (why: string) => { throw new Error(`lock race: ${why}\n${describeAll()}`); };
  await phase("READY from every contender", (k) => /^READY$/m.test(k.out) || k.exit !== undefined);
  if (kids.some((k) => k.exit !== undefined)) fail("a contender exited before READY");
  for (const k of kids) k.c.stdin!.write("GO\n");
  await phase("an answer (ACQ or REFUSED) from every contender", (k) => /^(ACQ|REFUSED|ERROR) /m.test(k.out) || k.exit !== undefined);
  if (kids.some((k) => !/^(ACQ|REFUSED|ERROR) /m.test(k.out))) fail("a contender exited without answering");
  if (kids.some((k) => /^ERROR /m.test(k.out))) fail("a contender failed with an error that is not a refusal");
  const holders = kids.filter((k) => /^ACQ /m.test(k.out));
  for (const h of holders) {
    if (h.exit !== undefined) fail("a holder exited before END");
    h.c.stdin!.write("END\n"); // only to a confirmed, still-running holder
  }
  await phase("every contender to exit", (k) => k.exit !== undefined);
  if (kids.some((k) => k.exit!.code !== 0 || k.exit!.signal !== null)) fail("a contender exited abnormally");
  if (kids.some((k) => k.pipeErrors.length > 0)) fail("an error on a contender's pipe");
  if (holders.some((h) => !/^REL /m.test(h.out))) fail("a holder didn't report releasing the lock");
  const holds = holders.map((h) => [Number(/^ACQ \d+ ([\d.]+)/m.exec(h.out)![1]), Number(/^REL \d+ ([\d.]+)/m.exec(h.out)![1])] as const);
  const maxAtOnce = Math.max(0, ...holds.map(([s]) => holds.filter(([s2, e2]) => s2 <= s && s < e2).length));
  return { acquired: holders.length, maxAtOnce, refusals: kids.filter((k) => /^REFUSED /m.test(k.out)).map((k) => k.out) };
}

describe("overlapping starts: exactly one holder", () => {
  it("eight starts at the same moment on a new directory, three rounds: one holds it, seven are refused", async () => {
    for (let round = 0; round < 3; round++) {
      const r = await race(join(tmp("fresh"), "data"), 8);
      expect([r.acquired, r.maxAtOnce, r.refusals.length]).toEqual([1, 1, 7]);
      for (const o of r.refusals) expect(o).toMatch(/is using this data directory/);
    }
  }, 60_000);

  it("eight starts at the same moment on a directory a crash left a lock record in, three rounds: one holds it", async () => {
    for (let round = 0; round < 3; round++) {
      const d = tmp("stale");
      const dead = spawnSync(process.execPath, ["-e", "0"]).pid;
      writeFileSync(join(d, "server.lock"), JSON.stringify({ pid: dead, role: "server" }));
      const r = await race(d, 8);
      expect([r.acquired, r.maxAtOnce, r.refusals.length]).toEqual([1, 1, 7]);
    }
  }, 60_000);

  it("four real servers started together on a new directory: one serves, three exit 2 naming it; SIGTERM then frees it", async () => {
    const d = join(tmp("servers"), "data");
    const all = await Promise.all([0, 1, 2, 3].map(() => startServer(d)));
    const serving = all.filter((s) => s.port);
    expect(serving).toHaveLength(1);
    const winner = serving[0]!;
    for (const s of all.filter((x) => !x.port)) {
      expect(s.exit).toBe(2);
      expect(s.out()).toMatch(new RegExp(`Another server \\(pid ${winner.child.pid}\\) is using this data directory`));
    }
    expect(await stop(winner)).toBe(0);
    expect(existsSync(join(d, "server.lock"))).toBe(false);
    const next = await startServer(d);
    expect(next.port).toBeGreaterThan(0);
  }, 60_000);
});

/** A data directory with one room and its Memory Book. */
async function someData(): Promise<{ dataDir: string; roomId: string }> {
  const dataDir = tmp("data");
  const h = new Harness(dataDir);
  await h.start();
  await h.createRoom("Lock test");
  await h.join("Keku", { host: true });
  const roomId = h.roomId;
  await h.stop();
  new RoomStore(dataDir).saveBook(roomId, { entries: [{ id: "m1", text: "A lock story" }], revision: 1 });
  return { dataDir, roomId };
}

describe("the tools hold the directory for their whole operation", () => {
  it("backup, prune --apply, check and restore: a server started during each is refused, naming the tool; afterwards it starts", async () => {
    const { dataDir, roomId } = await someData();
    const during: { tool: string; started: Started }[] = [];
    const tryServer = (tool: string, dir: string) => async () => { during.push({ tool, started: await startServer(dir) }); };
    await backup(dataDir, join(tmp("bk"), "b"), { onLocked: tryServer("backup", dataDir) });
    const old = join(dataDir, `${roomId}.json`);
    writeFileSync(old, JSON.stringify({ ...JSON.parse(readFileSync(old, "utf8")), savedAt: new Date(Date.now() - 90 * 86_400_000).toISOString() }));
    const pr = await prune(dataDir, 60, { apply: true, onLocked: tryServer("archive", dataDir) });
    expect(pr.archivedTo).toBeTruthy();
    await check(dataDir, { onLocked: tryServer("check", dataDir) });
    const { dataDir: other } = await someData();
    const b2 = join(tmp("bk"), "b2");
    await backup(other, b2);
    const into = join(tmp("rs"), "data");
    await restore(b2, into, { onLocked: tryServer("restore", into) });
    const names: Record<string, RegExp> = { backup: /A backup \(datatool backup\)/, archive: /An archive run \(datatool prune --apply\)/, check: /A data check \(datatool check\)/, restore: /A restore \(datatool restore\)/ };
    for (const { tool, started } of during) {
      expect([tool, started.exit]).toEqual([tool, 2]);
      expect(started.out()).toMatch(new RegExp(`${names[tool]!.source} \\(pid ${process.pid}\\) is using this data directory .* Wait for it to finish`));
    }
    expect(during.map((x) => x.tool)).toEqual(["backup", "archive", "check", "restore"]);
    for (const dir of [dataDir, into]) {
      expect(existsSync(join(dir, "server.lock"))).toBe(false); // each tool removed its record
      const s = await startServer(dir);
      expect(s.port).toBeGreaterThan(0);
      await stop(s);
    }
  }, 90_000);

  it("a running server refuses backup, prune --apply and check, naming it; restore never touches a used folder", async () => {
    const { dataDir } = await someData();
    const s = await startServer(dataDir);
    expect(s.port).toBeGreaterThan(0);
    const named = new RegExp(`^A server \\(pid ${s.child.pid}\\) is using`);
    await expect(backup(dataDir, join(tmp("bk"), "b"))).rejects.toThrowError(named);
    await expect(prune(dataDir, 7, { apply: true })).rejects.toThrowError(named);
    await expect(check(dataDir)).rejects.toThrowError(/^A server \(pid \d+\) is using .* check it with the server stopped/);
    const b = join(tmp("bk"), "b2");
    const m = await backup(dataDir, b, { allowRunning: true });
    expect(m.serverWasRunning).toBe(true);
    await expect(restore(b, dataDir)).rejects.toThrowError(/not empty/);
    expect(await stop(s)).toBe(0);
  }, 60_000);
});

describe("crash and restart; a clean stop", () => {
  it("after a kill -9 the next start takes over the record the crash left, and the room is still there", async () => {
    const d = join(tmp("crash"), "data");
    const s1 = await startServer(d);
    const room = await (await fetch(`http://localhost:${s1.port}/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Crash", kind: "casual" }) })).json() as { roomId: string };
    await stop(s1, "SIGKILL");
    expect(JSON.parse(readFileSync(join(d, "server.lock"), "utf8")).pid).toBe(s1.child.pid); // left by the crash
    const s2 = await startServer(d);
    expect(s2.port).toBeGreaterThan(0);
    expect(s2.out()).toMatch(new RegExp(`took over a stale lock left by a process that is no longer running \\(pid ${s1.child.pid}, server\\)`));
    expect((await fetch(`http://localhost:${s2.port}/rooms/${room.roomId}/projection?audience=tv`)).status).toBe(200);
    expect(JSON.parse(readFileSync(join(d, "server.lock"), "utf8")).pid).toBe(s2.child.pid);
    expect(await stop(s2)).toBe(0);
  }, 60_000);

  it("SIGTERM stops cleanly, removes the record and frees the directory: a backup and a new server can use it at once", async () => {
    const { dataDir } = await someData();
    const s = await startServer(dataDir);
    expect(await stop(s)).toBe(0);
    expect(s.out()).toMatch(/received SIGTERM, closing server/);
    expect(existsSync(join(dataDir, "server.lock"))).toBe(false);
    expect((await backup(dataDir, join(tmp("bk"), "b"))).serverWasRunning).toBe(false);
    const again = await startServer(dataDir);
    expect(again.port).toBeGreaterThan(0);
  }, 60_000);
});
