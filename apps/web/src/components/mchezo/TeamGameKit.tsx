/**
 * Stage 12.10 (docs/stage12/stage1210.md §1; D-S1210-01): pieces shared by the games built for teams of Stages
 * 12.10–12.14 (Split Clues, Team Draw, Territory, Tug of War, Know Your Rivals).
 *
 *   TeamScoreboard  each team's mark, name, total and an optional status; a list on phones, a row (2–3 teams) or a
 *                   2 × 2 grid (4 teams) on the TV. Colour is never the only cue: every team has its mark and name.
 *   TeamLabel       "You're on Team Coral" with the team's mark.
 *   useServerNow    the server's clock, re-estimated every 250 ms (for countdowns the server decides).
 *   teamDef         a team's definition from the game's teams.
 */
import { useEffect, useState, type ReactNode } from "react";
import { serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { TeamMark } from "./Teams.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";

export const teamDef = (game: { teams?: { list: TeamDef[] } }, id?: string | null): TeamDef | undefined => (id ? game.teams?.list.find((t) => t.id === id) : undefined);

export function useServerNow(ms = 250): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => { const t = setInterval(() => setNow(serverNowEstimate()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function TeamLabel({ game, teamId, testId }: { game: { teams?: { list: TeamDef[] } }; teamId?: string; testId: string }) {
  const t = teamDef(game, teamId);
  if (!t) return null;
  return <span className="mz-hd-you" data-testid={testId}><TeamMark color={t.color} /> You’re on <b>{t.name}</b></span>;
}

export interface TeamScoreRow { teamId: string; score: number }

/** Each team's total (in the order given), with an optional status line per team. */
export function TeamScoreboard({ game, totals, mine, status, tv, testId, label = "Scores" }: {
  game: { teams?: { list: TeamDef[] } }; totals: readonly TeamScoreRow[]; mine?: string;
  status?: (teamId: string) => ReactNode; tv?: boolean; testId: string; label?: string;
}) {
  return (
    <section className={`mz-tsb${tv ? " mz-tsb--tv" : ""}`} aria-label={label} data-testid={testId} data-teams={totals.length}>
      <ul className="mz-tsb__list">
        {totals.map((row) => {
          const def = teamDef(game, row.teamId);
          const st = status?.(row.teamId);
          return (
            <li key={row.teamId} className={`mz-tsb__team mz-team--${def?.color ?? "coral"}${row.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${row.teamId}`} data-score={row.score}>
              {def && <TeamMark color={def.color} />}
              <span className="mz-tsb__text"><b>{def?.name ?? "A team"}{row.teamId === mine ? <span className="mz-tsb__you"> · you</span> : null}</b>{st ? <span>{st}</span> : null}</span>
              <span className="mz-tsb__score" aria-label={`${row.score} points`}>{row.score.toLocaleString("en-US")}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th"];

/**
 * Stage 12.15 (D-S1215-01): how a finished team game counted, for its results. A team game can be Official in a Family
 * Cup now, so "not casual" no longer means "practice".
 */
export function teamGameModeLine(casual: boolean, official: boolean | undefined): string {
  if (casual) return "Casual game: just for fun.";
  return official ? "Official game: it counts toward the Cup as a team game, and your team’s place counts for everyone on it." : "Practice game: no Cup points.";
}
export const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}th`;
