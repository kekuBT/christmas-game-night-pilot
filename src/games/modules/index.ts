/**
 * Stage 5: the game modules RoomEngine plays through the common contract.
 * Every module here is Practice-only (src/server/lifecycle.ts).
 */
import type { GameModule } from "./types.js";
import { majorityModule } from "./majority.js";
import { pulseModule } from "./pulse.js";
import { drawModule } from "./draw.js";

export const GAME_MODULES: Readonly<Record<string, GameModule<unknown>>> = Object.freeze({
  [majorityModule.id]: majorityModule as GameModule<unknown>,
  [pulseModule.id]: pulseModule as GameModule<unknown>,
  [drawModule.id]: drawModule as GameModule<unknown>,
});

export function moduleFor(gameId: string): GameModule<unknown> | undefined {
  return GAME_MODULES[gameId];
}

/** The module that handles an intent action, if any. */
export function moduleForAction(action: string): GameModule<unknown> | undefined {
  return Object.values(GAME_MODULES).find((m) => m.actions.includes(action));
}
