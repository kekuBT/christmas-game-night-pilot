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
