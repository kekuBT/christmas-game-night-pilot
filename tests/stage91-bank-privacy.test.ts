/**
 * Stage 9.1 (review 6808081378, 4): the Jebena Rush answer bank must never
 * ship to browsers. The server keeps it; the views carry played facts only.
 * This walks the web app's import graph (every file under apps/web/src and
 * everything it imports, statically or dynamically) and fails if any path
 * reaches the bank, the matcher, the module or the module registry (which
 * imports every module). The browser driver check-jebena-rush also scans the
 * built files and public responses for bank-only canaries.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const WEB = join(ROOT, "apps", "web", "src");
const FORBIDDEN = [
  /src\/games\/modules\/packs\//,
  /src\/games\/modules\/jebena(Match)?\.ts$/,
  /src\/games\/modules\/index\.ts$/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

/** A relative specifier as the bundler resolves it (".js" may name a .ts/.tsx file). */
function resolveSpecifier(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  const stem = base.replace(/\.(js|jsx|mjs)$/, "");
  for (const c of [base, `${stem}.ts`, `${stem}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specs = new Set<string>();
  // import … from "x"; export … from "x"; import "x"; import("x")
  for (const m of text.matchAll(/(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const s = m[1] ?? m[2] ?? m[3];
    if (s && s.startsWith(".")) specs.add(s);
  }
  return [...specs].map((s) => resolveSpecifier(file, s)).filter((x): x is string => !!x && /\.(ts|tsx)$/.test(x));
}

describe("Jebena Rush bank privacy: nothing in the web app imports the bank", () => {
  it("the web app's import graph never reaches the bank, the matcher, the module or the module registry", () => {
    const seen = new Set<string>();
    const via = new Map<string, string>();
    const queue = sourceFiles(WEB);
    for (const f of queue) seen.add(f);
    while (queue.length) {
      const f = queue.pop()!;
      for (const dep of importsOf(f)) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        via.set(dep, f);
        queue.push(dep);
      }
    }
    const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
    const bad = [...seen].map(rel).filter((p) => FORBIDDEN.some((re) => re.test(p)));
    const chain = (p: string) => { const out = [p]; let cur = resolve(ROOT, p); while (via.has(cur)) { cur = via.get(cur)!; out.push(rel(cur)); } return out.join(" ← "); };
    expect(bad.map(chain)).toEqual([]);
    // The walk really follows imports out of the web app (a sanity check that it isn't vacuous).
    expect([...seen].map(rel)).toContain("src/games/registry.ts");
    expect([...seen].map(rel)).toContain("src/games/modules/pulse.ts");
  });
});
