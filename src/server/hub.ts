import type { RoomEngine } from "./room.js";
import type { ChampionshipResult } from "../scoring/ledger.js";

/** TV Christmas Hub — public only. Built from room.project("tv"), never from private state. */
export interface HubView {
  roomName: string;
  joinCode: string;
  players: { id: string; displayName: string; connected: boolean }[];
  standings: { playerId: string; displayName: string; base: number; total: number; eligible: boolean }[];
  recentGames: { id: string; gameId: string; status: string }[];
  nextGame: string | null;
  highlights: string[];
}

export function buildHub(room: RoomEngine, standings: ChampionshipResult[] = [], highlights: string[] = []): HubView {
  const tv = room.project("tv") as {
    name: string;
    joinCode: string;
    players: { id: string; displayName: string; connected: boolean }[];
    games: { id: string; gameId: string; status: string }[];
  };
  const nameById = new Map(tv.players.map((p) => [p.id, p.displayName]));
  return {
    roomName: tv.name,
    joinCode: tv.joinCode,
    players: tv.players,
    standings: standings.map((s) => ({ playerId: s.playerId, displayName: nameById.get(s.playerId) ?? s.playerId, base: s.total, total: s.total, eligible: s.eligible })),
    recentGames: tv.games.slice(-5),
    nextGame: null,
    highlights,
  };
}
