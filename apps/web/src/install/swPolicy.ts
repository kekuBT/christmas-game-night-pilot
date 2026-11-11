/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3; spec feedback 6802191261 §2): what
 * the service worker may touch. Pure, shared by the worker (src/install/sw.ts)
 * and the unit tests.
 *
 * A positive, exact-build allowlist:
 * - a page load (navigation) of an app page: network first; on failure only
 *   the canonical cached shell (`/index.html`), whatever the address and its
 *   query; the navigation itself is never stored;
 * - a GET for a file THIS build emitted (its exact path, no query): the build
 *   list comes from the build itself (JS, CSS, fonts, icons, the manifest);
 * - nothing else: every API route (present or future), every unknown path,
 *   any query-bearing file request, every non-GET request, every WebSocket and
 *   every other origin is "network": the worker neither answers nor stores it.
 * A file of another build (a newer page loaded under an older worker) is not
 * in this worker's list, so it passes straight through and never enters this
 * worker's cache.
 */
import { isClientPath } from "../../../../src/shared/clientRoutes.js";

/** Live shell caches: `mchezo-shell-<build>`, one per build, written only by that build's ACTIVE worker. */
export const SHELL_CACHE_PREFIX = "mchezo-shell-";
/** Candidate caches: `mchezo-stage-<build>-<install>`, one per install attempt, owned by that install alone (R83-01). */
export const STAGE_CACHE_PREFIX = "mchezo-stage-";
/** The canonical shell every failed page load falls back to. */
export const SHELL_PATH = "/index.html";

/** Paths that are never the worker's, whatever any list says (a second lock; the allowlist alone already excludes them). */
export const NETWORK_ONLY_PREFIXES = ["/rooms", "/games", "/health", "/sw.js"] as const;

/** The public install files at the site root (apps/web/public); the build adds them to its list. */
export const PUBLIC_FILES = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/mark.svg",
] as const;

/**
 * - network: not the worker's business; the browser fetches it as if there were no worker.
 * - page: a page load of the app: network first, the canonical cached shell only if the network fails.
 * - file: one of THIS build's files: this build's cache first, else the network (kept only if it validates).
 */
export type SwRoute = "network" | "page" | "file";

export interface SwRequest {
  method: string;
  /** The absolute URL. */
  url: string;
  /** Request.mode ("navigate" for a page load). */
  mode: string;
}

export function isNetworkOnlyPath(pathname: string): boolean {
  return NETWORK_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Is this a page of the app (Home or a client route)? */
export function isAppPage(pathname: string): boolean {
  return pathname === "/" || pathname === SHELL_PATH || isClientPath(pathname);
}

export function swRoute(req: SwRequest, origin: string, buildFiles: ReadonlySet<string>): SwRoute {
  if (req.method !== "GET") return "network";
  let u: URL;
  try { u = new URL(req.url); } catch { return "network"; }
  if (u.origin !== origin) return "network";
  if (u.protocol !== "http:" && u.protocol !== "https:") return "network";
  if (isNetworkOnlyPath(u.pathname)) return "network";
  if (req.mode === "navigate") return isAppPage(u.pathname) ? "page" : "network";
  // A build file never carries a query; one that does is not this build's file.
  if (u.search !== "") return "network";
  return buildFiles.has(u.pathname) ? "file" : "network";
}

/** The content type a build file must be served with, by its extension; null for an extension the shell never has. */
export function expectedType(pathname: string): RegExp | null {
  const ext = pathname.slice(pathname.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "html": return /^text\/html\b/i;
    case "js": case "mjs": return /^(text|application)\/javascript\b/i;
    case "css": return /^text\/css\b/i;
    case "woff2": return /^font\/woff2\b/i;
    case "woff": return /^font\/woff\b/i;
    case "png": return /^image\/png\b/i;
    case "svg": return /^image\/svg\+xml\b/i;
    case "webmanifest": return /^application\/manifest\+json\b/i;
    default: return null;
  }
}

/** The parts of a Response this check reads (so it is testable without a browser). */
export interface ResponseLike {
  ok: boolean;
  status: number;
  type: string;
  redirected: boolean;
  url?: string;
  headers: { get(name: string): string | null };
}

/**
 * May this response be stored as the build file at `pathname`? Only a direct,
 * successful, same-origin reply of the expected type that doesn't forbid
 * storing: never a redirect (a private preview's sign-in page), an opaque or
 * error reply, an HTML page standing in for a script, or a no-store reply.
 */
export function cacheable(pathname: string, res: ResponseLike): boolean {
  if (!res.ok || res.status !== 200) return false;
  if (res.type !== "basic") return false;
  if (res.redirected) return false;
  if (res.url) { try { if (new URL(res.url).pathname !== pathname) return false; } catch { return false; } }
  const cc = (res.headers.get("cache-control") ?? "").toLowerCase();
  if (/\bno-store\b|\bprivate\b/.test(cc)) return false;
  const want = expectedType(pathname);
  const type = res.headers.get("content-type") ?? "";
  return want !== null && want.test(type);
}

/** A build's live shell cache: what its active worker serves from. Only an ACTIVE worker ever writes to it. */
export function liveCacheName(version: string): string {
  return SHELL_CACHE_PREFIX + version;
}
/** The start of every candidate cache an installing worker of this build makes (one per install, never shared). */
export function stageCachePrefix(version: string): string {
  return STAGE_CACHE_PREFIX + version + "-";
}

/**
 * Is this cache one of ours from ANOTHER build, safe to delete when this
 * build's worker activates (no page of an older build is open any more)?
 * - another build's live shell cache: yes;
 * - another build's candidate cache: yes, unless a worker is installing right
 *   now (it may be that worker's candidate);
 * - this build's own caches, and anything that isn't ours: never.
 */
export function isObsoleteCache(name: string, version: string, installing: boolean): boolean {
  if (name.startsWith(SHELL_CACHE_PREFIX)) return name !== liveCacheName(version);
  if (name.startsWith(STAGE_CACHE_PREFIX)) return !installing && !name.startsWith(stageCachePrefix(version));
  return false;
}
