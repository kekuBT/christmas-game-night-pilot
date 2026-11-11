/**
 * Stage 8.2 (docs/stage8/stage82.md §3.1, §3.6): this device's look.
 *
 * The look is colours and decoration only, and belongs to this device: it is
 * kept in localStorage (`mz_look`) and never sent to the server, so a guest
 * changing their phone's look never changes what anyone is dealt. What a
 * session deals is the room's content (`contentSeason`), set by the solo
 * player or a casual room's host; "Match the game" shows that content's look.
 *
 * Pure parts (resolveLook, lookTheme) are unit-tested; the rest touches the
 * document and storage, each access guarded (private mode, blocked storage).
 */
import { useEffect, useState } from 'react';
import type { SessionSeason } from '../../../../../src/shared/season.js';
import { themes, themeToCssVars, type MchezoTheme } from './tokens/tokens.js';

export type LookPref = 'auto' | 'everyday' | 'christmas';
export type LookId = 'everyday' | 'christmas';
export const LOOK_PREFS: readonly LookPref[] = ['auto', 'everyday', 'christmas'];
export const LOOK_KEY = 'mz_look';

/** What this screen is showing: a solo or casual session (with its content), a Cup room, or neither. */
export interface LookContext { kind: 'solo' | 'casual' | 'cup' | 'none'; season?: SessionSeason }

/**
 * The look to show. A pinned look always wins. "Match the game" shows the
 * Christmas look only for a solo or casual session whose content is
 * Christmas; Cup rooms (L35, A10), home and the library show Everyday.
 */
export function resolveLook(pref: LookPref, ctx: LookContext): LookId {
  if (pref !== 'auto') return pref;
  return (ctx.kind === 'solo' || ctx.kind === 'casual') && ctx.season === 'christmas' ? 'christmas' : 'everyday';
}

export function lookTheme(id: LookId): MchezoTheme {
  return id === 'christmas' ? themes.christmas : themes.everyday;
}

export function isLookPref(v: unknown): v is LookPref {
  return v === 'auto' || v === 'everyday' || v === 'christmas';
}

export function readLookPref(): LookPref {
  try {
    const v = localStorage.getItem(LOOK_KEY);
    return isLookPref(v) ? v : 'auto';
  } catch { return 'auto'; }
}

const LOOK_EVENT = 'mz-look-change';

/** This device's look preference, kept in step across this tab's screens and other tabs. */
export function useLookPref(): [LookPref, (p: LookPref) => void] {
  const [pref, setPref] = useState<LookPref>(readLookPref);
  useEffect(() => {
    const sync = () => setPref(readLookPref());
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === LOOK_KEY) sync(); };
    window.addEventListener(LOOK_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(LOOK_EVENT, sync); window.removeEventListener('storage', onStorage); };
  }, []);
  const set = (p: LookPref) => {
    setPref(p);
    try { localStorage.setItem(LOOK_KEY, p); } catch { /* storage unavailable: this screen still changes */ }
    try { window.dispatchEvent(new Event(LOOK_EVENT)); } catch { /* no window */ }
  };
  return [pref, set];
}

/**
 * Legacy variables (index.css, D-UX-04) and the tokens they follow, so the
 * older screens, the page behind every screen and the overscroll area take
 * the same look as the Mchezo screens.
 */
const LEGACY_VARS: Record<string, keyof MchezoTheme['color']> = {
  '--bg': 'ground', '--panel': 'surface1', '--panel2': 'surface2', '--gold': 'highlight', '--cream': 'text',
  '--accent': 'brand', '--muted': 'textMuted', '--green': 'success', '--line': 'line', '--on-accent': 'onAccent',
};

/** Paint the document with a look: its variables on <html>, the browser toolbar colour (theme-color). */
export function applyDocumentLook(theme: MchezoTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeToCssVars(theme))) root.style.setProperty(k, v);
  for (const [k, token] of Object.entries(LEGACY_VARS)) root.style.setProperty(k, String(theme.color[token]));
  root.dataset['mzTheme'] = theme.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.color.ground);
}

/** Keep the document painted with `theme` while this component shows it. */
export function useDocumentLook(theme: MchezoTheme): void {
  useEffect(() => { applyDocumentLook(theme); }, [theme]);
}
