// Test oracle (Stage 9.1): Jebena Rush drivers play as a family member who
// knows the categories. This reads the shipped answer banks and runs the
// real matcher once (through tsx, the server's own TypeScript), so every
// sample below is what the server will actually decide: answers, aliases,
// typos it accepts, inputs it calls ambiguous, and near misses. The server
// never sends a bank to the browser; this is test-side knowledge only.
import { execFileSync } from "node:child_process";

const SCRIPT = `
const { JEBENA_CATEGORIES } = await import("./src/games/modules/packs/jebena-banks.ts");
const { matchJebena } = await import("./src/games/modules/jebenaMatch.ts");
const out = {};
for (const c of JEBENA_CATEGORIES) {
  const answers = c.answers.map((a) => ({ id: a.id, name: a.name, aliases: (a.aliases ?? []).filter((al) => { const m = matchJebena(c, al); return m.kind === "accepted" && m.answerId === a.id && m.via === "alias"; }) }));
  const typos = [];
  const ambiguous = [];
  for (const a of c.answers) {
    const n = a.name;
    if (!/^[A-Za-z ]+$/.test(n)) continue;
    for (let i = 1; i < n.length - 1; i++) {
      const v = n.slice(0, i) + n.slice(i + 1);
      if (/ /.test(n[i])) continue;
      const m = matchJebena(c, v);
      if (m.kind === "accepted" && m.answerId === a.id && m.via === "typo" && typos.length < 6 && !typos.some((t) => t.id === a.id)) typos.push({ id: a.id, name: n, typed: v });
      if (m.kind === "ambiguous" && ambiguous.length < 3 && !ambiguous.includes(v)) ambiguous.push(v);
    }
  }
  const nearMiss = Object.keys(c.notAccepted ?? {}).filter((f) => matchJebena(c, f).kind === "near-miss").slice(0, 3);
  out[c.id] = { id: c.id, name: c.name, answers, typos, ambiguous, nearMiss, notInBank: matchJebena(c, "Zzqxv Plonk").kind === "not-in-bank" ? "Zzqxv Plonk" : null };
}
console.log(JSON.stringify(out));
`;

let cached = null;
/** Every category's samples, keyed by category id. */
export function jebenaOracle() {
  if (cached) return cached;
  const raw = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", SCRIPT], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  cached = JSON.parse(raw.trim().split("\n").pop());
  return cached;
}

/** An answer in `categoryId` that isn't in `used` (canonical names, case-insensitive), optionally one with an alias or a typo. */
export function freshAnswer(categoryId, used, { kind = "plain" } = {}) {
  const c = jebenaOracle()[categoryId];
  if (!c) throw new Error(`oracle: unknown Jebena category ${categoryId}`);
  const taken = new Set([...used].map((u) => String(u).toLowerCase()));
  if (kind === "alias") {
    const a = c.answers.find((x) => x.aliases.length > 0 && !taken.has(x.name.toLowerCase()));
    return a ? { typed: a.aliases[0], name: a.name } : null;
  }
  if (kind === "typo") {
    const t = c.typos.find((x) => !taken.has(x.name.toLowerCase()));
    return t ? { typed: t.typed, name: t.name } : null;
  }
  const a = c.answers.find((x) => !taken.has(x.name.toLowerCase()) && /^[A-Za-z][A-Za-z ]{2,}$/.test(x.name));
  return a ? { typed: a.name, name: a.name } : null;
}
