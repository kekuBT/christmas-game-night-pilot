/**
 * Game lifecycle display helpers (Sprint 3). Pure: no React, no fetch.
 *
 * The server owns every deadline and decides when a game ends. The client
 * only DISPLAYS time left. It never decides anything with its own clock:
 *  - countdowns use deadline − (server time), where server time is
 *    estimated as Date.now() + offset, and offset = serverNow − Date.now()
 *    measured when a projection arrives (a phone whose clock is minutes
 *    off still shows the right time left);
 *  - "Time's up" shown here is a display state only; the game screen
 *    changes when the server says the game or phase ended.
 */
import type { GameOutcome, GameParticipation } from "../../../types.js";

let offsetMs = 0;

/** Record the server's clock from a projection (call on every projection). */
export function noteServerTime(serverNow: number | undefined, localNow = Date.now()): void {
  if (typeof serverNow === "number" && Number.isFinite(serverNow)) offsetMs = serverNow - localNow;
}
/** Best estimate of the server's clock now. */
export function serverNowEstimate(localNow = Date.now()): number {
  return localNow + offsetMs;
}
export function serverOffsetMs(): number {
  return offsetMs;
}

/** "4:05", "0:09". Never negative; rounds up so 0:00 means the deadline is here. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The deadline a player is racing right now: the phase's, else the game's. */
export function activeDeadline(g: { phaseDeadlineAt?: number; deadlineAt?: number }): number | undefined {
  return g.phaseDeadlineAt ?? g.deadlineAt;
}

/** What one unit of a game is called, for "Answered 7 of 10 questions". */
const UNIT_WORDS: Record<string, { verb: string; noun: [string, string] }> = {
  "trivia": { verb: "Answered", noun: ["question", "questions"] },
  "who-said-that": { verb: "Answered", noun: ["question", "questions"] },
  "geography": { verb: "Answered", noun: ["question", "questions"] },
  "math-mayhem": { verb: "Answered", noun: ["question", "questions"] },
  "guess-the-year": { verb: "Guessed", noun: ["event", "events"] },
  "word-connections": { verb: "Solved", noun: ["group", "groups"] },
  "closest-wins": { verb: "Guessed on", noun: ["question", "questions"] },
  "caption-clash": { verb: "Wrote a caption in", noun: ["round", "rounds"] },
  "category-sprint": { verb: "Played", noun: ["round", "rounds"] },
  // Stage 5 (Practice-only games).
  "majority-rules": { verb: "Predicted in", noun: ["round", "rounds"] },
  "pattern-pulse": { verb: "Answered", noun: ["round", "rounds"] },
  // Stage 5.1 (3D): the count is turns you drew in, or guessed RIGHT in
  // (src/games/modules/draw.ts participation); a wrong guess doesn't count.
  "draw-guess": { verb: "Drew or guessed right in", noun: ["turn", "turns"] },
  // Stage 9.1: a turn answered in time (src/games/modules/jebena.ts participation).
  "jebena-rush": { verb: "Answered in time on", noun: ["turn", "turns"] },
  // Stage 9.3: a round you gave the clue in, or sent a guess in (src/games/modules/spectrum.ts participation).
  "spectrum": { verb: "Took part in", noun: ["round", "rounds"] },
};

/**
 * One plain line about how much of a game a player completed (P5).
 * Never says someone "abstained" or "sat out" unless it is the viewer
 * themselves and they chose to (`choseSatOut`).
 */
export function participationLine(gameId: string, p: GameParticipation | undefined, opts: { you?: boolean; choseSatOut?: boolean } = {}): string | null {
  if (!p || p.of <= 0) return null;
  const w = UNIT_WORDS[gameId];
  if (!w) return null;
  const noun = p.of === 1 ? w.noun[0] : w.noun[1];
  if (gameId === "word-connections") {
    const base = `${w.verb} ${p.done} of ${p.of} ${noun}`;
    return p.finished ? base : `${base} — puzzle not finished`;
  }
  if (p.done === 0) {
    if (opts.you && opts.choseSatOut) return "You chose to sit this one out";
    return gameId === "caption-clash" ? "Did not submit a caption" : gameId === "category-sprint" ? "Did not submit answers" : gameId === "closest-wins" ? "Did not submit a guess" : gameId === "draw-guess" ? `No drawings or right guesses (0 of ${p.of})` : `Did not answer (0 of ${p.of})`;
  }
  return `${w.verb} ${p.done} of ${p.of} ${noun}`;
}

/** How the game ended and whether it counts, in plain words. */
export function outcomeLines(o: GameOutcome | undefined, official: boolean | undefined, casual = false): { headline: string; counts: string; note?: string } | null {
  if (!o) return null;
  const headline =
    o.reason === "completed" ? "Everyone finished."
    : o.reason === "deadline" ? "Time’s up — the game ended at its time limit. Answers given in time count; anything unanswered scores 0."
    : o.reason === "backstop-partial" ? `The game reached its time limit partway through${o.completedUnits !== undefined && o.totalUnits !== undefined ? ` (${o.completedUnits} of ${o.totalUnits} completed)` : ""}.`
    : "This game was voided because of a technical problem.";
  const counts = o.countsOfficially ? "Counts toward the Family Cup." : official ? "Does not count toward the Family Cup." : casual ? "Casual game: just for fun." : "Practice game — does not count toward the Family Cup.";
  return { headline, counts, ...(o.note ? { note: o.note } : {}) };
}

/**
 * Stage 5.1 (3D): the waiting line after a whole-game sit-out. "You sat this
 * one out" only when nothing had been answered; otherwise "the rest".
 * Reads this player's own answers only.
 */
export function satOutLabel(game: { myAnswers?: Record<string, unknown>; state?: unknown }): string {
  const st = (game.state ?? {}) as { myAnswers?: Record<string, unknown>; myGuesses?: Record<string, unknown>; myState?: { guessed?: unknown[] } };
  const count = (r?: Record<string, unknown>) => Object.values(r ?? {}).filter((v) => v !== undefined && v !== null).length;
  const n = count(game.myAnswers) + count(st.myAnswers) + count(st.myGuesses) + (st.myState?.guessed?.length ?? 0);
  return n > 0 ? "You sat out the rest" : "You sat this one out";
}
