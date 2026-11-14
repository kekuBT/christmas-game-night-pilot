/**
 * Stage 12.7 (docs/stage12/stage127.md): teams for the night, on the phones and the TV.
 *
 *   TeamsCard        the lobby: who's on which team (everyone), "Make teams" / "Edit teams" and Play as teams (host)
 *   TeamsSheet       the host's sheet: how many teams, shuffle, move someone, rename, no teams
 *   TeamResultsCard  a game played as teams: the team results under the result heading
 *   TvTeamsCard, TvTeamResults   the TV lobby's teams (with tonight's team wins) and a team game's final
 *
 * Every fact comes from the server (src/shared/teams.ts has the rules); colour is never the only cue: each team has
 * its name, and a shape.
 */
import { useState } from "react";
import { Keycap, Sheet, SegmentedChoice } from "../../ui/mchezo/index.js";
import { TEAM_LIMITS, TEAM_PLAY_GAMES, teamWinnerLine, teamWins, type RoomTeams, type TeamColor, type TeamDef, type TeamResultRow } from "../../../../../src/shared/teams.js";
import type { PublicGame, PublicPlayer } from "../../types.js";

/** Each team's mark: a shape as well as a colour (never colour alone). */
const SHAPE: Record<TeamColor, string> = { coral: "▲", sun: "●", mint: "■", iris: "◆" };

export function TeamMark({ color }: { color: TeamColor }) {
  return <span className={`mz-team-mark mz-team-mark--${color}`} aria-hidden="true">{SHAPE[color]}</span>;
}

const list = (names: readonly string[]) => names.length <= 1 ? names.join("") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

function membersOf(teams: Pick<RoomTeams, "members">, teamId: string, order: readonly string[]): string[] {
  return order.filter((id) => teams.members[id] === teamId);
}

/** The lobby's Teams card (casual rooms). */
export function TeamsCard({ teams, players, youId, isHost, upNextId, onEdit, onPlay, busy }: {
  teams: RoomTeams | undefined;
  players: readonly PublicPlayer[];
  youId: string;
  isHost: boolean;
  upNextId?: string;
  onEdit: () => void;
  onPlay: (on: boolean) => void;
  busy?: boolean;
}) {
  if (!teams) {
    if (!isHost) return null;
    return (
      <section className="mz-teams-card" aria-label="Teams" data-testid="teams-card" data-state="none">
        <span className="mz-kicker">👥 Teams</span>
        <p className="mz-teams-card__lede">Split the room into teams for the night. {TEAM_PLAY_GAMES.size} games can be played as teams: each team scores its players’ average, so a small team can win.</p>
        <Keycap variant="surface" size="md" data-testid="teams-make" onClick={onEdit}>Make teams</Keycap>
      </section>
    );
  }
  const order = players.map((p) => p.id);
  const nameOf = (id: string) => (id === youId ? "You" : players.find((p) => p.id === id)?.displayName ?? "A player");
  const mine = teams.members[youId];
  const paused = teams.paused === true;
  const nextIsTeam = upNextId ? TEAM_PLAY_GAMES.has(upNextId) : undefined;
  return (
    <section className="mz-teams-card" aria-label="Teams" data-testid="teams-card" data-state={paused ? "paused" : "on"}>
      <span className="mz-kicker">👥 Teams{paused ? " · playing individually for now" : ""}</span>
      {mine && <p className="mz-teams-card__you" data-testid="teams-you">You’re on <b>{teams.list.find((t) => t.id === mine)?.name}</b>.</p>}
      <ul className="mz-teams-list">
        {teams.list.map((t) => (
          <li key={t.id} className={`mz-teams-list__row mz-team--${t.color}${t.id === mine ? " is-mine" : ""}`} data-testid={`teams-row-${t.id}`}>
            <TeamMark color={t.color} />
            <span className="mz-teams-list__text"><b>{t.name}</b><span className="mz-foot" style={{ textAlign: "left" }}>{list(membersOf(teams, t.id, order).map(nameOf)) || "Nobody yet"}</span></span>
          </li>
        ))}
      </ul>
      {nextIsTeam !== undefined && !paused && (
        <p className="mz-foot mz-teams-card__next" data-testid="teams-next">{nextIsTeam ? "The next game is played as teams." : "The next game can’t be played as teams, so everyone plays for themselves."}</p>
      )}
      {isHost && (
        <div className="mz-teams-card__actions">
          <Keycap variant="surface" size="md" data-testid="teams-edit" onClick={onEdit}>Edit teams</Keycap>
          <button type="button" className="mz-chip-btn" data-testid="teams-play-toggle" disabled={busy} aria-pressed={!paused} onClick={() => onPlay(paused)}>{paused ? "Play as teams again" : "Play the next games individually"}</button>
        </div>
      )}
    </section>
  );
}

/** The host's teams sheet. Every change goes to the server; the sheet shows what it says back. */
export function TeamsSheet({ teams, players, onMake, onMove, onRename, onClear, onClose, error, busy }: {
  teams: RoomTeams | undefined;
  players: readonly PublicPlayer[];
  onMake: (count: number) => void;
  onMove: (playerId: string, teamId: string) => void;
  onRename: (teamId: string, name: string) => void;
  onClear: () => void;
  onClose: () => void;
  error?: string;
  busy?: boolean;
}) {
  const [count, setCount] = useState(teams?.list.length ?? 2);
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const max = Math.max(TEAM_LIMITS.min, Math.min(TEAM_LIMITS.max, players.length));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "A player";
  return (
    <Sheet title="Teams" onClose={onClose} testId="teams-sheet" kicker="For the whole night">
      <p className="mz-details__pitch">Teams play the games that can be played as teams. Each team scores its players’ average. A Family Cup stays individual.</p>
      <SegmentedChoice label="How many teams" value={String(count)} onChange={(v) => setCount(Number(v))} testId="teams-count" compact
        options={[2, 3, 4].map((n) => ({ value: String(n), title: `${n} teams`, testId: `teams-count-${n}`, disabled: n > max }))} />
      <div className="mz-sheet__actions">
        <Keycap block disabled={busy || count > players.length} onClick={() => onMake(count)} data-testid="teams-shuffle">{teams ? (teams.list.length === count ? "Shuffle the teams" : `Make ${count} teams`) : `Make ${count} teams`}</Keycap>
      </div>
      {count > players.length && <p className="mz-foot" data-testid="teams-too-few">{count} teams need at least {count} players in the room.</p>}
      {error ? <p className="err" role="alert" data-testid="teams-error">{error}</p> : null}
      {teams && (
        <div className="mz-teams-edit" data-testid="teams-edit-list">
          {teams.list.map((t) => (
            <section key={t.id} className={`mz-teams-edit__team mz-team--${t.color}`} data-testid={`teams-edit-${t.id}`}>
              <label className="mz-teams-edit__name">
                <TeamMark color={t.color} />
                <input className="mz-input" value={names[t.id] ?? t.name} maxLength={TEAM_LIMITS.name} aria-label={`Name of ${t.name}`} data-testid={`teams-name-${t.id}`}
                  onChange={(e) => setNames((n) => ({ ...n, [t.id]: e.target.value }))}
                  onBlur={() => { const v = names[t.id]; if (v !== undefined && v.trim() && v.trim() !== t.name) onRename(t.id, v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </label>
              <ul className="mz-teams-edit__members">
                {players.filter((p) => teams.members[p.id] === t.id).map((p) => (
                  <li key={p.id} data-testid={`teams-member-${p.id}`}>
                    <span className="mz-teams-edit__who">{nameOf(p.id)}</span>
                    <span className="mz-teams-edit__move" role="group" aria-label={`Move ${nameOf(p.id)} to`}>
                      <span className="mz-teams-edit__to" aria-hidden="true">Move to</span>
                      {teams.list.filter((o) => o.id !== t.id).map((o) => (
                        <button key={o.id} type="button" className={`mz-chip-btn mz-team-move mz-team--${o.color}`} disabled={busy} data-testid={`teams-move-${p.id}-${o.id}`} aria-label={`Move ${nameOf(p.id)} to ${o.name}`} onClick={() => onMove(p.id, o.id)}>
                          <TeamMark color={o.color} />
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
                {players.every((p) => teams.members[p.id] !== t.id) && <li className="mz-foot">Nobody yet</li>}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="mz-sheet__actions">
        {teams && (confirmClear
          ? <><button type="button" className="mz-chip-btn mz-chip-btn--danger" disabled={busy} data-testid="teams-clear-confirm" onClick={() => { setConfirmClear(false); onClear(); }}>Yes, no teams</button><button type="button" className="mz-chip-btn" onClick={() => setConfirmClear(false)}>Keep the teams</button></>
          : <button type="button" className="mz-chip-btn" data-testid="teams-clear" onClick={() => setConfirmClear(true)}>No teams tonight</button>)}
        <button type="button" className="mz-chip-btn" data-testid="teams-close" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

/** A team game's results, for a phone's results screen. */
export function TeamResultsCard({ rows, youId, nameOf }: { rows: readonly TeamResultRow[]; youId?: string; nameOf: (id: string) => string }) {
  const winner = teamWinnerLine(rows);
  return (
    <section className="mz-teams-results" aria-label="Team results" data-testid="team-results">
      <span className="mz-kicker">👥 Played as teams</span>
      {winner && <p className="mz-teams-results__winner" data-testid="team-winner">{winner === "Every team tied" ? "Every team tied!" : `🏆 ${winner}!`}</p>}
      <ol className="mz-teams-results__list">
        {rows.map((r) => (
          <li key={r.teamId} className={`mz-team--${r.color}${youId && r.members.includes(youId) ? " is-mine" : ""}`} data-testid={`team-result-${r.teamId}`} data-rank={r.rank ?? ""}>
            <span className="mz-teams-results__rank">{r.rank ?? "–"}</span>
            <TeamMark color={r.color} />
            <span className="mz-teams-results__text"><b>{r.name}</b><span className="mz-foot" style={{ textAlign: "left" }}>{list(r.members.map((id) => (id === youId ? "you" : nameOf(id))))}</span></span>
            <span className="mz-teams-results__score">{r.score === null ? "didn’t play" : <>{r.score.toLocaleString("en-US")}<small> average</small></>}</span>
          </li>
        ))}
      </ol>
      <p className="mz-foot">A team’s score is the average of its players who took part, so a small team can win.</p>
    </section>
  );
}

/** The TV lobby's teams, with tonight's team wins. */
export function TvTeamsCard({ teams, games, players }: { teams: RoomTeams; games: readonly PublicGame[]; players: readonly PublicPlayer[] }) {
  const wins = teamWins(games, teams.list);
  const any = wins.some((w) => w.played > 0);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "A player";
  const order = players.map((p) => p.id);
  return (
    <section className="mz-tvshow-card mz-tvteams" data-testid="tv-teams">
      <span className="mz-tv-kicker">Teams{teams.paused ? " · playing individually for now" : ""}</span>
      <ul className="mz-tvteams__list">
        {(any ? wins.map((w) => teams.list.find((t) => t.id === w.teamId)!) : teams.list).map((t: TeamDef) => {
          const w = wins.find((x) => x.teamId === t.id)!;
          return (
            <li key={t.id} className={`mz-team--${t.color}`} data-testid={`tv-team-${t.id}`}>
              <TeamMark color={t.color} />
              <span className="mz-tvteams__text"><b>{t.name}</b><small>{list(membersOf(teams, t.id, order).map(nameOf))}</small></span>
              {any && <span className="mz-tvteams__wins">{w.wins} {w.wins === 1 ? "win" : "wins"}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A team game's final on the TV: each team's average (the headline above already names the winning team). */
export function TvTeamResults({ rows, nameOf }: { rows: readonly TeamResultRow[]; nameOf: (id: string) => string }) {
  return (
    <section className="mz-tvshow-card mz-tvteams" data-testid="tv-team-results">
      <span className="mz-tv-kicker">Played as teams · each team’s average</span>
      <ol className="mz-tvteams__list">
        {rows.map((r) => (
          <li key={r.teamId} className={`mz-team--${r.color}`} data-rank={r.rank ?? ""}>
            <TeamMark color={r.color} />
            <span className="mz-tvteams__text"><b>{r.name}</b><small>{list(r.members.map(nameOf))}</small></span>
            <span className="mz-tvteams__wins">{r.score === null ? "—" : r.score.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
