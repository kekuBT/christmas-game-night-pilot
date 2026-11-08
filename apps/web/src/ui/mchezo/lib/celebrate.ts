/**
 * Stage 3 (bonus): the story of a finished game, told only from facts the
 * server recorded. Pure: no React, no clock, no randomness.
 *
 * - Scores are the server's per-game scores (`rawScores`), never computed here.
 * - Ranks are competition ranks over those scores (equal scores share a rank:
 *   1, 1, 3). Every phone gets the same scores, so every phone shows the same
 *   winners, ties and places.
 * - Quips are Mild, original, and each one is tied to a condition that is
 *   true of the recorded result (a tie, a close finish, a practice game). A
 *   line is chosen by the game's id, so all phones show the same line.
 * - Nothing here invents a statistic: no streaks, speeds or "best ever".
 */

export interface ResultFacts {
  /** The finished game instance (stable across phones and refreshes). */
  gameInstanceId: string;
  title: string;
  official: boolean;
  /** The server's per-game scores for the roster. */
  scores: Readonly<Record<string, number>>;
  nameOf: (playerId: string) => string;
  youId?: string;
  /** Your own participation (done of total); absent if unknown. */
  yourParticipation?: { done: number; of: number };
  /** True when you chose to sit this game out (only your phone knows). */
  youSatOut?: boolean;
}

export type Tone = "win" | "tie" | "everyone-tied" | "no-score" | "single";

export interface ResultsStory {
  /** e.g. "Ada wins Trivia Showdown" / "It's a tie at the top" */
  headline: string;
  /** Who shares first place (ids, in score-then-name order). */
  winners: string[];
  /** Competition ranks (1, 1, 3). */
  ranks: Record<string, number>;
  order: string[];
  tone: Tone;
  /** One Mild line about the whole result (same on every phone). */
  quip: string;
  /** Your card, when you were in the game. */
  you?: { rank: number; of: number; score: number; tied: boolean; label: string; line: string };
  /** Play a short celebration on this phone (you won or shared the win). */
  celebrate: boolean;
}

/** Deterministic 32-bit FNV-1a, so every phone picks the same line. */
export function stableIndex(key: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return n > 0 ? h % n : 0;
}

export function ordinalWord(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Competition ranking over recorded scores: equal scores share a rank. */
export function competitionRanks(scores: Readonly<Record<string, number>>, nameOf: (id: string) => string): { order: string[]; ranks: Record<string, number> } {
  const order = Object.keys(scores).sort((a, b) => (scores[b]! - scores[a]!) || nameOf(a).localeCompare(nameOf(b)) || a.localeCompare(b));
  const ranks: Record<string, number> = {};
  order.forEach((id, i) => { ranks[id] = i > 0 && scores[id] === scores[order[i - 1]!] ? ranks[order[i - 1]!]! : i + 1; });
  return { order, ranks };
}

/** The Mild lines, each with the fact that must hold. `{w}` = winner, `{gap}` = points between 1st and 2nd. */
export const QUIPS = {
  win: ["{w} takes it. Applause is optional but encouraged.", "{w} wins. Somebody fetch a paper crown.", "Top of the table: {w}. Modesty optional."],
  headToHead: ["Head to head, and {w} edged it."],
  close: ["Photo finish: {gap} in it.", "Close enough to argue about all week."],
  runaway: ["{w} won by a comfortable margin. Very comfortable.", "A runaway win. Everyone else was admiring the view."],
  shutout: ["{w} was the only one on the scoreboard."],
  bigRoom: ["{n} players, one winner. Tough crowd."],
  tie: ["A shared win. Twice the bragging, same trophy.", "Dead heat at the top. Nobody blinked.", "Tied for first. Diplomacy wins again."],
  everyoneTied: ["Everyone tied. A perfectly balanced family."],
  noScore: ["Nobody scored. A truly level playing field.", "Zero all round. The questions won this one."],
  practice: ["Practice round: all the fun, none of the paperwork.", "Just practice. Nobody's keeping score. Well, the app is."],
  youWon: ["That was you. Enjoy it quietly. Or loudly.", "You won. Try to look surprised."],
  youTiedFirst: ["You share the top spot. Sharing is caring."],
  youLast: ["Someone has to make the podium look good.", "Every champion starts somewhere. Possibly here."],
  youMiddle: ["Solid middle of the pack. Room to climb.", "Not first, not last: perfectly balanced."],
  youZero: ["No points this time. The next game is a fresh start."],
  youMissed: ["You missed this one. Your seat's still warm."],
  youSatOut: ["You sat this one out. Fair enough."],
} as const;

const pick = (lines: readonly string[], key: string) => lines[stableIndex(key, lines.length)]!;
const pts = (n: number) => `${n} point${n === 1 ? "" : "s"}`;

export function resultsStory(f: ResultFacts): ResultsStory {
  const { order, ranks } = competitionRanks(f.scores, f.nameOf);
  const n = order.length;
  const top = n ? f.scores[order[0]!]! : 0;
  const winners = order.filter((id) => ranks[id] === 1);
  const second = order.find((id) => ranks[id]! > 1);
  const allZero = n > 0 && order.every((id) => f.scores[id] === 0);
  const everyoneTied = n > 1 && winners.length === n && !allZero;
  const tone: Tone = n <= 1 ? "single" : allZero ? "no-score" : everyoneTied ? "everyone-tied" : winners.length > 1 ? "tie" : "win";
  const w = winners.map(f.nameOf);
  const headline =
    tone === "single" ? (n === 1 ? `${w[0]} finished ${f.title}` : `${f.title} is over`)
    : tone === "no-score" ? "Nobody scored this time"
    : tone === "everyone-tied" ? "Everyone tied"
    : tone === "tie" ? (winners.length === 2 ? `${w[0]} and ${w[1]} tie for first` : `${winners.length}-way tie for first`)
    : `${w[0]} wins ${f.title}`;
  const key = f.gameInstanceId;
  let pool: readonly string[] = QUIPS.win;
  if (!f.official) pool = QUIPS.practice;
  else if (tone === "no-score") pool = QUIPS.noScore;
  else if (tone === "everyone-tied") pool = QUIPS.everyoneTied;
  else if (tone === "tie") pool = QUIPS.tie;
  else if (tone === "win" && second) {
    const s2 = f.scores[second]!;
    if (s2 === 0) pool = QUIPS.shutout;
    else if (top - s2 <= Math.max(1, Math.round(top * 0.1))) pool = QUIPS.close;
    else if (top >= 2 * s2) pool = QUIPS.runaway;
    else if (n === 2) pool = QUIPS.headToHead;
    else if (n >= 8) pool = QUIPS.bigRoom;
  }
  const gap = second ? top - f.scores[second]! : 0;
  const quip = tone === "single" ? "" : pick(pool, `${key}:all`).replace("{w}", w[0] ?? "").replace("{gap}", pts(gap)).replace("{n}", String(n));

  let you: ResultsStory["you"];
  if (f.youId && f.youId in f.scores) {
    const rank = ranks[f.youId]!;
    const tied = order.filter((id) => ranks[id] === rank).length > 1;
    const score = f.scores[f.youId]!;
    const last = n >= 3 && rank === Math.max(...Object.values(ranks)) && !everyoneTied && !allZero;
    const label = n <= 1 ? "You played solo" : tied ? `You tied for ${ordinalWord(rank)} of ${n}` : `You came ${ordinalWord(rank)} of ${n}`;
    const p = f.yourParticipation;
    const line =
      f.youSatOut ? pick(QUIPS.youSatOut, `${key}:you`)
      : p && p.of > 0 && p.done === 0 ? pick(QUIPS.youMissed, `${key}:you`)
      : n <= 1 ? ""
      : rank === 1 && !tied ? pick(QUIPS.youWon, `${key}:you`)
      : rank === 1 ? pick(QUIPS.youTiedFirst, `${key}:you`)
      : score === 0 && top > 0 ? pick(QUIPS.youZero, `${key}:you`)
      : last ? pick(QUIPS.youLast, `${key}:you`)
      : pick(QUIPS.youMiddle, `${key}:you`);
    you = { rank, of: n, score, tied, label, line };
  }
  const celebrate = !!you && you.rank === 1 && (tone === "win" || tone === "tie") && !f.youSatOut;
  return { headline, winners, ranks, order, tone, quip, you, celebrate };
}
