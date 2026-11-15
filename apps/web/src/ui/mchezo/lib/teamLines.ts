/**
 * Stage 12.15-R (docs/stage12/stage1215r.md; review 6888718011): two plain lines the team games' screens show, pure so
 * they are unit-tested (tests/stage1215r-recaps.test.ts).
 *  - Relay (D-S1215R-03): teams still out at the time limit with the same legs, ranked apart by who completed their last
 *    leg first.
 *  - Know Your Rivals (D-S1215R-02): the teams that sat a round's guessing out (nobody there answered), neutrally.
 */
import type { TeamResultRow } from "../../../../../../src/shared/teams.js";

const listNames = (names: readonly string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export interface RelayLaneFacts { teamId: string; legs: number; finished: boolean }

/** One plain line when two teams out at the time limit ran the same legs but are ranked apart; otherwise null. */
export function relayTiebreakLine(lanes: readonly RelayLaneFacts[], ranks: readonly Pick<TeamResultRow, "teamId" | "rank">[] | undefined, nameOf: (teamId: string) => string): string | null {
  const rankOf = (id: string) => ranks?.find((r) => r.teamId === id)?.rank ?? null;
  const out = lanes.filter((l) => !l.finished && l.legs > 0);
  for (const a of out) {
    const same = out.filter((b) => b.legs === a.legs).sort((x, y) => (rankOf(x.teamId) ?? 99) - (rankOf(y.teamId) ?? 99));
    if (same.length < 2 || same[0]!.teamId !== a.teamId || rankOf(same[0]!.teamId) === rankOf(same[1]!.teamId)) continue;
    return `${nameOf(same[0]!.teamId)} and ${nameOf(same[1]!.teamId)} both ran ${a.legs} legs; ${nameOf(same[0]!.teamId)} finished its last leg first.`;
  }
  return null;
}

export interface RivalsRoundFacts { counts: readonly { teamId: string; answered: number }[]; sitOut?: readonly string[] }

/** The teams that sat a round's guessing out, in plain words; null when none did. Older results have no sitOut list: their counts tell the same. */
export function sitOutLine(r: RivalsRoundFacts, teamName: (teamId: string) => string): string | null {
  const ids = r.sitOut ?? r.counts.filter((c) => c.answered === 0).map((c) => c.teamId);
  if (ids.length === 0) return null;
  return `${listNames(ids.map(teamName))} said “Rather not say” this time, so there were no guesses for or about ${ids.length === 1 ? "that team" : "those teams"}.`;
}
