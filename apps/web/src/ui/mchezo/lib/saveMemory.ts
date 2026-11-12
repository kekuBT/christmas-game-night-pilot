/**
 * Stage 10.4 (docs/stage10/stage104.md §4; D-S104-03/04): what Save a memory on a result screen shows before saving,
 * and whether this result can be saved at all. Pure. The facts here are a preview from the public result; the server
 * derives and freezes the facts it keeps (Stage 10.3), from the game the screen names (`fromGame`).
 */
import type { PlayerGame, PublicGame, PublicPlayer } from "../../../types.js";
import { memoryTeamLine } from "../../../../../../src/shared/memoryTeam.js";
import { teamResultSaveable } from "./memoryLink.js";

/** The note's limit, the same as the server's (NOTE_TOO_LONG). */
export const SAVE_NOTE_MAX = 280;

/** The games whose results offer Save a memory in this slice (D-S104-04). */
export const SAVE_MEMORY_GAMES: readonly string[] = ["spectrum", "jebena-rush"];

export interface SaveMemoryFacts {
  saveable: boolean;
  /** Why not, said plainly, when it can't be saved. */
  why?: string;
  /** The facts it would be saved with (read-only in the composer). */
  lines: string[];
}

export function saveMemoryFacts(o: { game: PlayerGame; publicGame?: PublicGame; players: readonly PublicPlayer[]; title: string }): SaveMemoryFacts {
  const g = o.game;
  const outcome = g.outcome ?? o.publicGame?.outcome;
  if (!SAVE_MEMORY_GAMES.includes(g.gameId)) return { saveable: false, why: "Save this game's memories from the Memory Book.", lines: [] };
  if (g.status !== "finished") return { saveable: false, why: "This game hasn't finished yet.", lines: [] };
  if (outcome?.reason === "void") return { saveable: false, why: "This game was voided, so there is no result to save.", lines: [] };
  if (g.gameId === "spectrum") {
    const team = outcome?.team;
    if (!team || !teamResultSaveable(team)) return { saveable: false, why: "This match was stopped before its team result was final, so it can't be saved.", lines: [] };
    return {
      saveable: true,
      lines: [memoryTeamLine({ kind: team.kind, gameInstanceId: g.id, finishedEventId: "", total: team.total, max: team.max, roundsRevealed: team.rounds.length, roundsPlanned: team.roundsPlanned, end: team.end === "too-few-players" ? "too-few-players" : "completed" }, o.title)],
    };
  }
  const scores = g.rawScores ?? o.publicGame?.rawScores;
  if (!scores || Object.keys(scores).length === 0) return { saveable: false, why: "This game has no recorded result to save.", lines: [] };
  const name = (id: string) => o.players.find((p) => p.id === id)?.displayName ?? "A player";
  const rows = Object.entries(scores).map(([id, pts]) => ({ who: name(id), pts })).sort((a, b) => b.pts - a.pts || a.who.localeCompare(b.who));
  return { saveable: true, lines: rows.map((r) => `${r.who}: ${r.pts.toLocaleString("en-US")} ${r.pts === 1 ? "point" : "points"}`) };
}
