/**
 * Real-server test harness: a LocalServer on an OS-assigned port with its
 * own temp data dir, driven over HTTP and WebSocket exactly as browsers
 * drive it. Use it for anything that crosses the HTTP/WS boundary
 * (authorization, projections, connection state, restart).
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { LocalServer } from "../../src/server/http.js";
import { policyFor } from "../../src/server/lifecycle.js";

export type Json = Record<string, unknown>;

export interface Player {
  name: string;
  playerId: string;
  token: string;
  ws?: WebSocket;
  /** Latest projection pushed over this player's socket. */
  lastPush?: Json;
}

/** A server clock the test controls. Starts at a fixed instant; only advance() moves it. */
export class FakeClock {
  constructor(public t = 1_800_000_000_000) {}
  now = (): number => this.t;
  advance(ms: number): void { this.t += ms; }
}

export interface HarnessOptions {
  /** Inject a fake server clock (presence/grace tests). Default: real time. */
  clock?: FakeClock;
}

export class Harness {
  server!: LocalServer;
  base = "";
  port = 0;
  roomId = "";
  joinCode = "";
  hostClaimToken = "";
  private sockets = new Set<WebSocket>();

  constructor(readonly dataDir: string = mkdtempSync(join(tmpdir(), "mz-harness-")), readonly opts: HarnessOptions = {}) {}

  get clock(): FakeClock {
    if (!this.opts.clock) throw new Error("Harness was created without a FakeClock");
    return this.opts.clock;
  }

  async start(): Promise<this> {
    // Heartbeat off: tests drive disconnects explicitly (heartbeatTick() can be called by hand).
    this.server = new LocalServer({ dataDir: this.dataDir, clock: this.opts.clock?.now, heartbeatMs: null, lifecycleSweepMs: null });
    this.port = await this.server.listen(0);
    this.base = `http://localhost:${this.port}`;
    return this;
  }

  /** Stop the server (sockets close as they would on a crash/restart). */
  async stop(): Promise<void> {
    for (const ws of this.sockets) ws.terminate();
    this.sockets.clear();
    await this.server.close();
  }

  /** Simulate a server restart on the same data directory. */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async dispose(): Promise<void> {
    await this.stop().catch(() => {});
    rmSync(this.dataDir, { recursive: true, force: true });
  }

  async post(path: string, body: unknown, token?: string): Promise<{ status: number; body: Json }> {
    const r = await fetch(this.base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Json };
  }

  async get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
    const r = await fetch(this.base + path, { headers });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Json };
  }

  async createRoom(name = "Family Night"): Promise<void> {
    const r = await this.post("/rooms", { name });
    this.roomId = r.body["roomId"] as string;
    this.joinCode = r.body["joinCode"] as string;
    this.hostClaimToken = r.body["hostClaimToken"] as string;
  }

  async join(name: string, opts: { host?: boolean; connect?: boolean } = {}): Promise<Player> {
    const r = await this.post("/rooms/join-by-code", { joinCode: this.joinCode, displayName: name, ...(opts.host ? { asHost: true, hostClaimToken: this.hostClaimToken } : {}) });
    if (r.status !== 201) throw new Error(`join ${name} failed: ${r.status} ${JSON.stringify(r.body)}`);
    const p: Player = { name, playerId: r.body["playerId"] as string, token: r.body["sessionToken"] as string };
    if (opts.connect !== false) await this.connect(p);
    return p;
  }

  /** Open the player's WebSocket (what a live browser tab holds). */
  async connect(p: Player): Promise<void> {
    p.ws = await this.openSocket(p);
  }

  /**
   * Open an additional socket for the same session (a second tab, or a
   * reload whose new socket opens before the old one closes). Resolves
   * once the server has accepted it (first projection received).
   */
  openSocket(p: Player, opts: { autoPong?: boolean; onMessage?: (m: Json) => void } = {}): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${this.port}/?roomId=${this.roomId}&audience=player`, [`cgn-session-${p.token}`], { autoPong: opts.autoPong ?? true });
      this.sockets.add(ws);
      let accepted = false;
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString()) as Json;
        if (m["kind"] === "projection") p.lastPush = m["state"] as Json;
        opts.onMessage?.(m);
        if (!accepted) { accepted = true; resolve(ws); }
      });
      ws.once("error", reject);
      ws.once("close", (code) => { if (!accepted) reject(new Error(`socket rejected (${code})`)); });
    });
  }

  /** Close one specific socket and wait for the server to process the close. */
  async closeSocket(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((r) => { ws.once("close", () => r()); ws.terminate(); });
    this.sockets.delete(ws);
    await new Promise((r) => setTimeout(r, 20)); // let the server-side close handler run
  }

  presence(p: Player): string {
    return this.engine().presenceOf(p.playerId);
  }

  /** Drop the player's socket (phone locks, tab closes, Wi-Fi blips) and wait for the server to notice. */
  async disconnect(p: Player): Promise<void> {
    const ws = p.ws;
    if (!ws) return;
    p.ws = undefined;
    await new Promise<void>((r) => { ws.once("close", () => r()); ws.terminate(); });
    this.sockets.delete(ws);
    await waitFor(() => this.server.rooms.get(this.roomId)!.players.get(p.playerId)!.connected === false);
  }

  async startGame(host: Player, gameId: string, opts: { official?: boolean; seed?: number; roster?: string[]; proceedWithout?: string[] } = {}): Promise<{ status: number; body: Json }> {
    return this.post(`/rooms/${this.roomId}/games`, {
      gameId,
      // Default: official where the game may count (practice-only games default to practice).
      official: opts.official ?? policyFor(gameId).officialEligible,
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      ...(opts.roster ? { roster: opts.roster } : {}),
      ...(opts.proceedWithout ? { proceedWithout: opts.proceedWithout } : {}),
    }, host.token);
  }

  /** Run the server's deadline sweep now (tests disable the timer and drive the fake clock). */
  lifecycleTick(): number {
    return this.server.lifecycleSweep();
  }

  intentBody(gameInstanceId: string, action: string, payload: Json, clientEventId: string = randomUUID()) {
    return { intent: { kind: "intent", schemaVersion: 1, clientEventId, roomId: this.roomId, gameInstanceId, action, payload } };
  }

  async intent(p: Player, gameInstanceId: string, action: string, payload: Json, clientEventId?: string): Promise<Json> {
    const r = await this.post(`/rooms/${this.roomId}/intents`, this.intentBody(gameInstanceId, action, payload, clientEventId), p.token);
    return r.body;
  }

  async projection(p: Player): Promise<Json> {
    const r = await this.get(`/rooms/${this.roomId}/projection?audience=player`, { "x-session-token": p.token });
    if (r.status !== 200) throw new Error(`projection ${p.name}: ${r.status}`);
    return r.body;
  }

  async tv(): Promise<Json> {
    return (await this.get(`/rooms/${this.roomId}/projection?audience=tv`)).body;
  }

  /** Server-side truth, for assertions only (tests may look; clients may not). */
  engine() {
    return this.server.rooms.get(this.roomId)!;
  }

  game(gameInstanceId: string) {
    return this.engine().games.get(gameInstanceId)!;
  }
}

export function myGame(proj: Json, gameInstanceId: string): Json {
  return ((proj["myGames"] as Json[]) ?? []).find((g) => g["id"] === gameInstanceId)!;
}

export async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
