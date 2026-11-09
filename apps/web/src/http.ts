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
