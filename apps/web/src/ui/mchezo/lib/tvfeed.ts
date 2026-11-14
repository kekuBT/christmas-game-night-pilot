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
import type { Ceremony, PartyView, Projection, PublicGame, PublicPlayer, SessionView } from "../../../types.js";

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
  /** Stage 7.2: a casual room (games are Casual), its lineup and its break: public planning facts. */
  casual?: boolean;
  party?: PartyView;
  session?: SessionView;
  /** Stage 8.2: what this casual room deals (public; never a device's look). */
  contentSeason?: "everyday" | "christmas";
  /** Stage 12.1: a Family Cup room (created as one, or a casual room made into one). */
  cup?: boolean;
  /** Stage 12.1: the server's end-of-day ceremony for the Cup's current day (public: names and day scores). */
  ceremony?: Ceremony;
  /** Stage 12.1 (D-S121-02): when a casual room became this Cup, and the games it played while casual (public ids). */
  cupSince?: { at: number; seq: number };
  casualGameIds?: string[];
}

/**
 * A game's mode word: Official, Casual (a casual room's games, and a Cup room's games from before it was a Cup)
 * or Practice (a Cup's practice game).
 */
export function gameModeWord(g: { id: string; official?: boolean }, feed: Pick<TvFeed, "casual" | "casualGameIds">): "Official" | "Casual" | "Practice" {
  if (g.official) return "Official";
  return feed.casual || (feed.casualGameIds ?? []).includes(g.id) ? "Casual" : "Practice";
}

/** Stage 7.2: what comes next in a casual room, in one public line (the TV, the final screen). */
export function lineupLine(feed: Pick<TvFeed, "party" | "session">, titleOf: (id: string) => string): { kind: "break" | "next" | "complete"; text: string } | null {
  if (feed.session?.onBreak) return { kind: "break", text: "On a break. The host resumes when everyone’s back." };
  const l = feed.party?.lineup;
  if (!l || l.items.length === 0) return null;
  if (l.complete) return { kind: "complete", text: "That was the whole lineup. The host picks what’s next." };
  const n = l.next ?? null;
  if (n === null) return null; // an item is on now
  // Stage 12.3: a Family Cup's lineup says each game's mode.
  const mode = l.items[n]!.official === undefined ? "" : ` · ${l.items[n]!.official ? "Official" : "Practice"}`;
  return { kind: "next", text: `Next up: ${titleOf(l.items[n]!.gameId)}${mode} · game ${n + 1} of ${l.items.length}. The host starts it.` };
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
    ...(p.roomKind === "casual" ? { casual: true, ...(p.party ? { party: p.party } : {}), ...(p.session ? { session: p.session } : {}), ...(p.contentSeason ? { contentSeason: p.contentSeason } : {}) } : {}),
    ...(p.roomKind === "cup" ? { cup: true, ...(p.ceremony ? { ceremony: p.ceremony } : {}), ...(p.cupSince ? { cupSince: p.cupSince, casualGameIds: p.casualGameIds ?? [] } : {}), ...(p.party?.lineup ? { party: p.party } : {}) } : {}),
  };
}

/** What the TV is showing: one unmistakable label at all times. */
export type TvMode = "lobby" | "briefing" | "live" | "final" | "review" | "cup" | "trophy";
/** What the operator (or the TV itself, when a Cup day ends) chose to show between games. */
export type TvChoice = "auto" | "lobby" | "final" | "review" | "cup" | "trophy";

export const TV_MODE_LABEL: Record<TvMode, string> = {
  lobby: "Lobby",
  briefing: "Getting ready",
  live: "Live",
  final: "Final standings",
  review: "Post-game review",
  cup: "Family Cup",
  trophy: "Day complete",
};

/**
 * The TV's mode, from the latest game and the operator's local choice.
 * A finished game opens on its final standings; "review" is only ever
 * offered for a finished game, so a look back can never be mistaken for
 * play. A briefing or a game in play always wins over a local choice:
 * the operator can't hide a live game behind an old screen.
 * Stage 12.1: between games, the Cup's standings ("cup") and a day's trophy ("trophy") can be shown too.
 */
export function tvModeFor(latest: PublicGame | undefined, choice: TvChoice): TvMode {
  if (latest?.status === "briefing") return "briefing";
  if (latest?.status === "playing") return "live";
  if (choice === "cup" || choice === "trophy") return choice;
  if (!latest) return "lobby";
  if (latest.status === "finished") return choice === "lobby" ? "lobby" : choice === "review" ? "review" : "final";
  return "lobby";
}

/**
 * Stage 9.3: the headline for any finished game. A cooperative game has one
 * team result (outcome.team) and never a winner; every other game keeps its
 * winner line from the recorded scores.
 */
export function resultLine(game: { rawScores?: Record<string, number>; outcome?: { team?: { total: number; max: number } } }, nameOf: (id: string) => string): string {
  const team = game.outcome?.team;
  if (team) return `Team result: ${team.total} out of ${team.max}`;
  return winnerLine(game.rawScores, nameOf);
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
