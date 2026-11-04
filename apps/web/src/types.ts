// Typed server/client projection contracts for the browser app.
// These mirror src/server/room.ts project() output. Game-specific state
// (state, questions) stays as unknown/Record<string, unknown> and is narrowed
// per game in App.tsx; the top-level contract — players, games, standings,
// me/myGames — is fully typed and checked by apps/web/tsconfig.json.

export type GameStatus = "lobby" | "playing" | "revealed" | "finished";

export interface PublicPlayer {
  id: string;
  displayName: string;
  avatar: string;
  isHost: boolean;
  isCohost: boolean;
  connected: boolean;
}

export interface PublicGame {
  id: string;
  gameId: string;
  official: boolean;
  status: GameStatus;
  timedOut: boolean;
  day?: number;
  deadlineAt?: number;
  players: string[];
  submittedCount?: number;
  totalPlayers?: number;
  state?: unknown;
  questions?: { id: string; prompt: string; options: string[]; correctAnswer?: number }[];
  rawScores?: Record<string, number>;
  /** Post-finish aggregate only (trivia): per-question counts per option index. No identities. */
  answerCounts?: Record<string, number[]>;
}

export interface PlayerGame {
  id: string;
  gameId: string;
  status: GameStatus;
  myAnswers: Record<string, number | null>;
  myScore: number;
  /** True when this player sat out the rest of this whole-game game. */
  abstained?: boolean;
  state?: unknown;
  questions?: { id: string; prompt: string; options: string[] }[];
  rawScores?: Record<string, number>;
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
  roomId: string;
  joinCode: string;
  name: string;
  players: PublicPlayer[];
  games: PublicGame[];
  officialStandings: Record<string, number>;
  championshipDay?: number;
  championship?: ChampionshipResult[];
  achievements?: Achievement[];
  ceremony?: Ceremony;
  seq: number;
  reactions?: { emoji: string; sender: string; ts: number }[];
  reactionsMuted?: boolean;
  /** Player ids that nudged me in the last 10s (ephemeral, target-only). */
  nudgedBy?: string[];
  me?: { id: string; displayName: string; isHost: boolean; isCohost: boolean };
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
