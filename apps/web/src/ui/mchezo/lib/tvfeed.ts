/**
 * Stage 5 (S5-A): what the TV may know.
 *
 * The TV show is drawn from this feed and nothing else. It copies only the
 * room's PUBLIC facts out of a projection: the join code, the public player
 * list, the public game list (the server's public projection of every game:
 * no secret words, no private answers, no answer that can still be played),
 * the Cup standings, the day, the host's plan for the next game and the
 * spectator count. A player's own projection also carries `me` and
 * `myGames` (their private state); those never enter the feed, so a TV
 * opened on a player's phone can't show that player's secrets either.
 */
import type { Projection, PublicGame, PublicPlayer } from "../../../types.js";

export interface TvFeed {
  roomId: string;
  joinCode?: string;
  players: PublicPlayer[];
  games: PublicGame[];
  championship: NonNullable<Projection["championship"]>;
  championshipDay?: number;
  upNext?: { gameId: string; official: boolean };
  spectatorCount?: number;
  cupLabel?: string;
}

export function tvFeedFrom(p: Projection): TvFeed {
  return {
    roomId: p.roomId,
    joinCode: p.joinCode,
    players: p.players,
    games: p.games,
    championship: p.championship ?? [],
    championshipDay: p.championshipDay,
    upNext: p.upNext,
    spectatorCount: p.spectatorCount,
    cupLabel: p.competition?.label,
  };
}

/** What the TV is showing: one unmistakable label at all times. */
export type TvMode = "lobby" | "briefing" | "live" | "final" | "review";

export const TV_MODE_LABEL: Record<TvMode, string> = {
  lobby: "Lobby",
  briefing: "Getting ready",
  live: "Live",
  final: "Final standings",
  review: "Post-game review",
};

/**
 * The TV's mode, from the latest game and the operator's local choice.
 * A finished game opens on its final standings; "review" is only ever
 * offered for a finished game, so a look back can never be mistaken for
 * play. A briefing or a game in play always wins over a local choice:
 * the operator can't hide a live game behind an old screen.
 */
export function tvModeFor(latest: PublicGame | undefined, choice: "auto" | "lobby" | "final" | "review"): TvMode {
  if (!latest) return "lobby";
  if (latest.status === "briefing") return "briefing";
  if (latest.status === "playing") return "live";
  if (latest.status === "finished") return choice === "lobby" ? "lobby" : choice === "review" ? "review" : "final";
  return "lobby";
}

/** The headline for a finished game, from its recorded scores only. */
export function winnerLine(scores: Record<string, number> | undefined, nameOf: (id: string) => string): string {
  const entries = Object.entries(scores ?? {});
  if (entries.length === 0) return "No scores were recorded";
  const top = Math.max(...entries.map(([, v]) => v));
  const winners = entries.filter(([, v]) => v === top).map(([id]) => nameOf(id));
  if (entries.length > 1 && winners.length === entries.length) return top === 0 ? "Nobody scored this time" : "Everyone tied";
  if (winners.length === 1) return `${winners[0]} wins`;
  const list = winners.length === 2 ? `${winners[0]} and ${winners[1]}` : `${winners.slice(0, -1).join(", ")} and ${winners.at(-1)}`;
  return `${list} tie for first`;
}
