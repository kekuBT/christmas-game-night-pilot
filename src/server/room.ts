import { createHash, randomInt } from "node:crypto";
import { getGame } from "../games/registry.js";
import { CLIENT_PROTOCOL, MIN_CLIENT_PROTOCOL } from "../shared/clientProtocol.js";
import { COUNT_GAMES_WITH_NO_PARTICIPATION, policyFor, type EndReason, type GameOutcome, type Participation } from "./lifecycle.js";
import { dayScore, midrankScore } from "../scoring/championship.js";
import { computeChampionship, type PlayerDay } from "../scoring/ledger.js";
import { formatInfo, type CompetitionFormat } from "../scoring/format.js";
import { qualifies, QualificationPolicySchema, type GameParticipationRecord, type QualificationPolicy } from "../scoring/qualification.js";
import { CupRecordSchema, describePolicy, newCupRecord, restoreCupRecord, type CupRecord } from "./cup.js";
import { contentLibrary, type ContentLibrary } from "../content/registry.js";
import { recordUsage, selectContent, type UsageHistory } from "../content/select.js";
import { ITEMS_PER_GAME, materialize } from "../content/materialize.js";
import { CONTENT_GAMES, type ContentGameId } from "../content/schema.js";
import { seededRng } from "../shared/rng.js";
import type { ConnectionsBoard } from "../games/connections.js";
import type { SprintCategory } from "../games/sprint.js";
import { evaluateAchievements, dayCeremony } from "./achievements.js";
import { generateMathQuestions, scoreMathAnswer, type MathQuestion } from "../games/math.js";
import {
  abstainClue,
  abstainVote,
  allCluesIn,
  allVotesIn,
  impostorScores,
  initImpostor,
  projectImpostor,
  resolveVote,
  submitClue,
  submitGuess,
  submitVote,
  type ImpostorState,
} from "../games/impostor.js";
import {
  abstainCaption,
  abstainCaptionVote,
  allCaptionVotesIn,
  allCaptionsIn,
  captionRoundScores,
  captionTotalScores,
  currentRound,
  initCaption,
  projectCaption,
  submitCaption,
  submitCaptionVote,
  type CaptionState,
} from "../games/caption.js";
import {
  abstainClosest,
  advanceClosest,
  allGuessed,
  closestQuestionScores,
  closestTotalScores,
  initClosest,
  projectClosest,
  submitClosestGuess,
  type ClosestState,
} from "../games/closest.js";
import { generateTrivia, scoreTrivia, type TriviaQuestion } from "../games/trivia.js";
import { scoreYear, YEAR_EVENTS, type YearEvent } from "../games/year.js";
import { scoreWhoSaid, WHO_SAID_PACK, type WhoSaidQuestion } from "../games/whosaid.js";
import { GEOGRAPHY_PACK, scoreGeography, type GeographyQuestion } from "../games/geography.js";
import {
  CONNECTIONS_BOARD,
  connectionsScore,
  guessConnections,
  type ConnectionsPlayerState,
} from "../games/connections.js";
import { scoreSprintRound, SPRINT_CATEGORIES } from "../games/sprint.js";
import {
  charadesPlayerScores,
  charadesTurn,
  initCharades,
  projectCharades,
  type CharadesState,
} from "../games/charades.js";
import {
  createJoinCode,
  createRecoveryCode,
  createRecoveryToken,
  dedupeKey,
  hashRecoveryCode,
  hashToken,
  IntentSchema,
  normalizeRecoveryCode,
  sanitizeText,
} from "../shared/protocol.js";

export type Audience = "player" | "tv" | "host" | "cohost";

/**
 * How long a player whose device dropped is shown as "reconnecting" (and
 * protected from being silently left out of an official game start)
 * before they are shown as "away". Presence only: it never changes a
 * game roster, an answer, a score, or completion.
 */
export const RECONNECT_GRACE_MS = 45_000;

/**
 * Network presence, derived on read (never stored):
 * - connected: at least one live, current-credential socket;
 * - reconnecting: no socket, dropped less than RECONNECT_GRACE_MS ago;
 * - away: no socket for longer (or never connected since a restart grace).
 * Presence is separate from room membership (the slot always exists) and
 * from game participation (GameInstance.players, fixed at start).
 */
export type Presence = "connected" | "reconnecting" | "away";

export interface RoomPlayer {
  id: string;
  displayName: string;
  avatar: string;
  isHost: boolean;
  isCohost: boolean;
  /** A live socket is open for this slot right now. Completion rules read this (unchanged). */
  connected: boolean;
  /**
   * SHA-256 of the slot's current SESSION credential. (Legacy field name:
   * this is the session token, not a recovery code; renaming it would
   * break every saved room.)
   */
  recoveryTokenHash: string;
  joinedAt: number;
  /** Server time the last live socket closed; null/absent while connected. */
  disconnectedAt?: number | null;
  /** Incremented whenever the session credential is replaced (recovery). Absent = 0. */
  credentialVersion?: number;
  /** SHA-256 of the slot's current one-time recovery code, if one was issued. */
  recoveryCodeHash?: string | null;
}

/**
 * A spectator is a server-recognized viewer, NOT a player. Spectators are
 * stored separately from `players` so they can never occupy a seat, count
 * toward the 10-player cap, join a game's player list, block completion,
 * earn scores, or appear in standings. Only the token hash is stored;
 * the raw token is returned once at spectate time and never persisted.
 */
export interface Spectator {
  id: string;
  tokenHash: string;
  connected: boolean;
  joinedAt: number;
}

export interface LedgerEvent {
  eventId: string;
  seq: number;
  type: string;
  playerId?: string;
  gameInstanceId?: string;
  points?: number;
  reason?: string;
  actor?: string;
  official?: boolean;
  previousPoints?: number;
  /** Structured detail for audit events (e.g. who was left out of a game start). Never secrets. */
  detail?: Record<string, unknown>;
  createdAt: number;
}

/** Who is here, and what pressing Start would do. Derived from presence; no secrets. */
export interface Readiness {
  registered: number;
  connected: number;
  reconnecting: number;
  away: number;
  /** Players a game started now would include (live connection), in join order. */
  wouldPlay: string[];
  /** Players a game started now would leave out, with why. */
  wouldMiss: { id: string; presence: Presence; awayForMs: number }[];
}

/**
 * A game start the server refused so the host can decide (HTTP 409):
 * - ROSTER_CHANGED: the roster the host saw is not the roster it would get.
 * - PLAYERS_RECONNECTING: an official game would silently leave out a
 *   player still inside the reconnect grace window.
 */
export class StartRefused extends Error {
  constructor(readonly code: "ROSTER_CHANGED" | "PLAYERS_RECONNECTING", message: string, readonly readiness: Readiness) {
    super(message);
  }
}

/** The host can't start an official game: this Cup has run out of unused approved content for it. */
export class ContentShortage extends Error {
  readonly code = "CONTENT_EXHAUSTED";
  constructor(message: string, readonly available: number, readonly needed: number) {
    super(message);
  }
}

export interface GameInstance {
  id: string;
  gameId: string;
  official: boolean;
  status: "playing" | "finished";
  players: string[]; // player ids
  timedOut?: boolean; // host-skipped after deadline; never counts toward official standings
  day?: number; // championship day the game was started on (default 1)
  questions?: MathQuestion[]; // Math only, server-side. Never projected pre-reveal.
  answers: Record<string, Record<string, number | null>>; // playerId -> questionId -> chosenIndex
  answerTimes: Record<string, Record<string, number>>; // playerId -> questionId -> elapsedMs
  /**
   * Math (Sprint 3, P10): server time each question was revealed to each
   * player (playerId -> questionId -> ms). A question's prompt is sent only
   * when the player opens it, so its speed bonus is measured from that
   * moment, on the server's clock. Absent on games started before Sprint 3.
   */
  openedAt?: Record<string, Record<string, number>>;
  /**
   * Math: players whose device was shown every prompt in advance because it
   * is a pre-Sprint 3 tab that cannot open questions one by one. Their
   * answers in this game score correctness only (no speed bonus), so hiding
   * the client version can never be used to read prompts early.
   */
  promptsExposed?: string[];
  rawScores: Record<string, number>;
  startedAt?: number;
  deadlineAt?: number;
  seed: number;
  /** Player ids that have submitted at least one accepted intent in this game.
   *  Used only for a privacy-safe waiting count (count, never identities or
   *  answers, in projections). Old snapshots lack it and are treated as []. */
  submittedPlayers?: string[];
  /** Whole-game abstainers (quiz/math/connections/sprint): they sat out the
   *  rest of the game, score 0 for unanswered items, and count as done for
   *  advancement. Phase games (impostor/caption/closest) record abstentions
   *  per phase in their own state instead. */
  abstained?: string[];
  extra?: unknown;
  /** Sprint 3 lifecycle. Absent on games started before it (legacy). */
  lifecycleVersion?: number;
  /** Phased games: which phase is running ("q:3", "1:vote"...) and when it closes (server time). */
  phaseKey?: string;
  phaseDeadlineAt?: number;
  /** How the game ended and whether it counts. Written once, at finalization; never recomputed. */
  outcome?: GameOutcome;
}

/**
 * Authoritative in-process room engine (LOCAL adapter).
 * This is NOT a Cloudflare Durable Object test. It implements the same
 * semantics locally: server-validated intents, deduplication, deadlines,
 * per-player projections, and an append-only ledger.
 */
export class RoomEngine {
  id: string;
  joinCode: string;
  name: string;
  players = new Map<string, RoomPlayer>();
  /** Viewers only. Deliberately disjoint from `players`: no seat, no score,
   *  no completion blocking, no attendance. See `Spectator` above. */
  spectators = new Map<string, Spectator>();
  hostId: string | null = null;
  cohosts = new Set<string>();
  championshipDay = 1;
  games = new Map<string, GameInstance>();
  ledger: LedgerEvent[] = [];
  /**
   * The Cup this room is running (src/server/cup.ts): its format and
   * qualifying rule, saved with the room and fixed for the Cup's life.
   * New rooms: the Individual Family Cup with the meaningful-participation
   * rule. Snapshots from before Sprint 4 keep the rules they were played
   * under. An invalid saved record is kept as-is (cupRaw) and pauses the
   * standings instead of being replaced by a guess.
   */
  private _cup: CupRecord;
  private cupError: string | null = null;
  private cupRaw: unknown = undefined;
  get cup(): CupRecord {
    return this._cup;
  }
  get competitionFormat(): CompetitionFormat {
    return this._cup.format;
  }
  get qualificationPolicy(): QualificationPolicy {
    return this._cup.qualificationPolicy;
  }
  /** Why standings are paused (an unreadable Cup record), or null. */
  get cupProblem(): string | null {
    return this.cupError;
  }
  /**
   * Choose this Cup's rules. Only before its first game: a Cup's rules are
   * fixed before it begins and never change during it. Validated.
   */
  configureCup(opts: { qualificationPolicy?: unknown; format?: CompetitionFormat }): void {
    if (this.cupError) throw new Error("This Cup's saved rules could not be read; they must be repaired, not replaced");
    if (this.games.size > 0) throw new Error("A Cup's rules are fixed once its first game has started");
    const next = CupRecordSchema.parse({
      ...this._cup,
      ...(opts.format ? { format: opts.format } : {}),
      ...(opts.qualificationPolicy !== undefined ? { qualificationPolicy: QualificationPolicySchema.parse(opts.qualificationPolicy) } : {}),
    });
    this._cup = Object.freeze({ ...next, qualificationPolicy: Object.freeze({ ...next.qualificationPolicy }) }) as CupRecord;
    this.log("cup-configured", { detail: { format: next.format, qualificationPolicy: next.qualificationPolicy } });
  }
  /**
   * TESTING ONLY: multiplies every lifecycle duration (game windows and
   * phases) so browser drivers can watch deadlines pass in seconds. Always
   * 1 in real use; set only by LocalServer from MCHEZO_LIFECYCLE_SCALE,
   * which serve.ts refuses in production. Not persisted.
   */
  lifecycleScale = 1;
  /**
   * Content (Sprint 4): which items this Cup has used, and a counter that
   * makes successive selections differ reproducibly. Saved with the room,
   * scoped to the Cup. Cups from before Sprint 4 keep their old fixed packs.
   */
  contentUsage: UsageHistory = {};
  contentSeq = 0;
  /** The content library (the shipped packs; tests may inject their own). */
  private _content: ContentLibrary | null = null;
  get content(): ContentLibrary { return (this._content ??= contentLibrary()); }
  set content(lib: ContentLibrary) { this._content = lib; }
  /** A projection changed persisted state (promptsExposed); the caller saves. */
  private dirty = false;
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }
  seq = 0;
  private seenIntents = new Map<string, { accepted: boolean; result: unknown }>();
  private nextPlayer = 1;
  private nextGame = 1;
  private nextSpectator = 1;
  /** Server clock. Injectable so tests control time; never the client's clock. */
  clock: () => number = Date.now;

  constructor(name: string) {
    this.id = `room-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    this.joinCode = createJoinCode();
    this.name = name;
    this._cup = newCupRecord(`cup-${Date.now().toString(36)}-${randomInt(0, 2 ** 31).toString(36)}`, Date.now());
  }

  private log(type: string, extra: Partial<LedgerEvent> = {}): LedgerEvent {
    this.seq += 1;
    const ev: LedgerEvent = { eventId: `evt-${this.seq}`, seq: this.seq, type, createdAt: this.clock(), ...extra };
    this.ledger.push(ev);
    return ev;
  }

  join(displayName: string, opts: { asHost?: boolean } = {}): { player: RoomPlayer; recoveryToken: string } {
    const clean = sanitizeText(displayName, 32);
    if (!clean) throw new Error("Display name is required");
    if (this.players.size >= 10) throw new Error("Room is full (10 players)");
    for (const p of this.players.values()) {
      if (p.displayName.toLowerCase() === clean.toLowerCase()) throw new Error("Display name already taken");
    }
    const isHost = opts.asHost === true && this.hostId === null;
    const id = `player-${this.nextPlayer++}`;
    const token = createRecoveryToken();
    const player: RoomPlayer = {
      id,
      displayName: clean,
      avatar: "🎄",
      isHost,
      isCohost: false,
      connected: true,
      recoveryTokenHash: hashToken(token),
      joinedAt: this.clock(),
      disconnectedAt: null,
      credentialVersion: 0,
      recoveryCodeHash: null,
    };
    this.players.set(id, player);
    if (isHost) this.hostId = id;
    this.log("player-joined", { playerId: id });
    // Event attribution (Milestone K): becoming the host is a privileged
    // role acquisition, so it gets its own audit event — the player-joined
    // event alone cannot answer "who claimed the host role, and when?"
    // (The first host join and a later claim-token join both log it.)
    if (isHost) this.log("host-claimed", { playerId: id });
    return { player, recoveryToken: token };
  }

  /**
   * Verify a slot's session credential (the "Reconnect" button). No token =
   * no takeover. This no longer marks the player connected: presence
   * follows live sockets only (Sprint 2). The old behaviour created a
   * "connected" player with no device behind it, who then counted for
   * game starts and blocked completion indefinitely.
   */
  reconnect(playerId: string, recoveryToken: string): RoomPlayer {
    const player = this.players.get(playerId);
    if (!player) throw new Error("Unknown player slot");
    if (hashToken(recoveryToken) !== player.recoveryTokenHash) throw new Error("Recovery token does not match");
    this.log("player-reconnected", { playerId });
    return player;
  }

  // ---------------------------------------------------------------- recovery
  // docs/RECOVERY_CONTRACT.md. A recovery restores an EXISTING slot (its id,
  // role, answers, scores, Family Cup history): it never creates a slot,
  // merges slots, frees a name, or changes privileges.

  /**
   * Issue (or re-issue) the slot's one-time recovery code. Only the hash is
   * kept; the plaintext is returned once, to the slot's own session. A new
   * code revokes the previous one.
   */
  issueRecoveryCode(playerId: string): string {
    const p = this.players.get(playerId);
    if (!p) throw new Error("Unknown player slot");
    const code = createRecoveryCode();
    p.recoveryCodeHash = hashRecoveryCode(normalizeRecoveryCode(code)!);
    this.log("recovery-code-issued", { playerId });
    return code;
  }

  /** The slot a recovery code belongs to, or null. Never matches by name. */
  slotForRecoveryCode(input: unknown): RoomPlayer | null {
    const n = normalizeRecoveryCode(input);
    if (!n) return null;
    const h = hashRecoveryCode(n);
    for (const p of this.players.values()) if (p.recoveryCodeHash && p.recoveryCodeHash === h) return p;
    return null;
  }

  /**
   * Supersede the slot's session (contract §3): new session credential,
   * credentialVersion + 1 (old sockets become stale), old recovery code
   * consumed and replaced by a fresh one, audit event. Roles, answers,
   * scores and game rosters are untouched.
   */
  rotateCredentials(playerId: string, method: "code" | "host", actorId?: string): { sessionToken: string; recoveryCode: string } {
    const p = this.players.get(playerId);
    if (!p) throw new Error("Unknown player slot");
    const sessionToken = createRecoveryToken();
    p.recoveryTokenHash = hashToken(sessionToken);
    p.credentialVersion = (p.credentialVersion ?? 0) + 1;
    const recoveryCode = createRecoveryCode();
    p.recoveryCodeHash = hashRecoveryCode(normalizeRecoveryCode(recoveryCode)!);
    this.log("seat-recovered", { playerId, actor: actorId, detail: { method, credentialVersion: p.credentialVersion } });
    return { sessionToken, recoveryCode };
  }

  /** Audit a failed recovery-code attempt (never the code itself). */
  auditRecoveryFailure(via: "code"): void {
    this.log("recovery-attempt-failed", { detail: { via } });
  }

  /** Recent seat recoveries, as plain room notices (contract §2.1 step 6: mandatory and visible). */
  recentNotices(now = this.clock(), windowMs = 5 * 60_000): { eventId: string; type: string; playerId: string; displayName: string; method: string; byName: string | null; at: number }[] {
    return this.ledger
      .filter((e) => e.type === "seat-recovered" && now - e.createdAt < windowMs && e.playerId)
      .map((e) => ({
        eventId: e.eventId,
        type: e.type,
        playerId: e.playerId!,
        displayName: this.players.get(e.playerId!)?.displayName ?? "A player",
        method: String((e.detail as { method?: string } | undefined)?.method ?? "code"),
        byName: e.actor ? this.players.get(e.actor)?.displayName ?? null : null,
        at: e.createdAt,
      }));
  }

  /** The slot's last live socket closed. Starts the reconnect grace window. */
  disconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.connected || p.disconnectedAt == null) p.disconnectedAt = this.clock();
    p.connected = false;
  }

  /** A live, current-credential socket is open for the slot. */
  markConnected(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = true;
    p.disconnectedAt = null;
  }

  presenceOf(playerId: string, now = this.clock()): Presence {
    const p = this.players.get(playerId);
    if (!p) return "away";
    if (p.connected) return "connected";
    if (p.disconnectedAt != null && now - p.disconnectedAt < RECONNECT_GRACE_MS) return "reconnecting";
    return "away";
  }

  /** Register a spectator: no player record, no seat, no name required.
   *  The returned token is the spectator's only credential; only its hash
   *  is kept. Spectators never appear in `players`, so every player-count,
   *  completion, and standings computation ignores them by construction. */
  addSpectator(): { spectator: Spectator; token: string } {
    const token = createRecoveryToken();
    const spectator: Spectator = {
      id: `spectator-${this.nextSpectator++}`,
      tokenHash: hashToken(token),
      connected: true,
      joinedAt: this.clock(),
    };
    this.spectators.set(spectator.id, spectator);
    this.log("spectator-joined", { actor: spectator.id });
    return { spectator, token };
  }

  spectatorByToken(token: string): Spectator | null {
    if (!token) return null;
    const hash = hashToken(token);
    for (const s of this.spectators.values()) {
      if (s.tokenHash === hash) return s;
    }
    return null;
  }

  setSpectatorConnected(spectatorId: string, connected: boolean): void {
    const s = this.spectators.get(spectatorId);
    if (s) s.connected = connected;
  }

  /** Currently connected spectators only — the "watching now" count. */
  spectatorCount(): number {
    let n = 0;
    for (const s of this.spectators.values()) if (s.connected) n++;
    return n;
  }

  grantCohost(actorId: string, targetId: string): void {
    // Host recovery: a cohost may delegate to another cohost, so a room
    // whose host has disconnected does not lose its only operator when
    // the cohost also needs to hand over. Regular players still cannot
    // grant, and granting never transfers host ownership (hostId is
    // unchanged); the original host regains authority on reconnect.
    if (this.hostId !== actorId && !this.cohosts.has(actorId)) throw new Error("Only host/cohost can grant cohost");
    const target = this.players.get(targetId);
    if (!target) throw new Error("Unknown player");
    target.isCohost = true;
    this.cohosts.add(targetId);
    this.log("cohost-granted", { playerId: targetId, actor: actorId });
  }

  /** Who is here right now, and who a game started now would include or leave out. */
  readiness(now = this.clock()): Readiness {
    const all = [...this.players.values()];
    const presence = all.map((p) => ({ id: p.id, presence: this.presenceOf(p.id, now), awayForMs: p.connected || p.disconnectedAt == null ? 0 : Math.max(0, now - p.disconnectedAt) }));
    return {
      registered: all.length,
      connected: presence.filter((p) => p.presence === "connected").length,
      reconnecting: presence.filter((p) => p.presence === "reconnecting").length,
      away: presence.filter((p) => p.presence === "away").length,
      wouldPlay: all.filter((p) => p.connected).map((p) => p.id),
      wouldMiss: presence.filter((p) => p.presence !== "connected"),
    };
  }

  /**
   * Start a game. Eligibility is unchanged: the roster is the players with a
   * live connection at this moment, fixed for the whole game. Sprint 2 adds
   * two refusals so nobody is left out without the host knowing:
   * - `roster` (optional): the roster the host was shown. If the room
   *   changed since, refuse (ROSTER_CHANGED) instead of starting a game
   *   whose players differ from what was on screen.
   * - Official games refuse while a player is inside the reconnect grace
   *   window (PLAYERS_RECONNECTING), unless the host explicitly lists them
   *   in `proceedWithout`. Practice games do not ask.
   * Nobody is ever added to a game after it starts.
   */
  startGame(hostId: string, gameId: string, opts: { official?: boolean; seed?: number; roster?: string[]; proceedWithout?: string[] } = {}): GameInstance {
    if (this.hostId !== hostId && !this.cohosts.has(hostId)) throw new Error("Only host/cohost can start a game");
    const game = getGame(gameId);
    if (game.status === "not-implemented") throw new Error(`Game not implemented yet: ${gameId}`);
    const policy = policyFor(gameId);
    // P8/P9: practice-only games can never start as official (server-enforced).
    if ((opts.official ?? false) && !policy.officialEligible) throw new Error(policy.practiceOnlyReason ?? `${game.title} is practice-only`);
    this.tick(); // a game whose deadline just passed is finalized before anything new starts
    // The browser UI has a single active-game panel (first playing game), so
    // a second concurrent game would orphan the first: it could never become
    // active again. Reject instead of silently stacking games.
    if ([...this.games.values()].some((g) => g.status === "playing")) throw new Error("A game is already in progress");
    const readiness = this.readiness();
    const playerIds = readiness.wouldPlay;
    if (opts.roster !== undefined) {
      const shown = new Set(opts.roster);
      if (shown.size !== playerIds.length || playerIds.some((id) => !shown.has(id))) {
        throw new StartRefused("ROSTER_CHANGED", "Who is playing changed since you looked. Check the list, then start again.", readiness);
      }
    }
    const reconnecting = readiness.wouldMiss.filter((m) => m.presence === "reconnecting").map((m) => m.id);
    const leftOutOnPurpose = new Set(opts.proceedWithout ?? []);
    if ((opts.official ?? false) && reconnecting.some((id) => !leftOutOnPurpose.has(id))) {
      const names = reconnecting.filter((id) => !leftOutOnPurpose.has(id)).map((id) => this.players.get(id)?.displayName ?? id);
      throw new StartRefused("PLAYERS_RECONNECTING", `${names.join(", ")} ${names.length === 1 ? "is" : "are"} reconnecting. Wait for them, or start without them.`, readiness);
    }
    if (playerIds.length < game.minPlayers) throw new Error(`Need at least ${game.minPlayers} connected players`);
    if (playerIds.length > game.maxPlayers) throw new Error(`Too many players for ${gameId}`);
    const id = `game-${this.nextGame++}`;
    // Secure per-session seed by default. Explicit seeds are for controlled
    // tests only; the old default of 42 made hidden-role assignment predictable.
    const seed = opts.seed ?? randomInt(0, 2147483647);
    const startedAt = this.clock(); // one instant: start, game deadline and first phase all derive from it
    // Content for Cups created from Sprint 4 on: chosen by the selection
    // service and recorded in the Cup's history in this same synchronous
    // step, so it is atomic with game creation.
    let selected: { extra: unknown; record: () => void } | null = null;
    if (this._cup.origin === "created" && (CONTENT_GAMES as string[]).includes(gameId)) {
      const cg = gameId as ContentGameId;
      const mode = (opts.official ?? false) ? "official" : "practice";
      const need = cg === "charades" ? Math.max(ITEMS_PER_GAME.charades, playerIds.length * 4) : ITEMS_PER_GAME[cg];
      const pick = selectContent({ lib: this.content, gameId: cg, count: need, mode, cupId: this._cup.cupId, usage: this.contentUsage, seq: this.contentSeq, today: new Date(startedAt).toISOString().slice(0, 10) });
      if (!pick.ok) throw new ContentShortage(pick.message, pick.available, pick.needed);
      selected = {
        extra: materialize(cg, pick.items, { seed, playerIds }),
        record: () => {
          recordUsage(this.contentUsage, pick.items, { gameInstanceId: id, day: this.championshipDay, mode, seq: this.contentSeq });
          this.contentSeq += 1;
          this.log("content-selected", { gameInstanceId: id, detail: { items: pick.items.map((li) => li.item.id), packs: [...new Set(pick.items.map((li) => `${li.packId}@${li.packVersion}`))], reasons: pick.reasons } });
        },
      };
    }
    const instance: GameInstance = {
      id,
      gameId,
      official: opts.official ?? false,
      status: "playing",
      players: playerIds,
      questions: gameId === "math-mayhem" ? generateMathQuestions(seed) : undefined,
      answers: {},
      answerTimes: {},
      ...(gameId === "math-mayhem" ? { openedAt: {} } : {}),
      rawScores: Object.fromEntries(playerIds.map((p) => [p, 0])),
      startedAt,
      // Overall deadline (independent games) or backstop (phased), from the policy table.
      deadlineAt: startedAt + Math.round(policy.gameWindowMs * this.lifecycleScale),
      lifecycleVersion: 1,
      day: this.championshipDay,
      seed,
      extra: selected ? selected.extra
        : gameId === "impostor"
          ? initImpostor(playerIds, seed)
          : gameId === "caption-clash"
            ? initCaption(seed)
            : gameId === "closest-wins"
              ? initClosest()
              : gameId === "trivia"
                ? { questions: generateTrivia(seed), answers: {}, times: {} }
                : gameId === "who-said-that"
                  ? { questions: WHO_SAID_PACK, answers: {} }
                  : gameId === "geography"
                    ? { questions: GEOGRAPHY_PACK, answers: {} }
                    : gameId === "guess-the-year"
                      ? { events: YEAR_EVENTS, guesses: {} }
                      : gameId === "word-connections"
                        ? { playerStates: Object.fromEntries(playerIds.map((p) => [p, { solved: [], mistakes: 0, guessed: [] }])) }
                        : gameId === "category-sprint"
                          ? { roundIndex: 0, submissions: {} }
                          : gameId === "charades"
                            ? initCharades(playerIds)
                            : undefined,
    };
    this.games.set(id, instance);
    selected?.record();
    this.syncPhase(instance, startedAt); // phased games: start the first phase's clock
    // Audit who was left out and whether the host chose that explicitly.
    const leftOut = readiness.wouldMiss.map((m) => ({ id: m.id, presence: m.presence }));
    this.log("game-started", { gameInstanceId: id, actor: hostId, ...(leftOut.length ? { detail: { leftOut, startedWithoutOnPurpose: [...leftOutOnPurpose].filter((x) => leftOut.some((l) => l.id === x)) } } : {}) });
    return instance;
  }

  /**
   * Players a game waits for before ending early: its whole roster (P6).
   * Until Sprint 3 this was "connected players", so a socket dropping could
   * decide when a game finished. Now completion follows the rules: early
   * when every roster player has finished or chosen to sit out, otherwise
   * at the deadline. A disconnected player can come back and keep playing
   * until then; a silent player can delay others only until the deadline.
   */
  private activePlayers(game: GameInstance): string[] {
    return game.players;
  }

  /** Submit a validated intent. Returns the ack; duplicates return the original result. */
  submitIntent(raw: unknown, actorId: string, now = this.clock()): { accepted: boolean; reason?: string; result?: unknown } {
    const parsed = IntentSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: "INVALID_INTENT" };
    const intent = parsed.data;
    if (intent.roomId !== this.id) return { accepted: false, reason: "WRONG_ROOM" };
    // Deadlines first: anything due at or before `now` is processed (as of
    // its own deadline instant) before this action is considered, so an
    // action that arrives after a deadline can never slip into that phase.
    // A replayed intent still returns its original result below.
    this.tick(now);
    const key = dedupeKey(intent.roomId, actorId, intent.clientEventId);
    const seen = this.seenIntents.get(key);
    // A replay must return the ORIGINAL response, byte for byte — not a
    // re-wrapped copy. (Milestone K: the old code returned
    // { accepted: seen.accepted, result: seen.result }, which nested the
    // original inside `result`, so a replayed rejection carried no
    // top-level `reason` and the client showed "unknown".) The stored
    // `result` IS the original return value, so return it directly.
    // The cast is safe: this function is the only writer of
    // seenIntents, and it always stores the typed `result` below.
    if (seen) return seen.result as { accepted: boolean; reason?: string; result?: unknown };

    let result: { accepted: boolean; reason?: string; result?: unknown };
    // Phased games: an action says which phase it was made in. If that phase
    // has already closed (its deadline passed while the action was in
    // flight), the action is refused instead of landing in the NEXT
    // question/round, where it was never meant to go. Older clients that send
    // no phaseKey keep the previous behaviour.
    const stalePhase = this.stalePhase(intent);
    if (stalePhase) {
      result = { accepted: false, reason: "PHASE_CLOSED" };
    } else if (intent.action === "math-open") {
      result = this.openMathQuestion(intent, actorId, now);
    } else if (intent.action === "submit-math-answer") {
      result = this.submitMathAnswer(intent, actorId, now);
    } else if (intent.action === "abstain") {
      result = this.submitAbstain(intent, actorId, now);
    } else if (
      intent.action === "impostor-clue" ||
      intent.action === "impostor-vote" ||
      intent.action === "impostor-guess" ||
      intent.action === "caption-submit" ||
      intent.action === "caption-vote" ||
      intent.action === "closest-guess" ||
      intent.action === "trivia-answer" ||
      intent.action === "whosaid-answer" ||
      intent.action === "geography-answer" ||
      intent.action === "year-guess" ||
      intent.action === "connections-guess" ||
      intent.action === "sprint-answers" ||
      intent.action === "charades-turn"
    ) {
      result = this.submitSocialIntent(intent, actorId, now);
    } else {
      result = { accepted: false, reason: "UNKNOWN_ACTION" };
    }
    if (result.accepted) {
      const game = [...this.games.values()].find((g) => g.id === intent.gameInstanceId);
      if (game) {
        game.submittedPlayers ??= [];
        // Opening a Math question reveals it; it is not playing. Only real
        // actions count toward "have played so far".
        if (intent.action !== "math-open" && !game.submittedPlayers.includes(actorId)) game.submittedPlayers.push(actorId);
        // A phase that ended early (everyone acted) starts the next phase's clock now.
        if (game.status === "playing") this.syncPhase(game, now);
      }
    }
    this.seenIntents.set(key, { accepted: result.accepted, result });
    return result;
  }

  private submitSocialIntent(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now = this.clock()) {
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing") return { accepted: false, reason: "PHASE_CLOSED" };
    // Late submissions after the game deadline are rejected, not silently
    // accepted into a game that should already have closed or been skipped.
    if (game.deadlineAt && now > game.deadlineAt) return { accepted: false, reason: "PHASE_CLOSED" };
    if (!game.players.includes(actorId)) return { accepted: false, reason: "NOT_IN_GAME" };
    // Whole-game abstainers sat out the rest: later answers are rejected,
    // not silently scored. Phase games never set game.abstained, so this
    // only affects quiz/math/connections/sprint.
    if ((game.abstained ?? []).includes(actorId)) return { accepted: false, reason: "ALREADY_ABSTAINED" };
    try {
      if (game.gameId === "impostor") {
        const state = game.extra as ImpostorState;
        if (intent.action === "impostor-clue") {
          const clue = sanitizeText(intent.payload["clue"], 140);
          if (!clue) return { accepted: false, reason: "INVALID_PAYLOAD" };
          submitClue(state, actorId, clue);
          if (allCluesIn(state, this.activePlayers(game))) state.phase = "vote";
        } else if (intent.action === "impostor-vote") {
          submitVote(state, actorId, String(intent.payload["suspectId"] ?? ""), game.players);
          if (allVotesIn(state, this.activePlayers(game))) {
            resolveVote(state);
            if (state.phase === "finished") this.finishGame(game, impostorScores(state, game.players));
          }
        } else if (intent.action === "impostor-guess") {
          submitGuess(state, actorId, String(intent.payload["guess"] ?? ""));
          this.finishGame(game, impostorScores(state, game.players));
        }
      } else if (game.gameId === "caption-clash") {
        const state = game.extra as CaptionState;
        if (intent.action === "caption-submit") {
          const caption = sanitizeText(intent.payload["caption"], 140);
          if (!caption) return { accepted: false, reason: "INVALID_PAYLOAD" };
          submitCaption(state, actorId, caption);
          if (allCaptionsIn(state, this.activePlayers(game))) state.phase = "vote";
        } else if (intent.action === "caption-vote") {
          submitCaptionVote(state, actorId, String(intent.payload["captionId"] ?? ""), game.players);
          if (allCaptionVotesIn(state, this.activePlayers(game))) this.advanceCaptionRound(game, state);
        }
      } else if (game.gameId === "closest-wins") {
        const state = game.extra as ClosestState;
        if (intent.action === "closest-guess") {
          const value = intent.payload["value"];
          if (typeof value !== "number") return { accepted: false, reason: "INVALID_PAYLOAD" };
          submitClosestGuess(state, actorId, value);
          if (allGuessed(state, this.activePlayers(game))) {
            advanceClosest(state);
            if (state.phase === "finished") this.finishGame(game, closestTotalScores(state));
          }
        }
      } else if (game.gameId === "trivia" || game.gameId === "who-said-that" || game.gameId === "geography") {
        const state = game.extra as {
          questions: (TriviaQuestion | WhoSaidQuestion | GeographyQuestion)[];
          answers: Record<string, Record<string, number>>;
        };
        const actionMap: Record<string, string> = {
          "trivia-answer": "trivia",
          "whosaid-answer": "who-said-that",
          "geography-answer": "geography",
        };
        if (actionMap[intent.action] !== game.gameId) return { accepted: false, reason: "UNKNOWN_ACTION" };
        const qid = String(intent.payload["questionId"] ?? "");
        const chosen = intent.payload["chosenIndex"];
        if (typeof chosen !== "number") return { accepted: false, reason: "INVALID_PAYLOAD" };
        const question = state.questions.find((q) => q.id === qid);
        if (!question) return { accepted: false, reason: "UNKNOWN_QUESTION" };
        const perPlayer = (state.answers[actorId] ??= {});
        if (perPlayer[qid] !== undefined) return { accepted: false, reason: "ALREADY_ANSWERED" };
        perPlayer[qid] = chosen;
        if (this.quizAllDone(game, state)) this.finishGame(game, this.scoreQuizGame(game, state));
      } else if (game.gameId === "guess-the-year") {
        const state = game.extra as { events: YearEvent[]; guesses: Record<string, Record<string, number>> };
        if (intent.action !== "year-guess") return { accepted: false, reason: "UNKNOWN_ACTION" };
        const eid = String(intent.payload["eventId"] ?? "");
        const value = intent.payload["value"];
        if (typeof value !== "number") return { accepted: false, reason: "INVALID_PAYLOAD" };
        const event = state.events.find((e) => e.id === eid);
        if (!event) return { accepted: false, reason: "UNKNOWN_EVENT" };
        const perPlayer = (state.guesses[actorId] ??= {});
        if (perPlayer[eid] !== undefined) return { accepted: false, reason: "ALREADY_ANSWERED" };
        perPlayer[eid] = value;
        if (this.yearAllDone(game, state)) this.finishGame(game, this.scoreYearGame(game, state));
      } else if (game.gameId === "word-connections") {
        const state = game.extra as { playerStates: Record<string, ConnectionsPlayerState> };
        if (intent.action !== "connections-guess") return { accepted: false, reason: "UNKNOWN_ACTION" };
        const tileIds = intent.payload["tileIds"];
        if (!Array.isArray(tileIds) || !tileIds.every((t) => typeof t === "string")) return { accepted: false, reason: "INVALID_PAYLOAD" };
        const ps = state.playerStates[actorId]!;
        guessConnections(this.boardOf(game), ps, tileIds as string[]);
        const allDone = this.activePlayers(game).every((pid) => {
          const s = state.playerStates[pid]!;
          return s.solved.length >= 4 || s.mistakes >= 4 || (game.abstained ?? []).includes(pid);
        });
        if (allDone) {
          const scores: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, connectionsScore(state.playerStates[p]!)]));
          this.finishGame(game, scores);
        }
      } else if (game.gameId === "category-sprint") {
        const state = game.extra as { roundIndex: number; submissions: Record<number, Record<string, string[]>> };
        if (intent.action !== "sprint-answers") return { accepted: false, reason: "UNKNOWN_ACTION" };
        const answers = intent.payload["answers"];
        if (!Array.isArray(answers) || !answers.every((a) => typeof a === "string")) return { accepted: false, reason: "INVALID_PAYLOAD" };
        const roundSubs = (state.submissions[state.roundIndex] ??= {});
        if (roundSubs[actorId] !== undefined) return { accepted: false, reason: "ALREADY_SUBMITTED" };
        roundSubs[actorId] = answers as string[];
        const allDoneRound = this.activePlayers(game).every((pid) => roundSubs[pid] !== undefined || (game.abstained ?? []).includes(pid));
        if (allDoneRound) this.advanceSprintRound(game, state);
      } else if (game.gameId === "charades") {
        const state = game.extra as CharadesState;
        if (intent.action !== "charades-turn") return { accepted: false, reason: "UNKNOWN_ACTION" };
        const outcome = intent.payload["outcome"];
        if (outcome !== "correct" && outcome !== "pass") return { accepted: false, reason: "INVALID_PAYLOAD" };
        charadesTurn(state, actorId, outcome);
        if (state.phase === "finished") this.finishGame(game, charadesPlayerScores(state));
      } else {
        return { accepted: false, reason: "UNKNOWN_ACTION" };
      }
    } catch (err) {
      return { accepted: false, reason: err instanceof Error ? err.message : "INVALID_ACTION" };
    }
    return { accepted: true, result: { gameStatus: game.status } };
  }

  /** Caption vote threshold reached: last round finishes, otherwise next round. Shared by votes and vote abstentions. */
  private advanceCaptionRound(game: GameInstance, state: CaptionState): void {
    if (state.roundIndex + 1 >= state.rounds.length) {
      state.phase = "finished";
      this.finishGame(game, captionTotalScores(state));
    } else {
      state.roundIndex += 1;
      state.phase = "caption";
    }
  }

  /** Sprint round threshold reached: last round finishes with totals, otherwise next round. Shared by submissions and abstentions. */
  private advanceSprintRound(game: GameInstance, state: { roundIndex: number; submissions: Record<number, Record<string, string[]>> }): void {
    if (state.roundIndex + 1 >= 3) {
      const total: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, 0]));
      for (let r = 0; r < 3; r++) {
        const cat = this.sprintCategory(game, r);
        const roundScores = scoreSprintRound(cat, state.submissions[r] ?? {});
        for (const pid of game.players) total[pid] = (total[pid] ?? 0) + (roundScores[pid] ?? 0);
      }
      this.finishGame(game, total);
    } else {
      state.roundIndex += 1;
    }
  }

  private quizAllDone(
    game: GameInstance,
    state: { questions: (TriviaQuestion | WhoSaidQuestion | GeographyQuestion)[]; answers: Record<string, Record<string, number>> },
  ): boolean {
    return this.activePlayers(game).every(
      (pid) => (game.abstained ?? []).includes(pid) || Object.keys(state.answers[pid] ?? {}).length >= state.questions.length,
    );
  }

  private scoreQuizGame(
    game: GameInstance,
    state: { questions: (TriviaQuestion | WhoSaidQuestion | GeographyQuestion)[]; answers: Record<string, Record<string, number>> },
  ): Record<string, number> {
    const scores: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, 0]));
    for (const pid of game.players) {
      for (const q of state.questions) {
        const chosenIdx = state.answers[pid]?.[q.id] ?? null;
        if (game.gameId === "trivia") scores[pid] = (scores[pid] ?? 0) + scoreTrivia(q as TriviaQuestion, chosenIdx, 3000);
        else if (game.gameId === "who-said-that") scores[pid] = (scores[pid] ?? 0) + scoreWhoSaid(q as WhoSaidQuestion, chosenIdx);
        else scores[pid] = (scores[pid] ?? 0) + scoreGeography(q as GeographyQuestion, chosenIdx);
      }
    }
    return scores;
  }

  private yearAllDone(game: GameInstance, state: { events: YearEvent[]; guesses: Record<string, Record<string, number>> }): boolean {
    return this.activePlayers(game).every(
      (pid) => (game.abstained ?? []).includes(pid) || Object.keys(state.guesses[pid] ?? {}).length >= state.events.length,
    );
  }

  private scoreYearGame(game: GameInstance, state: { events: YearEvent[]; guesses: Record<string, Record<string, number>> }): Record<string, number> {
    const scores: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, 0]));
    for (const pid of game.players) {
      for (const e of state.events) scores[pid] = (scores[pid] ?? 0) + scoreYear(e, state.guesses[pid]?.[e.id] ?? null);
    }
    return scores;
  }

  /**
   * Explicit abstention (decision L33). Silence is NOT abstention: a silent
   * connected player still blocks advancement until deadline/host-skip. An
   * explicit abstain counts toward the current threshold and scores 0 for
   * what was skipped — it never invents scores and never reveals who
   * abstained to other players (projections expose only the abstainer's own
   * status). Whole-game games record the player in game.abstained; phase
   * games record per-phase lists so a player can skip one phase and still
   * play later ones. Charades has no abstention: turns are actor-driven
   * and Pass already exists.
   */
  private submitAbstain(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now = this.clock()) {
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing") return { accepted: false, reason: "PHASE_CLOSED" };
    if (game.deadlineAt && now > game.deadlineAt) return { accepted: false, reason: "PHASE_CLOSED" };
    if (!game.players.includes(actorId)) return { accepted: false, reason: "NOT_IN_GAME" };
    try {
      if (game.gameId === "impostor") {
        const state = game.extra as ImpostorState;
        // Branch on a snapshot: resolveVote mutates state.phase, and a
        // direct state.phase check here would be narrowed by TS to "vote".
        const phase = state.phase;
        if (phase === "clue") {
          abstainClue(state, actorId);
          if (allCluesIn(state, this.activePlayers(game))) state.phase = "vote";
        } else if (phase === "vote") {
          abstainVote(state, actorId);
          if (allVotesIn(state, this.activePlayers(game))) {
            resolveVote(state);
            if (state.phase === "finished") this.finishGame(game, impostorScores(state, game.players));
          }
        } else if (phase === "guess") {
          // Only the convicted impostor has anything to abstain from here;
          // abstaining forfeits the guess, so the honest side wins.
          if (actorId !== state.impostorId) throw new Error("NOT_IMPOSTOR");
          state.guessCorrect = false;
          state.phase = "finished";
          state.winner = "honest";
          this.finishGame(game, impostorScores(state, game.players));
        } else {
          throw new Error("PHASE_CLOSED");
        }
      } else if (game.gameId === "caption-clash") {
        const state = game.extra as CaptionState;
        if (state.phase === "caption") {
          abstainCaption(state, actorId);
          if (allCaptionsIn(state, this.activePlayers(game))) state.phase = "vote";
        } else if (state.phase === "vote") {
          abstainCaptionVote(state, actorId);
          if (allCaptionVotesIn(state, this.activePlayers(game))) this.advanceCaptionRound(game, state);
        } else {
          throw new Error("PHASE_CLOSED");
        }
      } else if (game.gameId === "closest-wins") {
        const state = game.extra as ClosestState;
        abstainClosest(state, actorId);
        if (allGuessed(state, this.activePlayers(game))) {
          advanceClosest(state);
          if (state.phase === "finished") this.finishGame(game, closestTotalScores(state));
        }
      } else if (game.gameId === "charades") {
        throw new Error("NOT_APPLICABLE");
      } else if (
        game.gameId === "trivia" ||
        game.gameId === "who-said-that" ||
        game.gameId === "geography" ||
        game.gameId === "guess-the-year" ||
        game.gameId === "word-connections" ||
        game.gameId === "category-sprint" ||
        game.gameId === "math-mayhem"
      ) {
        game.abstained ??= [];
        if (game.abstained.includes(actorId)) throw new Error("ALREADY_ABSTAINED");
        game.abstained.push(actorId);
        this.settleAfterAbstain(game);
      } else {
        return { accepted: false, reason: "UNKNOWN_ACTION" };
      }
    } catch (err) {
      return { accepted: false, reason: err instanceof Error ? err.message : "INVALID_ACTION" };
    }
    this.log("player-abstained", { playerId: actorId, gameInstanceId: game.id });
    return { accepted: true, result: { gameStatus: game.status } };
  }

  /**
   * After a whole-game abstention, a game whose other players already did
   * everything must settle immediately instead of waiting for another
   * submission that will never come (e.g. the last answerer finished before
   * the abstainer sat out). Scores are computed from existing answers only;
   * unanswered items score 0 by the existing null defaults.
   */
  private settleAfterAbstain(game: GameInstance): void {
    if (game.gameId === "trivia" || game.gameId === "who-said-that" || game.gameId === "geography") {
      const state = game.extra as { questions: (TriviaQuestion | WhoSaidQuestion | GeographyQuestion)[]; answers: Record<string, Record<string, number>> };
      if (this.quizAllDone(game, state)) this.finishGame(game, this.scoreQuizGame(game, state));
    } else if (game.gameId === "guess-the-year") {
      const state = game.extra as { events: YearEvent[]; guesses: Record<string, Record<string, number>> };
      if (this.yearAllDone(game, state)) this.finishGame(game, this.scoreYearGame(game, state));
    } else if (game.gameId === "word-connections") {
      const state = game.extra as { playerStates: Record<string, ConnectionsPlayerState> };
      const allDone = this.activePlayers(game).every((pid) => {
        const s = state.playerStates[pid]!;
        return s.solved.length >= 4 || s.mistakes >= 4 || (game.abstained ?? []).includes(pid);
      });
      if (allDone) {
        const scores: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, connectionsScore(state.playerStates[p]!)]));
        this.finishGame(game, scores);
      }
    } else if (game.gameId === "category-sprint") {
      const state = game.extra as { roundIndex: number; submissions: Record<number, Record<string, string[]>> };
      const roundSubs = state.submissions[state.roundIndex] ?? {};
      const allDoneRound = this.activePlayers(game).every((pid) => roundSubs[pid] !== undefined || (game.abstained ?? []).includes(pid));
      if (allDoneRound) this.advanceSprintRound(game, state);
    } else if (game.gameId === "math-mayhem") {
      const allDone = this.activePlayers(game).every(
        (pid) => (game.abstained ?? []).includes(pid) || Object.keys(game.answers[pid] ?? {}).length >= (game.questions?.length ?? 0),
      );
      // Math scores accrue live per answer; abstainers simply add nothing more.
      if (allDone) this.finalize(game, "completed");
    }
  }

  /** A game reached its natural end through play (every phase ran, or everyone finished). */
  private finishGame(game: GameInstance, scores: Record<string, number>): void {
    this.finalize(game, "completed", scores);
  }

  // ------------------------------------------------------------ lifecycle
  // Sprint 3 (src/server/lifecycle.ts). Server time only; persisted in the
  // game record; processed lazily by tick(), which LocalServer calls before
  // every action and read and from one server-wide sweep, so a deadline is
  // handled even when nobody acts, and identically after a restart.

  /** While tick() processes a deadline, "now" is that deadline instant. */
  private eventTime: number | null = null;
  private at(): number {
    return this.eventTime ?? this.clock();
  }

  /** The phase a phased game is in, derived from its own state (e.g. "q:3", "1:vote"). */
  private phaseOf(game: GameInstance): { key: string; kind: "question" | "write" | "vote" | "round" | "clue" | "guess" | "turn" } | null {
    switch (game.gameId) {
      case "closest-wins": return { key: `q:${(game.extra as ClosestState).questionIndex}`, kind: "question" };
      case "caption-clash": {
        const st = game.extra as CaptionState;
        return { key: `${st.roundIndex}:${st.phase}`, kind: st.phase === "vote" ? "vote" : "write" };
      }
      case "category-sprint": return { key: `r:${(game.extra as { roundIndex: number }).roundIndex}`, kind: "round" };
      case "impostor": {
        const ph = (game.extra as ImpostorState).phase;
        return { key: ph, kind: ph === "vote" ? "vote" : ph === "guess" ? "guess" : "clue" };
      }
      case "charades": return { key: `turn:${(game.extra as CharadesState).turnIndex}`, kind: "turn" };
      default: return null;
    }
  }

  /** Record (once) that a legacy client saw every Math prompt; tell it to refresh. */
  private markPromptsExposed(g: GameInstance, actorId: string): { refreshNeeded: true } {
    g.promptsExposed ??= [];
    if (!g.promptsExposed.includes(actorId)) {
      g.promptsExposed.push(actorId);
      this.dirty = true;
      this.log("math-untimed-client", { gameInstanceId: g.id, playerId: actorId });
    }
    return { refreshNeeded: true };
  }

  private stalePhase(intent: ReturnType<typeof IntentSchema.parse>): boolean {
    const sent = intent.payload["phaseKey"];
    if (typeof sent !== "string") return false;
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing" || game.phaseKey === undefined) return false;
    return sent !== game.phaseKey;
  }

  /** If the game moved to a new phase, start that phase's clock at `at`. */
  private syncPhase(game: GameInstance, at: number): void {
    if (game.status !== "playing" || game.lifecycleVersion === undefined) return;
    const ph = this.phaseOf(game);
    if (!ph || ph.key === game.phaseKey) return;
    const base = policyFor(game.gameId).phaseMs?.[ph.kind];
    if (base === undefined) return;
    const ms = Math.round(base * this.lifecycleScale);
    game.phaseKey = ph.key;
    game.phaseDeadlineAt = at + ms;
  }

  /**
   * Process every deadline that has passed by `now`, in time order, each as
   * of its own deadline instant. Returns true if anything changed (the
   * caller saves and broadcasts). Idempotent: running it twice, or from two
   * requests, does nothing the second time.
   */
  tick(now = this.clock()): boolean {
    let changed = false;
    for (const game of this.games.values()) {
      for (let guard = 0; guard < 100 && game.status === "playing"; guard++) {
        const phaseDue = game.phaseDeadlineAt !== undefined && now > game.phaseDeadlineAt ? game.phaseDeadlineAt : Infinity;
        const gameDue = game.deadlineAt !== undefined && now > game.deadlineAt ? game.deadlineAt : Infinity;
        const next = Math.min(phaseDue, gameDue);
        if (next === Infinity) break;
        this.eventTime = next;
        try {
          if (next === phaseDue && phaseDue <= gameDue) this.expirePhase(game, next);
          else this.expireGame(game);
        } finally {
          this.eventTime = null;
        }
        changed = true;
      }
    }
    return changed;
  }

  /** A phase's time ran out: close it with the input received, never inventing any. */
  private expirePhase(game: GameInstance, at: number): void {
    const before = game.phaseKey;
    try {
      switch (game.gameId) {
        case "closest-wins": {
          const st = game.extra as ClosestState;
          advanceClosest(st); // missing guesses simply score nothing for this question
          if (st.phase === "finished") this.finishGame(game, closestTotalScores(st));
          break;
        }
        case "caption-clash": {
          const st = game.extra as CaptionState;
          if (st.phase === "caption") {
            // Nobody wrote a caption: there is nothing to vote on; the round ends empty.
            if (Object.keys(currentRound(st).captions).length === 0) this.advanceCaptionRound(game, st);
            else st.phase = "vote";
          } else if (st.phase === "vote") {
            this.advanceCaptionRound(game, st); // votes received count; late votes cannot arrive
          }
          break;
        }
        case "category-sprint":
          this.advanceSprintRound(game, game.extra as { roundIndex: number; submissions: Record<number, Record<string, string[]>> });
          break;
        case "impostor": {
          const st = game.extra as ImpostorState;
          if (st.phase === "clue") st.phase = "vote";
          else if (st.phase === "vote") {
            resolveVote(st); // existing rule: no votes convicts nobody, so the impostor wins
            if ((st.phase as ImpostorState["phase"]) === "finished") this.finishGame(game, impostorScores(st, game.players));
          } else if (st.phase === "guess") {
            // The convicted impostor didn't guess in time: same as forfeiting (L33).
            st.guessCorrect = false;
            st.phase = "finished";
            st.winner = "honest";
            this.finishGame(game, impostorScores(st, game.players));
          }
          break;
        }
        case "charades": {
          // The actor's time is up (or the actor is absent): the turn ends with
          // no point and play moves on, so an absent actor can't stall the game.
          const st = game.extra as CharadesState;
          st.promptIndex = (st.promptIndex ?? st.turnIndex) + 1;
          st.turnIndex += 1;
          st.passesThisTurn = 0;
          if (st.turnIndex >= st.teams[0]!.length + st.teams[1]!.length) {
            st.phase = "finished";
            this.finishGame(game, charadesPlayerScores(st));
          }
          break;
        }
        default:
          game.phaseDeadlineAt = undefined;
          return;
      }
    } catch (err) {
      this.voidGame(game, at, `phase deadline could not be processed: ${(err as Error).message}`);
      return;
    }
    if (game.status === "playing") {
      this.syncPhase(game, at);
      // Defensive: a phase that did not change would otherwise expire forever.
      if (game.phaseKey === before) game.phaseDeadlineAt = undefined;
    }
    this.log("phase-closed", { gameInstanceId: game.id, detail: { phase: before, at } });
  }

  /** The game deadline (independent games) or backstop (phased) arrived. */
  private expireGame(game: GameInstance): void {
    const policy = policyFor(game.gameId);
    if (policy.model === "game-deadline") {
      this.finalize(game, "deadline");
      return;
    }
    // Phased game at its backstop: only fully completed rounds/questions are
    // scored; an unfinished round gets no fabricated score; it counts as practice.
    this.finalize(game, "backstop-partial", this.completedUnitScores(game));
  }

  /** Phased games at the backstop: totals from completed questions/rounds only. */
  private completedUnitScores(game: GameInstance): Record<string, number> {
    const totals: Record<string, number> = {};
    const add = (s: Record<string, number>) => { for (const [k, v] of Object.entries(s)) totals[k] = (totals[k] ?? 0) + v; };
    if (game.gameId === "closest-wins") {
      const st = game.extra as ClosestState;
      for (const q of st.questions.slice(0, st.questionIndex)) add(closestQuestionScores(q, st.guesses[q.id] ?? {}));
    } else if (game.gameId === "caption-clash") {
      const st = game.extra as CaptionState;
      for (const r of st.rounds.slice(0, st.roundIndex)) add(captionRoundScores(r));
    } else if (game.gameId === "category-sprint") {
      const st = game.extra as { roundIndex: number; submissions: Record<number, Record<string, string[]>> };
      for (let r = 0; r < st.roundIndex; r++) add(scoreSprintRound(this.sprintCategory(game, r), st.submissions[r] ?? {}));
    }
    // Impostor/Charades: no partial result exists (and they are practice-only).
    return totals;
  }

  /** Per-player participation, as public counts (never who chose to abstain). */
  private participationOf(game: GameInstance, reason: EndReason): { participation: Record<string, Participation>; completedUnits?: number; totalUnits?: number } {
    const out: Record<string, Participation> = {};
    const each = (fn: (pid: string) => Participation) => { for (const pid of game.players) out[pid] = fn(pid); };
    switch (game.gameId) {
      case "trivia":
      case "who-said-that":
      case "geography": {
        const st = game.extra as { questions: unknown[]; answers: Record<string, Record<string, number>> };
        // Every answer is an action, right or wrong.
        each((pid) => { const n = Object.keys(st.answers[pid] ?? {}).length; return { done: n, of: st.questions.length, actions: n }; });
        break;
      }
      case "guess-the-year": {
        const st = game.extra as { events: unknown[]; guesses: Record<string, Record<string, number>> };
        each((pid) => { const n = Object.keys(st.guesses[pid] ?? {}).length; return { done: n, of: st.events.length, actions: n }; });
        break;
      }
      case "math-mayhem":
        // Answers only: opening a question is not an action.
        each((pid) => { const n = Object.keys(game.answers[pid] ?? {}).length; return { done: n, of: game.questions?.length ?? 0, actions: n }; });
        break;
      case "word-connections": {
        // The opportunity is the puzzle: `finished` only when the PLAYER ended
        // it (four groups, or the allowed mistakes used up) — never because the
        // game's deadline arrived. Every group guess, right or wrong, is an action.
        const st = game.extra as { playerStates: Record<string, ConnectionsPlayerState> };
        each((pid) => {
          const ps = st.playerStates[pid];
          return { done: ps?.solved.length ?? 0, of: 4, finished: !!ps && (ps.solved.length >= 4 || ps.mistakes >= 4), actions: ps?.guessed.length ?? 0 };
        });
        break;
      }
      case "closest-wins": {
        const st = game.extra as ClosestState;
        const reached = st.phase === "finished" ? st.questions.length : st.questionIndex;
        each((pid) => { const n = st.questions.slice(0, reached).filter((q) => (st.guesses[q.id] ?? {})[pid] !== undefined).length; return { done: n, of: st.questions.length, actions: n }; });
        return { participation: out, completedUnits: reached, totalUnits: st.questions.length };
      }
      case "caption-clash": {
        const st = game.extra as CaptionState;
        const reached = st.phase === "finished" ? st.rounds.length : st.roundIndex;
        // Writing a caption is the player's scoring action (votes score others).
        each((pid) => { const n = st.rounds.slice(0, reached).filter((r) => r.captions[pid] !== undefined).length; return { done: n, of: st.rounds.length, actions: n }; });
        return { participation: out, completedUnits: reached, totalUnits: st.rounds.length };
      }
      case "category-sprint": {
        const st = game.extra as { roundIndex: number; submissions: Record<number, Record<string, string[]>> };
        const total = 3;
        // A completed sprint ends inside its last round without moving roundIndex on.
        const reached = reason === "completed" ? total : st.roundIndex;
        // An empty submission is not playing the round.
        const real = (r: number, pid: string) => ((st.submissions[r] ?? {})[pid] ?? []).some((a) => a.trim().length > 0);
        each((pid) => { const n = Array.from({ length: total }, (_, r) => r).filter((r) => r < reached && real(r, pid)).length; return { done: n, of: total, actions: n }; });
        return { participation: out, completedUnits: reached, totalUnits: total };
      }
      default:
        each(() => ({ done: 0, of: 0 }));
    }
    return { participation: out };
  }

  /**
   * The ONE way a game ends. Exactly once: the status guard means a second
   * caller (a racing deadline, a host action, a final answer) does nothing.
   * Writes scores, the outcome (reason, counts-or-not, participation) and
   * the ledger events in one step; the caller saves the room atomically.
   */
  private finalize(game: GameInstance, reason: EndReason, scores?: Record<string, number>): void {
    if (game.status !== "playing") return;
    const at = this.at();
    const policy = policyFor(game.gameId);
    let finalScores: Record<string, number>;
    let part: ReturnType<RoomEngine["participationOf"]>;
    let nobodyPlayed: boolean;
    try {
      if (scores !== undefined) finalScores = scores;
      else if (game.gameId === "math-mayhem") finalScores = { ...game.rawScores }; // already scored live, per answer
      else finalScores = this.scoresAtEnd(game);
      if (Object.values(finalScores).some((v) => typeof v !== "number" || !Number.isFinite(v))) throw new Error("non-numeric score");
      part = this.participationOf(game, reason);
      nobodyPlayed = !this.anyoneParticipated(game, part.participation);
    } catch (err) {
      // Nothing has been written yet: the game is voided, never half-finished.
      this.voidGame(game, at, `scores could not be calculated: ${(err as Error).message}`);
      return;
    }
    // Every roster player has an entry (0 if they never scored).
    game.rawScores = { ...Object.fromEntries(game.players.map((p) => [p, 0])), ...finalScores };
    game.status = "finished";
    game.phaseDeadlineAt = undefined;
    const countsOfficially = game.official && policy.officialEligible && reason !== "backstop-partial"
      && !(nobodyPlayed && !COUNT_GAMES_WITH_NO_PARTICIPATION);
    game.outcome = {
      reason,
      endedAt: at,
      countsOfficially,
      ...(reason === "backstop-partial" ? { note: "The game hit its time limit in the middle of a round. Completed rounds are shown; it counts as practice." } : {}),
      ...(game.official && !policy.officialEligible ? { note: policy.practiceOnlyReason } : {}),
      ...(game.official && policy.officialEligible && nobodyPlayed && !COUNT_GAMES_WITH_NO_PARTICIPATION
        ? { note: "Nobody answered before time ran out, so there is no result to count." } : {}),
      ...part,
    };
    if (game.gameId !== "math-mayhem") {
      for (const [pid, pts] of Object.entries(finalScores)) {
        this.log("score-awarded", { playerId: pid, gameInstanceId: game.id, points: pts, reason: `game:${game.gameId}` });
      }
    }
    this.log("game-finished", { gameInstanceId: game.id, official: game.official, detail: { reason, countsOfficially } });
  }

  /** Did any roster player take any scoring action (an answer, a guess, a caption, a vote)? */
  private anyoneParticipated(game: GameInstance, participation: Record<string, Participation>): boolean {
    if (Object.values(participation).some((p) => p.done > 0 || p.finished)) return true;
    if (game.gameId === "word-connections") {
      const st = game.extra as { playerStates: Record<string, ConnectionsPlayerState> };
      return game.players.some((p) => (st.playerStates[p]?.mistakes ?? 0) > 0);
    }
    if (game.gameId === "caption-clash") {
      const st = game.extra as CaptionState;
      return st.rounds.some((r) => Object.keys(r.votes ?? {}).length > 0);
    }
    // Impostor/Charades are practice-only; their completion is played, not answered.
    return game.gameId === "impostor" || game.gameId === "charades";
  }

  /** Scores at a deadline for independent games: valid answers only, unanswered = 0. */
  private scoresAtEnd(game: GameInstance): Record<string, number> {
    switch (game.gameId) {
      case "trivia":
      case "who-said-that":
      case "geography":
        return this.scoreQuizGame(game, game.extra as { questions: (TriviaQuestion | WhoSaidQuestion | GeographyQuestion)[]; answers: Record<string, Record<string, number>> });
      case "guess-the-year":
        return this.scoreYearGame(game, game.extra as { events: YearEvent[]; guesses: Record<string, Record<string, number>> });
      case "word-connections": {
        const st = game.extra as { playerStates: Record<string, ConnectionsPlayerState> };
        return Object.fromEntries(game.players.map((p) => [p, connectionsScore(st.playerStates[p]!)]));
      }
      default:
        // Phased games end through their phases; a legacy in-flight game of
        // one of these kinds ends with its completed units only.
        return this.completedUnitScores(game);
    }
  }

  /**
   * A technical integrity failure (P4): no result, clearly marked, audited.
   * Never used for a normal deadline and never available to players.
   */
  private voidGame(game: GameInstance, at: number, why: string): void {
    if (game.status !== "playing") return;
    game.status = "finished";
    game.phaseDeadlineAt = undefined;
    game.outcome = { reason: "void", endedAt: at, countsOfficially: false, note: "This game was voided because of a technical problem. It does not count.", participation: {} };
    this.log("game-voided", { gameInstanceId: game.id, reason: why.slice(0, 200) });
  }

  /** Public timing/eligibility facts for a game (never answers or who abstained). */
  private lifecycleInfo(g: GameInstance): Record<string, unknown> | undefined {
    if (g.lifecycleVersion === undefined) return undefined;
    let policy;
    try { policy = policyFor(g.gameId); } catch { return undefined; }
    return {
      model: policy.model,
      officialEligible: policy.officialEligible,
      practiceOnlyReason: policy.officialEligible ? undefined : policy.practiceOnlyReason,
      unit: policy.unit,
      phaseKey: g.status === "playing" ? g.phaseKey : undefined,
    };
  }

  /** Does a finished game feed official standings? Legacy games keep their old rule. */
  countsOfficially(g: GameInstance): boolean {
    if (g.status !== "finished" || !g.official || g.timedOut) return false;
    return g.outcome ? g.outcome.countsOfficially : true;
  }

  /**
   * Authoritative championship standings: finished, OFFICIAL, non-timed-out
   * games only, midrank-normalised per game and summed. Practice games and
   * host-skipped timed-out games can never change this, whatever the UI sums.
   */
  officialStandings(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const g of this.cupGames()) {
      const all = Object.values(g.rawScores);
      if (all.length < 2) continue;
      for (const [pid, pts] of Object.entries(g.rawScores)) {
        out[pid] = Math.round(((out[pid] ?? 0) + midrankScore(pts, all)) * 100) / 100;
      }
    }
    return out;
  }

  /**
   * Advance the championship day (host/cohost only).
   * Day-close semantics: a day is closed by advancing, not by the clock.
   * Games started after the advance count toward the new day; finished
   * games keep the day they were started on. Advancing is refused while a
   * game is playing (finish it or host-skip it first) and refused past the
   * seventh scheduled day — the championship has exactly seven days.
   */
  advanceDay(actorId: string): number {
    if (this.hostId !== actorId && !this.cohosts.has(actorId)) throw new Error("Only host/cohost can advance the day");
    if ([...this.games.values()].some((g) => g.status === "playing")) throw new Error("Cannot advance the day while a game is in progress");
    if (this.championshipDay >= 7) throw new Error("Championship is already on its final day");
    this.championshipDay += 1;
    this.log("day-advanced", { actor: actorId });
    return this.championshipDay;
  }

  /**
   * Host/cohost score override, fully audited: the old value is kept in the
   * ledger event, the reason is required, and standings are derived from
   * rawScores, so the override flows into standings automatically. The UI
   * shows the audit trail from the ledger; nothing is silently rewritten.
   */
  overrideScore(actorId: string, gameInstanceId: string, playerId: string, points: number, reason: string): void {
    if (this.hostId !== actorId && !this.cohosts.has(actorId)) throw new Error("Only host/cohost can override a score");
    const game = this.games.get(gameInstanceId);
    if (!game || game.status !== "finished" || game.timedOut) throw new Error("Only a finished, non-timed-out game can be overridden");
    if (!game.players.includes(playerId)) throw new Error("Player is not in this game");
    if (!Number.isFinite(points) || points < 0 || points > 10000) throw new Error("Override points out of range");
    const cleanReason = reason.trim();
    if (!cleanReason) throw new Error("Override reason is required");
    const previous = game.rawScores[playerId] ?? 0;
    game.rawScores[playerId] = points;
    this.log("score-override", { playerId, gameInstanceId: game.id, points, previousPoints: previous, reason: cleanReason, actor: actorId });
  }

  /**
   * Full 7-day championship from finished official games only, using the
   * Family Cup rules in src/scoring/championship.ts (owner-approved
   * 2026-11-04): per-game midrank, solo/team split, daily 75/25, best
   * three days, at least three qualifying days, participation bonus,
   * finale bonus. Practice and timed-out games never enter this calculation.
   */
  championshipResults() {
    if (this.cupError) return []; // paused: never computed under a guessed rule
    return computeChampionship(this.playerDays(), { config: formatInfo(this._cup.format).config });
  }

  /** Finished games that feed this room's Cup, under its format. */
  private cupGames(): GameInstance[] {
    if (this.cupError) return [];
    const teamGamesCount = formatInfo(this._cup.format).teamGamesCount;
    return [...this.games.values()].filter((g) => this.countsOfficially(g) && (teamGamesCount || !getGame(g.gameId).modes.includes("team")));
  }

  /**
   * Per player per day: normalised placement scores (0-100 midrank) of the
   * Cup's games, split solo/team, for days that qualify under the active
   * qualification policy. Shared by the championship and the ceremony.
   */
  private playerDays(onlyDay?: number): PlayerDay[] {
    // Only completed games that count officially reach here (cupGames):
    // void, practice and excluded games can never qualify a day.
    const days = new Map<string, PlayerDay & { games: number; participations: (GameParticipationRecord | null)[] }>();
    for (const g of this.cupGames()) {
      const day = g.day ?? 1;
      if (onlyDay !== undefined && day !== onlyDay) continue;
      const all = Object.values(g.rawScores);
      if (all.length < 2) continue;
      const isTeam = getGame(g.gameId).modes.includes("team");
      for (const [pid, pts] of Object.entries(g.rawScores)) {
        const key = `${pid}:${day}`;
        const entry = days.get(key) ?? { playerId: pid, day, soloScores: [], teamScores: [], games: 0, participations: [] };
        const score = midrankScore(pts, all);
        if (isTeam) entry.teamScores.push(score); else entry.soloScores.push(score);
        entry.games += 1;
        entry.participations.push(g.outcome?.participation[pid] ?? null);
        days.set(key, entry);
      }
    }
    return [...days.values()]
      .filter((d) => qualifies(this._cup.qualificationPolicy, { gamesOnRoster: d.games, participations: d.participations }))
      .map(({ playerId, day, soloScores, teamScores }) => ({ playerId, day, soloScores, teamScores }));
  }

  achievements() {
    const rawScoresByGame: Record<string, Record<string, number>> = {};
    for (const g of this.games.values()) if (g.status === "finished") rawScoresByGame[g.id] = g.rawScores;
    return evaluateAchievements(this.ledger, rawScoresByGame);
  }

  /**
   * End-of-day ceremony for the CURRENT day only (review 5769441799):
   * standings are that day's 75/25 day scores from finished official
   * non-timed-out games started that day, not the multi-day championship
   * total. A player who dominates Day 2 is the Day 2 winner even if
   * someone else leads overall. No finished official game that day means
   * no winner yet (winner null), never an invented one.
   */
  ceremony() {
    if (this.cupError) return dayCeremony(this.championshipDay, []);
    const config = formatInfo(this._cup.format).config;
    const standings = this.playerDays(this.championshipDay).map((d) => ({
      playerId: d.playerId,
      displayName: this.players.get(d.playerId)?.displayName ?? d.playerId,
      base: dayScore({ soloScores: d.soloScores, teamScores: d.teamScores }, config).score,
    }));
    return dayCeremony(this.championshipDay, standings);
  }

  /**
   * Host/cohost "close a game that is past its deadline". Since Sprint 3 the
   * server closes every game at its deadline by itself (tick), with the
   * deadline rules (P3/P4): valid answers kept, unanswered = 0, the result
   * counts. So this no longer voids anything: it processes any due deadline
   * and is a no-op for a game that has already ended. Before the deadline it
   * is refused, so a host cannot cut a game short or void it (P4).
   * Returns the game's outcome reason.
   */
  skipTimedOutGame(actorId: string, gameInstanceId: string, now = this.clock()): EndReason | "legacy-timed-out" {
    if (this.hostId !== actorId && !this.cohosts.has(actorId)) throw new Error("Only host/cohost can skip a timed-out game");
    this.tick(now);
    const game = this.games.get(gameInstanceId);
    if (!game) throw new Error("Game is not playing");
    if (game.status === "finished") {
      if (game.outcome) return game.outcome.reason;
      if (game.timedOut) return "legacy-timed-out";
      throw new Error("Game is not playing");
    }
    throw new Error("Game has not timed out yet");
  }

  private submitMathAnswer(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now: number) {
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing") return { accepted: false, reason: "PHASE_CLOSED" };
    if (!game.players.includes(actorId)) return { accepted: false, reason: "NOT_IN_GAME" };
    if ((game.abstained ?? []).includes(actorId)) return { accepted: false, reason: "ALREADY_ABSTAINED" };
    const questionId = intent.payload["questionId"];
    const chosenIndex = intent.payload["chosenIndex"];
    if (typeof questionId !== "string" || typeof chosenIndex !== "number") return { accepted: false, reason: "INVALID_PAYLOAD" };
    const question = game.questions?.find((q) => q.id === questionId);
    if (!question) return { accepted: false, reason: "UNKNOWN_QUESTION" };
    const startedAt = game.startedAt ?? now;
    const elapsedMs = Math.max(0, now - startedAt);
    // Speed is measured per question from when the server revealed it to
    // this player (P10). A Sprint 3 game answered without opening the
    // question (an old client) scores correctness only: no proof of speed,
    // no speed bonus. Games from before Sprint 3 keep game-start timing.
    const opened = game.openedAt?.[actorId]?.[questionId];
    const exposed = (game.promptsExposed ?? []).includes(actorId);
    const speedMs = game.openedAt === undefined ? elapsedMs : opened === undefined || exposed ? Number.POSITIVE_INFINITY : Math.max(0, now - opened);
    // One deadline governs every game: deadlineAt when present (the same
    // check social intents use), falling back to the 5-minute window from
    // startedAt only for legacy games that predate deadlineAt. Previously
    // Math checked only the elapsed window, so a past deadlineAt with a
    // recent startedAt did not stop Math answers.
    if (game.deadlineAt ? now > game.deadlineAt : elapsedMs > 5 * 60 * 1000) return { accepted: false, reason: "PHASE_CLOSED" };
    const playerAnswers = (game.answers[actorId] ??= {});
    if (playerAnswers[questionId] !== undefined) return { accepted: false, reason: "ALREADY_ANSWERED" };
    playerAnswers[questionId] = chosenIndex;
    const playerTimes = (game.answerTimes[actorId] ??= {});
    playerTimes[questionId] = Number.isFinite(speedMs) ? speedMs : elapsedMs;
    const points = scoreMathAnswer(question, chosenIndex, speedMs);
    game.rawScores[actorId] = (game.rawScores[actorId] ?? 0) + points;
    this.log("score-awarded", { playerId: actorId, gameInstanceId: game.id, points, reason: `math:${questionId}` });
    // Finish when every player answered every question (or sat out the rest)
    const allDone = this.activePlayers(game).every((pid) => (game.abstained ?? []).includes(pid) || Object.keys(game.answers[pid] ?? {}).length >= (game.questions?.length ?? 0));
    // Math scores accrue live per answer, so finalizing adds no score events.
    if (allDone) this.finalize(game, "completed");
    return {
      accepted: true,
      result: {
        points,
        total: game.rawScores[actorId],
        ...(Number.isFinite(speedMs) && game.openedAt ? { answeredInMs: speedMs } : {}),
        // Approved rule: no recorded opening, no speed bonus — and say why, so an outdated app is told to refresh.
        ...(game.openedAt && !Number.isFinite(speedMs) ? { speedBonus: "not-timed", refreshAdvice: "This question wasn’t timed, so no speed bonus. Refresh the page to get the latest version of the game." } : {}),
      },
    };
  }

  /**
   * Reveal a Math question to one player and start its speed clock (P10).
   * Idempotent: opening again keeps the first reveal time. Server time
   * only; what is measured is "revealed by the server" to "answer received
   * by the server", so network delay in both directions counts against the
   * player (documented in docs/DECISIONS.md D-S3-09).
   */
  private openMathQuestion(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now: number) {
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing" || game.gameId !== "math-mayhem") return { accepted: false, reason: "PHASE_CLOSED" };
    if (!game.players.includes(actorId)) return { accepted: false, reason: "NOT_IN_GAME" };
    if ((game.abstained ?? []).includes(actorId)) return { accepted: false, reason: "ALREADY_ABSTAINED" };
    if (game.deadlineAt && now > game.deadlineAt) return { accepted: false, reason: "PHASE_CLOSED" };
    const questionId = intent.payload["questionId"];
    const question = typeof questionId === "string" ? game.questions?.find((q) => q.id === questionId) : undefined;
    if (!question) return { accepted: false, reason: "UNKNOWN_QUESTION" };
    if (game.answers[actorId]?.[question.id] !== undefined) return { accepted: false, reason: "ALREADY_ANSWERED" };
    game.openedAt ??= {};
    const mine = (game.openedAt[actorId] ??= {});
    mine[question.id] ??= now;
    return { accepted: true, result: { questionId: question.id, prompt: question.prompt, options: question.options, openedAt: mine[question.id] } };
  }

  /**
   * Post-finish aggregate for trivia: per-question counts per option index.
   * Identities are never included — a count of 3 on option B says nothing
   * about which three players chose it. Only ever called for finished games.
   */
  private quizAnswerCounts(game: GameInstance): Record<string, number[]> {
    const extra = game.extra as { questions: Record<string, unknown>[]; answers: Record<string, Record<string, number>> };
    const out: Record<string, number[]> = {};
    for (const q of extra.questions ?? []) {
      const options = (q["options"] as unknown[] | undefined) ?? [];
      const counts = options.map(() => 0);
      for (const pid of Object.keys(extra.answers ?? {})) {
        const idx = (extra.answers[pid] ?? {})[String(q["id"])];
        if (typeof idx === "number" && idx >= 0 && idx < counts.length) counts[idx]! += 1;
      }
      out[String(q["id"])] = counts;
    }
    return out;
  }

  /**
   * Post-finish trivia only: points a correct answer to each question is
   * worth, computed with the exact scorer call scoreQuizGame uses
   * (scoreTrivia with the fixed 3000ms reference). These are per-question
   * values, not per-player scores — the client multiplies by correctness.
   * Never sent while playing: the values alone would not leak the key, but
   * they are meaningless before the reveal and ride with answerCounts.
   */
  private quizQuestionPoints(game: GameInstance): Record<string, number> {
    const extra = game.extra as { questions: TriviaQuestion[] };
    const out: Record<string, number> = {};
    for (const q of extra.questions ?? []) {
      out[q.id] = scoreTrivia(q, q.correctIndex, 3000);
    }
    return out;
  }

  /**
   * A game's state as anyone may see it: the TV, spectators, and players
   * who are not in that game (late joiners). Never contains a hidden role,
   * secret word, actor prompt, answer key before finish, or anyone's own
   * private answers.
   */
  private publicGameState(g: GameInstance): unknown {
    switch (g.gameId) {
      case "impostor": return projectImpostor(g.extra as ImpostorState, "", true);
      case "caption-clash": return projectCaption(g.extra as CaptionState, "", true);
      case "closest-wins": return projectClosest(g.extra as ClosestState, "", true);
      case "charades": return projectCharades(g.extra as CharadesState, "", true);
      case "trivia":
      case "who-said-that":
      case "geography":
        return { questions: this.quizQuestionsView(g) };
      case "guess-the-year":
        return { events: ((g.extra as { events: YearEvent[] }).events ?? []).map((e) => ({ id: e.id, event: e.event })) };
      case "word-connections":
        return this.connectionsView(g);
      case "category-sprint":
        return this.sprintView(g);
      default:
        return undefined;
    }
  }

  /**
   * A game's state for one of its own players: the public state plus that
   * player's private view (their role/word, their own answers). Only ever
   * called for a player listed in g.players.
   */
  private participantGameState(g: GameInstance, actorId: string): unknown {
    switch (g.gameId) {
      case "impostor": return projectImpostor(g.extra as ImpostorState, actorId, false);
      case "caption-clash": return projectCaption(g.extra as CaptionState, actorId, false);
      case "closest-wins": return projectClosest(g.extra as ClosestState, actorId, false);
      case "charades": return projectCharades(g.extra as CharadesState, actorId, false);
      case "trivia":
      case "who-said-that":
      case "geography":
        return { questions: this.quizQuestionsView(g), myAnswers: (g.extra as { answers: Record<string, Record<string, number>> }).answers[actorId] ?? {} };
      case "guess-the-year":
        return {
          events: ((g.extra as { events: YearEvent[] }).events ?? []).map((e) => ({ id: e.id, event: e.event })),
          myGuesses: (g.extra as { guesses: Record<string, Record<string, number>> }).guesses[actorId] ?? {},
        };
      case "word-connections":
        return this.connectionsView(g, actorId);
      case "category-sprint":
        return this.sprintView(g);
      default:
        return undefined;
    }
  }

  /** Quiz questions: prompt + options; the correct index only after a Trivia game finishes. */
  private quizQuestionsView(g: GameInstance): Record<string, unknown>[] {
    return ((g.extra as { questions: Record<string, unknown>[] }).questions ?? []).map((q) => ({
      id: q["id"],
      prompt: q["prompt"] ?? q["quote"],
      // Who Said That stores its options as `speakers` (the option list, not a secret).
      options: q["options"] ?? q["speakers"],
      // Post-finish only, trivia only: the correct answer is public once
      // the game is finished (scores already are). Never while playing.
      ...(g.status === "finished" && g.gameId === "trivia" ? { correctIndex: q["correctIndex"] } : {}),
    }));
  }

  private sprintView(g: GameInstance): Record<string, unknown> {
    const roundIndex = (g.extra as { roundIndex: number }).roundIndex;
    return { roundIndex, category: this.sprintCategory(g, roundIndex)?.name };
  }

  /**
   * Word Connections view (Sprint 4). A player sees their OWN solved groups
   * (name, colour level, tiles) and feedback on their own last guess. The
   * full board (every group) is revealed only when the whole game has
   * ended, so a player who finishes early can't relay answers. Public
   * views add only how many players have finished.
   */
  private connectionsView(g: GameInstance, actorId?: string): Record<string, unknown> {
    const board = this.boardOf(g);
    const st = g.extra as { playerStates: Record<string, ConnectionsPlayerState>; levels?: Record<string, number> };
    const levelOf = (name: string) => st.levels?.[name] ?? board.categories.findIndex((c) => c.name === name) + 1;
    const tilesOf = (name: string) => board.tiles.filter((t) => t.category === name).map((t) => t.id);
    const finishedPlayers = g.players.filter((p) => { const ps = st.playerStates[p]; return !!ps && (ps.solved.length >= 4 || ps.mistakes >= 4); }).length;
    const base: Record<string, unknown> = { tiles: this.connectionsTiles(g), maxMistakes: 4, finishedPlayers, totalPlayers: g.players.length };
    if (g.status === "finished") base["groups"] = board.categories.map((c) => ({ name: c.name, level: levelOf(c.name), tileIds: tilesOf(c.name) }));
    if (!actorId) return base;
    const ps = st.playerStates[actorId];
    if (!ps) return base;
    const last = ps.guessed.at(-1);
    let lastGuess: { correct: boolean; oneAway: boolean; group?: string } | undefined;
    if (last) {
      const counts = new Map<string, number>();
      for (const id of last) { const c = board.tiles.find((t) => t.id === id)?.category; if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      lastGuess = top && top[1] === 4 ? { correct: true, oneAway: false, group: top[0] } : { correct: false, oneAway: !!top && top[1] === 3 };
    }
    return {
      ...base,
      myState: ps,
      mySolved: ps.solved.map((name) => ({ name, level: levelOf(name), tileIds: tilesOf(name) })),
      myGuessCount: ps.guessed.length,
      ...(lastGuess ? { lastGuess } : {}),
    };
  }

  /** A Sprint round's category: the game's own snapshot, or the original fixed list for older games. */
  private sprintCategory(g: GameInstance, round: number): SprintCategory {
    const own = (g.extra as { categories?: SprintCategory[] }).categories;
    return own?.[round] ?? SPRINT_CATEGORIES[round % SPRINT_CATEGORIES.length]!;
  }

  /** The game's own Connections board, or the original board for older games. */
  private boardOf(g: GameInstance): ConnectionsBoard {
    return (g.extra as { board?: ConnectionsBoard }).board ?? CONNECTIONS_BOARD;
  }

  /**
   * Tiles in display order. Never in answer order: before Sprint 4 the board
   * was sent group by group (the first four tiles were always one group).
   * New games carry a seeded order; older games get one derived from their seed.
   */
  private connectionsTiles(g: GameInstance): { id: string; text: string }[] {
    const board = this.boardOf(g);
    let order = (g.extra as { tileOrder?: string[] }).tileOrder;
    if (!order) {
      const rng = seededRng((g.seed ?? 1) ^ 0x5bd1e995);
      order = board.tiles.map((t) => t.id);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
    }
    const byId = new Map(board.tiles.map((t) => [t.id, t]));
    return order.map((id) => ({ id, text: byId.get(id)!.text }));
  }

  /** The ONLY pathway to outbound state. Never include secrets for the wrong audience. */
  project(audience: Audience, actorId?: string, opts: { clientProtocol?: number } = {}): Record<string, unknown> {
    const legacyClient = opts.clientProtocol === undefined || opts.clientProtocol < CLIENT_PROTOCOL;
    const now = this.clock();
    const publicPlayers = [...this.players.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatar: p.avatar,
      isHost: p.isHost,
      isCohost: p.isCohost,
      connected: p.connected,
      presence: this.presenceOf(p.id, now),
      // Server time the device dropped; lets clients say "away 2 min" without trusting their own clock.
      awayForMs: p.connected || p.disconnectedAt == null ? 0 : Math.max(0, now - p.disconnectedAt),
    }));
    const publicGames = [...this.games.values()].map((g) => ({
      id: g.id,
      gameId: g.gameId,
      official: g.official,
      status: g.status,
      timedOut: g.timedOut ?? false,
      day: g.day ?? 1,
      deadlineAt: g.deadlineAt,
      // Sprint 3 lifecycle (server time; clients show countdowns as
      // deadline - serverNow, never their own clock alone).
      phaseDeadlineAt: g.status === "playing" ? g.phaseDeadlineAt : undefined,
      lifecycle: this.lifecycleInfo(g),
      outcome: g.status === "finished" ? g.outcome : undefined,
      countsOfficially: g.status === "finished" ? this.countsOfficially(g) : undefined,
      players: g.players,
      submittedCount: (g.submittedPlayers ?? []).length,
      totalPlayers: g.players.length,
      state: this.publicGameState(g),
      // Public questions: prompt + options only, no correctIndex/correctAnswer, and only after finish for Math.
      questions:
        g.status === "finished"
          ? g.questions?.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer }))
          : undefined,
      // Post-finish aggregate only, trivia only: per-question counts per
      // option index, computed from stored answers. No player identities —
      // the room can see HOW it answered, never WHO answered what.
      answerCounts: g.status === "finished" && g.gameId === "trivia" ? this.quizAnswerCounts(g) : undefined,
      questionPoints: g.status === "finished" && g.gameId === "trivia" ? this.quizQuestionPoints(g) : undefined,
      rawScores: g.status === "finished" ? g.rawScores : undefined,
    }));
    const base: Record<string, unknown> = {
      /** The server's clock when this projection was made (deadline countdowns). */
      serverNow: now,
      /** Clients older than `min` show "refresh" (src/shared/clientProtocol.ts). */
      protocol: { current: CLIENT_PROTOCOL, min: MIN_CLIENT_PROTOCOL },
      roomId: this.id,
      joinCode: this.joinCode,
      name: this.name,
      players: publicPlayers,
      games: publicGames,
      readiness: this.readiness(now),
      notices: this.recentNotices(now),
      officialStandings: this.officialStandings(),
      championshipDay: this.championshipDay,
      competition: {
        ...(({ format, label, description, teamGamesCount }) => ({ format, label, description, teamGamesCount }))(formatInfo(this._cup.format)),
        cupId: this._cup.cupId,
        qualifying: describePolicy(this._cup.qualificationPolicy),
        ...(this.cupError ? { standingsPaused: "This Cup’s saved rules could not be read, so standings are paused until they are repaired. No results have been lost." } : {}),
      },
      championship: this.championshipResults(),
      achievements: this.achievements(),
      ceremony: this.ceremony(),
      seq: this.seq,
      /** Connected spectators only. Players and spectators are disjoint
       *  sets, so this count never inflates attendance or seat counts. */
      spectatorCount: this.spectatorCount(),
    };
    if (audience === "tv") {
      return base; // TV gets public only, never recovery tokens, never pre-reveal answers.
    }
    if (audience === "player" && actorId) {
      const me = this.players.get(actorId);
      if (!me) return base;
      // Player sees their own answers only, never other players' answers or
      // answer keys pre-reveal. Private game state (hidden roles, secret
      // words, the actor's prompt, own answers) goes ONLY to players listed
      // in that game: joining the room after a game started does not make
      // someone a participant, so a late joiner gets the public state.
      const myGames = [...this.games.values()].map((g) => {
        const participant = g.players.includes(actorId);
        return {
          id: g.id,
          gameId: g.gameId,
          status: g.status,
          official: g.official,
          // Same public timing/outcome facts as the games list (server time).
          deadlineAt: g.deadlineAt,
          phaseDeadlineAt: g.status === "playing" ? g.phaseDeadlineAt : undefined,
          lifecycle: this.lifecycleInfo(g),
          outcome: g.status === "finished" ? g.outcome : undefined,
          countsOfficially: g.status === "finished" ? this.countsOfficially(g) : undefined,
          participant,
          myAnswers: participant ? g.answers[actorId] ?? {} : {},
          myScore: participant ? g.rawScores[actorId] ?? 0 : 0,
          // Own whole-game abstention only; phase abstentions ride in state.myAbstained.
          abstained: participant && (g.abstained ?? []).includes(actorId),
          state: participant ? this.participantGameState(g, actorId) : this.publicGameState(g),
          // Math (Sprint 3): a question's prompt is revealed only once the
          // player has opened it (its speed clock starts then). Legacy games
          // without openedAt keep showing every prompt.
          // A pre-Sprint 3 tab can't open questions one at a time, so it gets
          // every prompt (or it could not play at all), and that player is
          // marked: their answers in this game score correctness only.
          questions:
            participant && g.status === "playing"
              ? g.questions?.map((q) => (g.openedAt === undefined || legacyClient || g.openedAt[actorId]?.[q.id] !== undefined || g.answers[actorId]?.[q.id] !== undefined
                ? { id: q.id, prompt: q.prompt, options: q.options }
                : { id: q.id }))
              : undefined,
          ...(participant && g.status === "playing" && g.openedAt !== undefined && legacyClient ? this.markPromptsExposed(g, actorId) : {}),
          // Own answer times only (server-measured), for "answered in 3.2 s".
          myAnswerTimes: participant && g.gameId === "math-mayhem" && g.openedAt !== undefined ? g.answerTimes[actorId] ?? {} : undefined,
          // Finished scores are public (same policy as the public games list);
          // without this, ShowResults and the finished panel rendered empty.
          rawScores: g.status === "finished" ? g.rawScores : undefined,
        };
      });
      return { ...base, me: { id: me.id, displayName: me.displayName, isHost: me.isHost, isCohost: me.isCohost, hasRecoveryCode: !!me.recoveryCodeHash }, myGames };
    }
    if (audience === "host" || audience === "cohost") {
      // Host/cohost do NOT get answer keys or recovery tokens pre-reveal in this engine.
      return { ...base, hostView: true };
    }
    return base;
  }

  /** Serialise the full room for snapshot persistence. Recovery token hashes are included (hashes only, never raw tokens). */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      joinCode: this.joinCode,
      name: this.name,
      hostId: this.hostId,
      cohosts: [...this.cohosts],
      championshipDay: this.championshipDay,
      // Kept for older readers; the Cup record is authoritative. An unreadable
      // record is written back exactly as it was found, never overwritten.
      competitionFormat: this._cup.format,
      cup: this.cupError ? this.cupRaw : this._cup,
      contentUsage: this.contentUsage,
      contentSeq: this.contentSeq,
      players: [...this.players.values()],
      spectators: [...this.spectators.values()],
      games: [...this.games.values()],
      ledger: this.ledger,
      seq: this.seq,
      seenIntents: [...this.seenIntents.entries()],
      nextPlayer: this.nextPlayer,
      nextSpectator: this.nextSpectator,
      nextGame: this.nextGame,
    };
  }

  static fromJSON(data: Record<string, unknown>): RoomEngine {
    const engine = new RoomEngine(data["name"] as string);
    engine.id = data["id"] as string;
    engine.joinCode = data["joinCode"] as string;
    engine.hostId = data["hostId"] as string | null;
    engine.cohosts = new Set(data["cohosts"] as string[]);
    // Migration default: snapshots written before championshipDay was
    // serialized (review 5769441799) have no field and resume at day 1.
    engine.championshipDay = typeof data["championshipDay"] === "number" ? data["championshipDay"] : 1;
    engine.contentUsage = (data["contentUsage"] as UsageHistory | undefined) ?? {};
    engine.contentSeq = typeof data["contentSeq"] === "number" ? data["contentSeq"] : 0;
    // The Cup's rules come from its saved record; a snapshot from before
    // Sprint 4 keeps the rules it was played under (src/server/cup.ts).
    const firstEvent = (data["ledger"] as LedgerEvent[] | undefined)?.[0]?.createdAt ?? 0;
    const restored = restoreCupRecord(data["cup"], { roomId: engine.id, legacyFormat: data["competitionFormat"], createdAt: firstEvent });
    if (restored.ok) {
      engine._cup = restored.cup;
    } else {
      engine.cupError = restored.error;
      engine.cupRaw = restored.raw;
      console.error(`[cup] room ${engine.id}: ${restored.error} — standings paused, record preserved`);
    }
    engine.players = new Map((data["players"] as RoomPlayer[]).map((p) => [p.id, p]));
    // Migration default: snapshots written before spectators existed have
    // no spectators field and resume with none — never with phantom viewers.
    engine.spectators = new Map(((data["spectators"] as Spectator[] | undefined) ?? []).map((s) => [s.id, s]));
    engine.games = new Map((data["games"] as GameInstance[]).map((g) => [g.id, g]));
    engine.ledger = data["ledger"] as LedgerEvent[];
    engine.seq = data["seq"] as number;
    engine.seenIntents = new Map(data["seenIntents"] as [string, { accepted: boolean; result: unknown }][]);
    engine.nextPlayer = data["nextPlayer"] as number;
    engine.nextSpectator = typeof data["nextSpectator"] === "number" ? data["nextSpectator"] : 1;
    engine.nextGame = data["nextGame"] as number;
    return engine;
  }

  /**
   * The audit ledger as one player may see it. The full ledger stays
   * server-side (snapshots, scoring, Memory Book derivation). Two event
   * kinds are private to their subject:
   * - another player's `player-abstained` event (decision L33: who sat out
   *   is never revealed to other players), and
   * - any `score-awarded` event of a game still being played (Math awards
   *   points per answer, so live per-question points reveal who is
   *   answering correctly before the reveal).
   */
  ledgerFor(actorId: string): LedgerEvent[] {
    const playing = new Set([...this.games.values()].filter((g) => g.status === "playing").map((g) => g.id));
    return this.ledger.filter((e) => {
      if (e.type === "player-abstained" && e.playerId !== actorId) return false;
      // Whether someone else saved a recovery code is their business.
      if (e.type === "recovery-code-issued" && e.playerId !== actorId) return false;
      if (e.type === "score-awarded" && e.gameInstanceId && playing.has(e.gameInstanceId)) return false;
      return true;
    });
  }

  /** Export a hash of the ledger for audit, without exposing tokens. */
  ledgerChecksum(): string {
    return createHash("sha256").update(JSON.stringify(this.ledger)).digest("hex").slice(0, 16);
  }
}
