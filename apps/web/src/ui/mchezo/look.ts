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
import { useEffect, useSyncExternalStore } from 'react';
import { createDeviceChoice } from './deviceChoice.js';
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

/**
 * This device's look preference (repair R82-01): the choice made on this page
 * is authoritative for the page even when it can't be saved; other tabs'
 * saved choices still arrive (deviceChoice.ts).
 */
export const lookChoice = createDeviceChoice<LookPref>(LOOK_KEY, isLookPref, 'auto');
export const readLookPref = (): LookPref => lookChoice.get();
export const writeLookPref = (p: LookPref): boolean => lookChoice.set(p);

/** This device's look preference, the same on every screen of this page and kept in step with other tabs. */
export function useLookPref(): [LookPref, (p: LookPref) => void] {
  return [lookChoice.use(), (p) => { lookChoice.set(p); }];
}
/** Whether this device's last look choice could be saved (false: it lasts until this page is reloaded). */
export const useLookSaved = (): boolean => lookChoice.useSaved();

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
  // Stage 11.1 (D-S111-01): the look's tone scopes the light-ground rules, and form controls and scrollbars follow it.
  root.dataset['mzTone'] = theme.tone;
  root.style.colorScheme = theme.tone;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.color.ground);
}

/**
 * Feedback 6795825877 (3): the content of the game a screen is SHOWING (a solo
 * round in play or its results), which Match the game follows, rather than
 * the remembered choice for the next start. Set by the screen showing it and
 * cleared when it stops; null when no game is shown.
 */
let shownSeason: SessionSeason | null = null;
const shownListeners = new Set<() => void>();
export function setShownSeason(season: SessionSeason | null): void {
  if (shownSeason === season) return;
  shownSeason = season;
  for (const l of shownListeners) l();
}
export function useShownSeason(): SessionSeason | null {
  return useSyncExternalStore((cb) => { shownListeners.add(cb); return () => { shownListeners.delete(cb); }; }, () => shownSeason, () => null);
}

/** Keep the document painted with `theme` while this component shows it. */
export function useDocumentLook(theme: MchezoTheme): void {
  useEffect(() => { applyDocumentLook(theme); }, [theme]);
}
