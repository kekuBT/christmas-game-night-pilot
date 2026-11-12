/**
 * Stage 10.2 repair (review 6831760093, S102-R1; D-S102-06): which finished
 * game a new Memory Book highlight would cite, and whether it can be added
 * now, judged from the ledger actually loaded on this screen. Pure.
 *
 * The loaded ledger is current when its freshness watermark (the room's seq
 * when it was read) has reached the room's seq in the live projection. The
 * highest seq among the events this viewer may see is not the same thing:
 * another player's abstention or recovery code, or a live game's scores,
 * can be the newest events and are hidden from this viewer, so that number
 * can trail forever on a ledger that is fully current.
 */
import type { LedgerEvent, LedgerView, PublicGame, RegistryGame } from "../../../types.js";
import type { TeamResult } from "../../../../../../src/shared/teamResult.js";

export type MemoryLinkState =
  /** Nothing loaded yet. */
  | "loading"
  /** The loaded ledger is behind the room (a game may just have finished): adding waits for the reload. */
  | "syncing"
  /** No game has finished yet. */
  | "none"
  /** The last finished game can't be saved (see `why`): said plainly. */
  | "unavailable"
  /** The last finished game can be cited. */
  | "ready";

/**
 * Why the last finished game can't be saved (Stage 10.3): a team game the Memory Book doesn't save,
 * or a team result that isn't final (stopped by the room's time limit, voided, or missing).
 */
export type MemoryUnavailableWhy = "team-not-supported" | "team-not-final";

export interface MemoryLink {
  state: MemoryLinkState;
  why?: MemoryUnavailableWhy;
  /** The game-finished event a new highlight would cite (when one is loaded). */
  target?: LedgerEvent;
  targetGame?: PublicGame;
}

export function memoryLink(o: {
  ledger: readonly LedgerEvent[];
  /** The watermark of the ledger loaded on screen; undefined before the first load. */
  ledgerAt: number | undefined;
  /** The room's seq in the live projection. */
  roomSeq: number | undefined;
  games: readonly PublicGame[];
  registry: readonly RegistryGame[];
}): MemoryLink {
  if (o.ledgerAt === undefined) return { state: "loading" };
  const target = o.ledger.filter((e) => e.type === "game-finished").at(-1);
  const targetGame = target?.gameInstanceId ? o.games.find((g) => g.id === target.gameInstanceId) : undefined;
  const found = { ...(target ? { target } : {}), ...(targetGame ? { targetGame } : {}) };
  if (o.roomSeq !== undefined && o.ledgerAt < o.roomSeq) return { state: "syncing", ...found };
  if (!target) return { state: "none" };
  const reg = targetGame ? o.registry.find((g) => g.id === targetGame.gameId) : undefined;
  if (targetGame && reg?.cooperative === true) {
    // Stage 10.3 (D-S103-02, D-S103-03): a team game is saved only when enabled by name and only with a final
    // result. The server decides (and refuses anything else); this only lets the screen say so before Add.
    if (reg.memoryBookTeam !== true) return { state: "unavailable", why: "team-not-supported", ...found };
    if (!teamResultSaveable(targetGame.outcome?.reason === "void" ? undefined : targetGame.outcome?.team)) return { state: "unavailable", why: "team-not-final", ...found };
  }
  return { state: "ready", ...found };
}

/**
 * Stage 10.3 (D-S103-03), the same rule the server applies (src/server/memorybook.ts `teamFactsFor`): a team
 * result can be saved when the module ended it, completed with every planned round revealed, or ended early
 * (too few players) with fewer. An ending the room imposed (`end: null`) is not final.
 */
export function teamResultSaveable(team: TeamResult | undefined): boolean {
  if (!team) return false;
  if (team.end === "completed") return team.rounds.length === team.roundsPlanned;
  if (team.end === "too-few-players") return team.rounds.length < team.roundsPlanned;
  return false;
}

/**
 * Whether a ledger response may replace the one on screen: only if it is at
 * least as new (by its watermark). Loads overlap (each projection change
 * starts one), and an older response arriving last must not roll the
 * screen's context back.
 */
export function newerLedger(loadedAt: number | undefined, incoming: LedgerView): boolean {
  return Number.isInteger(incoming.seq) && Array.isArray(incoming.events) && (loadedAt === undefined || incoming.seq >= loadedAt);
}
