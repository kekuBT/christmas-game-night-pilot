/**
 * Review 6890761957: the TV's final standings, rendered. The real TvFinal (the screen a finished game opens on) is
 * rendered to markup and its "final standings" list read back: each row's place, name, team and points.
 *
 * - A game built for teams lists every player at their team's place from the server's team results (Relay's 150/50/50
 *   with places 1, 2, 3 is 1, 1, 2, 3, never 1, 1, 3, 3), with the team named. A true tie still shares a place.
 * - Every other game ranks by points, as before: an individual game, and a per-player game played as teams (whose
 *   players' own points are real).
 * - The list's label gives the game's mode as it was played: Casual for a game from before the room became a Cup,
 *   Practice and Official for the Cup's own games.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TvFinal } from "./TvShow.js";
import { teamResults, type GameTeams } from "../../../../../src/shared/teams.js";
import type { TvFeed } from "../../ui/mchezo/lib/tvfeed.js";
import type { PublicGame, PublicPlayer } from "../../types.js";

const player = (id: string, displayName: string): PublicPlayer => ({ id, displayName, avatar: "🙂", isHost: id === "p1", isCohost: false, connected: true });
const PLAYERS = [player("p1", "Audit Host"), player("p2", "Audit Sun"), player("p3", "Audit Coral"), player("p4", "Audit Mint")];
const TEAMS: GameTeams = {
  list: [{ id: "sun", name: "Team Sun", color: "sun" }, { id: "coral", name: "Team Coral", color: "coral" }, { id: "mint", name: "Team Mint", color: "mint" }],
  members: { p1: "coral", p2: "coral", p3: "sun", p4: "mint" },
};

function feedOf(over: Partial<TvFeed> = {}): TvFeed {
  return { roomId: "room-1", players: PLAYERS, games: [], championship: [], ...over };
}

function gameOf(over: Partial<PublicGame> & { gameId: string; rawScores: Record<string, number> }): PublicGame {
  return { id: "g1", official: false, status: "finished", timedOut: false, players: Object.keys(over.rawScores), ...over } as PublicGame;
}

/** The rendered "final standings" list: one row per player, in screen order. */
function standings(game: PublicGame, feed: TvFeed = feedOf()) {
  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.displayName ?? id;
  const html = renderToStaticMarkup(<TvFinal game={game} title="Relay" feed={feed} nameOf={nameOf} titleOf={(id) => id} paused />);
  const section = /<section[^>]*data-testid="tv-last-standings"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
  const text = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").trim();
  const kicker = text(/<span class="mz-tv-kicker">([\s\S]*?)<\/span>/.exec(section)?.[1] ?? "");
  const rows = [...section.matchAll(/<li[^>]*data-rank="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map(([, dataRank, li]) => ({
    dataRank,
    rank: text(/<span class="mz-tvlist__rank">([\s\S]*?)<\/span>/.exec(li!)?.[1] ?? ""),
    team: text(/<span class="mz-tvlist__team">([\s\S]*?)<\/span>/.exec(li!)?.[1] ?? "").replace(/^·\s*/, ""),
    name: text((/<span class="mz-tvlist__name">([\s\S]*?)<\/span>(?:<\/span>)?<span class="mz-tvlist__val">/.exec(li!)?.[1] ?? "").replace(/<span class="mz-tvlist__team">[\s\S]*$/, "")),
    points: text(/<span class="mz-tvlist__val">([\s\S]*?)<\/span>/.exec(li!)?.[1] ?? ""),
  }));
  return { kicker, rows };
}

describe("review 6890761957: the TV's final standings, rendered", () => {
  it("Relay 150/50/50 with places Coral 1, Sun 2, Mint 3: the list reads 1, 1, 2, 3 by team, never 1, 1, 3, 3", () => {
    const rawScores = { p1: 150, p2: 150, p3: 50, p4: 50 };
    // The review's room: Sun and Mint both ran 5 legs, Sun's last leg first, so the server places Sun 2nd and Mint 3rd.
    const game = gameOf({ gameId: "relay", official: true, rawScores, teams: TEAMS, teamResults: teamResults(TEAMS, rawScores, () => true, { coral: 1, sun: 2, mint: 3 }) });
    const { rows } = standings(game, feedOf({ cup: true }));
    expect(rows.map((r) => r.rank)).toEqual(["1", "1", "2", "3"]);
    expect(rows.map((r) => r.dataRank)).toEqual(["1", "1", "2", "3"]);
    expect(rows.map((r) => [r.name, r.team, r.points])).toEqual([
      ["Audit Host", "Team Coral", "150"],
      ["Audit Sun", "Team Coral", "150"],
      ["Audit Coral", "Team Sun", "50"],
      ["Audit Mint", "Team Mint", "50"],
    ]);
  });

  it("a true tie between teams still shares a place: Sun and Mint level with no tiebreak are 2, 2", () => {
    const rawScores = { p1: 150, p2: 150, p3: 50, p4: 50 };
    const game = gameOf({ gameId: "relay", rawScores, teams: TEAMS, teamResults: teamResults(TEAMS, rawScores, () => true, { coral: 1, sun: 2, mint: 2 }) });
    const { rows } = standings(game);
    expect(rows.map((r) => r.rank)).toEqual(["1", "1", "2", "2"]);
    expect(rows.map((r) => r.team)).toEqual(["Team Coral", "Team Coral", "Team Sun", "Team Mint"]);
  });

  it("a game built for teams placed by score (no places recorded) ranks by its team results too", () => {
    const rawScores = { p1: 80, p2: 80, p3: 80, p4: 20 };
    // Tug of War: teammates share their team's score. Coral and Sun level: a true tie for first.
    const game = gameOf({ gameId: "tug-of-war", rawScores, teams: TEAMS, teamResults: teamResults(TEAMS, rawScores, () => true) });
    const { rows } = standings(game);
    expect(rows.map((r) => [r.rank, r.team])).toEqual([["1", "Team Sun"], ["1", "Team Coral"], ["1", "Team Coral"], ["3", "Team Mint"]]);
  });

  it("an individual game ranks by points, as before, with no team named", () => {
    const rawScores = { p1: 150, p2: 150, p3: 50, p4: 50 };
    const { rows } = standings(gameOf({ gameId: "math-mayhem", rawScores }));
    expect(rows.map((r) => r.rank)).toEqual(["1", "1", "3", "3"]);
    expect(rows.every((r) => r.team === "")).toBe(true);
  });

  it("a per-player game played as teams still ranks its players by their own points", () => {
    const rawScores = { p1: 30, p2: 10, p3: 20, p4: 5 };
    const game = gameOf({ gameId: "math-mayhem", rawScores, teams: TEAMS, teamResults: teamResults(TEAMS, rawScores, () => true) });
    const { rows } = standings(game);
    expect(rows.map((r) => [r.rank, r.name, r.team])).toEqual([["1", "Audit Host", ""], ["2", "Audit Coral", ""], ["3", "Audit Sun", ""], ["4", "Audit Mint", ""]]);
  });

  it("the list's label is the game's mode as played: Casual from before the Cup, then Practice and Official", () => {
    const rawScores = { p1: 3, p2: 2 };
    const cupFeed = feedOf({ cup: true, casual: false, casualGameIds: ["g-casual"] });
    expect(standings(gameOf({ id: "g-casual", gameId: "math-mayhem", rawScores }), cupFeed).kicker).toBe("Relay · Casual · final standings");
    expect(standings(gameOf({ id: "g-practice", gameId: "math-mayhem", rawScores }), cupFeed).kicker).toBe("Relay · Practice · final standings");
    expect(standings(gameOf({ id: "g-official", gameId: "math-mayhem", official: true, rawScores }), cupFeed).kicker).toBe("Relay · Official · final standings");
    expect(standings(gameOf({ id: "g-any", gameId: "math-mayhem", rawScores }), feedOf({ casual: true })).kicker).toBe("Relay · Casual · final standings");
  });
});
