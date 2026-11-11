/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3, §3.4): register the service worker,
 * and notice when a newer build's worker is waiting.
 *
 * - Only in a built app (not the dev server), only where the browser has
 *   service workers and a secure context. Any failure is ignored: the app
 *   works exactly as before without one.
 * - Registered once the page is idle after load, so it never competes with
 *   a screen that is starting.
 * - Never reloads anything. A waiting worker of another build sets
 *   `updateReady`; calm screens offer Reload (this tab only). There is no
 *   skipWaiting and no reload on controllerchange, so another tab mid-game is
 *   never disturbed.
 */
import { useSyncExternalStore } from "react";

/** This page's build (index.html's <meta name="mchezo-build">, filled in by the build; "dev" under the dev server). */
export function pageBuild(): string {
  try { return document.querySelector('meta[name="mchezo-build"]')?.getAttribute("content") ?? "dev"; } catch { return "dev"; }
}

let updateReady = false;
const listeners = new Set<() => void>();
function setUpdateReady(v: boolean): void {
  if (v === updateReady) return;
  updateReady = v;
  for (const l of listeners) l();
}
/** A newer build's worker is installed and waiting (a calm screen may offer Reload). */
export function useUpdateReady(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => updateReady, () => false);
}

/** Ask a worker which build it belongs to (it answers on a private channel); null if it doesn't answer. */
export function workerVersion(worker: ServiceWorker, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      const d = e.data as { type?: unknown; version?: unknown } | null;
      resolve(d && d.type === "mchezo-version" && typeof d.version === "string" ? d.version : null);
    };
    try { worker.postMessage({ type: "mchezo-version" }, [ch.port2]); } catch { clearTimeout(timer); resolve(null); }
  });
}

async function checkWaiting(reg: ServiceWorkerRegistration): Promise<void> {
  // A newer build's worker waits while this page is controlled by the old one.
  // A page loaded without any worker (a first visit) isn't controlled, so a
  // newer worker activates at once instead: then compare the active one.
  const candidate = reg.waiting ?? (navigator.serviceWorker.controller ? null : reg.active);
  if (!candidate) return;
  const v = await workerVersion(candidate);
  // Only a DIFFERENT build counts: after a reload this page is already the
  // newest build (page loads are network-first), and there is nothing to offer.
  setUpdateReady(v !== null && v !== pageBuild());
}

let started = false;
export function registerServiceWorker(): void {
  if (started) return;
  started = true;
  if (pageBuild() === "dev") return; // the dev server: no worker
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  const watched = new WeakSet<ServiceWorkerRegistration>();
  const watch = (reg: ServiceWorkerRegistration) => {
    void checkWaiting(reg);
    if (watched.has(reg)) return;
    watched.add(reg);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" || w.state === "activated") void checkWaiting(reg); });
    });
    // A phone that keeps the app open for days still hears about a new build: check when it
    // comes back into view (at most every 10 minutes) and when the network returns.
    let last = Date.now();
    const recheck = (force: boolean) => {
      if (!force && Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      reg.update().then(() => checkWaiting(reg)).catch(() => { void checkWaiting(reg); /* offline: what is already known still counts */ });
    };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recheck(false); });
    window.addEventListener("online", () => recheck(true));
  };
  const go = () => {
    // What this browser already knows needs no network: a page loaded offline still learns that a newer build is waiting.
    navigator.serviceWorker.getRegistration("/").then((reg) => { if (reg) watch(reg); }).catch(() => { /* none yet */ });
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(watch)
      .catch(() => { /* offline, private mode or blocked storage: the app works as before */ });
  };
  const idle = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(go, { timeout: 5000 }); else setTimeout(go, 2000);
  };
  if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
}

/** Tests only. */
export function _setUpdateReadyForTests(v: boolean): void { setUpdateReady(v); }
