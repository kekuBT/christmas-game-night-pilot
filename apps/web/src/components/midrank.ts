/**
 * Per-game midrank, display only (the Family Cup breakdown). Mirrors the
 * server's midrankScore and its rule that a game with fewer than two
 * players is not counted (empty result). Standings themselves always come
 * from the server.
 */
export function midrank(scores: Record<string, number>): Record<string, number> {
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  if (entries.length < 2) return {};
  const out: Record<string, number> = {};
  let i = 0;
  while (i < entries.length) {
    const value = entries[i]![1];
    let j = i;
    while (j + 1 < entries.length && entries[j + 1]![1] === value) j++;
    const pct = ((i + j) / 2 / (entries.length - 1)) * 100;
    for (let k = i; k <= j; k++) out[entries[k]![0]] = Math.round(pct * 100) / 100;
    i = j + 1;
  }
  return out;
}
