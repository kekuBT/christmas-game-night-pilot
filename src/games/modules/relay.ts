/**
 * Stage 12.9 (docs/stage12/stage129.md; D-S129-01): Relay. Each team runs a relay of quick sums; only the runner's
 * phone can answer, a right answer passes the baton to the next teammate, and the first team to finish wins.
 *
 *  - Every team runs the same sums in the same order (seeded). A team only ever sees its own current sum; the TV and
 *    the other teams see lanes and progress, never a sum.
 *  - Runners take legs in turn within their team, so a smaller team's players run more legs.
 *  - A wrong answer freezes the runner for RELAY_FREEZE_MS (that option is then greyed out); RELAY_TURN_MS without an
 *    answer passes the baton to the next teammate on the same sum, so a phone that drops never stalls its team.
 *  - The race ends when every team has finished (or at the game's deadline, which the room owns).
 *  - Places: most legs, then the earlier finish of the last leg. Score: RELAY_POINTS.leg per leg, plus a finishing bonus
 *    for the first three teams to finish. Every player scores their team's points (team-derived).
 *    Stage 12.15-R (D-S1215R-03): every lane records when it completed its last leg (`lastLegAt`), so lanes still out
 *    when time runs out are placed too; the places are the game's result (teamPlaces), the points don't change.
 *  - Stage 12.15-R (D-S1215R-01): a runner's chances are their own turns. Participation counts the turns that ended
 *    (a right answer, or the turn's time ran out) and those the runner answered in (right or wrong); every answer is an
 *    action. A turn still open when the game ends counts only if the runner answered in it.
 *
 * Times come from the server clock: the race starts at onPlayStart (the briefing's end), never at init.
 */
import type { GameTeams } from "../../shared/teams.js";
import type { GameModule, ModuleContext } from "./types.js";

export const RELAY_LEGS = 12;
export const RELAY_TURN_MS = 20_000;
export const RELAY_FREEZE_MS = 3_000;
export const RELAY_POINTS = { leg: 10, finish: [30, 20, 10] } as const;

export interface RelayQuestion { id: string; prompt: string; options: number[]; correctIndex: number }

export interface RelayLane {
  teamId: string;
  /** This game's players on the team, in running order. */
  runners: string[];
  /** Legs completed (0..RELAY_LEGS). */
  legs: number;
  /** Index into `runners` of the current runner. */
  runner: number;
  /** When the current runner's turn began (server ms); null until the race starts. */
  turnStartedAt: number | null;
  /** The current runner is frozen until this instant after a wrong answer. */
  frozenUntil?: number;
  /** Options tried and wrong on the current leg (greyed out). */
  wrong: number[];
  /** When the team completed its twelfth leg. */
  finishedAt?: number;
  /** Who ran each completed leg. */
  ranBy: string[];
  /** Stage 12.15-R (D-S1215R-03): when the team completed its latest leg (any leg). Absent in a race saved before it. */
  lastLegAt?: number;
  /**
   * Stage 12.15-R (D-S1215R-01): per runner, their turns that ended (answered right, or their time ran out), the turns
   * they answered in (right or wrong), and every answer they gave. Absent in a race saved before Stage 12.15-R: its
   * participation is then counted the old way.
   */
  turnsEnded?: Record<string, number>;
  turnsAnswered?: Record<string, number>;
  answersBy?: Record<string, number>;
  /** The current runner has already answered (wrong) in this turn. */
  turnAnswered?: boolean;
}

export interface RelayState {
  players: string[];
  teams: GameTeams;
  questions: RelayQuestion[];
  lanes: RelayLane[];
  startedAt: number | null;
  /** The room's time scale when the race started (1 in real play): turn and freeze lengths are multiplied by it. */
  scaleAtStart?: number;
  /** Team ids in the order they finished. */
  finishOrder: string[];
}

function scale(ctx: { scale: number }): number { return ctx.scale > 0 ? ctx.scale : 1; }

function laneOf(s: RelayState, playerId: string): RelayLane | undefined {
  const team = s.teams.members[playerId];
  return s.lanes.find((l) => l.teamId === team);
}

function runnerOf(l: RelayLane): string | undefined {
  return l.legs >= RELAY_LEGS ? undefined : l.runners[l.runner % l.runners.length];
}

/** The instant the current runner's turn passes to the next teammate (the freeze doesn't extend it). */
function turnEndsAt(l: RelayLane, sc: number): number | undefined {
  if (l.legs >= RELAY_LEGS || l.turnStartedAt === null) return undefined;
  return l.turnStartedAt + Math.round(RELAY_TURN_MS * sc);
}

/** A lane's team score: legs, plus a finishing bonus for the first three teams home. */
export function relayLaneScore(s: RelayState, l: RelayLane): number {
  const place = s.finishOrder.indexOf(l.teamId);
  return l.legs * RELAY_POINTS.leg + (place >= 0 ? (RELAY_POINTS.finish[place] ?? 0) : 0);
}

/** Is the lane's runner frozen at `now`? The one test both the TV's lanes and the runner's phone use (D-S1215R-04). */
export function relayFrozen(l: RelayLane, now: number): boolean {
  return l.frozenUntil !== undefined && now < l.frozenUntil;
}

/**
 * Places (1-based, shared on a tie): most legs, then whoever completed their last leg first (D-S1215R-03), finished or
 * not. Equal legs at the same instant, or no legs at all, share a place. A race saved before lastLegAt existed only
 * knows the twelfth leg's time.
 */
export function relayPlaces(s: RelayState): Record<string, number> {
  const key = (l: RelayLane) => [-l.legs, l.legs > 0 ? (l.lastLegAt ?? l.finishedAt ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER] as const;
  const sorted = [...s.lanes].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  const out: Record<string, number> = {};
  sorted.forEach((l, i) => {
    const prev = sorted[i - 1];
    out[l.teamId] = prev && key(prev)[0] === key(l)[0] && key(prev)[1] === key(l)[1] ? out[prev.teamId]! : i + 1;
  });
  return out;
}

/** The current runner's turn ends (answered right, or their time ran out): record it for participation. */
function endTurn(l: RelayLane, runner: string | undefined, answered: boolean): void {
  if (runner === undefined || !l.turnsEnded) return;
  l.turnsEnded[runner] = (l.turnsEnded[runner] ?? 0) + 1;
  if (answered) l.turnsAnswered![runner] = (l.turnsAnswered![runner] ?? 0) + 1;
  l.turnAnswered = false;
}

function passBaton(l: RelayLane, now: number): void {
  l.runner = (l.runner + 1) % Math.max(1, l.runners.length);
  l.turnStartedAt = now;
  l.frozenUntil = undefined;
}

function countAnswer(l: RelayLane, runner: string): void {
  if (!l.answersBy) return;
  l.answersBy[runner] = (l.answersBy[runner] ?? 0) + 1;
}

export const relayModule: GameModule<RelayState> & { onPlayStart(s: RelayState, ctx: ModuleContext): void } = {
  // (onPlayStart is required here: the race can't run without its start.)
  id: "relay",
  actions: ["relay-answer"],
  init({ players, teams, relay }) {
    const t = teams ?? { list: [], members: {} };
    const lanes: RelayLane[] = t.list
      .map((team) => ({ teamId: team.id, runners: players.filter((p) => t.members[p] === team.id), legs: 0, runner: 0, turnStartedAt: null, wrong: [], ranBy: [], turnsEnded: {}, turnsAnswered: {}, answersBy: {}, turnAnswered: false }))
      .filter((l) => l.runners.length > 0);
    return { players: [...players], teams: t, questions: [...(relay ?? [])], lanes, startedAt: null, finishOrder: [] };
  },
  onPlayStart(s, ctx) {
    if (s.startedAt !== null) return;
    s.startedAt = ctx.now;
    s.scaleAtStart = scale(ctx);
    for (const l of s.lanes) l.turnStartedAt = ctx.now;
  },
  intent(s, actorId, action, payload, ctx) {
    if (action !== "relay-answer") return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.startedAt === null) return { ok: false, reason: "NOT_STARTED" };
    const l = laneOf(s, actorId);
    if (!l) return { ok: false, reason: "NOT_ON_A_TEAM" };
    if (l.legs >= RELAY_LEGS) return { ok: false, reason: "FINISHED" };
    if (runnerOf(l) !== actorId) return { ok: false, reason: "NOT_YOUR_LEG" };
    if (Number(payload["leg"]) !== l.legs) return { ok: false, reason: "STALE_LEG" };
    if (relayFrozen(l, ctx.now)) return { ok: false, reason: "FROZEN" };
    const q = s.questions[l.legs];
    const choice = payload["choice"];
    if (!q || typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return { ok: false, reason: "INVALID_PAYLOAD" };
    if (l.wrong.includes(choice)) return { ok: false, reason: "ALREADY_TRIED" };
    countAnswer(l, actorId);
    if (choice !== q.correctIndex) {
      l.wrong.push(choice);
      l.turnAnswered = true;
      l.frozenUntil = ctx.now + Math.round(RELAY_FREEZE_MS * (s.scaleAtStart ?? scale(ctx)));
      return { ok: true, result: { right: false } };
    }
    endTurn(l, actorId, true);
    l.ranBy.push(actorId);
    l.legs += 1;
    l.lastLegAt = ctx.now;
    l.wrong = [];
    if (l.legs >= RELAY_LEGS) {
      l.finishedAt = ctx.now;
      l.turnStartedAt = null;
      l.frozenUntil = undefined;
      s.finishOrder.push(l.teamId);
    } else passBaton(l, ctx.now);
    return { ok: true, result: { right: true } };
  },
  abstain() {
    // A relay has no sitting out: a runner who doesn't answer is passed over after RELAY_TURN_MS.
    return { ok: false, reason: "NO_ABSTAIN_IN_RELAY" };
  },
  phase: () => null,
  expirePhase: () => {},
  dueAt(s) {
    // The next instant a runner's turn passes on (with the time scale recorded at the start), or a freeze ends: the
    // room ticks then, so the TV's lane stops saying "frozen" at the same instant the runner's phone does (D-S1215R-04).
    const due = s.lanes.flatMap((l) => [turnEndsAt(l, s.scaleAtStart ?? 1), l.legs < RELAY_LEGS ? l.frozenUntil : undefined]).filter((t): t is number => t !== undefined);
    return due.length ? Math.min(...due) : undefined;
  },
  advance(s, ctx) {
    for (const l of s.lanes) {
      if (l.frozenUntil !== undefined && ctx.now >= l.frozenUntil) l.frozenUntil = undefined;
      const end = turnEndsAt(l, s.scaleAtStart ?? 1);
      if (end !== undefined && ctx.now >= end) {
        // Their time ran out: a turn they had, answered (wrong) or not.
        endTurn(l, runnerOf(l), l.turnAnswered === true);
        passBaton(l, end);
      }
    }
  },
  finished: (s) => s.lanes.length > 0 && s.lanes.every((l) => l.legs >= RELAY_LEGS),
  scores(s, players) {
    const out: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const l of s.lanes) {
      const pts = relayLaneScore(s, l);
      for (const p of l.runners) if (p in out) out[p] = pts;
    }
    return out;
  },
  participation(s, players) {
    const participation = Object.fromEntries(players.map((p) => {
      const l = laneOf(s, p);
      if (l && !l.turnsEnded) {
        // A race saved before Stage 12.15-R has no turn record: counted as it was then (legs run, of all the legs).
        const ran = l.ranBy.filter((x) => x === p).length;
        return [p, { done: ran, of: RELAY_LEGS, actions: ran }];
      }
      if (!l) return [p, { done: 0, of: 0, actions: 0 }];
      // A turn still open at the end counts only if they answered in it: the end cut it short, not them.
      const open = runnerOf(l) === p && l.turnAnswered === true ? 1 : 0;
      return [p, { done: (l.turnsAnswered?.[p] ?? 0) + open, of: (l.turnsEnded?.[p] ?? 0) + open, actions: l.answersBy?.[p] ?? 0 }];
    }));
    return { participation };
  },
  // Stage 12.15-R (D-S1215R-03): the game's own placing of its teams (legs, then the last leg's time).
  teamPlaces: (s) => relayPlaces(s),
  anyAction: (s) => s.lanes.some((l) => l.legs > 0 || l.wrong.length > 0),
  publicView(s, ctx) {
    const places = relayPlaces(s);
    // Lanes only: progress, the runner and the finish. Never a sum.
    return {
      legsTotal: RELAY_LEGS,
      started: s.startedAt !== null,
      lanes: s.lanes.map((l) => ({ teamId: l.teamId, legs: l.legs, runnerId: runnerOf(l) ?? null, frozen: relayFrozen(l, ctx.now), finished: l.legs >= RELAY_LEGS, place: l.legs >= RELAY_LEGS || s.finishOrder.length === s.lanes.length ? places[l.teamId] : undefined, score: relayLaneScore(s, l) })),
      finishOrder: [...s.finishOrder],
    };
  },
  playerView(s, actorId, ctx) {
    const l = laneOf(s, actorId);
    const base = this.publicView(s, ctx);
    if (!l) return base;
    const q = l.legs < RELAY_LEGS ? s.questions[l.legs] : undefined;
    // Your own team's current sum only (teammates may shout help); never another team's, never the answer.
    return {
      ...base,
      myTeamId: l.teamId,
      myLeg: l.legs,
      runnerId: runnerOf(l) ?? null,
      myTurn: runnerOf(l) === actorId,
      ...(q ? { prompt: q.prompt, options: q.options, wrong: [...l.wrong] } : {}),
      ...(relayFrozen(l, ctx.now) ? { frozenUntil: l.frozenUntil } : {}),
      // The whole freeze and turn at this game's time scale, so a phone's countdown never shows more than them.
      freezeMs: Math.round(RELAY_FREEZE_MS * (s.scaleAtStart ?? 1)),
      turnMs: Math.round(RELAY_TURN_MS * (s.scaleAtStart ?? 1)),
      ...(turnEndsAt(l, s.scaleAtStart ?? 1) !== undefined ? { turnEndsAt: turnEndsAt(l, s.scaleAtStart ?? 1) } : {}),
    };
  },
};
