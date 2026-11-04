import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomEngine } from "./room.js";
import { GAME_REGISTRY } from "../games/registry.js";
import { MemoryBook } from "./memorybook.js";

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

  private persist(room: RoomEngine): void {
    writeFileSync(this.snapshotPath(room.id), JSON.stringify(room.toJSON(), null, 2));
  }

  private loadSnapshots(): void {
    // Only load files that look like room snapshots; ignore other files.
    try {
      for (const file of readdirSync(this.dataDir)) {
        if (!file.endsWith(".json")) continue;
        const data = JSON.parse(readFileSync(join(this.dataDir, file), "utf-8")) as Record<string, unknown>;
        if (typeof data["id"] === "string" && Array.isArray(data["players"])) {
          const room = RoomEngine.fromJSON(data);
          this.rooms.set(room.id, room);
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
        this.send(res, 201, { roomId: room.id, joinCode: room.joinCode, playerId: player.id, displayName: player.displayName, isHost: player.isHost, recoveryToken });
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
          const audience = (url.searchParams.get("audience") ?? "tv") as "player" | "tv" | "host" | "cohost";
          const actorId = url.searchParams.get("actorId") ?? undefined;
          this.send(res, 200, room.project(audience, actorId));
          return;
        }
        if (req.method === "GET" && parts.length === 3 && parts[2] === "ledger") {
          this.send(res, 200, room.toJSON().ledger ?? []);
          return;
        }
        if (parts.length >= 3 && parts[2] === "memory") {
          const book = this.books.get(room.id) ?? new MemoryBook();
          this.books.set(room.id, book);
          if (req.method === "GET" && parts.length === 3) {
            this.send(res, 200, book.entries);
            return;
          }
          if (req.method === "GET" && parts.length === 4 && parts[3] === "export") {
            this.send(res, 200, { markdown: book.exportMarkdown(room.name) });
            return;
          }
          if (req.method === "POST" && parts.length === 3) {
            const body = await this.readBody(req);
            const entry = book.addFromLedger(
              Number(body["day"] ?? 1),
              String(body["text"] ?? ""),
              Array.isArray(body["sourceEventIds"]) ? body["sourceEventIds"].map(String) : [],
              (room.toJSON().ledger ?? []) as never,
            );
            this.send(res, 201, entry);
            return;
          }
          if (req.method === "POST" && parts.length === 5 && parts[4] === "approve") {
            const body = await this.readBody(req);
            book.approve(String(parts[3]), String(body["approverId"] ?? ""));
            this.send(res, 200, { ok: true });
            return;
          }
          if (req.method === "POST" && parts.length === 5 && parts[4] === "revoke") {
            book.revoke(String(parts[3]));
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
          this.send(res, 201, { playerId: player.id, displayName: player.displayName, isHost: player.isHost, recoveryToken });
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
          const body = await this.readBody(req);
          room.grantCohost(String(body["hostId"] ?? ""), String(body["targetId"] ?? ""));
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 200, { ok: true });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "games") {
          const body = await this.readBody(req);
          const game = room.startGame(String(body["hostId"] ?? ""), String(body["gameId"] ?? ""), {
            official: body["official"] === true,
            seed: typeof body["seed"] === "number" ? body["seed"] : undefined,
          });
          this.persist(room);
          this.broadcast(room.id);
          this.send(res, 201, { gameId: game.id, gameType: game.gameId, status: game.status, players: game.players });
          return;
        }
        if (req.method === "POST" && parts.length === 3 && parts[2] === "intents") {
          const body = await this.readBody(req);
          const result = room.submitIntent(body["intent"], String(body["actorId"] ?? ""));
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
    const actorId = url.searchParams.get("actorId") ?? "";
    const audience = (url.searchParams.get("audience") ?? "player") as SocketMeta["audience"];
    const room = this.rooms.get(roomId);
    if (!room) {
      ws.close(1008, "Room not found");
      return;
    }
    const meta: SocketMeta = { roomId, actorId, audience };
    const entry = { ws, meta };
    this.sockets.add(entry);
    ws.send(JSON.stringify({ kind: "projection", state: room.project(audience, actorId || undefined) }));
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { intent?: unknown; actorId?: string };
        if (!msg.intent) return;
        const result = room.submitIntent(msg.intent, msg.actorId ?? actorId);
        this.persist(room);
        ws.send(JSON.stringify({ kind: "ack", result }));
        this.broadcast(roomId);
      } catch {
        ws.send(JSON.stringify({ kind: "error", code: "INVALID_MESSAGE" }));
      }
    });
    ws.on("close", () => {
      this.sockets.delete(entry);
      const player = room.players.get(actorId);
      if (player) player.connected = false;
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
