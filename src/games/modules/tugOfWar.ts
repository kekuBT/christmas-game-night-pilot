/**
 * Stage 12.13 (docs/stage12/stage1213.md §2; D-S1213-01): Tug of War. Everyone pulls at once by answering quick sums.
 *
 *  - Three bouts of 40 s, each followed by a 6 s result. In a bout every player answers sums on their own phone, as
 *    fast as they can; everyone gets the same sums in the same order (seeded, a new set each bout).
 *  - A right answer is one pull for your team; a wrong one freezes you for 2 s (that option is greyed out).
 *  - Fair for uneven teams: a team's pull is its right answers PER PLAYER (total ÷ the team's size in this game), so a
 *    bigger team doesn't win by being bigger.
 *  - The rope: two teams pull a rope; three or four pull a knot in the middle of a star. The knot leans toward the
 *    team pulling hardest.
 *  - Each bout's places by pull: 100, 75, 55, 40 (a tie shares the place). Catch-up (the team kit): a team alone in last
 *    place and TUG_CATCH_UP_GAP+ behind pulls ×1.2 in the next bout. Every player scores their team's points.
 *
 * Secrecy: a phone gets only its own current sum; the TV and others see pulls, never a sum. Right answers never leave
 * the server before they're answered.
 */
import type { GameTeams } from "../../shared/teams.js";
import { generateMathQuestions } from "../math.js";
import { catchUpTeam, teamIdsInGame, teamMembers } from "./teamKit.js";
import type { GameModule, ModuleContext } from "./types.js";

export { TUG_BOUT_MS, TUG_RESULT_MS } from "./tug-of-war-timing.js";

export const TUG_BOUTS = 3;
export const TUG_SUMS_PER_BOUT = 60;
export const TUG_FREEZE_MS = 2_000;
export const TUG_CATCH_UP = 1.2;
/**
 * Catch-up for this game's scores: a bout's places differ by at most 60 (and 45 with 3 teams), so the kit's 100 could
 * never be reached with 2 or 3 teams. 40 is about a place and a half in one bout.
 */
export const TUG_CATCH_UP_GAP = 40;
export const TUG_POINTS = { place: [100, 75, 55, 40] } as const;

export interface TugSum { id: string; prompt: string; options: number[]; correctIndex: number }
export interface TugProgress { idx: number; right: number; wrong: number; frozenUntil?: number; wrongOpts: number[] }
export interface TugResult { teamId: string; right: number; size: number; mult: number; pull: number; place: number; points: number }

export interface TugState {
  players: string[];
  teams: GameTeams;
  seed: number;
  /** bout -> the sums (the same for everyone). */
  sums: TugSum[][];
  bout: number;
  phase: "pull" | "result" | "finished";
  boutStartedAt: number | null;
  scaleAtStart?: number;
  /** bout -> player -> progress. */
  progress: Record<number, Record<string, TugProgress>>;
  /** bout -> the catch-up team for it (decided when it starts). */
  catchUp: Record<number, string | null>;
  /** bout -> results (when it ended). */
  results: Record<number, TugResult[]>;
}

const sc = (s: TugState) => (s.scaleAtStart && s.scaleAtStart > 0 ? s.scaleAtStart : 1);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Each team's total points from the bouts that have ended (before `upto`, when given). */
export function tugTotals(s: TugState, upto?: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(teamIdsInGame(s.teams, s.players).map((t) => [t, 0]));
  for (const [b, rs] of Object.entries(s.results)) {
    if (upto !== undefined && Number(b) >= upto) continue;
    for (const r of rs) if (r.teamId in out) out[r.teamId] = (out[r.teamId] ?? 0) + r.points;
  }
  return out;
}

/** Each team's pull in a bout so far: right answers per player, × the catch-up multiplier. */
export function tugPulls(s: TugState, bout = s.bout): { teamId: string; right: number; size: number; mult: number; pull: number }[] {
  const prog = s.progress[bout] ?? {};
  return teamIdsInGame(s.teams, s.players).map((t) => {
    const members = teamMembers(s.teams, s.players, t);
    const right = members.reduce((n, p) => n + (prog[p]?.right ?? 0), 0);
    const mult = s.catchUp[bout] === t ? TUG_CATCH_UP : 1;
    const size = members.length || 1;
    return { teamId: t, right, size, mult, pull: (right / size) * mult };
  });
}

/** Places by pull (a tie shares the place), and points by place. */
export function tugPlaces(pulls: readonly { teamId: string; right: number; size: number; mult: number; pull: number }[]): TugResult[] {
  return pulls.map((p) => {
    const place = 1 + pulls.filter((q) => q.pull > p.pull + 1e-9).length;
    return { ...p, pull: round1(p.pull), place, points: TUG_POINTS.place[place - 1] ?? TUG_POINTS.place[TUG_POINTS.place.length - 1]! };
  });
}

function startBout(s: TugState, at: number): void {
  s.phase = "pull";
  s.boutStartedAt = at;
  s.catchUp[s.bout] = catchUpTeam(tugTotals(s, s.bout), TUG_CATCH_UP_GAP);
  s.progress[s.bout] = Object.fromEntries(s.players.filter((p) => s.teams.members[p]).map((p) => [p, { idx: 0, right: 0, wrong: 0, wrongOpts: [] }]));
}

export const tugOfWarModule: GameModule<TugState> & { onPlayStart(s: TugState, ctx: ModuleContext): void } = {
  id: "tug-of-war",
  actions: ["tug-answer"],
  init({ players, seed, teams }) {
    const sums = Array.from({ length: TUG_BOUTS }, (_, b) => generateMathQuestions((seed ^ (0x5bd1e995 * (b + 1))) >>> 0, TUG_SUMS_PER_BOUT)
      .map((q) => ({ id: q.id, prompt: q.prompt, options: [...q.options], correctIndex: q.correctIndex })));
    return { players: [...players], teams: teams ?? { list: [], members: {} }, seed, sums, bout: 0, phase: "pull", boutStartedAt: null, progress: {}, catchUp: {}, results: {} };
  },
  onPlayStart(s, ctx) {
    if (s.boutStartedAt !== null) return;
    s.scaleAtStart = ctx.scale > 0 ? ctx.scale : 1;
    startBout(s, ctx.now);
  },
  intent(s, actorId, action, payload, ctx) {
    if (action !== "tug-answer") return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.phase !== "pull" || s.boutStartedAt === null) return { ok: false, reason: "PHASE_CLOSED" };
    if (Number(payload["bout"]) !== s.bout) return { ok: false, reason: "STALE_ROUND" };
    const me = s.progress[s.bout]?.[actorId];
    if (!me || !s.teams.members[actorId]) return { ok: false, reason: "NOT_ON_A_TEAM" };
    if (Number(payload["idx"]) !== me.idx) return { ok: false, reason: "STALE_SUM" };
    if (me.frozenUntil !== undefined && ctx.now < me.frozenUntil) return { ok: false, reason: "FROZEN" };
    const sum = s.sums[s.bout]?.[me.idx];
    if (!sum) return { ok: false, reason: "NO_MORE_SUMS" };
    const choice = payload["choice"];
    if (!Number.isInteger(choice) || (choice as number) < 0 || (choice as number) >= sum.options.length || me.wrongOpts.includes(choice as number)) return { ok: false, reason: "INVALID_PAYLOAD" };
    delete me.frozenUntil;
    if (choice === sum.correctIndex) {
      me.right += 1;
      me.idx += 1;
      me.wrongOpts = [];
      return { ok: true, result: { right: true } };
    }
    me.wrong += 1;
    me.wrongOpts.push(choice as number);
    me.frozenUntil = ctx.now + Math.round(TUG_FREEZE_MS * sc(s));
    return { ok: true, result: { right: false } };
  },
  abstain() {
    // No sitting out: every pull counts for your team, and your team's pull is per player.
    return { ok: false, reason: "NO_ABSTAIN_IN_TUG_OF_WAR" };
  },
  phase(s) {
    if (s.phase === "finished") return null;
    return { key: `${s.bout}:${s.phase}`, kind: s.phase === "pull" ? "round" : "reveal" };
  },
  expirePhase(s, ctx) {
    if (s.phase === "pull") {
      s.results[s.bout] = tugPlaces(tugPulls(s));
      // Frozen windows are over with the bout.
      for (const p of Object.values(s.progress[s.bout] ?? {})) delete p.frozenUntil;
      s.phase = "result";
      return;
    }
    if (s.phase !== "result") return;
    if (s.bout + 1 >= TUG_BOUTS) s.phase = "finished";
    else { s.bout += 1; startBout(s, ctx.now); }
  },
  finished: (s) => s.phase === "finished",
  scores(s, players) {
    const totals = tugTotals(s);
    return Object.fromEntries(players.map((p) => [p, totals[s.teams.members[p] ?? ""] ?? 0]));
  },
  participation(s, players) {
    const closed = s.phase === "pull" ? s.bout : Math.min(s.bout + 1, TUG_BOUTS);
    const participation = Object.fromEntries(players.map((p) => {
      let actions = 0;
      for (const b of Object.values(s.progress)) actions += (b[p]?.right ?? 0) + (b[p]?.wrong ?? 0);
      return [p, { done: closed, of: TUG_BOUTS, actions }];
    }));
    return { participation, completedUnits: closed, totalUnits: TUG_BOUTS };
  },
  anyAction: (s) => Object.values(s.progress).some((b) => Object.values(b).some((p) => p.right + p.wrong > 0)),
  publicView(s, ctx) {
    void ctx;
    const ids = teamIdsInGame(s.teams, s.players);
    const totals = tugTotals(s);
    const teamTotals = ids.map((t) => ({ teamId: t, score: totals[t] ?? 0 }));
    const b = Math.min(s.bout, TUG_BOUTS - 1);
    const pulls = tugPulls(s, b).map((p) => ({ ...p, pull: round1(p.pull) }));
    const base: Record<string, unknown> = {
      bout: b, boutCount: TUG_BOUTS, phase: s.phase, teamTotals, pulls,
      ...(s.catchUp[b] ? { catchUp: s.catchUp[b] } : {}),
      ...(s.phase === "pull" && s.boutStartedAt !== null ? { boutStartedAt: s.boutStartedAt } : {}),
    };
    if (s.phase === "pull") return base;
    return { ...base, result: s.results[b] ?? [], bouts: Array.from({ length: Math.min(s.bout + 1, TUG_BOUTS) }, (_, i) => s.results[i] ?? []) };
  },
  playerView(s, actorId, ctx) {
    const base = this.publicView(s, ctx);
    const team = s.teams.members[actorId];
    if (!team || !s.players.includes(actorId)) return base;
    const out: Record<string, unknown> = { ...base, myTeamId: team, myTotal: tugTotals(s)[team] ?? 0 };
    const me = s.progress[s.bout]?.[actorId];
    if (!me) return out;
    out["myRight"] = me.right;
    out["myWrong"] = me.wrong;
    if (s.phase !== "pull") return out;
    // Your own current sum only (never its answer); the options you got wrong are greyed out.
    const sum = s.sums[s.bout]?.[me.idx];
    if (sum) out["sum"] = { idx: me.idx, prompt: sum.prompt, options: [...sum.options], wrong: [...me.wrongOpts] };
    if (me.frozenUntil !== undefined && ctx.now < me.frozenUntil) out["frozenUntil"] = me.frozenUntil;
    out["freezeMs"] = Math.round(TUG_FREEZE_MS * sc(s));
    return out;
  },
};
