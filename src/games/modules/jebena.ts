/**
 * Jebena Rush (Stage 9.1, practice-only, casual rooms): "Name it. Pass it.
 * Beat the steam." Spec: docs/stage9/stage91.md.
 *
 * Players sit in a seeded order. The player holding the jebena has one turn
 * (10 seconds, plus a small network grace) to name an unused answer in the
 * category. Accepted: the jebena passes to the next player who still has
 * hearts. Not accepted: they're told why and may try again; the deadline
 * doesn't move. Time out: one heart lost, a new category, and the jebena
 * passes. No hearts left: out. The last player with hearts keeps the jebena.
 *
 * The server owns everything here: the order, the turn, the category, the
 * answers already used, the hearts. The turn's clock is RoomEngine's phase
 * clock (phase "turn:<n>", policy phaseMs.turn), so a deadline is processed
 * once, at its own instant, even when nobody is connected; every answer
 * names the turn it was typed for, so a late, replayed or duplicated send
 * for a turn that has moved on changes nothing (STALE_TURN). The match limit
 * is the policy's game deadline.
 *
 * Privacy: the bank (and any unused answer) is never in a view. The public
 * view has played facts only (accepted answers, timeouts, outs, categories);
 * a player's own view adds their own last attempt this turn.
 */
import { moduleRng, seededShuffle, type GameModule, type ModuleContext } from "./types.js";
import { JEBENA_BANK_VERSION, JEBENA_CATEGORIES, type JebenaCategory } from "./packs/jebena-banks.js";
import { answerName, matchJebena } from "./jebenaMatch.js";
import { JEBENA_DEFAULT_HEARTS, JEBENA_HEART_CHOICES } from "../settings.js";

/** Bump when the rules below change (turn length, hearts, rotation, points). */
export const JEBENA_RULES_VERSION = 1;
/** A turn, as players see it (before the test time scale). */
export const JEBENA_TURN_MS = 10_000;
/** Network grace: the server takes an answer until the turn's deadline plus this (src/server/lifecycle.ts phaseMs.turn). */
export const JEBENA_GRACE_MS = 500;
export const JEBENA_MAX_ATTEMPTS = 20;
export const JEBENA_MAX_INPUT = 40;
export const JEBENA_POINTS = { perOutlasted: 100, perHeart: 10 } as const;
/** How many recent played facts the views carry. */
const LOG_IN_VIEW = 24;

export type JebenaVerdict = "accepted" | "used" | "not-in-bank" | "ambiguous" | "near-miss" | "empty";

export interface JebenaPlayerState {
  hearts: number;
  /** 1 for the first player out, 2 for the next…; null while still in. */
  outOrder: number | null;
  answers: number;
  timeouts: number;
  /** Every answer typed (accepted or not): the player took part. */
  tries: number;
  satOut?: boolean;
}

export interface JebenaLogEntry {
  seq: number;
  turn: number;
  kind: "accepted" | "timeout" | "out" | "category" | "sat-out";
  player?: string;
  answerId?: string;
  answer?: string;
  via?: "exact" | "alias" | "plural" | "typo";
  categoryId?: string;
  hearts?: number;
  at: number;
}

export interface JebenaAttempt { turn: number; text: string; verdict: JebenaVerdict; reason?: string; answer?: string }

export interface JebenaState {
  rulesVersion: number;
  bankVersion: string;
  seed: number;
  startHearts: number;
  order: string[];
  per: Record<string, JebenaPlayerState>;
  /** Category ids in a seeded order; the match walks through them. */
  rotation: string[];
  rotationAt: number;
  category: string;
  categoryRound: number;
  /** Answer ids used so far, per category (they stay used if the category comes back). */
  used: Record<string, string[]>;
  turn: { n: number; player: string; attempts: number } | null;
  outCount: number;
  log: JebenaLogEntry[];
  /** Private: each player's last attempt (only for the turn it was made in). */
  attempts: Record<string, JebenaAttempt>;
  end: null | "last-standing" | "banks-exhausted";
}

const categoryById = (id: string): JebenaCategory => {
  const c = JEBENA_CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown Jebena category ${id}`);
  return c;
};

const alive = (s: JebenaState) => s.order.filter((p) => s.per[p]!.outOrder === null);
const exhausted = (s: JebenaState, cat: string) => (s.used[cat]?.length ?? 0) >= categoryById(cat).answers.length;

function log(s: JebenaState, e: Omit<JebenaLogEntry, "seq">): void {
  s.log.push({ seq: s.log.length + 1, ...e });
}

/** The next player in seat order after `from` who still has hearts. */
function nextAfter(s: JebenaState, from: string): string | null {
  const i = s.order.indexOf(from);
  for (let k = 1; k <= s.order.length; k++) {
    const p = s.order[(i + k) % s.order.length]!;
    if (s.per[p]!.outOrder === null) return p;
  }
  return null;
}

/**
 * The one way a match ends inside the module: no turn, and no private
 * feedback kept (review 6811101479: a last rejected try must not outlive its
 * turn in the saved state). The room's own match limit ends a game through
 * `onFinish`, which clears the same.
 */
function finish(s: JebenaState, end: NonNullable<JebenaState["end"]>): void {
  s.end = end;
  s.turn = null;
  s.attempts = {};
}

/** End the match if one player (or nobody) is left; true if it ended. */
function endIfOver(s: JebenaState): boolean {
  if (s.end) return true;
  if (alive(s).length <= 1) {
    finish(s, "last-standing");
    return true;
  }
  return false;
}

/** The next category in the rotation that still has unused answers; none left ends the match. */
function nextCategory(s: JebenaState, at: number, turn: number): boolean {
  for (let k = 1; k <= s.rotation.length; k++) {
    const idx = (s.rotationAt + k) % s.rotation.length;
    const cat = s.rotation[idx]!;
    if (!exhausted(s, cat)) {
      s.rotationAt = idx;
      s.category = cat;
      s.categoryRound += 1;
      log(s, { turn, kind: "category", categoryId: cat, at });
      return true;
    }
  }
  finish(s, "banks-exhausted");
  return false;
}

/** Pass the jebena from `from` to the next player still in. */
function passFrom(s: JebenaState, from: string): void {
  if (endIfOver(s)) return;
  const next = nextAfter(s, from);
  if (!next) { finish(s, "last-standing"); return; }
  s.turn = { n: (s.turn?.n ?? 0) + 1, player: next, attempts: 0 };
  s.attempts = {};
}

/** Places: still in above out; among those in, more hearts higher (equal hearts share); out by when (later higher). */
export function jebenaStandings(s: JebenaState): { id: string; place: number; hearts: number; out: boolean; satOut: boolean; answers: number; timeouts: number; points: number }[] {
  const pts = jebenaPoints(s);
  const rows = s.order.map((id) => {
    const p = s.per[id]!;
    return { id, hearts: p.outOrder === null ? p.hearts : 0, out: p.outOrder !== null, outOrder: p.outOrder, satOut: !!p.satOut, answers: p.answers, timeouts: p.timeouts, points: pts[id] ?? 0 };
  });
  const key = (r: (typeof rows)[number]) => (r.out ? -1000 + (r.outOrder ?? 0) : r.hearts);
  rows.sort((x, y) => key(y) - key(x));
  let place = 0;
  let prevKey: number | null = null;
  return rows.map((r, i) => {
    const k = key(r);
    if (prevKey === null || k !== prevKey) place = i + 1;
    prevKey = k;
    return { id: r.id, place, hearts: r.hearts, out: r.out, satOut: r.satOut, answers: r.answers, timeouts: r.timeouts, points: r.points };
  });
}

/** Points (§3): 100 for each player you outlast, 10 for each heart you keep while still in. */
export function jebenaPoints(s: JebenaState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of s.order) {
    const p = s.per[id]!;
    const outlasted = s.order.filter((o) => o !== id && s.per[o]!.outOrder !== null && (p.outOrder === null || s.per[o]!.outOrder! < p.outOrder)).length;
    out[id] = outlasted * JEBENA_POINTS.perOutlasted + (p.outOrder === null ? p.hearts * JEBENA_POINTS.perHeart : 0);
  }
  return out;
}

function publicView(s: JebenaState, scale = 1) {
  const cat = categoryById(s.category);
  const thisCategory = s.log.filter((e) => e.kind === "accepted" && e.categoryId === s.category).map((e) => ({ answer: e.answer!, player: e.player! }));
  return {
    rulesVersion: s.rulesVersion,
    startHearts: s.startHearts,
    // The turn as players see it, and the network grace on top (both under the test time scale; 1 in real play).
    turnMs: Math.round(JEBENA_TURN_MS * scale),
    graceMs: Math.round(JEBENA_GRACE_MS * scale),
    order: s.order.map((id) => {
      const p = s.per[id]!;
      // Out is out: a player who left keeps no hearts in any view (review 6808081378, 3).
      return { id, hearts: p.outOrder === null ? p.hearts : 0, out: p.outOrder !== null, satOut: !!p.satOut, answers: p.answers, timeouts: p.timeouts };
    }),
    turn: s.turn ? { n: s.turn.n, player: s.turn.player } : null,
    category: { id: cat.id, name: cat.name, definition: cat.definition, round: s.categoryRound, named: thisCategory.length },
    named: thisCategory.slice(-12),
    log: s.log.slice(-LOG_IN_VIEW),
    end: s.end,
    // Always (public facts only): when the room's match limit ends the game, the module's own
    // `end` stays null, and the results still need the places.
    standings: jebenaStandings(s),
  };
}

export const jebenaModule: GameModule<JebenaState> = {
  id: "jebena-rush",
  actions: ["jebena-answer"],
  init({ players, seed, settings }) {
    const hearts = settings?.hearts !== undefined && (JEBENA_HEART_CHOICES as readonly number[]).includes(settings.hearts) ? settings.hearts : JEBENA_DEFAULT_HEARTS;
    const rng = moduleRng(seed);
    const order = seededShuffle(players, rng);
    const rotation = seededShuffle(JEBENA_CATEGORIES.map((c) => c.id), rng);
    const s: JebenaState = {
      rulesVersion: JEBENA_RULES_VERSION,
      bankVersion: JEBENA_BANK_VERSION,
      seed,
      startHearts: hearts,
      order,
      per: Object.fromEntries(order.map((p) => [p, { hearts, outOrder: null, answers: 0, timeouts: 0, tries: 0 }])),
      rotation,
      rotationAt: 0,
      category: rotation[0]!,
      categoryRound: 1,
      used: {},
      turn: order.length ? { n: 1, player: order[0]!, attempts: 0 } : null,
      outCount: 0,
      log: [],
      attempts: {},
      end: null,
    };
    log(s, { turn: 1, kind: "category", categoryId: s.category, at: 0 });
    endIfOver(s);
    return s;
  },
  intent(s, actorId, action, payload, ctx: ModuleContext) {
    if (action !== "jebena-answer") return { ok: false, reason: "UNKNOWN_ACTION" };
    const p = s.per[actorId];
    if (!p) return { ok: false, reason: "NOT_IN_GAME" };
    if (s.end || !s.turn) return { ok: false, reason: "ALREADY_FINISHED" };
    if (p.outOrder !== null) return { ok: false, reason: "OUT" };
    const turn = payload["turn"];
    const text = payload["text"];
    if (typeof turn !== "number" || !Number.isInteger(turn)) return { ok: false, reason: "INVALID_PAYLOAD" };
    if (turn !== s.turn.n) return { ok: false, reason: "STALE_TURN" };
    if (s.turn.player !== actorId) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (typeof text !== "string" || text.length > JEBENA_MAX_INPUT) return { ok: false, reason: "INVALID_PAYLOAD" };
    if (s.turn.attempts >= JEBENA_MAX_ATTEMPTS) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
    s.turn.attempts += 1;
    p.tries += 1;
    const typed = text.trim().slice(0, JEBENA_MAX_INPUT);
    const cat = categoryById(s.category);
    const m = matchJebena(cat, typed);
    const reject = (verdict: Exclude<JebenaVerdict, "accepted">, reason?: string) => {
      s.attempts[actorId] = { turn: s.turn!.n, text: typed, verdict, ...(reason ? { reason } : {}) };
      return { ok: true as const, result: { verdict, turn: s.turn!.n, ...(reason ? { reason } : {}) } };
    };
    if (m.kind === "empty") return reject("empty");
    if (m.kind === "near-miss") return reject("near-miss", m.reason);
    if (m.kind === "ambiguous") return reject("ambiguous");
    if (m.kind === "not-in-bank") return reject("not-in-bank");
    const used = s.used[s.category] ?? [];
    const name = answerName(cat, m.answerId) ?? typed;
    if (used.includes(m.answerId)) {
      s.attempts[actorId] = { turn: s.turn.n, text: typed, verdict: "used", answer: name };
      return { ok: true, result: { verdict: "used", turn: s.turn.n, answer: name } };
    }
    // Accepted: used up, logged, and the jebena passes.
    s.used[s.category] = [...used, m.answerId];
    p.answers += 1;
    const turnNo = s.turn.n;
    log(s, { turn: turnNo, kind: "accepted", player: actorId, answerId: m.answerId, answer: name, via: m.via, categoryId: s.category, at: ctx.now });
    // A bank used up moves to the next category, with no penalty (none left ends the match).
    if (exhausted(s, s.category) && !nextCategory(s, ctx.now, turnNo + 1)) {
      return { ok: true, result: { verdict: "accepted", turn: turnNo, answer: name, via: m.via } };
    }
    passFrom(s, actorId);
    return { ok: true, result: { verdict: "accepted", turn: turnNo, answer: name, via: m.via } };
  },
  abstain(s, actorId, ctx) {
    const p = s.per[actorId];
    if (!p || p.outOrder !== null || s.end) return { ok: false, reason: "ALREADY_FINISHED" };
    p.satOut = true;
    s.outCount += 1;
    p.outOrder = s.outCount;
    log(s, { turn: s.turn?.n ?? 0, kind: "sat-out", player: actorId, at: ctx.now });
    // Leaving on your own turn passes the jebena on (same category: nobody lost a heart).
    if (s.turn?.player === actorId) passFrom(s, actorId);
    else endIfOver(s);
    return { ok: true, wholeGameAbstain: true };
  },
  phase: (s) => (s.end || !s.turn ? null : { key: `turn:${s.turn.n}`, kind: "turn" }),
  expirePhase(s, ctx) {
    // The turn's time ran out: exactly one heart, a new category, and the jebena passes.
    if (s.end || !s.turn) return;
    // A turn that runs out at the very instant of the match limit (or after it) is cut by the limit:
    // the match ends and nobody loses a heart for it (§3). RoomEngine then ends the game at its deadline.
    if (ctx.gameDeadlineAt !== undefined && ctx.now >= ctx.gameDeadlineAt) return;
    const who = s.turn.player;
    const p = s.per[who]!;
    const turnNo = s.turn.n;
    p.hearts = Math.max(0, p.hearts - 1);
    p.timeouts += 1;
    log(s, { turn: turnNo, kind: "timeout", player: who, hearts: p.hearts, categoryId: s.category, at: ctx.now });
    if (p.hearts === 0) {
      s.outCount += 1;
      p.outOrder = s.outCount;
      log(s, { turn: turnNo, kind: "out", player: who, at: ctx.now });
    }
    if (endIfOver(s)) return;
    if (!nextCategory(s, ctx.now, turnNo + 1)) return;
    passFrom(s, who);
  },
  finished: (s) => s.end !== null,
  // The room ended the game (its match limit, or any other reason): nothing private outlives it.
  onFinish(s) {
    s.attempts = {};
  },
  scores(s, players) {
    const pts = jebenaPoints(s);
    return Object.fromEntries(players.map((pid) => [pid, pts[pid] ?? 0]));
  },
  participation(s, players) {
    const participation = Object.fromEntries(players.map((pid) => {
      const p = s.per[pid];
      if (!p) return [pid, { done: 0, of: 0, actions: 0 }];
      // A turn is the unit: answered (accepted) of the turns this player held.
      return [pid, { done: p.answers, of: p.answers + p.timeouts, actions: p.tries, finished: s.end !== null && !p.satOut }];
    }));
    return { participation };
  },
  anyAction: (s) => Object.values(s.per).some((p) => p.tries > 0),
  publicView: (s, ctx) => publicView(s, ctx.scale),
  playerView(s, actorId, ctx) {
    const base = publicView(s, ctx.scale);
    const p = s.per[actorId];
    if (!p) return base;
    const attempt = s.attempts[actorId];
    return {
      ...base,
      me: { hearts: p.outOrder === null ? p.hearts : 0, out: p.outOrder !== null, satOut: !!p.satOut, answers: p.answers },
      myTurn: !!s.turn && s.turn.player === actorId,
      // Only this player's own last attempt, and only while that turn is still on.
      attempt: attempt && s.turn && attempt.turn === s.turn.n ? attempt : undefined,
    };
  },
};
