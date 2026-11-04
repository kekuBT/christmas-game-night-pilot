import { createHash } from "node:crypto";
import { getGame } from "../games/registry.js";
import { generateMathQuestions, scoreMathAnswer, type MathQuestion } from "../games/math.js";
import {
  allCluesIn,
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
  captionTotalScores,
  currentRound,
  initCaption,
  projectCaption,
  submitCaption,
  submitCaptionVote,
  type CaptionState,
} from "../games/caption.js";
import {
  advanceClosest,
  allGuessed,
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
  createRecoveryToken,
  dedupeKey,
  hashToken,
  IntentSchema,
  sanitizeText,
} from "../shared/protocol.js";

export type Audience = "player" | "tv" | "host" | "cohost";

export interface RoomPlayer {
  id: string;
  displayName: string;
  avatar: string;
  isHost: boolean;
  isCohost: boolean;
  connected: boolean;
  recoveryTokenHash: string;
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
  createdAt: number;
}

export interface GameInstance {
  id: string;
  gameId: string;
  official: boolean;
  status: "lobby" | "playing" | "revealed" | "finished";
  players: string[]; // player ids
  questions?: MathQuestion[]; // Math only, server-side. Never projected pre-reveal.
  answers: Record<string, Record<string, number | null>>; // playerId -> questionId -> chosenIndex
  answerTimes: Record<string, Record<string, number>>; // playerId -> questionId -> elapsedMs
  rawScores: Record<string, number>;
  startedAt?: number;
  deadlineAt?: number;
  seed: number;
  extra?: unknown;
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
  hostId: string | null = null;
  cohosts = new Set<string>();
  games = new Map<string, GameInstance>();
  ledger: LedgerEvent[] = [];
  seq = 0;
  private seenIntents = new Map<string, { accepted: boolean; result: unknown }>();
  private nextPlayer = 1;
  private nextGame = 1;

  constructor(name: string) {
    this.id = `room-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    this.joinCode = createJoinCode();
    this.name = name;
  }

  private log(type: string, extra: Partial<LedgerEvent> = {}): LedgerEvent {
    this.seq += 1;
    const ev: LedgerEvent = { eventId: `evt-${this.seq}`, seq: this.seq, type, createdAt: Date.now(), ...extra };
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
      joinedAt: Date.now(),
    };
    this.players.set(id, player);
    if (isHost) this.hostId = id;
    this.log("player-joined", { playerId: id });
    return { player, recoveryToken: token };
  }

  /** Reconnect to the same slot with the recovery token. No token = no takeover. */
  reconnect(playerId: string, recoveryToken: string): RoomPlayer {
    const player = this.players.get(playerId);
    if (!player) throw new Error("Unknown player slot");
    if (hashToken(recoveryToken) !== player.recoveryTokenHash) throw new Error("Recovery token does not match");
    player.connected = true;
    this.log("player-reconnected", { playerId });
    return player;
  }

  disconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.connected = false;
  }

  grantCohost(hostId: string, targetId: string): void {
    if (this.hostId !== hostId) throw new Error("Only the host can grant cohost");
    const target = this.players.get(targetId);
    if (!target) throw new Error("Unknown player");
    target.isCohost = true;
    this.cohosts.add(targetId);
    this.log("cohost-granted", { playerId: targetId, actor: hostId });
  }

  startGame(hostId: string, gameId: string, opts: { official?: boolean; seed?: number } = {}): GameInstance {
    if (this.hostId !== hostId && !this.cohosts.has(hostId)) throw new Error("Only host/cohost can start a game");
    const game = getGame(gameId);
    if (game.status === "not-implemented") throw new Error(`Game not implemented yet: ${gameId}`);
    // The browser UI has a single active-game panel (first playing game), so
    // a second concurrent game would orphan the first: it could never become
    // active again. Reject instead of silently stacking games.
    if ([...this.games.values()].some((g) => g.status === "playing")) throw new Error("A game is already in progress");
    const playerIds = [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
    if (playerIds.length < game.minPlayers) throw new Error(`Need at least ${game.minPlayers} connected players`);
    if (playerIds.length > game.maxPlayers) throw new Error(`Too many players for ${gameId}`);
    const id = `game-${this.nextGame++}`;
    const seed = opts.seed ?? 42;
    const instance: GameInstance = {
      id,
      gameId,
      official: opts.official ?? false,
      status: "playing",
      players: playerIds,
      questions: gameId === "math-mayhem" ? generateMathQuestions(seed) : undefined,
      answers: {},
      answerTimes: {},
      rawScores: Object.fromEntries(playerIds.map((p) => [p, 0])),
      startedAt: Date.now(),
      deadlineAt: Date.now() + 5 * 60 * 1000,
      seed,
      extra:
        gameId === "impostor"
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
    this.log("game-started", { gameInstanceId: id, actor: hostId });
    return instance;
  }

  /** Submit a validated intent. Returns the ack; duplicates return the original result. */
  submitIntent(raw: unknown, actorId: string, now = Date.now()): { accepted: boolean; reason?: string; result?: unknown } {
    const parsed = IntentSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: "INVALID_INTENT" };
    const intent = parsed.data;
    if (intent.roomId !== this.id) return { accepted: false, reason: "WRONG_ROOM" };
    const key = dedupeKey(intent.roomId, actorId, intent.clientEventId);
    const seen = this.seenIntents.get(key);
    if (seen) return { accepted: seen.accepted, result: seen.result };

    let result: { accepted: boolean; reason?: string; result?: unknown };
    if (intent.action === "submit-math-answer") {
      result = this.submitMathAnswer(intent, actorId, now);
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
      result = this.submitSocialIntent(intent, actorId);
    } else {
      result = { accepted: false, reason: "UNKNOWN_ACTION" };
    }
    this.seenIntents.set(key, { accepted: result.accepted, result });
    return result;
  }

  private submitSocialIntent(intent: ReturnType<typeof IntentSchema.parse>, actorId: string) {
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing") return { accepted: false, reason: "PHASE_CLOSED" };
    if (!game.players.includes(actorId)) return { accepted: false, reason: "NOT_IN_GAME" };
    try {
      if (game.gameId === "impostor") {
        const state = game.extra as ImpostorState;
        if (intent.action === "impostor-clue") {
          const clue = sanitizeText(intent.payload["clue"], 140);
          if (!clue) return { accepted: false, reason: "INVALID_PAYLOAD" };
          submitClue(state, actorId, clue);
          if (allCluesIn(state, game.players)) state.phase = "vote";
        } else if (intent.action === "impostor-vote") {
          submitVote(state, actorId, String(intent.payload["suspectId"] ?? ""), game.players);
          if (Object.keys(state.votes).length >= game.players.length) {
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
          if (Object.keys(currentRound(state).captions).length >= game.players.length) state.phase = "vote";
        } else if (intent.action === "caption-vote") {
          submitCaptionVote(state, actorId, String(intent.payload["captionId"] ?? ""), game.players);
          if (Object.keys(currentRound(state).votes).length >= game.players.length) {
            if (state.roundIndex + 1 >= state.rounds.length) {
              state.phase = "finished";
              this.finishGame(game, captionTotalScores(state));
            } else {
              state.roundIndex += 1;
              state.phase = "caption";
            }
          }
        }
      } else if (game.gameId === "closest-wins") {
        const state = game.extra as ClosestState;
        if (intent.action === "closest-guess") {
          const value = intent.payload["value"];
          if (typeof value !== "number") return { accepted: false, reason: "INVALID_PAYLOAD" };
          submitClosestGuess(state, actorId, value);
          if (allGuessed(state, game.players)) {
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
        const allDone = game.players.every((pid) => Object.keys(state.answers[pid] ?? {}).length >= state.questions.length);
        if (allDone) {
          const scores: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, 0]));
          for (const pid of game.players) {
            for (const q of state.questions) {
              const chosenIdx = state.answers[pid]?.[q.id] ?? null;
              if (game.gameId === "trivia") scores[pid] = (scores[pid] ?? 0) + scoreTrivia(q as TriviaQuestion, chosenIdx, 3000);
              else if (game.gameId === "who-said-that") scores[pid] = (scores[pid] ?? 0) + scoreWhoSaid(q as WhoSaidQuestion, chosenIdx);
              else scores[pid] = (scores[pid] ?? 0) + scoreGeography(q as GeographyQuestion, chosenIdx);
            }
          }
          this.finishGame(game, scores);
        }
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
        const allDone = game.players.every((pid) => Object.keys(state.guesses[pid] ?? {}).length >= state.events.length);
        if (allDone) {
          const scores: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, 0]));
          for (const pid of game.players) {
            for (const e of state.events) scores[pid] = (scores[pid] ?? 0) + scoreYear(e, state.guesses[pid]?.[e.id] ?? null);
          }
          this.finishGame(game, scores);
        }
      } else if (game.gameId === "word-connections") {
        const state = game.extra as { playerStates: Record<string, ConnectionsPlayerState> };
        if (intent.action !== "connections-guess") return { accepted: false, reason: "UNKNOWN_ACTION" };
        const tileIds = intent.payload["tileIds"];
        if (!Array.isArray(tileIds) || !tileIds.every((t) => typeof t === "string")) return { accepted: false, reason: "INVALID_PAYLOAD" };
        const ps = state.playerStates[actorId]!;
        guessConnections(CONNECTIONS_BOARD, ps, tileIds as string[]);
        const allDone = game.players.every((pid) => {
          const s = state.playerStates[pid]!;
          return s.solved.length >= 4 || s.mistakes >= 4;
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
        const allDoneRound = game.players.every((pid) => roundSubs[pid] !== undefined);
        if (allDoneRound) {
          if (state.roundIndex + 1 >= 3) {
            const total: Record<string, number> = Object.fromEntries(game.players.map((p) => [p, 0]));
            for (let r = 0; r < 3; r++) {
              const cat = SPRINT_CATEGORIES[r % SPRINT_CATEGORIES.length]!;
              const roundScores = scoreSprintRound(cat, state.submissions[r] ?? {});
              for (const pid of game.players) total[pid] = (total[pid] ?? 0) + (roundScores[pid] ?? 0);
            }
            this.finishGame(game, total);
          } else {
            state.roundIndex += 1;
          }
        }
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

  private finishGame(game: GameInstance, scores: Record<string, number>): void {
    game.rawScores = scores;
    game.status = "finished";
    for (const [pid, pts] of Object.entries(scores)) {
      this.log("score-awarded", { playerId: pid, gameInstanceId: game.id, points: pts, reason: `game:${game.gameId}` });
    }
    this.log("game-finished", { gameInstanceId: game.id });
  }

  private submitMathAnswer(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now: number) {
    const game = intent.gameInstanceId ? this.games.get(intent.gameInstanceId) : undefined;
    if (!game || game.status !== "playing") return { accepted: false, reason: "PHASE_CLOSED" };
    if (!game.players.includes(actorId)) return { accepted: false, reason: "NOT_IN_GAME" };
    const questionId = intent.payload["questionId"];
    const chosenIndex = intent.payload["chosenIndex"];
    if (typeof questionId !== "string" || typeof chosenIndex !== "number") return { accepted: false, reason: "INVALID_PAYLOAD" };
    const question = game.questions?.find((q) => q.id === questionId);
    if (!question) return { accepted: false, reason: "UNKNOWN_QUESTION" };
    const startedAt = game.startedAt ?? now;
    const elapsedMs = Math.max(0, now - startedAt);
    // Late answers after a generous 5-minute game window are rejected, not silently dropped.
    if (elapsedMs > 5 * 60 * 1000) return { accepted: false, reason: "PHASE_CLOSED" };
    const playerAnswers = (game.answers[actorId] ??= {});
    if (playerAnswers[questionId] !== undefined) return { accepted: false, reason: "ALREADY_ANSWERED" };
    playerAnswers[questionId] = chosenIndex;
    const playerTimes = (game.answerTimes[actorId] ??= {});
    playerTimes[questionId] = elapsedMs;
    const points = scoreMathAnswer(question, chosenIndex, elapsedMs);
    game.rawScores[actorId] = (game.rawScores[actorId] ?? 0) + points;
    this.log("score-awarded", { playerId: actorId, gameInstanceId: game.id, points, reason: `math:${questionId}` });
    // Finish when every player answered every question
    const allDone = game.players.every((pid) => Object.keys(game.answers[pid] ?? {}).length >= (game.questions?.length ?? 0));
    if (allDone) {
      game.status = "finished";
      this.log("game-finished", { gameInstanceId: game.id });
    }
    return { accepted: true, result: { points, total: game.rawScores[actorId] } };
  }

  /** The ONLY pathway to outbound state. Never include secrets for the wrong audience. */
  project(audience: Audience, actorId?: string): Record<string, unknown> {
    const publicPlayers = [...this.players.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatar: p.avatar,
      isHost: p.isHost,
      isCohost: p.isCohost,
      connected: p.connected,
    }));
    const publicGames = [...this.games.values()].map((g) => ({
      id: g.id,
      gameId: g.gameId,
      official: g.official,
      status: g.status,
      players: g.players,
      state:
        g.gameId === "impostor"
          ? projectImpostor(g.extra as ImpostorState, "", true)
          : g.gameId === "caption-clash"
            ? projectCaption(g.extra as CaptionState, "", true)
            : g.gameId === "closest-wins"
              ? projectClosest(g.extra as ClosestState, "", true)
              : g.gameId === "charades"
                ? projectCharades(g.extra as CharadesState, "", true)
                : g.gameId === "trivia" || g.gameId === "who-said-that" || g.gameId === "geography"
                  ? {
                      questions: (
                        (g.extra as { questions: Record<string, unknown>[] }).questions ?? []
                      ).map((q) => ({ id: q["id"], prompt: q["prompt"] ?? q["quote"], options: q["options"] })),
                    }
                  : g.gameId === "guess-the-year"
                    ? { events: ((g.extra as { events: YearEvent[] }).events ?? []).map((e) => ({ id: e.id, event: e.event })) }
                    : g.gameId === "word-connections"
                      ? { tiles: CONNECTIONS_BOARD.tiles.map((t) => ({ id: t.id, text: t.text })) }
                      : g.gameId === "category-sprint"
                        ? { roundIndex: (g.extra as { roundIndex: number }).roundIndex, category: SPRINT_CATEGORIES[(g.extra as { roundIndex: number }).roundIndex % SPRINT_CATEGORIES.length]?.name }
                        : undefined,
      // Public questions: prompt + options only, no correctIndex/correctAnswer, and only after finish for Math.
      questions:
        g.status === "finished"
          ? g.questions?.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer }))
          : undefined,
      rawScores: g.status === "finished" || g.status === "revealed" ? g.rawScores : undefined,
    }));
    const base: Record<string, unknown> = {
      roomId: this.id,
      joinCode: this.joinCode,
      name: this.name,
      players: publicPlayers,
      games: publicGames,
      seq: this.seq,
    };
    if (audience === "tv") {
      return base; // TV gets public only, never recovery tokens, never pre-reveal answers.
    }
    if (audience === "player" && actorId) {
      const me = this.players.get(actorId);
      if (!me) return base;
      // Player sees their own answers only, never other players' answers or answer keys pre-reveal.
      const myGames = [...this.games.values()].map((g) => ({
        id: g.id,
        gameId: g.gameId,
        status: g.status,
        myAnswers: g.answers[actorId] ?? {},
        myScore: g.rawScores[actorId] ?? 0,
        state:
          g.gameId === "impostor"
            ? projectImpostor(g.extra as ImpostorState, actorId, false)
            : g.gameId === "caption-clash"
              ? projectCaption(g.extra as CaptionState, actorId, false)
              : g.gameId === "closest-wins"
                ? projectClosest(g.extra as ClosestState, actorId, false)
                : g.gameId === "charades"
                  ? projectCharades(g.extra as CharadesState, actorId, false)
                  : g.gameId === "trivia" || g.gameId === "who-said-that" || g.gameId === "geography"
                    ? {
                        questions: (
                          (g.extra as { questions: Record<string, unknown>[] }).questions ?? []
                        ).map((q) => ({ id: q["id"], prompt: q["prompt"] ?? q["quote"], options: q["options"] ?? q["speakers"] })),
                        myAnswers: (g.extra as { answers: Record<string, Record<string, number>> }).answers[actorId] ?? {},
                      }
                    : g.gameId === "guess-the-year"
                      ? {
                          events: ((g.extra as { events: YearEvent[] }).events ?? []).map((e) => ({ id: e.id, event: e.event })),
                          myGuesses: (g.extra as { guesses: Record<string, Record<string, number>> }).guesses[actorId] ?? {},
                        }
                      : g.gameId === "word-connections"
                        ? { tiles: CONNECTIONS_BOARD.tiles.map((t) => ({ id: t.id, text: t.text })), myState: (g.extra as { playerStates: Record<string, ConnectionsPlayerState> }).playerStates[actorId] }
                        : g.gameId === "category-sprint"
                          ? { roundIndex: (g.extra as { roundIndex: number }).roundIndex, category: SPRINT_CATEGORIES[(g.extra as { roundIndex: number }).roundIndex % SPRINT_CATEGORIES.length]?.name }
                          : undefined,
        questions:
          g.status === "playing"
            ? g.questions?.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options }))
            : undefined,
      }));
      return { ...base, me: { id: me.id, displayName: me.displayName, isHost: me.isHost, isCohost: me.isCohost }, myGames };
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
      players: [...this.players.values()],
      games: [...this.games.values()],
      ledger: this.ledger,
      seq: this.seq,
      seenIntents: [...this.seenIntents.entries()],
      nextPlayer: this.nextPlayer,
      nextGame: this.nextGame,
    };
  }

  static fromJSON(data: Record<string, unknown>): RoomEngine {
    const engine = new RoomEngine(data["name"] as string);
    engine.id = data["id"] as string;
    engine.joinCode = data["joinCode"] as string;
    engine.hostId = data["hostId"] as string | null;
    engine.cohosts = new Set(data["cohosts"] as string[]);
    engine.players = new Map((data["players"] as RoomPlayer[]).map((p) => [p.id, p]));
    engine.games = new Map((data["games"] as GameInstance[]).map((g) => [g.id, g]));
    engine.ledger = data["ledger"] as LedgerEvent[];
    engine.seq = data["seq"] as number;
    engine.seenIntents = new Map(data["seenIntents"] as [string, { accepted: boolean; result: unknown }][]);
    engine.nextPlayer = data["nextPlayer"] as number;
    engine.nextGame = data["nextGame"] as number;
    return engine;
  }

  /** Export a hash of the ledger for audit, without exposing tokens. */
  ledgerChecksum(): string {
    return createHash("sha256").update(JSON.stringify(this.ledger)).digest("hex").slice(0, 16);
  }
}
