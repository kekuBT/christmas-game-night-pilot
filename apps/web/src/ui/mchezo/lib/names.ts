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
