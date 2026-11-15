/**
 * Beta R1 (docs/beta/beta-r1.md §2; repaired in Beta R1-R, review 6900450343 R1, docs/beta/beta-r1-repair.md):
 * one process writes a data directory at a time. A second server on the same directory (a double start, a stuck
 * deploy) would overwrite rooms the first one holds in memory, and a server starting while a backup, archive or
 * restore is writing would race it. Both are refused.
 *
 * The exclusion: an exclusive Linux abstract Unix socket named after the directory's identity (device and inode).
 * - Binding it is one atomic step: a second binder gets EADDRINUSE. There is no window between "created" and "owned".
 * - The kernel releases it when the process ends, however it ends (SIGTERM, a crash, kill -9). There is never a stale
 *   lock to recover, so there is no recovery race.
 * - It leaves nothing on disk, needs nothing installed and is not inherited by child processes.
 * - It is per network namespace: the service and the tools must share the host's (systemd's default; the runbook says
 *   not to add PrivateNetwork= to the unit). One host only; a network volume shared by two hosts is not supported.
 *
 * `server.lock` is only a record of who holds the directory (pid, role, host, start time), for people and messages.
 * Only the holder writes it, atomically (a temporary file renamed into place), and a record left by a crash is
 * replaced. Before this repair the record itself was the lock: creating it and writing the pid were two steps, so a
 * second start could read the empty file as stale and take it (reproduced in docs/evidence/beta-r1-repair-local/).
 *
 * Other systems (a developer's Mac or Windows computer): no kernel exclusion is used, only the record (a live holder in
 * it is refused, best effort). Production refuses to start off Linux (serve.ts).
 */
import { randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { hostname } from "node:os";
import { join } from "node:path";

/** Who holds a data directory. */
export type LockRole = "server" | "backup" | "archive" | "restore" | "check";
export interface LockRecord { pid: number; role?: LockRole; host?: string; startedAt?: string; token?: string }

const WHO: Record<LockRole, string> = {
  server: "Another server",
  backup: "A backup (datatool backup)",
  archive: "An archive run (datatool prune --apply)",
  restore: "A restore (datatool restore)",
  check: "A data check (datatool check)",
};

export class DataDirLocked extends Error {
  constructor(readonly path: string, readonly holder: LockRecord | undefined) {
    const who = holder ? `${WHO[holder.role ?? "server"]} (pid ${holder.pid})` : "Another process";
    super(`${who} is using this data directory (${path}). ${holder?.role && holder.role !== "server" ? "Wait for it to finish" : "Stop it first"}: one process writes a data directory at a time.`);
  }
}

/** This user can't create, read or write the data directory (a restore left it owned by someone else, a wrong path). */
export class DataDirUnusable extends Error {
  constructor(readonly path: string, readonly problems: string[]) {
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    super(`This user${uid === undefined ? "" : ` (uid ${uid})`} can't use the data directory ${path}: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? `; and ${problems.length - 3} more` : ""}. ` +
      "The directory and every file in it must belong to the user the server runs as (mode 0700, files 0600). After a restore as root, restore again with " +
      "\"datatool restore --owner <service user>\" (or chown -R <service user> the folder), then run \"datatool check --data <dir>\" as that user. Nothing was changed.");
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

const accessErr = (e: unknown) => ["EACCES", "EPERM"].includes((e as NodeJS.ErrnoException).code ?? "");

/**
 * Everything in the data directory this process can't both read and write: the directory, its files and the
 * quarantine. Read-only: nothing is changed. A server that started anyway would leave such rooms unloaded.
 */
export function dataDirAccessProblems(dir: string): string[] {
  const problems: string[] = [];
  const need = (p: string, mode: number) => { try { accessSync(p, mode); } catch (e) { problems.push(`${p} is not ${mode & constants.X_OK ? "usable" : "readable and writable"} (${(e as NodeJS.ErrnoException).code})`); return false; } return true; };
  if (!existsSync(dir)) return problems;
  if (!need(dir, constants.R_OK | constants.W_OK | constants.X_OK)) return problems;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; /* gone meanwhile */ }
    if (st.isDirectory()) {
      if (name !== "quarantine") continue; // archive/ is never loaded; it stays as it is
      if (!need(p, constants.R_OK | constants.W_OK | constants.X_OK)) continue;
      for (const q of readdirSync(p)) need(join(p, q), constants.R_OK | constants.W_OK);
    } else need(p, constants.R_OK | constants.W_OK);
  }
  return problems;
}

export class DataDirLock {
  readonly path: string;
  private socket: Server | undefined;
  private token: string | undefined;
  private readonly platform: string;
  constructor(readonly dataDir: string, private readonly role: LockRole = "server", opts: { platform?: string } = {}) {
    this.path = join(dataDir, "server.lock");
    this.platform = opts.platform ?? process.platform;
  }

  /** The record in `server.lock`, if it is readable. */
  record(): LockRecord | undefined {
    try {
      const r = JSON.parse(readFileSync(this.path, "utf8")) as LockRecord;
      return Number(r.pid) > 0 ? { ...r, pid: Number(r.pid) } : undefined;
    } catch { return undefined; }
  }

  get held(): boolean { return this.token !== undefined; }

  /**
   * Take the data directory, or throw DataDirLocked (someone holds it) or DataDirUnusable (this user can't create or
   * write it). Creates a missing directory, private (B-08: a fresh host's first start). Returns a note when a record
   * left by a process that is no longer running was replaced.
   */
  async acquire(): Promise<string | undefined> {
    if (this.held) throw new Error("this lock is already held");
    try { mkdirSync(this.dataDir, { recursive: true, mode: 0o700 }); }
    catch (e) { if (accessErr(e)) throw new DataDirUnusable(this.dataDir, [`it can't be created (${(e as NodeJS.ErrnoException).code})`]); throw e; }
    try { accessSync(this.dataDir, constants.R_OK | constants.W_OK | constants.X_OK); }
    catch (e) { throw new DataDirUnusable(this.dataDir, [`the directory is not readable and writable (${(e as NodeJS.ErrnoException).code})`]); }
    const leftover = existsSync(this.path);
    const previous = this.record();
    if (this.platform === "linux") {
      const st = statSync(this.dataDir, { bigint: true });
      const name = `\0christmas-game-night/data-dir/${st.dev}:${st.ino}`;
      const socket = createServer((c) => c.destroy());
      try {
        await new Promise<void>((resolve, reject) => {
          socket.once("error", reject);
          socket.listen({ path: name, exclusive: true }, () => { socket.off("error", reject); resolve(); });
        });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") throw new DataDirLocked(this.dataDir, await this.holderRecord());
        throw e;
      }
      socket.unref(); // held for the process's life without keeping it alive
      this.socket = socket;
    } else if (previous && previous.pid !== process.pid && alive(previous.pid)) {
      throw new DataDirLocked(this.dataDir, previous); // best effort only, off Linux (development)
    }
    this.token = randomBytes(12).toString("hex");
    try {
      const tmp = `${this.path}.tmp-${process.pid}-${this.token}`;
      writeFileSync(tmp, JSON.stringify({ pid: process.pid, role: this.role, host: hostname(), startedAt: new Date().toISOString(), token: this.token } satisfies LockRecord), { mode: 0o600 });
      renameSync(tmp, this.path);
    } catch (e) {
      await this.release();
      if (accessErr(e)) throw new DataDirUnusable(this.dataDir, [`its lock record can't be written (${(e as NodeJS.ErrnoException).code})`]);
      throw e;
    }
    const notes: string[] = [];
    if (this.platform !== "linux") notes.push("on this system (not Linux) one process per data directory is not enforced: start only one server per data directory");
    if (leftover && previous?.pid !== process.pid) notes.push(`took over a stale lock left by a process that is no longer running (${previous ? `pid ${previous.pid}${previous.role ? `, ${previous.role}` : ""}` : "an unreadable record"})`);
    return notes.length ? notes.join("; ") : undefined;
  }

  /**
   * The holder's record, for the refusal message. The holder writes it right after binding, so a start that loses a
   * close race may briefly find none yet, or a crashed process's old one: wait a moment for a live holder's.
   */
  private async holderRecord(): Promise<LockRecord | undefined> {
    for (let i = 0; i < 20; i++) {
      const r = this.record();
      if (r && alive(r.pid)) return r;
      await new Promise((res) => setTimeout(res, 10));
    }
    return undefined;
  }

  /** Give the directory up: remove our record (only ours), then free the exclusion. */
  async release(): Promise<void> {
    const token = this.token;
    this.token = undefined;
    if (token !== undefined) {
      try { if (this.record()?.token === token) unlinkSync(this.path); } catch { /* already gone */ }
    }
    const socket = this.socket;
    this.socket = undefined;
    if (socket) await new Promise<void>((res) => socket.close(() => res()));
  }
}
