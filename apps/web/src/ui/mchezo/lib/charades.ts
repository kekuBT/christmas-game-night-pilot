/**
 * Stage 5.1 (O-06): Charades teams, named the same way on every screen.
 * The server's model: one player acts at a time; when the actor taps Correct their OWN team scores +100
 * (src/games/charades.ts). So the acting team is the one that guesses. Display only; scoring is unchanged.
 *
 * Stage 12.8 (D-S128-03): Charades plays with the night's teams (2–4) or two dealt for it; the state carries their
 * names. Older games have none: Team A and Team B.
 */
export const teamName = (i: number, names?: readonly string[]): string => names?.[i] ?? `Team ${String.fromCharCode(65 + i)}`;

export function teamLine(teams: readonly (readonly string[])[], scores: readonly number[], nameOf: (id: string) => string, names?: readonly string[]): string {
  return teams.map((t, i) => `${teamName(i, names)} (${t.map(nameOf).join(", ")}): ${scores[i] ?? 0}`).join(" · ");
}

/** "Team A wins 300–200", a draw, or with more teams "The Lions win with 300". */
export function teamResult(scores: readonly number[], names?: readonly string[]): string {
  if (scores.length <= 2) {
    const [a = 0, b = 0] = scores;
    if (a === b) return `A draw: ${a}–${b}.`;
    return `${teamName(a > b ? 0 : 1, names)} wins ${Math.max(a, b)}–${Math.min(a, b)}.`;
  }
  const top = Math.max(...scores);
  const first = scores.map((s, i) => (s === top ? i : -1)).filter((i) => i >= 0);
  if (first.length === scores.length) return `Every team tied on ${top}.`;
  if (first.length === 1) return `${teamName(first[0]!, names)} wins with ${top}.`;
  const n = first.map((i) => teamName(i, names));
  return `${n.slice(0, -1).join(", ")} and ${n.at(-1)} tie for first with ${top}.`;
}
