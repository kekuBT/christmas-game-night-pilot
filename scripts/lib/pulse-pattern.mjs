// Pattern Pulse: the round's pattern for a browser driver (a test oracle; H1, handoff 7008903623).
//
// The phone now shows the pattern one symbol at a time and never holds the whole sequence in its page, so a
// driver that needs to tap the right answer reads it the way the phone itself received it: from this page's
// OWN seat's projection (`/rooms/:id/projection?audience=player`), which carries the pattern only during the
// memorise window, exactly as before. Nothing here reads another player's pattern, and nothing is added to the
// app: the seat is the one the page already holds (this tab's seat, a remembered seat, or the solo seat).
// scripts/check-pulse-cue.mjs checks what the screen shows over time.
import { PROTOCOL_HEADERS } from "./protocol.mjs";

/**
 * The open round's pattern for the seat this page plays, or null outside a memorise window.
 * Call it once the memorise screen (data-testid "mz-pp-memorise") is up.
 */
export async function readPulsePattern(page) {
  return page.evaluate(async (headers) => {
    const seats = [];
    try {
      const roomId = sessionStorage.getItem("cgn_roomId");
      const playerId = sessionStorage.getItem("cgn_playerId");
      let token = sessionStorage.getItem("cgn_token");
      if (roomId && playerId && !token) {
        const list = JSON.parse(localStorage.getItem("mz_remembered_seats") || "[]");
        token = (Array.isArray(list) ? list : []).find((x) => x && x.roomId === roomId && x.playerId === playerId)?.token ?? null;
      }
      if (roomId && token) seats.push({ roomId, token });
    } catch { /* storage unavailable: try the solo seat */ }
    try {
      const solo = JSON.parse(localStorage.getItem("mchezo.solo.v1") || "null");
      if (solo && solo.roomId && solo.token) seats.push({ roomId: solo.roomId, token: solo.token });
    } catch { /* no solo seat */ }
    for (const { roomId, token } of seats) {
      const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: { ...headers, "x-session-token": token } }).catch(() => null);
      if (!r || !r.ok) continue;
      const proj = await r.json().catch(() => null);
      for (const g of proj?.myGames ?? []) {
        const pattern = g?.gameId === "pattern-pulse" ? g.state?.open?.pattern : undefined;
        if (Array.isArray(pattern)) return pattern.map(Number);
      }
    }
    return null;
  }, PROTOCOL_HEADERS);
}
