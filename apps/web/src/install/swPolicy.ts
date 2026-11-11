/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3): what the service worker may touch.
 * Pure, shared by the worker (src/install/sw.ts) and the unit tests.
 *
 * The rule is an allowlist: the worker answers only same-origin GETs for the
 * public app shell (a page load of a client route, this build's /assets/*
 * files, and the public install files). Everything else is "network": the
 * worker doesn't answer it, cache it or even look at its body. That covers
 * every API path (/rooms/**, /games/**, /health), every non-GET request,
 * every WebSocket, every other origin, and any shell path that carries a
 * query (nothing in the shell uses one), so projections, sessions, tokens,
 * answers, Memory Book entries and exports can never be stored.
 */
import { isClientPath } from "../../../../src/shared/clientRoutes.js";

export const SHELL_CACHE_PREFIX = "mchezo-shell-";

/** The public install files at the site root (apps/web/public), the same for everyone. */
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

/** Path prefixes that always go to the network (and, where the browser can, skip the worker entirely). */
export const NETWORK_ONLY_PREFIXES = ["/rooms", "/games", "/health", "/sw.js"] as const;

/**
 * - network: not the worker's business; the browser fetches it as if there were no worker.
 * - page: a page load of the app (a client route): network first, the cached shell only if the network fails.
 * - asset: one of this build's content-hashed files under /assets/: the cache first, else the network.
 * - public: a public install file (manifest, icons): the cache first, else the network.
 */
export type SwRoute = "network" | "page" | "asset" | "public";

export interface SwRequest {
  method: string;
  /** The absolute URL. */
  url: string;
  /** Request.mode ("navigate" for a page load). */
  mode: string;
}

export function isNetworkOnlyPath(pathname: string): boolean {
  return NETWORK_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

/** Is this a page of the app (Home or a client route)? */
export function isAppPage(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html" || isClientPath(pathname);
}

export function swRoute(req: SwRequest, origin: string): SwRoute {
  if (req.method !== "GET") return "network";
  let u: URL;
  try { u = new URL(req.url); } catch { return "network"; }
  if (u.origin !== origin) return "network";
  if (u.protocol !== "http:" && u.protocol !== "https:") return "network";
  if (isNetworkOnlyPath(u.pathname)) return "network";
  if (req.mode === "navigate") return isAppPage(u.pathname) ? "page" : "network";
  // Shell files never carry a query; one that does is not ours to keep.
  if (u.search !== "") return "network";
  if (/^\/assets\/[A-Za-z0-9._-]+$/.test(u.pathname)) return "asset";
  if ((PUBLIC_FILES as readonly string[]).includes(u.pathname)) return "public";
  return "network";
}

/** Is this cache one of ours, from another build (safe to delete once no page of that build is open)? */
export function isObsoleteShellCache(name: string, current: string): boolean {
  return name.startsWith(SHELL_CACHE_PREFIX) && name !== current;
}
