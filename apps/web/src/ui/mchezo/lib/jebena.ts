/**
 * Stage 9.1: Jebena Rush's words, pure (no React), so every ending and every
 * verdict is tested on its own (review 6808081378). Display only: the server
 * decides turns, lives, places and points; these only say them. Stage 10.1:
 * a life is a cini (a small coffee cup), so a lost life is a broken cup.
 */

export type JebenaVerdict = "accepted" | "used" | "not-in-bank" | "ambiguous" | "near-miss" | "empty";
/** `hearts` is the server's name for whole cups left (D-S101-02); `at` is the server time it happened. */
export interface JebenaLogEntry { seq: number; turn: number; kind: "accepted" | "timeout" | "out" | "category" | "sat-out"; player?: string; answer?: string; via?: string; categoryId?: string; hearts?: number; at?: number }
export interface JebenaStanding { id: string; place: number; hearts: number; out: boolean; satOut: boolean; answers: number; timeouts: number; points: number }
export interface JebenaAttemptView { turn: number; text: string; verdict: JebenaVerdict; reason?: string; answer?: string }
export type JebenaEnd = null | "last-standing" | "banks-exhausted";

/** How hot the jebena is: a word and a steam count, from the share of the turn left. */
export type Urgency = "warm" | "steaming" | "boiling";
export const URGENCY_LABEL: Record<Urgency, string> = { warm: "Warm", steaming: "Steaming", boiling: "Boiling over!" };
export function urgencyFor(leftMs: number, turnMs: number): Urgency {
  const share = turnMs > 0 ? leftMs / turnMs : 0;
  return share > 0.6 ? "warm" : share > 0.3 ? "steaming" : "boiling";
}

/**
 * What's left of the turn as players see it: the room's phase deadline less
 * the network grace (the server still takes an answer during the grace).
 */
export function turnLeftMs(phaseDeadlineAt: number | undefined, graceMs: number, now: number): number | null {
  if (phaseDeadlineAt === undefined) return null;
  return Math.max(0, phaseDeadlineAt - graceMs - now);
}

/** Whole seconds to show: rounded up, never more than the turn itself (a clock estimate a little behind would show 11). */
export function shownSeconds(leftMs: number, turnMs: number): number {
  return Math.min(Math.ceil(leftMs / 1000), Math.ceil(turnMs / 1000));
}

/** What the player's last try this turn means, in plain words. Never names a hidden answer. */
export function verdictLine(a: JebenaAttemptView, category: string): { tone: "good" | "warn" | "neutral"; text: string } {
  const typed = a.text.trim();
  switch (a.verdict) {
    case "accepted": return { tone: "good", text: `“${a.answer ?? typed}” counts!` };
    case "used": return { tone: "warn", text: `“${a.answer ?? typed}” was already named in ${category}. Try another!` };
    case "not-in-bank": return { tone: "warn", text: `“${typed}” isn't on our ${category} list. Try another!` };
    case "ambiguous": return { tone: "warn", text: `“${typed}” is close, but we can't be sure which answer you mean. Check the spelling.` };
    case "near-miss": return { tone: "warn", text: a.reason ? `“${typed}”: ${a.reason}` : `“${typed}” isn't quite it. Try another!` };
    case "empty": return { tone: "neutral", text: "Type an answer first." };
  }
}

/** The last thing that happened, for everyone: an answer, a timeout, an out, a player leaving. */
export function lastPlayLine(log: readonly JebenaLogEntry[] | undefined, nameOf: (id?: string) => string, meId?: string): string | null {
  const e = [...(log ?? [])].reverse().find((x) => x.kind !== "category");
  if (!e) return null;
  const who = e.player === meId ? "You" : nameOf(e.player);
  switch (e.kind) {
    case "accepted": return `${who} named “${e.answer}”.`;
    case "timeout": return `${who} ran out of time: ${e.hearts === 0 ? "the last cup broke" : `a cup broke (${e.hearts} left)`}.`;
    case "out": return `${who} ${who === "You" ? "are" : "is"} out: every cup is broken.`;
    case "sat-out": return `${who} left the game.`;
    default: return null;
  }
}

/**
 * Did this player keep the jebena? Only when the match ended with exactly one
 * player left with a whole cup. A match the limit ended, or one that ran out of
 * answers, has no single keeper, even if one player came first.
 */
export function keptTheJebena(end: JebenaEnd | undefined, standings: readonly JebenaStanding[] | undefined, id: string): boolean {
  if (end !== "last-standing") return false;
  const still = (standings ?? []).filter((r) => !r.out);
  return still.length === 1 && still[0]!.id === id;
}

/** The results heading for each way a match can end. A shared first place is said as shared. */
export function jebenaEndLine(end: JebenaEnd | undefined, standings: readonly JebenaStanding[] | undefined, nameOf: (id?: string) => string, meId?: string): string {
  const top = (standings ?? []).filter((r) => r.place === 1);
  const who = (id: string) => (id === meId ? "you" : nameOf(id));
  const keeper = (standings ?? []).find((r) => keptTheJebena(end, standings, r.id));
  if (keeper) return keeper.id === meId ? "You kept the jebena!" : `${nameOf(keeper.id)} kept the jebena!`;
  const first = top.length > 1 ? `a shared first place (${top.map((r) => who(r.id)).join(", ")})` : top.length === 1 ? `${who(top[0]!.id)} came first` : "";
  if (end === "banks-exhausted") return `Every answer was named! ${first ? `${first[0]!.toUpperCase()}${first.slice(1)}.` : ""}`.trim();
  return first ? `Time's up: ${first}` : "Time's up";
}
