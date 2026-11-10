/** Stage 7.2 (docs/stage7/stage72.md §3.5): what comes next after a casual game (pure, for the panel and its tests). */
import type { PartyView } from "../../types.js";

export type NextState = "break" | "next" | "complete" | "free";

/** What comes next, from the room's lineup and break (the server's). */
export function nextState(lineup: PartyView["lineup"] | undefined, onBreak: boolean): { state: NextState; index?: number } {
  if (onBreak) return { state: "break" };
  if (lineup && lineup.items.length > 0) {
    if (lineup.complete) return { state: "complete" };
    if (lineup.next !== undefined && lineup.next !== null) return { state: "next", index: lineup.next };
  }
  return { state: "free" };
}
