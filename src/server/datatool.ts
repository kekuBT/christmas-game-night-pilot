/**
 * Beta R1 (docs/beta/beta-r1.md §3, docs/beta/beta-r1-release.md): the family's data, kept safe by hand.
 *
 *   node dist/server/datatool.js backup  --data <dir> --out <dir> [--allow-running]
 *   node dist/server/datatool.js verify  --backup <dir>
 *   node dist/server/datatool.js restore --backup <dir> --into <dir> [--owner <service user>]
 *   node dist/server/datatool.js check   --data <dir>          (run it as the service user)
 *   node dist/server/datatool.js prune   --data <dir> --older-than-days <n> [--apply]
 *   (in a checkout: npx tsx src/server/datatool.ts ...)
 *
 * - backup: copies every room snapshot, its previous generation, every Memory Book and the quarantine into a new,
 *   private folder (0700, files 0600), with a manifest of SHA-256 hashes, and checks the copy against it. It holds the
 *   data directory's lock while it copies, so it refuses while a server runs and a server can't start during it (stop
 *   the server first, between sessions). With --allow-running and a server running, every file is still copied whole
 *   (writes are atomic), but a room and its Memory Book may be a moment apart.
 * - restore: checks the backup against its manifest and decodes every room before copying anything, and only into an
 *   empty or new folder, which it holds locked while it writes: it never overwrites data. With --owner, it then hands
 *   the folder to that user (private ownership: 0700 and 0600 kept), so the service can use it; that needs root.
 * - check: run as the service user on a data directory (e.g. a restore) before starting the server on it. It confirms
 *   this user owns it, that it is private, that every room decodes and every Memory Book parses, that the lock can be
 *   taken and that a write succeeds. It changes nothing (its write probe is a temporary file, removed).
 * - prune: lists rooms with no activity for N days (dry run). With --apply it holds the lock (so no server is running
 *   or can start) and moves them into <data>/archive/<time>/; nothing is deleted. Deleting an archive is a person's
 *   decision, after a backup.
 * The lock is the server's own (src/server/datalock.ts): one process writes a data directory at a time.
 *
 * Backups hold the family's names, rooms and Memory Book: keep them off the web and out of git.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { accessSync, chmodSync, chownSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DataDirLock, DataDirLocked, DataDirUnusable, dataDirAccessProblems, type LockRole } from "./datalock.js";
import { decodeSnapshot } from "./persistence.js";

const LOCK = "server.lock";
const MANIFEST = "manifest.json";
const TMP = ".tmp-";

export class DataToolError extends Error {}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sha256Of = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
/**
 * Beta R1-R: the tool writes its own copy (0600) of exactly these bytes. Not copyFileSync: run as root it keeps the
 * source's owner (libuv's copyfile chowns the copy), so root's backups held files owned by the service user, and a
 * restore mixed owners. A copy belongs to whoever runs the tool; restore --owner then hands it over on purpose.
 */
function writePrivateCopy(dst: string, bytes: Buffer): void {
  writeFileSync(dst, bytes, { mode: 0o600, flag: "wx" });
  chmodSync(dst, 0o600);
}
const isEmptyOrMissing = (dir: string) => !existsSync(dir) || readdirSync(dir).length === 0;
const inside = (child: string, parent: string) => { const r = relative(resolve(parent), resolve(child)); return r === "" || (!r.startsWith("..") && !r.startsWith("/")); };

/**
 * Run `work` holding the data directory's lock as `role`. DataDirLocked becomes a DataToolError with `busy`'s message.
 * `onLocked` (tests only) runs once the lock is held, before the work.
 */
async function withLock<T>(dir: string, role: LockRole, busy: (holder: string) => string, work: () => T | Promise<T>, onLocked?: () => void | Promise<void>): Promise<T> {
  const lock = new DataDirLock(dir, role);
  try { await lock.acquire(); }
  catch (e) {
    if (e instanceof DataDirLocked) {
      const msg = busy(e.holder ? `${e.holder.role && e.holder.role !== "server" ? `a datatool ${e.holder.role}` : "a server"} (pid ${e.holder.pid})` : "another process");
      throw new DataToolError(msg[0]!.toUpperCase() + msg.slice(1));
    }
    if (e instanceof DataDirUnusable) throw new DataToolError(e.message);
    throw e;
  }
  try { await onLocked?.(); return await work(); } finally { await lock.release(); }
}

/** The data files: top-level snapshots and books (and their .prev), and the quarantine. Never the lock or temp files. */
function dataFiles(dataDir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dataDir).sort()) {
    const p = join(dataDir, name);
    if (name === LOCK || name.includes(TMP) || name === "archive") continue;
    if (statSync(p).isDirectory()) {
      if (name === "quarantine") for (const q of readdirSync(p).sort()) if (statSync(join(p, q)).isFile()) out.push(`quarantine/${q}`);
      continue;
    }
    if (/\.json(\.prev)?$/.test(name)) out.push(name);
  }
  return out;
}

interface Manifest { kind: "christmas-game-night-backup"; version: 1; createdAt: string; serverWasRunning: boolean; rooms: number; books: number; files: { name: string; bytes: number; sha256: string }[] }
const isRoom = (n: string) => /^[^/]+\.json$/.test(n) && !n.endsWith(".book.json") && !n.endsWith(".claim.json") && n !== MANIFEST;
const isBook = (n: string) => /^[^/]+\.book\.json$/.test(n);

export interface ToolHooks { /** tests only: runs once the tool holds the data directory's lock */ onLocked?: () => void | Promise<void> }

export async function backup(dataDir: string, outDir: string, opts: { allowRunning?: boolean } & ToolHooks = {}): Promise<Manifest> {
  if (!existsSync(dataDir)) throw new DataToolError(`No data directory at ${dataDir}.`);
  if (!isEmptyOrMissing(outDir)) throw new DataToolError(`${outDir} is not empty: a backup goes into a new folder.`);
  if (inside(outDir, dataDir)) throw new DataToolError("The backup folder must be outside the data directory.");
  const busy = (who: string) => `${who} is using ${dataDir}. Stop it first (between sessions)${who.includes("server") ? ", or pass --allow-running: each file is still copied whole, but a room and its Memory Book may then be a moment apart" : ", or wait for it to finish"}.`;
  try {
    return await withLock(dataDir, "backup", busy, () => copyOut(dataDir, outDir, false), opts.onLocked);
  } catch (e) {
    // --allow-running: only a running *server* is allowed; another datatool (an archive moving files) is not.
    if (!(e instanceof DataToolError) || !opts.allowRunning || !/^A server \(pid \d+\) is using/.test(e.message)) throw e;
    return copyOut(dataDir, outDir, true);
  }
}

function copyOut(dataDir: string, outDir: string, serverWasRunning: boolean): Manifest {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const files: Manifest["files"] = [];
  for (const name of dataFiles(dataDir)) {
    const src = join(dataDir, name), dst = join(outDir, name);
    mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
    // A file the server replaces mid-copy (an atomic rename) is read again, so the copy is always one whole version.
    let hash = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const bytes = readFileSync(src);
      const h = sha256Of(bytes);
      if (sha256(src) !== h) continue;
      writePrivateCopy(dst, bytes);
      hash = h;
      break;
    }
    if (!hash) throw new DataToolError(`${name} kept changing while it was copied; try again between sessions.`);
    files.push({ name, bytes: statSync(dst).size, sha256: hash });
  }
  const manifest: Manifest = { kind: "christmas-game-night-backup", version: 1, createdAt: new Date().toISOString(), serverWasRunning, rooms: files.filter((f) => isRoom(f.name)).length, books: files.filter((f) => isBook(f.name)).length, files };
  writeFileSync(join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  verify(outDir);
  return manifest;
}

/** Check a backup against its manifest and decode every room. Throws DataToolError naming the first problem. */
export function verify(backupDir: string): Manifest {
  let m: Manifest;
  try { m = JSON.parse(readFileSync(join(backupDir, MANIFEST), "utf8")) as Manifest; } catch { throw new DataToolError(`${backupDir} has no readable ${MANIFEST}: not a backup made by this tool.`); }
  if (m.kind !== "christmas-game-night-backup" || m.version !== 1) throw new DataToolError(`${MANIFEST} is not a version 1 backup manifest.`);
  for (const f of m.files) {
    const p = join(backupDir, f.name);
    if (!existsSync(p)) throw new DataToolError(`${f.name} is missing from the backup.`);
    if (sha256(p) !== f.sha256) throw new DataToolError(`${f.name} does not match the manifest (changed or damaged since the backup).`);
    if (isRoom(f.name)) {
      try { decodeSnapshot(readFileSync(p, "utf8")); } catch (e) { throw new DataToolError(`${f.name} is not a valid room snapshot: ${(e as Error).message}`); }
    } else if (isBook(f.name)) {
      try { JSON.parse(readFileSync(p, "utf8")); } catch { throw new DataToolError(`${f.name} is not valid JSON.`); }
    }
  }
  return m;
}

/** The uid and gid of a local user (`id`), for restore --owner. */
export function localUser(name: string): { uid: number; gid: number } {
  try {
    const uid = Number(execFileSync("id", ["-u", name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    const gid = Number(execFileSync("id", ["-g", name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    if (Number.isInteger(uid) && Number.isInteger(gid)) return { uid, gid };
  } catch { /* below */ }
  throw new DataToolError(`No local user named "${name}" (--owner names the user the service runs as, e.g. cgn).`);
}

export async function restore(backupDir: string, intoDir: string, opts: { owner?: { uid: number; gid: number } } & ToolHooks = {}): Promise<Manifest> {
  const m = verify(backupDir);
  if (!isEmptyOrMissing(intoDir)) throw new DataToolError(`${intoDir} is not empty: restore goes into a new folder and never overwrites data.`);
  mkdirSync(intoDir, { recursive: true, mode: 0o700 });
  chmodSync(intoDir, 0o700);
  // The new folder is held locked while it is written, so a server pointed at it early can't start half-way through.
  return withLock(intoDir, "restore", (who) => `${who} is using ${intoDir}: restore goes into a folder nothing else is using.`, () => {
    if (readdirSync(intoDir).some((n) => n !== LOCK)) throw new DataToolError(`${intoDir} is not empty: restore goes into a new folder and never overwrites data.`);
    const made: string[] = [intoDir];
    for (const f of m.files) {
      const dst = join(intoDir, f.name);
      if (dirname(dst) !== intoDir && !existsSync(dirname(dst))) { mkdirSync(dirname(dst), { recursive: true, mode: 0o700 }); made.push(dirname(dst)); }
      writePrivateCopy(dst, readFileSync(join(backupDir, f.name)));
      if (sha256(dst) !== f.sha256) throw new DataToolError(`${f.name} did not copy cleanly.`);
      made.push(dst);
    }
    // Beta R1-R (review 6900450343 R2): hand the restored folder to the service user, keeping it private. Only what
    // this restore created, never following a link (it created none).
    if (opts.owner) {
      try { for (const p of made) { if (!lstatSync(p).isSymbolicLink()) chownSync(p, opts.owner.uid, opts.owner.gid); } }
      catch (e) { throw new DataToolError(`Could not hand ${intoDir} to uid ${opts.owner.uid} (${(e as NodeJS.ErrnoException).code}): --owner needs root (sudo). The restored copy is complete but still owned by this user.`); }
    }
    return m;
  }, opts.onLocked);
}

export interface CheckResult { rooms: number; books: number; uid: number }

/**
 * Run as the service user before starting a server on a data directory. Read-only except a temporary probe file.
 */
export async function check(dataDir: string, opts: ToolHooks = {}): Promise<CheckResult> {
  if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) throw new DataToolError(`No data directory at ${dataDir}.`);
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const problems: string[] = [];
  // Every entry must belong to this user. The directories must be private (0700): they are what keeps the files in
  // them private (the server writes files with the process umask; the example unit sets UMask=0077).
  const own = (p: string, dir: boolean) => {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) { problems.push(`${p} is a symbolic link`); return; }
    if (uid >= 0 && st.uid !== uid) problems.push(`${p} belongs to uid ${st.uid}, not this user (uid ${uid})`);
    if (dir && (st.mode & 0o077) !== 0) problems.push(`${p} is open to others (mode ${(st.mode & 0o777).toString(8)}; 0700 expected)`);
  };
  own(dataDir, true);
  try { accessSync(dataDir, constants.R_OK | constants.W_OK | constants.X_OK); }
  catch (e) { problems.push(`${dataDir} is not readable and writable by this user (${(e as NodeJS.ErrnoException).code})`); }
  const notReady = () => new DataToolError(`${dataDir} is not ready for this user: ${problems.slice(0, 4).join("; ")}${problems.length > 4 ? `; and ${problems.length - 4} more` : ""}. Restore it with --owner <this user>, or have root chown -R it to this user.`);
  if (problems.length) throw notReady();
  for (const name of readdirSync(dataDir)) {
    const p = join(dataDir, name);
    if (name === LOCK) continue;
    const st = lstatSync(p);
    own(p, st.isDirectory());
    if (st.isDirectory() && name === "quarantine") for (const q of readdirSync(p)) own(join(p, q), false);
  }
  problems.push(...dataDirAccessProblems(dataDir));
  if (problems.length) throw notReady();
  let rooms = 0, books = 0;
  for (const name of dataFiles(dataDir)) {
    const p = join(dataDir, name);
    if (isRoom(name)) { try { decodeSnapshot(readFileSync(p, "utf8")); rooms++; } catch (e) { throw new DataToolError(`${name} is not a valid room snapshot: ${(e as Error).message}`); } }
    else if (isBook(name)) { try { JSON.parse(readFileSync(p, "utf8")); books++; } catch { throw new DataToolError(`${name} is not valid JSON.`); } }
  }
  await withLock(dataDir, "check", (who) => `${who} is using ${dataDir}: check it with the server stopped.`, () => {
    const probe = join(dataDir, `.check-probe${TMP}${process.pid}`);
    try {
      const fd = openSync(probe, "wx", 0o600);
      try { writeSync(fd, "probe"); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(probe, `${probe}-renamed`);
      unlinkSync(`${probe}-renamed`);
    } catch (e) {
      try { unlinkSync(probe); } catch { /* not created */ }
      throw new DataToolError(`A test write into ${dataDir} failed (${(e as NodeJS.ErrnoException).code}): the server could not save changes there.`);
    }
  }, opts.onLocked);
  return { rooms, books, uid };
}

export interface PruneCandidate { roomId: string; lastActivity: string; files: string[] }

function pruneCandidates(dataDir: string, olderThanDays: number, now: number): PruneCandidate[] {
  const candidates: PruneCandidate[] = [];
  for (const name of readdirSync(dataDir).sort().filter(isRoom)) {
    const p = join(dataDir, name);
    let last = statSync(p).mtimeMs;
    try { const saved = Date.parse(String((JSON.parse(readFileSync(p, "utf8")) as { savedAt?: unknown }).savedAt)); if (Number.isFinite(saved)) last = saved; } catch { continue; /* a damaged file is never pruned: the server's restore handles it */ }
    if (now - last < olderThanDays * 86_400_000) continue;
    const roomId = name.slice(0, -".json".length);
    const files = [name, `${name}.prev`, `${roomId}.book.json`, `${roomId}.book.json.prev`, `${roomId}.claim.json`].filter((f) => existsSync(join(dataDir, f)));
    candidates.push({ roomId, lastActivity: new Date(last).toISOString(), files });
  }
  return candidates;
}

export async function prune(dataDir: string, olderThanDays: number, opts: { apply?: boolean; now?: number } & ToolHooks = {}): Promise<{ candidates: PruneCandidate[]; archivedTo?: string }> {
  if (!(olderThanDays >= 7)) throw new DataToolError("--older-than-days must be at least 7 (a family's week of games is never pruned).");
  const now = opts.now ?? Date.now();
  if (!opts.apply) return { candidates: pruneCandidates(dataDir, olderThanDays, now) };
  // --apply: hold the lock while listing and moving, so no server is running or can start and write the rooms back.
  return withLock(dataDir, "archive", (who) => `${who} is using ${dataDir}: stop it before archiving, or it will write the rooms back.`, () => {
    const candidates = pruneCandidates(dataDir, olderThanDays, now);
    if (candidates.length === 0) return { candidates };
    const archivedTo = join(dataDir, "archive", new Date(now).toISOString().replace(/[:.]/g, "-"));
    mkdirSync(archivedTo, { recursive: true, mode: 0o700 });
    for (const c of candidates) for (const f of c.files) renameSync(join(dataDir, f), join(archivedTo, f));
    return { candidates, archivedTo };
  }, opts.onLocked);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const opt = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const need = (name: string) => { const v = opt(name); if (!v) throw new DataToolError(`${cmd} needs ${name} <dir>.`); return resolve(v); };
  try {
    if (cmd === "backup") {
      const m = await backup(need("--data"), need("--out"), { allowRunning: rest.includes("--allow-running") });
      console.log(`backup OK: ${m.rooms} room(s), ${m.books} Memory Book(s), ${m.files.length} file(s), verified${m.serverWasRunning ? " (taken while a server was running)" : ""}`);
    } else if (cmd === "restore") {
      const ownerName = opt("--owner");
      const owner = ownerName ? localUser(ownerName) : undefined;
      const into = need("--into");
      const m = await restore(need("--backup"), into, owner ? { owner } : {});
      console.log(`restore OK: ${m.rooms} room(s), ${m.books} Memory Book(s) restored and verified${ownerName ? `, owned by ${ownerName}` : ""}. Next, as the user the server runs as: datatool check --data ${into}`);
    } else if (cmd === "check") {
      const r = await check(need("--data"));
      console.log(`check OK: ${r.rooms} room(s), ${r.books} Memory Book(s); owned by this user (uid ${r.uid}) and private; the lock and a test write worked. A server run by this user can use it.`);
    } else if (cmd === "verify") {
      const m = verify(need("--backup"));
      console.log(`verify OK: ${m.files.length} file(s) match the manifest of ${m.createdAt}`);
    } else if (cmd === "prune") {
      const days = Number(opt("--older-than-days"));
      const r = await prune(need("--data"), days, { apply: rest.includes("--apply") });
      for (const c of r.candidates) console.log(`${r.archivedTo ? "archived" : "would archive"} ${c.roomId} (last activity ${c.lastActivity}; ${c.files.length} file(s))`);
      console.log(r.archivedTo ? `moved ${r.candidates.length} room(s) to ${r.archivedTo}; nothing was deleted` : `${r.candidates.length} room(s) older than ${days} days; ${rest.includes("--apply") ? "nothing to move" : "dry run, nothing moved (add --apply)"}`);
    } else {
      console.error("usage: datatool backup --data <dir> --out <dir> [--allow-running] | verify --backup <dir> | restore --backup <dir> --into <dir> [--owner <user>] | check --data <dir> | prune --data <dir> --older-than-days <n> [--apply]");
      return 2;
    }
    return 0;
  } catch (e) {
    if (e instanceof DataToolError) { console.error(e.message); return 1; }
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
