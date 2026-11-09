import { NOT_DELIVERED } from "../../ui/mchezo/lib/errors.js";

/**
 * Stage 5.1 (2C): the line under a send the phone couldn't confirm.
 * - Not confirmed: says so (role=alert), using the server's refusal if there
 *   was one, otherwise "We couldn't confirm that…".
 * - `landed`: the server's own list of this player's accepted actions
 *   (projection me.acceptedEventIds) now includes that send, so the reply was
 *   lost but the action counted. Says it went through, and nothing else.
 * Never says an action counted unless the server's state says so.
 */
export function SendNote({ shown, landed, error, testId }: { shown: boolean; landed?: boolean; error?: string; testId: string }) {
  if (!shown) return null;
  if (landed) return <p className="ok mz-send-landed" role="status" data-testid="mz-send-landed" style={{ textAlign: "center" }}>That went through after all: the game has it.</p>;
  return <p className="err" role="alert" data-testid={testId} style={{ textAlign: "center" }}>{error ?? NOT_DELIVERED}</p>;
}
