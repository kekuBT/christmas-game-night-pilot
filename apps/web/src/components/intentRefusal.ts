/**
 * What a phone says when the server refuses one of its actions (accepted: false). Pure: no React, no fetch.
 *
 * Fair starts (handoff 7004097156, H7): a briefing Ready, or "not ready", that reaches the server after play began
 * (the host's confirmed Start now, or the last player's Ready, landed first) is refused with READY_LOCKED and changes
 * nothing. That is not a failure: the game started, the player's screen shows it, and a message on that game's first
 * screen would only blame them for a tap the server rightly ignored. null means "say nothing".
 */
export function refusalText(action: string, reason: string | undefined): string | null {
  if (action === "briefing-ready" && reason === "READY_LOCKED") return null;
  if (reason === "PHASE_CLOSED") return "Time was up for that one — it wasn’t counted.";
  if (reason === "READY_LOCKED") return "The game has already started.";
  return `Not accepted: ${reason || "unknown"}`;
}
