/**
 * What a phone says when the server refuses one of its actions (accepted: false). Pure: no React, no fetch.
 *
 * Fair starts (handoff 7004097156, H7; narrowed per 7004637491): one refusal only is not a failure to show. A
 * briefing "I'm ready" (`briefing-ready` with ready: true) that reaches the server after its own game began (the
 * host's confirmed Start now, or the last player's Ready, landed first) is refused with READY_LOCKED and changes
 * nothing: the game the player was getting ready for has started, and their screen shows it. Any other refusal keeps
 * its words, READY_LOCKED included: a late "not ready" (ready: false) still says the game has already started, since
 * the player asked for more time and didn't get it. Delivery failures (no answer, 5xx) never reach this function.
 * null means "say nothing".
 */
export function refusalText(action: string, payload: Record<string, unknown>, reason: string | undefined): string | null {
  if (action === "briefing-ready" && payload["ready"] === true && reason === "READY_LOCKED") return null;
  if (reason === "PHASE_CLOSED") return "Time was up for that one — it wasn’t counted.";
  if (reason === "READY_LOCKED") return "The game has already started.";
  return `Not accepted: ${reason || "unknown"}`;
}
