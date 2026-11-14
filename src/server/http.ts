import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { FamilyQuestionInput } from "../shared/familyPack.js";
import { BriefingRefused, ContentShortage, CupUpgradeRefused, FamilyRefused, FinishRefused, TeamsRefused, HostRefused, PartyRefused, ROOM_KINDS, RoomEngine, SessionRefused, StartRefused, type RoomPlayer } from "./room.js";
import { isClientPath } from "../shared/clientRoutes.js";
import { GAME_REGISTRY, getGame, isCooperative, isMemoryBookTeam } from "../games/registry.js";
import { GAME_POLICIES } from "./lifecycle.js";
import { z } from "zod";
import type { ContentLibrary } from "../content/registry.js";
import { parseClientProtocol, PROTOCOL_HEADER, PROTOCOL_PARAM } from "../shared/clientProtocol.js";
import { attemptFingerprint, MemoryBook, MemoryRefused, teamFactsFor, type MemoryBookEntry, type SourceContext } from "./memorybook.js";
import { bookModeOf, type BookContext, type BookMode } from "../shared/memoryPresent.js";
import { hashToken } from "../shared/protocol.js";
import { isSessionSeason, SESSION_SEASONS, type SessionSeason } from "../shared/season.js";
import { RoomStore, type RestoreReport } from "./persistence.js";
import { FailureLimiter, PendingRecoveries } from "./recovery.js";

/** A change was applied in memory but could not be written to disk. */
class PersistError extends Error {
  constructor(message = "The room could not be saved to disk, so this change may not survive a server restart. Tell the host.") {
    super(message);
  }
}

/** Stage 5.1: how often every open socket hears "alive" (clients judge staleness after 8 s). */
export const ALIVE_MS = 4_000;

export interface ServerOptions {
  port?: number;
  dataDir?: string;
  /** Directory holding the built web app (index.html + assets/). Defaults to apps/web/dist. */
  webDistDir?: string;
  /** Server clock (tests inject a fake one). Presence and grace periods use only this. */
  clock?: () => number;
  /**
   * WebSocket heartbeat interval. A locked phone often leaves a half-open
   * TCP connection that never closes on its own; a socket that misses one
   * ping/pong round is terminated so its player shows as reconnecting.
   * null disables it (tests drive disconnects explicitly). Default 15s.
   */
  heartbeatMs?: number | null;
  /**
   * Game deadlines (Sprint 3): one server-wide sweep, not a timer per room
   * or per game. It only catches deadlines nobody triggers: every request
   * and socket action already processes due deadlines first, so the sweep
   * interval bounds how late a "Time's up" can appear, never correctness.
   * null disables it (tests call lifecycleSweep() with a fake clock). Default 1s.
   */
  lifecycleSweepMs?: number | null;
  /**
   * TESTING ONLY: multiply every game/phase duration (e.g. 0.1 makes a
   * 6-minute game last 36 s) so browser drivers can test deadlines in real
   * time. Default 1. serve.ts refuses it when NODE_ENV=production.
   */
  lifecycleScale?: number;
  /** Content library for every room (tests inject fixtures). Default: the shipped packs. */
  content?: ContentLibrary;
  /**
   * D3: the timing version of Cups created through POST /rooms. Default 2,
   * the approved rules-and-ready briefing. Tests of timing-v1 behaviour
   * (every Cup created before D3) pass 1 (decision D-UX-09).
   */
  newCupTiming?: 1 | 2;
}

interface SocketMeta {
  roomId: string;
  actorId: string;
  audience: "player" | "tv" | "host" | "cohost" | "spectator";
  /** Protocol version the client announced (undefined: a tab from before Sprint 3). */
  clientProtocol?: number;
  /** Set only for spectator sockets: the viewer whose presence this socket holds. */
  spectatorId?: string;
  /** The slot's credentialVersion when this socket authenticated. A socket from a replaced credential is stale. */
  credentialVersion?: number;
  /** Heartbeat: false after a ping until the pong arrives. */
  alive?: boolean;
}

/** Close code for a socket whose session credential was replaced (seat recovered elsewhere). */
export const WS_SESSION_REPLACED = 4001;

/**
 * Local HTTP + WebSocket adapter around RoomEngine.
 * LOCAL only — not a Cloudflare Durable Object. After every mutation the
 * room is saved atomically (src/server/persistence.ts), so a restart restores
 * players, games, deadlines, ledger, and deduplication state, and each room
 * restores independently of any damaged file.
 */
/** Stage 10.4 (D-S104-05): how long close() waits for clients to say goodbye before cutting them off. */
const SHUTDOWN_GRACE_MS = 1500;

export class LocalServer {
  rooms = new Map<string, RoomEngine>();
  private books = new Map<string, MemoryBook>();
  /**
   * Host-claim tokens (review #4): creating a room returns a one-time
   * capability that binds the initial host privilege to the creator.
   * Claiming host without it is rejected at the HTTP boundary, so a
   * stranger who only knows the room id or code cannot grab host while
   * the creator's room is still hostless. Only the token's SHA-256 hash
   * is kept, inside the room's own snapshot (persistence.ts, format v2),
   * so a restart does not orphan a hostless room and no plaintext
   * capability sits on disk. A host claim for a room with no claim on
   * record is refused (it used to be accepted when the token was absent).
   * Once a host exists, the token no longer grants host (engine join
   * only makes the first host when hostId is null), so a reused token
   * just joins as a regular player.
   */
  private hostClaimHashes = new Map<string, string>();
  /** What the last startup restore did: rooms loaded, files that failed, files quarantined. */
  restoreReport: RestoreReport;
  /**
   * Live reactions (M6.5): ephemeral, scoring-free, never persisted and never
   * in the ledger. Per room: recent reactions, per-player rate-limit stamps,
   * and a host mute flag. Projections only carry reactions younger than
   * 15 seconds, so a reaction is a brief moment, not a permanent record.
   */
  private reactions = new Map<string, { emoji: string; sender: string; ts: number }[]>();
  private reactionStamps = new Map<string, number[]>();
  private reactionsMuted = new Map<string, boolean>();
  /**
   * Stage 3 QA (S3-LOB-02): what the host plans to start next, and whether it
   * counts. Shown on every screen so guests can tell Official from Practice
   * before the briefing. It is only a plan: starting is still the host's
   * Start, and the server still enforces every start rule. In memory only;
   * the host's tab publishes it again if it's missing (e.g. after a restart).
   */
  private lobbyPlans = new Map<string, { gameId: string; official: boolean }>();
  static readonly PlanSchema = z.object({ gameId: z.string().min(1).max(64), official: z.boolean() }).strict();
  /** Stage 12.7: a change to the night's teams. */
  static readonly TeamsSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("make"), count: z.number().int().min(2).max(4) }).strict(),
    z.object({ action: z.literal("move"), playerId: z.string().min(1).max(128), teamId: z.string().min(1).max(64), baseRevision: z.number().int().min(0).optional() }).strict(),
    z.object({ action: z.literal("rename"), teamId: z.string().min(1).max(64), name: z.string().max(200) }).strict(),
    z.object({ action: z.literal("play"), on: z.boolean() }).strict(),
    z.object({ action: z.literal("clear") }).strict(),
  ]);
  /** Stage 12.5: a new Family Question (the room checks it with src/shared/familyPack.ts; this only bounds the shape). */
  static readonly FamilyQuestionSchema = z.object({
    kind: z.enum(["choice", "who"]),
    prompt: z.string().max(1000),
    options: z.array(z.string().max(500)).max(8).optional(),
    correctIndex: z.number().int().min(0).max(7).optional(),
    answerPlayerId: z.string().min(1).max(128).optional(),
  }).strict();
  /** Stage 7.1: save or clear the room's Quick Party lineup (RoomEngine.savePartyPlan checks the rest). */
  static readonly PartyBodySchema = z.union([
    z.object({
      baseRevision: z.number().int().min(0),
      plan: z.object({
        expectedPlayers: z.number().int().min(1).max(10),
        budgetMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        // Stage 12.3 (D-S123-01): `official` marks an item Official in a Family Cup's lineup (the room checks it).
        items: z.array(z.object({ gameId: z.string().min(1).max(64), official: z.boolean().optional() }).strict()).min(1).max(8),
      }).strict(),
    }).strict(),
    z.object({ baseRevision: z.number().int().min(0), clear: z.literal(true) }).strict(),
  ]);
  /** Stage 7.2: Take a break / Resume. */
  /** Stage 7.2 (§3.8): one press of a continuation control: its own id (the same for its retries) and the session revision it was made against. */
  static readonly AttemptSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), sessionRevision: z.number().int().min(0) }).strict();
  static readonly BreakSchema = z.object({ on: z.boolean(), attempt: LocalServer.AttemptSchema }).strict();
  /** Stage 8.2: a casual room's content (host/cohost), against the session revision the host saw. */
  static readonly SeasonSchema = z.object({ season: z.enum(SESSION_SEASONS), baseRevision: z.number().int().min(0) }).strict();
  // Stage 9.1: the settings themselves are checked by the game (src/games/settings.ts).
  static readonly GameSettingsSchema = z.object({ gameId: z.string().min(1).max(64), settings: z.record(z.unknown()), baseRevision: z.number().int().min(0) }).strict();
  /** Stage 7.3: hand the host role to `targetId` (one press: its id and the session revision it was made against). */
  static readonly HostSchema = z.object({ targetId: z.string().min(1).max(64), attempt: LocalServer.AttemptSchema }).strict();
  /** Stage 7.1: the `party` marker on a game start: which lineup item this start is. */
  static readonly PartyStartSchema = z.object({ revision: z.number().int().min(0), index: z.number().int().min(0).max(7) }).strict();
  /** Stage 6.1: POST /rooms. A missing kind means a Family Cup, as before room kinds. */
  static readonly CreateRoomSchema = z.object({
    name: z.string().max(80).optional(),
    kind: z.enum(ROOM_KINDS).optional(),
    // Stage 12.2 (D-S122-04): a casual room's starting content, from the host's pinned look (casual rooms only).
    contentSeason: z.enum(["everyday", "christmas"]).optional(),
  }).passthrough();
  /** Ephemeral nudges (see the /nudge endpoint): never persisted, never ledger. */
  private nudges = new Map<string, { fromId: string; targetId: string; ts: number }[]>();
  private nudgeStamps = new Map<string, number[]>();
  static readonly REACTION_SET = ["🎄", "❄️", "🎉", "👏", "😂", "🔥"];
  /**
   * Stage 5.1 (O-07): each room's revision, sent with every projection and
   * bumped on every broadcast (every change the room is told about), so a
   * phone can tell an older poll reply from a newer push even when the
   * ledger `seq` hasn't moved (e.g. a Majority Rules round changing). Kept in
   * memory only; it starts from the clock at startup, so it keeps rising
   * across a restart. A change that isn't broadcast just isn't bumped: the
   * reply is then shown as before, never frozen.
   */
  private revs = new Map<string, number>();
  private readonly revBase = Date.now();
  private revOf(roomId: string): number { return this.revs.get(roomId) ?? this.revBase; }
  private projectFor(room: RoomEngine, audience: "player" | "tv" | "host" | "cohost" | "spectator", actorId?: string, clientProtocol?: number): Record<string, unknown> {
    const now = Date.now();
    const recent = (this.reactions.get(room.id) ?? []).filter((r) => now - r.ts < 15000);
    const nudgedBy = actorId
      ? [...new Set((this.nudges.get(room.id) ?? []).filter((n) => n.targetId === actorId && now - n.ts < 10000).map((n) => n.fromId))]
      : [];
    // Spectators receive exactly the public TV projection — never a player
    // view, never private state. The engine's "tv" audience is that projection.
    // Stage 7.3: a host or cohost audience is checked against the room every
    // time (a socket keeps the audience it connected with): a former host's
    // socket is served the ordinary player projection.
    const who = actorId ? room.players.get(actorId) : undefined;
    const current = audience === "host" && !who?.isHost ? "player" : audience === "cohost" && !who?.isHost && !who?.isCohost ? "player" : audience;
    const engineAudience = current === "spectator" ? "tv" : current;
    const plan = this.lobbyPlans.get(room.id);
    // Stage 10.5 (D-S105-02): members' projections carry the book's revision (so the poll and every push deliver it);
    // the TV's and spectators' never do.
    const member = engineAudience !== "tv" && !!who;
    const base = { ...room.project(engineAudience, actorId, { clientProtocol }), rev: this.revOf(room.id), reactions: recent, reactionsMuted: this.reactionsMuted.get(room.id) ?? false, nudgedBy, ...(plan ? { upNext: plan } : {}), ...(member ? { memoryRevision: this.bookRevision(room.id) } : {}) };
    // Host-assisted recovery requests: host/cohost only. Shows the seat and
    // the match code to compare; never the requester's secret.
    const me = actorId ? room.players.get(actorId) : undefined;
    if (audience !== "tv" && audience !== "spectator" && me && (me.isHost || me.isCohost)) {
      const t = this.clock();
      return {
        ...base,
        recoveryRequests: this.recoveries.pending(room.id).map((r) => ({
          requestId: r.id,
          playerId: r.playerId,
          displayName: room.players.get(r.playerId)?.displayName ?? "A player",
          matchCode: r.matchCode,
          ageMs: t - r.createdAt,
          expiresInMs: r.expiresAt - t,
        })),
      };
    }
    return base;
  }
  private store: RoomStore;
  private http = createServer((req, res) => void this.handleHttp(req, res));
  private wss = new WebSocketServer({ server: this.http });
  private sockets = new Set<{ ws: WebSocket; meta: SocketMeta }>();

  private webDistDir: string;

  readonly clock: () => number;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Stage 5.1: a small "alive" frame on every socket, so a screen can tell a quiet room from a dead link. */
  private aliveTimer: ReturnType<typeof setInterval> | null = null;
  private lifecycleTimer: ReturnType<typeof setInterval> | null = null;
  private readonly lifecycleScale: number;
  private readonly newCupTiming: 1 | 2;
  private readonly contentLib?: ContentLibrary;
  /** Seat recovery: brute-force limits (contract §1.5) and pending host-assisted requests. */
  private recoveries: PendingRecoveries;
  private codeFailuresPerAddressPerRoom: FailureLimiter;
  private codeFailuresPerRoom: FailureLimiter;
  private codeFailuresPerAddress: FailureLimiter;
  private requestLimiter: FailureLimiter;

  constructor(opts: ServerOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.contentLib = opts.content;
    this.newCupTiming = opts.newCupTiming ?? 2;
    this.lifecycleScale = opts.lifecycleScale !== undefined && Number.isFinite(opts.lifecycleScale) && opts.lifecycleScale > 0 ? opts.lifecycleScale : 1;
    this.recoveries = new PendingRecoveries(this.clock);
    // Failed recovery-code attempts, 15-minute windows: 5 per device per
    // room (the contract's per-slot limit, keyed by device because a wrong
    // code identifies no slot), 30 per room, 20 per device across rooms.
    this.codeFailuresPerAddressPerRoom = new FailureLimiter(5, 15 * 60_000, this.clock);
    this.codeFailuresPerRoom = new FailureLimiter(30, 15 * 60_000, this.clock);
    this.codeFailuresPerAddress = new FailureLimiter(20, 15 * 60_000, this.clock);
    // Host-assisted requests created (successful or not), per device: 5 per 15 minutes.
    this.requestLimiter = new FailureLimiter(5, 15 * 60_000, this.clock);
    this.store = new RoomStore(opts.dataDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data"));
    this.webDistDir = resolve(opts.webDistDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "web", "dist"));
    this.restoreReport = this.loadSnapshots();
    this.wss.on("connection", (ws, req) => this.handleWs(ws, req));
    const beat = opts.heartbeatMs === undefined ? 15_000 : opts.heartbeatMs;
    if (beat !== null) {
      // One timer for the whole server (not per player), unref'd so it never keeps the process alive.
      this.heartbeat = setInterval(() => this.heartbeatTick(), beat);
      this.heartbeat.unref();
      this.aliveTimer = setInterval(() => this.aliveTick(), ALIVE_MS);
      this.aliveTimer.unref();
    }
    const sweep = opts.lifecycleSweepMs === undefined ? 1_000 : opts.lifecycleSweepMs;
    if (sweep !== null) {
      this.lifecycleTimer = setInterval(() => this.lifecycleSweep(), sweep);
      this.lifecycleTimer.unref();
    }
    // A restart processes everything that fell due while the server was down.
    this.lifecycleSweep();
  }

  /**
   * Stage 5.1 (S5-AUD-04/07): tell every open socket the server is there.
   * Pushes only happen when the room changes, so a quiet room was
   * indistinguishable from a dead link; screens now count any frame as live.
   * No room data in it.
   */
  private aliveTick(): void {
    const frame = JSON.stringify({ kind: "alive", at: this.clock() });
    for (const { ws } of this.sockets) if (ws.readyState === 1) { try { ws.send(frame); } catch { /* the heartbeat cleans up dead sockets */ } }
  }

  /** Process due game deadlines in every room; save and broadcast rooms that changed. */
  lifecycleSweep(): number {
    let changed = 0;
    for (const room of this.rooms.values()) if (this.tickRoom(room)) changed++;
    return changed;
  }

  /** Process due deadlines for one room; on change, save before anyone sees it. */
  private tickRoom(room: RoomEngine): boolean {
    let did: boolean;
    try {
      did = room.tick();
    } catch (err) {
      console.error(`[lifecycle] room ${room.id}: ${(err as Error).message}`);
      return false;
    }
    if (!did) return false;
    try {
      this.persist(room);
    } catch {
      // Logged by persist(); state stays in memory and is saved on the next write.
    }
    this.broadcast(room.id);
    return true;
  }

  /** Terminate sockets that did not answer the previous ping; ping the rest. */
  heartbeatTick(): void {
    for (const s of this.sockets) {
      if (s.meta.alive === false) { s.ws.terminate(); continue; }
      s.meta.alive = false;
      try { s.ws.ping(); } catch { /* closing */ }
    }
  }

  /** Is this socket still authenticated with the slot's current credential? */
  private socketCurrent(room: RoomEngine, meta: SocketMeta): boolean {
    if (!meta.actorId) return true;
    const p = room.players.get(meta.actorId);
    return !!p && (p.credentialVersion ?? 0) === (meta.credentialVersion ?? 0);
  }

  /** A live, current-credential socket exists for this slot (other than `except`). */
  private hasLiveSocket(room: RoomEngine, actorId: string, except?: WebSocket): boolean {
    return [...this.sockets].some((s) => s.ws !== except && s.meta.roomId === room.id && s.meta.actorId === actorId && this.socketCurrent(room, s.meta));
  }

  /**
   * Save the room. Throws PersistError so callers answer 500 instead of
   * pretending the change is durable. (The in-memory change has already
   * happened; the next successful save writes the full snapshot again.)
   */
  private persist(room: RoomEngine): void {
    try {
      this.store.saveRoom(room.id, room.toJSON(), this.hostClaimHashes.get(room.id) ?? null);
    } catch (err) {
      console.error(`[persist] could not save room ${room.id}: ${(err as Error).message}`);
      throw new PersistError();
    }
  }

  /**
   * Stage 10.4 repair (review 6842636842; D-S104-06): the only way a room's Memory Book changes. The change is made on
   * a copy of the live book and written to disk; only then does the copy become the live book. If the change is refused
   * or the write fails, the live book (what anyone sees, approves, exports or retries against) stays exactly as it is
   * on disk, and a failed write answers 500. It is synchronous from the copy to the swap, so no other request can see
   * or change the book in between.
   */
  private commitBook<T>(roomId: string, change: (staged: MemoryBook) => T): T {
    const staged = (this.books.get(roomId) ?? new MemoryBook()).clone();
    const result = change(staged);
    // Stage 10.5 (D-S105-01): the revision moves on the staged copy, so it is written with the change and is live only
    // once the write succeeds. A refused change has already thrown; a failed write throws below.
    staged.bumpRevision();
    try {
      this.store.saveBook(roomId, staged.toJSON());
    } catch (err) {
      console.error(`[persist] could not save Memory Book for ${roomId}: ${(err as Error).message}`);
      throw new PersistError("The Memory Book couldn't be saved, so nothing changed. Try again in a moment.");
    }
    this.books.set(roomId, staged);
    this.notifyBook(roomId, staged.revision);
    return result;
  }

  /**
   * Stage 10.5 (D-S105-02): tell this room's members the book moved. Only the revision travels (no text, facts,
   * approvals or keys); pages fetch the snapshot. Only sockets of current members of this room with a current
   * credential get it: never the TV, a spectator, another room, or a replaced or departed seat.
   */
  private notifyBook(roomId: string, revision: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const frame = JSON.stringify({ kind: "book", revision });
    for (const { ws, meta } of this.sockets) {
      if (meta.roomId !== roomId || !meta.actorId || meta.audience === "tv" || meta.audience === "spectator") continue;
      if (!room.players.has(meta.actorId) || !this.socketCurrent(room, meta)) continue;
      if (ws.readyState === 1) ws.send(frame);
    }
  }

  /** Stage 10.5: the book's revision, for member projections (D-S105-02). */
  private bookRevision(roomId: string): number {
    return this.books.get(roomId)?.revision ?? 0;
  }

  /**
   * Session authentication (PR #3 review #1): the recovery token issued at
   * join time is the session credential. Only its SHA-256 hash is stored
   * server-side (in the room engine). Every player-scoped request must
   * present it in the x-session-token header; the actor and role are then
   * derived from the token's player record, never from client-supplied
   * actorId/hostId/approverId/audience fields.
   */
  private sessionPlayer(room: RoomEngine, req: IncomingMessage): RoomPlayer | null {
    const token = req.headers["x-session-token"];
    if (typeof token !== "string" || !token) return null;
    const hash = hashToken(token);
    for (const p of room.players.values()) {
      if (p.recoveryTokenHash === hash) return p;
    }
    return null;
  }

  private requireSession(room: RoomEngine, req: IncomingMessage, res: ServerResponse): RoomPlayer | null {
    const player = this.sessionPlayer(room, req);
    if (!player) this.send(res, 401, { error: "Session token required" });
    return player;
  }

  /**
   * Restore every valid room independently (persistence.ts). A damaged or
   * unreadable file is reported and left in place; it never stops other
   * rooms loading and is never overwritten or deleted.
   */
  private loadSnapshots(): RestoreReport {
    const { rooms, report } = this.store.restoreAll();
    for (const restored of rooms) {
      let room: RoomEngine;
      try {
        room = RoomEngine.fromJSON(restored.room);
      } catch (err) {
        report.failed.push({ file: restored.file, reason: `could not rebuild room: ${(err as Error).message}` });
        report.loaded = report.loaded.filter((l) => l.file !== restored.file);
        continue;
      }
      // Host recovery: no WebSocket exists after a restart, so a
      // snapshot's connected=true flags are stale. Mark every
      // restored player disconnected; each recovers explicitly via
      // /reconnect or a fresh WebSocket open. Without this, phantom
      // players counted toward startGame and blocked games from
      // advancing until a deadline/host-skip.
      // Sprint 2: every restored player starts a reconnect grace window at
      // restart time, so a restart reads as "reconnecting", not "away".
      room.clock = this.clock;
      room.lifecycleScale = this.lifecycleScale;
      if (this.contentLib) room.content = this.contentLib;
      const restartedAt = this.clock();
      for (const p of room.players.values()) { p.connected = false; p.disconnectedAt = restartedAt; }
      // D3 (S6): a briefing is never cancelled without a visible warning while the server is up.
      room.afterRestore(restartedAt);
      // Same for spectators: no socket exists after a restart, so a
      // restored connected=true would inflate the watching count.
      for (const s of room.spectators.values()) s.connected = false;
      this.rooms.set(room.id, room);
      if (restored.hostClaimHash) this.hostClaimHashes.set(room.id, restored.hostClaimHash);
      if (restored.book) {
        try {
          this.books.set(room.id, MemoryBook.fromJSON(restored.book));
        } catch (err) {
          report.warnings.push({ file: `${room.id}.book.json`, message: `Memory Book not restored: ${(err as Error).message}` });
        }
      }
    }
    for (const f of report.failed) console.error(`[restore] NOT LOADED ${f.file}: ${f.reason}`);
    for (const w of report.warnings) console.warn(`[restore] warning ${w.file}: ${w.message}`);
    for (const q of report.quarantined) console.warn(`[restore] moved ${q.file} to ${q.movedTo}: ${q.reason}`);
    if (report.loaded.length || report.failed.length) console.log(`[restore] ${report.loaded.length} room(s) restored, ${report.failed.length} not loaded (data: ${report.dataDir})`);
    return report;
  }

  /** Host claim check: requires a claim on record and a matching token. */
  private hostClaimValid(roomId: string, token: unknown): boolean {
    const expected = this.hostClaimHashes.get(roomId);
    return typeof expected === "string" && typeof token === "string" && token.length > 0 && hashToken(token) === expected;
  }

  async listen(port = 0): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(port, () => {
        const addr = this.http.address();
        resolve(typeof addr === "object" && addr ? addr.port : port);
      });
    });
  }

  /**
   * Stage 10.4 (D-S104-05): shuts down in bounded time, whatever the clients do. Every socket of the WebSocket
   * server gets a close frame first (a polite goodbye), including one refused at the door that is still closing,
   * not only the sessions tracked here. Any socket that hasn't finished its close handshake within the grace is then
   * terminated: a client that never answers would otherwise hold the process open until ws's own 30-second close
   * timeout. HTTP keep-alive connections get the same grace, then are closed.
   */
  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.aliveTimer) clearInterval(this.aliveTimer);
    if (this.lifecycleTimer) clearInterval(this.lifecycleTimer);
    const grace = () => new Promise<void>((resolve) => { setTimeout(resolve, SHUTDOWN_GRACE_MS).unref(); });
    for (const ws of new Set([...this.wss.clients, ...[...this.sockets].map((s) => s.ws)])) {
      try { ws.close(); } catch { /* already closing */ }
    }
    this.sockets.clear();
    const wssClosed = new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await Promise.race([wssClosed, grace()]);
    for (const ws of this.wss.clients) ws.terminate();
    await wssClosed;
    const httpClosed = new Promise<void>((resolve) => this.http.close(() => resolve()));
    this.http.closeIdleConnections();
    await Promise.race([httpClosed, grace()]);
    this.http.closeAllConnections();
    await httpClosed;
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      total += (chunk as Buffer).length;
      if (total > 64 * 1024) throw new Error("PAYLOAD_TOO_LARGE");
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf-8");
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private joinAttempts = new Map<string, number[]>();
  /** Simple local rate limit: max 20 join attempts per room per 60 seconds. */
  private checkJoinRate(roomId: string): boolean {
    const now = Date.now();
    const attempts = (this.joinAttempts.get(roomId) ?? []).filter((t) => now - t < 60_000);
    attempts.push(now);
    this.joinAttempts.set(roomId, attempts);
    return attempts.length <= 20;
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    // Stage 5.1: room state is per-viewer and changes constantly: never cached
    // by a browser or a proxy (a cached projection is a stale or someone else's screen).
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }

  /** Stage 8.3: the public install files at the site root (apps/web/public, built into dist/), plus the service worker. */
  static isPublicFile(pathname: string): boolean {
    return pathname === "/manifest.webmanifest" || pathname === "/favicon.svg" || pathname === "/sw.js" || /^\/icons\/[A-Za-z0-9._-]+\.(png|svg)$/.test(pathname);
  }

  private static readonly STATIC_TYPES: Record<string, string> = {
    ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
    ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
    ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json",
  };

  private serveStatic(pathname: string, res: ServerResponse): void {
    const root = this.webDistDir;
    const file = pathname === "/" || pathname === "/index.html" ? join(root, "index.html") : join(root, pathname.replace(/^\//, ""));
    const safe = file.startsWith(root + sep) ? file : join(root, "index.html");
    let data: Buffer;
    try {
      data = readFileSync(safe);
    } catch {
      if (existsSync(join(root, "index.html"))) {
        // Stage 8.3: a file this build doesn't have is missing, never a 200 page
        // (a service worker or a browser must not keep a stand-in as the file).
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      res.end("<h1>Christmas Game Night</h1><p>Web app not built yet. Run: npm run build:web, then restart the server.</p>");
      return;
    }
    const ext = safe.slice(safe.lastIndexOf("."));
    const type = LocalServer.STATIC_TYPES[ext] ?? "application/octet-stream";
    // Stage 8.3 (stage83.md §3.1, §3.4): content-hashed build files never
    // change, so browsers may keep them; the page, the manifest, the icons
    // and the service worker are always checked, so an update is always seen.
    const cache = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "content-type": type, "cache-control": cache, "x-content-type-options": "nosniff" });
    res.end(data);
  }

  /**
   * The room a code names, for the seat-recovery routes. Stage 6.1: a solo
   * room's code finds nothing here either (as for join and spectate by
   * code): its seat list, recovery requests and recovery by code all answer
   * as if there were no such room.
   */
  private roomByJoinCode(code: unknown): RoomEngine | undefined {
    const c = String(code ?? "").trim().toUpperCase();
    return c ? [...this.rooms.values()].find((r) => r.joinCode.toUpperCase() === c && r.kind !== "solo") : undefined;
  }

  private static clientAddress(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? "unknown";
  }

  /**
   * Recover a seat (code or host-approved): rotate its credentials, save
   * atomically, and only then supersede the old device. If the save fails,
   * every in-memory change is undone and the caller answers 500: a
   * recovery that only existed in memory is never reported as successful,
   * and the old code/credential keep working.
   */
  private recoverSeat(room: RoomEngine, playerId: string, method: "code" | "host", actorId?: string): { sessionToken: string; recoveryCode: string } {
    const p = room.players.get(playerId)!;
    const before = { recoveryTokenHash: p.recoveryTokenHash, credentialVersion: p.credentialVersion, recoveryCodeHash: p.recoveryCodeHash };
    const ledgerLength = room.ledger.length;
    const seq = room.seq;
    const creds = room.rotateCredentials(playerId, method, actorId);
    try {
      this.persist(room);
    } catch (err) {
      p.recoveryTokenHash = before.recoveryTokenHash;
      p.credentialVersion = before.credentialVersion;
      p.recoveryCodeHash = before.recoveryCodeHash;
      room.ledger.length = ledgerLength;
      room.seq = seq;
      throw err;
    }
    // Supersede (contract §3): the old device's sockets stop acting at once.
    for (const s of [...this.sockets]) {
      if (s.meta.roomId === room.id && s.meta.actorId === playerId && !this.socketCurrent(room, s.meta)) {
        try { s.ws.send(JSON.stringify({ kind: "error", code: "SESSION_REPLACED" })); } catch { /* closing */ }
        s.ws.close(WS_SESSION_REPLACED, "Session replaced");
      }
    }
    if (!this.hasLiveSocket(room, playerId) && p.connected) room.disconnect(playerId);
    this.broadcast(room.id);
    return creds;
  }

  /** Recovery routes that work WITHOUT a seat credential (the device lost it). Returns true if handled. */
  private async handleRecoveryWithoutSession(req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> {
    if (req.method !== "POST" || parts[0] !== "rooms") return false;
    const addr = LocalServer.clientAddress(req);

    // Recover with a one-time code: POST /rooms/recover-by-code { joinCode, recoveryCode }
    if (parts.length === 2 && parts[1] === "recover-by-code") {
      const body = await this.readBody(req);
      const room = this.roomByJoinCode(body["joinCode"]);
      const keys = [this.codeFailuresPerAddress.retryAfterMs(`addr:${addr}`), room ? this.codeFailuresPerAddressPerRoom.retryAfterMs(`${room.id}:${addr}`) : 0, room ? this.codeFailuresPerRoom.retryAfterMs(room.id) : 0];
      const wait = Math.max(...keys);
      if (wait > 0) {
        this.send(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(wait / 60_000)} minute${wait > 60_000 ? "s" : ""}, or ask the host for help.`, retryAfterMs: wait });
        return true;
      }
      const slot = room?.slotForRecoveryCode(body["recoveryCode"]);
      if (!room || !slot) {
        this.codeFailuresPerAddress.fail(`addr:${addr}`);
        if (room) {
          this.codeFailuresPerAddressPerRoom.fail(`${room.id}:${addr}`);
          this.codeFailuresPerRoom.fail(room.id);
          // Audited (contract §1.5), never with the code value. Rate limits bound the writes.
          room.auditRecoveryFailure("code");
          try { this.persist(room); } catch { /* the audit event is retried with the next save */ }
        }
        this.send(res, 400, { error: "That room code and recovery code don’t match a seat. Check both, or ask the host for help." });
        return true;
      }
      const creds = this.recoverSeat(room, slot.id, "code");
      this.codeFailuresPerAddressPerRoom.reset(`${room.id}:${addr}`);
      this.send(res, 200, { roomId: room.id, joinCode: room.joinCode, playerId: slot.id, displayName: slot.displayName, sessionToken: creds.sessionToken, recoveryToken: creds.sessionToken, recoveryCode: creds.recoveryCode });
      return true;
    }

    // Host-assisted, step 0: which seats exist? POST /rooms/recovery-requests/seats { joinCode }
    if (parts.length === 3 && parts[1] === "recovery-requests" && parts[2] === "seats") {
      const body = await this.readBody(req);
      const room = this.roomByJoinCode(body["joinCode"]);
      if (!room) { this.send(res, 404, { error: "No game with that room code." }); return true; }
      // Public roster facts only (names are already visible to anyone with the code).
      this.send(res, 200, { roomId: room.id, roomName: room.name, seats: [...room.players.values()].map((p) => ({ playerId: p.id, displayName: p.displayName, presence: room.presenceOf(p.id) })) });
      return true;
    }

    // Host-assisted, step 1: ask for an exact seat. POST /rooms/recovery-requests { joinCode, playerId }
    if (parts.length === 2 && parts[1] === "recovery-requests") {
      const wait = this.requestLimiter.retryAfterMs(`addr:${addr}`);
      if (wait > 0) { this.send(res, 429, { error: "Too many requests from this device. Wait a few minutes, then try again.", retryAfterMs: wait }); return true; }
      this.requestLimiter.fail(`addr:${addr}`); // every request counts toward the device's budget
      const body = await this.readBody(req);
      const room = this.roomByJoinCode(body["joinCode"]);
      const playerId = String(body["playerId"] ?? "");
      if (!room || !room.players.has(playerId)) { this.send(res, 404, { error: "Pick your seat from the list." }); return true; }
      const { request, secret } = this.recoveries.create(room.id, playerId);
      this.broadcast(room.id); // hosts see it right away
      this.send(res, 201, { requestId: request.id, requestSecret: secret, matchCode: request.matchCode, expiresInMs: request.expiresAt - this.clock(), displayName: room.players.get(playerId)!.displayName, roomName: room.name });
      return true;
    }

    // Host-assisted, step 3: the requester collects. POST /rooms/recovery-requests/:id/status (secret in header)
    if (parts.length === 4 && parts[1] === "recovery-requests" && parts[3] === "status") {
      const r = this.recoveries.forRequester(parts[2]!, req.headers["x-recovery-request-secret"]);
      if (!r) { this.send(res, 404, { status: "expired", error: "This request has expired or was already used. Ask again if you still need help." }); return true; }
      if (r.status === "pending") { this.send(res, 200, { status: "pending", matchCode: r.matchCode, expiresInMs: r.expiresAt - this.clock() }); return true; }
      if (r.status === "denied") { this.recoveries.consume(r.id); this.send(res, 200, { status: "denied" }); return true; }
      const room = this.rooms.get(r.roomId);
      if (!room || !room.players.has(r.playerId)) { this.recoveries.consume(r.id); this.send(res, 404, { status: "expired", error: "That game is no longer available." }); return true; }
      const creds = this.recoverSeat(room, r.playerId, "host", r.decidedBy); // throws PersistError -> 500, request stays approved for a retry
      this.recoveries.consume(r.id);
      const slot = room.players.get(r.playerId)!;
      this.send(res, 200, { status: "recovered", roomId: room.id, joinCode: room.joinCode, playerId: slot.id, displayName: slot.displayName, sessionToken: creds.sessionToken, recoveryToken: creds.sessionToken, recoveryCode: creds.recoveryCode });
      return true;
    }
    return false;
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (req.method === "GET" && parts.length === 1 && parts[0] === "games") {
        // Each game with its lifecycle policy (time limits, practice-only), so
        // the lobby shows the same rules the server enforces.
        this.send(res, 200, GAME_REGISTRY.map((g) => {
          const p = GAME_POLICIES[g.id];
          const k = this.lifecycleScale;
          const phaseMs = p?.phaseMs ? Object.fromEntries(Object.entries(p.phaseMs).map(([key, v]) => [key, Math.round((v ?? 0) * k)])) : undefined;
          return p ? { ...g, lifecycle: { model: p.model, gameWindowMs: Math.round(p.gameWindowMs * k), phaseMs, officialEligible: p.officialEligible, practiceOnlyReason: p.practiceOnlyReason } } : g;
        }));
        return;
      }
      if (req.method === "POST" && parts.length === 2 && parts[0] === "rooms" && parts[1] === "join-by-code") {
        const body = await this.readBody(req);
        const code = String(body["joinCode"] ?? "").trim().toUpperCase();
        // Stage 6.1: a solo room is private; its code finds nothing.
        const room = [...this.rooms.values()].find((r) => r.joinCode.toUpperCase() === code && r.kind !== "solo");
        if (!room) {
          this.send(res, 404, { error: "Room not found for that code" });
          return;
        }
        if (!this.checkJoinRate(room.id)) {
          this.send(res, 429, { error: "Too many join attempts" });
          return;
        }
        if (body["asHost"] === true && !this.hostClaimValid(room.id, body["hostClaimToken"])) {
          this.send(res, 400, { error: "Host claim requires the room creation token" });
          return;
        }
        const { player, recoveryToken } = room.join(String(body["displayName"] ?? ""), { asHost: body["asHost"] === true });
        this.persist(room);
        this.broadcast(room.id);
        this.send(res, 201, { roomId: room.id, joinCode: room.joinCode, playerId: player.id, displayName: player.displayName, isHost: player.isHost, recoveryToken, sessionToken: recoveryToken });
        return;
      }
      if (await this.handleRecoveryWithoutSession(req, res, parts)) return;
      if (req.method === "POST" && parts.length === 2 && parts[0] === "rooms" && parts[1] === "spectate-by-code") {
        const body = await this.readBody(req);
        const code = String(body["joinCode"] ?? "").trim().toUpperCase();
        // Stage 6.1: a solo room is private; its code finds nothing.
        const room = [...this.rooms.values()].find((r) => r.joinCode.toUpperCase() === code && r.kind !== "solo");
        if (!room) {
          this.send(res, 404, { error: "Room not found for that code" });
          return;
        }
        if (!this.checkJoinRate(room.id)) {
          this.send(res, 429, { error: "Too many join attempts" });
          return;
        }
        // Code-gated, seat-free viewing: creates a spectator record only.
        // No player, no display name, no game membership, no host rights.
        const { spectator, token } = room.addSpectator();
        this.persist(room);
        this.broadcast(room.id);
        this.send(res, 201, { roomId: room.id, joinCode: room.joinCode, spectatorId: spectator.id, spectatorToken: token });
        return;
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/") || LocalServer.isPublicFile(url.pathname))) {
        this.serveStatic(url.pathname, res);
        return;
      }
      // Stage 8.3: "can this device reach the game server?" No data, never cached.
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/health") {
        this.send(res, 200, { ok: true });
        return;
      }
      // Stage 2: client routes (/join, /host, /room/cup, /library/...) get the
      // app itself, so a reload or deep link lands on the right screen.
      if (req.method === "GET" && isClientPath(url.pathname)) {
        this.serveStatic("/", res);
        return;
      }
      if (req.method === "POST" && parts.length === 1 && parts[0] === "rooms") {
        const parsed = LocalServer.CreateRoomSchema.safeParse(await this.readBody(req));
        if (!parsed.success) { this.send(res, 400, { error: "A room needs a name of up to 80 characters and a kind of cup, casual or solo" }); return; }
        const kind = parsed.data.kind ?? "cup";
        const defaultName = kind === "solo" ? "Solo play" : kind === "casual" ? "Game night" : "Christmas Game Night";
        const room = new RoomEngine(parsed.data.name || defaultName, { timing: this.newCupTiming, kind });
        room.clock = this.clock;
        room.lifecycleScale = this.lifecycleScale;
      if (this.contentLib) room.content = this.contentLib;
        // Stage 12.2 (D-S122-04): a host whose look is Christmas starts a casual room dealing Christmas content (a
        // one-time default; the host can switch in the lobby). Cups and solo rooms don't take it here.
        if (kind === "casual" && parsed.data.contentSeason) room.contentSeason = parsed.data.contentSeason;
        const hostClaimToken = randomUUID();
        this.rooms.set(room.id, room);
        this.hostClaimHashes.set(room.id, hashToken(hostClaimToken));
        this.persist(room);
        this.send(res, 201, { roomId: room.id, joinCode: room.joinCode, name: room.name, hostClaimToken });
        return;
      }
      if (parts[0] === "rooms" && parts[1]) {
        const room = this.rooms.get(parts[1]);
        if (!room) {
          this.send(res, 404, { error: "Room not found" });
          return;
        }
        // Deadlines that are due are processed (and saved) before this request is served.
        this.tickRoom(room);
        // Stage 6.1: a solo room is private. Its public (TV) view answers as if
        // the room weren't there, so only its own seat's token can see it.
        const publicView = req.method === "GET" && (parts.length === 2 || (parts.length === 3 && parts[2] === "projection" && (url.searchParams.get("audience") ?? "tv") === "tv"));
        if (publicView && room.kind === "solo") {
          this.send(res, 404, { error: "Room not found" });
          return;
        }
        if (req.method === "GET" && parts.length === 2) {
          this.send(res, 200, this.projectFor(room, "tv"));
          return;
        }
        if (req.method === "GET" && parts.length === 3 && parts[2] === "projection") {
          const requested = (url.searchParams.get("audience") ?? "tv") as "player" | "tv" | "host" | "cohost" | "spectator";
          if (requested === "tv") {
            // TV is the only public projection; client-supplied actorId is ignored.
            this.send(res, 200, this.projectFor(room, "tv"));
            return;
          }
          if (requested === "spectator") {
            // Spectator projection: same safe TV data, but gated on the
            // spectator token issued by spectate-by-code. A player session
            // token is NOT accepted here, and vice versa — the two
            // credentials are disjoint by design.
            const specToken = req.headers["x-spectator-token"];
            const spectator = typeof specToken === "string" ? room.spectatorByToken(specToken) : null;
            if (!spectator) {
              this.send(res, 401, { error: "Spectator token required" });
              return;
            }
            this.send(res, 200, this.projectFor(room, "spectator"));
            return;
          }
          const player = this.requireSession(room, req, res);
          if (!player) return;
          if (requested === "host" && !player.isHost) {
            this.send(res, 403, { error: "Host projection requires host role" });
            return;
          }
          if (requested === "cohost" && !player.isCohost && !player.isHost) {
            this.send(res, 403, { error: "Cohost projection requires cohost role" });
            return;
          }
          this.send(res, 200, this.projectFor(room, requested, player.id, parseClientProtocol(req.headers[PROTOCOL_HEADER])));
          // A pre-Sprint 3 tab was just shown Math prompts in advance: save the
          // resulting "no speed bonus for this player" mark before anything else.
          if (room.takeDirty()) this.persist(room);
          return;
        }
        // Issue a recovery code for MY seat (shown once, to me only).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "recovery-code") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const before = player.recoveryCodeHash;
          const ledgerLength = room.ledger.length;
          const seq = room.seq;
          const code = room.issueRecoveryCode(player.id);
          try { this.persist(room); } catch (err) { player.recoveryCodeHash = before; room.ledger.length = ledgerLength; room.seq = seq; throw err; }
          this.send(res, 201, { recoveryCode: code });
          return;
        }
        // Host-assisted, step 2: an operator approves or declines an EXACT seat.
        if (req.method === "POST" && parts.length === 5 && parts[2] === "recovery-requests" && (parts[4] === "approve" || parts[4] === "deny")) {
          const operator = this.requireSession(room, req, res);
          if (!operator) return;
          if (!operator.isHost && !operator.isCohost) { this.send(res, 403, { error: "Only the host or a cohost can approve a seat recovery." }); return; }
          const r = this.recoveries.forOperator(room.id, parts[3]!);
          if (!r || r.status !== "pending") { this.send(res, 404, { error: "That request has expired or was already handled." }); return; }
          const body = await this.readBody(req);
          if (parts[4] === "approve") {
            // The operator must name the exact seat they are approving.
            if (String(body["playerId"] ?? "") !== r.playerId) { this.send(res, 400, { error: "Confirm the exact seat you are restoring." }); return; }
            if (r.playerId === operator.id) { this.send(res, 400, { error: "You can’t approve a recovery of your own seat. Ask another host or cohost." }); return; }
            r.status = "approved";
          } else {
            r.status = "denied";
          }
          r.decidedBy = operator.id;
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, status: r.status });
          return;
        }
        // Sprint 2: "Welcome back. Continue as Ada?" A saved credential is
        // only offered after the server confirms it still controls a seat.
        // Returns no token, no secrets: just who the seat is.
        if (req.method === "GET" && parts.length === 3 && parts[2] === "session") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          this.send(res, 200, {
            roomId: room.id,
            roomName: room.name,
            joinCode: room.joinCode,
            playerId: player.id,
            displayName: player.displayName,
            isHost: player.isHost,
            isCohost: player.isCohost,
            hasRecoveryCode: !!player.recoveryCodeHash,
          });
          return;
        }
        if (req.method === "GET" && parts.length === 3 && parts[2] === "ledger") {
          const viewer = this.requireSession(room, req, res);
          if (!viewer) return;
          // Redacted per viewer: other players' abstentions and live
          // in-game scores are private (RoomEngine.ledgerFor).
          // Stage 10.2 repair (S102-R1): `?watermark=1` opts into { seq, events }, the
          // room's freshness watermark next to the same redacted events; without it the
          // response stays the plain array every existing consumer reads.
          this.send(res, 200, url.searchParams.get("watermark") === "1" ? room.ledgerViewFor(viewer.id) : room.ledgerFor(viewer.id));
          return;
        }
        if (parts.length >= 3 && parts[2] === "memory") {
          // Reads use the live book; every change goes through commitBook (D-S104-06), which replaces it.
          const book = this.books.get(room.id) ?? new MemoryBook();
          // Stage 11.2 (D-S112-01, D-S112-02): what the book knows about the room, from its own state only.
          const titleOf = (gameId: string): string => { try { return getGame(gameId).title; } catch { return ""; } };
          const nameOf = (playerId: string): string | undefined => room.players.get(playerId)?.displayName;
          const eraOf = (gid: string): BookMode => (room.casualGameIds.includes(gid) ? "casual" : bookModeOf(room.kind));
          const sourceCtx: SourceContext = {
            mode: bookModeOf(room.kind),
            // Stage 12.1: a game played while the room was casual stays casual, also after it became a Family Cup.
            gameOf: (gid) => { const g = room.games.get(gid); return g ? { title: titleOf(g.gameId), day: g.day ?? 1, mode: eraOf(gid) } : undefined; },
            nameOf,
          };
          const bookCtx: BookContext = {
            roomKind: room.kind,
            nameOf,
            sourceGames: (e) => e.sourceEventIds.map((id) => {
              const ev = room.ledger.find((x) => x.eventId === id);
              const g = ev?.gameInstanceId ? room.games.get(ev.gameInstanceId) : undefined;
              return g ? { title: titleOf(g.gameId), day: g.day ?? 1, mode: eraOf(g.id) } : {};
            }),
          };
          if (req.method === "GET" && parts.length === 3) {
            if (!this.requireSession(room, req, res)) return;
            // Stage 10.5 (D-S105-02): `?revision=1` opts into the snapshot { revision, entries }; without it the reply
            // stays the plain entry list every existing caller reads.
            this.send(res, 200, url.searchParams.get("revision") === "1" ? { revision: book.revision, entries: book.entries } : book.entries);
            return;
          }
          if (req.method === "GET" && parts.length === 4 && parts[3] === "export") {
            if (!this.requireSession(room, req, res)) return;
            // Stage 10.5: the revision this export was made from, next to it (additive).
            this.send(res, 200, { markdown: book.exportMarkdown(room.name, bookCtx), revision: book.revision });
            return;
          }
          if (req.method === "POST" && parts.length === 3) {
            // Every save rechecks the session: a member of this room, now (Stage 10.4).
            const member = this.requireSession(room, req, res);
            if (!member) return;
            const body = await this.readBody(req);
            const day = Number(body["day"] ?? 1);
            const text = String(body["text"] ?? "");
            const ledger = room.ledger;
            let sourceIds = Array.isArray(body["sourceEventIds"]) ? body["sourceEventIds"].map(String) : [];
            // Stage 10.4 (D-S104-01): a save from a result screen names the game it shows; the server resolves that
            // game's own finish in this room, so an old result can never save a newer match.
            if (body["fromGame"] !== undefined) {
              if (body["sourceEventIds"] !== undefined) { this.send(res, 400, { error: "Cite a game or its events, not both.", code: "ONE_SOURCE" }); return; }
              const shown = room.games.get(String(body["fromGame"]));
              if (!shown) { this.send(res, 400, { error: "That game isn't in this room.", code: "UNKNOWN_GAME" }); return; }
              // A voided game is "finished" but has no finish event and no result (RoomEngine.voidGame).
              if (shown.outcome?.reason === "void") { this.send(res, 409, { error: "That game was voided, so there is no result to save.", code: "RESULT_NOT_SAVEABLE" }); return; }
              const finish = ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === shown.id);
              if (shown.status !== "finished" || !finish) { this.send(res, 409, { error: "That game hasn't finished yet.", code: "NOT_FINISHED" }); return; }
              if (!text.trim()) { this.send(res, 400, { error: "Write a note first.", code: "NOTE_REQUIRED" }); return; }
              if (text.length > 280) { this.send(res, 400, { error: "Keep the note to 280 characters.", code: "NOTE_TOO_LONG" }); return; }
              sourceIds = [finish.eventId];
            }
            // Stage 10.4 (D-S104-02): one save, once. A key is this member's own (room-scoped: one book per room).
            // The same request again returns its entry; a different request under the same key is refused, never
            // allowed to overwrite.
            let requestId: string | undefined;
            let fingerprint = "";
            if (body["requestId"] !== undefined) {
              const key = body["requestId"];
              if (typeof key !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(key)) { this.send(res, 400, { error: "That save had an unreadable request key.", code: "BAD_REQUEST_ID" }); return; }
              requestId = key;
              fingerprint = attemptFingerprint(sourceIds, text, day);
              // The live book as it is now, after this request's body arrived (only what is on disk: D-S104-06).
              const prior = (this.books.get(room.id) ?? new MemoryBook()).attemptFor(member.id, key);
              if (prior?.entry && prior.attempt.fingerprint === fingerprint) { this.send(res, 200, prior.entry); return; }
              if (prior) { this.send(res, 409, { error: "Your earlier save already reached the Memory Book, so it was kept as it was.", code: "ATTEMPT_MISMATCH", ...(prior.entry ? { entry: prior.entry } : {}) }); return; }
            }
            // Stage 10.4 repair (D-S104-06): the entry and its key are made on a staged copy, written together, and
            // only then live; a failed write leaves neither behind, so a retry can't be answered from memory alone.
            const created = (add: (staged: MemoryBook) => MemoryBookEntry) => {
              const entry = this.commitBook(room.id, (staged) => {
                const e = add(staged);
                e.addedBy = member.id;
                if (requestId) staged.recordAttempt(member.id, requestId, e.id, fingerprint);
                return e;
              });
              this.send(res, 201, entry);
            };
            const cites = new Set(sourceIds);
            const coop = ledger.find((e) => cites.has(e.eventId) && e.gameInstanceId && isCooperative(room.games.get(e.gameInstanceId)?.gameId ?? ""));
            if (coop) {
              // Stage 10.3 (D-S103-01..04): a team game's result, from this room's own finalized game.
              // Only `day`, the note and the cited id are read from the request; every fact is derived here.
              const game = room.games.get(coop.gameInstanceId!)!;
              if (!isMemoryBookTeam(game.gameId)) {
                // Stage 9.3: any other cooperative game is still not saved (enabled by name only, D-S103-02).
                this.send(res, 409, { error: "Cooperative games like this one aren't saved to the Memory Book yet.", code: "NOT_IN_MEMORY_BOOK" });
                return;
              }
              if (sourceIds.length !== 1) {
                this.send(res, 400, { error: "A team game's entry cites that one game's finish, and nothing else.", code: "ONE_TEAM_GAME" });
                return;
              }
              try {
                const facts = teamFactsFor(game, coop as never);
                created((staged) => staged.addTeamResult(day, text, facts, getGame(game.gameId).title, sourceCtx));
              } catch (err) {
                if (err instanceof MemoryRefused) { this.send(res, err.status, { error: err.message, code: err.code }); return; }
                throw err;
              }
              return;
            }
            created((staged) => staged.addFromLedger(day, text, sourceIds, ledger as never, sourceCtx));
            return;
          }
          if (req.method === "POST" && parts.length === 5 && parts[4] === "approve") {
            const player = this.requireSession(room, req, res);
            if (!player) return;
            if (!player.isHost && !player.isCohost) {
              this.send(res, 403, { error: "Only host/cohost can approve Memory Book entries" });
              return;
            }
            this.commitBook(room.id, (staged) => staged.approve(String(parts[3]), player.id));
            this.send(res, 200, { ok: true });
            return;
          }
          if (req.method === "POST" && parts.length === 5 && parts[4] === "revoke") {
            const player = this.requireSession(room, req, res);
            if (!player) return;
            if (!player.isHost && !player.isCohost) {
              this.send(res, 403, { error: "Only host/cohost can revoke Memory Book entries" });
              return;
            }
            this.commitBook(room.id, (staged) => staged.revoke(String(parts[3])));
            this.send(res, 200, { ok: true });
            return;
          }
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "join") {
          if (!this.checkJoinRate(room.id)) {
            this.send(res, 429, { error: "Too many join attempts" });
            return;
          }
          const body = await this.readBody(req);
          // Stage 6.1: only a solo room's creator takes its one seat; to anyone
          // else the room isn't there (as for its code and its public view).
          if (room.kind === "solo" && body["asHost"] !== true) {
            this.send(res, 404, { error: "Room not found" });
            return;
          }
          if (body["asHost"] === true && !this.hostClaimValid(room.id, body["hostClaimToken"])) {
            this.send(res, 400, { error: "Host claim requires the room creation token" });
            return;
          }
          const { player, recoveryToken } = room.join(String(body["displayName"] ?? ""), { asHost: body["asHost"] === true });
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 201, { playerId: player.id, displayName: player.displayName, isHost: player.isHost, recoveryToken, sessionToken: recoveryToken });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "reconnect") {
          const body = await this.readBody(req);
          const player = room.reconnect(String(body["playerId"] ?? ""), String(body["recoveryToken"] ?? ""));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { playerId: player.id, connected: player.connected });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "cohost") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          room.grantCohost(player.id, String(body["targetId"] ?? ""));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "games") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
          // Stage 7.1: a start of the Quick Party lineup's next game (repeat-safe).
          let party: { revision: number; index: number } | undefined;
          if (body["party"] !== undefined) {
            const parsed = LocalServer.PartyStartSchema.safeParse(body["party"]);
            // The roster the host was shown is required: who plays (and any
            // "start without them") is tied to the room as it is now.
            // Stage 12.3 (D-S123-02): only a Family Cup's lineup has Official games; the room checks the press against the item.
            if (!parsed.success || (body["official"] === true && room.kind !== "cup") || !Array.isArray(body["roster"])) { this.send(res, 400, { error: "A Quick Party start needs the lineup's revision and item and the roster you were shown, and is official only in a Family Cup" }); return; }
            party = parsed.data;
          }
          // Stage 7.2: Play again (a rematch of a finished game), repeat-safe; also tied to the roster shown.
          let rematchOf: string | undefined;
          if (body["rematchOf"] !== undefined) {
            if (party || typeof body["rematchOf"] !== "string" || body["rematchOf"].length > 64 || body["official"] === true || !Array.isArray(body["roster"])) { this.send(res, 400, { error: "Play again needs the finished game and the roster you were shown, is never official, and is never a lineup start" }); return; }
            rematchOf = body["rematchOf"];
          }
          // Stage 7.2 (§3.8): the press this is (required for the lineup's Next and Play again; optional for the lobby's own Start).
          let attempt: { id: string; sessionRevision: number } | undefined;
          if (body["attempt"] !== undefined || party || rematchOf) {
            const parsed = LocalServer.AttemptSchema.safeParse(body["attempt"]);
            if (!parsed.success) { this.send(res, 400, { error: "This start needs its request id and the session revision it was made against" }); return; }
            attempt = parsed.data;
          }
          // Stage 8.2 (§3.4): the content the presser saw (solo and casual rooms; never a device's look).
          if (body["season"] !== undefined && !isSessionSeason(body["season"])) { this.send(res, 400, { error: "Content is everyday or christmas" }); return; }
          const season = body["season"] as SessionSeason | undefined;
          let game;
          let replay = false;
          try {
            const common = {
              seed: typeof body["seed"] === "number" ? body["seed"] : undefined,
              roster: ids(body["roster"]),
              proceedWithout: ids(body["proceedWithout"]),
              ...(season ? { season } : {}),
            };
            if (party) {
              ({ game, replay } = room.startPartyGame(player.id, String(body["gameId"] ?? ""), { ...party, ...common, fewerThanPlanned: body["fewerThanPlanned"] === true, attempt, official: body["official"] === true }));
            } else if (rematchOf) {
              ({ game, replay } = room.startRematch(player.id, rematchOf, { ...common, attempt }));
            } else {
              // Stage 9.1: a chosen game's settings (Jebena Rush's hearts); the room validates them. Play again reuses its game's own.
              ({ game, replay } = room.startChosen(player.id, String(body["gameId"] ?? ""), { official: body["official"] === true, ...common, ...(attempt ? { attempt } : {}), ...(body["settings"] !== undefined ? { settings: body["settings"] } : {}) }));
            }
          } catch (err) {
            if (err instanceof StartRefused) {
              this.send(res, 409, { error: err.message, code: err.code, readiness: err.readiness, ...(err.detail ?? {}) });
              return;
            }
            if (err instanceof ContentShortage) {
              this.send(res, 409, { error: err.message, code: err.code, available: err.available, needed: err.needed });
              return;
            }
            throw err;
          }
          if (replay) {
            // The same start again (a lost reply, a second tab): the game it already started.
            this.send(res, 200, { gameId: game.id, gameType: game.gameId, status: game.status, players: game.players, replay: true });
            return;
          }
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 201, { gameId: game.id, gameType: game.gameId, status: game.status, players: game.players });
          return;
        }
        // Stage 8.2 (§3.4): what a casual room deals (host/cohost; persisted; applies to the next Start).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "season") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const parsed = LocalServer.SeasonSchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "Content is everyday or christmas, with the session revision it was chosen against" }); return; }
          let done;
          try {
            done = room.setContentSeason(player.id, parsed.data.season, parsed.data.baseRevision);
          } catch (err) {
            if (err instanceof SessionRefused) { this.send(res, err.code === "NOT_HOST" ? 403 : 409, { error: err.message, code: err.code, contentSeason: room.kind !== "cup" ? room.contentSeason : undefined, ...(err.session ? { session: err.session } : {}) }); return; }
            throw err;
          }
          if (done.changed) { this.persist(room); this.broadcast(room.id); }
          this.send(res, 200, { ok: true, contentSeason: done.contentSeason, session: done.session, ...(done.changed ? {} : { unchanged: true }) });
          return;
        }
        // Stage 9.1 (§8): a game's lobby settings, e.g. Jebena Rush's hearts (host/cohost, casual rooms; persisted).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "game-settings") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const parsed = LocalServer.GameSettingsSchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "Send the game, its settings, and the session revision they were chosen against" }); return; }
          let done;
          try {
            done = room.setLobbySettings(player.id, parsed.data.gameId, parsed.data.settings, parsed.data.baseRevision);
          } catch (err) {
            if (err instanceof SessionRefused) { this.send(res, err.code === "NOT_HOST" ? 403 : err.code === "INVALID_SETTINGS" ? 400 : 409, { error: err.message, code: err.code, ...(room.kind === "casual" ? { lobbySettings: room.lobbySettingsView() } : {}), ...(err.session ? { session: err.session } : {}) }); return; }
            throw err;
          }
          if (done.changed) { this.persist(room); this.broadcast(room.id); }
          this.send(res, 200, { ok: true, lobbySettings: done.lobbySettings, session: done.session, ...(done.changed ? {} : { unchanged: true }) });
          return;
        }
        // Stage 7.2: Take a break / Resume (host/cohost, casual rooms; persisted).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "break") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const parsed = LocalServer.BreakSchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "A break needs on: true or false, its request id and the session revision it was made against" }); return; }
          let done;
          try {
            done = room.setBreak(player.id, parsed.data.on, parsed.data.attempt);
          } catch (err) {
            if (err instanceof SessionRefused) { this.send(res, err.code === "NOT_HOST" ? 403 : 409, { error: err.message, code: err.code, ...(err.session ? { session: err.session } : {}) }); return; }
            throw err;
          }
          if (!done.replay) { this.persist(room); this.broadcast(room.id); }
          this.send(res, 200, { ok: true, session: done.session, ...(done.replay ? { replay: true } : {}) });
          return;
        }
        // Stage 7.3: hand the host role to another connected player (current host, casual rooms, between games).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "host") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const parsed = LocalServer.HostSchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "A handover needs the player to hand over to, its request id and the session revision it was made against" }); return; }
          let done;
          try {
            done = room.transferHost(player.id, parsed.data.targetId, parsed.data.attempt);
          } catch (err) {
            if (err instanceof HostRefused) {
              this.send(res, err.code === "NOT_HOST" ? 403 : err.code === "TARGET_INVALID" ? 400 : 409, { error: err.message, code: err.code, ...err.detail });
              return;
            }
            throw err;
          }
          if (!done.replay) { this.persist(room); this.broadcast(room.id); }
          // The press's own outcome (who it handed over to) and the room's current host; never a saved projection or a past host state.
          this.send(res, 200, { ok: true, outcome: { from: done.from, to: done.to }, hostId: done.hostId, hostName: done.hostId ? room.players.get(done.hostId)?.displayName ?? null : null, ...(done.replay ? { replay: true } : {}) });
          return;
        }
        // Stage 12.4 (D-S124-01, provisional rules): the host finishes the Family Cup on its final day.
        // Stage 12.4 (D-S124-02): the host or a cohost ends a casual night (the TV shows the recap).
        if (req.method === "POST" && ((parts.length === 4 && parts[2] === "cup" && parts[3] === "finish") || (parts.length === 3 && parts[2] === "night"))) {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const finishing = parts[2] === "cup";
          let changed: boolean;
          try {
            ({ changed } = finishing ? room.finishCup(player.id) : room.endNight(player.id));
          } catch (err) {
            if (err instanceof FinishRefused) { this.send(res, err.code === "NOT_HOST" ? 403 : 409, { error: err.message, code: err.code }); return; }
            throw err;
          }
          if (changed) { this.persist(room); this.broadcast(room.id); }
          this.send(res, 200, { ok: true, changed, ...(finishing ? { cupFinished: room.cupFinished } : { nightComplete: room.nightComplete }) });
          return;
        }
        // Stage 12.7 (D-S127-01): the night's teams (the host or a cohost of a casual room).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "teams") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const parsed = LocalServer.TeamsSchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "That teams change couldn't be read.", code: "INVALID" }); return; }
          const b = parsed.data;
          try {
            if (b.action === "make") room.makeTeams(player.id, b.count);
            else if (b.action === "move") room.moveToTeam(player.id, b.playerId, b.teamId, b.baseRevision);
            else if (b.action === "rename") room.renameTeam(player.id, b.teamId, b.name);
            else if (b.action === "play") room.setTeamPlay(player.id, b.on);
            else room.clearTeams(player.id);
          } catch (err) {
            if (!(err instanceof TeamsRefused)) throw err;
            const status = err.code === "NOT_ALLOWED" ? 403 : err.code === "NOT_FOUND" ? 404 : err.code === "INVALID" ? 400 : 409;
            this.send(res, status, { error: err.message, code: err.code, teams: room.teams });
            return;
          }
          this.persist(room); this.broadcast(room.id);
          this.send(res, 200, { ok: true, teams: room.teams });
          return;
        }
        // Stage 12.5 (D-S125-01, D-S125-03): Family Questions. Add one; take back one of yours; the host or a cohost
        // removes every unplayed question one player wrote (without reading them). Never echoes anyone else's question.
        if (req.method === "POST" && parts[2] === "family" && (parts.length === 3 || (parts.length === 5 && parts[4] === "delete") || (parts.length === 6 && parts[3] === "author" && parts[5] === "remove"))) {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const refused = (err: unknown) => {
            if (!(err instanceof FamilyRefused)) throw err;
            const status = err.code === "NOT_ALLOWED" ? 403 : err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_QUESTION" ? 400 : 409;
            this.send(res, status, { error: err.message, code: err.code });
          };
          if (parts.length === 3) {
            const parsed = LocalServer.FamilyQuestionSchema.safeParse(await this.readBody(req));
            if (!parsed.success) { this.send(res, 400, { error: "That question couldn't be read. Try writing it again.", code: "INVALID_QUESTION" }); return; }
            let q;
            try { q = room.addFamilyQuestion(player.id, parsed.data as FamilyQuestionInput); } catch (err) { refused(err); return; }
            this.persist(room); this.broadcast(room.id);
            this.send(res, 200, { ok: true, question: { id: q.id }, family: room.familyView(player.id) });
            return;
          }
          if (parts.length === 5) {
            try { room.deleteFamilyQuestion(player.id, decodeURIComponent(parts[3]!)); } catch (err) { refused(err); return; }
            this.persist(room); this.broadcast(room.id);
            this.send(res, 200, { ok: true, family: room.familyView(player.id) });
            return;
          }
          let removed: number;
          try { removed = room.removeFamilyAuthor(player.id, decodeURIComponent(parts[4]!)); } catch (err) { refused(err); return; }
          if (removed > 0) { this.persist(room); this.broadcast(room.id); }
          this.send(res, 200, { ok: true, removed, family: room.familyView(player.id) });
          return;
        }
        // Stage 7.1: save or clear the room's Quick Party lineup (host/cohost, casual rooms).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "party") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const parsed = LocalServer.PartyBodySchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "A lineup needs a group size of 1–10, 15, 30 or 60 minutes, and 1–8 games", code: "INVALID_PLAN" }); return; }
          const b = parsed.data;
          try {
            room.savePartyPlan(player.id, b.baseRevision, "clear" in b ? null : b.plan);
          } catch (err) {
            if (err instanceof PartyRefused) {
              const status = err.code === "NOT_HOST" ? 403 : err.code === "INVALID_PLAN" ? 400 : 409;
              this.send(res, status, { error: err.message, code: err.code, party: room.kind === "casual" || room.kind === "cup" ? room.partyView() : undefined });
              return;
            }
            throw err;
          }
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, party: room.partyView() });
          return;
        }
        // D3: the host or a cohost begins play for everyone ("Start now"), or cancels the briefing.
        if (req.method === "POST" && parts.length === 5 && parts[2] === "games" && parts[4] === "start-now") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          const confirmed = Array.isArray(body["confirmed"]) ? body["confirmed"].map(String) : [];
          let result;
          try {
            result = room.startNow(player.id, String(parts[3]), { confirmed });
          } catch (err) {
            if (err instanceof BriefingRefused) {
              this.persist(room); // due deadlines processed first may have changed state
              this.broadcast(room.id);
              this.send(res, 409, { error: err.message, code: err.code, needsConfirmation: err.needsConfirmation, startNowAt: err.startNowAt });
              return;
            }
            throw err;
          }
          this.persist(room);
          this.broadcast(room.id);
          if (result.cancelled) {
            this.send(res, 409, { error: "This game's content changed on the server, so it was cancelled before it started. Nothing was scored. Start it again.", code: "CONTENT_CHANGED" });
            return;
          }
          this.send(res, 200, { ok: true, ...result });
          return;
        }
        if (req.method === "POST" && parts.length === 5 && parts[2] === "games" && parts[4] === "cancel") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          // Stage 6.1: in a solo room this also leaves a round in play.
          if (room.kind === "solo") room.abandonSoloRound(player.id, String(parts[3]));
          else room.cancelBriefing(player.id, String(parts[3]));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && parts.length === 5 && parts[2] === "games" && parts[4] === "skip") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const reason = room.skipTimedOutGame(player.id, String(parts[3]));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, reason });
          return;
        }
        if (req.method === "POST" && parts.length === 5 && parts[2] === "games" && parts[4] === "override") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          room.overrideScore(player.id, String(parts[3]), String(body["playerId"] ?? ""), Number(body["points"]), String(body["reason"] ?? ""));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true });
          return;
        }
        // Stage 12.1 (D-S121-02): "Make it a Family Cup", the host's one-way, idempotent upgrade of a casual room.
        if (req.method === "POST" && parts.length === 3 && parts[2] === "cup") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          try {
            const { changed } = room.upgradeToCup(player.id);
            if (changed) {
              // Stage 12.1: while casual, the host's phones published the up-next plan as practice (a casual room has no
              // official games). A new Family Cup defaults to Official, like a Cup created at the door, so the stored plan
              // follows for an official-eligible game; the host can still choose Practice.
              const plan = this.lobbyPlans.get(room.id);
              if (plan && !plan.official && GAME_POLICIES[plan.gameId as keyof typeof GAME_POLICIES]?.officialEligible !== false) this.lobbyPlans.set(room.id, { gameId: plan.gameId, official: true });
              this.persist(room);
              this.broadcast(room.id);
            }
            this.send(res, 200, { ok: true, changed, roomKind: room.kind, championshipDay: room.championshipDay, ...(room.cupSince ? { cupSince: room.cupSince } : {}) });
          } catch (err) {
            if (err instanceof CupUpgradeRefused) { this.send(res, err.code === "NOT_HOST" ? 403 : 409, { error: err.message, code: err.code, roomKind: room.kind }); return; }
            throw err;
          }
          return;
        }
        // Stage 12.2 (D-S122-01): "Back to a casual game night", until the Cup's first official game finishes.
        if (req.method === "POST" && parts.length === 3 && parts[2] === "casual") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          try {
            const { changed } = room.undoCupUpgrade(player.id);
            if (changed) {
              // A casual room has no official games: the stored up-next plan follows (the host can't plan official here).
              const plan = this.lobbyPlans.get(room.id);
              if (plan?.official) this.lobbyPlans.set(room.id, { gameId: plan.gameId, official: false });
              this.persist(room);
              this.broadcast(room.id);
            }
            this.send(res, 200, { ok: true, changed, roomKind: room.kind, ...(room.cupUndone ? { cupUndone: room.cupUndone } : {}) });
          } catch (err) {
            if (err instanceof CupUpgradeRefused) { this.send(res, err.code === "NOT_HOST" ? 403 : 409, { error: err.message, code: err.code, roomKind: room.kind }); return; }
            throw err;
          }
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "day") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const day = room.advanceDay(player.id);
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, day });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "reactions") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          const emoji = String(body["emoji"] ?? "");
          if (!LocalServer.REACTION_SET.includes(emoji)) { this.send(res, 400, { error: "Reaction not in the allowed set" }); return; }
          if (this.reactionsMuted.get(room.id)) { this.send(res, 403, { error: "Reactions are muted by the host" }); return; }
          const now = Date.now();
          const key = `${room.id}:${player.id}`;
          const stamps = (this.reactionStamps.get(key) ?? []).filter((t) => now - t < 3600000);
          if (stamps.length >= 30 || (stamps.length > 0 && now - stamps[stamps.length - 1]! < 3000)) {
            this.send(res, 429, { error: "Reaction rate limit: wait a moment" }); return;
          }
          stamps.push(now);
          this.reactionStamps.set(key, stamps);
          const list = this.reactions.get(room.id) ?? [];
          list.push({ emoji, sender: player.displayName, ts: now });
          this.reactions.set(room.id, list.slice(-12));
          this.broadcast(room.id);
          this.send(res, 201, { ok: true });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "plan") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          if (!player.isHost && !player.isCohost) { this.send(res, 403, { error: "Only the host can choose what's next" }); return; }
          const parsed = LocalServer.PlanSchema.safeParse(await this.readBody(req));
          if (!parsed.success) { this.send(res, 400, { error: "A plan needs a game and whether it's official" }); return; }
          const { gameId, official } = parsed.data;
          if (!GAME_REGISTRY.some((g) => g.id === gameId)) { this.send(res, 400, { error: `Unknown game ${gameId}` }); return; }
          if (official && room.kind !== "cup") { this.send(res, 400, { error: "This room is a casual game, not a Family Cup: its games never count toward a Cup" }); return; }
          if (official && GAME_POLICIES[gameId as keyof typeof GAME_POLICIES]?.officialEligible === false) { this.send(res, 400, { error: "That game is practice only" }); return; }
          const prev = this.lobbyPlans.get(room.id);
          if (!prev || prev.gameId !== gameId || prev.official !== official) {
            this.lobbyPlans.set(room.id, { gameId, official });
            this.broadcast(room.id);
          }
          this.send(res, 200, { ok: true, upNext: { gameId, official } });
          return;
        }
        if (req.method === "POST" && parts.length === 4 && parts[2] === "reactions" && parts[3] === "mute") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          if (!player.isHost && !player.isCohost) { this.send(res, 403, { error: "Only host/cohost can mute reactions" }); return; }
          const body = await this.readBody(req);
          this.reactionsMuted.set(room.id, body["muted"] === true);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, muted: this.reactionsMuted.get(room.id) });
          return;
        }
        // Ephemeral nudges (Mchezo lobby): same pattern as reactions — in
        // memory only, never in the ledger, never scored, expiring. The
        // target alone sees who nudged them (nudgedBy in their projection).
        if (req.method === "POST" && parts.length === 3 && parts[2] === "nudge") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          const targetId = String(body["targetId"] ?? "");
          const target = room.players.get(targetId);
          if (!target || targetId === player.id) { this.send(res, 400, { error: "Invalid nudge target" }); return; }
          const now = Date.now();
          const key = `${room.id}:${player.id}`;
          const stamps = (this.nudgeStamps.get(key) ?? []).filter((t) => now - t < 60000);
          if (stamps.length > 0 && now - stamps[stamps.length - 1]! < 3000) {
            this.send(res, 429, { error: "Nudge rate limit: wait a moment" }); return;
          }
          stamps.push(now);
          this.nudgeStamps.set(key, stamps);
          const list = this.nudges.get(room.id) ?? [];
          list.push({ fromId: player.id, targetId, ts: now });
          this.nudges.set(room.id, list.slice(-50));
          this.broadcast(room.id);
          this.send(res, 201, { ok: true });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "intents") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          const result = room.submitIntent(body["intent"], player.id, undefined, { clientProtocol: parseClientProtocol(req.headers[PROTOCOL_HEADER]) ?? 0 });
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, result);
          return;
        }
      }
      this.send(res, 404, { error: "Not found" });
    } catch (err) {
      if (err instanceof PersistError) {
        this.send(res, 500, { error: err.message });
        return;
      }
      this.send(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
    }
  }

  private handleWs(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const roomId = url.searchParams.get("roomId") ?? "";
    const requestedAudience = (url.searchParams.get("audience") ?? "player") as SocketMeta["audience"];
    const room = this.rooms.get(roomId);
    if (!room) {
      ws.close(1008, "Room not found");
      return;
    }
    // TV sockets are public and may not submit intents. Player/host/cohost
    // sockets must present a session token in the WebSocket subprotocol
    // header (Sec-WebSocket-Protocol: cgn-session-<token>), NOT in the URL:
    // URL tokens leak into server logs, browser history, and referers. The
    // query-string sessionToken form was removed in the completion sprint.
    // Spectator sockets present cgn-spectator-<token> instead: same
    // no-intent rule as TV, but with a server-tracked presence record, so
    // the room can show a real watching count and a spectator's disconnect
    // is observable. A spectator token is never a player token.
    let actorId = "";
    let audience: SocketMeta["audience"] = requestedAudience;
    let spectatorId: string | undefined;
    if (requestedAudience === "spectator") {
      const offered = String(req.headers["sec-websocket-protocol"] ?? "");
      const specToken = offered
        .split(",")
        .map((p) => p.trim())
        .find((p) => p.startsWith("cgn-spectator-"))
        ?.slice("cgn-spectator-".length) ?? "";
      const spectator = room.spectatorByToken(specToken);
      if (!spectator) {
        ws.close(1008, "Spectator token required");
        return;
      }
      spectatorId = spectator.id;
      actorId = "";
    } else if (requestedAudience === "tv") {
      if (room.kind === "solo") {
        ws.close(1008, "Room not found"); // Stage 6.1: a solo room has no public view
        return;
      }
      actorId = "";
    } else {
      const offered = String(req.headers["sec-websocket-protocol"] ?? "");
      const token = offered
        .split(",")
        .map((p) => p.trim())
        .find((p) => p.startsWith("cgn-session-"))
        ?.slice("cgn-session-".length) ?? "";
      const player = token ? [...room.players.values()].find((p) => p.recoveryTokenHash === hashToken(token)) : undefined;
      if (!player) {
        ws.close(1008, "Session token required");
        return;
      }
      if (requestedAudience === "host" && !player.isHost) {
        ws.close(1008, "Host role required");
        return;
      }
      if (requestedAudience === "cohost" && !player.isCohost && !player.isHost) {
        ws.close(1008, "Cohost role required");
        return;
      }
      actorId = player.id;
      audience = requestedAudience;
    }
    const meta: SocketMeta = { roomId, actorId, audience, spectatorId, alive: true, clientProtocol: parseClientProtocol(url.searchParams.get(PROTOCOL_PARAM)), credentialVersion: actorId ? room.players.get(actorId)?.credentialVersion ?? 0 : undefined };
    const entry = { ws, meta };
    this.sockets.add(entry);
    ws.on("pong", () => { meta.alive = true; });
    // An open socket means the player is connected again. Before this fix,
    // only the explicit /reconnect endpoint restored connected=true, so a
    // plain page reload left the player permanently "disconnected" for
    // startGame's connected-player count ("Need at least N connected
    // players") even though the reloaded tab was live.
    if (actorId && audience !== "tv") {
      const player = room.players.get(actorId);
      if (player && !player.connected) {
        room.markConnected(actorId);
        // Presence is visible to everyone (lobby "away" markers), so tell them.
        // Completion rules are unchanged by this broadcast.
        this.broadcast(roomId);
      }
    }
    if (spectatorId) {
      room.setSpectatorConnected(spectatorId, true);
      this.broadcast(roomId);
    }
    ws.send(JSON.stringify({ kind: "projection", state: this.projectFor(room, audience, actorId || undefined, meta.clientProtocol) }));
    if (room.takeDirty()) { try { this.persist(room); } catch { /* logged by persist */ } }
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { intent?: unknown };
        if (!msg.intent) return;
        this.tickRoom(room);
        // The socket session actor is authoritative; any actorId inside the
        // message frame is ignored, so a sender cannot impersonate another player.
        if (!actorId) {
          ws.send(JSON.stringify({ kind: "error", code: "SESSION_REQUIRED" }));
          return;
        }
        // A socket opened with a credential that has since been replaced
        // (seat recovered on another device) may not act for the slot.
        if (!this.socketCurrent(room, meta)) {
          ws.send(JSON.stringify({ kind: "error", code: "SESSION_REPLACED" }));
          ws.close(WS_SESSION_REPLACED, "Session replaced");
          return;
        }
        const result = room.submitIntent(msg.intent, actorId, undefined, { clientProtocol: meta.clientProtocol ?? 0 });
        this.persist(room);
        ws.send(JSON.stringify({ kind: "ack", result }));
        this.broadcast(roomId);
      } catch (err) {
        ws.send(JSON.stringify({ kind: "error", code: err instanceof PersistError ? "PERSIST_FAILED" : "INVALID_MESSAGE" }));
      }
    });
    ws.on("close", () => {
      this.sockets.delete(entry);
      // Spectator presence: clear only when this viewer's last socket
      // closes, so a reload (new socket before old close) keeps them counted.
      if (spectatorId) {
        const stillWatching = [...this.sockets].some(
          (s) => s.meta.roomId === roomId && s.meta.spectatorId === spectatorId,
        );
        if (!stillWatching) {
          room.setSpectatorConnected(spectatorId, false);
          this.broadcast(roomId);
        }
        return;
      }
      // Only mark disconnected when no live, current-credential socket for
      // this player remains: on a reload the new socket may open before the
      // old one closes, and the old close must not undo the new connection.
      // A stale (replaced-credential) socket never counts as presence.
      if (!actorId || !room.players.has(actorId)) return;
      if (!this.hasLiveSocket(room, actorId)) {
        if (room.players.get(actorId)!.connected) {
          room.disconnect(actorId); // starts the reconnect grace window
          // Completion is NOT re-checked on disconnect (owner decision D1).
          this.broadcast(roomId);
        }
      }
    });
  }

  private broadcast(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.revs.set(roomId, this.revOf(roomId) + 1);
    for (const { ws, meta } of this.sockets) {
      if (meta.roomId !== roomId) continue;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ kind: "projection", state: this.projectFor(room, meta.audience, meta.actorId || undefined, meta.clientProtocol) }));
      }
    }
    if (room.takeDirty()) { try { this.persist(room); } catch { /* logged by persist */ } }
  }
}

export function exists(path: string): boolean {
  return existsSync(path);
}
