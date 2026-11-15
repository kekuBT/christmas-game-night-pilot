/**
 * The lobby's "last game" summary (S5-B; Stage 9.3; Stage 12.15-R): the room's last finished game, for everyone, from
 * recorded results only. Pure, so it is unit-tested (tests/stage1215r-repairs.test.ts).
 *
 *  - A cooperative game (Stage 9.3): its one team result, never a winner or a place.
 *  - A game played by teams (Stage 12.15-R, review 6888718011 R6): the headline and "your" line are about the teams,
 *    from the server's team results ("Your team, Team Sun, won"), never teammates as tied players.
 *  - Every other game: the winner line and your place from the recorded scores.
 */
import type { TeamResultRow } from "../../../../../../src/shared/teams.js";
import { ordinal } from "./standings.js";
import { resultLine } from "./tvfeed.js";

export interface LastGameInput {
  players: readonly string[];
  rawScores?: Record<string, number>;
  outcome?: { team?: { total: number; max: number } } | null;
  teams?: { members: Record<string, string> };
  teamResults?: readonly TeamResultRow[];
}

export function lastGameSummary(g: LastGameInput, playerId: string | null | undefined, nameOf: (id: string) => string): { headline: string; yourLine?: string } {
  const inIt = !!playerId && g.players.includes(playerId);
  const headline = resultLine(g, nameOf);
  if (g.outcome?.team) return { headline, yourLine: inIt ? "You played on the team." : "You weren’t in this one." };
  if (!inIt) return { headline, yourLine: "You weren’t in this one." };
  const scored = (g.teamResults ?? []).filter((r) => r.score !== null && r.rank !== null);
  const myTeam = playerId ? g.teams?.members[playerId] : undefined;
  if (scored.length > 0 && myTeam !== undefined) {
    const row = (g.teamResults ?? []).find((r) => r.teamId === myTeam);
    if (!row) return { headline };
    if (row.score === null || row.rank === null) return { headline, yourLine: `Your team, ${row.name}, didn’t score.` };
    const sharing = scored.filter((r) => r.rank === row.rank).length > 1;
    const allTied = scored.length > 1 && scored.every((r) => r.rank === 1);
    const place = allTied ? "tied with every team"
      : row.rank === 1 ? (sharing ? "tied for first" : "won")
      : `${sharing ? "tied for" : "came"} ${ordinal(row.rank)} of ${scored.length}`;
    return { headline, yourLine: `Your team, ${row.name}, ${place} · ${row.score} points.` };
  }
  const scores = g.rawScores ?? {};
  const mine = playerId ? scores[playerId] : undefined;
  if (mine === undefined) return { headline };
  const n = Object.keys(scores).length;
  const rank = 1 + Object.values(scores).filter((v) => v > mine).length;
  const tied = Object.values(scores).filter((v) => v === mine).length > 1;
  return { headline, yourLine: n <= 1 ? `You played solo: ${mine} points.` : `You ${tied ? "tied for" : "came"} ${ordinal(rank)} of ${n} · ${mine} points.` };
}
