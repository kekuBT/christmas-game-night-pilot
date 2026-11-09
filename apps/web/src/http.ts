/**
 * Talking to the game server. Every reply the app acts on must be the
 * server's own JSON: a proxy's HTML page (a stopped preview, a login page, a
 * captive portal) served with status 200 used to become `{}` and replace the
 * room on screen, which blanked the app (S3-LOB-03). It is now an error, so
 * the caller keeps the last room it knew and says the server can't be reached.
 */
export async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  let body: unknown;
  let parsed = false;
  try { body = JSON.parse(text); parsed = true; } catch { /* not JSON */ }
  if (!r.ok) {
    const msg = parsed && body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    throw new Error(typeof msg === "string" && msg ? msg : `Request failed (${r.status})`);
  }
  if (!parsed) throw new Error("The game server sent an unexpected reply. Retrying…");
  return body as T;
}

/** A room projection, as the server sends it (players and games are always lists). */
export function isProjection(x: unknown): boolean {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const p = x as { roomId?: unknown; players?: unknown; games?: unknown };
  return typeof p.roomId === "string" && Array.isArray(p.players) && Array.isArray(p.games);
}

/**
 * Stage 4: may a polled projection reply replace what is on screen?
 *
 * The app reads the room two ways: pushes over the WebSocket and HTTP polls
 * (every 2 s and after each action). A poll's reply can be overtaken: it is
 * made, a newer state is pushed and shown, and then the older reply lands and
 * rolls the screen back (seen as a results screen flipping back to the game
 * for up to a poll interval). A reply is dropped only when BOTH hold:
 *  - a newer projection was shown while this request was in flight, and
 *  - this reply is for the same room with a lower `seq` (the room's event
 *    counter, which only grows).
 * Without a race nothing is dropped, so a server restored with a lower seq
 * can never freeze the screen; pushes are always applied.
 */
export function isOvertakenReply(
  reply: { roomId?: unknown; seq?: unknown },
  shown: { roomId?: string; seq?: number } | null,
  newerShownInFlight: boolean,
): boolean {
  if (!newerShownInFlight || !shown) return false;
  if (typeof reply.roomId !== "string" || reply.roomId !== shown.roomId) return false;
  if (typeof reply.seq !== "number" || typeof shown.seq !== "number") return false;
  return reply.seq < shown.seq;
}
