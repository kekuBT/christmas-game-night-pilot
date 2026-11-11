/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4; spec feedback 6802191261):
 * Mchezo's service worker. Bundled at build time into /sw.js by the plugin
 * in apps/web/vite.config.ts, which fills in this build's version, the exact
 * list of files it emitted, and which of them to precache.
 *
 * - It answers only what swPolicy.ts allows: app page loads (network first,
 *   the canonical shell only when the network fails) and THIS build's own
 *   files. Everything else, including any file of another build, passes
 *   through untouched and is never stored. Where the browser supports static
 *   routing, API paths don't even start this worker; privacy never depends on it.
 * - Every stored response is validated (cacheable()): a direct, successful,
 *   same-origin reply of the expected type, never a redirect or sign-in page.
 * - Install is all-or-nothing: one file missing or wrong and this worker
 *   doesn't install, its half-filled cache is deleted, and the worker already
 *   in charge (if any) carries on with its own cache.
 * - Nothing is queued or retried.
 * - A new build's worker waits: no skipWaiting(), no clients.claim(). It takes
 *   over only when no page of the old build is open, then deletes the other
 *   builds' shell caches, and nothing else.
 */
import { cacheable, isObsoleteShellCache, SHELL_CACHE_PREFIX, SHELL_PATH, swRoute } from "./swPolicy.js";

declare const __MCHEZO_VERSION__: string;
declare const __MCHEZO_FILES__: string[];
declare const __MCHEZO_PRECACHE__: string[];

/* Just the worker APIs this file uses (the web app's tsconfig has the DOM library, not WebWorker). */
interface ExtendableEvt extends Event { waitUntil(p: Promise<unknown>): void }
interface InstallEvt extends ExtendableEvt { addRoutes?: (rules: unknown[]) => Promise<void> }
interface FetchEvt extends ExtendableEvt { request: Request; respondWith(r: Response | Promise<Response>): void }
interface MessageEvt extends ExtendableEvt { data: unknown; ports: readonly MessagePort[] }
interface WorkerScope {
  location: Location;
  addEventListener(type: "install", cb: (e: InstallEvt) => void): void;
  addEventListener(type: "activate", cb: (e: ExtendableEvt) => void): void;
  addEventListener(type: "fetch", cb: (e: FetchEvt) => void): void;
  addEventListener(type: "message", cb: (e: MessageEvt) => void): void;
}
declare const URLPattern: (new (init: { pathname: string }) => unknown) | undefined;

const scope = self as unknown as WorkerScope;
const VERSION = __MCHEZO_VERSION__;
const CACHE = SHELL_CACHE_PREFIX + VERSION;
const FILES: ReadonlySet<string> = new Set(__MCHEZO_FILES__);

/** Fetch one build file and keep it only if it validates; throws otherwise (install is all-or-nothing). */
async function precacheOne(cache: Cache, url: string): Promise<void> {
  // The shell page and the public files are revalidated; content-hashed /assets may come from the HTTP cache (they never change).
  const res = await fetch(new Request(url, { cache: url.startsWith("/assets/") ? "default" : "no-cache", redirect: "manual" }));
  if (!cacheable(url, res)) throw new Error(`mchezo: ${url} is not a valid file of this build (${res.status} ${res.type} ${res.headers.get("content-type") ?? ""})`);
  if (url === SHELL_PATH) {
    // The shell must be THIS build's (a deploy may land while this worker installs).
    const html = await res.clone().text();
    if (!html.includes(`name="mchezo-build" content="${VERSION}"`)) throw new Error("mchezo: the server is serving another build; not installing this one");
  }
  await cache.put(url, res);
}

scope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      if (event.addRoutes && typeof URLPattern === "function") {
        await event.addRoutes(["/rooms/*", "/games", "/games/*", "/health", "/sw.js"].map((pathname) => ({ condition: { urlPattern: new URLPattern({ pathname }) }, source: "network" })));
      }
    } catch { /* not supported here: the fetch handler's allowlist is the boundary */ }
    try {
      const cache = await caches.open(CACHE);
      for (const url of __MCHEZO_PRECACHE__) await precacheOne(cache, url);
    } catch (e) {
      // Partial or failed (a missing file, a sign-in page, storage full): leave nothing half-made behind.
      await caches.delete(CACHE).catch(() => false);
      throw e;
    }
  })());
  // No skipWaiting(): an open page keeps the worker it started with.
});

scope.addEventListener("activate", (event) => {
  // Runs only once no page of the previous build is open: their shell caches can go. Only ours, nothing else.
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => isObsoleteShellCache(n, CACHE)).map((n) => caches.delete(n)))));
  // No clients.claim(): pages loaded without a worker stay without one until they reload.
});

scope.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown } | null;
  if (data && data.type === "mchezo-version") event.ports[0]?.postMessage({ type: "mchezo-version", version: VERSION });
});

/** Keep a copy of one of this build's files, if the reply validates. Never fails the request (storage full: nothing kept). */
async function keep(pathname: string, res: Response): Promise<void> {
  if (!FILES.has(pathname) || !cacheable(pathname, res)) return;
  try { const cache = await caches.open(CACHE); await cache.put(pathname, res); } catch { /* quota or storage unavailable */ }
}

/** The page shown when the network fails and even the shell can't be read: says so, plainly. */
function unreachablePage(): Response {
  return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Mchezo</title><body style='font-family:system-ui;background:#16111D;color:#F7F1E8;padding:24px'><h1>Can’t reach Mchezo</h1><p>Mchezo needs a connection to its game server. Check your connection, then reload.</p>", { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

scope.addEventListener("fetch", (event) => {
  const req = event.request;
  const route = swRoute({ method: req.method, url: req.url, mode: req.mode }, scope.location.origin, FILES);
  if (route === "network") return; // Not ours: the browser fetches it as if there were no worker.
  if (route === "page") {
    event.respondWith((async () => {
      try {
        // The real address (query included) goes to the network; nothing about it is stored.
        return await fetch(req);
      } catch {
        // The network failed (offline, server down): the canonical shell of this build, which says so honestly.
        return (await caches.match(SHELL_PATH, { cacheName: CACHE })) ?? unreachablePage();
      }
    })());
    return;
  }
  // One of this build's files: this build's cache first, else the network (kept if it validates).
  const path = new URL(req.url).pathname;
  event.respondWith((async () => {
    const hit = await caches.match(path, { cacheName: CACHE });
    if (hit) return hit;
    const res = await fetch(req);
    void keep(path, res.clone());
    return res;
  })());
});
