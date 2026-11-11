/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4): build /sw.js for one build of
 * the web app, and the version that names it. Used by the plugin in
 * vite.config.ts; kept apart so tests can run it on a bundle of their own.
 *
 * The version is a hash of EVERYTHING the build ships: the bundle's files and
 * contents, the public files, and the worker's own code. A change to any of
 * them (a worker-only change included) is a new version, so a new worker never
 * shares the cache of the worker in charge. The same inputs give the same
 * version, so an unchanged build is no update at all.
 */
import { createHash } from "node:crypto";
import { build as esbuild } from "esbuild";

/** The bundle as Vite hands it to generateBundle: chunks have code, assets have a source. */
export type BundleLike = Record<string, { type: "chunk"; code: string } | { type: "asset"; source: string | Uint8Array }>;

export interface SwBuildInput {
  bundle: BundleLike;
  /** apps/web/public's files, as site paths ("/icons/icon-192.png") with their bytes. */
  publicFiles: { path: string; bytes: Uint8Array }[];
  /** The worker's entry (apps/web/src/install/sw.ts). */
  workerEntry: string;
}

export interface SwBuildOutput {
  version: string;
  /** /sw.js, with this build's version, file list and precache list built in. */
  sw: string;
  /** Every file of this build the worker may answer and keep. */
  files: string[];
  /** What it fetches and validates before it installs. */
  precache: string[];
}

/** Stands in for the version while the worker is built, so its code can be part of the version. */
const VERSION_SLOT = "__mchezo_build_version_slot__";

export async function buildServiceWorker({ bundle, publicFiles, workerEntry }: SwBuildInput): Promise<SwBuildOutput> {
  const pub = publicFiles.map((f) => f.path).sort();
  // The exact allowlist (feedback 6802191261 §2): every file this build emitted under /assets
  // (scripts, styles, fonts), the public install files and the shell page. Nothing else is ever the worker's.
  const assets = Object.keys(bundle).filter((n) => /^assets\/[^/]+$/.test(n)).map((n) => "/" + n).sort();
  const files = ["/index.html", ...assets, ...pub];
  // Precached: what a page of this build needs to start (the shell, its scripts and styles, the install files).
  // Fonts are kept when first used (still only from this list).
  const precache = ["/index.html", ...assets.filter((a) => /\.(js|css)$/.test(a)), ...pub];

  // The worker first, with a stand-in version: its own code is part of what this build ships.
  const out = await esbuild({
    entryPoints: [workerEntry],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
    minify: true,
    legalComments: "none",
    define: { __MCHEZO_VERSION__: JSON.stringify(VERSION_SLOT), __MCHEZO_FILES__: JSON.stringify(files), __MCHEZO_PRECACHE__: JSON.stringify(precache) },
  });
  const code = out.outputFiles[0]?.text ?? "";
  if (!code.includes(VERSION_SLOT)) throw new Error("mchezo-service-worker: the worker doesn't use its build version");

  const hash = createHash("sha256");
  for (const name of Object.keys(bundle).sort()) {
    const item = bundle[name]!;
    hash.update(name).update("\0").update(item.type === "chunk" ? item.code : item.source).update("\0");
  }
  const byPath = new Map(publicFiles.map((f) => [f.path, f.bytes]));
  for (const p of pub) hash.update(p).update("\0").update(byPath.get(p)!).update("\0");
  hash.update("/sw.js").update("\0").update(code).update("\0");
  const version = hash.digest("hex").slice(0, 16);

  const sw = `/* Mchezo service worker, build ${version} */\n${code.split(VERSION_SLOT).join(version)}`;
  return { version, sw, files, precache };
}
