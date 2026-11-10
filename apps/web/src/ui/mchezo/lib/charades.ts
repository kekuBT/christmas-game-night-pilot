/**
 * Stage 5.1 (O-06): Charades teams, named the same way on every screen.
 * The server's model: two teams; one player acts at a time; when the actor
 * taps Correct their OWN team scores +100 (src/games/charades.ts). So the
 * acting team is the one that guesses. Display only; scoring is unchanged.
 */
export const teamName = (i: number): string => `Team ${i === 0 ? "A" : "B"}`;

export function teamLine(teams: readonly (readonly string[])[], scores: readonly number[], nameOf: (id: string) => string): string {
  return teams.map((t, i) => `${teamName(i)} (${t.map(nameOf).join(", ")}): ${scores[i] ?? 0}`).join(" · ");
}

/** "Team A wins 300–200", or a draw. */
export function teamResult(scores: readonly number[]): string {
  const [a = 0, b = 0] = scores;
  if (a === b) return `A draw: ${a}–${b}.`;
  return `${teamName(a > b ? 0 : 1)} wins ${Math.max(a, b)}–${Math.min(a, b)}.`;
}
