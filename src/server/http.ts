import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomEngine, type RoomPlayer } from "./room.js";
import { GAME_REGISTRY } from "../games/registry.js";
import { MemoryBook } from "./memorybook.js";
import { hashToken } from "../shared/protocol.js";

export interface ServerOptions {
  port?: number;
  dataDir?: string;
}

interface SocketMeta {
  roomId: string;
  actorId: string;
  audience: "player" | "tv" | "host" | "cohost";
}

/**
 * Local HTTP + WebSocket adapter around RoomEngine.
 * LOCAL only — not a Cloudflare Durable Object. Snapshot persistence is a
 * JSON file in dataDir, written after every mutation, so a restart restores
 * players, games, deadlines, ledger, and deduplication state.
 */
export class LocalServer {
  rooms = new Map<string, RoomEngine>();
  private books = new Map<string, MemoryBook>();
  private dataDir: string;
  private http = createServer((req, res) => void this.handleHttp(req, res));
  private wss = new WebSocketServer({ server: this.http });
  private sockets = new Set<{ ws: WebSocket; meta: SocketMeta }>();

  constructor(opts: ServerOptions = {}) {
    this.dataDir = opts.dataDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
    mkdirSync(this.dataDir, { recursive: true });
    this.loadSnapshots();
    this.wss.on("connection", (ws, req) => this.handleWs(ws, req));
  }

  private snapshotPath(roomId: string): string {
    return join(this.dataDir, `${roomId}.json`);
  }

  private bookPath(roomId: string): string {
    return join(this.dataDir, `${roomId}.book.json`);
  }

  private persist(room: RoomEngine): void {
    writeFileSync(this.snapshotPath(room.id), JSON.stringify(room.toJSON(), null, 2));
  }

  private persistBook(roomId: string): void {
    const book = this.books.get(roomId);
    if (book) writeFileSync(this.bookPath(roomId), JSON.stringify(book.toJSON(), null, 2));
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

  private loadSnapshots(): void {
    // Only load files that look like room snapshots; ignore other files.
    try {
      for (const file of readdirSync(this.dataDir)) {
        if (!file.endsWith(".json") || file.endsWith(".book.json")) continue;
        const data = JSON.parse(readFileSync(join(this.dataDir, file), "utf-8")) as Record<string, unknown>;
        if (typeof data["id"] === "string" && Array.isArray(data["players"])) {
          const room = RoomEngine.fromJSON(data);
          this.rooms.set(room.id, room);
          // Restore the Memory Book for this room, if one was persisted.
          try {
            const bookFile = this.bookPath(room.id);
            if (existsSync(bookFile)) {
              const bookData = JSON.parse(readFileSync(bookFile, "utf-8")) as Record<string, unknown>;
              if (Array.isArray(bookData["entries"])) this.books.set(room.id, MemoryBook.fromJSON(bookData));
            }
          } catch {
            // A corrupt book file must not lose the room itself.
          }
        }
      }
    } catch {
      // No snapshots yet — start empty.
    }
  }

  async listen(port = 0): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(port, () => {
        const addr = this.http.address();
        resolve(typeof addr === "object" && addr ? addr.port : port);
      });
    });
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.ws.close();
    this.sockets.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
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
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private serveStatic(pathname: string, res: ServerResponse): void {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "web", "dist");
    const file = pathname === "/" || pathname === "/index.html" ? join(root, "index.html") : join(root, pathname.replace(/^\//, ""));
    const safe = file.startsWith(root) ? file : join(root, "index.html");
    try {
      const data = readFileSync(safe);
      const type = safe.endsWith(".js") ? "text/javascript" : safe.endsWith(".css") ? "text/css" : safe.endsWith(".html") ? "text/html" : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    } catch {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>Christmas Game Night</h1><p>Web app not built yet. Run: npm run build:web, then restart the server.</p>");
    }
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (req.method === "GET" && parts.length === 1 && parts[0] === "games") {
        this.send(res, 200, GAME_REGISTRY);
        return;
      }
      if (req.method === "POST" && parts.length === 2 && parts[0] === "rooms" && parts[1] === "join-by-code") {
        const body = await this.readBody(req);
        const code = String(body["joinCode"] ?? "").trim().toUpperCase();
        const room = [...this.rooms.values()].find((r) => r.joinCode.toUpperCase() === code);
        if (!room) {
          this.send(res, 404, { error: "Room not found for that code" });
          return;
        }
        if (!this.checkJoinRate(room.id)) {
          this.send(res, 429, { error: "Too many join attempts" });
          return;
        }
        const { player, recoveryToken } = room.join(String(body["displayName"] ?? ""), { asHost: body["asHost"] === true });
        this.persist(room);
        this.broadcast(room.id);
        this.send(res, 201, { roomId: room.id, joinCode: room.joinCode, playerId: player.id, displayName: player.displayName, isHost: player.isHost, recoveryToken, sessionToken: recoveryToken });
        return;
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/"))) {
        this.serveStatic(url.pathname, res);
        return;
      }
      if (req.method === "POST" && parts.length === 1 && parts[0] === "rooms") {
        const body = await this.readBody(req);
        const room = new RoomEngine(typeof body["name"] === "string" ? body["name"] : "Christmas Game Night");
        this.rooms.set(room.id, room);
        this.persist(room);
        this.send(res, 201, { roomId: room.id, joinCode: room.joinCode, name: room.name });
        return;
      }
      if (parts[0] === "rooms" && parts[1]) {
        const room = this.rooms.get(parts[1]);
        if (!room) {
          this.send(res, 404, { error: "Room not found" });
          return;
        }
        if (req.method === "GET" && parts.length === 2) {
          this.send(res, 200, room.project("tv"));
          return;
        }
        if (req.method === "GET" && parts.length === 3 && parts[2] === "projection") {
          const requested = (url.searchParams.get("audience") ?? "tv") as "player" | "tv" | "host" | "cohost";
          if (requested === "tv") {
            // TV is the only public projection; client-supplied actorId is ignored.
            this.send(res, 200, room.project("tv"));
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
          this.send(res, 200, room.project(requested, player.id));
          return;
        }
        if (req.method === "GET" && parts.length === 3 && parts[2] === "ledger") {
          if (!this.requireSession(room, req, res)) return;
          this.send(res, 200, room.toJSON().ledger ?? []);
          return;
        }
        if (parts.length >= 3 && parts[2] === "memory") {
          const book = this.books.get(room.id) ?? new MemoryBook();
          this.books.set(room.id, book);
          if (req.method === "GET" && parts.length === 3) {
            if (!this.requireSession(room, req, res)) return;
            this.send(res, 200, book.entries);
            return;
          }
          if (req.method === "GET" && parts.length === 4 && parts[3] === "export") {
            if (!this.requireSession(room, req, res)) return;
            this.send(res, 200, { markdown: book.exportMarkdown(room.name) });
            return;
          }
          if (req.method === "POST" && parts.length === 3) {
            if (!this.requireSession(room, req, res)) return;
            const body = await this.readBody(req);
            const entry = book.addFromLedger(
              Number(body["day"] ?? 1),
              String(body["text"] ?? ""),
              Array.isArray(body["sourceEventIds"]) ? body["sourceEventIds"].map(String) : [],
              (room.toJSON().ledger ?? []) as never,
            );
            this.persistBook(room.id);
            this.send(res, 201, entry);
            return;
          }
          if (req.method === "POST" && parts.length === 5 && parts[4] === "approve") {
            const player = this.requireSession(room, req, res);
            if (!player) return;
            if (!player.isHost && !player.isCohost) {
              this.send(res, 403, { error: "Only host/cohost can approve Memory Book entries" });
              return;
            }
            book.approve(String(parts[3]), player.id);
            this.persistBook(room.id);
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
            book.revoke(String(parts[3]));
            this.persistBook(room.id);
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
          const game = room.startGame(player.id, String(body["gameId"] ?? ""), {
            official: body["official"] === true,
            seed: typeof body["seed"] === "number" ? body["seed"] : undefined,
          });
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 201, { gameId: game.id, gameType: game.gameId, status: game.status, players: game.players });
          return;
        }
        if (req.method === "POST" && parts.length === 5 && parts[2] === "games" && parts[4] === "skip") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          room.skipTimedOutGame(player.id, String(parts[3]));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, timedOut: true });
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
        if (req.method === "POST" && parts.length === 3 && parts[2] === "day") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const day = room.advanceDay(player.id);
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true, day });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "intents") {
          const player = this.requireSession(room, req, res);
          if (!player) return;
          const body = await this.readBody(req);
          const result = room.submitIntent(body["intent"], player.id);
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, result);
          return;
        }
      }
      this.send(res, 404, { error: "Not found" });
    } catch (err) {
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
    let actorId = "";
    let audience: SocketMeta["audience"] = requestedAudience;
    if (requestedAudience === "tv") {
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
    const meta: SocketMeta = { roomId, actorId, audience };
    const entry = { ws, meta };
    this.sockets.add(entry);
    // An open socket means the player is connected again. Before this fix,
    // only the explicit /reconnect endpoint restored connected=true, so a
    // plain page reload left the player permanently "disconnected" for
    // startGame's connected-player count ("Need at least N connected
    // players") even though the reloaded tab was live.
    if (actorId && audience !== "tv") {
      const player = room.players.get(actorId);
      if (player) player.connected = true;
    }
    ws.send(JSON.stringify({ kind: "projection", state: room.project(audience, actorId || undefined) }));
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { intent?: unknown };
        if (!msg.intent) return;
        // The socket session actor is authoritative; any actorId inside the
        // message frame is ignored, so a sender cannot impersonate another player.
        if (!actorId) {
          ws.send(JSON.stringify({ kind: "error", code: "SESSION_REQUIRED" }));
          return;
        }
        const result = room.submitIntent(msg.intent, actorId);
        this.persist(room);
        ws.send(JSON.stringify({ kind: "ack", result }));
        this.broadcast(roomId);
      } catch {
        ws.send(JSON.stringify({ kind: "error", code: "INVALID_MESSAGE" }));
      }
    });
    ws.on("close", () => {
      this.sockets.delete(entry);
      // Only mark disconnected when no socket for this player remains: on a
      // reload the new socket may open before the old one closes, and the
      // old close must not undo the new connection.
      const stillOpen = [...this.sockets].some(
        (s) => s.meta.roomId === roomId && s.meta.actorId === actorId,
      );
      if (!stillOpen) {
        const player = room.players.get(actorId);
        if (player) player.connected = false;
      }
    });
  }

  private broadcast(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const { ws, meta } of this.sockets) {
      if (meta.roomId !== roomId) continue;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ kind: "projection", state: room.project(meta.audience, meta.actorId || undefined) }));
      }
    }
  }
}

export function exists(path: string): boolean {
  return existsSync(path);
}
