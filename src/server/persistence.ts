/**
 * Crash-safe room persistence for the local server.
 *
 * Recovery model (what is and is not guaranteed):
 * - Every snapshot is written to a temp file in the same directory,
 *   fsynced, then renamed over the live file. A crash or kill at any point
 *   leaves either the previous complete snapshot or the new complete one,
 *   never a torn file. (rename is atomic within one filesystem on POSIX
 *   and on NTFS; the directory fsync that makes the rename itself durable
 *   across power loss is best-effort and unavailable on Windows.)
 * - Before replacing a snapshot, the previous one is copied to
 *   `<room>.json.prev`. If the live file is ever found damaged (disk
 *   corruption, manual edit), the room is restored from `.prev` and the
 *   damaged file is moved to `quarantine/`, never deleted or overwritten.
 * - Each room file is validated and restored independently: one bad file
 *   can never stop other rooms loading.
 * - The room snapshot and its Memory Book are separate files with no
 *   cross-file transaction. Each is individually atomic; a crash between
 *   the two writes can leave the book one change behind the room. The
 *   book only references ledger event ids, which are append-only, so a
 *   lagging book is consistent, just missing its latest entry.
 *
 * Snapshot format:
 * - v1 (handoff): the bare RoomEngine.toJSON() object; the host-claim
 *   token lived in plaintext in a separate `<room>.claim.json`.
 * - v2: { format: 2, savedAt, hostClaimHash, room }. The claim is stored
 *   as a SHA-256 hash inside the same atomic file, removing the
 *   two-file inconsistency. v1 files (and legacy claim files) are read
 *   as-is; a room is rewritten as v2 only on its next change. Nothing is
 *   migrated in bulk and legacy files are never deleted.
 */
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { GAME_REGISTRY } from "../games/registry.js";
import { hashToken } from "../shared/protocol.js";

export const SNAPSHOT_FORMAT = 2;
const TMP_MARKER = ".tmp-";

/** Test seam: lets tests simulate a crash between write and rename. */
export interface AtomicWriteHooks {
  beforeRename?: (tmpPath: string) => void;
}

/** Write `data` to `path` so that readers only ever see the old or the new complete content. */
export function atomicWriteFileSync(path: string, data: string, hooks: AtomicWriteHooks = {}): void {
  const tmp = `${path}${TMP_MARKER}${process.pid}-${randomBytes(4).toString("hex")}`;
  let fd: number | null = openSync(tmp, "w");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    hooks.beforeRename?.(tmp);
    renameSync(tmp, path);
  } catch (err) {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
    try { unlinkSync(tmp); } catch { /* never created or already renamed */ }
    throw err;
  }
  // Make the rename itself durable. Not supported on every platform
  // (Windows), where NTFS journaling covers the metadata update.
  try {
    const dfd = openSync(dirname(path), "r");
    try { fsyncSync(dfd); } finally { closeSync(dfd); }
  } catch { /* best effort */ }
}

// ---------- validation ----------

const KNOWN_GAMES = new Set(GAME_REGISTRY.map((g) => g.id));
const num = z.number().finite();

const PlayerRecord = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  avatar: z.string(),
  isHost: z.boolean(),
  isCohost: z.boolean(),
  connected: z.boolean(),
  recoveryTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  joinedAt: num,
  // Sprint 2 fields: optional, so rooms saved before them load with defaults.
  disconnectedAt: num.nullable().optional(),
  credentialVersion: z.number().int().nonnegative().optional(),
  recoveryCodeHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
}).passthrough();

const SpectatorRecord = z.object({
  id: z.string().min(1),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  connected: z.boolean(),
  joinedAt: num,
}).passthrough();

const GameRecord = z.object({
  id: z.string().min(1),
  gameId: z.string().refine((g) => KNOWN_GAMES.has(g), { message: "unknown game type" }),
  official: z.boolean(),
  status: z.enum(["playing", "finished"]),
  players: z.array(z.string()),
  answers: z.record(z.unknown()),
  answerTimes: z.record(z.unknown()),
  rawScores: z.record(num),
  seed: num,
}).passthrough();

const LedgerRecord = z.object({
  eventId: z.string(),
  seq: num,
  type: z.string(),
  createdAt: num,
}).passthrough();

export const RoomSnapshotSchema = z.object({
  id: z.string().min(1),
  joinCode: z.string().min(1),
  name: z.string(),
  hostId: z.string().nullable(),
  cohosts: z.array(z.string()),
  championshipDay: num.optional(),
  players: z.array(PlayerRecord),
  spectators: z.array(SpectatorRecord).optional(),
  games: z.array(GameRecord),
  ledger: z.array(LedgerRecord),
  seq: num,
  seenIntents: z.array(z.tuple([z.string(), z.unknown()])),
  nextPlayer: num,
  nextSpectator: num.optional(),
  nextGame: num,
}).passthrough().superRefine((room, ctx) => {
  const ids = new Set(room.players.map((p) => p.id));
  if (ids.size !== room.players.length) ctx.addIssue({ code: "custom", message: "duplicate player ids" });
  if (room.hostId !== null && !ids.has(room.hostId)) ctx.addIssue({ code: "custom", message: `hostId ${room.hostId} is not a player` });
  const gameIds = new Set<string>();
  for (const g of room.games) {
    if (gameIds.has(g.id)) ctx.addIssue({ code: "custom", message: `duplicate game id ${g.id}` });
    gameIds.add(g.id);
    const stranger = g.players.find((p) => !ids.has(p));
    if (stranger) ctx.addIssue({ code: "custom", message: `game ${g.id} lists unknown player ${stranger}` });
  }
});

export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export class SnapshotError extends Error {}

export interface DecodedSnapshot {
  format: 1 | 2;
  room: Record<string, unknown>;
  hostClaimHash: string | null;
}

function describeZod(err: z.ZodError): string {
  return err.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/** Parse and validate one snapshot file's text. Throws SnapshotError with a human reason. */
export function decodeSnapshot(text: string): DecodedSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new SnapshotError(`not valid JSON (truncated or corrupt): ${(err as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new SnapshotError("not a JSON object");
  const obj = data as Record<string, unknown>;
  let format: 1 | 2;
  let room: unknown;
  let hostClaimHash: string | null = null;
  if (obj["format"] === undefined) {
    format = 1;
    room = obj;
  } else if (obj["format"] === 2) {
    format = 2;
    room = obj["room"];
    const h = obj["hostClaimHash"];
    if (h !== null && h !== undefined && (typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h))) throw new SnapshotError("hostClaimHash is malformed");
    hostClaimHash = (h as string | null | undefined) ?? null;
  } else {
    throw new SnapshotError(`unsupported snapshot format ${JSON.stringify(obj["format"])} (written by a newer version?)`);
  }
  const parsed = RoomSnapshotSchema.safeParse(room);
  if (!parsed.success) throw new SnapshotError(`invalid room data: ${describeZod(parsed.error)}`);
  return { format, room: room as Record<string, unknown>, hostClaimHash };
}

export function encodeSnapshot(room: Record<string, unknown>, hostClaimHash: string | null): string {
  return JSON.stringify({ format: SNAPSHOT_FORMAT, savedAt: new Date().toISOString(), hostClaimHash, room }, null, 2);
}

// ---------- store ----------

export interface RestoredRoom {
  file: string;
  room: Record<string, unknown>;
  hostClaimHash: string | null;
  book: Record<string, unknown> | null;
  format: 1 | 2;
  recoveredFromPrevious: boolean;
}

export interface RestoreReport {
  dataDir: string;
  loaded: { file: string; roomId: string; format: 1 | 2; recoveredFromPrevious: boolean }[];
  failed: { file: string; reason: string }[];
  warnings: { file: string; message: string }[];
  quarantined: { file: string; movedTo: string; reason: string }[];
}

const isRoomFile = (f: string) => f.endsWith(".json") && !f.endsWith(".book.json") && !f.endsWith(".claim.json") && !f.includes(TMP_MARKER);

export class RoomStore {
  constructor(readonly dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
  }

  roomPath(roomId: string): string { return join(this.dataDir, `${roomId}.json`); }
  bookPath(roomId: string): string { return join(this.dataDir, `${roomId}.book.json`); }
  legacyClaimPath(roomId: string): string { return join(this.dataDir, `${roomId}.claim.json`); }
  private quarantineDir(): string { return join(this.dataDir, "quarantine"); }

  saveRoom(roomId: string, room: Record<string, unknown>, hostClaimHash: string | null): void {
    const path = this.roomPath(roomId);
    // Keep the previous complete snapshot as a fallback generation.
    if (existsSync(path)) atomicCopy(path, `${path}.prev`);
    atomicWriteFileSync(path, encodeSnapshot(room, hostClaimHash));
  }

  saveBook(roomId: string, book: Record<string, unknown>): void {
    atomicWriteFileSync(this.bookPath(roomId), JSON.stringify(book, null, 2));
  }

  /** Move a file aside without deleting it. Returns the new path. */
  quarantine(path: string, reason: string, report: RestoreReport): string {
    mkdirSync(this.quarantineDir(), { recursive: true });
    const target = join(this.quarantineDir(), `${basename(path)}.${new Date().toISOString().replace(/[:.]/g, "-")}`);
    renameSync(path, target);
    report.quarantined.push({ file: basename(path), movedTo: target, reason });
    return target;
  }

  /** Restore every valid room independently. Never throws for a single bad file. */
  restoreAll(): { rooms: RestoredRoom[]; report: RestoreReport } {
    const report: RestoreReport = { dataDir: this.dataDir, loaded: [], failed: [], warnings: [], quarantined: [] };
    const rooms: RestoredRoom[] = [];
    let names: string[];
    try {
      names = readdirSync(this.dataDir).sort();
    } catch (err) {
      report.failed.push({ file: this.dataDir, reason: `cannot list data directory: ${(err as Error).message}` });
      return { rooms, report };
    }
    // Leftover temp files are writes that never completed; the live file
    // they were meant to replace is intact. Move them aside, never delete.
    for (const name of names.filter((n) => n.includes(TMP_MARKER))) {
      try { this.quarantine(join(this.dataDir, name), "incomplete write (temp file left by an interrupted save)", report); } catch (err) {
        report.warnings.push({ file: name, message: `could not quarantine leftover temp file: ${(err as Error).message}` });
      }
    }
    const seen = new Map<string, string>();
    for (const name of names.filter(isRoomFile)) {
      const path = join(this.dataDir, name);
      const result = this.restoreOne(path, report);
      if (!result) continue;
      const roomId = String(result.room["id"]);
      if (seen.has(roomId)) {
        report.failed.push({ file: name, reason: `duplicate room id ${roomId} (already loaded from ${seen.get(roomId)})` });
        continue;
      }
      if (name !== `${roomId}.json`) report.warnings.push({ file: name, message: `file name does not match room id ${roomId}` });
      seen.set(roomId, name);
      rooms.push(result);
      report.loaded.push({ file: name, roomId, format: result.format, recoveredFromPrevious: result.recoveredFromPrevious });
    }
    return { rooms, report };
  }

  private restoreOne(path: string, report: RestoreReport): RestoredRoom | null {
    const name = basename(path);
    let decoded: DecodedSnapshot;
    let recoveredFromPrevious = false;
    try {
      decoded = decodeSnapshot(readFileSync(path, "utf8"));
    } catch (err) {
      const reason = err instanceof SnapshotError ? err.message : `unreadable: ${(err as Error).message}`;
      const prevPath = `${path}.prev`;
      let prev: DecodedSnapshot | null = null;
      if (existsSync(prevPath)) {
        try { prev = decodeSnapshot(readFileSync(prevPath, "utf8")); } catch { prev = null; }
      }
      if (!prev) {
        // Leave the damaged file exactly where it is: it may be hand-recoverable,
        // and new rooms never reuse its name, so nothing will overwrite it.
        report.failed.push({ file: name, reason });
        return null;
      }
      // Recover the previous generation, but first move the damaged file
      // aside so the next save cannot overwrite it.
      try {
        this.quarantine(path, `damaged (${reason}); room restored from ${basename(prevPath)}`, report);
      } catch (qerr) {
        report.failed.push({ file: name, reason: `${reason}; a valid .prev exists but the damaged file could not be moved aside (${(qerr as Error).message}), so the room was not restored` });
        return null;
      }
      decoded = prev;
      recoveredFromPrevious = true;
      report.warnings.push({ file: name, message: `restored from ${basename(prevPath)}; the most recent change may be missing` });
    }
    const roomId = String(decoded.room["id"]);
    let hostClaimHash = decoded.hostClaimHash;
    if (decoded.format === 1 && hostClaimHash === null) {
      const legacy = this.legacyClaimPath(roomId);
      if (existsSync(legacy)) {
        try {
          const token = (JSON.parse(readFileSync(legacy, "utf8")) as Record<string, unknown>)["hostClaimToken"];
          if (typeof token === "string" && token) hostClaimHash = hashToken(token);
          else report.warnings.push({ file: basename(legacy), message: "legacy claim file has no token; host claim unavailable for this room" });
        } catch (err) {
          report.warnings.push({ file: basename(legacy), message: `legacy claim file unreadable (${(err as Error).message}); host claim unavailable for this room` });
        }
      }
    }
    let book: Record<string, unknown> | null = null;
    const bookPath = this.bookPath(roomId);
    if (existsSync(bookPath)) {
      try {
        const data = JSON.parse(readFileSync(bookPath, "utf8")) as Record<string, unknown>;
        if (!Array.isArray(data["entries"])) throw new Error("no entries array");
        book = data;
      } catch (err) {
        // The room still loads; the book file is left untouched for recovery.
        report.warnings.push({ file: basename(bookPath), message: `Memory Book not restored (${(err as Error).message}); the room loaded without it and the file was left in place` });
      }
    }
    return { file: name, room: decoded.room, hostClaimHash, book, format: decoded.format, recoveredFromPrevious };
  }
}

function atomicCopy(from: string, to: string): void {
  // Copy to a temp name, then rename, so `.prev` is never torn either.
  const tmp = `${to}${TMP_MARKER}${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    copyFileSync(from, tmp);
    renameSync(tmp, to);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw err;
  }
}
