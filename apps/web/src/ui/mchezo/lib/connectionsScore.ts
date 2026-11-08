/**
 * S3-WCN-01: how a Word Connections score is made up, in words, from the
 * player's own recorded result (groups found, mistakes). It mirrors the
 * server's scorer (src/games/connections.ts, connectionsScore), and a unit
 * test checks the two agree for every possible result; the results screen
 * also shows a breakdown only when it adds up to the server's recorded score.
 */
export const CONNECTIONS_RULE = "100 points for each group you find. Find all four with no mistakes: +50 bonus. With one mistake: +20.";

export function connectionsBreakdown(solved: number, mistakes: number): { base: number; bonus: number; total: number; line: string } {
  const base = solved * 100;
  const bonus = solved === 4 ? (mistakes === 0 ? 50 : mistakes === 1 ? 20 : 0) : 0;
  const groups = `${solved} group${solved === 1 ? "" : "s"} × 100 = ${base}`;
  const why = solved < 4
    ? "no bonus (the bonus needs all four groups)"
    : bonus === 50 ? "+50 for no mistakes"
    : bonus === 20 ? "+20 for one mistake"
    : `no bonus (${mistakes} mistakes)`;
  return { base, bonus, total: base + bonus, line: `${groups}, ${why} = ${base + bonus}` };
}
