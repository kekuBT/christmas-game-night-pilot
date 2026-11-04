import type { ReactionId } from './tokens/tokens';

/** Presentational data only. Game state, scoring and networking stay in the host app. */
export interface Player {
  id: string;
  name: string;
  /** Optional override; otherwise assigned from `playerPalette` by join order. */
  color?: string;
  connection?: 'connected' | 'disconnected';
  isHost?: boolean;
}

export interface AnswerOption {
  id: string;
  label: string;
}

/** A score as supplied by the host app. Components never compute points. */
export interface ScoreEntry {
  playerId: string;
  score: number;
  /** Points gained in the round just played (display only). */
  delta?: number;
}

export interface RankedEntry extends ScoreEntry {
  player: Player;
  /** Competition ranking: ties share a rank (1, 2, 2, 4). */
  rank: number;
}

/**
 * Optional championship (e.g. a seasonal "Family Cup"). Duration is data, never
 * hardcoded: a 7-day Christmas cup, a 3-night weekend cup or none at all.
 */
export interface ChampionshipConfig {
  name: string;
  /** "Day", "Night", "Round" … */
  unitLabel: string;
  current: number;
  total: number;
  /** Optional past winners by index (0-based), shown in progress chips. */
  winners?: Record<number, string>;
}

export interface SessionInfo {
  roomCode: string;
  /** e.g. "Tonight · 3 games". Shown when no championship is running. */
  sessionLabel?: string;
  championship?: ChampionshipConfig;
  eventName?: string;
}

export interface GameInfo {
  name: string;
  kind: string;
  /** Index into the theme answer palette used as this game's accent (personality). */
  accentIndex?: 0 | 1 | 2 | 3;
}

export interface ReactionEvent {
  id: string;
  playerId: string;
  reaction: ReactionId;
  /** ms timestamp (Date.now()) — used to expire the burst. */
  at: number;
}
