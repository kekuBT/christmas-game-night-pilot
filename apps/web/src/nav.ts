/**
 * Stage 2 navigation: real URLs over pushState/popstate (no router library).
 * The route model is pure (ui/mchezo/lib/routes.ts). This hook only keeps the
 * address bar and the rendered screen in step, so browser Back, in-app Back
 * and iOS swipe-back behave the same way. It never touches seats, sessions,
 * projections or sockets.
 *
 * Each history entry we write carries { mz, sheet, depth }. `depth` counts the
 * entries this tab pushed on top of the first one, so in-app Back can step
 * back when there is somewhere of ours to go back to, and otherwise replaces
 * the entry with a sensible screen (never leaving the app by accident).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseRoute, routeUrl, type Route, type Sheet } from "./ui/mchezo/lib/routes.js";

interface Entry { mz: true; sheet: boolean; depth: number }
const read = () => parseRoute(location.pathname, location.search);
const entry = (): Entry | null => {
  const s = history.state as Partial<Entry> | null;
  return s && s.mz === true && typeof s.depth === "number" ? (s as Entry) : null;
};

/** Stamp the first entry (or a reloaded one) so in-app Back knows where it is. */
export function stampEntry(): void {
  const here = entry();
  // A reloaded page with a sheet open was not pushed by this page load's
  // sheet opener; keep its depth, but treat the sheet as not pushed unless
  // there is an entry of ours under it.
  history.replaceState({ mz: true, sheet: !!here?.sheet && (here?.depth ?? 0) > 0, depth: here?.depth ?? 0 } satisfies Entry, "", location.pathname + location.search);
}

/**
 * Stage 4 (S3-NAV-02): a room screen with nothing of ours beneath it (the
 * room was opened from a fresh /join?code= page, a QR code, or a reload of
 * the first entry) gets Home beneath it, once. Back from the room then lands
 * on this app's Home, which offers Rejoin, instead of whatever unrelated page
 * came before (the audit landed on the Library mid-game). Nothing about the
 * seat, the game or its clock changes; Forward or Rejoin returns to the room.
 * Not a Back trap: one ordinary entry, and Back from Home leaves as usual.
 */
export function anchorHomeBelow(): void {
  const here = entry();
  if (!here || here.depth > 0 || here.sheet) return;
  const url = location.pathname + location.search;
  if (url === "/") return;
  history.replaceState({ mz: true, sheet: false, depth: 0 } satisfies Entry, "", "/");
  history.pushState({ mz: true, sheet: false, depth: 1 } satisfies Entry, "", url);
}

export function useRoute() {
  const [state, setState] = useState(read);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onPop = () => setState(read());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  /**
   * Go to a screen. `replace` swaps the current entry (redirects, fixes).
   * Leaving an open sheet for another screen replaces the sheet's entry, so
   * Back from that screen returns to the screen under the sheet.
   */
  const navigate = useCallback((route: Route, opts: { replace?: boolean; sheet?: Sheet | null; game?: string | null } = {}) => {
    const url = routeUrl(route, opts.sheet ?? null, opts.game ?? null);
    if (url === location.pathname + location.search) return;
    const here = entry();
    const depth = here?.depth ?? 0;
    // Stage 4: swapping one screen for another (opts.replace) from a sheet we
    // pushed (the room menu on the Cup, say) must swap the screen *under* the
    // sheet, so history stays "lobby → this screen". Step back over the sheet,
    // then replace what is there.
    if (opts.replace && here?.sheet && here.depth > 0 && !opts.sheet) {
      const onPop = () => {
        removeEventListener("popstate", onPop);
        history.replaceState({ mz: true, sheet: false, depth: entry()?.depth ?? depth - 1 } satisfies Entry, "", url);
        setState(read());
      };
      addEventListener("popstate", onPop);
      history.back();
      return;
    }
    const replace = opts.replace || (!!here?.sheet && !opts.sheet);
    if (replace) history.replaceState({ mz: true, sheet: !!opts.sheet && !!here?.sheet, depth } satisfies Entry, "", url);
    else history.pushState({ mz: true, sheet: !!opts.sheet, depth: depth + 1 } satisfies Entry, "", url);
    setState(read());
  }, []);

  /** Open a sheet over the current screen as its own history entry, so Back closes it. */
  const openSheet = useCallback((sheet: Sheet, game?: string) => {
    const here = entry();
    const url = routeUrl(stateRef.current.route, sheet, game ?? null);
    if (url === location.pathname + location.search) return;
    // A sheet opened from another sheet replaces it (one sheet at a time, one Back to close).
    if (here?.sheet) history.replaceState({ mz: true, sheet: true, depth: here.depth } satisfies Entry, "", url);
    else history.pushState({ mz: true, sheet: true, depth: (here?.depth ?? 0) + 1 } satisfies Entry, "", url);
    setState(read());
  }, []);

  /** Close the sheet: step back if we pushed it, otherwise drop it from the address. */
  const closeSheet = useCallback(() => {
    if (!stateRef.current.sheet) return;
    if (entry()?.sheet) history.back();
    else navigate(stateRef.current.route, { replace: true, sheet: null });
  }, [navigate]);

  /**
   * In-app Back: step back through our own entries (closing an open sheet
   * first counts as one step), else replace with `fallback`.
   */
  const back = useCallback((fallback: Route) => {
    const here = entry();
    const steps = here?.sheet ? 2 : 1;
    if ((here?.depth ?? 0) >= steps) history.go(-steps);
    else navigate(fallback, { replace: true });
  }, [navigate]);

  return { route: state.route, sheet: state.sheet, game: state.game, navigate, openSheet, closeSheet, back };
}
