// Beta R1 (docs/beta/beta-r1-release.md): build one release folder from the exact checked-out revision.
//
//   node scripts/release/pack.mjs --out <dir> [--allow-dirty]
//
// The folder holds only what runs: the compiled server (dist/), the built web app (apps/web/dist/), the content library
// (content/), package.json and package-lock.json, and release.json (the revision it was built from). No tests, scripts,
// docs, data, node_modules or secrets. Install and start it with:
//
//   npm ci --omit=dev --ignore-scripts      (installs ws and zod only)
//   NODE_ENV=production MCHEZO_DATA_DIR=/var/lib/... MCHEZO_PUBLIC_ORIGIN=https://... MCHEZO_BETA_ACCESS_CODE=... node dist/server/serve.js
//
// A dirty tree is refused (the revision would not describe the files) unless --allow-dirty, which marks it "-dirty".
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const args = process.argv.slice(2);
const outArg = args[args.indexOf("--out") + 1];
if (!args.includes("--out") || !outArg) { console.error("usage: node scripts/release/pack.mjs --out <dir> [--allow-dirty]"); process.exit(2); }
const out = resolve(outArg);
if (out === ROOT || out.startsWith(ROOT + "/")) { console.error(`--out must be outside the repository (${ROOT}).`); process.exit(2); }
if (existsSync(out) && readdirSync(out).length) { console.error(`--out ${out} is not empty.`); process.exit(2); }
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const sha = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain").length > 0;
if (dirty && !args.includes("--allow-dirty")) { console.error("The working tree has uncommitted changes; commit them, or pass --allow-dirty for a local try."); process.exit(2); }
const run = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
const bin = (name) => join(ROOT, "node_modules", ".bin", name);

mkdirSync(out, { recursive: true });
const t0 = Date.now();
run(bin("tsc"), ["-p", "tsconfig.build.json", "--outDir", join(out, "dist")]);
run(bin("vite"), ["build", "--config", "apps/web/vite.config.ts", "--outDir", join(out, "apps", "web", "dist"), "--emptyOutDir", "--logLevel", "warn"]);
cpSync(join(ROOT, "content"), join(out, "content"), { recursive: true });
for (const f of ["package.json", "package-lock.json"]) cpSync(join(ROOT, f), join(out, f));
const release = { revision: dirty ? `${sha}-dirty` : sha, builtAt: new Date().toISOString(), node: process.version };
writeFileSync(join(out, "release.json"), JSON.stringify(release, null, 2) + "\n");
console.log(`release ${release.revision} packed into ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
