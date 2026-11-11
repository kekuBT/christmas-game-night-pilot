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
 *   "Rejoin" a solo room. That is best effort, not a server guarantee: when
 *   storage fails the seat is kept for the page (pageSeat).
 *
 * Every request is bounded (review of PR #6, P2): fetch AND reading the reply
 * run under one timeout, as the hardened polls do (liveness.ts). A request
 * belongs to the run that sent it: Leave, a new Start and dispose() abort the
 * run's requests, and a generation check drops any reply that still arrives
 * for an older run, so a late reply can never revive a left or replaced
 * round.
 *
 * Failures are told apart (review of PR #6, P2):
 * - "lost": the server answered 401/403/404. The seat or its room is gone
 *   (a server reset, say). Play stops with an explicit safe restart.
 * - "transient": no answer, a timeout, a 5xx or an unreadable reply. The seat
 *   is kept and never replaced on this evidence alone; during a round the
 *   last screen stays up, polling continues, and after STALE_AFTER_MS without
 *   a fresh reply the screen says it is reconnecting.
 * - "refused": any other answer with an error (400/409): shown as given.
 *
 * Mutations whose outcome is uncertain are not blindly repeated:
 * - Start (POST /games) that gets no answer (Stage 7.4, review 6786060026):
 *   the same press (its id, revision and game, unchanged) is sent again, but
 *   only within the first request's own allowance: a quick failure (the
 *   connection refused or reset) is resent at once; a request that used its
 *   whole allowance ends the Start as before. Only the server's answer counts:
 *   the round it started (a replay, only while that round is still the room's
 *   latest), a round started now (it never arrived and nothing changed), or a
 *   stale refusal (the room moved on). A round is never adopted because it
 *   merely appeared in the room: another tab may have started the same game.
 *   A press still without an answer is kept, and Try again sends it again.
 * - A room made but not yet joined (the join got no answer): the next try
 *   joins that room with its creation token instead of making another.
 * - Making a room (POST /rooms) that gets no answer can leave an unused room
 *   on the server (no expiry yet, D-S61-03); only a person's Try again makes
 *   another.
 */
import { readJson } from "../http.js";
import { DEFAULT_SESSION_SEASON, type SessionSeason } from "../../../../src/shared/season.js";
import { oneAtATime, POLL_TIMEOUT_MS, STALE_AFTER_MS } from "../liveness.js";
import type { Projection } from "../types.js";
import { noteServerTime } from "../ui/mchezo/lib/lifecycle.js";
import type { KeyValueStore } from "./personalBest.js";
import { uuidV4 } from "../uuid.js";

export const SOLO_SEAT_KEY = "mchezo.solo.v1";
export const SOLO_POLL_MS = 1000;
/** One request, fetch and reply together (the same allowance as a poll). */
export const SOLO_REQUEST_TIMEOUT_MS = POLL_TIMEOUT_MS;
/** Everything Start does (checking the seat, making a room, starting the round). */
export const SOLO_START_BUDGET_MS = 15_000;
/** Stage 7.4: times a Start's press is sent again (unchanged) after a quick failure, within the first request's allowance. */
export const SOLO_START_RESENDS = 2;
/** The name on the solo seat; nobody else ever sees it. */
export const SOLO_NAME = "You";

export const SOLO_UNREACHABLE = "The game server can’t be reached right now. Check the connection, then try again.";
export const SOLO_LOST = "This round is no longer on the game server (it may have restarted). Nothing from it was scored.";

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

export type SoloFailure = "lost" | "transient" | "refused";

/** A request that did not succeed, and why (see the file comment). */
export class SoloRequestError extends Error {
  /** `timedOut`: the request used its whole allowance (as opposed to failing quickly). */
  constructor(readonly kind: SoloFailure, message: string, readonly status?: number, readonly timedOut = false) {
    super(message);
    this.name = "SoloRequestError";
  }
}

/** Read a reply as JSON, sorting failures into lost / transient / refused. */
async function readReply<T>(r: Response): Promise<T> {
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new SoloRequestError("lost", SOLO_LOST, r.status);
  if (r.status >= 500 || r.status === 408 || r.status === 429) throw new SoloRequestError("transient", SOLO_UNREACHABLE, r.status);
  try {
    return await readJson<T>(r);
  } catch (e) {
    // An error the server explained (400/409) is a refusal; anything
    // unreadable (a proxy's page, a cut-off body) is a passing problem.
    if (!r.ok && e instanceof Error) throw new SoloRequestError("refused", e.message, r.status);
    throw new SoloRequestError("transient", SOLO_UNREACHABLE, r.status);
  }
}

export type SoloPhase = "idle" | "starting" | "playing" | "finished" | "error" | "lost";

export interface SoloState {
  phase: SoloPhase;
  gameInstanceId?: string;
  proj?: Projection;
  error?: string;
  /** Why the last Start failed ("error" phase). */
  failure?: SoloFailure;
  /** The seat's room had a round still open (a reload or a lost tab): it was replaced. */
  replacedOpenRound?: boolean;
  /** No fresh reply for longer than the allowance: the screen may be out of date. */
  stale?: boolean;
}

type Fetch = typeof fetch;
const isOpen = (status: string) => status === "playing" || status === "briefing";

export class SoloSession {
  private seat: SoloSeat | null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private state: SoloState = { phase: "idle" };
  private readonly poll = oneAtATime(() => this.refresh());
  /** Bumped by Start, Leave and dispose: replies for an older run are dropped. */
  private generation = 0;
  /** Aborts every request of the current run. */
  private run = new AbortController();
  /** When a reply last proved the round on screen is current. */
  private lastFreshAt = 0;
  /**
   * Stage 8.1 (spec feedback 6790913242): each read of the room is numbered
   * when sent. A reply is taken only if no later-sent read has been taken
   * already, so a slow, older reply never overwrites the round on screen or
   * the server-clock estimate taken from a newer one.
   */
  private readsSent = 0;
  private readTaken = 0;
  /** A room this device made but could not yet join (the join got no answer). */
  private unjoined: { roomId: string; hostClaimToken: string } | null = null;
  /**
   * Stage 7.4 (review 6786060026): a Start press still without any answer.
   * The next Start of the same game in the same room sends it again,
   * unchanged, so a round it did start is answered as a replay instead of a
   * second round. Any definite answer, Leave and dispose end it.
   */
  private pendingStart: { roomId: string; gameId: string; season: SessionSeason; attempt: { id: string; sessionRevision: number } } | null = null;

  constructor(private readonly deps: {
    store: KeyValueStore | null;
    onChange: (s: SoloState) => void;
    fetch?: Fetch;
    pollMs?: number;
    uuid?: () => string;
    /** Tests: shorter allowances, and a clock. */
    requestTimeoutMs?: number;
    startBudgetMs?: number;
    staleAfterMs?: number;
    now?: () => number;
  }) {
    this.seat = currentSeat(deps.store);
  }

  get current(): SoloState { return this.state; }
  get isDisposed(): boolean { return this.disposed; }
  get roomId(): string | undefined { return this.seat?.roomId; }
  get playerId(): string | undefined { return this.seat?.playerId; }

  private now(): number { return (this.deps.now ?? Date.now)(); }

  private set(next: SoloState): void {
    if (this.disposed) return;
    this.state = next;
    this.deps.onChange(next);
  }

  /** A new run: everything the previous one still has in flight is aborted and ignored. */
  private newRun(): number {
    this.run.abort();
    this.run = new AbortController();
    return ++this.generation;
  }

  private isCurrent(gen: number): boolean { return !this.disposed && gen === this.generation; }

  private headers(token: string | undefined = this.seat?.token): Record<string, string> {
    return { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) };
  }

  /**
   * One request of the current run, bounded as a whole (fetch and reading
   * the reply). It ends at its timeout, or as soon as the run is aborted
   * (Leave, Start, dispose), even if the fetch ignores the abort; the request
   * is aborted on the way out however it ended.
   */
  private async request<T>(path: string, init: RequestInit, timeoutMs?: number): Promise<T> {
    const run = this.run;
    const ac = new AbortController();
    const onRunAbort = () => ac.abort();
    if (run.signal.aborted) ac.abort(); else run.signal.addEventListener("abort", onRunAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      // Reject as timed out first, then abort: aborting settles `stopped` too,
      // and the race must report the timeout (Stage 7.4: a timed-out Start is not resent).
      timer = setTimeout(() => { reject(new SoloRequestError("transient", SOLO_UNREACHABLE, undefined, true)); ac.abort(); }, Math.max(1, timeoutMs ?? this.deps.requestTimeoutMs ?? SOLO_REQUEST_TIMEOUT_MS));
    });
    const stopped = new Promise<never>((_, reject) => {
      const stop = () => reject(new SoloRequestError("transient", "stopped"));
      if (ac.signal.aborted) stop(); else ac.signal.addEventListener("abort", stop, { once: true });
    });
    try {
      const f = this.deps.fetch ?? fetch;
      const reply = f(path, { ...init, cache: "no-store", signal: ac.signal }).then(
        (r) => readReply<T>(r),
        (e: unknown) => { throw e instanceof SoloRequestError ? e : new SoloRequestError("transient", SOLO_UNREACHABLE); },
      );
      return await Promise.race([reply, expired, stopped]);
    } finally {
      clearTimeout(timer);
      run.signal.removeEventListener("abort", onRunAbort);
      ac.abort();
    }
  }

  private projectionOf(seat: SoloSeat, timeoutMs?: number): Promise<Projection> {
    return this.request<Projection>(`/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } }, timeoutMs);
  }

  private post<T>(path: string, body: unknown, timeoutMs?: number, token?: string): Promise<T> {
    return this.request<T>(path, { method: "POST", headers: this.headers(token), body: JSON.stringify(body) }, timeoutMs);
  }

  /** Time left for Start's next request, or a transient failure when none is. */
  private budget(deadline: number): number {
    const left = deadline - this.now();
    if (left <= 0) throw new SoloRequestError("transient", SOLO_UNREACHABLE);
    return Math.min(this.deps.requestTimeoutMs ?? SOLO_REQUEST_TIMEOUT_MS, left);
  }

  /**
   * A seat the server accepts for a solo room, with the room as it is now
   * (null for a room just made). A seat is reused only when the server
   * accepts its token: a room id or code alone never gets you in. Only a
   * definite answer (401/403/404) retires a seat; a passing failure keeps it
   * and fails this Start, so an outage never makes a replacement room.
   */
  private async ensureSeat(gen: number, deadline: number): Promise<Projection | null> {
    const tried = new Set<string>();
    // The stored seat, then this page's (storage that reads but can't be
    // written may hold a stale one), then the one this session already has.
    for (const seat of [readSeat(this.deps.store), pageSeat, this.seat]) {
      if (!seat || tried.has(seat.token)) continue;
      tried.add(seat.token);
      try {
        const proj = await this.projectionOf(seat, this.budget(deadline));
        if (proj.roomKind === "solo") {
          this.seat = seat;
          writeSeat(this.deps.store, seat);
          return proj;
        }
      } catch (e) {
        if (!(e instanceof SoloRequestError) || e.kind !== "lost") throw e;
      }
      if (!this.isCurrent(gen)) throw new SoloRequestError("transient", "stopped");
    }
    // No known seat works: join the room made last time if its join got no
    // answer, else make one. No token from an old seat is sent either way.
    this.seat = null;
    if (this.unjoined) {
      try {
        return await this.joinUnjoined(deadline);
      } catch (e) {
        if (!(e instanceof SoloRequestError) || e.kind === "transient") throw e;
        // Refused or gone: that join may well have worked with its reply lost,
        // so the seat is taken by a token this device never received. The room
        // is given up (no access is ever claimed from its id alone) and a new
        // one is made in this same Start (review of PR #6, Stage 6.2 S6).
        this.unjoined = null;
      }
    }
    const room = await this.post<{ roomId: string; hostClaimToken: string }>("/rooms", { name: "Solo play", kind: "solo" }, this.budget(deadline));
    this.unjoined = { roomId: room.roomId, hostClaimToken: room.hostClaimToken };
    return this.joinUnjoined(deadline);
  }

  /** Join the room this device made, with its creation token; on a refusal it is no longer ours. */
  private async joinUnjoined(deadline: number): Promise<null> {
    const { roomId, hostClaimToken } = this.unjoined!;
    try {
      const joined = await this.post<{ playerId: string; recoveryToken: string }>(`/rooms/${roomId}/join`, { displayName: SOLO_NAME, asHost: true, hostClaimToken }, this.budget(deadline));
      this.unjoined = null;
      this.seat = { roomId, playerId: joined.playerId, token: joined.recoveryToken };
      writeSeat(this.deps.store, this.seat);
      return null;
    } catch (e) {
      if (e instanceof SoloRequestError && e.kind !== "transient") this.unjoined = null;
      throw e;
    }
  }

  /**
   * Start a new round (Start, Play again, Try again). A round still open is
   * replaced by the server. `season` (Stage 8.2): the content this round
   * deals, the player's choice; the server binds it to the round.
   */
  async start(gameId: string, season: SessionSeason = DEFAULT_SESSION_SEASON): Promise<void> {
    if (this.disposed || this.state.phase === "starting") return; // a double tap on Start
    this.stopPolling();
    const gen = this.newRun();
    const deadline = this.now() + (this.deps.startBudgetMs ?? SOLO_START_BUDGET_MS);
    this.set({ phase: "starting" });
    try {
      const proj = await this.ensureSeat(gen, deadline);
      if (!this.isCurrent(gen)) return;
      const openIds = (proj?.games ?? []).filter((g) => isOpen(g.status)).map((g) => g.id);
      // Stage 7.4 (clarification 6783492788, review 6786060026): a press has
      // its own id and the room revision it was made against (read just now;
      // a room made in this Start is at 0). The server replays it only while
      // its round is still the latest, and refuses it as stale (SESSION_CONFLICT)
      // once the room has moved on (another tab, a delayed request): then it
      // starts, abandons and uses up nothing, and the refusal is shown with
      // Try again, which makes a new press. A press that got no answer at all
      // is sent again unchanged (here, and by the next Start of this game).
      const roomId = this.seat!.roomId;
      // Stage 8.2 (feedback 6795825877, 3): a press that got no answer is sent
      // again unchanged, its content included: the remembered choice (which
      // another tab may have changed since) is a default for a NEW press only.
      const pending = this.pendingStart?.roomId === roomId && this.pendingStart.gameId === gameId ? this.pendingStart : null;
      const attempt = pending?.attempt ?? { id: uuidV4(), sessionRevision: proj?.session?.revision ?? 0 };
      season = pending?.season ?? season;
      this.pendingStart = { roomId, gameId, season, attempt };
      let gid: string | undefined;
      // Every send of this press fits in the first request's allowance (and
      // the Start's budget), so a Start with no answer ends when it did before.
      const sendsEnd = Math.min(deadline, this.now() + (this.deps.requestTimeoutMs ?? SOLO_REQUEST_TIMEOUT_MS));
      for (let resent = 0; gid === undefined; resent++) {
        try {
          gid = (await this.post<{ gameId: string }>(`/rooms/${roomId}/games`, { gameId, official: false, season, attempt }, Math.max(1, Math.min(this.budget(deadline), sendsEnd - this.now())))).gameId;
        } catch (e) {
          if (!this.isCurrent(gen)) return;
          const noAnswer = e instanceof SoloRequestError && e.kind === "transient";
          // Only a quick failure is resent. A request that used its whole
          // allowance ends the Start, whatever the clock says (timers can fire
          // a little early); Try again resends the same press.
          const quickFailure = noAnswer && !(e as SoloRequestError).timedOut;
          if (quickFailure && resent < SOLO_START_RESENDS && sendsEnd - this.now() > 0) continue;
          if (!noAnswer) this.pendingStart = null; // a definite answer ends the press
          throw e;
        }
      }
      this.pendingStart = null;
      if (!this.isCurrent(gen)) return;
      this.lastFreshAt = this.now();
      // "Replaced" only when an open round other than this press's own was there.
      this.set({ phase: "playing", gameInstanceId: gid, ...(openIds.some((id) => id !== gid) ? { replacedOpenRound: true } : {}) });
      await this.refresh();
      if (this.isCurrent(gen) && this.state.phase === "playing") this.startPolling();
    } catch (e) {
      if (!this.isCurrent(gen)) return;
      const err = e instanceof SoloRequestError ? e : new SoloRequestError("transient", SOLO_UNREACHABLE);
      this.set({ phase: "error", failure: err.kind, error: err.kind === "transient" ? SOLO_UNREACHABLE : err.kind === "lost" ? SOLO_LOST : err.message });
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
    const gen = this.generation;
    const read = ++this.readsSent;
    let proj: Projection;
    try {
      proj = await this.projectionOf(this.seat);
    } catch (e) {
      if (!this.isCurrent(gen) || this.state.gameInstanceId !== gid) return;
      if (e instanceof SoloRequestError && e.kind === "lost") {
        // The seat or its room is gone: say so, and offer a safe restart.
        this.stopPolling();
        this.set({ phase: "lost", error: SOLO_LOST });
        return;
      }
      // A passing failure: keep the round and the seat, keep polling, and
      // say so once it has lasted longer than a blip.
      const stale = this.now() - this.lastFreshAt > (this.deps.staleAfterMs ?? STALE_AFTER_MS);
      if (stale && !this.state.stale && (this.state.phase === "playing")) this.set({ ...this.state, stale: true });
      return;
    }
    if (!this.isCurrent(gen) || this.state.gameInstanceId !== gid) return; // a newer round started meanwhile
    if (read < this.readTaken) return; // an older read answered after a newer one: never shown over it
    this.readTaken = read;
    // Stage 8.1 (F3): countdowns use the server's clock, as room screens do,
    // never this phone's own clock alone: taken from each reply accepted here
    // (the first one after Start included), never from a refused or stale one.
    noteServerTime(proj.serverNow);
    this.lastFreshAt = this.now();
    const game = (proj.games ?? []).find((g) => g.id === gid);
    if (!game) {
      // The round is gone (left from another tab, or replaced): back to the start.
      this.stopPolling();
      this.set({ phase: "idle" });
      return;
    }
    if (game.status === "finished") {
      this.stopPolling();
      this.set({ ...this.state, phase: "finished", proj, stale: false });
      return;
    }
    this.set({ ...this.state, phase: "playing", proj, stale: false });
  }

  /**
   * A player action in the round (answer, guess, open a round). Resolves
   * true when the server took it, false when it was refused or did not get
   * through: the game screens keep the player's entry then (Pulse's send
   * note, Connections' four selected tiles), as in multiplayer.
   */
  async intent(gameInstanceId: string, action: string, payload: Record<string, unknown>): Promise<boolean> {
    if (this.disposed || !this.seat) return false;
    const gen = this.generation;
    // A real v4 UUID even on plain http (a phone on the home Wi-Fi), where
    // crypto.randomUUID is missing: see uuid.ts.
    const uuid = this.deps.uuid ?? uuidV4;
    let taken = false;
    try {
      const ack = await this.post<{ accepted?: boolean }>(`/rooms/${this.seat.roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: uuid(), roomId: this.seat.roomId, gameInstanceId, action, payload } });
      taken = ack.accepted !== false;
    } catch { /* refused, lost or unanswered: the projection read next shows what counted */ }
    if (!this.isCurrent(gen)) return false;
    await this.refresh();
    return taken;
  }

  /**
   * Leave the round in play (it is removed with nothing scored). Safe to call
   * twice; best effort and bounded when the page is going away (keepalive).
   */
  async leave(): Promise<void> {
    this.stopPolling();
    const gid = this.state.gameInstanceId;
    const seat = this.seat;
    const playing = this.state.phase === "playing" || this.state.phase === "starting";
    this.newRun(); // whatever the round still has in flight is aborted, and its replies ignored
    this.pendingStart = null; // a later Start is a new press, made against the room as it is then
    this.set({ phase: "idle" });
    if (!playing || !gid || !seat) return;
    const f = this.deps.fetch ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.deps.requestTimeoutMs ?? SOLO_REQUEST_TIMEOUT_MS);
    try {
      await f(`/rooms/${seat.roomId}/games/${gid}/cancel`, { method: "POST", headers: this.headers(seat.token), body: "{}", keepalive: true, signal: ac.signal });
    } catch { /* the next Start replaces it anyway */ } finally {
      clearTimeout(timer);
    }
  }

  /** Stop everything; nothing this session does after this reaches the screen. */
  dispose(): void {
    this.stopPolling();
    this.disposed = true;
    this.pendingStart = null;
    this.generation++;
    this.run.abort();
  }
}
