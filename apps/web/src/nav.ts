/**
 * Stage 2 navigation: real URLs over pushState/popstate (no router library).
 * The route model is pure (ui/mchezo/lib/routes.ts). This hook only keeps the
 * address bar and the rendered screen in step, so browser Back, in-app Back
 * and iOS swipe-back behave the same way. It never touches seats, sessions,
 * projections or sockets.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseRoute, routeUrl, type Route, type Sheet } from "./ui/mchezo/lib/routes.js";

const read = () => parseRoute(location.pathname, location.search);

export function useRoute() {
  const [state, setState] = useState(read);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onPop = () => setState(read());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  /** Go to a screen. `replace` swaps the current entry (redirects, fixes). */
  const navigate = useCallback((route: Route, opts: { replace?: boolean; sheet?: Sheet | null } = {}) => {
    const url = routeUrl(route, opts.sheet ?? null);
    if (url === location.pathname + location.search) return;
    const entry = { mz: true, sheet: !!opts.sheet };
    if (opts.replace) history.replaceState(entry, "", url);
    else history.pushState(entry, "", url);
    setState(read());
  }, []);

  /** Open a sheet over the current screen as its own history entry, so Back closes it. */
  const openSheet = useCallback((sheet: Sheet) => {
    navigate(stateRef.current.route, { sheet });
  }, [navigate]);

  /** Close the sheet: step back if we pushed it, otherwise drop it from the address. */
  const closeSheet = useCallback(() => {
    if (!stateRef.current.sheet) return;
    if ((history.state as { sheet?: boolean } | null)?.sheet) history.back();
    else navigate(stateRef.current.route, { replace: true, sheet: null });
  }, [navigate]);

  return { route: state.route, sheet: state.sheet, navigate, openSheet, closeSheet };
}
