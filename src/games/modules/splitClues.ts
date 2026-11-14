/**
 * Stage 12.10 (docs/stage12/stage1210.md §2; D-S1210-02): Split Clues. Each round is one puzzle (one answer, six
 * clues); each teammate's phone shows different clues, so the team has to talk to put them together. All teams play
 * the same puzzle at once.
 *
 *  - Clues are dealt round the team (a team of 2 holds three each; of 3, two each); in a team of more than 6 some are
 *    held twice. Who holds what rotates every round, and the clue order is shuffled per round (the same for every team).
 *  - Help, the same for every team, from the server clock (dueAt/advance): at 30 s the answer's shape, at 45 s the
 *    clues are pooled (every phone on the team shows all six; this also covers a teammate who dropped), at 60 s the
 *    first letter. The round ends at 75 s (the room's phase clock), or as soon as every team has solved it.
 *  - Anyone on a team may type the team's answer; the first right one solves it for the team. A wrong try is shown to
 *    the teammates and locks the team's answer box for SPLIT_LOCK_MS; at most SPLIT_MAX_TRIES tries per team per round.
 *  - Points by the order teams solve: 100, 75, 55, 40; +25 catch-up for a team alone in last place and 100+ behind
 *    (from the rounds before this one). Every player scores their team's points (team-derived).
 *
 * Secrecy: a phone gets only its own clues until the pooling, then its own team's six, never another team's. A team's
 * wrong tries go to its own players only. Before the reveal the TV and other teams see only each team's status (solving,
 * solved and its place, how many tries), never a clue or the answer; future puzzles never leave the server.
 */
import type { SessionSeason } from "../../shared/season.js";
import type { GameTeams } from "../../shared/teams.js";
import { SPLIT_PUZZLES, type SplitPuzzle } from "./packs/split-clues.js";
import { letterPattern } from "./draw.js";
import { answerMatches, catchUpTeam, dealAvoiding, teamIdsInGame, teamMembers } from "./teamKit.js";
import { moduleRng, seededShuffle, type GameModule, type ModuleContext } from "./types.js";

import { SPLIT_HELP_MS } from "./split-clues-timing.js";
export { SPLIT_HELP_MS, SPLIT_REVEAL_MS, SPLIT_SOLVE_MS } from "./split-clues-timing.js";

export const SPLIT_ROUNDS = 6;
export const SPLIT_LOCK_MS = 4_000;
export const SPLIT_MAX_TRIES = 15;
export const SPLIT_TRY_LENGTH = 40;
export const SPLIT_POINTS = { place: [100, 75, 55, 40], catchUp: 25 } as const;

export interface SplitTry { by: string; text: string }
export interface SplitTeamRound {
  /** Solved: when (server ms), by whom, and in which place this round. */
  solvedAt?: number; solvedBy?: string; place?: number;
  points: number;
  /** The catch-up bonus included in `points`. */
  bonus: number;
  /** Wrong tries this round (team-private). */
  tries: SplitTry[];
  lockedUntil?: number;
}

export interface SplitState {
  players: string[];
  teams: GameTeams;
  puzzles: SplitPuzzle[];
  seed: number;
  round: number;
  phase: "solve" | "reveal" | "finished";
  /** When the current round's solving began (server ms); null until play starts. */
  roundStartedAt: number | null;
  /** When each round's solving began (server ms), for the reveal's "solved in 23 s". */
  roundStarts: number[];
  /** The room's time scale when play started (1 in real play): help and lock lengths are multiplied by it. */
  scaleAtStart?: number;
  /** Help steps shown this round (0–3). */
  help: number;
  /** round -> team id -> its result. */
  rounds: Record<number, Record<string, SplitTeamRound>>;
}

const sc = (s: SplitState) => (s.scaleAtStart && s.scaleAtStart > 0 ? s.scaleAtStart : 1);

/** The puzzles for a game: the session's season (Christmas puzzles first in a Christmas session), unplayed first. */
export function splitPuzzlesFor(season: SessionSeason | undefined, rng: () => number, avoid: readonly string[] = []): SplitPuzzle[] {
  const everyday = SPLIT_PUZZLES.filter((p) => p.season === undefined);
  if (season !== "christmas") return dealAvoiding(everyday, rng, avoid);
  return [...dealAvoiding(SPLIT_PUZZLES.filter((p) => p.season === "christmas"), rng, avoid), ...dealAvoiding(everyday, rng, avoid)];
}

/** The order the six clues are dealt in for a round (seeded, the same for every team). */
export function clueOrder(s: SplitState, round: number): number[] {
  return seededShuffle([0, 1, 2, 3, 4, 5], moduleRng((s.seed ^ (0x9e3779b1 * (round + 1))) >>> 0));
}

/** A player's seat in the deal for a round: their place in the team (roster order), moved on by one each round. */
export function dealSeat(s: SplitState, round: number, playerId: string): { slot: number; k: number } | null {
  const team = s.teams.members[playerId];
  if (!team) return null;
  const members = teamMembers(s.teams, s.players, team);
  const at = members.indexOf(playerId);
  if (members.length === 0 || at < 0) return null;
  return { slot: (at + round) % members.length, k: members.length };
}

/**
 * The clue indices a player holds in a round. Their team's members (roster order) are rotated by the round; the
 * shuffled clues are dealt round them. In a team of more than 6, the 7th member onwards hold a clue twice-held.
 */
export function cluesHeld(s: SplitState, round: number, playerId: string): number[] {
  const seat = dealSeat(s, round, playerId);
  if (!seat) return [];
  const { slot, k } = seat;
  const order = clueOrder(s, round);
  if (k > order.length) return [order[slot % order.length]!];
  return order.filter((_, i) => i % k === slot);
}

function teamRound(s: SplitState, round: number, teamId: string): SplitTeamRound {
  const r = (s.rounds[round] ??= {});
  return (r[teamId] ??= { points: 0, bonus: 0, tries: [] });
}

/** Each team's total from every recorded result (rounds before `upto`, when given). */
export function splitTeamTotals(s: SplitState, upto?: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(teamIdsInGame(s.teams, s.players).map((t) => [t, 0]));
  for (const [r, teams] of Object.entries(s.rounds)) {
    if (upto !== undefined && Number(r) >= upto) continue;
    for (const [t, res] of Object.entries(teams)) if (t in out) out[t] = (out[t] ?? 0) + res.points;
  }
  return out;
}

function allSolved(s: SplitState): boolean {
  const ids = teamIdsInGame(s.teams, s.players);
  return ids.length > 0 && ids.every((t) => s.rounds[s.round]?.[t]?.solvedAt !== undefined);
}

function startRound(s: SplitState, at: number): void {
  s.phase = "solve";
  s.help = 0;
  s.roundStartedAt = at;
  s.roundStarts[s.round] = at;
}

/** The answer's shape for the 30 s help: "2 words: 6, 5 letters" (or "7 letters"). */
export function shapeLine(answer: string): string {
  const p = letterPattern(answer);
  return p.length === 1 ? `${p[0]} letters` : `${p.length} words: ${p.join(", ")} letters`;
}

export const splitCluesModule: GameModule<SplitState> & { onPlayStart(s: SplitState, ctx: ModuleContext): void; contentIds(s: SplitState): string[] } = {
  id: "split-clues",
  actions: ["split-guess"],
  init({ players, seed, season, teams, avoid }) {
    const rng = moduleRng(seed);
    const puzzles = splitPuzzlesFor(season, rng, avoid).slice(0, SPLIT_ROUNDS);
    return { players: [...players], teams: teams ?? { list: [], members: {} }, puzzles, seed, round: 0, phase: "solve", roundStartedAt: null, roundStarts: [], help: 0, rounds: {} };
  },
  onPlayStart(s, ctx) {
    if (s.roundStartedAt !== null) return;
    s.scaleAtStart = ctx.scale > 0 ? ctx.scale : 1;
    startRound(s, ctx.now);
  },
  contentIds: (s) => s.puzzles.map((p) => p.id),
  intent(s, actorId, action, payload, ctx) {
    if (action !== "split-guess") return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.phase !== "solve" || s.roundStartedAt === null) return { ok: false, reason: "PHASE_CLOSED" };
    const puzzle = s.puzzles[s.round];
    if (!puzzle) return { ok: false, reason: "PHASE_CLOSED" };
    if (Number(payload["round"]) !== s.round) return { ok: false, reason: "STALE_ROUND" };
    const team = s.teams.members[actorId];
    if (!team || !s.players.includes(actorId)) return { ok: false, reason: "NOT_ON_A_TEAM" };
    const raw = payload["text"];
    if (typeof raw !== "string") return { ok: false, reason: "INVALID_PAYLOAD" };
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text || text.length > SPLIT_TRY_LENGTH) return { ok: false, reason: "INVALID_PAYLOAD" };
    const tr = teamRound(s, s.round, team);
    if (tr.solvedAt !== undefined) return { ok: false, reason: "ALREADY_SOLVED" };
    if (tr.lockedUntil !== undefined && ctx.now < tr.lockedUntil) return { ok: false, reason: "LOCKED" };
    if (tr.tries.length >= SPLIT_MAX_TRIES) return { ok: false, reason: "TOO_MANY_TRIES" };
    if (!answerMatches([puzzle.answer, ...(puzzle.alts ?? [])], text)) {
      tr.tries.push({ by: actorId, text });
      tr.lockedUntil = ctx.now + Math.round(SPLIT_LOCK_MS * sc(s));
      return { ok: true, result: { right: false } };
    }
    const solvedSoFar = Object.values(s.rounds[s.round] ?? {}).filter((x) => x.solvedAt !== undefined).length;
    const place = solvedSoFar + 1;
    const bonus = catchUpTeam(splitTeamTotals(s, s.round)) === team ? SPLIT_POINTS.catchUp : 0;
    tr.solvedAt = ctx.now;
    tr.solvedBy = actorId;
    tr.place = place;
    tr.bonus = bonus;
    tr.points = (SPLIT_POINTS.place[place - 1] ?? SPLIT_POINTS.place[SPLIT_POINTS.place.length - 1]!) + bonus;
    tr.lockedUntil = undefined;
    if (allSolved(s)) s.phase = "reveal";
    return { ok: true, result: { right: true, place } };
  },
  abstain() {
    // No sitting out: your clues are part of your team's puzzle (the 45 s pooling covers a teammate who steps away).
    return { ok: false, reason: "NO_ABSTAIN_IN_SPLIT_CLUES" };
  },
  phase(s) {
    if (s.phase === "finished" || s.puzzles.length === 0) return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase === "solve" ? "question" : "reveal" };
  },
  expirePhase(s, ctx) {
    if (s.phase === "solve") s.phase = "reveal";
    else if (s.phase === "reveal") {
      if (s.round + 1 >= s.puzzles.length) s.phase = "finished";
      else { s.round += 1; startRound(s, ctx.now); }
    }
  },
  dueAt(s) {
    if (s.phase !== "solve" || s.roundStartedAt === null || s.help >= SPLIT_HELP_MS.length) return undefined;
    return s.roundStartedAt + Math.round(SPLIT_HELP_MS[s.help]! * sc(s));
  },
  advance(s, ctx) {
    while (s.phase === "solve" && s.roundStartedAt !== null && s.help < SPLIT_HELP_MS.length && ctx.now >= s.roundStartedAt + Math.round(SPLIT_HELP_MS[s.help]! * sc(s))) s.help += 1;
  },
  finished: (s) => s.phase === "finished" || s.puzzles.length === 0,
  onFinish(s) {
    // Wrong tries were for teammates during their round; nobody needs them once the game is over.
    for (const r of Object.values(s.rounds)) for (const t of Object.values(r)) { t.tries = []; delete t.lockedUntil; }
  },
  scores(s, players) {
    const totals = splitTeamTotals(s);
    return Object.fromEntries(players.map((p) => [p, totals[s.teams.members[p] ?? ""] ?? 0]));
  },
  participation(s, players) {
    const closed = s.phase === "solve" ? s.round : Math.min(s.round + 1, s.puzzles.length);
    const participation = Object.fromEntries(players.map((p) => {
      let actions = 0;
      for (const r of Object.values(s.rounds)) for (const t of Object.values(r)) actions += t.tries.filter((x) => x.by === p).length + (t.solvedBy === p ? 1 : 0);
      return [p, { done: closed, of: s.puzzles.length, actions }];
    }));
    return { participation, completedUnits: closed, totalUnits: s.puzzles.length };
  },
  anyAction: (s) => Object.values(s.rounds).some((r) => Object.values(r).some((t) => t.solvedAt !== undefined || t.tries.length > 0)),
  publicView(s, ctx) {
    const r = Math.min(s.round, Math.max(0, s.puzzles.length - 1));
    const puzzle = s.puzzles[r];
    const ids = teamIdsInGame(s.teams, s.players);
    const totals = splitTeamTotals(s);
    const teamTotals = ids.map((t) => ({ teamId: t, score: totals[t] ?? 0 }));
    if (!puzzle) return { round: 0, roundCount: 0, phase: s.phase, teamStatus: [], teamTotals };
    const solving = s.phase === "solve";
    const teamStatus = ids.map((t) => {
      const tr = s.rounds[r]?.[t];
      return { teamId: t, solved: tr?.solvedAt !== undefined, ...(tr?.place ? { place: tr.place } : {}), tries: tr?.tries.length ?? 0, locked: solving && tr?.lockedUntil !== undefined && ctx.now < tr.lockedUntil };
    });
    const base: Record<string, unknown> = {
      round: r, roundCount: s.puzzles.length, phase: s.phase, kind: puzzle.kind, teamStatus, teamTotals, help: solving ? s.help : SPLIT_HELP_MS.length,
      ...(solving && s.roundStartedAt !== null ? { roundStartedAt: s.roundStartedAt, helpAt: SPLIT_HELP_MS.map((ms) => s.roundStartedAt! + Math.round(ms * sc(s))) } : {}),
      ...(solving && s.help >= 1 ? { shape: shapeLine(puzzle.answer) } : {}),
      ...(solving && s.help >= 3 ? { firstLetter: puzzle.answer.trim()[0]!.toUpperCase() } : {}),
    };
    if (solving) return base;
    const reveal = (i: number) => {
      const p = s.puzzles[i]!;
      const started = s.roundStarts[i] ?? null;
      return {
        kind: p.kind, answer: p.answer, clues: [...p.clues],
        teams: ids.map((t) => {
          const tr = s.rounds[i]?.[t];
          return { teamId: t, solved: tr?.solvedAt !== undefined, place: tr?.place ?? null, points: tr?.points ?? 0, bonus: tr?.bonus ?? 0, ...(started !== null && tr?.solvedAt !== undefined ? { seconds: Math.max(0, Math.round((tr.solvedAt - started) / 1000 / sc(s))) } : {}) };
        }),
      };
    };
    const played = Array.from({ length: Math.min(s.round + 1, s.puzzles.length) }, (_, i) => i);
    return { ...base, result: reveal(r), ...(s.phase === "finished" ? { rounds: played.map(reveal) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const base = this.publicView(s, ctx);
    const team = s.teams.members[actorId];
    if (!team || !s.players.includes(actorId)) return base;
    const puzzle = s.puzzles[s.round];
    const tr = s.rounds[s.round]?.[team];
    const out: Record<string, unknown> = { ...base, myTeamId: team, myTotal: splitTeamTotals(s)[team] ?? 0 };
    if (s.phase !== "solve" || !puzzle) return out;
    // Your own clues; from the pooling on, your team's six. Never another team's, never the answer.
    const pooled = s.help >= 2;
    const held = pooled ? [0, 1, 2, 3, 4, 5] : cluesHeld(s, s.round, actorId);
    const order = clueOrder(s, s.round);
    out["myClues"] = [...held].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((i) => puzzle.clues[i]!);
    out["pooled"] = pooled;
    out["teamTries"] = (tr?.tries ?? []).map((x) => ({ by: x.by, text: x.text }));
    if (tr?.lockedUntil !== undefined && ctx.now < tr.lockedUntil) out["lockedUntil"] = tr.lockedUntil;
    out["lockMs"] = Math.round(SPLIT_LOCK_MS * sc(s));
    if (tr?.solvedAt !== undefined) { out["mySolved"] = true; out["myPlace"] = tr.place; out["solvedBy"] = tr.solvedBy; }
    out["triesLeft"] = Math.max(0, SPLIT_MAX_TRIES - (tr?.tries.length ?? 0));
    return out;
  },
};
