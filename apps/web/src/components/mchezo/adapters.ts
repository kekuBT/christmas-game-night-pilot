// Adapters between our server projections and the Mchezo presentational
// components. All game data here comes from the server projection; nothing
// is computed client-side except display ordering via the handoff's own
// rankStandings() (which only orders scores the server supplied).
import type { Player as MzPlayer, ReactionEvent, ReactionId } from "../../ui/mchezo/index.js";
import type { PublicPlayer } from "../../types.js";

/** Our players -> Mchezo players. Palette colour comes from join order
    (the handoff's playerPalette, by index), so it is stable across seasons. */
export function toMzPlayers(players: PublicPlayer[]): MzPlayer[] {
  return players.map((p) => ({
    id: p.id,
    name: p.displayName,
    connection: p.connected ? "connected" : "disconnected",
    presence: p.presence ?? (p.connected ? "connected" : "away"),
    isHost: p.isHost,
  }));
}

/** Our server reaction emoji set -> handoff reaction ids (for bursts). */
export function emojiToReactionId(emoji: string): ReactionId {
  switch (emoji) {
    case "👏": return "bravo";
    case "😂": return "ha";
    case "🔥": return "wow";
    case "❄️": return "brr";
    default: return "love"; // 🎉 and 🎄 both read as a celebration burst
  }
}

/** Handoff reaction ids -> our server emoji set (the only set the server accepts). */
export function reactionIdToEmoji(id: ReactionId): string {
  switch (id) {
    case "bravo": return "👏";
    case "ha": return "😂";
    case "wow": return "🔥";
    case "brr": return "❄️";
    default: return "🎉";
  }
}

/** Server reactions (emoji + sender name + ts) -> handoff ReactionEvents.
    Bursts need a player id, so the sender name is resolved back to an id. */
export function toMzReactions(
  reactions: { emoji: string; sender: string; ts: number }[] | undefined,
  players: PublicPlayer[],
): ReactionEvent[] {
  return (reactions ?? []).map((r, i) => ({
    id: `r-${r.ts}-${i}`,
    playerId: players.find((p) => p.displayName === r.sender)?.id ?? "",
    reaction: emojiToReactionId(r.emoji),
    at: r.ts,
  })).filter((r) => r.playerId !== "");
}
