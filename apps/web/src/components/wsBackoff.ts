/**
 * WebSocket reconnect backoff (WS reconnect robustness, nonvisual work
 * during the M6 visual freeze): a dropped socket used to stay dead for
 * the rest of the session — only the 2s polling fallback kept the UI
 * fresh, while the server had already marked the player "(away)" and
 * excluded them from startGame's connected-player count until they hit
 * the manual Reconnect button. The client now reopens the socket itself.
 *
 * Delay policy: 1s, 2s, 4s, 8s, then 10s for every later attempt. The cap
 * keeps a long outage from turning into a tight reconnect loop, and the
 * caller must NOT retry on a 1008 close (server rejected the session or
 * the room) — retrying an auth rejection forever would spam a dead
 * session instead of letting polling/manual reconnect take over.
 */
export function wsReconnectDelayMs(attempt: number): number {
  if (attempt <= 1) return 1000;
  return Math.min(1000 * 2 ** (attempt - 1), 10000);
}
