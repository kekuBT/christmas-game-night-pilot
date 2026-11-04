import { createHash, randomInt } from "node:crypto";
import { getGame } from "../games/registry.js";
import { dayScore, midrankScore } from "../scoring/championship.js";
import { computeChampionship, type PlayerDay } from "../scoring/ledger.js";
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
  captionTotalScores,
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
  official?: boolean;
  previousPoints?: number;
  createdAt: number;
}

export interface GameInstance {
  id: string;
  gameId: string;
  official: boolean;
  status: "lobby" | "playing" | "revealed" | "finished";
  players: string[]; // player ids
  timedOut?: boolean; // host-skipped after deadline; never counts toward official standings
  day?: number; // championship day the game was started on (default 1)
  questions?: MathQuestion[]; // Math only, server-side. Never projected pre-reveal.
  answers: Record<string, Record<string, number | null>>; // playerId -> questionId -> chosenIndex
  answerTimes: Record<string, Record<string, number>>; // playerId -> questionId -> elapsedMs
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
  championshipDay = 1;
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
    // Secure per-session seed by default. Explicit seeds are for controlled
    // tests only; the old default of 42 made hidden-role assignment predictable.
    const seed = opts.seed ?? randomInt(0, 2147483647);
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
      day: this.championshipDay,
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

  /**
   * Players who can still advance a game: connected players, falling back to
   * all players if nobody is connected (so a game never finishes instantly
   * just because everyone dropped at once — the host skip covers that case).
   * A disconnected player's partial answers still count; they simply no
   * longer block the rest of the room from finishing.
   */
  private activePlayers(game: GameInstance): string[] {
    const connected = game.players.filter((pid) => this.players.get(pid)?.connected);
    return connected.length > 0 ? connected : game.players;
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
        if (!game.submittedPlayers.includes(actorId)) game.submittedPlayers.push(actorId);
      }
    }
    this.seenIntents.set(key, { accepted: result.accepted, result });
    return result;
  }

  private submitSocialIntent(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now = Date.now()) {
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
        guessConnections(CONNECTIONS_BOARD, ps, tileIds as string[]);
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
        const cat = SPRINT_CATEGORIES[r % SPRINT_CATEGORIES.length]!;
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
  private submitAbstain(intent: ReturnType<typeof IntentSchema.parse>, actorId: string, now = Date.now()) {
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
      if (allDone) {
        // Math scores accrue live per answer; abstainers simply add nothing more.
        game.status = "finished";
        this.log("game-finished", { gameInstanceId: game.id, official: game.official });
      }
    }
  }

  private finishGame(game: GameInstance, scores: Record<string, number>): void {
    // Normalise: every player in the game gets an entry, defaulting to 0.
    // Scoring helpers only list players who earned points, so a player who
    // abstained from everything (or never scored) would otherwise vanish
    // from rawScores instead of standing at 0.
    game.rawScores = { ...Object.fromEntries(game.players.map((p) => [p, 0])), ...scores };
    game.status = "finished";
    for (const [pid, pts] of Object.entries(scores)) {
      this.log("score-awarded", { playerId: pid, gameInstanceId: game.id, points: pts, reason: `game:${game.gameId}` });
    }
    this.log("game-finished", { gameInstanceId: game.id, official: game.official });
  }

  /**
   * Authoritative championship standings: finished, OFFICIAL, non-timed-out
   * games only, midrank-normalised per game and summed. Practice games and
   * host-skipped timed-out games can never change this, whatever the UI sums.
   */
  officialStandings(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const g of this.games.values()) {
      if (g.status !== "finished" || !g.official || g.timedOut) continue;
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
    const days = new Map<string, PlayerDay>();
    for (const g of this.games.values()) {
      if (g.status !== "finished" || !g.official || g.timedOut) continue;
      const all = Object.values(g.rawScores);
      if (all.length < 2) continue;
      const isTeam = getGame(g.gameId).modes.includes("team");
      for (const [pid, pts] of Object.entries(g.rawScores)) {
        const key = `${pid}:${g.day ?? 1}`;
        const entry = days.get(key) ?? { playerId: pid, day: g.day ?? 1, soloScores: [], teamScores: [] };
        const score = midrankScore(pts, all);
        if (isTeam) entry.teamScores.push(score); else entry.soloScores.push(score);
        days.set(key, entry);
      }
    }
    return computeChampionship([...days.values()]);
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
    const days = new Map<string, PlayerDay>();
    for (const g of this.games.values()) {
      if (g.status !== "finished" || !g.official || g.timedOut) continue;
      if ((g.day ?? 1) !== this.championshipDay) continue;
      const all = Object.values(g.rawScores);
      if (all.length < 2) continue;
      const isTeam = getGame(g.gameId).modes.includes("team");
      for (const [pid, pts] of Object.entries(g.rawScores)) {
        const entry = days.get(pid) ?? { playerId: pid, day: this.championshipDay, soloScores: [], teamScores: [] };
        const score = midrankScore(pts, all);
        if (isTeam) entry.teamScores.push(score); else entry.soloScores.push(score);
        days.set(pid, entry);
      }
    }
    const standings = [...days.values()].map((d) => ({
      playerId: d.playerId,
      displayName: this.players.get(d.playerId)?.displayName ?? d.playerId,
      base: dayScore({ soloScores: d.soloScores, teamScores: d.teamScores }).score,
    }));
    return dayCeremony(this.championshipDay, standings);
  }

  /**
   * Host/cohost-only escape hatch for a stalled game: after its deadline a
   * host may close it without inventing scores. Players who never submitted
   * simply keep their current (zero or partial) raw scores, the game is
   * marked timedOut, and officialStandings() excludes it.
   */
  skipTimedOutGame(actorId: string, gameInstanceId: string, now = Date.now()): void {
    if (this.hostId !== actorId && !this.cohosts.has(actorId)) throw new Error("Only host/cohost can skip a timed-out game");
    const game = this.games.get(gameInstanceId);
    if (!game || game.status !== "playing") throw new Error("Game is not playing");
    if (!game.deadlineAt || now < game.deadlineAt) throw new Error("Game has not timed out yet");
    game.status = "finished";
    game.timedOut = true;
    this.log("game-timed-out", { gameInstanceId: game.id, actor: actorId });
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
    // Finish when every player answered every question (or sat out the rest)
    const allDone = this.activePlayers(game).every((pid) => (game.abstained ?? []).includes(pid) || Object.keys(game.answers[pid] ?? {}).length >= (game.questions?.length ?? 0));
    if (allDone) {
      game.status = "finished";
      this.log("game-finished", { gameInstanceId: game.id });
    }
    return { accepted: true, result: { points, total: game.rawScores[actorId] } };
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
      timedOut: g.timedOut ?? false,
      day: g.day ?? 1,
      deadlineAt: g.deadlineAt,
      players: g.players,
      submittedCount: (g.submittedPlayers ?? []).length,
      totalPlayers: g.players.length,
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
                      ).map((q) => ({
                        id: q["id"],
                        prompt: q["prompt"] ?? q["quote"],
                        options: q["options"],
                        // Post-finish only, trivia only: the correct answer is
                        // public once the game is finished (scores already are).
                        // Never exposed while playing — that would leak the key.
                        ...(g.status === "finished" && g.gameId === "trivia" ? { correctIndex: q["correctIndex"] } : {}),
                      })),
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
      // Post-finish aggregate only, trivia only: per-question counts per
      // option index, computed from stored answers. No player identities —
      // the room can see HOW it answered, never WHO answered what.
      answerCounts: g.status === "finished" && g.gameId === "trivia" ? this.quizAnswerCounts(g) : undefined,
      rawScores: g.status === "finished" || g.status === "revealed" ? g.rawScores : undefined,
    }));
    const base: Record<string, unknown> = {
      roomId: this.id,
      joinCode: this.joinCode,
      name: this.name,
      players: publicPlayers,
      games: publicGames,
      officialStandings: this.officialStandings(),
      championshipDay: this.championshipDay,
      championship: this.championshipResults(),
      achievements: this.achievements(),
      ceremony: this.ceremony(),
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
        // Own whole-game abstention only; phase abstentions ride in state.myAbstained.
        abstained: (g.abstained ?? []).includes(actorId),
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
                        ).map((q) => ({
                          id: q["id"],
                          prompt: q["prompt"] ?? q["quote"],
                          options: q["options"] ?? q["speakers"],
                          // Same post-finish-only rule as the public branch.
                          ...(g.status === "finished" && g.gameId === "trivia" ? { correctIndex: q["correctIndex"] } : {}),
                        })),
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
        // Finished scores are public (same policy as the public games list);
        // without this, ShowResults and the finished panel rendered empty.
        rawScores: g.status === "finished" || g.status === "revealed" ? g.rawScores : undefined,
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
      championshipDay: this.championshipDay,
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
    // Migration default: snapshots written before championshipDay was
    // serialized (review 5769441799) have no field and resume at day 1.
    engine.championshipDay = typeof data["championshipDay"] === "number" ? data["championshipDay"] : 1;
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
