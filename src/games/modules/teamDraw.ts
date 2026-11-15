/**
 * Stage 12.11 (docs/stage12/stage1211.md §2; D-S1211-02): Team Draw. Every team draws the same word at once: one
 * drawer per team, and the rest of the team guesses from their own team's drawing.
 *
 *  - Rounds: as many as the biggest team has players, from 3 to 5, so in most nights everyone draws once. Each team's
 *    drawing order is shuffled once (seeded) and goes round the team.
 *  - The drawer's phone shows the word; teammates see their own team's drawing live and type guesses. The first right
 *    guess solves it for the team. Points by the order teams solve: 100, 75, 55, 40; +25 catch-up for a team alone in
 *    last place and 100+ behind (from the rounds before this one). Every player scores their team's points.
 *  - Fair for uneven teams: one solve per team; wrong guesses are capped per TEAM (15 a round) and each one pauses the
 *    team's guess box for 2 s, so a bigger team can't out-type a smaller one.
 *  - Nobody guesses a word they have seen: a drawer can pass the pen (once a round, before drawing anything) to a
 *    teammate, and after 20 s without drawing (a blank page, or an idle one) a teammate may take it. Either way the
 *    pen moves only while someone who hasn't seen the word is left to guess. A taker keeps the drawing so far.
 *  - A round ends at 75 s (the room's phase clock) or as soon as every team has solved it; the reveal shows the word
 *    and every team's drawing side by side.
 *
 * Secrecy: the word is on the current drawer's phone only, until the reveal. During a round a phone gets its own
 * team's drawing and wrong guesses, never another team's; the TV and other teams see only each team's status (who
 * draws, strokes so far, solved and its place). Wrong guesses are dropped when the game ends; drawings are dropped when
 * their round's reveal ends. Future words never leave the server.
 */
import type { SessionSeason } from "../../shared/season.js";
import type { GameTeams } from "../../shared/teams.js";
import { DRAW_LIMITS, drawPromptsFor, letterPattern, validPiece, type DrawPiece } from "./draw.js";
import { answerMatches, catchUpTeam, teamIdsInGame, teamMembers } from "./teamKit.js";
import { moduleRng, seededShuffle, type DrawPrompt, type GameModule, type ModuleContext } from "./types.js";
import { TEAM_DRAW_TAKEOVER_MS } from "./team-draw-timing.js";
export { TEAM_DRAW_MS, TEAM_DRAW_REVEAL_MS, TEAM_DRAW_TAKEOVER_MS } from "./team-draw-timing.js";

export const TEAM_DRAW_ROUNDS = { min: 3, max: 5 } as const;
export const TEAM_DRAW_POINTS = { place: [100, 75, 55, 40], catchUp: 25 } as const;
export const TEAM_DRAW_GUESS_LENGTH = 40;
/** Wrong guesses a team may make in a round (all its guessers together). */
export const TEAM_DRAW_MAX_GUESSES = 15;
/** A wrong guess pauses the team's guess box for this long. */
export const TEAM_DRAW_LOCK_MS = 2_000;
/** Pen passes a team may make in a round. */
export const TEAM_DRAW_PASSES = 1;

export interface TeamDrawGuess { by: string; text: string }
export interface TeamDrawHandoff { from: string; to: string; how: "pass" | "takeover" }
export interface TeamDrawTeamRound {
  drawer: string;
  /** When the current drawer got the pen, and when they last drew (server ms): the takeover clock runs from the later. */
  drawerSince: number;
  lastDrawAt?: number;
  /** A teammate may take the pen now (opened by advance(); closed when the pen moves or the drawer draws). */
  takeoverOpen: boolean;
  /** Everyone who has held the pen this round: they have seen the word, so they can't guess it. */
  sawWord: string[];
  handoffs: TeamDrawHandoff[];
  pieces: DrawPiece[];
  /** Points of drawing on the page now (for the per-round limit). */
  inked: number;
  /** Anything was ever drawn this round (an undo or a clear doesn't reset it): guessing opens. */
  everDrew: boolean;
  /** Who drew something this round. */
  drewBy: string[];
  /** Drawing message times in the current rate window. */
  recent: number[];
  /** Wrong guesses this round (team-private), and each player's count. */
  guesses: TeamDrawGuess[];
  guessCounts: Record<string, number>;
  lockedUntil?: number;
  solvedAt?: number; solvedBy?: string; place?: number;
  points: number;
  /** The catch-up bonus included in `points`. */
  bonus: number;
}

export interface TeamDrawState {
  players: string[];
  teams: GameTeams;
  /** Each team's drawing order (shuffled once). */
  drawOrder: Record<string, string[]>;
  prompts: DrawPrompt[];
  round: number;
  phase: "draw" | "reveal" | "finished";
  /** When the current round began (server ms); null until play starts. */
  roundStartedAt: number | null;
  roundStarts: number[];
  /** The room's time scale when play started (1 in real play): module-owned lengths are multiplied by it. */
  scaleAtStart?: number;
  /** round -> team id -> its round. */
  rounds: Record<number, Record<string, TeamDrawTeamRound>>;
}

const sc = (s: TeamDrawState) => (s.scaleAtStart && s.scaleAtStart > 0 ? s.scaleAtStart : 1);

/** Rounds for a game: the biggest team's size, from 3 to 5. */
export function teamDrawRoundCount(teams: GameTeams, players: readonly string[]): number {
  const sizes = teamIdsInGame(teams, players).map((t) => teamMembers(teams, players, t).length);
  const biggest = sizes.length ? Math.max(...sizes) : 0;
  return Math.max(TEAM_DRAW_ROUNDS.min, Math.min(TEAM_DRAW_ROUNDS.max, biggest));
}

/** Each team's total from every recorded result (rounds before `upto`, when given). */
export function teamDrawTotals(s: TeamDrawState, upto?: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(teamIdsInGame(s.teams, s.players).map((t) => [t, 0]));
  for (const [r, teams] of Object.entries(s.rounds)) {
    if (upto !== undefined && Number(r) >= upto) continue;
    for (const [t, res] of Object.entries(teams)) if (t in out) out[t] = (out[t] ?? 0) + res.points;
  }
  return out;
}

/** When a teammate may take the pen (server ms): 20 s after the drawer got it or last drew, whichever is later. */
export function takeoverAt(s: TeamDrawState, tr: TeamDrawTeamRound): number {
  return Math.max(tr.drawerSince, tr.lastDrawAt ?? 0) + Math.round(TEAM_DRAW_TAKEOVER_MS * sc(s));
}

/** Would someone who hasn't seen the word be left to guess if `next` held the pen? */
function guesserLeft(s: TeamDrawState, team: string, tr: TeamDrawTeamRound, next: string): boolean {
  return teamMembers(s.teams, s.players, team).some((p) => p !== next && !tr.sawWord.includes(p));
}

/** Who a pass goes to: the next teammate in the drawing order who hasn't seen the word (and leaves a guesser). */
export function passTarget(s: TeamDrawState, team: string, tr: TeamDrawTeamRound): string | null {
  const order = s.drawOrder[team] ?? [];
  const at = order.indexOf(tr.drawer);
  for (let i = 1; i < order.length; i++) {
    const p = order[(at + i) % order.length]!;
    if (!tr.sawWord.includes(p) && guesserLeft(s, team, tr, p)) return p;
  }
  return null;
}

function canPass(s: TeamDrawState, team: string, tr: TeamDrawTeamRound): boolean {
  return tr.solvedAt === undefined && !tr.everDrew && tr.handoffs.filter((h) => h.how === "pass").length < TEAM_DRAW_PASSES && passTarget(s, team, tr) !== null;
}

function allSolved(s: TeamDrawState): boolean {
  const ids = teamIdsInGame(s.teams, s.players);
  return ids.length > 0 && ids.every((t) => s.rounds[s.round]?.[t]?.solvedAt !== undefined);
}

function startRound(s: TeamDrawState, at: number): void {
  s.phase = "draw";
  s.roundStartedAt = at;
  s.roundStarts[s.round] = at;
  const r: Record<string, TeamDrawTeamRound> = {};
  for (const t of teamIdsInGame(s.teams, s.players)) {
    const order = s.drawOrder[t] ?? [];
    if (!order.length) continue;
    const drawer = order[s.round % order.length]!;
    r[t] = { drawer, drawerSince: at, takeoverOpen: false, sawWord: [drawer], handoffs: [], pieces: [], inked: 0, everDrew: false, drewBy: [], recent: [], guesses: [], guessCounts: {}, points: 0, bonus: 0 };
  }
  s.rounds[s.round] = r;
}

function movePen(tr: TeamDrawTeamRound, to: string, how: "pass" | "takeover", now: number): void {
  tr.handoffs.push({ from: tr.drawer, to, how });
  tr.drawer = to;
  tr.drawerSince = now;
  delete tr.lastDrawAt;
  tr.takeoverOpen = false;
  if (!tr.sawWord.includes(to)) tr.sawWord.push(to);
  tr.recent = [];
}

/** The words a game may deal: the session's season (Christmas words first in a Christmas session), unplayed first. */
export function teamDrawPromptsFor(pool: readonly DrawPrompt[], season: SessionSeason | undefined, rng: () => number, avoid: readonly string[] = []): DrawPrompt[] {
  return drawPromptsFor(pool, season, rng, avoid);
}

const distinctStrokes = (pieces: readonly DrawPiece[]) => new Set(pieces.map((x) => x.s)).size;

export const teamDrawModule: GameModule<TeamDrawState> & { onPlayStart(s: TeamDrawState, ctx: ModuleContext): void; contentIds(s: TeamDrawState): string[] } = {
  id: "team-draw",
  actions: ["team-draw-strokes", "team-draw-undo", "team-draw-clear", "team-draw-guess", "team-draw-pass", "team-draw-takeover"],
  // Draw & Guess and Team Draw deal from the same word pack: one no-repeat history (D-S1211-01).
  contentPool: "draw-prompts",
  init({ players, seed, season, teams, avoid, drawPool, drawDealt }) {
    const rng = moduleRng(seed);
    const t: GameTeams = teams ?? { list: [], members: {} };
    const drawOrder: Record<string, string[]> = {};
    for (const id of teamIdsInGame(t, players)) drawOrder[id] = seededShuffle(teamMembers(t, players, id), rng);
    const rounds = teamDrawRoundCount(t, players);
    // Stage 12.17 (D-S1217-02): an Official game plays exactly the prompts the room's content selection chose (one per
    // round, each with an exact-hash approval); any other game deals from the shared pool by the usual rules.
    let source: readonly DrawPrompt[];
    if (drawDealt) {
      if (drawDealt.length < rounds) throw new Error(`Team Draw needs ${rounds} chosen prompts; it got ${drawDealt.length}.`);
      source = drawDealt;
    } else {
      if (!drawPool || drawPool.length === 0) throw new Error("Team Draw needs its prompts from the content library.");
      source = teamDrawPromptsFor(drawPool, season, rng, avoid);
    }
    const prompts = source.slice(0, rounds).map((p) => ({ ...p, ...(p.alts ? { alts: [...p.alts] } : {}) }));
    return { players: [...players], teams: t, drawOrder, prompts, round: 0, phase: "draw", roundStartedAt: null, roundStarts: [], rounds: {} };
  },
  onPlayStart(s, ctx) {
    if (s.roundStartedAt !== null) return;
    s.scaleAtStart = ctx.scale > 0 ? ctx.scale : 1;
    startRound(s, ctx.now);
  },
  contentIds: (s) => s.prompts.map((p) => p.id),
  intent(s, actorId, action, payload, ctx) {
    if (!this.actions.includes(action)) return { ok: false, reason: "UNKNOWN_ACTION" };
    if (s.phase !== "draw" || s.roundStartedAt === null) return { ok: false, reason: "PHASE_CLOSED" };
    const prompt = s.prompts[s.round];
    if (!prompt) return { ok: false, reason: "PHASE_CLOSED" };
    if (payload["round"] !== undefined && Number(payload["round"]) !== s.round) return { ok: false, reason: "STALE_ROUND" };
    const team = s.teams.members[actorId];
    const tr = team ? s.rounds[s.round]?.[team] : undefined;
    if (!team || !tr || !s.players.includes(actorId)) return { ok: false, reason: "NOT_ON_A_TEAM" };
    if (tr.solvedAt !== undefined) return { ok: false, reason: "ALREADY_SOLVED" };

    if (action === "team-draw-guess") {
      if (actorId === tr.drawer) return { ok: false, reason: "DRAWER_CANNOT_GUESS" };
      if (tr.sawWord.includes(actorId)) return { ok: false, reason: "YOU_SAW_THE_WORD" };
      if (!tr.everDrew) return { ok: false, reason: "NOTHING_DRAWN_YET" };
      const raw = payload["text"];
      if (typeof raw !== "string") return { ok: false, reason: "INVALID_PAYLOAD" };
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text || text.length > TEAM_DRAW_GUESS_LENGTH) return { ok: false, reason: "INVALID_PAYLOAD" };
      if (tr.lockedUntil !== undefined && ctx.now < tr.lockedUntil) return { ok: false, reason: "LOCKED" };
      if (tr.guesses.length >= TEAM_DRAW_MAX_GUESSES) return { ok: false, reason: "TOO_MANY_GUESSES" };
      tr.guessCounts[actorId] = (tr.guessCounts[actorId] ?? 0) + 1;
      if (!answerMatches([prompt.word, ...(prompt.alts ?? [])], text)) {
        tr.guesses.push({ by: actorId, text });
        tr.lockedUntil = ctx.now + Math.round(TEAM_DRAW_LOCK_MS * sc(s));
        return { ok: true, result: { right: false } };
      }
      const solvedSoFar = Object.values(s.rounds[s.round] ?? {}).filter((x) => x.solvedAt !== undefined).length;
      const place = solvedSoFar + 1;
      const bonus = catchUpTeam(teamDrawTotals(s, s.round)) === team ? TEAM_DRAW_POINTS.catchUp : 0;
      tr.solvedAt = ctx.now;
      tr.solvedBy = actorId;
      tr.place = place;
      tr.bonus = bonus;
      tr.points = (TEAM_DRAW_POINTS.place[place - 1] ?? TEAM_DRAW_POINTS.place[TEAM_DRAW_POINTS.place.length - 1]!) + bonus;
      delete tr.lockedUntil;
      tr.takeoverOpen = false;
      if (allSolved(s)) s.phase = "reveal";
      return { ok: true, result: { right: true, place } };
    }

    if (action === "team-draw-takeover") {
      if (actorId === tr.drawer) return { ok: false, reason: "ALREADY_DRAWING" };
      if (ctx.now < takeoverAt(s, tr)) return { ok: false, reason: "TAKEOVER_NOT_YET" };
      if (!guesserLeft(s, team, tr, actorId)) return { ok: false, reason: "NO_ONE_LEFT_TO_GUESS" };
      movePen(tr, actorId, "takeover", ctx.now);
      return { ok: true };
    }

    // Everything else is the drawer's.
    if (actorId !== tr.drawer) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (action === "team-draw-pass") {
      if (!canPass(s, team, tr)) return { ok: false, reason: "PASS_NOT_AVAILABLE" };
      movePen(tr, passTarget(s, team, tr)!, "pass", ctx.now);
      return { ok: true };
    }
    // Drawing messages share one rate window per team.
    tr.recent = tr.recent.filter((at) => ctx.now - at < 2000);
    if (tr.recent.length >= DRAW_LIMITS.messagesPer2s) return { ok: false, reason: "RATE_LIMITED" };
    tr.recent.push(ctx.now);
    if (action === "team-draw-strokes") {
      const pieces = payload["pieces"];
      if (!Array.isArray(pieces) || pieces.length === 0 || pieces.length > DRAW_LIMITS.piecesPerMessage || !pieces.every(validPiece)) return { ok: false, reason: "INVALID_PAYLOAD" };
      const n = pieces.reduce((k, x) => k + (x as DrawPiece).p.length / 2, 0);
      if (n > DRAW_LIMITS.pointsPerMessage) return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
      if (tr.inked + n > DRAW_LIMITS.pointsPerTurn) return { ok: false, reason: "DRAWING_FULL" };
      if (distinctStrokes([...tr.pieces, ...(pieces as DrawPiece[])]) > DRAW_LIMITS.strokesPerTurn) return { ok: false, reason: "DRAWING_FULL" };
      for (const x of pieces as DrawPiece[]) tr.pieces.push({ s: x.s, c: x.c, w: x.w, p: [...x.p] });
      tr.inked += n;
      tr.everDrew = true;
      if (!tr.drewBy.includes(actorId)) tr.drewBy.push(actorId);
    } else if (action === "team-draw-undo") {
      // Removes the whole latest stroke (every piece of it).
      if (tr.pieces.length) {
        const last = Math.max(...tr.pieces.map((x) => x.s));
        tr.pieces = tr.pieces.filter((x) => x.s !== last);
        tr.inked = tr.pieces.reduce((k, x) => k + x.p.length / 2, 0);
      }
    } else {
      tr.pieces = [];
      tr.inked = 0;
    }
    tr.lastDrawAt = ctx.now;
    tr.takeoverOpen = false;
    return { ok: true, result: { points: tr.inked } };
  },
  abstain() {
    // No sitting out: a drawer who can't go on passes the pen; a teammate takes it from an idle drawer.
    return { ok: false, reason: "NO_ABSTAIN_IN_TEAM_DRAW" };
  },
  phase(s) {
    if (s.phase === "finished" || s.prompts.length === 0) return null;
    return { key: `${s.round}:${s.phase}`, kind: s.phase };
  },
  expirePhase(s, ctx) {
    if (s.phase === "draw") { s.phase = "reveal"; return; }
    if (s.phase !== "reveal") return;
    // The round's drawings were for its reveal; drop them (and the rate window) before the next round.
    for (const tr of Object.values(s.rounds[s.round] ?? {})) { tr.pieces = []; tr.recent = []; }
    if (s.round + 1 >= s.prompts.length) s.phase = "finished";
    else { s.round += 1; startRound(s, ctx.now); }
  },
  dueAt(s) {
    if (s.phase !== "draw" || s.roundStartedAt === null) return undefined;
    let due: number | undefined;
    for (const tr of Object.values(s.rounds[s.round] ?? {})) {
      if (tr.solvedAt !== undefined || tr.takeoverOpen) continue;
      const at = takeoverAt(s, tr);
      if (due === undefined || at < due) due = at;
    }
    return due;
  },
  advance(s, ctx) {
    if (s.phase !== "draw" || s.roundStartedAt === null) return;
    for (const tr of Object.values(s.rounds[s.round] ?? {})) if (tr.solvedAt === undefined && !tr.takeoverOpen && ctx.now >= takeoverAt(s, tr)) tr.takeoverOpen = true;
  },
  finished: (s) => s.phase === "finished" || s.prompts.length === 0,
  onFinish(s) {
    // Wrong guesses were for teammates during their round, and drawings for the reveal: nobody needs them now.
    for (const r of Object.values(s.rounds)) for (const tr of Object.values(r)) { tr.guesses = []; tr.pieces = []; tr.recent = []; delete tr.lockedUntil; }
  },
  scores(s, players) {
    const totals = teamDrawTotals(s);
    return Object.fromEntries(players.map((p) => [p, totals[s.teams.members[p] ?? ""] ?? 0]));
  },
  participation(s, players) {
    const closed = s.phase === "draw" ? s.round : Math.min(s.round + 1, s.prompts.length);
    const participation = Object.fromEntries(players.map((p) => {
      let actions = 0;
      for (const r of Object.values(s.rounds)) for (const tr of Object.values(r)) actions += (tr.guessCounts[p] ?? 0) + (tr.drewBy.includes(p) ? 1 : 0);
      return [p, { done: closed, of: s.prompts.length, actions }];
    }));
    return { participation, completedUnits: closed, totalUnits: s.prompts.length };
  },
  anyAction: (s) => Object.values(s.rounds).some((r) => Object.values(r).some((tr) => tr.everDrew || tr.solvedAt !== undefined || Object.keys(tr.guessCounts).length > 0)),
  publicView(s, ctx) {
    void ctx;
    const r = Math.min(s.round, Math.max(0, s.prompts.length - 1));
    const prompt = s.prompts[r];
    const ids = teamIdsInGame(s.teams, s.players);
    const totals = teamDrawTotals(s);
    const teamTotals = ids.map((t) => ({ teamId: t, score: totals[t] ?? 0 }));
    if (!prompt) return { round: 0, roundCount: 0, phase: s.phase, teamStatus: [], teamTotals };
    const drawing = s.phase === "draw";
    const teamStatus = ids.map((t) => {
      const tr = s.rounds[r]?.[t];
      return {
        teamId: t, drawerId: tr?.drawer ?? null, strokes: tr ? distinctStrokes(tr.pieces) : 0, solved: tr?.solvedAt !== undefined,
        ...(tr?.place ? { place: tr.place } : {}), guesses: tr?.guesses.length ?? 0,
        ...(tr?.handoffs.length ? { handoff: tr.handoffs[tr.handoffs.length - 1]!.how } : {}),
      };
    });
    const base: Record<string, unknown> = {
      round: r, roundCount: s.prompts.length, phase: s.phase, letters: letterPattern(prompt.word), teamStatus, teamTotals,
      ...(drawing && s.roundStartedAt !== null ? { roundStartedAt: s.roundStartedAt } : {}),
    };
    if (drawing) return base;
    const recap = (i: number, withPieces: boolean) => {
      const p = s.prompts[i]!;
      const started = s.roundStarts[i] ?? null;
      return {
        word: p.word,
        teams: ids.map((t) => {
          const tr = s.rounds[i]?.[t];
          return {
            teamId: t, drawers: tr ? [...tr.drewBy] : [], solved: tr?.solvedAt !== undefined, place: tr?.place ?? null, points: tr?.points ?? 0, bonus: tr?.bonus ?? 0,
            ...(tr?.solvedBy ? { solvedBy: tr.solvedBy } : {}),
            ...(started !== null && tr?.solvedAt !== undefined ? { seconds: Math.max(0, Math.round((tr.solvedAt - started) / 1000 / sc(s))) } : {}),
            ...(withPieces ? { pieces: tr?.pieces ?? [] } : {}),
          };
        }),
      };
    };
    const played = Array.from({ length: Math.min(s.round + 1, s.prompts.length) }, (_, i) => i);
    return { ...base, result: recap(r, s.phase === "reveal"), ...(s.phase === "finished" ? { rounds: played.map((i) => recap(i, false)) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const base = this.publicView(s, ctx);
    const team = s.teams.members[actorId];
    if (!team || !s.players.includes(actorId)) return base;
    const out: Record<string, unknown> = { ...base, myTeamId: team, myTotal: teamDrawTotals(s)[team] ?? 0 };
    const prompt = s.prompts[s.round];
    const tr = s.rounds[s.round]?.[team];
    if (s.phase !== "draw" || !prompt || !tr) return out;
    const amDrawing = tr.drawer === actorId;
    const saw = tr.sawWord.includes(actorId);
    const solved = tr.solvedAt !== undefined;
    out["drawerId"] = tr.drawer;
    out["amDrawing"] = amDrawing;
    // Your own team's drawing and wrong guesses only; the word on the drawer's phone only.
    out["pieces"] = tr.pieces;
    out["teamGuesses"] = tr.guesses.map((g) => ({ by: g.by, text: g.text }));
    out["guessesLeft"] = Math.max(0, TEAM_DRAW_MAX_GUESSES - tr.guesses.length);
    out["lockMs"] = Math.round(TEAM_DRAW_LOCK_MS * sc(s));
    if (tr.lockedUntil !== undefined && ctx.now < tr.lockedUntil) out["lockedUntil"] = tr.lockedUntil;
    if (tr.handoffs.length) out["handoff"] = { ...tr.handoffs[tr.handoffs.length - 1]! };
    if (amDrawing) {
      out["myWord"] = prompt.word;
      out["canPass"] = canPass(s, team, tr);
      const to = canPass(s, team, tr) ? passTarget(s, team, tr) : null;
      if (to) out["passTo"] = to;
    } else {
      out["sawWord"] = saw;
      out["canGuess"] = !saw && tr.everDrew && !solved;
      if (!solved && guesserLeft(s, team, tr, actorId)) {
        out["takeoverAt"] = takeoverAt(s, tr);
        out["canTakeOver"] = ctx.now >= takeoverAt(s, tr);
      }
    }
    out["myGuesses"] = tr.guessCounts[actorId] ?? 0;
    if (solved) { out["mySolved"] = true; out["myPlace"] = tr.place; out["solvedBy"] = tr.solvedBy; }
    return out;
  },
};
