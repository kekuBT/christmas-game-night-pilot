/**
 * Stage 5: the game modules RoomEngine plays through the common contract.
 * Every module here is Practice-only (src/server/lifecycle.ts). Stage 9.1
 * adds Jebena Rush (casual rooms only); Stage 9.3 adds Spectrum
 * (cooperative, casual rooms only).
 */
import type { GameModule } from "./types.js";
import { majorityModule } from "./majority.js";
import { pulseModule } from "./pulse.js";
import { drawModule } from "./draw.js";
import { jebenaModule } from "./jebena.js";
import { spectrumModule } from "./spectrum.js";
import { familyModule } from "./family.js";

export const GAME_MODULES: Readonly<Record<string, GameModule<unknown>>> = Object.freeze({
  [majorityModule.id]: majorityModule as GameModule<unknown>,
  [pulseModule.id]: pulseModule as GameModule<unknown>,
  [drawModule.id]: drawModule as GameModule<unknown>,
  [jebenaModule.id]: jebenaModule as GameModule<unknown>,
  // Stage 9.3: cooperative; registered together with the room's team-result branch.
  [spectrumModule.id]: spectrumModule as GameModule<unknown>,
  // Stage 12.5: Family Questions (casual rooms only, practice only; the room hands it the family's questions).
  [familyModule.id]: familyModule as GameModule<unknown>,
});

export function moduleFor(gameId: string): GameModule<unknown> | undefined {
  return GAME_MODULES[gameId];
}

/** The module that handles an intent action, if any. */
export function moduleForAction(action: string): GameModule<unknown> | undefined {
  return Object.values(GAME_MODULES).find((m) => m.actions.includes(action));
}
