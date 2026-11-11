/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3): can this device reach the game
 * server? Asked by the calm screens (Home, the solo shelf, the library), so
 * an installed app opened offline says honestly what is wrong instead of
 * letting a press fail. Rooms have their own connection banner.
 *
 * GET /health carries no data and is never cached (by the server or the
 * service worker). The browser's `offline` event says "unreachable" at once;
 * `online`, a return to the page or Try again asks again.
 */
import { useCallback, useEffect, useState } from "react";

export type Reach = "checking" | "ok" | "unreachable";

export async function probeServer(timeoutMs = 6000, fetcher: typeof fetch = fetch): Promise<Exclude<Reach, "checking">> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetcher("/health", { cache: "no-store", signal: ctl.signal });
    // Any answer from the server itself counts; a gateway page while it is down doesn't.
    return r.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

export function useServerReach(): { reach: Reach; retry: () => void } {
  const [reach, setReach] = useState<Reach>(() => (typeof navigator !== "undefined" && navigator.onLine === false ? "unreachable" : "checking"));
  const check = useCallback(() => {
    setReach((r) => (r === "ok" ? r : "checking"));
    void probeServer().then(setReach);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = () => { void probeServer().then((r) => { if (alive) setReach(r); }); };
    run();
    const offline = () => setReach("unreachable");
    const visible = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("offline", offline);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("offline", offline); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return { reach, retry: check };
}
