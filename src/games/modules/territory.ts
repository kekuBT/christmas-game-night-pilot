/**
 * Stage 12.12 (docs/stage12/stage1212.md §2; D-S1212-02): Territory. A quiz for teams on a board of 19 hex cells.
 *
 * Each round is one question from the Trivia pool, on every phone at once, in two phases:
 *  - QUESTION (20 s): one tap answers for the whole team (the team should agree first). The phase closes early once
 *    every team has answered. Other teams and the TV see only *that* a team has answered, never what.
 *  - CLAIM (10 s): the answer is shown; each team that got it right picks one cell next to its land: an empty one, or
 *    another team's (a steal). Home corners can't be taken. The picks stay hidden until the round ends, then resolve in
 *    the order the teams answered: a faster team gets a contested cell, and a slower team's claim moves to the best free
 *    cell next to its land (empty first, then nearest the centre). A right team that doesn't pick gets that cell too.
 *  - Catch-up (the team kit): a team alone in last place and TERRITORY_CATCH_UP_GAP+ behind gets one extra cell when it
 *    is right.
 *
 * Score, live and final: 10 per cell, plus 5 per cell in the team's biggest joined region. Every player scores their
 * team's points. Fair for uneven teams: one answer and one claim per team, whatever its size.
 */
import type { GameTeams } from "../../shared/teams.js";
import { TERRITORY_CELLS, TERRITORY_CENTRE, TERRITORY_HOMES, hexDistance, hexNeighbours, largestRegion } from "../../shared/territoryBoard.js";
import type { HuddleQuestion } from "./teamHuddle.js";
import { catchUpTeam, teamIdsInGame } from "./teamKit.js";
import type { GameModule, ModuleContext } from "./types.js";

export { TERRITORY_CLAIM_MS, TERRITORY_QUESTION_MS } from "./territory-timing.js";

export const TERRITORY_ROUNDS = 8;
export const TERRITORY_POINTS = { cell: 10, region: 5 } as const;
/** Catch-up for this game's smaller scores: about two cells behind. */
export const TERRITORY_CATCH_UP_GAP = 30;

export interface TerritoryAnswer { choice: number; by: string; at: number; right: boolean }
export interface TerritoryPick { cell: number; by: string }
export interface TerritoryClaim {
  teamId: string; cell: number;
  /** Whose cell it was (null: empty). */
  from: string | null;
  /** Chosen by the game: the team's pick was taken by a faster team, or it didn't pick. */
  auto: boolean;
  /** The catch-up extra cell. */
  extra: boolean;
  /** The cell the team picked, when it had to move. */
  wanted?: number;
}

export interface TerritoryState {
  players: string[];
  teams: GameTeams;
  questions: HuddleQuestion[];
  round: number;
  phase: "question" | "claim" | "finished";
  roundStartedAt: number | null;
  roundStarts: number[];
  scaleAtStart?: number;
  /** team id -> its home cell. */
  homes: Record<string, number>;
  /** cell -> owner (team id) or null. */
  owner: (string | null)[];
  answers: Record<number, Record<string, TerritoryAnswer>>;
  picks: Record<number, Record<string, TerritoryPick>>;
  /** round -> the claims applied when it ended. */
  resolved: Record<number, TerritoryClaim[]>;
}

const sc = (s: TerritoryState) => (s.scaleAtStart && s.scaleAtStart > 0 ? s.scaleAtStart : 1);

/** Each team's land: cells, biggest joined region, and score. */
export function territoryScores(s: Pick<TerritoryState, "owner" | "teams" | "players">, owner = s.owner): Record<string, { cells: number; region: number; score: number }> {
  const out: Record<string, { cells: number; region: number; score: number }> = {};
  for (const t of teamIdsInGame(s.teams, s.players)) {
    const cells = owner.filter((o) => o === t).length;
    const region = largestRegion(owner, t);
    out[t] = { cells, region, score: cells * TERRITORY_POINTS.cell + region * TERRITORY_POINTS.region };
  }
  return out;
}

const totalsOf = (s: TerritoryState, owner = s.owner) => Object.fromEntries(Object.entries(territoryScores(s, owner)).map(([t, v]) => [t, v.score]));

/** The cells a team may claim on a board: next to its land, not its own, not anyone's home, not already taken this round. */
export function claimableCells(s: TerritoryState, teamId: string, owner: readonly (string | null)[] = s.owner, taken: ReadonlySet<number> = new Set()): number[] {
  const homes = new Set(Object.values(s.homes));
  return TERRITORY_CELLS.map((c) => c.id).filter((c) => owner[c] !== teamId && !homes.has(c) && !taken.has(c) && hexNeighbours(c).some((n) => owner[n] === teamId));
}

/** The game's choice for a team: an empty claimable cell first, then the nearest the centre, then the lowest number. */
export function fallbackCell(s: TerritoryState, teamId: string, owner: readonly (string | null)[], taken: ReadonlySet<number>): number | undefined {
  const options = claimableCells(s, teamId, owner, taken);
  options.sort((a, b) => (owner[a] === null ? 0 : 1) - (owner[b] === null ? 0 : 1) || hexDistance(a, TERRITORY_CENTRE) - hexDistance(b, TERRITORY_CENTRE) || a - b);
  return options[0];
}

/** The teams that got round r right, fastest first (ties: the teams' own order). */
function rightInOrder(s: TerritoryState, r: number): string[] {
  const ids = teamIdsInGame(s.teams, s.players);
  const ans = s.answers[r] ?? {};
  return ids.filter((t) => ans[t]?.right).sort((a, b) => ans[a]!.at - ans[b]!.at || ids.indexOf(a) - ids.indexOf(b));
}

/** The catch-up team for round r: from the scores before it. */
function catchUpFor(s: TerritoryState): string | null {
  return catchUpTeam(totalsOf(s), TERRITORY_CATCH_UP_GAP);
}

/** Apply round r's claims to the board, in answer order. */
function resolve(s: TerritoryState, r: number): void {
  if (s.resolved[r]) return;
  const right = rightInOrder(s, r);
  const owner = [...s.owner];
  const taken = new Set<number>();
  const out: TerritoryClaim[] = [];
  const catchUp = catchUpFor(s);
  for (const t of right) {
    const pick = s.picks[r]?.[t]?.cell;
    const ok = pick !== undefined && claimableCells(s, t, owner, taken).includes(pick);
    const cell = ok ? pick : fallbackCell(s, t, owner, taken);
    if (cell === undefined) continue;
    out.push({ teamId: t, cell, from: owner[cell] ?? null, auto: !ok, extra: false, ...(!ok && pick !== undefined ? { wanted: pick } : {}) });
    owner[cell] = t;
    taken.add(cell);
  }
  if (catchUp && right.includes(catchUp)) {
    const cell = fallbackCell(s, catchUp, owner, taken);
    if (cell !== undefined) {
      out.push({ teamId: catchUp, cell, from: owner[cell] ?? null, auto: true, extra: true });
      owner[cell] = catchUp;
      taken.add(cell);
    }
  }
  s.owner = owner;
  s.resolved[r] = out;
}

function startRound(s: TerritoryState, at: number): void {
  s.phase = "question";
  s.roundStartedAt = at;
  s.roundStarts[s.round] = at;
}

function allAnswered(s: TerritoryState): boolean {
  const ids = teamIdsInGame(s.teams, s.players);
  return ids.length > 0 && ids.every((t) => s.answers[s.round]?.[t] !== undefined);
}

export const territoryModule: GameModule<TerritoryState> & { onPlayStart(s: TerritoryState, ctx: ModuleContext): void } = {
  id: "territory",
  actions: ["territory-answer", "territory-claim"],
  init({ players, teams, quiz }) {
    const t: GameTeams = teams ?? { list: [], members: {} };
    const ids = teamIdsInGame(t, players);
    const corners = TERRITORY_HOMES[Math.min(4, Math.max(2, ids.length)) as 2 | 3 | 4];
    const homes: Record<string, number> = {};
    ids.forEach((id, i) => { const c = corners[i]; if (c !== undefined) homes[id] = c; });
    const owner: (string | null)[] = TERRITORY_CELLS.map(() => null);
    for (const [id, c] of Object.entries(homes)) owner[c] = id;
    return {
      players: [...players], teams: t, questions: [...(quiz ?? [])].slice(0, TERRITORY_ROUNDS).map((q) => ({ ...q, options: [...q.options] })),
      round: 0, phase: "question", roundStartedAt: null, roundStarts: [], homes, owner, answers: {}, picks: {}, resolved: {},
    };
  },
  onPlayStart(s, ctx) {
    if (s.roundStartedAt !== null) return;
    s.scaleAtStart = ctx.scale > 0 ? ctx.scale : 1;
    startRound(s, ctx.now);
  },
  intent(s, actorId, action, payload, ctx) {
    if (!this.actions.includes(action)) return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.roundStartedAt === null || s.phase === "finished") return { ok: false, reason: "PHASE_CLOSED" };
    if (Number(payload["round"]) !== s.round) return { ok: false, reason: "STALE_ROUND" };
    const team = s.teams.members[actorId];
    if (!team || !s.players.includes(actorId) || s.homes[team] === undefined) return { ok: false, reason: "NOT_ON_A_TEAM" };
    const q = s.questions[s.round];
    if (!q) return { ok: false, reason: "PHASE_CLOSED" };
    if (action === "territory-answer") {
      if (s.phase !== "question") return { ok: false, reason: "PHASE_CLOSED" };
      const choice = payload["choice"];
      if (!Number.isInteger(choice) || (choice as number) < 0 || (choice as number) >= q.options.length) return { ok: false, reason: "INVALID_PAYLOAD" };
      const r = (s.answers[s.round] ??= {});
      if (r[team]) return { ok: false, reason: "TEAM_ALREADY_ANSWERED" };
      r[team] = { choice: choice as number, by: actorId, at: ctx.now, right: choice === q.correctIndex };
      if (allAnswered(s)) s.phase = "claim";
      return { ok: true, result: { locked: true } };
    }
    // territory-claim
    if (s.phase !== "claim") return { ok: false, reason: "PHASE_CLOSED" };
    if (!s.answers[s.round]?.[team]?.right) return { ok: false, reason: "NOT_RIGHT_THIS_ROUND" };
    const p = (s.picks[s.round] ??= {});
    if (p[team]) return { ok: false, reason: "TEAM_ALREADY_PICKED" };
    const cell = payload["cell"];
    if (!Number.isInteger(cell) || !claimableCells(s, team).includes(cell as number)) return { ok: false, reason: "CELL_NOT_CLAIMABLE" };
    p[team] = { cell: cell as number, by: actorId };
    return { ok: true, result: { picked: cell } };
  },
  abstain() {
    // No sitting out: one tap answers for your team; a team that doesn't answer simply claims nothing.
    return { ok: false, reason: "NO_ABSTAIN_IN_TERRITORY" };
  },
  phase(s) {
    if (s.phase === "finished" || s.questions.length === 0) return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase === "question" ? "question" : "reveal" };
  },
  expirePhase(s, ctx) {
    if (s.phase === "question") { s.phase = "claim"; return; }
    if (s.phase !== "claim") return;
    resolve(s, s.round);
    if (s.round + 1 >= s.questions.length) s.phase = "finished";
    else { s.round += 1; startRound(s, ctx.now); }
  },
  finished: (s) => s.phase === "finished" || s.questions.length === 0,
  scores(s, players) {
    const totals = totalsOf(s);
    return Object.fromEntries(players.map((p) => [p, totals[s.teams.members[p] ?? ""] ?? 0]));
  },
  participation(s, players) {
    const closed = s.phase === "finished" ? s.questions.length : s.round;
    const participation = Object.fromEntries(players.map((p) => {
      let actions = 0;
      for (const r of Object.values(s.answers)) for (const a of Object.values(r)) if (a.by === p) actions++;
      for (const r of Object.values(s.picks)) for (const a of Object.values(r)) if (a.by === p) actions++;
      return [p, { done: closed, of: s.questions.length, actions }];
    }));
    return { participation, completedUnits: closed, totalUnits: s.questions.length };
  },
  anyAction: (s) => Object.values(s.answers).some((r) => Object.keys(r).length > 0),
  publicView(s, ctx) {
    void ctx;
    const ids = teamIdsInGame(s.teams, s.players);
    const land = territoryScores(s);
    const teamTotals = ids.map((t) => ({ teamId: t, score: land[t]?.score ?? 0 }));
    const teamLand = ids.map((t) => ({ teamId: t, cells: land[t]?.cells ?? 0, region: land[t]?.region ?? 0 }));
    const board = { owner: [...s.owner], homes: { ...s.homes } };
    const base: Record<string, unknown> = { round: Math.min(s.round, Math.max(0, s.questions.length - 1)), roundCount: s.questions.length, phase: s.phase, teamTotals, teamLand, board };
    const r = s.round;
    const q = s.questions[r];
    const started = s.roundStarts[r] ?? null;
    if (s.phase === "finished" || !q) {
      const rounds = s.questions.map((qq, i) => ({
        prompt: qq.prompt, answer: qq.options[qq.correctIndex] ?? "",
        teams: ids.map((t) => { const a = s.answers[i]?.[t]; return { teamId: t, answered: !!a, right: !!a?.right }; }),
        claims: s.resolved[i] ?? [],
      }));
      return { ...base, rounds, lastClaims: s.resolved[s.questions.length - 1] ?? [] };
    }
    const ans = s.answers[r] ?? {};
    const claiming = s.phase === "claim";
    const teamStatus = ids.map((t) => {
      const a = ans[t];
      return {
        teamId: t, answered: !!a,
        // What a team answered stays hidden until the question closes.
        ...(claiming && a ? { choice: a.choice, right: a.right, ...(started !== null ? { seconds: Math.max(0, Math.round((a.at - started) / 1000 / sc(s))) } : {}) } : {}),
        ...(claiming ? { picked: !!s.picks[r]?.[t] } : {}),
      };
    });
    const catchUp = catchUpFor(s);
    return {
      ...base, question: { prompt: q.prompt, options: [...q.options] }, teamStatus,
      ...(s.roundStartedAt !== null && !claiming ? { roundStartedAt: s.roundStartedAt } : {}),
      ...(claiming ? { correctIndex: q.correctIndex, ...(q.explanation ? { explanation: q.explanation } : {}), order: rightInOrder(s, r) } : {}),
      ...(catchUp ? { catchUp } : {}),
      lastClaims: r > 0 ? s.resolved[r - 1] ?? [] : [],
    };
  },
  playerView(s, actorId, ctx) {
    const base = this.publicView(s, ctx);
    const team = s.teams.members[actorId];
    if (!team || !s.players.includes(actorId) || s.homes[team] === undefined) return base;
    const out: Record<string, unknown> = { ...base, myTeamId: team, myTotal: territoryScores(s)[team]?.score ?? 0 };
    if (s.phase === "finished") return out;
    const a = s.answers[s.round]?.[team];
    // Your own team's answer (who tapped it) while the question is open; everyone's once it closes.
    if (a) out["teamAnswer"] = { choice: a.choice, by: a.by };
    if (s.phase === "claim") {
      const pick = s.picks[s.round]?.[team];
      if (pick) out["teamPick"] = { cell: pick.cell, by: pick.by };
      if (a?.right && !pick) out["claimable"] = claimableCells(s, team);
      out["myRight"] = !!a?.right;
    }
    return out;
  },
};
