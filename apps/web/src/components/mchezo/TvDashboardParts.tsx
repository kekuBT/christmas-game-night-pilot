// Stage 3 live QA (S3-TV-06): the TV dashboard's view of a game that has no
// dedicated TV stage (Math Mayhem and the rest). Public facts only:
// while playing, the game, its mode, who is in it, the clock and how many
// have started (the same aggregate count the phones show); never scores,
// answers or who has finished (A-19 is still the owner's decision). After
// the finish, the game's own standings, ranked with shared ranks.
import { GameClock, MchezoProvider, themes } from "../../ui/mchezo/index.js";
import { StandingsList } from "../../ui/mchezo/components/Results.js";
import { rankStandings } from "../../ui/mchezo/lib/standings.js";
import { toMzPlayers } from "./adapters.js";
import type { PublicGame, PublicPlayer } from "../../types.js";
import { playerName } from "../../ui/mchezo/lib/names.js";

const HINT: Record<string, string> = {
  "math-mayhem": "Questions appear one at a time on each phone, and each is timed from when the game sends it. Scores appear here when the game ends.",
};

export function TvNowPlaying({ game, title, players }: { game: PublicGame; title: string; players: PublicPlayer[] }) {
  const nameOf = (id: string) => playerName(id, players);
  const started = game.submittedCount ?? 0;
  const total = game.totalPlayers ?? game.players.length;
  return (
    <div data-testid={`tv-live-${game.gameId}`} className="tv-live">
      <p><b>{title}</b> · {game.official ? "Official" : "Practice"} — players: {game.players.map(nameOf).join(", ")}</p>
      <p data-testid="tv-live-progress"><b>{started} of {total}</b> {total === 1 ? "has" : "have"} started · answer on your phones</p>
      {HINT[game.gameId] && <p className="muted">{HINT[game.gameId]}</p>}
      <GameClock game={game} tv />
    </div>
  );
}

export function TvLastStandings({ game, title, players }: { game: PublicGame; title: string; players: PublicPlayer[] }) {
  if (game.status !== "finished" || !game.rawScores) return null;
  const mz = toMzPlayers(players);
  const ranked = rankStandings(Object.entries(game.rawScores).map(([playerId, score]) => ({ playerId, score })), mz);
  if (ranked.length === 0) return null;
  return (
    <MchezoProvider theme={themes.everyday} as="bare">
      <section data-testid="tv-last-standings" aria-label={`${title} standings`}>
        <h3>{title}: final standings{game.official ? "" : " (practice)"}</h3>
        <StandingsList ranked={ranked} youId="" players={mz} limit={ranked.length} />
      </section>
    </MchezoProvider>
  );
}
