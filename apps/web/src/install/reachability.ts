/**
 * Stage 8.3 (docs/stage8/stage83.md §3.3; spec feedback 6802191261 §3): can
 * this device reach the game server? Asked by the calm screens (Home, Join,
 * Host, the solo shelf, the library) so an installed app opened offline says
 * honestly what is wrong. Rooms have their own connection banner.
 *
 * - Evidence, not a guess: only the server's own answer to GET /health
 *   (JSON `{"ok":true}`, within a short time limit) counts as reachable. A
 *   sign-in page, a gateway error or a stand-in page doesn't, and neither does
 *   navigator.onLine: the browser's "offline"/"online" events only start a
 *   check, they never decide it.
 * - It never gates play: the notice is information; every button still works.
 * - No polling: a check runs when the screen opens, when the browser says the
 *   network changed, when the page comes back into view (at most every 30 s),
 *   and when the person presses Try again.
 */
import { useCallback, useEffect, useState } from "react";

export type Reach = "checking" | "ok" | "unreachable";
export const PROBE_TIMEOUT_MS = 4000;
const VISIBLE_RECHECK_MS = 30_000;

export async function probeServer(timeoutMs = PROBE_TIMEOUT_MS, fetcher: typeof fetch = fetch): Promise<Exclude<Reach, "checking">> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetcher("/health", { cache: "no-store", signal: ctl.signal, redirect: "error" });
    if (!r.ok || !/^application\/json\b/i.test(r.headers.get("content-type") ?? "")) return "unreachable";
    const body = (await r.json()) as { ok?: unknown } | null;
    return body !== null && typeof body === "object" && body.ok === true ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

export function useServerReach(): { reach: Reach; retry: () => void } {
  const [reach, setReach] = useState<Reach>("checking");
  const check = useCallback(() => {
    setReach((r) => (r === "ok" ? r : "checking"));
    void probeServer().then(setReach);
  }, []);
  useEffect(() => {
    let alive = true;
    let last = 0;
    const run = () => { last = Date.now(); void probeServer().then((r) => { if (alive) setReach(r); }); };
    run();
    const visible = () => { if (document.visibilityState === "visible" && Date.now() - last >= VISIBLE_RECHECK_MS) run(); };
    window.addEventListener("offline", run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("offline", run); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return { reach, retry: check };
}
