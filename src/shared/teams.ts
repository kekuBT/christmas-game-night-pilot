// Stage 12.7 (docs/stage12/stage127.md): teams for the night. Pure: the server decides with these rules, and the phones
// and the TV show the same results from the same facts.
//
// A casual room can split its players into 2–4 named, coloured teams for the night. A game played "as teams" keeps
// every player's own score; each team's score is the AVERAGE of its members who took part, so a team of two can beat a
// team of four. Nothing here is a Cup point: a Family Cup stays individual (D-S127-03, a provisional default).

export const TEAM_LIMITS = { min: 2, max: 4, name: 20 } as const;
export type TeamColor = "coral" | "sun" | "mint" | "iris";
export const TEAM_COLORS: readonly TeamColor[] = ["coral", "sun", "mint", "iris"];
export const TEAM_DEFAULT_NAMES: Record<TeamColor, string> = { coral: "Team Coral", sun: "Team Sun", mint: "Team Mint", iris: "Team Iris" };

export interface TeamDef { id: string; name: string; color: TeamColor }
/** The room's teams: who's on which. `members` maps a player id to a team id. */
export interface RoomTeams {
  revision: number;
  list: TeamDef[];
  members: Record<string, string>;
  /** The host is playing the next games individually for a while (the teams are kept). */
  paused?: true;
}
/** The teams one game was played with, fixed at its start (only that game's players). */
export interface GameTeams { list: TeamDef[]; members: Record<string, string> }

/**
 * The games that can be played as teams: every competitive game scored per player. Not Impostor (its scores are a
 * side's, the impostor's or everyone else's), not Charades (it has its own two teams), not Spectrum (one cooperative
 * team), not a solo round.
 */
export const TEAM_PLAY_GAMES: ReadonlySet<string> = new Set([
  "trivia", "word-connections", "who-said-that", "guess-the-year", "closest-wins", "category-sprint", "geography",
  "math-mayhem", "caption-clash", "majority-rules", "pattern-pulse", "draw-guess", "jebena-rush", "family-questions",
]);

/** A small seeded generator (mulberry32), so a balance is the same on every replay of the same seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** New teams: `count` of them, named and coloured by default. */
export function newTeamList(count: number): TeamDef[] {
  const n = Math.max(TEAM_LIMITS.min, Math.min(TEAM_LIMITS.max, Math.floor(count)));
  return TEAM_COLORS.slice(0, n).map((color) => ({ id: `team-${color}`, name: TEAM_DEFAULT_NAMES[color], color }));
}

/** Everyone, shuffled (seeded) and dealt round the teams, so sizes differ by at most one. */
export function balanceTeams(playerIds: readonly string[], list: readonly TeamDef[], seed: number): Record<string, string> {
  const r = rng(seed);
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const out: Record<string, string> = {};
  order.forEach((pid, i) => { out[pid] = list[i % list.length]!.id; });
  return out;
}

/** The team a newcomer joins: the smallest (counting only `present` players), first in order on a tie. */
export function smallestTeam(teams: Pick<RoomTeams, "list" | "members">, present: readonly string[]): string {
  const size = (id: string) => present.filter((p) => teams.members[p] === id).length;
  return [...teams.list].sort((a, b) => size(a.id) - size(b.id) || teams.list.indexOf(a) - teams.list.indexOf(b))[0]!.id;
}

/** A tidy team name, or why not. */
export function checkTeamName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "Give the team a name." };
  if (name.length > TEAM_LIMITS.name) return { ok: false, error: `Keep a team name to ${TEAM_LIMITS.name} characters.` };
  return { ok: true, name };
}

export interface TeamResultRow {
  teamId: string;
  name: string;
  color: TeamColor;
  /** This game's players on the team. */
  members: string[];
  /** Those who took part (their average is the team's score). */
  counted: string[];
  /** The team's score: the average of `counted`, rounded; null when nobody on it took part. */
  score: number | null;
  /** Shared competition rank among teams with a score (10, 10, 5 → 1, 1, 3); null without a score. */
  rank: number | null;
}

/**
 * One game's team results, best first. A member counts when they took part (`tookPart`, usually: answered at least
 * once); a member who sat it out entirely doesn't pull their team's average down. Ties share a rank. Pure.
 */
export function teamResults(teams: GameTeams, rawScores: Record<string, number> | undefined, tookPart: (playerId: string) => boolean): TeamResultRow[] {
  const rows: TeamResultRow[] = teams.list.map((t) => {
    const members = Object.entries(teams.members).filter(([, tid]) => tid === t.id).map(([pid]) => pid).sort();
    const counted = members.filter((p) => typeof rawScores?.[p] === "number" && tookPart(p));
    const score = counted.length === 0 ? null : Math.round(counted.reduce((s, p) => s + (rawScores![p] ?? 0), 0) / counted.length);
    return { teamId: t.id, name: t.name, color: t.color, members, counted, score, rank: null };
  });
  const scored = rows.filter((r) => r.score !== null).sort((a, b) => b.score! - a.score! || teams.list.findIndex((t) => t.id === a.teamId) - teams.list.findIndex((t) => t.id === b.teamId));
  scored.forEach((r, i) => { r.rank = i > 0 && scored[i - 1]!.score === r.score ? scored[i - 1]!.rank : i + 1; });
  return [...scored, ...rows.filter((r) => r.score === null)];
}

/** "Team Mint wins", "Team Coral and Team Sun tie for first", or null when no team scored. */
export function teamWinnerLine(rows: readonly TeamResultRow[]): string | null {
  const top = rows.filter((r) => r.rank === 1);
  if (top.length === 0) return null;
  if (rows.filter((r) => r.score !== null).length > 1 && top.length === rows.filter((r) => r.score !== null).length) return "Every team tied";
  if (top.length === 1) return `${top[0]!.name} wins`;
  const names = top.map((r) => r.name);
  return `${names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`} tie for first`;
}

/** The night's team wins: for each team, how many team games it won (shared wins count for each). */
export function teamWins(games: readonly { teams?: GameTeams; teamResults?: readonly TeamResultRow[] }[], list: readonly TeamDef[]): { teamId: string; name: string; color: TeamColor; wins: number; played: number }[] {
  const out = list.map((t) => ({ teamId: t.id, name: t.name, color: t.color, wins: 0, played: 0 }));
  for (const g of games) {
    if (!g.teamResults) continue;
    for (const r of g.teamResults) {
      const row = out.find((x) => x.teamId === r.teamId);
      if (!row || r.score === null) continue;
      row.played += 1;
      if (r.rank === 1 && teamWinnerLine(g.teamResults) !== "Every team tied") row.wins += 1;
    }
  }
  return out.sort((a, b) => b.wins - a.wins || list.findIndex((t) => t.id === a.teamId) - list.findIndex((t) => t.id === b.teamId));
}
