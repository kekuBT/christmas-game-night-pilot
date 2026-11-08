import type { PlayerGame } from "../types.js";

/**
 * Pure Show Mode phase derivation (M6.2): given the player's own game
 * projections and which game intros/results they have dismissed, decide
 * what the phone should show. No server state is invented here — the
 * engine's game status is authoritative; this only chooses presentation.
 */
export type ShowPhase = "lobby" | "intro" | "gameplay" | "waiting" | "results";

/** True when the player has nothing left to do in this playing game. */
export function myProgressDone(game: PlayerGame, playerId?: string): boolean {
  const st = (game.state ?? {}) as Record<string, unknown>;
  // Quiz questions live top-level for Math, in the game state for
  // Trivia/Who/Geography (extra.questions). Check both, as GamePanel does.
  const questions = game.questions ?? ((st["questions"] ?? []) as { id: string }[]);
  if (["math-mayhem", "trivia", "who-said-that", "geography"].includes(game.gameId)) {
    if (questions.length === 0) return false;
    // Trivia/Who/Geography store answers in the game state projection
    // (extra.answers); Math stores them top-level. Check both.
    const stateAnswers = (st["myAnswers"] ?? {}) as Record<string, unknown>;
    return questions.every((q) => game.myAnswers?.[q.id] !== undefined || stateAnswers[q.id] !== undefined);
  }
  if (game.gameId === "caption-clash") return st["myVote"] !== undefined;
  if (game.gameId === "closest-wins") return st["myGuess"] !== undefined;
  if (game.gameId === "guess-the-year") {
    const events = (st["events"] ?? []) as { id: string }[];
    const guesses = (st["myGuesses"] ?? {}) as Record<string, unknown>;
    return events.length > 0 && events.every((e) => guesses[e.id] !== undefined);
  }
  if (game.gameId === "impostor") {
    if (st["phase"] === "vote") return st["myVote"] !== undefined;
    if (st["phase"] === "clue" && playerId) {
      const clues = (st["clues"] ?? {}) as Record<string, unknown>;
      return clues[playerId] !== undefined;
    }
    return false;
  }
  return false;
}

export function deriveShowPhase(
  playing: PlayerGame | undefined,
  latestFinished: PlayerGame | undefined,
  introDismissedFor: string | null,
  resultsDismissedFor: string | null,
  playerId?: string,
): ShowPhase {
  if (playing) {
    // D3: a timing-v2 game's rules were read in the briefing, before any
    // clock started, so there is no second intro racing the clock.
    if (introDismissedFor !== playing.id && playing.timingVersion !== 2) return "intro";
    if (myProgressDone(playing, playerId)) return "waiting";
    return "gameplay";
  }
  if (latestFinished && resultsDismissedFor !== latestFinished.id) return "results";
  return "lobby";
}

/** Stable ornament colour for a player id (hash → palette index). */
export const ORNAMENT_COLORS = ["#E5BC70", "#A73545", "#7FB069", "#F7F2E8", "#8E6BA8", "#4A90A4"];
export function ornamentColor(playerId: string): string {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
  return ORNAMENT_COLORS[h % ORNAMENT_COLORS.length]!;
}
