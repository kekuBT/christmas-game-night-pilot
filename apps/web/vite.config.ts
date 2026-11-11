import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";

const WEB = fileURLToPath(new URL(".", import.meta.url));
const BUILD_META = '<meta name="mchezo-build" content="dev" />';

/** Every file under apps/web/public, as site paths ("/icons/icon-192.png"). */
function publicFiles(dir = join(WEB, "public")): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(publicFiles(p));
    else out.push("/" + relative(join(WEB, "public"), p).split(sep).join("/"));
  }
  return out.sort();
}

/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4): /sw.js for this build.
 * - The version is a hash of everything the build ships (the bundle's
 *   files and contents, and the public files), so a new build means a new
 *   worker and a new shell cache, and an unchanged build means none.
 * - index.html carries the same version (<meta name="mchezo-build">), so a
 *   page can tell whether a waiting worker belongs to a newer build.
 * - Precached: the shell page, this build's JS and CSS, and the public
 *   install files. Fonts and other assets are kept when first used.
 */
function mchezoServiceWorker(): Plugin {
  return {
    name: "mchezo-service-worker",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset" || typeof html.source !== "string" || !html.source.includes(BUILD_META)) {
        this.error("mchezo-service-worker: index.html (with its mchezo-build meta) is not in the bundle");
      }
      const pub = publicFiles();
      const hash = createHash("sha256");
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name]!;
        hash.update(name).update("\0").update(item.type === "chunk" ? item.code : item.source).update("\0");
      }
      for (const p of pub) hash.update(p).update("\0").update(readFileSync(join(WEB, "public", p.slice(1)))).update("\0");
      const version = hash.digest("hex").slice(0, 16);
      // The exact allowlist (feedback 6802191261 §2): every file this build emitted under /assets
      // (scripts, styles, fonts), the public install files and the shell page. Nothing else is ever the worker's.
      const assets = Object.keys(bundle).filter((n) => /^assets\/[^/]+$/.test(n)).map((n) => "/" + n).sort();
      const files = ["/index.html", ...assets, ...pub];
      // Precached: what a page of this build needs to start (the shell, its scripts and styles, the install files).
      // Fonts are kept when first used (still only from this list).
      const precache = ["/index.html", ...assets.filter((a) => /\.(js|css)$/.test(a)), ...pub];
      (html as { source: string }).source = (html as { source: string }).source.replace(BUILD_META, `<meta name="mchezo-build" content="${version}" />`);
      const out = await esbuild({
        entryPoints: [join(WEB, "src", "install", "sw.ts")],
        bundle: true,
        write: false,
        format: "iife",
        target: "es2020",
        minify: true,
        legalComments: "none",
        define: { __MCHEZO_VERSION__: JSON.stringify(version), __MCHEZO_FILES__: JSON.stringify(files), __MCHEZO_PRECACHE__: JSON.stringify(precache) },
      });
      this.emitFile({ type: "asset", fileName: "sw.js", source: `/* Mchezo service worker, build ${version} */\n${out.outputFiles[0]!.text}` });
    },
  };
}

export default defineConfig({
  root: "apps/web",
  plugins: [react(), mchezoServiceWorker()],
  server: { port: 5173, proxy: { "/rooms": "http://localhost:3000", "/games": "http://localhost:3000", "/health": "http://localhost:3000" } },
  build: { outDir: "dist", emptyOutDir: true },
});
