/**
 * Stage 6.1: one solo round's session, outside React so its lifecycle is
 * explicit and testable.
 *
 * The round runs on the server in a private, single-seat "solo" room
 * (src/server/room.ts, RoomKind): the same engine, intents, scoring and
 * clocks as multiplayer, with no second game implementation.
 *
 * - One solo room per device, reused: its seat is kept in localStorage
 *   (SOLO_SEAT_KEY), never in the multiplayer seat, so Home never offers to
 *   "Rejoin" a solo room. If the room is gone (server data reset), or
 *   storage is unavailable, a new one is made.
 * - The projection is polled through the hardened pollFresh/oneAtATime
 *   (one poll at a time, each fully bounded by its timeout).
 * - dispose() stops everything: the interval, and any later result of a
 *   poll or request still in flight is ignored. Nothing keeps running after
 *   the screen is gone.
 */
import { readJson } from "../http.js";
import { oneAtATime, pollFresh } from "../liveness.js";
import type { Projection } from "../types.js";
import type { KeyValueStore } from "./personalBest.js";
import { uuidV4 } from "../uuid.js";

export const SOLO_SEAT_KEY = "mchezo.solo.v1";
export const SOLO_POLL_MS = 1000;
/** The name on the solo seat; nobody else ever sees it. */
export const SOLO_NAME = "You";

export interface SoloSeat { roomId: string; playerId: string; token: string }

export function readSeat(store: KeyValueStore | null): SoloSeat | null {
  if (!store) return null;
  try {
    const raw = store.getItem(SOLO_SEAT_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const s = v as Record<string, unknown>;
    return typeof s["roomId"] === "string" && typeof s["playerId"] === "string" && typeof s["token"] === "string"
      ? { roomId: s["roomId"], playerId: s["playerId"], token: s["token"] }
      : null;
  } catch {
    return null;
  }
}

/**
 * The seat as last made or used on this page. "One solo room per device" is
 * best effort (browser storage, not a server guarantee): when storage is
 * blocked, full or cleared, this keeps the seat for as long as the page lives,
 * so replays and new rounds reuse one room instead of making one each time.
 */
let pageSeat: SoloSeat | null = null;

/** The seat to try first: the device's stored seat, else this page's. */
export function currentSeat(store: KeyValueStore | null): SoloSeat | null {
  return readSeat(store) ?? pageSeat;
}

/** Tests only: forget this page's seat. */
export function forgetPageSeat(): void { pageSeat = null; }

function writeSeat(store: KeyValueStore | null, seat: SoloSeat): void {
  pageSeat = seat;
  if (!store) return;
  try { store.setItem(SOLO_SEAT_KEY, JSON.stringify(seat)); } catch { /* kept for this page (pageSeat) */ }
}

export type SoloPhase = "idle" | "starting" | "playing" | "finished" | "error";

export interface SoloState {
  phase: SoloPhase;
  gameInstanceId?: string;
  proj?: Projection;
  error?: string;
  /** The seat's room had a round still open (a reload or a lost tab): it was replaced. */
  replacedOpenRound?: boolean;
}

type Fetch = typeof fetch;

export class SoloSession {
  private seat: SoloSeat | null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private state: SoloState = { phase: "idle" };
  private readonly poll = oneAtATime(() => this.refresh());

  constructor(private readonly deps: {
    store: KeyValueStore | null;
    onChange: (s: SoloState) => void;
    fetch?: Fetch;
    pollMs?: number;
    uuid?: () => string;
  }) {
    this.seat = currentSeat(deps.store);
  }

  get current(): SoloState { return this.state; }
  get isDisposed(): boolean { return this.disposed; }
  get roomId(): string | undefined { return this.seat?.roomId; }
  get playerId(): string | undefined { return this.seat?.playerId; }

  private set(next: SoloState): void {
    if (this.disposed) return;
    this.state = next;
    this.deps.onChange(next);
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", ...(this.seat ? { "x-session-token": this.seat.token } : {}) };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const f = this.deps.fetch ?? fetch;
    const r = await f(path, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    return readJson<T>(r);
  }

  /** The seat's room, if it still exists and still accepts this seat. */
  private async seatProjection(): Promise<Projection | null> {
    if (!this.seat) return null;
    const seat = this.seat;
    try {
      return await pollFresh(`/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } }, async (r) => {
        if (r.status === 401 || r.status === 403 || r.status === 404) return null;
        return readJson<Projection>(r);
      });
    } catch {
      return null;
    }
  }

  /**
   * Reuse the seat only after the server accepts its token for a solo room
   * (a room id or code alone never gets you in); otherwise make a new one.
   */
  private async ensureSeat(): Promise<{ openRound: boolean }> {
    // The stored seat, then this page's (storage that reads but can't be
    // written may hold a stale one), then the one this session already has.
    const tried = new Set<string>();
    for (const seat of [readSeat(this.deps.store), pageSeat, this.seat]) {
      if (!seat || tried.has(seat.token)) continue;
      tried.add(seat.token);
      this.seat = seat;
      const proj = await this.seatProjection();
      if (proj && proj.roomKind === "solo") {
        writeSeat(this.deps.store, seat); // still good: keep it for this page too
        const open = (proj.games ?? []).some((g) => g.status === "playing" || g.status === "briefing");
        return { openRound: open };
      }
    }
    this.seat = null; // none works: a new room, with no stale token sent on its creation
    const room = await this.post<{ roomId: string; hostClaimToken: string }>("/rooms", { name: "Solo play", kind: "solo" });
    const joined = await this.post<{ playerId: string; recoveryToken: string }>(`/rooms/${room.roomId}/join`, { displayName: SOLO_NAME, asHost: true, hostClaimToken: room.hostClaimToken });
    this.seat = { roomId: room.roomId, playerId: joined.playerId, token: joined.recoveryToken };
    writeSeat(this.deps.store, this.seat);
    return { openRound: false };
  }

  /** Start a new round (Start, or Play again). A round still open is replaced by the server. */
  async start(gameId: string): Promise<void> {
    if (this.disposed || this.state.phase === "starting") return; // a double tap on Start
    this.stopPolling();
    this.set({ phase: "starting" });
    try {
      const { openRound } = await this.ensureSeat();
      if (this.disposed) return;
      const g = await this.post<{ gameId: string }>(`/rooms/${this.seat!.roomId}/games`, { gameId, official: false });
      if (this.disposed) return;
      this.set({ phase: "playing", gameInstanceId: g.gameId, ...(openRound ? { replacedOpenRound: true } : {}) });
      await this.refresh();
      this.startPolling();
    } catch (e) {
      this.set({ phase: "error", error: e instanceof Error ? e.message : "The game server could not start the round." });
    }
  }

  private startPolling(): void {
    this.stopPolling();
    if (this.disposed) return;
    this.timer = setInterval(() => { void this.poll(); }, this.deps.pollMs ?? SOLO_POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Read the room once and move the phase on. */
  async refresh(): Promise<void> {
    if (this.disposed || !this.seat) return;
    const gid = this.state.gameInstanceId;
    if (!gid) return;
    const proj = await this.seatProjection();
    if (this.disposed || this.state.gameInstanceId !== gid) return; // a newer round started meanwhile
    if (!proj) return; // a failed poll: the next one tries again
    const game = (proj.games ?? []).find((g) => g.id === gid);
    if (!game) {
      // The round is gone (left from another tab, or replaced): back to the start.
      this.stopPolling();
      this.set({ phase: "idle" });
      return;
    }
    if (game.status === "finished") {
      this.stopPolling();
      this.set({ ...this.state, phase: "finished", proj });
      return;
    }
    this.set({ ...this.state, phase: "playing", proj });
  }

  /** A player action in the round (answer, open a question). */
  async intent(gameInstanceId: string, action: string, payload: Record<string, unknown>): Promise<void> {
    if (this.disposed || !this.seat) return;
    // A real v4 UUID even on plain http (a phone on the home Wi-Fi), where
    // crypto.randomUUID is missing: see uuid.ts.
    const uuid = this.deps.uuid ?? uuidV4;
    try {
      await this.post(`/rooms/${this.seat.roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: uuid(), roomId: this.seat.roomId, gameInstanceId, action, payload } });
    } catch { /* refused or not delivered: the projection shows what counted */ }
    await this.refresh();
  }

  /**
   * Leave the round in play (it is removed with nothing scored). Safe to call
   * twice; best effort when the page is going away (keepalive).
   */
  async leave(): Promise<void> {
    this.stopPolling();
    const gid = this.state.gameInstanceId;
    const playing = this.state.phase === "playing" || this.state.phase === "starting";
    this.set({ phase: "idle" });
    if (!playing || !gid || !this.seat) return;
    const f = this.deps.fetch ?? fetch;
    try { await f(`/rooms/${this.seat.roomId}/games/${gid}/cancel`, { method: "POST", headers: this.headers(), body: "{}", keepalive: true }); } catch { /* the next Start replaces it anyway */ }
  }

  /** Stop everything; nothing this session does after this reaches the screen. */
  dispose(): void {
    this.stopPolling();
    this.disposed = true;
  }
}
