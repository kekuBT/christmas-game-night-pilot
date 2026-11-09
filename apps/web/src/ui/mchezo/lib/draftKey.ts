/**
 * Stage 5.1 (O-02): the scope a typed-but-unsent answer belongs to. The
 * player's game panel is mounted with this as its React key, so a new game,
 * round or phase starts with empty inputs instead of the previous question's
 * draft. Display only: nothing here is sent to the server.
 */
export function draftKey(game: { id: string; lifecycle?: { phaseKey?: string } }): string {
  return `${game.id}:${game.lifecycle?.phaseKey ?? ""}`;
}
