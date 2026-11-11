/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4): Mchezo's service worker.
 * Bundled at build time into /sw.js by the plugin in apps/web/vite.config.ts,
 * which fills in this build's version and the shell files to precache.
 *
 * - It answers only what swPolicy.ts allows (the public shell); everything
 *   else goes to the network untouched, and where the browser supports
 *   static routing, never even starts this worker.
 * - Page loads are network-first. The cached shell is used only when the
 *   network fails, so it can say honestly that the game server can't be reached.
 * - Nothing is queued or retried, and nothing but the shell is stored.
 * - A new build's worker waits: no skipWaiting(), no clients.claim(). It
 *   takes over only when no page of the old build is open, then deletes the
 *   other builds' shell caches, and nothing else.
 */
import { isObsoleteShellCache, SHELL_CACHE_PREFIX, swRoute } from "./swPolicy.js";

declare const __MCHEZO_VERSION__: string;
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
const SHELL = "/index.html";

scope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Where the browser can (Chromium's static routing), API paths go straight
    // to the network without starting this worker at all. Optional: the
    // fetch handler below leaves them alone anyway.
    try {
      if (event.addRoutes && typeof URLPattern === "function") {
        await event.addRoutes(["/rooms/*", "/games", "/games/*", "/health", "/sw.js"].map((pathname) => ({ condition: { urlPattern: new URLPattern({ pathname }) }, source: "network" })));
      }
    } catch { /* not supported here: the fetch handler is the boundary */ }
    const cache = await caches.open(CACHE);
    // The shell page must be THIS build's (a deploy may land while this
    // worker installs): otherwise refuse to install, and the next build's
    // worker will. A shell pointing at another build's files would be a
    // broken offline page.
    const page = await fetch(new Request(SHELL, { cache: "no-cache" }));
    const html = page.ok ? await page.clone().text() : "";
    if (!html.includes(`name="mchezo-build" content="${VERSION}"`)) throw new Error("mchezo: the server is serving another build; not installing this one");
    await cache.put(SHELL, page);
    // Content-hashed /assets files can come from the HTTP cache (the page
    // just loaded them; they never change), so a phone doesn't download them
    // twice. The public install files are revalidated.
    await cache.addAll(__MCHEZO_PRECACHE__.filter((u) => u !== SHELL).map((url) => new Request(url, { cache: url.startsWith("/assets/") ? "default" : "no-cache" })));
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

/** Keep a copy of a public shell response (only a complete, same-origin, successful one). */
async function keep(request: Request, response: Response): Promise<void> {
  if (!response.ok || response.type !== "basic" || response.status !== 200) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

scope.addEventListener("fetch", (event) => {
  const req = event.request;
  const route = swRoute({ method: req.method, url: req.url, mode: req.mode }, scope.location.origin);
  if (route === "network") return; // Not ours: the browser fetches it as if there were no worker.
  if (route === "page") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        // The network failed (offline, server down): the shell of this build, which says so honestly.
        const shell = await caches.match(SHELL, { cacheName: CACHE });
        return shell ?? new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Mchezo</title><body style='font-family:system-ui;background:#16111D;color:#F7F1E8;padding:24px'><h1>Can’t reach Mchezo</h1><p>Mchezo needs a connection to its game server. Check your connection, then reload.</p>", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }
  // asset or public: this build's cache first, else the network (kept if it is a public shell file).
  event.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: CACHE });
    if (hit) return hit;
    const res = await fetch(req);
    void keep(req, res.clone()).catch(() => { /* storage full or unavailable: nothing to keep */ });
    return res;
  })());
});
