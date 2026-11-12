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

export type MemoryLinkState =
  /** Nothing loaded yet. */
  | "loading"
  /** The loaded ledger is behind the room (a game may just have finished): adding waits for the reload. */
  | "syncing"
  /** No game has finished yet. */
  | "none"
  /** The last finished game can't be saved yet (a cooperative game, like Spectrum): said plainly. */
  | "unavailable"
  /** The last finished game can be cited. */
  | "ready";

export interface MemoryLink {
  state: MemoryLinkState;
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
  if (targetGame && o.registry.find((g) => g.id === targetGame.gameId)?.cooperative === true) return { state: "unavailable", ...found };
  return { state: "ready", ...found };
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
