/**
 * Draw & Guess (Stage 5, Practice-only): one player draws a secret word,
 * everyone else races to guess it.
 *
 * Turns: the server picks the drawing order (seeded shuffle of the roster)
 * and plays min(players, 6) turns, so nobody draws twice in a 6-or-fewer
 * room. Each turn has a DRAW phase (the policy's phaseMs.draw) and a short
 * REVEAL. A turn ends early when every guesser has got it or sat it out, or
 * when the drawer gives up.
 *
 * Privacy and fairness:
 *  - The word is in the drawer's own projection only, during their draw
 *    phase. Everyone else (TV, spectators, late joiners) gets the drawing
 *    and the word's letter pattern, and the word itself at the reveal.
 *  - Guesses are checked on the server. A wrong guess's text is never
 *    stored, shown or logged: only that a guess was made (a count).
 *  - Drawing arrives in batches ("pieces" of strokes, coordinates 0..1000):
 *    size, count and rate are bounded per message and per turn.
 *  - A drawer who disconnects simply runs out the turn's clock; the round
 *    moves on without anybody needing to act. A drawer who gives up ends
 *    the turn at once (guesses already right still score).
 *
 * Practice scoring: guessers 100 / 80 / 60, then 50, in the order they got
 * it; the drawer 50 for each player who got it. A turn nobody guessed
 * scores nothing for anyone.
 */
import { DRAW_PROMPTS, type DrawPrompt } from "./packs/draw-prompts.js";
import { moduleRng, seededShuffle, type GameModule, type ModuleContext } from "./types.js";

export const DRAW_MAX_TURNS = 6;
export const DRAW_GUESS_POINTS = [100, 80, 60] as const;
export const DRAW_GUESS_FLOOR = 50;
export const DRAW_DRAWER_POINTS = 50;
export const DRAW_PALETTE = 8;
export const DRAW_SIZES = 3;
/** Bounds on drawing data (D-S5: no paid services; bounded payloads). */
export const DRAW_LIMITS = {
  piecesPerMessage: 24,
  pointsPerMessage: 400,
  pointsPerTurn: 5000,
  strokesPerTurn: 300,
  /** At most this many drawing messages in any 2-second window. */
  messagesPer2s: 16,
  guessLength: 40,
  guessesPerTurn: 20,
  swapsPerTurn: 1,
} as const;

/** A piece of a stroke: stroke number s, colour index c, size index w, flat [x,y,x,y...] in 0..1000. */
export interface DrawPiece { s: number; c: number; w: number; p: number[] }
export interface DrawTurn {
  drawer: string;
  promptIdx: number;
  swaps: number;
  pieces: DrawPiece[];
  points: number;
  correct: string[];
  guessCounts: Record<string, number>;
  skipped: string[];
  gaveUp?: boolean;
  /** Message times in the current rate window. */
  recent: number[];
}
export interface DrawState {
  players: string[];
  order: string[];
  prompts: DrawPrompt[];
  /** Next unused prompt for a swap. */
  reserve: number;
  turn: number;
  phase: "draw" | "reveal" | "finished";
  turns: DrawTurn[];
}

/** Lower case, no accents or punctuation, no spaces, no leading article. */
export function normalizeGuess(text: string): string {
  let t = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  t = t.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(a|an|the) /, "");
  return t.replace(/ /g, "");
}

/** A word and its singular forms ("candles" -> candles, candle; "boxes" -> boxes, boxe, box). */
function forms(t: string): string[] {
  const out = [t];
  if (t.length > 3 && t.endsWith("s")) out.push(t.slice(0, -1));
  if (t.length > 4 && t.endsWith("es")) out.push(t.slice(0, -2));
  return out;
}

export function guessMatches(prompt: DrawPrompt, text: string): boolean {
  const g = normalizeGuess(text);
  if (!g) return false;
  const mine = forms(g);
  return [prompt.word, ...(prompt.alts ?? [])].some((w) => forms(normalizeGuess(w)).some((f) => mine.includes(f)));
}

/** The word's shape without its letters: "candy cane" -> [5, 4]. */
export function letterPattern(word: string): number[] {
  return word.split(/\s+/).filter(Boolean).map((w) => w.length);
}

export function drawTurnPoints(t: DrawTurn): Record<string, number> {
  const out: Record<string, number> = {};
  t.correct.forEach((pid, i) => { out[pid] = (out[pid] ?? 0) + (DRAW_GUESS_POINTS[i] ?? DRAW_GUESS_FLOOR); });
  if (t.correct.length) out[t.drawer] = (out[t.drawer] ?? 0) + DRAW_DRAWER_POINTS * t.correct.length;
  return out;
}

const cur = (s: DrawState) => s.turns[s.turn];
const promptOf = (s: DrawState, t: DrawTurn) => s.prompts[t.promptIdx]!;

function guessersDone(s: DrawState, t: DrawTurn, ctx: ModuleContext): boolean {
  const guessers = ctx.active.filter((p) => p !== t.drawer);
  return guessers.every((p) => t.correct.includes(p) || t.skipped.includes(p));
}

function settle(s: DrawState, ctx: ModuleContext): void {
  const t = cur(s);
  if (s.phase === "draw" && t && (t.gaveUp || guessersDone(s, t, ctx))) s.phase = "reveal";
}

function validPiece(x: unknown): x is DrawPiece {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const okInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  return okInt(o["s"], 0, 10_000) && okInt(o["c"], 0, DRAW_PALETTE - 1) && okInt(o["w"], 0, DRAW_SIZES - 1)
    && Array.isArray(o["p"]) && o["p"].length >= 2 && o["p"].length % 2 === 0 && o["p"].every((v) => okInt(v, 0, 1000));
}

/** Rounds whose result is final (revealed or past). */
function closedTurns(s: DrawState): number[] {
  const upto = s.phase === "draw" ? s.turn : s.turn + 1;
  return Array.from({ length: Math.min(upto, s.turns.length) }, (_, i) => i);
}

export const drawModule: GameModule<DrawState> = {
  id: "draw-guess",
  actions: ["draw-strokes", "draw-undo", "draw-clear", "draw-swap", "draw-guess"],
  init({ players, seed }) {
    const rng = moduleRng(seed);
    const order = seededShuffle(players, rng);
    const turnCount = Math.min(order.length, DRAW_MAX_TURNS);
    const prompts = seededShuffle(DRAW_PROMPTS, rng).slice(0, turnCount * (1 + DRAW_LIMITS.swapsPerTurn));
    const turns: DrawTurn[] = Array.from({ length: turnCount }, (_, i) => ({
      drawer: order[i]!, promptIdx: i, swaps: 0, pieces: [], points: 0, correct: [], guessCounts: {}, skipped: [], recent: [],
    }));
    return { players: [...players], order, prompts, reserve: turnCount, turn: 0, phase: "draw", turns };
  },
  intent(s, actorId, action, payload, ctx) {
    if (s.phase !== "draw") return { ok: false, reason: "PHASE_CLOSED" };
    const t = cur(s)!;
    if (action === "draw-guess") {
      if (actorId === t.drawer) return { ok: false, reason: "DRAWER_CANNOT_GUESS" };
      if (t.correct.includes(actorId)) return { ok: false, reason: "ALREADY_ANSWERED" };
      if (t.skipped.includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
      const text = payload["text"];
      if (typeof text !== "string" || !text.trim() || text.length > DRAW_LIMITS.guessLength) return { ok: false, reason: "INVALID_PAYLOAD" };
      const n = t.guessCounts[actorId] ?? 0;
      if (n >= DRAW_LIMITS.guessesPerTurn) return { ok: false, reason: "TOO_MANY_GUESSES" };
      t.guessCounts[actorId] = n + 1;
      // The guess's text is used here and dropped: never stored, never shown.
      const correct = guessMatches(promptOf(s, t), text);
      if (correct) t.correct.push(actorId);
      settle(s, ctx);
      return { ok: true, result: { correct, order: correct ? t.correct.length : undefined } };
    }
    // Everything else is the drawer's.
    if (actorId !== t.drawer) return { ok: false, reason: "NOT_YOUR_TURN" };
    // Drawing messages share one rate window.
    t.recent = t.recent.filter((at) => ctx.now - at < 2000);
    if (t.recent.length >= DRAW_LIMITS.messagesPer2s) return { ok: false, reason: "RATE_LIMITED" };
    t.recent.push(ctx.now);
    if (action === "draw-strokes") {
      const pieces = payload["pieces"];
      if (!Array.isArray(pieces) || pieces.length === 0 || pieces.length > DRAW_LIMITS.piecesPerMessage || !pieces.every(validPiece)) return { ok: false, reason: "INVALID_PAYLOAD" };
      const n = pieces.reduce((k, x) => k + (x as DrawPiece).p.length / 2, 0);
      if (n > DRAW_LIMITS.pointsPerMessage) return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
      if (t.points + n > DRAW_LIMITS.pointsPerTurn) return { ok: false, reason: "DRAWING_FULL" };
      const strokes = new Set([...t.pieces, ...(pieces as DrawPiece[])].map((x) => x.s));
      if (strokes.size > DRAW_LIMITS.strokesPerTurn) return { ok: false, reason: "DRAWING_FULL" };
      for (const x of pieces as DrawPiece[]) t.pieces.push({ s: x.s, c: x.c, w: x.w, p: [...x.p] });
      t.points += n;
      return { ok: true, result: { points: t.points } };
    }
    if (action === "draw-undo") {
      // Removes the whole latest stroke (every piece of it).
      if (!t.pieces.length) return { ok: true };
      const last = Math.max(...t.pieces.map((x) => x.s));
      t.pieces = t.pieces.filter((x) => x.s !== last);
      t.points = t.pieces.reduce((k, x) => k + x.p.length / 2, 0);
      return { ok: true };
    }
    if (action === "draw-clear") {
      t.pieces = [];
      t.points = 0;
      return { ok: true };
    }
    if (action === "draw-swap") {
      // A new word, once per turn, before anything is drawn and before anyone has guessed it.
      if (t.swaps >= DRAW_LIMITS.swapsPerTurn || t.pieces.length > 0 || t.correct.length > 0 || s.reserve >= s.prompts.length) return { ok: false, reason: "SWAP_NOT_AVAILABLE" };
      t.promptIdx = s.reserve++;
      t.swaps += 1;
      return { ok: true };
    }
    return { ok: false, reason: "UNKNOWN_ACTION" };
  },
  abstain(s, actorId, ctx) {
    if (s.phase !== "draw") return { ok: false, reason: "PHASE_CLOSED" };
    const t = cur(s)!;
    if (actorId === t.drawer) {
      // The drawer gives up: the turn is revealed at once (guesses already right still score).
      t.gaveUp = true;
    } else {
      if (t.correct.includes(actorId)) return { ok: false, reason: "ALREADY_ANSWERED" };
      if (t.skipped.includes(actorId)) return { ok: false, reason: "ALREADY_ABSTAINED" };
      t.skipped.push(actorId);
    }
    settle(s, ctx);
    return { ok: true };
  },
  phase(s) {
    if (s.phase === "finished") return null;
    return { key: `${s.turn}:${s.phase}`, kind: s.phase };
  },
  expirePhase(s) {
    if (s.phase === "draw") s.phase = "reveal";
    else if (s.phase === "reveal") {
      if (s.turn + 1 >= s.turns.length) s.phase = "finished";
      else { s.turn += 1; s.phase = "draw"; }
    }
  },
  finished: (s) => s.phase === "finished",
  scores(s, players) {
    const out: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const i of closedTurns(s)) {
      const t = s.turns[i]!;
      for (const [pid, pts] of Object.entries(drawTurnPoints(t))) if (pid in out) out[pid] = (out[pid] ?? 0) + pts;
    }
    return out;
  },
  participation(s, players) {
    const closed = closedTurns(s);
    const participation = Object.fromEntries(players.map((p) => {
      const drew = closed.filter((i) => s.turns[i]!.drawer === p && s.turns[i]!.pieces.length > 0).length;
      const got = closed.filter((i) => s.turns[i]!.correct.includes(p)).length;
      const guesses = closed.reduce((n, i) => n + (s.turns[i]!.guessCounts[p] ?? 0), 0);
      return [p, { done: drew + got, of: s.turns.length, actions: guesses + drew }];
    }));
    return { participation, completedUnits: closed.length, totalUnits: s.turns.length };
  },
  anyAction: (s) => s.turns.some((t) => t.pieces.length > 0 || Object.keys(t.guessCounts).length > 0),
  publicView(s) {
    const i = Math.min(s.turn, s.turns.length - 1);
    const t = s.turns[i]!;
    const p = promptOf(s, t);
    const reveal = s.phase !== "draw";
    const guessers = s.players.filter((x) => x !== t.drawer);
    const base: Record<string, unknown> = {
      turn: i, turnCount: s.turns.length, phase: s.phase, drawerId: t.drawer,
      pieces: t.pieces,
      letters: letterPattern(p.word),
      correct: t.correct.map((pid, k) => ({ playerId: pid, order: k + 1 })),
      guessers: guessers.length,
      skipped: t.skipped.length,
    };
    if (!reveal) return base;
    const recap = (k: number) => {
      const tt = s.turns[k]!;
      return { drawerId: tt.drawer, word: promptOf(s, tt).word, correct: tt.correct.length, gaveUp: !!tt.gaveUp, points: drawTurnPoints(tt) };
    };
    return { ...base, result: recap(i), ...(s.phase === "finished" ? { turns: s.turns.map((_, k) => recap(k)) } : {}) };
  },
  playerView(s, actorId, ctx) {
    const i = Math.min(s.turn, s.turns.length - 1);
    const t = s.turns[i]!;
    const drawing = s.phase === "draw" && t.drawer === actorId;
    return {
      ...this.publicView(s, ctx),
      ...(drawing ? { myWord: promptOf(s, t).word, canSwap: t.swaps < DRAW_LIMITS.swapsPerTurn && t.pieces.length === 0 && t.correct.length === 0 && s.reserve < s.prompts.length } : {}),
      amDrawing: t.drawer === actorId,
      myCorrect: t.correct.includes(actorId),
      myGuesses: t.guessCounts[actorId] ?? 0,
      mySkipped: t.skipped.includes(actorId),
      myTotal: this.scores(s, [actorId])[actorId] ?? 0,
    };
  },
};
