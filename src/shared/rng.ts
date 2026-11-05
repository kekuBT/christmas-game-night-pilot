// Shared seeded PRNG (mulberry32). Pure math, no platform imports, so it
// is safe to import from both server code and the web bundle. Moved here
// from src/shared/protocol.ts (which re-exports it) so client-side pure
// engines like the shuffle engine can use it without pulling in
// protocol's node:crypto dependency.
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
