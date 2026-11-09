// Tournament Studio preview (Milestone I) — host-only, preview-only.
// The host picks a format preset and a round count and sees the schedule
// the engine would produce. Nothing here starts a game, scores anything,
// saves anything, or talks to the server: the schedule is computed
// client-side from manifests, the connected-player count, and the room's
// game history, and the view says so on its face. Family Cup rules are
// untouched and no tournament scoring is active.
import { useMemo, useState } from "react";
import { PhoneScreen } from "../../ui/mchezo/index.js";
import { GAME_MANIFESTS } from "../../../../../src/games/manifest.js";
import {
  configFromPreset,
  presetFor,
  scheduleTournament,
  TOURNAMENT_PRESETS,
  type TournamentFormat,
} from "../../../../../src/games/tournament.js";

interface StudioProps {
  playerCount: number;
  recentIds: string[];
  onBack: () => void;
  /** Host or cohost (S3-STU-02): Studio is a host tool; guests are told so. */
  canUse?: boolean;
}

/** The games a format draws from, whatever the room size (S3-STU-01). */
function formatGames(playStyle: "solo" | "team" | undefined) {
  return GAME_MANIFESTS.filter((m) => !playStyle || m.playStyle === playStyle);
}

export function MchezoStudio({ playerCount, recentIds, onBack, canUse = true }: StudioProps) {
  if (!canUse) {
    return (
      <PhoneScreen label="Tournament Studio preview">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" className="mz-chip-btn" data-testid="mz-studio-back" onClick={onBack}>← Back to lobby</button>
          <span className="mz-kicker">Tournament Studio</span>
        </div>
        <div className="mz-card" style={{ marginTop: 16 }} data-testid="studio-host-only">
          <p style={{ margin: 0 }}><strong>Studio is a host tool.</strong></p>
          <p className="mz-foot" style={{ margin: "6px 0 0", textAlign: "left" }}>The host can use it to preview a schedule of several games. It's a preview only: nothing is started or scored. Ask the host if you'd like a tournament night.</p>
        </div>
      </PhoneScreen>
    );
  }
  return <StudioPlanner playerCount={playerCount} recentIds={recentIds} onBack={onBack} />;
}

function StudioPlanner({ playerCount, recentIds, onBack }: StudioProps) {
  const [format, setFormat] = useState<TournamentFormat>("points-league");
  const [rounds, setRounds] = useState(presetFor("points-league").rounds);
  const [seed, setSeed] = useState(() => Date.now());
  const preset = presetFor(format);
  const schedule = useMemo(
    () => scheduleTournament(configFromPreset(format, { playerCount, seed, rounds, recentIds })),
    [format, playerCount, seed, rounds, recentIds],
  );

  const pickFormat = (f: TournamentFormat) => {
    setFormat(f);
    setRounds(presetFor(f).rounds);
  };

  return (
    <PhoneScreen label="Tournament Studio preview">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="mz-chip-btn" data-testid="mz-studio-back" onClick={onBack}>← Back to lobby</button>
        <span className="mz-kicker">Tournament Studio</span>
      </div>
      <p className="mz-foot" data-testid="studio-preview-note">Preview only — this schedule is not scored, not saved, and not sent to the server.</p>

      <div style={{ marginTop: 12 }} role="group" aria-label="Tournament format">
        <p className="mz-foot" style={{ margin: "0 0 6px" }}>Format</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TOURNAMENT_PRESETS.map((p) => (
            <button key={p.format} type="button" className="mz-chip-btn" data-testid={`studio-format-${p.format}`} aria-pressed={format === p.format} onClick={() => pickFormat(p.format)}>{p.label}</button>
          ))}
        </div>
      </div>
      <p className="mz-foot" style={{ marginTop: 8 }}>{preset.description}</p>

      <div style={{ marginTop: 12 }}>
        <label className="mz-foot" htmlFor="mz-studio-rounds-input">Rounds</label>
        <input
          id="mz-studio-rounds-input"
          className="mz-input"
          data-testid="studio-rounds"
          type="number"
          min={1}
          max={20}
          value={rounds}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            setRounds(Number.isNaN(v) ? 1 : Math.min(20, Math.max(1, v)));
          }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="mz-chip-btn" data-testid="studio-generate" onClick={() => setSeed(Date.now())}>Regenerate schedule</button>
      </div>
      <p className="mz-foot" style={{ marginTop: 8 }} data-testid="studio-player-count">Scheduled for {playerCount} {playerCount === 1 ? "player" : "players"}.</p>

      {schedule.ok ? (
        <div style={{ marginTop: 8 }} data-testid="studio-preview">
          {schedule.rounds.map((r) => (
            <article key={r.round} className="mz-card" style={{ marginTop: 12 }} data-testid={`studio-round-${r.round}`}>
              <p style={{ margin: "0 0 4px" }}><strong>Round {r.round}</strong></p>
              {r.games.map((g, i) => (
                <div key={`${g.gameId}-${i}`} style={{ marginTop: 6 }}>
                  <p style={{ margin: 0 }}>{g.title}</p>
                  <p className="mz-foot" style={{ margin: 0 }}>{g.explanation}</p>
                </div>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <div className="mz-card" style={{ marginTop: 16 }} data-testid="studio-infeasible">
          {schedule.reason === "no-eligible-games" ? (
            <>
              <p style={{ margin: 0 }}>No games fit this format for {playerCount} {playerCount === 1 ? "player" : "players"}.</p>
              {(() => {
                const pool = formatGames(preset.playStyle);
                return pool.length > 0 && (
                  <p className="mz-foot" style={{ margin: "6px 0 0", textAlign: "left" }} data-testid="studio-infeasible-why">
                    {preset.label} uses {preset.playStyle === "team" ? "team games" : preset.playStyle === "solo" ? "individual games" : "these games"}: {pool.map((m) => `${m.title} (${m.minPlayers}–${m.maxPlayers} players)`).join(", ")}. {pool.every((m) => playerCount < m.minPlayers) ? "Invite more players, or pick another format." : "Pick another format for this group."}
                  </p>
                );
              })()}
            </>
          ) : (
            <p>Only {schedule.eligible} games fit, but {schedule.requested} slots were requested. Reduce rounds or widen the format.</p>
          )}
        </div>
      )}
      <p className="mz-foot" style={{ marginTop: 16 }}>Family Cup rules are unchanged. Tournament scoring is not active in this preview.</p>
    </PhoneScreen>
  );
}
