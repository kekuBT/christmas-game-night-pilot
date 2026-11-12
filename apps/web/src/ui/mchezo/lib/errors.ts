// Human-readable error sentences for server rejections (Work Package F).
// Pure module, no imports — safe to use from the web app and unit-tested.
//
// The server rejects with terse codes (PHASE_CLOSED, ALREADY_ANSWERED)
// or terse sentences ("Display name already taken", "Only host/cohost
// can start a game", "Need at least 2 connected players"). Those reach
// the player verbatim today as `Not accepted: <reason>` or as the thrown
// HTTP error message. This map translates them into sentences a player
// can act on. Every entry is grounded in an actual string in
// src/server/room.ts, src/server/http.ts, or src/games/*.ts — see the
// comments. The raw reason stays in the console (App.reportError logs
// it); it never reaches the screen.
//
// Rules, in order:
// 1. A leading "Not accepted: " prefix is stripped (that is how the
//    App's intent path phrases rejections).
// 2. An empty reason, or "unknown", is generic — never the word "unknown".
// 3. Exact matches for the known codes and sentences.
// 4. Prefix rules for the families whose suffix varies ("Only host/cohost
//    can …" covers grant/start/advance/override/skip and the Memory Book
//    approve/revoke/mute routes; "Need at least N connected players"
//    varies with the game's minimum).
// 5. Any other bare code (all-caps snake_case) is generic — a new server
//    reason must be added here deliberately, not shown raw.
// 6. Anything else passes through unchanged: already-human sentences
//    the App sets itself ("Spectator session expired — …", "Request
//    failed") are not rewritten.
export const GENERIC_ERROR = "Something went wrong — try again.";
/**
 * A player action that got no answer at all (offline, dropped connection).
 * Stage 5: it may or may not have reached the server, so say exactly that;
 * the screen shows it as "in" only once the server's state says so.
 */
export const NOT_DELIVERED = "We couldn’t confirm that — check your connection. If it doesn’t show as in, try again.";

const EXACT: Record<string, string> = {
  // Intent rejections (src/server/room.ts submitIntent / submitAbstain).
  PHASE_CLOSED:
    "That game has closed — the five-minute limit passed. The host can skip it once it is stalled.",
  ALREADY_ANSWERED: "Your answer is already in — it counted once.",
  ALREADY_SUBMITTED: "Your answer is already in — it counted once.",
  ALREADY_GUESSED: "Your answer is already in — it counted once.",
  ALREADY_ABSTAINED: "You already sat this one out.",
  NOT_IN_GAME: "You are not in this game.",
  INVALID_PAYLOAD: "That did not send properly — try again.",
  INVALID_INTENT: "That did not send properly — try again.",
  UNKNOWN_QUESTION: "That question is no longer open.",
  UNKNOWN_EVENT: "That question is no longer open.",
  UNKNOWN_ACTION: "That question is no longer open.",
  WRONG_ROOM: "That was for a different room.",
  // Charades abstention is rejected NOT_APPLICABLE (room.ts) — Pass exists.
  NOT_APPLICABLE: "That does not apply to this game.",
  // Stage 5 games.
  PREDICT_FIRST: "Make your prediction first, then vote.",
  WRONG_ROUND: "That round isn't open on this phone. It will catch up in a moment.",
  ALREADY_FINISHED: "You've finished this game.",
  DRAWER_CANNOT_GUESS: "You're drawing this one, so you can't guess it.",
  // Draw & Guess and Jebena Rush both take turns.
  NOT_YOUR_TURN: "It isn't your turn.",
  // Stage 9.1 (Jebena Rush).
  STALE_TURN: "Time ran out on that turn, so that answer didn't count. The jebena has moved on.",
  OUT: "All your cups are broken. Watch the rest!",
  TOO_MANY_ATTEMPTS: "That's all your tries for this turn.",
  TOO_MANY_GUESSES: "That's all your guesses for this drawing.",
  RATE_LIMITED: "Slow down a little: that was too quick. Try again.",
  DRAWING_FULL: "The drawing is full. Clear or undo to make room.",
  PAYLOAD_TOO_LARGE: "That was too much at once. Try again.",
  SWAP_NOT_AVAILABLE: "You can only change the word once, before drawing or guessing starts.",
  // Stage 9.3 (Spectrum).
  INVALID_CLUE: "A clue needs 1 to 80 characters. Give a clue, not the target number.",
  NOT_CLUE_GIVER: "Someone else is giving the clue this round.",
  GIVER_CANNOT_GUESS: "You gave the clue this round, so your team does the guessing.",
  NOT_A_GUESSER: "You're watching this round.",
  INVALID_GUESS: "A guess is a whole number from 0 to 100.",
  STALE_ROUND: "That round has moved on, so it didn't count. Your phone will catch up in a moment.",
  WRONG_PHASE: "That round has moved on, so it didn't count. Your phone will catch up in a moment.",
  SAT_OUT: "You left this game. Watch the rest!",
  // HTTP errors (src/server/room.ts startGame / skipTimedOutGame / join).
  "A game is already in progress":
    "A game is already running — finish it or wait for the host.",
  "Game has not timed out yet":
    "The game is still open — the host can skip it only after the five-minute limit.",
  "Display name already taken":
    "That name is taken in this room — pick another.",
  // Reconnect failures (src/server/room.ts reconnect).
  "Unknown player slot":
    "We could not bring you back into your seat — rejoin with the room code.",
  "Recovery token does not match":
    "We could not bring you back into your seat — rejoin with the room code.",
};

export function humanError(raw: string): string {
  let text = (raw ?? "").trim();
  if (text.startsWith("Not accepted: ")) text = text.slice("Not accepted: ".length).trim();
  if (text === "" || text.toLowerCase() === "unknown") return GENERIC_ERROR;
  const exact = EXACT[text];
  if (exact !== undefined) return exact;
  if (text.startsWith("Only host/cohost can")) return "Only the host or a cohost can do that.";
  if (text.startsWith("Need at least ") && text.includes(" connected players")) {
    return "Waiting for at least one more player to join.";
  }
  // A bare server code we have not mapped yet — never show it raw.
  if (/^[A-Z][A-Z0-9_]+$/.test(text)) return GENERIC_ERROR;
  return text;
}
