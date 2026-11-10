import { GAME_MANIFESTS } from "../../../../../../src/games/manifest.js";
/**
 * Stage 4 (S3-TRV-02): short labels for tight spots (the waiting ring, the
 * lobby circle) that tell similar names apart. Built only from each player's
 * own display name; nothing is invented and the full name stays in the
 * accessible name and tooltip.
 *
 *   first word when it is unique ("Keku", "Amina");
 *   first word + last initial when first words collide ("Audit G.", "Audit T.");
 *   the full name when that still collides ("Mary Smith", "Mary Stone").
 */
export function shortNames(players: readonly { id: string; name: string }[]): Record<string, string> {
  const words = (n: string) => n.trim().split(/\s+/).filter(Boolean);
  const key = (s: string) => s.toLocaleLowerCase();
  const first = (n: string) => words(n)[0] ?? n.trim();
  const count = (labels: string[]) => labels.reduce<Record<string, number>>((m, l) => ({ ...m, [key(l)]: (m[key(l)] ?? 0) + 1 }), {});
  const firsts = count(players.map((p) => first(p.name)));
  let labels = players.map((p) => {
    if ((firsts[key(first(p.name))] ?? 0) <= 1) return first(p.name);
    const w = words(p.name);
    return w.length > 1 ? `${w[0]} ${w[w.length - 1]!.charAt(0).toLocaleUpperCase()}.` : p.name.trim();
  });
  const again = count(labels);
  labels = labels.map((l, i) => ((again[key(l)] ?? 0) > 1 ? players[i]!.name.trim() : l));
  return Object.fromEntries(players.map((p, i) => [p.id, labels[i]!]));
}

/**
 * Stage 5.1 (3F, O-12/O-14): what a player-facing screen calls a game or a
 * player when its usual lookup misses (the game list still loading, a player
 * who has left). Never an internal id such as "who-said-that" or "player-3".
 */

export function titleFor(gameId: string, registry?: readonly { id: string; title: string }[]): string {
  return registry?.find((g) => g.id === gameId)?.title ?? GAME_MANIFESTS.find((m) => m.id === gameId)?.title ?? "This game";
}

export function playerName(playerId: string, players: readonly { id: string; displayName: string }[]): string {
  return players.find((p) => p.id === playerId)?.displayName ?? "A player";
}

/** A game's status in words, for the older game panel. */
export function statusWords(status: string): string {
  return status === "playing" ? "In play" : status === "finished" ? "Finished" : status === "briefing" ? "Getting ready" : "Waiting";
}
