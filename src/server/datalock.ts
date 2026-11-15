/**
 * Beta R1 (docs/beta/beta-r1.md §2): one server process writes a data directory. A second one started on the same
 * directory (a double start, a stuck deploy) would overwrite rooms the first one holds in memory, so it is refused.
 *
 * The lock is a file, `server.lock`, created exclusively and holding the owner's pid. A lock whose process is gone (a
 * crash, a kill -9) is stale and taken over. A lock naming this very pid is stale too: in a container the server is
 * often pid 1 on every start, so the previous container's lock names "us". This protects one host; two hosts sharing a
 * network volume are not supported (docs/beta/beta-r1-architecture.md).
 */
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export class DataDirLocked extends Error {
  constructor(readonly path: string, readonly pid: number) {
    super(`Another server (pid ${pid}) is using this data directory (${path}). Stop it first: one server writes a data directory.`);
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

export class DataDirLock {
  readonly path: string;
  private held = false;
  constructor(dataDir: string) { this.path = join(dataDir, "server.lock"); }

  /** Take the lock, or throw DataDirLocked. Returns a note when a stale lock was taken over. */
  acquire(): string | undefined {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(this.path, "wx");
        try { writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() })); } finally { closeSync(fd); }
        this.held = true;
        return attempt === 0 ? undefined : "took over a stale lock left by a server that is no longer running";
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST" || attempt > 0) throw e;
        let pid = 0;
        try { pid = Number((JSON.parse(readFileSync(this.path, "utf8")) as { pid?: unknown }).pid) || 0; } catch { /* unreadable: stale */ }
        if (pid > 0 && pid !== process.pid && alive(pid)) throw new DataDirLocked(this.path, pid);
        try { unlinkSync(this.path); } catch { /* gone already */ }
      }
    }
    throw new Error("unreachable");
  }

  release(): void {
    if (!this.held) return;
    this.held = false;
    try {
      const pid = Number((JSON.parse(readFileSync(this.path, "utf8")) as { pid?: unknown }).pid);
      if (pid === process.pid) unlinkSync(this.path);
    } catch { /* already gone */ }
  }
}
