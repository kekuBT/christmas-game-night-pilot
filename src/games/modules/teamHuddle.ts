/**
 * Stage 12.8 (docs/stage12/stage128.md §2; D-S128-02): Team Huddle. A quiz a team answers together.
 *
 * Each question is one round with two phases:
 *  - PICK: every player taps an option and may change it until the question closes. Teammates see each other's picks
 *    live on their own phones; nobody else learns which option a team leans to (the TV and other teams see only how
 *    many have picked and whether a team agrees). The question closes when its time runs out, or early once every
 *    player has picked (or sat it out) and every team agrees.
 *  - REVEAL: the right answer, each team's answer and how its picks were split.
 *
 * A team's answer is the option most of its members picked; on a tie, the tied option whose earliest current pick came
 * first. A team where nobody picked has no answer. Scoring, from recorded picks only:
 *  - 100 to the team for a right answer;
 *  - 25 more when everyone on the team who didn't sit the question out picked it ("together").
 * Every player scores their team's points (team-derived, like Charades). Casual rooms only, practice only.
 */
import type { GameTeams } from "../../shared/teams.js";
import type { GameModule, ModuleContext } from "./types.js";

export const HUDDLE_POINTS = { right: 100, together: 25 } as const;
export const HUDDLE_ROUNDS = 8;

/** One question as this game plays it (a snapshot from the Trivia pool at its start). */
export interface HuddleQuestion { id: string; prompt: string; options: string[]; correctIndex: number; explanation?: string }

export interface HuddlePick { choice: number; seq: number }

export interface HuddleState {
  players: string[];
  teams: GameTeams;
  questions: HuddleQuestion[];
  round: number;
  phase: "pick" | "reveal" | "finished";
  /** round → player → their current pick (seq orders picks, for ties). */
  picks: Record<number, Record<string, HuddlePick>>;
  /** round → players who sat it out. */
  skipped: Record<number, string[]>;
  seq: number;
}

export interface HuddleTeamRound {
  teamId: string;
  /** The team's answer, or null when nobody on it picked. */
  answer: number | null;
  /** How many members picked each option. */
  counts: number[];
  right: boolean;
  together: boolean;
  points: number;
}

function membersOf(s: HuddleState, teamId: string): string[] {
  return s.players.filter((p) => s.teams.members[p] === teamId);
}

export function teamOf(s: HuddleState, playerId: string): string | undefined {
  return s.teams.members[playerId];
}

/** One team's result for round r. Pure. */
export function huddleTeamRound(s: HuddleState, r: number, teamId: string): HuddleTeamRound {
  const q = s.questions[r]!;
  const picks = s.picks[r] ?? {};
  const members = membersOf(s, teamId);
  const mine = members.map((p) => [p, picks[p]] as const).filter((x): x is readonly [string, HuddlePick] => x[1] !== undefined);
  const counts = q.options.map((_, i) => mine.filter(([, pk]) => pk.choice === i).length);
  let answer: number | null = null;
  if (mine.length > 0) {
    const top = Math.max(...counts);
    const tied = counts.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0);
    const firstSeq = (i: number) => Math.min(...mine.filter(([, pk]) => pk.choice === i).map(([, pk]) => pk.seq));
    answer = tied.sort((a, b) => firstSeq(a) - firstSeq(b))[0]!;
  }
  const right = answer === q.correctIndex;
  const sat = new Set(s.skipped[r] ?? []);
  const expected = members.filter((p) => !sat.has(p));
  const together = right && expected.length > 0 && expected.every((p) => picks[p]?.choice === q.correctIndex);
  return { teamId, answer, counts, right, together, points: right ? HUDDLE_POINTS.right + (together ? HUDDLE_POINTS.together : 0) : 0 };
}

/** Rounds whose result is known. */
function closedRounds(s: HuddleState): number[] {
  const upto = s.phase === "pick" ? s.round : s.round + 1;
  return Array.from({ length: Math.min(upto, s.questions.length) }, (_, i) => i);
}

function doneThisRound(s: HuddleState, pid: string): boolean {
  const r = s.round;
  return (s.skipped[r] ?? []).includes(pid) || s.picks[r]?.[pid] !== undefined;
}

/**
 * The team agrees: everyone on it has picked (or sat this one out), and all the picks are the same option. A team
 * still waiting for someone, or with no picks at all, doesn't agree yet.
 */
function agrees(s: HuddleState, teamId: string): boolean {
  const picks = s.picks[s.round] ?? {};
  const sat = new Set(s.skipped[s.round] ?? []);
  const members = membersOf(s, teamId);
  if (members.some((p) => picks[p] === undefined && !sat.has(p))) return false;
  const chosen = new Set(members.map((p) => picks[p]?.choice).filter((c) => c !== undefined));
  return chosen.size === 1;
}

function settle(s: HuddleState, ctx: ModuleContext): void {
  if (s.phase !== "pick") return;
  if (!ctx.active.every((p) => doneThisRound(s, p))) return;
  const teamIds = [...new Set(s.players.map((p) => s.teams.members[p]).filter((t): t is string => !!t))];
  // Every team with a pick must agree; a team whose players all sat out doesn't hold the question open.
  const anyPick = (t: string) => membersOf(s, t).some((p) => s.picks[s.round]?.[p] !== undefined);
  if (teamIds.every((t) => !anyPick(t) || agrees(s, t))) s.phase = "reveal";
}

function nextRound(s: HuddleState): void {
  if (s.round + 1 >= s.questions.length) s.phase = "finished";
  else { s.round += 1; s.phase = "pick"; }
}

function teamIdsInGame(s: HuddleState): string[] {
  return s.teams.list.map((t) => t.id).filter((id) => s.players.some((p) => s.teams.members[p] === id));
}

export const teamHuddleModule: GameModule<HuddleState> = {
  id: "team-huddle",
  actions: ["huddle-pick"],
  init({ players, teams, huddle }) {
    return { players: [...players], teams: teams ?? { list: [], members: {} }, questions: [...(huddle ?? [])], round: 0, phase: "pick", picks: {}, skipped: {}, seq: 0 };
  },
  intent(s, actorId, action, payload, ctx) {
    if (action !== "huddle-pick") return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.phase !== "pick") return { ok: false, reason: "PHASE_CLOSED" };
    const r = s.round;
    const q = s.questions[r];
    if (!q) return { ok: false, reason: "PHASE_CLOSED" };
    if (Number(payload["round"]) !== r) return { ok: false, reason: "STALE_ROUND" };
    if (!teamOf(s, actorId)) return { ok: false, reason: "NOT_ON_A_TEAM" };
    const choice = payload["choice"];
    if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return { ok: false, reason: "INVALID_PAYLOAD" };
    if ((s.skipped[r] ?? []).includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
    const prev = s.picks[r]?.[actorId];
    // The same pick again changes nothing (a retried tap keeps its place for ties).
    if (prev?.choice === choice) return { ok: true };
    s.seq += 1;
    (s.picks[r] ??= {})[actorId] = { choice, seq: s.seq };
    settle(s, ctx);
    return { ok: true };
  },
  abstain(s, actorId, ctx) {
    if (s.phase !== "pick") return { ok: false, reason: "PHASE_CLOSED" };
    const r = s.round;
    if ((s.skipped[r] ?? []).includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
    if (s.picks[r]?.[actorId] !== undefined) return { ok: false, reason: "ALREADY_ANSWERED" };
    (s.skipped[r] ??= []).push(actorId);
    settle(s, ctx);
    return { ok: true };
  },
  phase(s) {
    if (s.phase === "finished" || s.questions.length === 0) return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase === "pick" ? "question" : "reveal" };
  },
  expirePhase(s) {
    if (s.phase === "pick") s.phase = "reveal";
    else if (s.phase === "reveal") nextRound(s);
  },
  finished: (s) => s.phase === "finished" || s.questions.length === 0,
  scores(s, players) {
    const out: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const r of closedRounds(s)) {
      for (const t of teamIdsInGame(s)) {
        const pts = huddleTeamRound(s, r, t).points;
        if (pts === 0) continue;
        for (const p of membersOf(s, t)) if (p in out) out[p] = (out[p] ?? 0) + pts;
      }
    }
    return out;
  },
  participation(s, players) {
    const closed = closedRounds(s);
    const participation = Object.fromEntries(players.map((p) => {
      const done = closed.filter((r) => s.picks[r]?.[p] !== undefined).length;
      return [p, { done, of: closed.length, actions: done }];
    }));
    return { participation, completedUnits: closed.length, totalUnits: s.questions.length };
  },
  anyAction: (s) => Object.values(s.picks).some((r) => Object.keys(r).length > 0),
  publicView(s) {
    const r = Math.min(s.round, Math.max(0, s.questions.length - 1));
    const q = s.questions[r];
    if (!q) return { round: 0, roundCount: 0, phase: s.phase, teamProgress: [] };
    // While a question is open: the question, its options and, per team, how many picked and whether it agrees.
    // Never which option anyone picked.
    const teamProgress = teamIdsInGame(s).map((t) => {
      const members = membersOf(s, t);
      return { teamId: t, picked: members.filter((p) => s.picks[r]?.[p] !== undefined).length, of: members.length, agreed: s.phase === "pick" && r === s.round ? agrees(s, t) : false };
    });
    const base: Record<string, unknown> = { round: r, roundCount: s.questions.length, phase: s.phase, prompt: q.prompt, options: q.options, teamProgress };
    if (s.phase === "pick") return base;
    const reveal = (i: number) => {
      const qi = s.questions[i]!;
      return { prompt: qi.prompt, options: qi.options, correctIndex: qi.correctIndex, ...(qi.explanation ? { explanation: qi.explanation } : {}), teams: teamIdsInGame(s).map((t) => huddleTeamRound(s, i, t)) };
    };
    const played = Array.from({ length: Math.min(s.round + 1, s.questions.length) }, (_, i) => i);
    return { ...base, result: reveal(r), ...(s.phase === "finished" ? { rounds: played.map(reveal) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const r = Math.min(s.round, Math.max(0, s.questions.length - 1));
    const myTeamId = teamOf(s, actorId);
    // A player sees their own teammates' picks for the open question (never another team's).
    const teammates = myTeamId ? membersOf(s, myTeamId).filter((p) => p !== actorId).map((p) => ({ playerId: p, choice: s.picks[r]?.[p]?.choice ?? null, sat: (s.skipped[r] ?? []).includes(p) })) : [];
    return {
      ...this.publicView(s, ctx),
      ...(myTeamId ? { myTeamId } : {}),
      myPick: s.picks[r]?.[actorId]?.choice,
      mySkipped: (s.skipped[r] ?? []).includes(actorId),
      teammates,
      myTotal: this.scores(s, [actorId])[actorId] ?? 0,
    };
  },
};
