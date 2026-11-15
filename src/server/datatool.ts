/**
 * Beta R1 (docs/beta/beta-r1.md §3, docs/beta/beta-r1-release.md): the family's data, kept safe by hand.
 *
 *   node dist/server/datatool.js backup  --data <dir> --out <dir> [--allow-running]
 *   node dist/server/datatool.js restore --backup <dir> --into <dir>
 *   node dist/server/datatool.js prune   --data <dir> --older-than-days <n> [--apply]
 *   (in a checkout: npx tsx src/server/datatool.ts ...)
 *
 * - backup: copies every room snapshot, its previous generation, every Memory Book and the quarantine into a new,
 *   private folder (0700, files 0600), with a manifest of SHA-256 hashes, and checks the copy against it. It refuses
 *   while a server is using the data (stop it first, between sessions) unless --allow-running: every file is then
 *   still copied whole (writes are atomic), but a room and its Memory Book may be a moment apart.
 * - restore: checks the backup against its manifest and decodes every room before copying anything, and only into an
 *   empty or new folder: it never overwrites data. Start a server on that folder to use it.
 * - prune: lists rooms with no activity for N days (dry run). With --apply, and only with no server running, it moves
 *   them into <data>/archive/<time>/; nothing is deleted. Deleting an archive is a person's decision, after a backup.
 *
 * Backups hold the family's names, rooms and Memory Book: keep them off the web and out of git.
 */
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeSnapshot } from "./persistence.js";

const LOCK = "server.lock";
const MANIFEST = "manifest.json";
const TMP = ".tmp-";

export class DataToolError extends Error {}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const isEmptyOrMissing = (dir: string) => !existsSync(dir) || readdirSync(dir).length === 0;
const inside = (child: string, parent: string) => { const r = relative(resolve(parent), resolve(child)); return r === "" || (!r.startsWith("..") && !r.startsWith("/")); };

/** The pid of a live server using `dataDir`, if any. */
export function liveServer(dataDir: string): number | undefined {
  try {
    const pid = Number((JSON.parse(readFileSync(join(dataDir, LOCK), "utf8")) as { pid?: unknown }).pid);
    if (!(pid > 0)) return undefined;
    try { process.kill(pid, 0); return pid; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM" ? pid : undefined; }
  } catch { return undefined; }
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

export function backup(dataDir: string, outDir: string, opts: { allowRunning?: boolean } = {}): Manifest {
  if (!existsSync(dataDir)) throw new DataToolError(`No data directory at ${dataDir}.`);
  if (!isEmptyOrMissing(outDir)) throw new DataToolError(`${outDir} is not empty: a backup goes into a new folder.`);
  if (inside(outDir, dataDir)) throw new DataToolError("The backup folder must be outside the data directory.");
  const running = liveServer(dataDir);
  if (running !== undefined && !opts.allowRunning) throw new DataToolError(`A server (pid ${running}) is using ${dataDir}. Stop it first (between sessions), or pass --allow-running: each file is still copied whole, but a room and its Memory Book may then be a moment apart.`);
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const files: Manifest["files"] = [];
  for (const name of dataFiles(dataDir)) {
    const src = join(dataDir, name), dst = join(outDir, name);
    mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
    // A file the server replaces mid-copy (an atomic rename) is copied again, so the copy is always one whole version.
    let hash = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = sha256(src);
      copyFileSync(src, dst);
      if (sha256(dst) === before && sha256(src) === before) { hash = before; break; }
    }
    if (!hash) throw new DataToolError(`${name} kept changing while it was copied; try again between sessions.`);
    chmodSync(dst, 0o600);
    files.push({ name, bytes: statSync(dst).size, sha256: hash });
  }
  const manifest: Manifest = { kind: "christmas-game-night-backup", version: 1, createdAt: new Date().toISOString(), serverWasRunning: running !== undefined, rooms: files.filter((f) => isRoom(f.name)).length, books: files.filter((f) => isBook(f.name)).length, files };
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

export function restore(backupDir: string, intoDir: string): Manifest {
  const m = verify(backupDir);
  if (!isEmptyOrMissing(intoDir)) throw new DataToolError(`${intoDir} is not empty: restore goes into a new folder and never overwrites data.`);
  mkdirSync(intoDir, { recursive: true, mode: 0o700 });
  chmodSync(intoDir, 0o700);
  for (const f of m.files) {
    const dst = join(intoDir, f.name);
    mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
    copyFileSync(join(backupDir, f.name), dst);
    chmodSync(dst, 0o600);
    if (sha256(dst) !== f.sha256) throw new DataToolError(`${f.name} did not copy cleanly.`);
  }
  return m;
}

export interface PruneCandidate { roomId: string; lastActivity: string; files: string[] }

export function prune(dataDir: string, olderThanDays: number, opts: { apply?: boolean; now?: number } = {}): { candidates: PruneCandidate[]; archivedTo?: string } {
  if (!(olderThanDays >= 7)) throw new DataToolError("--older-than-days must be at least 7 (a family's week of games is never pruned).");
  const now = opts.now ?? Date.now();
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
  if (!opts.apply || candidates.length === 0) return { candidates };
  const running = liveServer(dataDir);
  if (running !== undefined) throw new DataToolError(`A server (pid ${running}) is using ${dataDir}: stop it before archiving, or it will write the rooms back.`);
  const archivedTo = join(dataDir, "archive", new Date(now).toISOString().replace(/[:.]/g, "-"));
  mkdirSync(archivedTo, { recursive: true, mode: 0o700 });
  for (const c of candidates) for (const f of c.files) renameSync(join(dataDir, f), join(archivedTo, f));
  return { candidates, archivedTo };
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const opt = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const need = (name: string) => { const v = opt(name); if (!v) throw new DataToolError(`${cmd} needs ${name} <dir>.`); return resolve(v); };
  try {
    if (cmd === "backup") {
      const m = backup(need("--data"), need("--out"), { allowRunning: rest.includes("--allow-running") });
      console.log(`backup OK: ${m.rooms} room(s), ${m.books} Memory Book(s), ${m.files.length} file(s), verified${m.serverWasRunning ? " (taken while a server was running)" : ""}`);
    } else if (cmd === "restore") {
      const m = restore(need("--backup"), need("--into"));
      console.log(`restore OK: ${m.rooms} room(s), ${m.books} Memory Book(s) restored and verified. Start a server with MCHEZO_DATA_DIR set to that folder.`);
    } else if (cmd === "verify") {
      const m = verify(need("--backup"));
      console.log(`verify OK: ${m.files.length} file(s) match the manifest of ${m.createdAt}`);
    } else if (cmd === "prune") {
      const days = Number(opt("--older-than-days"));
      const r = prune(need("--data"), days, { apply: rest.includes("--apply") });
      for (const c of r.candidates) console.log(`${r.archivedTo ? "archived" : "would archive"} ${c.roomId} (last activity ${c.lastActivity}; ${c.files.length} file(s))`);
      console.log(r.archivedTo ? `moved ${r.candidates.length} room(s) to ${r.archivedTo}; nothing was deleted` : `${r.candidates.length} room(s) older than ${days} days; dry run, nothing moved (add --apply)`);
    } else {
      console.error("usage: datatool backup --data <dir> --out <dir> [--allow-running] | restore --backup <dir> --into <dir> | verify --backup <dir> | prune --data <dir> --older-than-days <n> [--apply]");
      return 2;
    }
    return 0;
  } catch (e) {
    if (e instanceof DataToolError) { console.error(e.message); return 1; }
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
