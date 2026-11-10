// The answer to a Math Mayhem prompt as the screen shows it ("12 + 34 = ?",
// "50 − 7 = ?", "6 × 7 = ?", "42 ÷ 6 = ?", "20% of 60 = ?"), so a driver can
// answer right or wrong on purpose without knowing the seed.
export function solveMath(prompt) {
  const t = prompt.replace(/\s+/g, " ").trim();
  let m;
  if ((m = /^(\d+)% of (\d+)/.exec(t))) return (Number(m[1]) * Number(m[2])) / 100;
  if ((m = /^(\d+) \+ (\d+)/.exec(t))) return Number(m[1]) + Number(m[2]);
  if ((m = /^(\d+) [−-] (\d+)/.exec(t))) return Number(m[1]) - Number(m[2]);
  if ((m = /^(\d+) × (\d+)/.exec(t))) return Number(m[1]) * Number(m[2]);
  if ((m = /^(\d+) ÷ (\d+)/.exec(t))) return Number(m[1]) / Number(m[2]);
  throw new Error(`unknown Math Mayhem prompt: ${prompt}`);
}

/** The number on an answer slab (its last run of digits). */
export const slabNumber = (s) => Number((String(s).match(/\d+/g) ?? ["NaN"]).at(-1));
