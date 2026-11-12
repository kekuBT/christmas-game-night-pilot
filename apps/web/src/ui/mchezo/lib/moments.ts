/**
 * Stage 5 (S5-E): one "moment" line per finished game, for the Stage 5
 * games, told only from what the server recorded (the finished game's
 * state). Pure and deterministic: the same game gives the same line on
 * every phone and after a refresh. No invented statistics, no private
 * facts about anyone else (a player's own facts appear only on their own
 * phone), and nothing at all when no recorded fact fits.
 */

interface MajorityRound { prompt: string; a: string; b: string; votesA: number; votesB: number; majority: "a" | "b" | "tie" | "none"; spotOn: { playerId: string; points: number }[] }
interface PulseRound { round: number; length: number; answer: number[] | null; perfect: boolean }
interface DrawTurn { drawerId: string; word: string; correct: number }

/** Majority Rules: a split room, a unanimous room, or someone who read the room every time. */
export function majorityMoment(rounds: readonly MajorityRound[] | undefined, players: readonly string[], nameOf: (id: string) => string): string | null {
  const rs = rounds ?? [];
  if (!rs.length) return null;
  const tie = rs.findIndex((r) => r.majority === "tie");
  if (tie >= 0) return `Round ${tie + 1} split the room ${rs[tie]!.votesA}–${rs[tie]!.votesB}.`;
  const unanimous = rs.findIndex((r) => r.votesA + r.votesB >= 2 && (r.votesA === 0 || r.votesB === 0));
  if (unanimous >= 0) {
    const r = rs[unanimous]!;
    return `Round ${unanimous + 1} was unanimous: everyone picked “${r.votesA > 0 ? r.a : r.b}”.`;
  }
  const voted = rs.filter((r) => r.majority === "a" || r.majority === "b");
  if (voted.length >= 2) {
    const always = players.filter((p) => voted.every((r) => r.spotOn.some((x) => x.playerId === p)));
    if (always.length === 1) return `${nameOf(always[0]!)} called the majority every round.`;
  }
  return null;
}

/** Pattern Pulse: your own longest perfect sequence (your phone only). */
export function pulseMoment(myResults: readonly PulseRound[] | undefined): string | null {
  const perfect = (myResults ?? []).filter((r) => r.perfect && r.answer);
  if (!perfect.length) return null;
  const best = Math.max(...perfect.map((r) => r.length));
  if (perfect.length === 6) return "Six perfect rounds out of six. Total recall.";
  return `Your longest perfect sequence: ${best} shapes.`;
}

/** Draw & Guess: a drawing everyone got, or one that stumped the room (a pass isn't told apart: L33). */
export function drawMoment(turns: readonly DrawTurn[] | undefined, guessersPerTurn: number, nameOf: (id: string) => string): string | null {
  const ts = turns ?? [];
  const everyone = ts.find((t) => guessersPerTurn > 1 && t.correct >= guessersPerTurn);
  if (everyone) return `Everyone got ${nameOf(everyone.drawerId)}’s “${everyone.word}”.`;
  const stumped = ts.find((t) => t.correct === 0);
  if (stumped) return `Nobody got “${stumped.word}”.`;
  return null;
}

/**
 * How a win is celebrated on the winner's phone (S5-E):
 *  - full motion: a short burst (at most 1.2 s, never over a button);
 *  - reduced motion ("Less", or the phone's own setting) and "Off": a still
 *    ribbon, the same words, no movement;
 *  - not a winner: nothing.
 */
export function celebrationMode(celebrate: boolean, reducedMotion: boolean): "burst" | "still" | "none" {
  if (!celebrate) return "none";
  return reducedMotion ? "still" : "burst";
}

/*
 * Stage 10.2 (docs/stage10/stage102.md §3; D-S102-01..05): one line for a
 * genuine moment in a finished Jebena Rush or Spectrum result. Same rules as
 * the moments above: only finished, public facts every role already has (no
 * private state, no individual guess); fixed, authored lines (never random),
 * so a host, a guest, the TV and a reload read the same words; and nothing
 * when no fact fits. Scores, places and the team summary stay the result;
 * these lines only add a moment.
 */

/** A finished Jebena Rush game's public facts (its public state). */
export interface JebenaFinished {
  /** The module's own ending; null when the room ended the game (its match limit, an abort). */
  end?: string | null;
  startHearts?: number;
  standings?: readonly { id: string; place: number; hearts: number; out: boolean; satOut: boolean }[];
}

export const JEBENA_LINES = {
  lastCup: "One cup left. Still enough for the win.",
  allCups: (n: number) => `All ${n} cups still whole. Not a single crack.`,
} as const;

/**
 * Jebena Rush (D-S102-02): a line only for a sole winner, in a match the
 * module ended, with at least one opponent knocked out by losing every cup
 * (a win by others leaving gets none: the line never comments on absence).
 * J1: exactly one cup left. J2: every starting cup still whole. Nothing else.
 */
export function jebenaMoment(st: JebenaFinished | null | undefined): string | null {
  if (!st || (st.end !== "last-standing" && st.end !== "banks-exhausted")) return null;
  const start = st.startHearts;
  const rows = st.standings ?? [];
  if (typeof start !== "number" || !Number.isInteger(start) || start < 2 || rows.length < 2) return null;
  const firsts = rows.filter((r) => r.place === 1);
  if (firsts.length !== 1) return null;
  const w = firsts[0]!;
  if (w.out || w.satOut || !Number.isInteger(w.hearts) || w.hearts < 1 || w.hearts > start) return null;
  if (!rows.some((r) => r.id !== w.id && r.out && !r.satOut)) return null;
  if (w.hearts === 1) return JEBENA_LINES.lastCup;
  if (w.hearts === start) return JEBENA_LINES.allCups(start);
  return null;
}

/** A finished Spectrum match's team result (public: outcome.team). */
export interface SpectrumFinished {
  end?: string | null;
  roundsPlanned?: number;
  rounds?: readonly { roundNo: number; reason: string; distance: number | null; points: number }[];
  total?: number;
  max?: number;
}

/** "1", "1 and 3", "1, 2 and 4". */
const listRounds = (ns: readonly number[]) => (ns.length === 1 ? `${ns[0]}` : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`);

export const SPECTRUM_LINES = {
  perfect: (max: number) => `${max} out of ${max}. The whole team was on one wavelength.`,
  exact: (rounds: readonly number[]) =>
    rounds.length === 1 ? `Round ${rounds[0]} landed exactly on the target.`
      : `Rounds ${listRounds(rounds)} ${rounds.length === 2 ? "both" : "all"} landed exactly on the target.`,
} as const;

/**
 * Spectrum (D-S102-03), team words only: a line only for a match the module
 * completed with every planned round revealed (an early or room ending gets
 * none). S1, every round scored and the full score, comes before S2, one or
 * more scored rounds at distance 0. Never a name, a winner, a place, the Cup
 * or anyone's own guess.
 */
export function spectrumMoment(team: SpectrumFinished | null | undefined): string | null {
  if (!team || team.end !== "completed") return null;
  const rounds = team.rounds ?? [];
  const planned = team.roundsPlanned ?? 0;
  if (!Number.isInteger(planned) || planned < 1 || rounds.length !== planned) return null;
  const max = team.max ?? 0;
  if (max > 0 && team.total === max && rounds.every((r) => r.reason === "scored")) return SPECTRUM_LINES.perfect(max);
  const exact = rounds.filter((r) => r.reason === "scored" && r.distance === 0).map((r) => r.roundNo).sort((a, b) => a - b);
  return exact.length ? SPECTRUM_LINES.exact(exact) : null;
}
