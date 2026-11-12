// Test oracle (Stage 9.1): Jebena Rush drivers play as a family member who
// knows the categories. This reads the shipped answer banks and runs the
// real matcher once (through tsx, the server's own TypeScript), so every
// sample below is what the server will actually decide: answers, aliases,
// typos it accepts, inputs it calls ambiguous, and near misses. The server
// never sends a bank to the browser; this is test-side knowledge only.
import { execFileSync } from "node:child_process";

const SCRIPT = `
const { JEBENA_BANK_VERSION, JEBENA_CATEGORIES } = await import("./src/games/modules/packs/jebena-banks.ts");
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
  out[c.id] = { id: c.id, name: c.name, source: c.source, reasons: Object.values(c.notAccepted ?? {}), answers, typos, ambiguous, nearMiss, notInBank: matchJebena(c, "Zzqxv Plonk").kind === "not-in-bank" ? "Zzqxv Plonk" : null };
}
out.__version = JEBENA_BANK_VERSION;
console.log(JSON.stringify(out));
`;

let cached = null;
let version = null;
/** Every category's samples, keyed by category id. */
export function jebenaOracle() {
  if (cached) return cached;
  const raw = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", SCRIPT], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const all = JSON.parse(raw.trim().split("\n").pop());
  version = all.__version;
  delete all.__version;
  cached = all;
  return cached;
}

/** Distinctive answer names that exist only in the bank (checked present in it). */
const DISTINCTIVE = ["Blackcurrant", "Breadfruit", "Celeriac", "Bobsleigh", "Kickboxing", "Elderberry", "Chimpanzee", "Hairdresser"];

/**
 * Canaries (review 6808081378, 4): strings that exist only in the answer
 * bank module, so finding one in a shipped file or a public response means
 * the bank shipped. The bank's version, each category's source note, each
 * near-miss reason, and distinctive answers. (Common words such as "Orange"
 * or "Algeria" also appear in the app for other reasons, so they are not
 * canaries.)
 */
export function bankCanaries() {
  const o = jebenaOracle();
  const names = new Set(Object.values(o).flatMap((c) => c.answers.map((a) => a.name)));
  for (const d of DISTINCTIVE) if (!names.has(d)) throw new Error(`oracle: canary "${d}" is not in the bank`);
  return [version, ...Object.values(o).map((c) => c.source), ...Object.values(o).flatMap((c) => c.reasons), ...DISTINCTIVE].filter((x) => typeof x === "string" && x.length >= 6);
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
