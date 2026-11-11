/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4; spec feedback 6802191261;
 * repair R83-01): Mchezo's service worker. Bundled at build time into /sw.js
 * by apps/web/swBuild.ts, which fills in this build's version, the exact list
 * of files it emitted, and which of them to precache.
 *
 * - It answers only what swPolicy.ts allows: app page loads (network first,
 *   the canonical shell only when the network fails) and THIS build's own
 *   files. Everything else, including any file of another build, passes
 *   through untouched and is never stored. Where the browser supports static
 *   routing, API paths don't even start this worker; privacy never depends on it.
 * - Every stored response is validated (cacheable()): a direct, successful,
 *   same-origin reply of the expected type, never a redirect or sign-in page.
 * - Its version covers everything the build ships, its own code included
 *   (swBuild.ts), so a new worker never has the version of the one in charge.
 * - Who owns which cache (swLifecycle.ts): an install writes only into a
 *   candidate cache of its own and, if anything fails, deletes only that. The
 *   active worker's cache is never touched by an install. Only on activation
 *   (no page of the old generation open) are the old caches deleted and the
 *   candidate made this build's live cache.
 * - Nothing is queued or retried.
 * - A new build's worker waits: no skipWaiting(), no clients.claim().
 */
import { cacheable, liveCacheName, SHELL_PATH, swRoute } from "./swPolicy.js";
import { activateGeneration, installCandidate, matchOwn, type CacheStorageLike } from "./swLifecycle.js";

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
  registration: { installing: unknown };
  addEventListener(type: "install", cb: (e: InstallEvt) => void): void;
  addEventListener(type: "activate", cb: (e: ExtendableEvt) => void): void;
  addEventListener(type: "fetch", cb: (e: FetchEvt) => void): void;
  addEventListener(type: "message", cb: (e: MessageEvt) => void): void;
}
declare const URLPattern: (new (init: { pathname: string }) => unknown) | undefined;

const scope = self as unknown as WorkerScope;
const VERSION = __MCHEZO_VERSION__;
const LIVE = liveCacheName(VERSION);
const FILES: ReadonlySet<string> = new Set(__MCHEZO_FILES__);
const store = caches as unknown as CacheStorageLike;
const nonce = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Fetch one build file and return it only if it validates; throws otherwise (install is all-or-nothing). */
async function fetchValidated(url: string): Promise<Response> {
  // The shell page and the public files are revalidated; content-hashed /assets may come from the HTTP cache (they never change).
  const res = await fetch(new Request(url, { cache: url.startsWith("/assets/") ? "default" : "no-cache", redirect: "manual" }));
  if (!cacheable(url, res)) throw new Error(`mchezo: ${url} is not a valid file of this build (${res.status} ${res.type} ${res.headers.get("content-type") ?? ""})`);
  if (url === SHELL_PATH) {
    // The shell must be THIS build's (a deploy may land while this worker installs).
    const html = await res.clone().text();
    if (!html.includes(`name="mchezo-build" content="${VERSION}"`)) throw new Error("mchezo: the server is serving another build; not installing this one");
  }
  return res;
}

scope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      if (event.addRoutes && typeof URLPattern === "function") {
        await event.addRoutes(["/rooms/*", "/games", "/games/*", "/health", "/sw.js"].map((pathname) => ({ condition: { urlPattern: new URLPattern({ pathname }) }, source: "network" })));
      }
    } catch { /* not supported here: the fetch handler's allowlist is the boundary */ }
    // Into a candidate cache of this install's own; on any failure only that candidate is deleted (swLifecycle.ts).
    await installCandidate(store, VERSION, __MCHEZO_PRECACHE__, fetchValidated, nonce);
  })());
  // No skipWaiting(): an open page keeps the worker it started with.
});

scope.addEventListener("activate", (event) => {
  // Runs only once no page of the previous generation is open: its caches can go, and this
  // build's complete candidate becomes its live cache. Nothing that isn't ours is touched.
  // (A failed promotion leaves the candidate in place, and matchOwn() serves from it.)
  event.waitUntil(activateGeneration(store, VERSION, __MCHEZO_PRECACHE__, { installing: !!scope.registration.installing }).catch(() => undefined));
  // No clients.claim(): pages loaded without a worker stay without one until they reload.
});

scope.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown } | null;
  if (data && data.type === "mchezo-version") event.ports[0]?.postMessage({ type: "mchezo-version", version: VERSION });
});

/**
 * Keep a copy of one of this build's files, if the reply validates. Never fails the request (storage full: nothing kept).
 * Only an active worker handles fetches, so only the active worker ever writes its live cache.
 */
async function keep(pathname: string, res: Response): Promise<void> {
  if (!FILES.has(pathname) || !cacheable(pathname, res)) return;
  try { const cache = await caches.open(LIVE); await cache.put(pathname, res); } catch { /* quota or storage unavailable */ }
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
        return (await matchOwn(store, VERSION, SHELL_PATH)) ?? unreachablePage();
      }
    })());
    return;
  }
  // One of this build's files: this build's cache first, else the network (kept if it validates).
  const path = new URL(req.url).pathname;
  event.respondWith((async () => {
    const hit = await matchOwn(store, VERSION, path);
    if (hit) return hit;
    const res = await fetch(req);
    void keep(path, res.clone());
    return res;
  })());
});
