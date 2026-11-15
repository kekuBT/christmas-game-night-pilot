/**
 * Stage 12.14 (docs/stage12/stage1214.md §2; D-S1214-01): Know Your Rivals. How well does your team know the others?
 *
 * Each round is one "this or that" question about yourself ("Tea or coffee?"), in three phases:
 *  - ANSWER (20 s): every player privately picks one of the two, or "Rather not say". It closes early once everyone
 *    has answered. Nobody, not even a teammate, ever sees another player's own answer.
 *  - GUESS (25 s): each team guesses, for every OTHER team, how many of that team's players picked the first option
 *    (out of those who answered). Any teammate can set the team's guesses; any teammate can lock them. It closes early
 *    once every team in the guessing has locked. A team's guesses stay within the team until the reveal.
 *    Stage 12.15-R (D-S1215R-02): guessing is mutual. The teams in a round's guessing are those where at least one
 *    player answered (picked one of the two); they guess each other. A team where everyone said "Rather not say" sits
 *    that round's guessing out: it isn't guessed and doesn't guess, so nobody scores on it and it scores nothing that
 *    round. Fewer than two teams in the guessing: there is nothing to guess, straight to the reveal.
 *  - REVEAL (8 s): each team's totals ("Team Sun: 2 Tea, 1 Coffee"), never who picked what, and every team's points.
 *
 * Points per rival guessed: 30 for the exact number, less the further off (30 × (1 − miss ÷ the rival's answers)), never
 * below 0. Every team in the guessing guesses every other team in it, so all of them have the same number of guesses
 * whatever their size: equal accuracy, equal points. Catch-up (the team kit): a team alone in last place and RIVALS_CATCH_UP_GAP+
 * behind gets +15 in a round where it scores. Every player scores their team's points.
 */
import type { SessionSeason } from "../../shared/season.js";
import type { GameTeams } from "../../shared/teams.js";
import { RIVALS_QUESTIONS, type RivalsQuestion } from "./packs/know-your-rivals.js";
import { catchUpTeam, dealAvoiding, teamIdsInGame, teamMembers } from "./teamKit.js";
import { moduleRng, type GameModule, type ModuleContext } from "./types.js";

export { RIVALS_ANSWER_MS, RIVALS_GUESS_MS, RIVALS_REVEAL_MS } from "./know-your-rivals-timing.js";

export const RIVALS_ROUNDS = 6;
export const RIVALS_POINTS = { exact: 30, catchUp: 15 } as const;
/** Catch-up for this game's scores (at most 30 per rival a round): about two rounds of one rival behind. */
export const RIVALS_CATCH_UP_GAP = 60;

export type RivalsChoice = "a" | "b" | "pass";
export interface RivalsGuess { value: number; by: string }
export interface RivalsTeamCount { teamId: string; answered: number; a: number; b: number; passed: number }
export interface RivalsGuessResult { teamId: string; target: string; guess: number | null; actual: number; size: number; points: number }
export interface RivalsRoundResult {
  counts: RivalsTeamCount[];
  guesses: RivalsGuessResult[];
  points: { teamId: string; points: number; bonus: number }[];
  /** Stage 12.15-R (D-S1215R-02): teams that sat this round's guessing out (nobody there answered). Absent before it. */
  sitOut?: string[];
}

export interface RivalsState {
  players: string[];
  teams: GameTeams;
  questions: RivalsQuestion[];
  round: number;
  phase: "answer" | "guess" | "reveal" | "finished";
  roundStartedAt: number | null;
  /** round -> player -> their own answer (never shown to anyone else). */
  answers: Record<number, Record<string, RivalsChoice>>;
  /** round -> guessing team -> target team -> its guess. */
  guesses: Record<number, Record<string, Record<string, RivalsGuess>>>;
  /** round -> team -> who locked its guesses. */
  locked: Record<number, Record<string, string>>;
  /** round -> the catch-up team for it (decided when it starts). */
  catchUp: Record<number, string | null>;
  results: Record<number, RivalsRoundResult>;
}

/** The questions for a game: the session's season (Christmas questions first in a Christmas session), unplayed first. */
export function rivalsQuestionsFor(season: SessionSeason | undefined, rng: () => number, avoid: readonly string[] = []): RivalsQuestion[] {
  const everyday = RIVALS_QUESTIONS.filter((x) => x.season === undefined);
  if (season !== "christmas") return dealAvoiding(everyday, rng, avoid);
  return [...dealAvoiding(RIVALS_QUESTIONS.filter((x) => x.season === "christmas"), rng, avoid), ...dealAvoiding(everyday, rng, avoid)];
}

/** A team's totals in a round: who answered (not "Rather not say"), and how many picked each option. */
export function teamCount(s: RivalsState, round: number, teamId: string): RivalsTeamCount {
  const ans = s.answers[round] ?? {};
  const members = teamMembers(s.teams, s.players, teamId);
  const a = members.filter((p) => ans[p] === "a").length;
  const b = members.filter((p) => ans[p] === "b").length;
  return { teamId, answered: a + b, a, b, passed: members.filter((p) => ans[p] === "pass").length };
}

/** Points for one guess: 30 when exact, less the further off, scaled by how many answered; never below 0. */
export function guessPoints(guess: number | null, actual: number, size: number): number {
  if (guess === null || size <= 0) return 0;
  return Math.max(0, Math.round(RIVALS_POINTS.exact * (1 - Math.abs(guess - actual) / size)));
}

/** Each team's total from the rounds that have been revealed (before `upto`, when given). */
export function rivalsTotals(s: RivalsState, upto?: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(teamIdsInGame(s.teams, s.players).map((t) => [t, 0]));
  for (const [r, res] of Object.entries(s.results)) {
    if (upto !== undefined && Number(r) >= upto) continue;
    for (const p of res.points) if (p.teamId in out) out[p.teamId] = (out[p.teamId] ?? 0) + p.points + p.bonus;
  }
  return out;
}

/**
 * Stage 12.15-R (D-S1215R-02): the teams in a round's guessing: those where at least one player answered (picked one
 * of the two). They guess each other, and only each other.
 */
export function guessingTeams(s: RivalsState, round: number): string[] {
  return teamIdsInGame(s.teams, s.players).filter((t) => teamCount(s, round, t).answered > 0);
}

function score(s: RivalsState, r: number): RivalsRoundResult {
  const ids = teamIdsInGame(s.teams, s.players);
  const counts = ids.map((t) => teamCount(s, r, t));
  const guessing = new Set(guessingTeams(s, r));
  const guesses: RivalsGuessResult[] = [];
  for (const t of ids) for (const c of counts) {
    // Mutual: a pair is scored only when both teams are in the guessing.
    if (c.teamId === t || !guessing.has(t) || !guessing.has(c.teamId)) continue;
    const g = s.guesses[r]?.[t]?.[c.teamId]?.value ?? null;
    guesses.push({ teamId: t, target: c.teamId, guess: g, actual: c.a, size: c.answered, points: guessPoints(g, c.a, c.answered) });
  }
  const points = ids.map((t) => {
    const p = guesses.filter((g) => g.teamId === t).reduce((n, g) => n + g.points, 0);
    return { teamId: t, points: p, bonus: s.catchUp[r] === t && p > 0 ? RIVALS_POINTS.catchUp : 0 };
  });
  return { counts, guesses, points, sitOut: ids.filter((t) => !guessing.has(t)) };
}

function startRound(s: RivalsState, at: number): void {
  s.phase = "answer";
  s.roundStartedAt = at;
  s.catchUp[s.round] = catchUpTeam(rivalsTotals(s, s.round), RIVALS_CATCH_UP_GAP);
}

function toReveal(s: RivalsState): void {
  s.results[s.round] = score(s, s.round);
  s.phase = "reveal";
}

/** The answers are in: on to the guesses, or straight to the totals when fewer than two teams answered (nothing to guess). */
function toGuess(s: RivalsState): void {
  if (guessingTeams(s, s.round).length >= 2) s.phase = "guess";
  else toReveal(s);
}

const onTeam = (s: RivalsState, p: string) => (s.players.includes(p) ? s.teams.members[p] : undefined);

export const knowYourRivalsModule: GameModule<RivalsState> & { onPlayStart(s: RivalsState, ctx: ModuleContext): void; contentIds(s: RivalsState): string[] } = {
  id: "know-your-rivals",
  actions: ["rivals-answer", "rivals-guess", "rivals-lock"],
  init({ players, seed, season, teams, avoid }) {
    const questions = rivalsQuestionsFor(season, moduleRng(seed), avoid).slice(0, RIVALS_ROUNDS);
    return { players: [...players], teams: teams ?? { list: [], members: {} }, questions, round: 0, phase: "answer", roundStartedAt: null, answers: {}, guesses: {}, locked: {}, catchUp: {}, results: {} };
  },
  onPlayStart(s, ctx) {
    if (s.roundStartedAt !== null) return;
    startRound(s, ctx.now);
  },
  contentIds: (s) => s.questions.map((x) => x.id),
  intent(s, actorId, action, payload) {
    if (!this.actions.includes(action)) return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.roundStartedAt === null || s.phase === "finished" || s.phase === "reveal") return { ok: false, reason: "PHASE_CLOSED" };
    if (Number(payload["round"]) !== s.round) return { ok: false, reason: "STALE_ROUND" };
    const team = onTeam(s, actorId);
    if (!team) return { ok: false, reason: "NOT_ON_A_TEAM" };
    if (action === "rivals-answer") {
      if (s.phase !== "answer") return { ok: false, reason: "PHASE_CLOSED" };
      const choice = payload["choice"];
      if (choice !== "a" && choice !== "b" && choice !== "pass") return { ok: false, reason: "INVALID_PAYLOAD" };
      (s.answers[s.round] ??= {})[actorId] = choice;
      // Everyone has answered: on to the guesses.
      if (s.players.filter((p) => onTeam(s, p)).every((p) => s.answers[s.round]?.[p] !== undefined)) toGuess(s);
      return { ok: true };
    }
    if (s.phase !== "guess") return { ok: false, reason: "PHASE_CLOSED" };
    // A team where nobody answered sits this round's guessing out (D-S1215R-02).
    const guessing = guessingTeams(s, s.round);
    if (!guessing.includes(team)) return { ok: false, reason: "SITTING_OUT" };
    if (s.locked[s.round]?.[team]) return { ok: false, reason: "TEAM_LOCKED" };
    if (action === "rivals-lock") {
      (s.locked[s.round] ??= {})[team] = actorId;
      if (guessing.every((t) => s.locked[s.round]?.[t])) toReveal(s);
      return { ok: true };
    }
    const target = payload["target"];
    if (typeof target !== "string" || target === team || !teamIdsInGame(s.teams, s.players).includes(target)) return { ok: false, reason: "INVALID_TARGET" };
    const size = teamCount(s, s.round, target).answered;
    if (size === 0) return { ok: false, reason: "NOBODY_ANSWERED" };
    const value = payload["value"];
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > size) return { ok: false, reason: "INVALID_PAYLOAD" };
    (((s.guesses[s.round] ??= {})[team] ??= {}))[target] = { value: value as number, by: actorId };
    return { ok: true };
  },
  abstain() {
    // "Rather not say" is an answer of its own; there is no sitting out of the guessing.
    return { ok: false, reason: "NO_ABSTAIN_IN_KNOW_YOUR_RIVALS" };
  },
  phase(s) {
    if (s.phase === "finished" || s.questions.length === 0) return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase === "answer" ? "question" : s.phase };
  },
  expirePhase(s, ctx) {
    if (s.phase === "answer") { toGuess(s); return; }
    if (s.phase === "guess") { toReveal(s); return; }
    if (s.phase !== "reveal") return;
    if (s.round + 1 >= s.questions.length) s.phase = "finished";
    else { s.round += 1; startRound(s, ctx.now); }
  },
  finished: (s) => s.phase === "finished" || s.questions.length === 0,
  scores(s, players) {
    const totals = rivalsTotals(s);
    return Object.fromEntries(players.map((p) => [p, totals[s.teams.members[p] ?? ""] ?? 0]));
  },
  participation(s, players) {
    const closed = s.phase === "finished" ? s.questions.length : s.phase === "reveal" ? s.round + 1 : s.round;
    const participation = Object.fromEntries(players.map((p) => {
      let actions = 0;
      for (const r of Object.values(s.answers)) if (r[p] !== undefined) actions++;
      for (const r of Object.values(s.guesses)) for (const t of Object.values(r)) for (const g of Object.values(t)) if (g.by === p) actions++;
      return [p, { done: closed, of: s.questions.length, actions }];
    }));
    return { participation, completedUnits: closed, totalUnits: s.questions.length };
  },
  anyAction: (s) => Object.values(s.answers).some((r) => Object.keys(r).length > 0),
  publicView(s, ctx) {
    void ctx;
    const ids = teamIdsInGame(s.teams, s.players);
    const totals = rivalsTotals(s);
    const teamTotals = ids.map((t) => ({ teamId: t, score: totals[t] ?? 0 }));
    const r = Math.min(s.round, Math.max(0, s.questions.length - 1));
    const q = s.questions[r];
    const base: Record<string, unknown> = { round: r, roundCount: s.questions.length, phase: s.phase, teamTotals, ...(s.catchUp[r] ? { catchUp: s.catchUp[r] } : {}) };
    if (!q) return base;
    base["question"] = { prompt: q.prompt, a: q.a, b: q.b };
    const ans = s.answers[r] ?? {};
    const inGame = s.players.filter((p) => onTeam(s, p));
    if (s.phase === "answer") return { ...base, answered: inGame.filter((p) => ans[p] !== undefined).length, of: inGame.length };
    if (s.phase === "guess") {
      // How many answered in each team is public (it bounds the guesses); what they picked is not.
      // Stage 12.15-R: and which teams are in the guessing (the others sit it out this round).
      const guessing = new Set(guessingTeams(s, r));
      return { ...base, sizes: ids.map((t) => ({ teamId: t, answered: teamCount(s, r, t).answered })), teamStatus: ids.map((t) => ({ teamId: t, locked: !!s.locked[r]?.[t], guessing: guessing.has(t) })) };
    }
    const recap = (i: number) => ({ prompt: s.questions[i]!.prompt, a: s.questions[i]!.a, b: s.questions[i]!.b, ...s.results[i]! });
    return { ...base, result: s.results[r] ? recap(r) : null, ...(s.phase === "finished" ? { rounds: s.questions.map((_, i) => i).filter((i) => s.results[i]).map(recap) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const base = this.publicView(s, ctx);
    const team = onTeam(s, actorId);
    if (!team) return base;
    const out: Record<string, unknown> = { ...base, myTeamId: team, myTotal: rivalsTotals(s)[team] ?? 0 };
    const mine = s.answers[s.round]?.[actorId];
    if (mine && s.phase !== "finished") out["myAnswer"] = mine;
    if (s.phase === "guess") {
      // Your own team's guesses (and who set them), and whether your team has locked them.
      out["teamGuesses"] = Object.fromEntries(Object.entries(s.guesses[s.round]?.[team] ?? {}).map(([t, g]) => [t, { value: g.value, by: g.by }]));
      const lockedBy = s.locked[s.round]?.[team];
      if (lockedBy) out["lockedBy"] = lockedBy;
    }
    return out;
  },
};
