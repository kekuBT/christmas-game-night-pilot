import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { buildServiceWorker, type BundleLike } from "./swBuild.js";

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
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4): /sw.js for this build
 * (built by swBuild.ts).
 * - The version is a hash of everything the build ships: the bundle's files
 *   and contents, the public files, and the worker's own code. So any new
 *   build, a worker-only change included, means a new worker and a new shell
 *   cache, and an unchanged build means none.
 * - index.html carries the same version (<meta name="mchezo-build">), so a
 *   page can tell whether a waiting worker belongs to a newer build.
 * - Precached: the shell page, this build's JS and CSS, and the public
 *   install files. Fonts are kept when first used.
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
      const { version, sw } = await buildServiceWorker({
        bundle: bundle as unknown as BundleLike,
        publicFiles: publicFiles().map((path) => ({ path, bytes: readFileSync(join(WEB, "public", path.slice(1))) })),
        workerEntry: join(WEB, "src", "install", "sw.ts"),
      });
      (html as { source: string }).source = (html as { source: string }).source.replace(BUILD_META, `<meta name="mchezo-build" content="${version}" />`);
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
    },
  };
}

export default defineConfig({
  root: "apps/web",
  plugins: [react(), mchezoServiceWorker()],
  server: { port: 5173, proxy: { "/rooms": "http://localhost:3000", "/games": "http://localhost:3000", "/health": "http://localhost:3000" } },
  build: { outDir: "dist", emptyOutDir: true },
});
