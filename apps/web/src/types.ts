// Typed server/client projection contracts for the browser app.
// These mirror src/server/room.ts project() output. Game-specific state
// (state, questions) stays as unknown/Record<string, unknown> and is narrowed
// per game in App.tsx; the top-level contract — players, games, standings,
// me/myGames — is fully typed and checked by apps/web/tsconfig.json.

export type GameStatus = "playing" | "finished";

export interface PublicPlayer {
  id: string;
  displayName: string;
  avatar: string;
  isHost: boolean;
  isCohost: boolean;
  connected: boolean;
  /** Server-derived network presence (Sprint 2). Absent from older servers. */
  presence?: "connected" | "reconnecting" | "away";
  /** Server-measured time since the device dropped (0 while connected). */
  awayForMs?: number;
}

/** Sprint 3 lifecycle facts, in server time (src/server/lifecycle.ts). */
export interface GameLifecycleInfo {
  model: "game-deadline" | "phased" | "turns";
  officialEligible: boolean;
  practiceOnlyReason?: string;
  unit: "questions" | "events" | "groups" | "rounds" | "phases" | "turns";
  /** The phase now running (phased games); sent back with actions so a late one is refused. */
  phaseKey?: string;
}
export interface GameParticipation { done: number; of: number; finished?: boolean }
export interface GameOutcome {
  reason: "completed" | "deadline" | "backstop-partial" | "void";
  endedAt: number;
  countsOfficially: boolean;
  note?: string;
  participation: Record<string, GameParticipation>;
  completedUnits?: number;
  totalUnits?: number;
}
interface LifecycleFields {
  deadlineAt?: number;
  phaseDeadlineAt?: number;
  lifecycle?: GameLifecycleInfo;
  outcome?: GameOutcome;
  countsOfficially?: boolean;
}

export interface PublicGame extends LifecycleFields {
  id: string;
  gameId: string;
  official: boolean;
  status: GameStatus;
  timedOut: boolean;
  day?: number;
  players: string[];
  submittedCount?: number;
  totalPlayers?: number;
  state?: unknown;
  questions?: { id: string; prompt: string; options: string[]; correctAnswer?: number }[];
  rawScores?: Record<string, number>;
  /** Post-finish aggregate only (trivia): per-question counts per option index. No identities. */
  answerCounts?: Record<string, number[]>;
  /** Post-finish only (trivia): points a correct answer to each question is worth. Per-question values, not scores. */
  questionPoints?: Record<string, number>;
}

export interface PlayerGame extends LifecycleFields {
  id: string;
  official?: boolean;
  gameId: string;
  status: GameStatus;
  myAnswers: Record<string, number | null>;
  myScore: number;
  /** True when this player sat out the rest of this whole-game game. */
  abstained?: boolean;
  state?: unknown;
  /** Math (Sprint 3): prompt/options arrive only once the question is opened. */
  questions?: { id: string; prompt?: string; options?: string[] }[];
  rawScores?: Record<string, number>;
  /** Math: own server-measured answer times (ms from reveal to answer). */
  myAnswerTimes?: Record<string, number>;
}

export interface ChampionshipResult {
  playerId: string;
  dayScores: number[];
  counted: number[];
  qualifyingDays: number;
  base: number;
  participationBonus: number;
  finaleBonus: number;
  total: number;
  eligible: boolean;
  countedDailyWins: number;
  countedMedian: number;
}

export interface Achievement {
  ruleId: string;
  title: string;
  playerId: string;
  sourceEventIds: string[];
}

export interface Ceremony {
  day: number;
  winner: string | null;
  winners?: string[];
  standings: { playerId: string; displayName: string; base: number }[];
}

export interface Projection {
  /** The server's clock when this projection was made; countdowns use deadline − serverNow. */
  serverNow?: number;
  /** The Cup's fixed format (Sprint 3): label and one plain sentence. */
  competition?: { format: "individual-only" | "combined-75-25"; label: string; description: string; teamGamesCount: boolean };
  roomId: string;
  joinCode: string;
  name: string;
  players: PublicPlayer[];
  games: PublicGame[];
  officialStandings: Record<string, number>;
  /** Who is here and who a game started now would include or leave out (Sprint 2). */
  readiness?: Readiness;
  championshipDay?: number;
  championship?: ChampionshipResult[];
  achievements?: Achievement[];
  ceremony?: Ceremony;
  seq: number;
  reactions?: { emoji: string; sender: string; ts: number }[];
  reactionsMuted?: boolean;
  /** Connected spectators only. Never part of player counts or standings. */
  spectatorCount?: number;
  /** Player ids that nudged me in the last 10s (ephemeral, target-only). */
  nudgedBy?: string[];
  me?: { id: string; displayName: string; isHost: boolean; isCohost: boolean; hasRecoveryCode?: boolean };
  /** Seat recoveries in the last few minutes, visible to everyone (accountability). */
  notices?: RoomNotice[];
  /** Host/cohost only: devices asking to recover a seat. */
  recoveryRequests?: RecoveryRequestView[];
  myGames?: PlayerGame[];
  hostView?: boolean;
}

export interface RegistryGame {
  id: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  defaultDurationMinutes: number;
  tutorial: string;
  /** Server lifecycle policy (Sprint 3): time limits and whether it can count officially. */
  lifecycle?: {
    model: "game-deadline" | "phased" | "turns";
    gameWindowMs: number;
    phaseMs?: Partial<Record<string, number>>;
    officialEligible: boolean;
    practiceOnlyReason?: string;
  };
}

export interface MemoryEntry {
  id: string;
  day: number;
  text: string;
  sourceEventIds: string[];
  approved: boolean;
  approvedBy?: string;
  derivedFacts: string[];
}

export interface LedgerEvent {
  eventId: string;
  seq: number;
  type: string;
  playerId?: string;
  gameInstanceId?: string;
  points?: number;
  previousPoints?: number;
  reason?: string;
  actor?: string;
  official?: boolean;
  createdAt: number;
}

export interface JoinResponse {
  roomId: string;
  joinCode: string;
  playerId: string;
  displayName: string;
  isHost: boolean;
  recoveryToken: string;
  sessionToken?: string;
  name?: string;
  hostClaimToken?: string;
}

/** Seat-free viewing credential. No playerId: spectators are not players. */
export interface SpectateResponse {
  roomId: string;
  joinCode: string;
  spectatorId: string;
  spectatorToken: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  speakers?: string[];
  /** Only present in finished-game projections (post-reveal). Never while playing. */
  correctIndex?: number;
}

/** Game-specific state, as projected by the server. All fields optional: each game uses a subset. */
export interface GameState {
  category?: string;
  role?: string;
  word?: string;
  phase?: string;
  clues?: Record<string, string>;
  myVote?: string;
  myAbstained?: boolean;
  winner?: string;
  revealedWord?: string;
  prompt?: string;
  roundIndex?: number;
  myCaption?: string;
  captions?: { id: string; text: string }[];
  tiles?: { id: string; text: string }[];
  myState?: { mistakes: number; solved: string[]; guessed: string[] };
  actor?: string;
  teamScores?: number[];
  passesThisTurn?: number;
  myGuess?: number;
  unit?: string;
  events?: { id: string; event: string }[];
  myGuesses?: Record<string, number>;
  questions?: QuizQuestion[];
  myAnswers?: Record<string, number>;
}

/** Narrow an unknown JSON value to a record, or return an empty record. */
export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : [];
}

export interface Readiness {
  registered: number;
  connected: number;
  reconnecting: number;
  away: number;
  wouldPlay: string[];
  wouldMiss: { id: string; presence: "connected" | "reconnecting" | "away"; awayForMs: number }[];
}

export interface RoomNotice {
  eventId: string;
  type: string;
  playerId: string;
  displayName: string;
  method: string;
  byName: string | null;
  at: number;
}

export interface RecoveryRequestView {
  requestId: string;
  playerId: string;
  displayName: string;
  matchCode: string;
  ageMs: number;
  expiresInMs: number;
}
